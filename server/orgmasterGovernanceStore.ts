import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getWorkspaceIndex, getWorkspaceVersion } from './orgmasterWorkspaceStore'
import { readStoredDocument } from './orgmasterApi'
import { applyGovernanceCommandV3, canonicalJson, commandHash, sha256, GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { ALL_SEED_PERMISSIONS, GOVERNANCE_APPLICATIONS, GOVERNANCE_ROLE_TEMPLATES, ORGMASTER_PERMISSIONS, createAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { buildOrganizationSnapshot, GovernanceValidationError, validateDocument, validateDocumentV3, validatePolicyDataV3, isActiveAt } from '../src/governance/validation'
import { createSeedDocumentV2, migrateGovernanceV1ToV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { assignmentMatchesSecuritySubject, evaluateVerifiedPrincipalPermission } from '../src/governance/evaluatePermission'
import { readApplicationRoleCatalogs, readActiveAiPdmRoleCatalog } from './applicationRoleCatalogRegistry'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceAuditEventV1, GovernanceAuditEventV3, GovernanceCommandV2, GovernanceDocumentV1, GovernanceDocumentV2, GovernanceDocumentV3, GovernanceExpectedCatalogV1, GovernanceOrgSource, GovernancePolicyDataV1, GovernanceRoleAssignmentV2, GovernanceCommandResultV1, GovernanceCommandQueryResultV1 } from '../src/governance/types'
import { OrgmasterPersistenceError, currentPersistenceTransactionDatabase, withPersistenceTransaction, persistenceArtifactExists, readPersistenceArtifact, usesCloudSqlPersistence, writePersistenceArtifacts, type PersistenceEntitlementChange } from './orgmasterPersistenceRepository'
import { assertMigrationWritesAllowed } from './orgmasterMigrationGate'
import { storedGovernanceCatalogs, isGovernanceReduction, withPublishedGovernanceHistory } from './governanceReduction'
import { readHistoricalAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'
import { assertCurrentGovernanceWriteActor, GovernanceWriteActorError } from './orgmasterGovernanceWriteActor'

export class GovernanceStoreError extends Error { constructor(public readonly code: string, public readonly details?: unknown) { super(code); this.name = 'GovernanceStoreError' } }
export type GovernanceStoreDocument = GovernanceDocumentV3
export type GovernanceStoreRead = { raw: string; document: GovernanceDocumentV3; revision: string }
function governanceDataRoot(rootDirectory: string) { return process.env.ORGMASTER_GOVERNANCE_DATA_DIR ? resolve(process.env.ORGMASTER_GOVERNANCE_DATA_DIR) : resolve(rootDirectory, 'data') }
export function getGovernancePaths(rootDirectory = process.cwd()) { const data = governanceDataRoot(rootDirectory); return { current: resolve(data, 'orgmaster-governance.v3.json'), previous: resolve(data, 'orgmaster-governance.v3.previous.json'), legacyV2: resolve(data, 'orgmaster-governance.v2.json'), legacyV2Previous: resolve(data, 'orgmaster-governance.v2.previous.json'), legacyV1: resolve(data, 'orgmaster-governance.v1.json'), legacyV1Previous: resolve(data, 'orgmaster-governance.v1.previous.json') } }
export function documentRevision(raw: string) { return sha256(raw) }
const locks = new Map<string, Promise<void>>()
async function withLock<T>(root: string, fn: () => Promise<T>) { const key = resolve(root); const previous = locks.get(key) ?? Promise.resolve(); let release!: () => void; const current = new Promise<void>((resolveRelease) => { release = resolveRelease }); const queued = previous.then(() => current); locks.set(key, queued); await previous; try { return await fn() } finally { release(); if (locks.get(key) === queued) locks.delete(key) } }
export async function withGovernanceLock<T>(root: string, fn: () => Promise<T>) { return withLock(root, fn) }
export async function withActorWrite<T>(root: string, actor: GovernanceActorContext, run: (authorizeBeforeCommit: (check: () => void) => void) => Promise<T>) {
  return withLock(root, () => withPersistenceTransaction(async () => {
    let finalAuthority: (() => void) | undefined
    if (usesCloudSqlPersistence()) await assertCurrentGovernanceWriteActor(currentPersistenceTransactionDatabase(), actor, false)
    const result = await run(check => { finalAuthority = check })
    if (usesCloudSqlPersistence()) {
      await assertCurrentGovernanceWriteActor(currentPersistenceTransactionDatabase(), actor, true)
      if (!finalAuthority) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
      finalAuthority()
    }
    return result
  }).catch(error => { if (error instanceof GovernanceWriteActorError) throw new GovernanceStoreError(error.code); throw error }))
}
function assertCurrentManagementAuthority(document: GovernanceDocumentV3, actor: GovernanceActorContext) {
  if (actor.bootstrap && !document.activePolicyVersionId && !usesCloudSqlPersistence()) return
  if (evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage').status !== 'allowed') throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
}
async function exists(path: string) { try { await stat(path); return true } catch { return false } }
async function writeAtomic(path: string, raw: string) { await mkdir(dirname(path), { recursive: true }); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; try { await writeFile(temp, raw, 'utf8'); if (await readFile(temp, 'utf8') !== raw) throw new GovernanceStoreError('GOVERNANCE_WRITE_FAILED'); await rename(temp, path) } catch (error) { try { await unlink(temp) } catch { /* best effort cleanup */ } throw error } }

function emptyDataV1(): GovernancePolicyDataV1 { return { applications: GOVERNANCE_APPLICATIONS.map((value) => ({ ...value })), identityLinks: [], applicationRoles: GOVERNANCE_ROLE_TEMPLATES.map((value) => ({ ...value })), permissions: ALL_SEED_PERMISSIONS.map((value) => ({ ...value })), rolePermissionGrants: ORGMASTER_PERMISSIONS.map((permission) => ({ id: `grant-orgmaster-admin-${permission.id}`, roleId: 'role-orgmaster-admin', permissionId: permission.id, effect: 'allow' as const })), roleAssignments: [], delegations: [], approvalPolicies: [] } }
export function createSeedDocument(now = new Date().toISOString()): GovernanceDocumentV1 { return { app: 'OrgMaster', schemaVersion: 1, draft: { ...emptyDataV1(), basePolicyVersionId: null, updatedAt: now }, activePolicyVersionId: null, publishedVersions: [], auditEvents: [] } }
function auditEventHashInput(event: Omit<GovernanceAuditEventV3, 'eventHash'> | GovernanceAuditEventV3) {
  return {
    id: event.id,
    commandId: event.commandId,
    commandHash: event.commandHash,
    occurredAt: event.occurredAt,
    actorPrincipalId: event.actorPrincipalId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    reason: event.reason,
    beforeHash: event.beforeHash,
    afterHash: event.afterHash,
    previousEventHash: event.previousEventHash,
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.hashFormat ? { hashFormat: event.hashFormat } : {}),
    ...(event.commandHashFormat ? { commandHashFormat: event.commandHashFormat } : {}),
    ...(event.commandResult ? { commandResult: event.commandResult } : {}),
  }
}
function eventHash(event: Omit<GovernanceAuditEventV3, 'eventHash'> | GovernanceAuditEventV3) {
  if (event.hashFormat !== undefined && event.hashFormat !== GOVERNANCE_PUBLICATION_HASH_FORMAT) throw new GovernanceStoreError('AUDIT_CHAIN_INVALID')
  if (event.commandHashFormat !== undefined && event.commandHashFormat !== GOVERNANCE_COMMAND_HASH_FORMAT) throw new GovernanceStoreError('AUDIT_CHAIN_INVALID')
  return event.hashFormat === GOVERNANCE_PUBLICATION_HASH_FORMAT
    ? publicationSnapshotHash(auditEventHashInput(event)) : sha256(canonicalJson(auditEventHashInput(event)))
}
export function appendGovernanceAudit<T extends GovernanceDocumentV2 | GovernanceDocumentV3>(document: T, command: { commandId: string; reason: string; type?: string }, actor: GovernanceActorContext, info: { action: string; entityType: string; entityId: string | null; beforeHash: string | null; afterHash: string | null; detail?: NonNullable<GovernanceDocumentV3['auditEvents'][number]['detail']>; commandHashFormat?: typeof GOVERNANCE_COMMAND_HASH_FORMAT; commandResult?: GovernanceCommandResultV1 }, now = new Date().toISOString()): T {
  if (document.auditEvents.some(event => event.commandId === command.commandId)) throw new GovernanceStoreError('COMMAND_ID_REUSED')
  const previousEventHash = document.auditEvents.at(-1)?.eventHash ?? null
  const base = { id: `audit-${randomUUID()}`, commandId: command.commandId, commandHash: commandHash(command), occurredAt: now,
    actorPrincipalId: actor.principalId, action: info.action, entityType: info.entityType, entityId: info.entityId,
    reason: command.reason, beforeHash: info.beforeHash, afterHash: info.afterHash, previousEventHash,
    ...(info.detail ? { detail: info.detail } : {}),
    ...(document.schemaVersion === 3 ? { hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT } : {}),
    ...(info.commandHashFormat ? { commandHashFormat: info.commandHashFormat } : {}),
    ...(info.commandResult ? { commandResult: info.commandResult } : {}) }
  return { ...document, auditEvents: [...document.auditEvents, { ...base, eventHash: eventHash(base) }] } as T
}

const appendAudit = appendGovernanceAudit
function validateAuditChain(document: { auditEvents: GovernanceAuditEventV1[] | GovernanceAuditEventV3[] }) { let previous: string | null = null; for (const event of document.auditEvents) { if (event.previousEventHash !== previous || eventHash(event) !== event.eventHash) throw new GovernanceStoreError('AUDIT_CHAIN_INVALID'); previous = event.eventHash } }
function actorHasPolicyPermissionV1(policy: GovernancePolicyDataV1, actor: GovernanceActorContext, permissionCode: string, now = new Date().toISOString()) { const link = policy.identityLinks.find((value) => value.principalId === actor.principalId && value.issuer === actor.issuer && value.subject === actor.subject && isActiveAt(value.status, value.validFrom, value.validTo, now)); if (!link) return false; const permission = policy.permissions.find((value) => value.applicationId === 'orgmaster' && value.code === permissionCode && value.status === 'active'); if (!permission) return false; const activeRoles = new Set(policy.applicationRoles.filter((role) => role.applicationId === 'orgmaster' && role.status === 'active').map((role) => role.id)); const roleIds = new Set(policy.roleAssignments.filter((assignment) => assignment.employeeId === link.employeeId && activeRoles.has(assignment.roleId) && assignment.scope.kind === 'global' && isActiveAt(assignment.status, assignment.validFrom, assignment.validTo, now)).map((assignment) => assignment.roleId)); const grants = policy.rolePermissionGrants.filter((grant) => roleIds.has(grant.roleId) && grant.permissionId === permission.id); return !grants.some((grant) => grant.effect === 'deny') && grants.some((grant) => grant.effect === 'allow') }
export function actorHasPolicyPermission(
  policy: GovernancePolicyDataV1 | GovernanceDocumentV2['draft'] | GovernanceDocumentV2['publishedVersions'][number]['policy'] | GovernanceDocumentV3['draft'],
  actor: GovernanceActorContext,
  permissionCode: string,
  now = new Date().toISOString(),
) {
  if (!('roleDelegations' in policy)) return actorHasPolicyPermissionV1(policy, actor, permissionCode, now)
  if (!actor.principalId || !actor.employeeId) return false
  const permission = policy.permissions.find((value) =>
    value.applicationId === 'orgmaster' && value.code === permissionCode && value.status === 'active')
  if (!permission) return false
  const roles = new Set(policy.applicationRoles.filter((role) =>
    role.applicationId === 'orgmaster' && role.status === 'active').map((role) => role.id))
  const assignments = policy.roleAssignments.filter((assignment) =>
    assignment.applicationId === 'orgmaster'
    && assignmentMatchesSecuritySubject(assignment, actor.principalId, actor.employeeId!)
    && assignment.scope.kind === 'global'
    && roles.has(assignment.roleId)
    && isActiveAt(assignment.status, assignment.validFrom, assignment.validTo, now))
  const grants = policy.rolePermissionGrants.filter((grant) =>
    assignments.some((assignment) => assignment.roleId === grant.roleId)
    && grant.permissionId === permission.id)
  return !grants.some((grant) => grant.effect === 'deny') && grants.some((grant) => grant.effect === 'allow')
}
function actorHasDraftPermission(document: GovernanceDocumentV3, actor: GovernanceActorContext, permissionCode: string, now = new Date().toISOString()) { return actorHasPolicyPermission(document.draft, actor, permissionCode, now) }
/** A mutable draft cannot grant its author the authority to publish it. */
export function assertCurrentPublicationAuthority(document: GovernanceDocumentV3, actor: GovernanceActorContext, now = new Date().toISOString()) {
  if (!document.activePolicyVersionId && actor.bootstrap) return
  if (evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', { now }).status !== 'allowed') {
    throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
  }
  if (evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.publish', { now }).status !== 'allowed') {
    throw new GovernanceStoreError('GOVERNANCE_PUBLISH_REQUIRED')
  }
}
/** Never activate an empty or publisher-less policy: the runtime has no safe way to recover it. */
export function assertActivationContinuity(target: GovernanceDocumentV3['publishedVersions'][number] | null | undefined, actor: GovernanceActorContext, now = new Date().toISOString()) {
  if (!target || target.kind !== 'assignment-governance-v3' ||
    !actorHasPolicyPermission(target.policy, actor, 'orgmaster.governance.manage', now) ||
    !actorHasPolicyPermission(target.policy, actor, 'orgmaster.governance.publish', now)) {
    throw new GovernanceStoreError('GOVERNANCE_ADMIN_CONTINUITY_REQUIRED')
  }
}

function policyActivationExpandsAiPdmAccess(current: GovernanceDocumentV3['publishedVersions'][number] | undefined, target: GovernanceDocumentV3['publishedVersions'][number]) {
  if (target.kind !== 'assignment-governance-v3') return false
  const before = current?.kind === 'assignment-governance-v3' ? current.policy.roleAssignments : []
  return target.policy.roleAssignments.some(next => {
    if (next.applicationId !== 'ai-pdm' || next.status !== 'active') return false
    const previous = before.find(value => value.id === next.id)
    if (!previous || previous.status !== 'active' || previous.employeeId !== next.employeeId || previous.roleId !== next.roleId) return true
    if (next.scope.kind === 'global' && previous.scope.kind !== 'global') return true
    if (next.scope.kind !== previous.scope.kind || ('value' in next.scope && 'value' in previous.scope && next.scope.value !== previous.scope.value)) return true
    if (Date.parse(next.validFrom) < Date.parse(previous.validFrom)) return true
    if (previous.validTo && (!next.validTo || Date.parse(next.validTo) > Date.parse(previous.validTo))) return true
    return false
  })
}
function assertActorEmployeeActive(source: GovernanceOrgSource, actor: GovernanceActorContext) {
  if (!actor.principalId || !actor.employeeId || !source.state.employees.some((employee) =>
    employee.id === actor.employeeId && employee.status !== 'inactive')) {
    throw new GovernanceStoreError('EMPLOYEE_NOT_ACTIVE')
  }
}
async function readCurrentWorkspaceSource(root: string): Promise<GovernanceOrgSource> {
  const index = await getWorkspaceIndex(root)
  const current = await getWorkspaceVersion(root, index.currentVersionId)
  return { workspaceVersionId: index.currentVersionId, workspaceRevision: current.version.revision,
    sourceDataAt: current.document.savedAt, state: current.document.state }
}
export async function loadOrganizationSource(root = process.cwd()): Promise<GovernanceOrgSource> {
  // A failed Cloud SQL workspace read must never turn into an empty test source.
  if (usesCloudSqlPersistence()) return readCurrentWorkspaceSource(root)
  try { return await readCurrentWorkspaceSource(root) } catch {
    try {
      const legacy = await readStoredDocument(root)
      return { workspaceVersionId: 'legacy-current', workspaceRevision: legacy.revision,
        sourceDataAt: legacy.document.savedAt, state: legacy.document.state }
    } catch {
      return { workspaceVersionId: 'test-current', workspaceRevision: 'test-revision',
        state: { employees: [], departments: [], roles: [], positions: [], assignments: [] } }
    }
  }
}
function validationSource(source: GovernanceOrgSource): GovernanceOrgSource | undefined { return source.workspaceVersionId === 'test-current' ? undefined : source }
async function readV2Raw(root: string) { const path = getGovernancePaths(root).legacyV2; try { const stored = await readPersistenceArtifact({ localPath: path, artifactKey: 'orgmaster-governance.v2.json', artifactKind: 'governance' }); const document = stored.payload as unknown as GovernanceDocumentV2; validateAuditChain(document); if (document.app !== 'OrgMaster' || document.schemaVersion !== 2) throw new GovernanceStoreError('GOVERNANCE_SCHEMA_UNSUPPORTED'); return { raw: stored.raw, document, revision: stored.revision } } catch (error) { if (error instanceof GovernanceStoreError) throw error; throw new GovernanceStoreError('GOVERNANCE_READ_FAILED') } }
async function readV3Raw(root: string): Promise<GovernanceStoreRead> {
  try {
    const stored = await readPersistenceArtifact({ localPath: getGovernancePaths(root).current,
      artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance' })
    const document = stored.payload as unknown as GovernanceDocumentV3
    validateAuditChain(document)
    const source = validationSource(await loadOrganizationSource(root))
    const ownedCatalogs = storedGovernanceCatalogs(document)
    // This proves readability/provenance, never permission to create a new grant.
    const catalogs = ownedCatalogs && !validateDocumentV3(document, source, ownedCatalogs).length
      ? ownedCatalogs : await governanceCatalogsWithHistory(document, await readApplicationRoleCatalogs(root))
    const issues = validateDocumentV3(document, source, catalogs)
    if (issues.length) throw new GovernanceStoreError('GOVERNANCE_READ_FAILED', issues)
    return { raw: stored.raw, document, revision: stored.revision }
  } catch (error) {
    if (error instanceof GovernanceStoreError) throw error
    throw new GovernanceStoreError('GOVERNANCE_READ_FAILED')
  }
}
function governanceCatalogsWithHistory(document: GovernanceDocumentV3, catalogs: ExternalRoleCatalogSnapshotV1[]) {
  return withPersistenceTransaction(() => withPublishedGovernanceHistory(document, catalogs, usesCloudSqlPersistence() ? async version => {
    const history = await readHistoricalAiPdmRoleCatalogFromDatabase(currentPersistenceTransactionDatabase(), version)
    return createAiPdmRoleCatalog('valid', history.publishedAt, history)
  } : undefined))
}
export function syncOrgMasterSystemCatalog(document: GovernanceDocumentV3, now = new Date().toISOString()) {
  const permissions = [...document.draft.permissions]
  const rolePermissionGrants = [...document.draft.rolePermissionGrants]
  const adminRole = document.draft.applicationRoles.find((role) => role.id === 'role-orgmaster-admin')
  if (!adminRole || adminRole.applicationId !== 'orgmaster' || adminRole.code !== 'orgmaster_admin' || adminRole.status !== 'active') throw new GovernanceStoreError('ORGMASTER_SYSTEM_CATALOG_CONFLICT')
  const addedPermissions: string[] = []
  const addedGrants: string[] = []
  for (const expected of ORGMASTER_PERMISSIONS) {
    const idMatches = permissions.filter((permission) => permission.id === expected.id)
    const codeMatches = permissions.filter((permission) => permission.applicationId === expected.applicationId && permission.code === expected.code)
    if (idMatches.length > 1 || codeMatches.length > 1 || idMatches.length === 1 && (idMatches[0].applicationId !== expected.applicationId || idMatches[0].code !== expected.code)) {
      throw new GovernanceStoreError('ORGMASTER_SYSTEM_CATALOG_CONFLICT', { permissionId: expected.id, permissionCode: expected.code })
    }
    const existing = idMatches[0] ?? codeMatches[0]
    if (existing && (existing.applicationId !== expected.applicationId || existing.code !== expected.code || existing.status !== 'active' || existing.kind !== expected.kind || existing.risk !== expected.risk)) {
      throw new GovernanceStoreError('ORGMASTER_SYSTEM_CATALOG_CONFLICT', { permissionId: expected.id, permissionCode: expected.code })
    }
    const permissionId = existing?.id ?? expected.id
    if (!existing) { permissions.push({ ...expected }); addedPermissions.push(expected.id) }
    const expectedGrant = { id: `grant-orgmaster-admin-${permissionId}`, roleId: 'role-orgmaster-admin', permissionId, effect: 'allow' as const }
    const idGrant = rolePermissionGrants.find((grant) => grant.id === expectedGrant.id)
    if (idGrant && (idGrant.roleId !== expectedGrant.roleId || idGrant.permissionId !== expectedGrant.permissionId || idGrant.effect !== 'allow')) {
      throw new GovernanceStoreError('ORGMASTER_SYSTEM_CATALOG_CONFLICT', { grantId: expectedGrant.id, permissionId })
    }
    const matchingGrants = rolePermissionGrants.filter((grant) => grant.roleId === expectedGrant.roleId && grant.permissionId === permissionId)
    if (matchingGrants.some((grant) => grant.effect !== 'allow')) throw new GovernanceStoreError('ORGMASTER_SYSTEM_CATALOG_CONFLICT', { grantId: expectedGrant.id, permissionId })
    if (!idGrant && matchingGrants.length === 0) { rolePermissionGrants.push(expectedGrant); addedGrants.push(expectedGrant.id) }
  }
  if (!addedPermissions.length && !addedGrants.length) return document
  const draft = { ...document.draft, permissions, rolePermissionGrants, updatedAt: now }
  const actor: GovernanceActorContext = { principalId: 'system', issuer: 'system', subject: 'system', employeeId: null, bootstrap: true }
  const syncIdentity = sha256(canonicalJson({ addedPermissions, addedGrants })).slice(0, 16)
  return appendAudit({ ...document, draft }, { commandId: `system-catalog-sync-v3-${syncIdentity}`, reason: 'DEV-056 OrgMaster system permission catalog compatible sync', type: 'ORGMASTER_SYSTEM_CATALOG_SYNCED' }, actor, { action: 'ORGMASTER_SYSTEM_CATALOG_SYNCED', entityType: 'permissionCatalog', entityId: 'orgmaster.system-permissions', beforeHash: sha256(canonicalJson(document.draft)), afterHash: sha256(canonicalJson(draft)) }, now)
}
async function persistV3(root: string, current: GovernanceStoreRead, document: GovernanceDocumentV3, source?: GovernanceOrgSource, input?: { reasonCode?: string; updatedBy?: string; entitlementChanges?: PersistenceEntitlementChange[] }, catalogs?: ExternalRoleCatalogSnapshotV1[]) { await assertMigrationWritesAllowed(root); if (source) { const validationCatalogs = await governanceCatalogsWithHistory(document, catalogs ?? await readApplicationRoleCatalogs(root)); const issues = validateDocumentV3(document, validationSource(source), validationCatalogs); if (issues.length) throw new GovernanceValidationError(issues) } validateAuditChain(document); const paths = getGovernancePaths(root); const raw = `${JSON.stringify(document, null, 2)}\n`; try { if (!usesCloudSqlPersistence()) await writeAtomic(paths.previous, current.raw); await writePersistenceArtifacts([{ artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance', localPath: paths.current, payload: document as unknown as Record<string, unknown>, raw, expectedRevision: current.revision }], { reasonCode: input?.reasonCode ?? 'governance_v3_write', updatedBy: input?.updatedBy, entitlementChanges: input?.entitlementChanges }); if (source && usesCloudSqlPersistence()) { const freshSource = await loadOrganizationSource(root); if (freshSource.workspaceVersionId !== source.workspaceVersionId || freshSource.workspaceRevision !== source.workspaceRevision) throw new GovernanceStoreError('ORGANIZATION_REVISION_CONFLICT') } return { status: 'applied' as const, ...(await readV3Raw(root)) } } catch (error) { if (error instanceof OrgmasterPersistenceError && error.code === 'PERSISTENCE_REVISION_CONFLICT') throw new GovernanceStoreError('REVISION_CONFLICT'); throw error } }
export async function commitGovernanceMutation(root: string, expectedRevision: string, mutate: (current: GovernanceStoreRead, source: GovernanceOrgSource) => Promise<{ document: GovernanceDocumentV3; reasonCode: string; updatedBy: string; entitlementChanges?: PersistenceEntitlementChange[] }> | { document: GovernanceDocumentV3; reasonCode: string; updatedBy: string; entitlementChanges?: PersistenceEntitlementChange[] }, actor: GovernanceActorContext, authorize: (document: GovernanceDocumentV3) => void) { return withActorWrite(root, actor, async (authorizeBeforeCommit) => { const current = await readV3Raw(root); authorizeBeforeCommit(() => authorize(current.document)); if (current.revision !== expectedRevision) throw new GovernanceStoreError('REVISION_CONFLICT'); const source = await loadOrganizationSource(root); assertActorEmployeeActive(source, actor); authorize(current.document); const mutation = await mutate(current, source); const result = await persistV3(root, current, mutation.document, source, mutation); return result }) }
function migrateAndAudit(v1: GovernanceDocumentV1, sourceRevision: string, catalog: ExternalRoleCatalogSnapshotV1) { const migrated = migrateGovernanceV1ToV2(v1, sourceRevision, [catalog]); const actor: GovernanceActorContext = { principalId: 'system', issuer: 'system', subject: 'system', employeeId: null, bootstrap: true }; return appendAudit(migrated, { commandId: `system-migrate-v1-to-v2-${sourceRevision.slice(0, 16)}`, reason: 'V1 governance store 非破壞遷移', type: 'GOVERNANCE_MIGRATED_V1_TO_V2' }, actor, { action: 'GOVERNANCE_MIGRATED_V1_TO_V2', entityType: 'governance', entityId: null, beforeHash: sha256(canonicalJson(v1)), afterHash: sha256(canonicalJson(migrated.draft)) }) }
function migrateV2AndAudit(v2: GovernanceDocumentV2, sourceRevision: string, catalog: ExternalRoleCatalogSnapshotV1) { const migrated = migrateGovernanceV2ToV3(v2, sourceRevision, catalog); const actor: GovernanceActorContext = { principalId: 'system', issuer: 'system', subject: 'system', employeeId: null, bootstrap: true }; return appendAudit(migrated, { commandId: `system-migrate-v2-to-v3-${sourceRevision.slice(0, 16)}`, reason: 'V2 governance store 非破壞遷移；V2只保留為歷史證據', type: 'GOVERNANCE_MIGRATED_V2_TO_V3' }, actor, { action: 'GOVERNANCE_MIGRATED_V2_TO_V3', entityType: 'governance', entityId: null, beforeHash: sha256(canonicalJson(v2.draft)), afterHash: sha256(canonicalJson(migrated.draft)) }) }
async function readV1(root: string, path: string) { try { const raw = await readFile(path, 'utf8'); const document = JSON.parse(raw) as GovernanceDocumentV1; if (document.schemaVersion !== 1) throw new GovernanceStoreError('GOVERNANCE_SCHEMA_UNSUPPORTED'); validateAuditChain(document); if (validateDocument(document).length) throw new GovernanceStoreError('GOVERNANCE_READ_FAILED'); return { raw, document, revision: documentRevision(raw) } } catch (error) { if (error instanceof GovernanceStoreError) throw error; throw new GovernanceStoreError('GOVERNANCE_READ_FAILED') } }
export async function ensureGovernanceStore(root = process.cwd()) { return withLock(root, async () => { const paths = getGovernancePaths(root); if (await persistenceArtifactExists(paths.current, 'orgmaster-governance.v3.json')) { const current = await readV3Raw(root); const synced = syncOrgMasterSystemCatalog(current.document); if (synced === current.document) return current; const source = await loadOrganizationSource(root); return persistV3(root, current, synced, source, { reasonCode: 'orgmaster_system_catalog_sync', updatedBy: 'system:catalog-sync' }) } if (usesCloudSqlPersistence()) throw new GovernanceStoreError('GOVERNANCE_V3_MIGRATION_REQUIRED'); const catalog = await readActiveAiPdmRoleCatalog(root); let v2: GovernanceDocumentV2; let sourceRevision: string; if (await persistenceArtifactExists(paths.legacyV2, 'orgmaster-governance.v2.json')) { const legacy = await readV2Raw(root); v2 = legacy.document; sourceRevision = legacy.revision } else if (await exists(paths.legacyV1)) { const legacy = await readV1(root, paths.legacyV1); v2 = migrateAndAudit(legacy.document, legacy.revision, catalog); sourceRevision = sha256(canonicalJson(v2)) } else { const seed = createSeedDocumentV2(); const actor: GovernanceActorContext = { principalId: 'system', issuer: 'system', subject: 'system', employeeId: null, bootstrap: true }; v2 = appendAudit(seed, { commandId: 'system-init-v2', reason: '建立本機治理 V2 migration source', type: 'GOVERNANCE_INITIALIZED' }, actor, { action: 'GOVERNANCE_INITIALIZED', entityType: 'governance', entityId: null, beforeHash: null, afterHash: sha256(canonicalJson(seed.draft)) }); sourceRevision = sha256(canonicalJson(v2)) } const migrated = migrateV2AndAudit(v2, sourceRevision, catalog); const raw = `${JSON.stringify(migrated, null, 2)}\n`; validateAuditChain(migrated); await writeAtomic(paths.current, raw); return readV3Raw(root) }) }
export async function readGovernanceStore(root = process.cwd()) { return ensureGovernanceStore(root) }
/** Additive pure read used by account enrollment. Never seeds or migrates a missing store. */
export async function readExistingGovernanceStore(root = process.cwd()) { return readV3Raw(root) }
type GovernanceWriteContext = { expectedOrganizationRevision?: string; expectedCatalog?: GovernanceExpectedCatalogV1 }

const GOVERNANCE_COMMAND_HASH_FORMAT = 'orgmaster.governance-command.v2' as const
function boundGovernanceCommand<T extends { commandId: string; reason: string; type: string }>(command: T, expectedRevision: string, actor: GovernanceActorContext, context: GovernanceWriteContext) {
  return { commandId: command.commandId, reason: command.reason, type: command.type,
    commandHashFormat: GOVERNANCE_COMMAND_HASH_FORMAT, actorPrincipalId: actor.principalId,
    payload: JSON.parse(JSON.stringify(command)) as Record<string, unknown>, expectedGovernanceRevision: expectedRevision,
    expectedOrganizationRevision: context.expectedOrganizationRevision ?? null, expectedCatalog: context.expectedCatalog ?? null }
}
function assertGovernanceReplay(existing: GovernanceAuditEventV3, bound: ReturnType<typeof boundGovernanceCommand>, legacy: unknown, actor: GovernanceActorContext) {
  const expectedHash = commandHash(existing.commandHashFormat === GOVERNANCE_COMMAND_HASH_FORMAT ? bound : legacy)
  if (existing.actorPrincipalId !== actor.principalId || existing.commandHash !== expectedHash) throw new GovernanceStoreError('COMMAND_ID_REUSED')
}
/** Own audit is sufficient for recovery; producer availability never decides whether a command committed. */
export async function readGovernanceCommandResult(root: string, commandId: string, actor: GovernanceActorContext): Promise<GovernanceCommandQueryResultV1> {
  if (!commandId.trim()) throw new GovernanceStoreError('INVALID_COMMAND')
  return withPersistenceTransaction(async () => {
    if (usesCloudSqlPersistence()) {
      try { await assertCurrentGovernanceWriteActor(currentPersistenceTransactionDatabase(), actor, false) }
      catch (error) { if (error instanceof GovernanceWriteActorError) throw new GovernanceStoreError(error.code); throw error }
    }
    const stored = await readPersistenceArtifact({ localPath: getGovernancePaths(root).current,
      artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance' })
    const document = stored.payload as unknown as GovernanceDocumentV3
    if (document.app !== 'OrgMaster' || document.schemaVersion !== 3 || !Array.isArray(document.auditEvents)) throw new GovernanceStoreError('GOVERNANCE_READ_FAILED')
    validateAuditChain(document)
    assertCurrentManagementAuthority(document, actor)
    const event = document.auditEvents.find(value => value.commandId === commandId)
    return event ? { status: 'committed', commandId, commandHash: event.commandHash, auditReference: event.id,
      entityType: event.entityType, entityId: event.entityId, occurredAt: event.occurredAt, result: event.commandResult ?? null }
      : { status: 'not_observed', commandId, commandHash: null, auditReference: null,
        entityType: null, entityId: null, occurredAt: null, result: null }
  })
}

export function assertDynamicCatalogBinding(catalog: ExternalRoleCatalogSnapshotV1, context: GovernanceWriteContext) {
  if (catalog.publicationFormat !== 'dynamic-policy-v1') return
  const expected = context.expectedCatalog
  if (!expected || !/^[a-f0-9]{64}$/u.test(expected.catalogSha256) ||
    expected.catalogVersion !== catalog.catalogVersion || expected.catalogSha256 !== (catalog.catalogSha256 ?? catalog.payloadHash)) {
    throw new GovernanceStoreError('EXTERNAL_CATALOG_VERSION_CONFLICT')
  }
}

export async function applyDraftCommand(root: string, expectedRevision: string, command: GovernanceCommandV2, actor: GovernanceActorContext, precondition?: (current: GovernanceStoreRead, source: GovernanceOrgSource) => void, context: GovernanceWriteContext = {}) {
  return withActorWrite(root, actor, async authorizeBeforeCommit => {
    const current = await readV3Raw(root)
    authorizeBeforeCommit(() => assertCurrentManagementAuthority(current.document, actor))
    assertCurrentManagementAuthority(current.document, actor)
    const commandEnvelope = { ...command, ...(context.expectedOrganizationRevision ? { expectedOrganizationRevision: context.expectedOrganizationRevision } : {}), ...(context.expectedCatalog ? { expectedCatalog: context.expectedCatalog } : {}) }
    const boundCommand = boundGovernanceCommand(command, expectedRevision, actor, context)
    const existing = current.document.auditEvents.find(event => event.commandId === command.commandId)
    if (existing) {
      assertGovernanceReplay(existing, boundCommand, commandEnvelope, actor)
      return { status: 'replayed' as const, document: current.document, revision: current.revision }
    }
    if (current.revision !== expectedRevision) throw new GovernanceStoreError('REVISION_CONFLICT')
    if (!command.commandId.trim() || !command.reason.trim() || command.reason.trim().length > 240) throw new GovernanceStoreError('GOVERNANCE_VALIDATION_FAILED')
    const source = await loadOrganizationSource(root)
    if (context.expectedOrganizationRevision && context.expectedOrganizationRevision !== source.workspaceRevision) throw new GovernanceStoreError('ORGANIZATION_REVISION_CONFLICT')
    if (!actor.bootstrap) assertActorEmployeeActive(source, actor)
    precondition?.(current, source)
    const reducingCommand = ['REVOKE_ROLE_ASSIGNMENT', 'REVOKE_ROLE_DELEGATION', 'REMOVE_ROLE_ASSIGNMENT'].includes(command.type)
    const ownedCatalogs = reducingCommand ? storedGovernanceCatalogs(current.document) : null
    const catalogs = await governanceCatalogsWithHistory(current.document, ownedCatalogs ?? [await readActiveAiPdmRoleCatalog(root)])
    const currentAiPdmCatalog = catalogs.find(value => value.applicationId === 'ai-pdm')
    const expandsAiPdmAccess = (command.type === 'UPSERT_ROLE_ASSIGNMENT' && command.value.applicationId === 'ai-pdm' && command.value.status === 'active') ||
      (command.type === 'UPSERT_ROLE_DELEGATION' && command.value.applicationId === 'ai-pdm') || command.type === 'RESTORE_ROLE_ASSIGNMENT'
    if (expandsAiPdmAccess && currentAiPdmCatalog) assertDynamicCatalogBinding(currentAiPdmCatalog, context)
    const applied = applyGovernanceCommandV3(current.document, command, actor.principalId, validationSource(source), catalogs)
    if (reducingCommand && !isGovernanceReduction(current.document.draft, applied.document.draft)) throw new GovernanceStoreError('GOVERNANCE_VALIDATION_FAILED')
    const audited = appendAudit(applied.document, boundCommand, actor, { action: command.type, entityType: applied.entityType,
      entityId: applied.entityId, beforeHash: applied.beforeHash, afterHash: applied.afterHash, commandHashFormat: GOVERNANCE_COMMAND_HASH_FORMAT,
      commandResult: { operation: command.type, outcome: applied.status, entityType: applied.entityType, entityId: applied.entityId } })
    return { ...await persistV3(root, current, audited, source, undefined, catalogs), status: applied.status }
  })
}
export function validateAssignmentCandidateWithCatalogs(
  document: GovernanceDocumentV3,
  value: Partial<GovernanceRoleAssignmentV2>,
  catalog: ExternalRoleCatalogSnapshotV1,
  catalogs: ExternalRoleCatalogSnapshotV1[],
  source?: GovernanceOrgSource,
) {
  const candidate: GovernanceRoleAssignmentV2 = {
    id: value.id ?? 'candidate', employeeId: value.employeeId ?? '',
    applicationId: value.applicationId ?? 'ai-pdm', roleId: value.roleId ?? '',
    roleCodeSnapshot: value.roleCodeSnapshot ?? '', roleNameSnapshot: value.roleNameSnapshot ?? '',
    catalogVersion: value.catalogVersion === undefined ? catalog.catalogVersion : value.catalogVersion,
    scope: value.scope ?? { kind: 'global' }, status: 'active',
    validFrom: value.validFrom ?? new Date().toISOString(), validTo: value.validTo ?? null,
    effectState: value.effectState ?? 'not-synchronized',
  }
  const normalized = {
    ...candidate, basis: 'manual' as const, subjectKind: 'employee' as const,
    targetPrincipalId: null, sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: 'system:generic-v2-validator', createdReason: 'generic V2 validation adapter',
  }
  const issues = validatePolicyDataV3({
    ...document.draft,
    roleAssignments: [...document.draft.roleAssignments.filter((assignment) => assignment.id !== candidate.id), normalized],
  }, source, catalogs)
  // Historical snapshots remain readable, but preview is for a new mutation.
  if (candidate.applicationId === 'ai-pdm' && candidate.catalogVersion !== catalog.catalogVersion) {
    issues.push({ code: 'EXTERNAL_CATALOG_STALE', path: 'catalogVersion',
      message: '新指派必須使用目前發布的 catalog version' })
  }
  return { status: issues.length ? 'invalid' as const : 'valid' as const, issues,
    catalogVersion: catalog.catalogVersion, payloadHash: catalog.payloadHash,
    effectState: candidate.effectState, checkedAt: new Date().toISOString() }
}
export async function validateAssignmentCandidate(root: string, value: Partial<GovernanceRoleAssignmentV2>) {
  const source = await loadOrganizationSource(root)
  const current = await readV3Raw(root)
  const catalog = await readActiveAiPdmRoleCatalog(root)
  const catalogs = await governanceCatalogsWithHistory(current.document, [catalog])
  return validateAssignmentCandidateWithCatalogs(current.document, value, catalog, catalogs, validationSource(source))
}
export async function publishGovernance(root: string, expectedRevision: string, commandId: string, reason: string, organizationVersionId: string, actor: GovernanceActorContext, context: GovernanceWriteContext = {}) {
  return withActorWrite(root, actor, async authorizeBeforeCommit => {
    const current = await readV3Raw(root)
    authorizeBeforeCommit(() => assertCurrentPublicationAuthority(current.document, actor))
    assertCurrentPublicationAuthority(current.document, actor)
    const boundCommand = boundGovernanceCommand({ commandId, reason, type: 'PUBLISH_ASSIGNMENTS', organizationVersionId }, expectedRevision, actor, context)
    const existing = current.document.auditEvents.find(event => event.commandId === commandId)
    if (existing) {
      const legacy = existing.commandHashFormat === GOVERNANCE_COMMAND_HASH_FORMAT ? null : { commandId, reason, type: 'PUBLISH_ASSIGNMENTS', expectedOrganizationRevision: context.expectedOrganizationRevision ?? (await loadOrganizationSource(root)).workspaceRevision, ...(context.expectedCatalog ? { expectedCatalog: context.expectedCatalog } : {}) }
      assertGovernanceReplay(existing, boundCommand, legacy, actor)
      return { status: 'replayed' as const, document: current.document, revision: current.revision,
        versionId: existing.commandResult?.versionId ?? (existing.entityType === 'assignmentVersion' ? existing.entityId : null) }
    }
    const source = await loadOrganizationSource(root)
    if (context.expectedOrganizationRevision && context.expectedOrganizationRevision !== source.workspaceRevision) throw new GovernanceStoreError('ORGANIZATION_REVISION_CONFLICT')
    const now = new Date().toISOString()
    assertActorEmployeeActive(source, actor)
    if (!commandId.trim() || !reason.trim() || reason.trim().length > 240) throw new GovernanceStoreError('GOVERNANCE_VALIDATION_FAILED')
    if (current.revision !== expectedRevision) throw new GovernanceStoreError('REVISION_CONFLICT')
    if (source.workspaceVersionId !== organizationVersionId) throw new GovernanceStoreError('ORGANIZATION_VERSION_INVALID')
    if (!actorHasDraftPermission(current.document, actor, 'orgmaster.governance.publish', now)) throw new GovernanceStoreError('GOVERNANCE_PUBLISH_REQUIRED')
    if (!actorHasDraftPermission(current.document, actor, 'orgmaster.governance.manage', now)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_CONTINUITY_REQUIRED')
    const active = current.document.publishedVersions.find(version => version.id === current.document.activePolicyVersionId)
    const reduction = active?.kind === 'assignment-governance-v3' && isGovernanceReduction(active.policy, current.document.draft)
    const ownedCatalogs = reduction ? storedGovernanceCatalogs(current.document) : null
    const catalogs = await governanceCatalogsWithHistory(current.document, ownedCatalogs ?? [await readActiveAiPdmRoleCatalog(root)])
    const currentAiPdmCatalog = catalogs.find(value => value.applicationId === 'ai-pdm')
    if (!reduction && currentAiPdmCatalog && current.document.draft.roleAssignments.some(value => value.applicationId === 'ai-pdm' && value.status === 'active')) assertDynamicCatalogBinding(currentAiPdmCatalog, context)
    const issues = validateDocumentV3(current.document, source, catalogs)
    if (issues.length) throw new GovernanceValidationError(issues)
    if (current.document.migration.unresolvedAssignments.length || current.document.migration.unresolvedDelegations.length) throw new GovernanceStoreError('LEGACY_MIGRATION_UNRESOLVED')
    const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = current.document.draft
    const payload = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: catalogs,
      organizationSnapshot: buildOrganizationSnapshot(source), effectState: 'not-synchronized' as const }
    const version = { ...payload, id: `assignment-policy-${randomUUID()}`,
      versionNumber: current.document.publishedVersions.length + 1, publishedAt: now,
      publishedByPrincipalId: actor.principalId, publishReason: reason,
      hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash: publicationSnapshotHash(payload) }
    const next: GovernanceDocumentV3 = { ...current.document, activePolicyVersionId: version.id,
      publishedVersions: [...current.document.publishedVersions, version],
      draft: { ...current.document.draft, basePolicyVersionId: version.id, updatedAt: now } }
    const audited = appendAudit(next, boundCommand, actor, { action: 'PUBLISH_ASSIGNMENTS',
      entityType: 'assignmentVersion', entityId: version.id, beforeHash: null, afterHash: version.snapshotHash, commandHashFormat: GOVERNANCE_COMMAND_HASH_FORMAT,
      commandResult: { operation: 'PUBLISH_ASSIGNMENTS', outcome: 'published', entityType: 'assignmentVersion', entityId: version.id, versionId: version.id } }, now)
    return { ...await persistV3(root, current, audited, source, undefined, catalogs), versionId: version.id }
  })
}
export async function setActivePolicy(root: string, expectedRevision: string, commandId: string, reason: string, versionId: string | null, actor: GovernanceActorContext, context: GovernanceWriteContext = {}) {
  return withActorWrite(root, actor, async authorizeBeforeCommit => {
    const current = await readV3Raw(root)
    authorizeBeforeCommit(() => assertCurrentPublicationAuthority(current.document, actor))
    assertCurrentPublicationAuthority(current.document, actor)
    const operation = versionId ? 'ACTIVATE_ASSIGNMENT_VERSION' : 'REVOKE_ASSIGNMENT_VERSION'
    const boundCommand = boundGovernanceCommand({ commandId, reason, type: operation, versionId }, expectedRevision, actor, context)
    const existing = current.document.auditEvents.find(event => event.commandId === commandId)
    if (existing) {
      const legacy = existing.commandHashFormat === GOVERNANCE_COMMAND_HASH_FORMAT ? null : { commandId, reason, type: operation, expectedOrganizationRevision: context.expectedOrganizationRevision ?? (await loadOrganizationSource(root)).workspaceRevision, ...(context.expectedCatalog ? { expectedCatalog: context.expectedCatalog } : {}) }
      assertGovernanceReplay(existing, boundCommand, legacy, actor)
      return { status: 'replayed' as const, document: current.document, revision: current.revision }
    }
    if (current.revision !== expectedRevision) throw new GovernanceStoreError('REVISION_CONFLICT')
    const target = versionId ? current.document.publishedVersions.find(version => version.id === versionId) : null
    if (versionId && !target) throw new GovernanceStoreError('POLICY_VERSION_NOT_FOUND')
    if (target && target.kind !== 'assignment-governance-v3') throw new GovernanceStoreError('LEGACY_POLICY_REACTIVATION_FORBIDDEN')
    const source = await loadOrganizationSource(root)
    if (context.expectedOrganizationRevision && context.expectedOrganizationRevision !== source.workspaceRevision) throw new GovernanceStoreError('ORGANIZATION_REVISION_CONFLICT')
    assertActorEmployeeActive(source, actor)
    const targetCatalogs = target ? storedGovernanceCatalogs(current.document, target.id) : null
    if (target?.kind === 'assignment-governance-v3') {
      if (!targetCatalogs) throw new GovernanceStoreError('EXTERNAL_CATALOG_STALE')
      const targetIssues = validatePolicyDataV3(target.policy, validationSource(source), targetCatalogs)
      if (targetIssues.length) throw new GovernanceStoreError('EXTERNAL_CATALOG_STALE', targetIssues)
      const active = current.document.publishedVersions.find(version => version.id === current.document.activePolicyVersionId)
      if (policyActivationExpandsAiPdmAccess(active, target)) {
        const currentCatalog = await readActiveAiPdmRoleCatalog(root)
        assertDynamicCatalogBinding(currentCatalog, context)
      }
    }
    assertCurrentPublicationAuthority(current.document, actor)
    assertActivationContinuity(target, actor)
    if (!commandId.trim() || !reason.trim() || reason.trim().length > 240) throw new GovernanceStoreError('GOVERNANCE_VALIDATION_FAILED')
    const audited = appendAudit({ ...current.document, activePolicyVersionId: versionId }, boundCommand, actor, { action: operation, entityType: 'assignmentVersion', entityId: versionId, beforeHash: current.document.activePolicyVersionId, afterHash: versionId, commandHashFormat: GOVERNANCE_COMMAND_HASH_FORMAT,
      commandResult: { operation, outcome: versionId ? 'activated' : 'deactivated', entityType: 'assignmentVersion', entityId: versionId, versionId } })
    // The editable draft may still reference a prior owner-published catalog.
    // This proves draft readability only; target activation was checked above.
    return persistV3(root, current, audited, source, undefined,
      targetCatalogs ? await governanceCatalogsWithHistory(current.document, targetCatalogs) : undefined)
  })
}
export async function readGovernanceAudit(root = process.cwd(), limit = 50, cursor = 0) { const current = await readV3Raw(root); const items = [...current.document.auditEvents].reverse(); const start = Math.max(0, Number(cursor) || 0); const page = items.slice(start, start + Math.max(1, Math.min(100, limit))); return { items: page, nextCursor: start + page.length < items.length ? String(start + page.length) : null, revision: current.revision } }
