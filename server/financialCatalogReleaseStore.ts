import { createHash, randomUUID } from 'node:crypto'
import type { ExternalRoleCatalogRoleV1, ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'
import { validateFinancialExternalRoleCatalog } from '../src/governance/financialCatalog'
import { appendGovernanceAudit, commitGovernanceMutation, getGovernancePaths, readGovernanceStore } from './orgmasterGovernanceStore'
import { readActiveAiPdmRoleCatalog } from './applicationRoleCatalogRegistry'
import { assertFinancialAuthority, commandRequestHash, FINANCIAL_APPLICATION_ID, FINANCIAL_PROTECTED_OPERATIONS, publishFinancialPolicy, type FinancialManagementCapability } from './applicationEntitlementCommon'
import { readPersistenceArtifact } from './orgmasterPersistenceRepository'

type FmsCatalogRole = {
  stableRoleId: string
  code: string
  displayName: string
  builtIn: boolean
  capabilityIds: string[]
  allowedScopeKinds: string[]
  assignmentPolicy: 'open' | 'existing_only'
  roleDefinitionHash: string
}

export type FmsCatalogReleaseInput = {
  applicationId: string
  version: string
  contentSha256: string
  artifactSha256: string
  artifactUtf8: string
  sourceDraftId: string
  sourceDraftRevision: number
  createdBy: { principalId: string; employeeId: string }
  createdAt: string
}

export class FinancialCatalogReleaseError extends Error {
  constructor(readonly code: 'FINANCIAL_CATALOG_RELEASE_INVALID' | 'FINANCIAL_CATALOG_RELEASE_UNAVAILABLE' | 'FINANCIAL_CATALOG_RELEASE_CONFLICT') {
    super(code)
    this.name = 'FinancialCatalogReleaseError'
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
}

function sha256(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex') }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return value as Record<string, unknown>
}

function exact(value: unknown, keys: readonly string[]) {
  const candidate = record(value)
  const actual = Object.keys(candidate).sort()
  if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return candidate
}

function text(value: unknown, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return value
}

function hash(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return value
}

function instant(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return value
}

function roleHash(role: FmsCatalogRole) {
  const { roleDefinitionHash: _ignored, ...raw } = role
  return sha256(canonicalJson({ ...raw, capabilityIds: [...raw.capabilityIds].sort(), allowedScopeKinds: [...raw.allowedScopeKinds].sort() }))
}

function parseRole(value: unknown): FmsCatalogRole {
  const role = exact(value, ['stableRoleId', 'code', 'displayName', 'builtIn', 'capabilityIds', 'allowedScopeKinds', 'assignmentPolicy', 'roleDefinitionHash'])
  const result: FmsCatalogRole = {
    stableRoleId: text(role.stableRoleId), code: text(role.code), displayName: text(role.displayName), builtIn: role.builtIn === true,
    capabilityIds: Array.isArray(role.capabilityIds) ? role.capabilityIds.map((id) => text(id, 256)) : [],
    allowedScopeKinds: Array.isArray(role.allowedScopeKinds) ? role.allowedScopeKinds.map((kind) => text(kind, 64)) : [],
    assignmentPolicy: role.assignmentPolicy === 'existing_only' ? 'existing_only' : role.assignmentPolicy === 'open' ? 'open' : (() => { throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID') })(),
    roleDefinitionHash: hash(role.roleDefinitionHash),
  }
  if (typeof role.builtIn !== 'boolean' || !Array.isArray(role.capabilityIds) || new Set(result.capabilityIds).size !== result.capabilityIds.length || result.capabilityIds.some((id, index) => index > 0 && result.capabilityIds[index - 1] > id) || result.allowedScopeKinds.length !== 1 || result.allowedScopeKinds[0] !== 'workspace' || roleHash(result) !== result.roleDefinitionHash) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return result
}

function parseRelease(value: unknown): { release: FmsCatalogReleaseInput; catalog: Record<string, unknown>; roles: FmsCatalogRole[] } {
  const release = exact(value, ['applicationId', 'version', 'contentSha256', 'artifactSha256', 'artifactUtf8', 'sourceDraftId', 'sourceDraftRevision', 'createdBy', 'createdAt'])
  const createdBy = exact(release.createdBy, ['principalId', 'employeeId'])
  const input: FmsCatalogReleaseInput = {
    applicationId: text(release.applicationId), version: text(release.version), contentSha256: hash(release.contentSha256), artifactSha256: hash(release.artifactSha256),
    artifactUtf8: text(release.artifactUtf8, 1024 * 1024), sourceDraftId: text(release.sourceDraftId), sourceDraftRevision: release.sourceDraftRevision as number, createdBy: { principalId: text(createdBy.principalId), employeeId: text(createdBy.employeeId) }, createdAt: instant(release.createdAt),
  }
  if (input.applicationId !== FINANCIAL_APPLICATION_ID || !Number.isSafeInteger(input.sourceDraftRevision) || input.sourceDraftRevision < 0 || !input.artifactUtf8.endsWith('\n') || sha256(input.artifactUtf8) !== input.artifactSha256) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  let catalog: Record<string, unknown>
  try { catalog = record(JSON.parse(input.artifactUtf8)) } catch { throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID') }
  exact(catalog, ['formatVersion', 'applicationId', 'catalogVersion', 'registryVersion', 'roles', 'publishedAt', 'publishedBy'])
  if (canonicalJson(catalog) + '\n' !== input.artifactUtf8 || sha256(canonicalJson(catalog)) !== input.contentSha256 || catalog.formatVersion !== 'jf.configuration-catalog.v1' || catalog.applicationId !== input.applicationId || catalog.catalogVersion !== input.version) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  const roles = Array.isArray(catalog.roles) ? catalog.roles.map(parseRole) : []
  const publishedBy = exact(catalog.publishedBy, ['principalId', 'employeeId'])
  if (!roles.length || new Set(roles.map((role) => role.stableRoleId)).size !== roles.length || roles.some((role, index) => index > 0 && roles[index - 1].stableRoleId > role.stableRoleId) || typeof catalog.registryVersion !== 'string' || !catalog.registryVersion.trim() || typeof catalog.publishedAt !== 'string') throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  instant(catalog.publishedAt); text(publishedBy.principalId); text(publishedBy.employeeId)
  if (publishedBy.principalId !== createdBy.principalId || publishedBy.employeeId !== createdBy.employeeId || catalog.publishedAt !== input.createdAt) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return { release: input, catalog, roles }
}

function snapshotFromRelease(value: unknown, publisher: GovernanceActorContext): ExternalRoleCatalogSnapshotV1 {
  const { release, catalog, roles } = parseRelease(value)
  if (!publisher.employeeId || release.createdBy.principalId !== publisher.principalId || release.createdBy.employeeId !== publisher.employeeId) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  const snapshot: ExternalRoleCatalogSnapshotV1 = {
    applicationId: FINANCIAL_APPLICATION_ID,
    catalogVersion: release.version,
    sourceKind: 'application-contract',
    sourceRefs: [{ path: `fms://catalog/${release.version}`, range: `${release.sourceDraftId}@${release.sourceDraftRevision}`, sha256: release.artifactSha256 }],
    capturedAt: release.createdAt,
    payloadHash: release.contentSha256,
    catalogSha256: release.contentSha256,
    contentSha256: release.contentSha256,
    artifactSha256: release.artifactSha256,
    registryVersion: String(catalog.registryVersion),
    formatVersion: String(catalog.formatVersion),
    publishedByPrincipalId: release.createdBy.principalId,
    publishedByEmployeeId: release.createdBy.employeeId,
    sourceDraftId: release.sourceDraftId,
    sourceDraftRevision: release.sourceDraftRevision,
    validationState: 'valid',
    effectState: 'not-synchronized',
    roles: roles.map((role): ExternalRoleCatalogRoleV1 => ({
      stableRoleId: role.stableRoleId, code: role.code, displayName: role.displayName, status: 'active', assignable: true,
      riskLevel: 'normal', allowedScopeKinds: ['workspace'], subjectKind: 'employee', recommendationAllowed: false, delegationAllowed: false,
      assignmentTier: 'app_admin', assignmentDisposition: role.assignmentPolicy === 'existing_only' ? 'legacy-only' : 'selectable',
      builtIn: role.builtIn, capabilityIds: role.capabilityIds, assignmentPolicy: role.assignmentPolicy, roleDefinitionHash: role.roleDefinitionHash,
    })),
  }
  const issues = validateFinancialExternalRoleCatalog(snapshot)
  if (issues.length) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  return snapshot
}

export function validateAndNormalizeFinancialCatalogRelease(value: unknown, publisher: GovernanceActorContext) {
  return snapshotFromRelease(value, publisher)
}

async function readPublishedFinancialCatalog(root: string): Promise<ExternalRoleCatalogSnapshotV1> {
  try {
    const stored = await readPersistenceArtifact({ localPath: getGovernancePaths(root).current, artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance' })
    const document = stored.payload as unknown as GovernanceDocumentV3
    const version = document.publishedVersions.find((entry) => entry.id === document.activePolicyVersionId)
    const catalog = version && version.kind === 'assignment-governance-v3'
      ? version.externalRoleCatalogs.find((entry) => entry.applicationId === FINANCIAL_APPLICATION_ID)
      : undefined
    if (!catalog || catalog.sourceKind !== 'application-contract' || validateFinancialExternalRoleCatalog(catalog).length) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_UNAVAILABLE')
    return catalog
  } catch (error) {
    if (error instanceof FinancialCatalogReleaseError) throw error
    throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_UNAVAILABLE')
  }
}

export async function readActiveFinancialRoleCatalog(root = process.cwd()) { return readPublishedFinancialCatalog(root) }

export function rebaseFinancialCatalogAssignments(document: GovernanceDocumentV3, catalog: ExternalRoleCatalogSnapshotV1) {
  const roles = new Map(catalog.roles.map((role) => [role.stableRoleId, role]))
  const priorCatalogHash = (version: GovernanceDocumentV3['publishedVersions'][number]) => version.kind === 'assignment-governance-v3'
    ? version.externalRoleCatalogs.find((entry) => entry.applicationId === FINANCIAL_APPLICATION_ID)
    : undefined
  return document.draft.roleAssignments.map((assignment) => {
    if (assignment.applicationId !== FINANCIAL_APPLICATION_ID || assignment.status !== 'active') return assignment
    const role = roles.get(assignment.roleId)
    if (!role) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_CONFLICT')
    return {
      ...assignment,
      roleCodeSnapshot: role.code,
      roleNameSnapshot: role.displayName,
      authoringCatalogVersion: assignment.authoringCatalogVersion ?? assignment.catalogVersion,
      authoringCatalogSha256: assignment.authoringCatalogSha256 ?? [...document.publishedVersions].reverse().map(priorCatalogHash).find((entry) => entry?.catalogVersion === assignment.catalogVersion)?.contentSha256 ?? [...document.publishedVersions].reverse().map(priorCatalogHash).find((entry) => entry?.catalogVersion === assignment.catalogVersion)?.catalogSha256 ?? null,
      catalogVersion: catalog.catalogVersion,
    }
  })
}

export async function publishFinancialCatalog(root: string, actor: GovernanceActorContext, releaseValue: unknown, request: { commandId: string; expectedGovernanceRevision: string; reason: string }) {
  if (!request.commandId.trim() || !request.reason.trim()) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_INVALID')
  const catalog = snapshotFromRelease(releaseValue, actor)
  const releaseRequestHash = commandRequestHash({ applicationId: FINANCIAL_APPLICATION_ID, version: catalog.catalogVersion, contentSha256: catalog.contentSha256, artifactSha256: catalog.artifactSha256, sourceDraftId: catalog.sourceDraftId, sourceDraftRevision: catalog.sourceDraftRevision })
  const auditType = `financial_catalog_release_publish:${releaseRequestHash}`
  const observed = await readGovernanceStore(root)
  assertFinancialAuthority(observed.document, actor, 'financial-management-system.catalog.import')
  assertFinancialAuthority(observed.document, actor, 'financial-management-system.catalog.publish')
  assertFinancialAuthority(observed.document, actor, 'financial-management-system.catalog.activate')
  const replay = observed.document.auditEvents.find((event) => event.commandId === request.commandId)
  if (replay) {
    if (replay.commandHash !== commandRequestHash({ commandId: request.commandId, reason: request.reason.trim(), type: auditType })) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_CONFLICT')
    return { status: 'replayed' as const, revision: observed.revision, catalogVersion: catalog.catalogVersion, catalogSha256: catalog.contentSha256 }
  }
  const priorRelease = observed.document.publishedVersions
    .filter((version) => version.kind === 'assignment-governance-v3')
    .flatMap((version) => version.externalRoleCatalogs)
    .filter((entry) => entry.applicationId === FINANCIAL_APPLICATION_ID && entry.sourceKind === 'application-contract')
    .find((entry) => entry.catalogVersion === catalog.catalogVersion)
  if (priorRelease) {
    const sameRelease = priorRelease.contentSha256 === catalog.contentSha256
      && priorRelease.artifactSha256 === catalog.artifactSha256
      && priorRelease.sourceDraftId === catalog.sourceDraftId
      && priorRelease.sourceDraftRevision === catalog.sourceDraftRevision
    if (!sameRelease) throw new FinancialCatalogReleaseError('FINANCIAL_CATALOG_RELEASE_CONFLICT')
    return { status: 'replayed' as const, revision: observed.revision, catalogVersion: catalog.catalogVersion, catalogSha256: catalog.contentSha256 }
  }
  const committed = await commitGovernanceMutation(root, request.expectedGovernanceRevision, async (current, source) => {
    assertFinancialAuthority(current.document, actor, 'financial-management-system.catalog.import')
    assertFinancialAuthority(current.document, actor, 'financial-management-system.catalog.publish')
    assertFinancialAuthority(current.document, actor, 'financial-management-system.catalog.activate')
    const nextDraft = { ...current.document.draft, roleAssignments: rebaseFinancialCatalogAssignments(current.document, catalog), updatedAt: new Date().toISOString() }
    const aiPdm = await readActiveAiPdmRoleCatalog(root)
    let document = publishFinancialPolicy(current.document, nextDraft, [aiPdm, catalog], source, actor, request.reason, new Date().toISOString())
    document = appendGovernanceAudit(document, { commandId: request.commandId, reason: request.reason.trim(), type: auditType }, actor, { action: 'financial_catalog_release_publish', entityType: 'financialCatalogRelease', entityId: catalog.catalogVersion, beforeHash: current.document.activePolicyVersionId, afterHash: document.publishedVersions.at(-1)?.snapshotHash ?? null })
    const publishedVersion = document.publishedVersions.at(-1)!
    document = appendGovernanceAudit(document, { commandId: randomUUID(), reason: request.reason.trim(), type: 'PUBLISH_ASSIGNMENTS' }, actor,
      { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: publishedVersion.id, beforeHash: null, afterHash: publishedVersion.snapshotHash })
    return { document, reasonCode: 'financial_catalog_release_publish', updatedBy: actor.principalId, validationCatalogs: [aiPdm, catalog] }
  }, actor, (document) => {
    assertFinancialAuthority(document, actor, 'financial-management-system.catalog.import')
    assertFinancialAuthority(document, actor, 'financial-management-system.catalog.publish')
    assertFinancialAuthority(document, actor, 'financial-management-system.catalog.activate')
  })
  return { status: 'applied' as const, revision: committed.revision, catalogVersion: catalog.catalogVersion, catalogSha256: catalog.contentSha256 }
}

export const financialProtectedOperationCapabilities: FinancialManagementCapability[] = FINANCIAL_PROTECTED_OPERATIONS.map((operation) => operation)
