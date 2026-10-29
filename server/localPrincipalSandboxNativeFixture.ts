import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOrgDocumentFile, parseOrgDocument } from '../src/documentStorage'
import { createDefaultOrganizationLevels } from '../src/organizationLevels'
import { createWorkspaceManifest, validateWorkspaceManifest } from '../src/versionWorkspace'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import {
  createAiPdmRoleCatalog,
  validateExternalRoleCatalog,
} from '../src/governance/aiPdmCatalog'
import {
  buildOrganizationSnapshot,
  validateDocumentV3,
} from '../src/governance/validation'
import {
  GOVERNANCE_PUBLICATION_HASH_FORMAT,
  publicationSnapshotHash,
} from '../src/governance/commands'
import { appendGovernanceAudit, GOVERNANCE_COMMAND_HASH_FORMAT } from './orgmasterGovernanceStore'
import { validateFinancialExternalRoleCatalog } from '../src/governance/financialCatalog'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { localOrgmasterRoleCatalog } from '../contracts/local-principal-sandbox/v1/owner-publication.mjs'
import {
  LOCAL_SANDBOX_COMPANY_ID,
  AI_PDM_ROLE_CATALOG_V7_SHA256,
  AI_PDM_ROLE_CATALOG_V7_VERSION,
  readAiPdmRoleCatalogV7,
  validateLocalPrincipalSandboxFixture,
} from './localPrincipalSandboxFixture.mjs'
import type { OwnerApplicationId, OwnerRoleCatalog } from './localPrincipalSandboxFixture.mjs'
import { assertFixtureEnvelope, contractDigest } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import type { LocalFixture, LocalGrant, LocalScenario } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import type { PublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import type {
  ExternalRoleCatalogSnapshotV1,
  GovernanceAssignmentVersionV3,
  GovernanceActorContext,
  GovernanceDocumentV3,
  GovernanceOrgSource,
  GovernancePolicyDataV3,
  GovernanceScopeV1,
} from '../src/governance/types'
import type { OrgDirectoryState } from '../src/types'
import type { PersistenceArtifactWrite } from './orgmasterPersistenceRepository'

export const LOCAL_PRINCIPAL_NATIVE_FIXTURE_VERSION =
  'orgmaster.local-principal-native-fixture.v1' as const

export type LocalPrincipalSandboxPdmV7Readback = PublishedAiPdmRoleCatalog & {
  sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2'
  catalogVersion: typeof AI_PDM_ROLE_CATALOG_V7_VERSION
  catalogSha256: typeof AI_PDM_ROLE_CATALOG_V7_SHA256
}

export type LocalPrincipalSandboxFmsCatalogPin = ExternalRoleCatalogSnapshotV1 & {
  applicationId: 'financial-management-system'
  sourceKind: 'application-contract'
  validationState: 'valid'
  contentSha256: string
  artifactSha256: string
  publishedByPrincipalId: string
  publishedByEmployeeId: string
  sourceDraftId: string
  sourceDraftRevision: number
}

export type LocalPrincipalSandboxNativeFixtureInput = {
  fixture: LocalFixture
  sandboxId: string
  targetRoot: string
  pdmCatalogReadback: LocalPrincipalSandboxPdmV7Readback
  /** Validated FMS owner release snapshot; bundled fixtures are rejected.
   * First initialization admits a validated synthetic owner release before it
   * is active. The committed native publication must then be read back; this
   * pure materializer never establishes live activation evidence by itself.
   */
  fmsCatalogPin: LocalPrincipalSandboxFmsCatalogPin
  createdAt?: string
}

export type LocalPrincipalSandboxNativeFixtureInputName =
  | 'fixture'
  | 'sandboxId'
  | 'targetRoot'
  | 'pdmCatalogReadback'
  | 'fmsCatalogPin'

export class LocalPrincipalSandboxNativeFixtureError extends Error {
  readonly code: string
  readonly missingInputs: readonly LocalPrincipalSandboxNativeFixtureInputName[]

  constructor(
    code: string,
    missingInputs: LocalPrincipalSandboxNativeFixtureInputName[] = [],
  ) {
    super(code)
    this.name = 'LocalPrincipalSandboxNativeFixtureError'
    this.code = code
    this.missingInputs = Object.freeze([...missingInputs])
  }
}

export type LocalPrincipalSandboxNativeFixtureArtifactSet = {
  contractVersion: typeof LOCAL_PRINCIPAL_NATIVE_FIXTURE_VERSION
  status: 'materialized-in-memory'
  seedable: true
  sandboxId: string
  databaseName: string
  fixtureVersion: string
  fixtureHash: string
  inputFixtureHash: string
  effectiveFixture: LocalFixture
  normalizationChanges: readonly {
    scenarioId: string
    applicationId: 'orgmaster'
    stableRoleId: string
    reason: 'bound_to_native_published_version'
    previous: {
      catalogVersion: string
      catalogSha256: string
      roleDefinitionHash: string
    }
    effective: {
      catalogVersion: string
      catalogSha256: string
      roleDefinitionHash: string
    }
  }[]
  workspace: {
    manifest: ReturnType<typeof createWorkspaceManifest>
    currentVersionId: string
    currentVersion: ReturnType<typeof createOrgDocumentFile>
    currentVersionRevision: string
  }
  governance: GovernanceDocumentV3
  governanceVersion: GovernanceAssignmentVersionV3
  orgmasterRoleCatalog: ReturnType<typeof localOrgmasterRoleCatalog>
  governanceSource: GovernanceOrgSource
  persistenceArtifacts: readonly PersistenceArtifactWrite[]
  companyProjection: readonly {
    scenarioId: string
    applicationId: LocalGrant['applicationId']
    fixtureCompanyId: string
    nativeCompanyId: string
    representableInNativeAssignment: boolean
  }[]
  projectionGaps: readonly {
    scenarioId: string
    applicationId: 'ai-pdm'
    code: 'company_id_is_projected_from_native_company_context'
    fixtureCompanyId: string
    nativeCompanyId: string
  }[]
  inputReadbacks: {
    pdmSourcePath: LocalPrincipalSandboxPdmV7Readback['sourcePath']
    pdmCatalogVersion: string
    pdmCatalogSha256: string
    fmsCatalogVersion: string
    fmsContentSha256: string
    fmsArtifactSha256: string
  }
}

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HASH = /^[a-f0-9]{64}$/u
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,50}$/u
const LOCAL_FIXTURE_PUBLISHER = 'local-fixture-publisher'

function fail(code: string): never {
  throw new LocalPrincipalSandboxNativeFixtureError(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

function canonicalInstant(value: string | undefined): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) {
    return fail('native_fixture_timestamp_invalid')
  }
  return value
}

function equalDigest(left: unknown, right: unknown): boolean {
  return typeof left === 'string' && typeof right === 'string' &&
    /^[a-f0-9]{64}$/u.test(left) && left === right
}

function normalizePdmRole(role: PublishedAiPdmRoleCatalog['roles'][number]) {
  return {
    stableRoleId: role.stableRoleId,
    roleCode: role.roleCode,
    displayName: role.displayName,
    assignable: role.assignable,
    risk: role.risk,
    subjectKind: role.subjectKind,
    recommendationAllowed: role.recommendationAllowed,
    delegationAllowed: role.delegationAllowed,
    allowedScopeKinds: [...role.allowedScopeKinds],
    assignmentTier: role.assignmentTier,
    permissions: role.permissions.map((permission) => ({
      code: permission.code,
      kind: permission.kind,
      allowed: permission.allowed,
    })),
    metadata: role.metadata ?? null,
    roleDefinitionHash: role.roleDefinitionHash,
  }
}

function confirmPdmReadback(
  value: LocalPrincipalSandboxPdmV7Readback,
): ExternalRoleCatalogSnapshotV1 {
  if (!isRecord(value) ||
    value.sourcePath !== 'postgres:ai_pdm_contract.v_application_role_catalog_v2' ||
    value.contractVersion !== 'jenfu.platform-entitlement.v1' ||
    value.applicationId !== 'ai-pdm' ||
    value.catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION ||
    value.catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256 ||
    !HASH.test(value.catalogSha256) ||
    typeof value.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.publishedAt)) ||
    !Array.isArray(value.roles)) {
    return fail('pdm_v7_database_readback_invalid')
  }

  try {
    const baseline = readAiPdmRoleCatalogV7().catalog
    if (value.roles.length !== baseline.roles.length ||
      value.roles.some((role, index) =>
        !isRecord(role) || contractDigest(normalizePdmRole(role as unknown as PublishedAiPdmRoleCatalog['roles'][number])) !==
        contractDigest(normalizePdmRole(baseline.roles[index] as PublishedAiPdmRoleCatalog['roles'][number])))) {
      return fail('pdm_v7_database_readback_mismatch')
    }

    // The v7 role content is a frozen assignment contract. The DB readback above
    // is the active-source proof; this snapshot preserves OrgMaster's existing
    // v7 catalog validation shape and is never used as proof of DB activity.
    const snapshot = createAiPdmRoleCatalog(
      'valid',
      new Date(value.publishedAt).toISOString(),
      value,
    )
    if (validateExternalRoleCatalog(snapshot).length) {
      return fail('pdm_v7_catalog_snapshot_invalid')
    }
    return snapshot
  } catch (error) {
    if (error instanceof LocalPrincipalSandboxNativeFixtureError) throw error
    return fail('pdm_v7_database_readback_invalid')
  }
}

function confirmFmsCatalogPin(
  value: LocalPrincipalSandboxFmsCatalogPin,
): LocalPrincipalSandboxFmsCatalogPin {
  if (!isRecord(value) ||
    value.applicationId !== 'financial-management-system' ||
    value.sourceKind !== 'application-contract' ||
    value.validationState !== 'valid' ||
    value.effectState !== 'not-synchronized' ||
    !nonBlank(value.catalogVersion) ||
    !Array.isArray(value.roles) ||
    value.roles.some((role) => !isRecord(role) || !Array.isArray(role.allowedScopeKinds)) ||
    !HASH.test(value.contentSha256 ?? '') ||
    value.catalogSha256 !== value.contentSha256 ||
    value.payloadHash !== value.contentSha256 ||
    !HASH.test(value.artifactSha256 ?? '') ||
    !nonBlank(value.publishedByPrincipalId) ||
    !nonBlank(value.publishedByEmployeeId) ||
    !nonBlank(value.sourceDraftId) ||
    !Number.isSafeInteger(value.sourceDraftRevision) ||
    (value.sourceDraftRevision ?? -1) < 0) {
    return fail('fms_active_application_catalog_pin_invalid')
  }
  try {
    if (validateFinancialExternalRoleCatalog(value).length) {
      return fail('fms_active_application_catalog_pin_invalid')
    }
  } catch (error) {
    if (error instanceof LocalPrincipalSandboxNativeFixtureError) throw error
    return fail('fms_active_application_catalog_pin_invalid')
  }
  return value
}

function makeWorkspaceState(fixture: LocalFixture): OrgDirectoryState {
  return {
    employees: fixture.scenarios.map((scenario) => ({
      id: scenario.employeeId,
      name: scenario.label,
      status: scenario.employeeStatus,
      departmentIds: [],
      primaryAssignmentId: null,
      administrativeApproverOverrideEmployeeId: null,
    })),
    departments: [],
    roles: [],
    positions: [],
    assignments: [],
    members: [],
    roleCombinationRiskRules: [],
    organizationLevels: createDefaultOrganizationLevels(),
    organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
    duties: [],
    dutyPositionRelations: [],
    processes: [],
    processNodes: [],
    processEdges: [],
    processNodeDutyLinks: [],
  }
}

function ownerRoleCatalogForFixture(
  applicationId: OwnerApplicationId,
  roles: Array<{
    stableRoleId: string
    roleDefinitionHash: string
    subjectKind: 'employee' | 'principal'
    assignable: boolean
    allowedScopeKinds: string[]
  }>,
  grants: LocalGrant[],
): OwnerRoleCatalog | undefined {
  if (!grants.length) return undefined
  const catalogVersion = grants[0].catalogVersion
  const catalogSha256 = grants[0].catalogSha256
  if (grants.some((grant) =>
    grant.catalogVersion !== catalogVersion || grant.catalogSha256 !== catalogSha256)) {
    return fail('fixture_owner_catalog_version_inconsistent')
  }
  return {
    applicationId,
    contractVersion: applicationId === 'orgmaster'
      ? 'orgmaster.local-role-catalog.v1'
      : 'jenfu.application-role-catalog.v1',
    catalogVersion,
    catalogSha256,
    sourceSha256: catalogSha256,
    roles: roles.map((role) => ({ ...role })),
  }
}

function policyRoleCatalog(version: GovernanceAssignmentVersionV3) {
  return localOrgmasterRoleCatalog(version as unknown as Record<string, unknown>).roles.map((role) => ({
    stableRoleId: role.stableRoleId,
    roleDefinitionHash: role.roleDefinitionHash,
    subjectKind: role.subjectKind,
    assignable: role.assignable,
    allowedScopeKinds: [...role.allowedScopeKinds],
  }))
}

function roleForGrant(
  grant: LocalGrant,
  scenario: LocalScenario,
  policy: GovernancePolicyDataV3,
  pdm: ExternalRoleCatalogSnapshotV1,
  pdmReadback: LocalPrincipalSandboxPdmV7Readback,
  fms: LocalPrincipalSandboxFmsCatalogPin,
) {
  if (grant.applicationId === 'orgmaster') {
    const role = policy.applicationRoles.find((candidate) =>
      candidate.applicationId === 'orgmaster' && candidate.id === grant.stableRoleId)
    if (!role) return fail('fixture_orgmaster_role_missing_from_native_bundle')
    const catalog = policyRoleCatalog({
      kind: 'assignment-governance-v3',
      id: 'pending-local-publication',
      versionNumber: 1,
      publishedAt: '',
      publishedByPrincipalId: LOCAL_FIXTURE_PUBLISHER,
      publishReason: '',
      snapshotHash: '0'.repeat(64),
      hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT,
      effectState: 'not-synchronized',
      policy,
      externalRoleCatalogs: [],
      organizationSnapshot: {
        workspaceVersionId: 'pending',
        workspaceRevision: 'pending',
        capturedAt: '',
        employees: [],
        departments: [],
        organizationRoles: [],
        positions: [],
        assignments: [],
      },
    }).find((candidate) => candidate.stableRoleId === role.id)
    if (!catalog || catalog.roleDefinitionHash !== grant.roleDefinitionHash ||
      !catalog.allowedScopeKinds.some((scopeKind) => scopeKind === grant.scopeKind)) {
      return fail('fixture_orgmaster_role_does_not_match_native_bundle')
    }
    return {
      roleId: role.id,
      roleCode: role.code,
      roleName: role.name,
      roleSubjectKind: catalog.subjectKind,
      catalogVersion: null,
      effectState: 'orgmaster-enforced' as const,
    }
  }

  const externalCatalog = grant.applicationId === 'ai-pdm' ? pdm : fms
  const role = externalCatalog.roles.find((candidate) =>
    candidate.stableRoleId === grant.stableRoleId)
  const roleDefinitionHash = grant.applicationId === 'ai-pdm'
    ? pdmReadback.roles.find((candidate) => candidate.stableRoleId === grant.stableRoleId)?.roleDefinitionHash
    : role?.roleDefinitionHash
  if (!role || !role.assignable || role.status !== 'active') {
    return fail('fixture_external_role_unavailable_in_owner_pin')
  }
  if (roleDefinitionHash !== grant.roleDefinitionHash) {
    return fail('fixture_external_role_definition_hash_mismatch')
  }
  if (grant.catalogVersion !== externalCatalog.catalogVersion) {
    return fail('fixture_external_catalog_version_mismatch')
  }
  if (grant.catalogSha256 !== (grant.applicationId === 'ai-pdm'
    ? pdmReadback.catalogSha256
    : fms.contentSha256)) {
    return fail('fixture_external_catalog_hash_mismatch')
  }
  if (!role.allowedScopeKinds.includes(grant.scopeKind as GovernanceScopeV1['kind'])) {
    return fail('fixture_external_role_scope_mismatch')
  }

  if (grant.applicationId === 'ai-pdm' &&
    (role.subjectKind !== (scenario.accountType === 'human_privileged' ? 'principal' : 'employee') ||
      role.code === 'system_admin' &&
        (scenario.accountType !== 'human_privileged' || grant.scopeKind !== 'global' || grant.scopeRef !== null))) {
    return fail('fixture_pdm_subject_contract_invalid')
  }

  return {
    roleId: role.stableRoleId,
    roleCode: role.code,
    roleName: role.displayName,
    roleSubjectKind: role.subjectKind ?? 'employee',
    catalogVersion: externalCatalog.catalogVersion,
    effectState: 'not-synchronized' as const,
  }
}

function nativeRoleAssignment(
  grant: LocalGrant,
  scenario: LocalScenario,
  resolvedRole: ReturnType<typeof roleForGrant>,
): GovernanceDocumentV3['draft']['roleAssignments'][number] {
  const subjectKind = resolvedRole.roleSubjectKind
  const isSystemAdmin = grant.applicationId === 'ai-pdm' &&
    grant.stableRoleId === 'role-system-admin'
  if (isSystemAdmin && (subjectKind !== 'principal' || scenario.accountType !== 'human_privileged')) {
    return fail('fixture_system_admin_principal_binding_invalid')
  }
  const scope = grant.scopeKind === 'global'
    ? { kind: 'global' as const }
    : { kind: grant.scopeKind as 'workspace' | 'department' | 'project' | 'product', value: grant.scopeRef! }
  return {
    id: 'local-assignment-' + scenario.scenarioId + '-' + grant.applicationId + '-' +
      grant.stableRoleId,
    employeeId: scenario.employeeId,
    applicationId: grant.applicationId,
    roleId: resolvedRole.roleId,
    roleCodeSnapshot: resolvedRole.roleCode,
    roleNameSnapshot: resolvedRole.roleName,
    catalogVersion: resolvedRole.catalogVersion,
    scope,
    status: grant.status,
    validFrom: grant.validFrom,
    validTo: grant.validUntil,
    effectState: resolvedRole.effectState,
    basis: 'manual',
    subjectKind,
    targetPrincipalId: subjectKind === 'principal' ? scenario.principalId : null,
    sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: LOCAL_FIXTURE_PUBLISHER,
    createdReason: 'DEV-060 local principal sandbox fixture',
  }
}

function syntheticIdentityContentDigest(fixture: LocalFixture): string {
  return publicationSnapshotHash({
    contractVersion: LOCAL_PRINCIPAL_NATIVE_FIXTURE_VERSION,
    fixtureVersion: fixture.fixtureVersion,
    scenarios: fixture.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      principalId: scenario.principalId,
      employeeId: scenario.employeeId,
      identityIssuer: scenario.identityIssuer,
      identitySubject: scenario.identitySubject,
      accountType: scenario.accountType,
      principalStatus: scenario.principalStatus,
      employeeStatus: scenario.employeeStatus,
    })),
  })
}

function buildAdmission(scenario: LocalScenario, activeLink: boolean, recordedAt: string, identityContentDigest: string) {
  if (!activeLink) return null
  return {
    id: 'local-admission-' + scenario.scenarioId,
    principalFingerprintSha256: principalFingerprintSha256(
      scenario.identityIssuer,
      scenario.identitySubject,
    ),
    issuerFingerprintSha256: issuerFingerprintSha256(scenario.identityIssuer),
    accountType: scenario.accountType,
    identityLinkId: 'local-identity-' + scenario.scenarioId,
    sharedRetirementState: 'not_applicable' as const,
    status: 'active' as const,
    recordedAt,
    evidenceRefSha256: identityContentDigest,
  }
}

function rebindOrgmasterFixture(
  fixture: LocalFixture,
  catalog: ReturnType<typeof localOrgmasterRoleCatalog>,
): {
  effectiveFixture: LocalFixture
  normalizationChanges: LocalPrincipalSandboxNativeFixtureArtifactSet['normalizationChanges']
} {
  const changes: NonNullable<LocalPrincipalSandboxNativeFixtureArtifactSet['normalizationChanges'][number]>[] = []
  const scenarios = fixture.scenarios.map((scenario) => ({
    ...scenario,
    grants: scenario.grants.map((grant) => {
      if (grant.applicationId !== 'orgmaster') return grant
      const role = catalog.roles.find((candidate) => candidate.stableRoleId === grant.stableRoleId)
      if (!role) return fail('fixture_orgmaster_role_missing_from_published_bundle')
      const effective = {
        catalogVersion: catalog.catalogVersion,
        catalogSha256: catalog.catalogSha256,
        roleDefinitionHash: role.roleDefinitionHash,
      }
      const previous = {
        catalogVersion: grant.catalogVersion,
        catalogSha256: grant.catalogSha256,
        roleDefinitionHash: grant.roleDefinitionHash,
      }
      if (previous.catalogVersion !== effective.catalogVersion ||
        previous.catalogSha256 !== effective.catalogSha256 ||
        previous.roleDefinitionHash !== effective.roleDefinitionHash) {
        changes.push({
          scenarioId: scenario.scenarioId,
          applicationId: 'orgmaster',
          stableRoleId: grant.stableRoleId,
          reason: 'bound_to_native_published_version',
          previous,
          effective,
        })
      }
      return { ...grant, ...effective }
    }),
  }))
  const payload = {
    contractVersion: fixture.contractVersion,
    fixtureVersion: fixture.fixtureVersion,
    scenarios,
  }
  const effectiveFixture = assertFixtureEnvelope({
    ...payload,
    fixtureHash: contractDigest(payload),
  })
  return {
    effectiveFixture,
    normalizationChanges: Object.freeze(changes.map((change) => Object.freeze(change))),
  }
}

function validateOwnerFixture(
  fixture: LocalFixture,
  pdmCatalog: ExternalRoleCatalogSnapshotV1,
  fmsCatalog: LocalPrincipalSandboxFmsCatalogPin,
  orgRoles: ReturnType<typeof policyRoleCatalog>,
) {
  const all = fixture.scenarios.flatMap((scenario) => scenario.grants)
  const orgGrants = all.filter((grant) => grant.applicationId === 'orgmaster')
  const fmsGrants = all.filter((grant) =>
    grant.applicationId === 'financial-management-system')
  const nativeOrgRoles = ownerRoleCatalogForFixture('orgmaster', orgRoles, orgGrants)
  const nativeFmsRoles = ownerRoleCatalogForFixture('financial-management-system',
    fmsCatalog.roles.map((role) => ({
      stableRoleId: role.stableRoleId,
      roleDefinitionHash: role.roleDefinitionHash ?? '',
      subjectKind: role.subjectKind ?? 'employee',
      assignable: role.assignable,
      allowedScopeKinds: role.allowedScopeKinds,
    })), fmsGrants)
  const ownerRoleDefinitions: Partial<Record<OwnerApplicationId, OwnerRoleCatalog>> = {
    ...(nativeOrgRoles ? { orgmaster: nativeOrgRoles } : {}),
    ...(nativeFmsRoles ? { 'financial-management-system': nativeFmsRoles } : {}),
  }
  try {
    return validateLocalPrincipalSandboxFixture(fixture, {
      catalogSource: readAiPdmRoleCatalogV7(),
      ownerRoleDefinitions,
    })
  } catch {
    if (fmsGrants.length && !nativeFmsRoles) {
      return fail('fixture_fms_role_catalog_pin_missing')
    }
    throw new LocalPrincipalSandboxNativeFixtureError('local_fixture_invalid')
  }
}

function activePolicy(version: GovernanceAssignmentVersionV3) {
  return {
    ...version.policy,
    basePolicyVersionId: version.id,
    updatedAt: version.publishedAt,
  }
}

function isWithin(parent: string, candidate: string) {
  const pathFromParent = relative(parent, candidate)
  return pathFromParent === '' ||
    (pathFromParent !== '..' &&
      !pathFromParent.startsWith('..' + sep) &&
      !isAbsolute(pathFromParent))
}

function assertTargetRoot(targetRoot: string) {
  if (typeof targetRoot !== 'string' || !targetRoot.trim() || !isAbsolute(targetRoot)) {
    return fail('native_fixture_target_root_must_be_absolute')
  }
  const target = resolve(targetRoot)
  if (isWithin(REPOSITORY_ROOT, target) || isWithin(target, REPOSITORY_ROOT)) {
    return fail('native_fixture_target_root_must_be_isolated')
  }
  return target
}

function artifact(
  targetRoot: string,
  artifactKey: string,
  artifactKind: PersistenceArtifactWrite['artifactKind'],
  relativePath: string,
  payload: object,
): PersistenceArtifactWrite {
  const raw = JSON.stringify(payload, null, 2) + '\n'
  return {
    artifactKey,
    artifactKind,
    localPath: resolve(targetRoot, relativePath),
    payload: payload as Record<string, unknown>,
    raw,
    expectedRevision: null,
  }
}

/**
 * Builds an owner-native, three-artifact OrgMaster seed entirely in memory.
 * It never opens a database or creates files; the returned changes are shaped
 * for the existing writePersistenceArtifacts owner entry point.
 */
function materializeLocalPrincipalSandboxNativeFixtureCore(
  input: LocalPrincipalSandboxNativeFixtureInput,
  options: { bindPublicationAudit: boolean },
): LocalPrincipalSandboxNativeFixtureArtifactSet {
  if (!input || !input.fixture) fail('native_fixture_input_required')
  const fixture = assertFixtureEnvelope(input.fixture)
  if (!input.pdmCatalogReadback) {
    throw new LocalPrincipalSandboxNativeFixtureError(
      'pdm_v7_database_readback_required',
      ['pdmCatalogReadback'],
    )
  }
  if (!input.fmsCatalogPin) {
    throw new LocalPrincipalSandboxNativeFixtureError(
      'fms_active_application_catalog_pin_required',
      ['fmsCatalogPin'],
    )
  }
  if (!SANDBOX_ID.test(input.sandboxId ?? '') ||
    ('jenfu_local_' + input.sandboxId.replaceAll('-', '_')).length > 63) {
    fail('native_fixture_sandbox_id_invalid')
  }
  const targetRoot = assertTargetRoot(input.targetRoot)
  const createdAt = canonicalInstant(input.createdAt ?? '2026-10-29T00:00:00.000Z')
  const pdmReadback = input.pdmCatalogReadback
  const pdmCatalog = confirmPdmReadback(pdmReadback)
  const fmsCatalog = confirmFmsCatalogPin(input.fmsCatalogPin)

  const workspaceVersionId = 'current-local-' + input.sandboxId
  const workspaceManifest = createWorkspaceManifest(workspaceVersionId, createdAt)
  const manifestValidation = validateWorkspaceManifest(workspaceManifest)
  if (!manifestValidation.ok) fail('native_workspace_manifest_invalid')

  const rawWorkspaceState = makeWorkspaceState(fixture)
  const currentVersion = createOrgDocumentFile(rawWorkspaceState, 'document', createdAt)
  const parsedWorkspace = parseOrgDocument(currentVersion)
  if (!parsedWorkspace.ok ||
    parsedWorkspace.document.state.employees.length !== fixture.scenarios.length ||
    parsedWorkspace.document.state.employees.some((employee) =>
      !fixture.scenarios.some((scenario) => scenario.employeeId === employee.id))) {
    fail('native_workspace_version_invalid')
  }
  const workspaceRevision = publicationSnapshotHash(currentVersion)
  const governanceSource: GovernanceOrgSource = {
    workspaceVersionId,
    workspaceRevision,
    sourceDataAt: createdAt,
    state: {
      employees: parsedWorkspace.document.state.employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        status: employee.status,
        primaryAssignmentId: employee.primaryAssignmentId,
      })),
      departments: [],
      roles: [],
      positions: [],
      assignments: [],
    },
  }

  const v2Seed = createSeedDocumentV2(createdAt, pdmCatalog)
  v2Seed.draft.applications.push({
    id: 'financial-management-system',
    name: 'Financial Management System',
    status: 'active',
  })
  const baseV3 = migrateGovernanceV2ToV3(
    v2Seed,
    workspaceRevision,
    pdmCatalog,
    createdAt,
  )
  const initialPolicy = baseV3.draft as GovernancePolicyDataV3
  const preliminaryVersion = {
    kind: 'assignment-governance-v3' as const,
    id: 'pending-local-publication',
    versionNumber: 1,
    publishedAt: createdAt,
    publishedByPrincipalId: LOCAL_FIXTURE_PUBLISHER,
    publishReason: 'DEV-060 local principal sandbox fixture',
    snapshotHash: '0'.repeat(64),
    hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT,
    effectState: 'not-synchronized' as const,
    policy: initialPolicy,
    externalRoleCatalogs: [pdmCatalog, fmsCatalog],
    organizationSnapshot: buildOrganizationSnapshot(governanceSource, createdAt),
  }
  const orgRoles = policyRoleCatalog(preliminaryVersion)
  validateOwnerFixture(fixture, pdmCatalog, fmsCatalog, orgRoles)

  const identityLinks = fixture.scenarios.map((scenario) => {
    const active = scenario.principalStatus === 'active' &&
      scenario.employeeStatus === 'active'
    return {
      id: 'local-identity-' + scenario.scenarioId,
      principalId: scenario.principalId,
      issuer: scenario.identityIssuer,
      subject: scenario.identitySubject,
      employeeId: scenario.employeeId,
      status: active ? 'active' as const : 'inactive' as const,
      validFrom: createdAt,
      validTo: null,
    }
  })
  const identityContentDigest = syntheticIdentityContentDigest(fixture)
  const admissions = fixture.scenarios.flatMap((scenario) => {
    const active = scenario.principalStatus === 'active' &&
      scenario.employeeStatus === 'active'
    const admission = buildAdmission(scenario, active, createdAt, identityContentDigest)
    return admission ? [admission] : []
  })
  const allAssignments = fixture.scenarios.flatMap((scenario) =>
    scenario.grants.map((grant) => nativeRoleAssignment(
      grant,
      scenario,
      roleForGrant(grant, scenario, initialPolicy, pdmCatalog, pdmReadback, fmsCatalog),
    )))
  const policy: GovernancePolicyDataV3 = {
    ...initialPolicy,
    identityLinks,
    principalAdmissions: admissions,
    roleAssignments: allAssignments,
  }

  const versionPayload = {
    kind: 'assignment-governance-v3' as const,
    policy,
    externalRoleCatalogs: [pdmCatalog, fmsCatalog],
    organizationSnapshot: buildOrganizationSnapshot(governanceSource, createdAt),
    effectState: 'not-synchronized' as const,
  }
  const versionId = 'assignment-policy-local-' + input.sandboxId
  const version: GovernanceAssignmentVersionV3 = {
    ...versionPayload,
    id: versionId,
    versionNumber: 1,
    publishedAt: createdAt,
    publishedByPrincipalId: LOCAL_FIXTURE_PUBLISHER,
    publishReason: 'DEV-060 local principal sandbox fixture',
    hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT,
    snapshotHash: publicationSnapshotHash(versionPayload),
  }
  const finalOrgRoleCatalog = localOrgmasterRoleCatalog(version as unknown as Record<string, unknown>)
  const finalOrgRoles = policyRoleCatalog(version)
  if (finalOrgRoleCatalog.roles.some((role) =>
    !finalOrgRoles.some((candidate) => candidate.stableRoleId === role.stableRoleId &&
      candidate.roleDefinitionHash === role.roleDefinitionHash)) ||
    finalOrgRoleCatalog.roles.some((role) =>
      !orgRoles.some((candidate) => candidate.stableRoleId === role.stableRoleId &&
        candidate.roleDefinitionHash === role.roleDefinitionHash))) {
    fail('orgmaster_role_bundle_changed_during_publication_hashing')
  }
  const { effectiveFixture, normalizationChanges } = rebindOrgmasterFixture(
    fixture,
    finalOrgRoleCatalog,
  )
  validateOwnerFixture(effectiveFixture, pdmCatalog, fmsCatalog, finalOrgRoles)
  const documentBase: GovernanceDocumentV3 = {
    ...baseV3,
    draft: activePolicy(version),
    activePolicyVersionId: version.id,
    publishedVersions: [version],
  }
  const publicationActor: GovernanceActorContext = {
    principalId: LOCAL_FIXTURE_PUBLISHER,
    issuer: 'urn:jenfu:local-principal-sandbox:native-fixture',
    subject: input.sandboxId,
    employeeId: null,
    bootstrap: true,
  }
  const document = options.bindPublicationAudit
    ? appendGovernanceAudit(documentBase,
      { commandId: `local-native-fixture-publish-${input.sandboxId}`,
        reason: 'DEV-060 local principal sandbox native fixture publication', type: 'PUBLISH_ASSIGNMENTS' },
      publicationActor,
      { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: version.id,
        beforeHash: null, afterHash: version.snapshotHash,
        commandHashFormat: GOVERNANCE_COMMAND_HASH_FORMAT,
        commandResult: { operation: 'PUBLISH_ASSIGNMENTS', outcome: 'published', entityType: 'assignmentVersion',
          entityId: version.id, versionId: version.id },
        auditEventId: `audit-local-native-fixture-publish-${input.sandboxId}` },
      createdAt)
    : documentBase
  const governanceIssues = validateDocumentV3(document, governanceSource, [
    pdmCatalog,
    fmsCatalog,
  ])
  if (governanceIssues.length) {
    throw new LocalPrincipalSandboxNativeFixtureError(
      'native_governance_validation_failed:' +
        governanceIssues.map((issue) => issue.code).join(','),
    )
  }

  if (publicationSnapshotHash(currentVersion) !== workspaceRevision) {
    fail('native_workspace_revision_mismatch')
  }
  const databaseName = 'jenfu_local_' + input.sandboxId.replaceAll('-', '_')
  const persistenceArtifacts = [
    artifact(targetRoot, 'orgmaster-versions/' + workspaceVersionId + '.json',
      'workspace-version',
      'data/orgmaster-versions/' + workspaceVersionId + '.json',
      currentVersion),
    artifact(targetRoot, 'orgmaster-workspace.v1.json',
      'workspace-manifest',
      'data/orgmaster-workspace.v1.json',
      workspaceManifest),
    artifact(targetRoot, 'orgmaster-governance.v3.json',
      'governance',
      'data/orgmaster-governance.v3.json',
      document),
  ]

  const companyProjection = fixture.scenarios.flatMap((scenario) =>
    scenario.grants.map((grant) => ({
      scenarioId: scenario.scenarioId,
      applicationId: grant.applicationId,
      fixtureCompanyId: grant.companyId,
      nativeCompanyId: grant.applicationId === 'ai-pdm'
        ? LOCAL_SANDBOX_COMPANY_ID
        : grant.companyId,
      representableInNativeAssignment: grant.applicationId !== 'ai-pdm' ||
        grant.companyId === LOCAL_SANDBOX_COMPANY_ID,
    })))
  const projectionGaps = companyProjection.flatMap((projection) =>
    projection.applicationId === 'ai-pdm' && !projection.representableInNativeAssignment
      ? [{
        scenarioId: projection.scenarioId,
        applicationId: 'ai-pdm' as const,
        code: 'company_id_is_projected_from_native_company_context' as const,
        fixtureCompanyId: projection.fixtureCompanyId,
        nativeCompanyId: projection.nativeCompanyId,
      }]
      : [])

  return Object.freeze({
    contractVersion: LOCAL_PRINCIPAL_NATIVE_FIXTURE_VERSION,
    status: 'materialized-in-memory',
    seedable: true,
    sandboxId: input.sandboxId,
    databaseName,
    fixtureVersion: fixture.fixtureVersion,
    fixtureHash: effectiveFixture.fixtureHash,
    inputFixtureHash: fixture.fixtureHash,
    effectiveFixture,
    normalizationChanges,
    workspace: Object.freeze({
      manifest: workspaceManifest,
      currentVersionId: workspaceVersionId,
      currentVersion,
      currentVersionRevision: workspaceRevision,
    }),
    governance: document,
    governanceVersion: version,
    orgmasterRoleCatalog: finalOrgRoleCatalog,
    governanceSource,
    persistenceArtifacts: Object.freeze(persistenceArtifacts),
    companyProjection: Object.freeze(companyProjection),
    projectionGaps: Object.freeze(projectionGaps),
    inputReadbacks: Object.freeze({
      pdmSourcePath: pdmReadback.sourcePath,
      pdmCatalogVersion: pdmReadback.catalogVersion,
      pdmCatalogSha256: pdmReadback.catalogSha256,
      fmsCatalogVersion: fmsCatalog.catalogVersion,
      fmsContentSha256: fmsCatalog.contentSha256,
      fmsArtifactSha256: fmsCatalog.artifactSha256,
    }),
  })
}

/** Build the current owner-native fixture with a hash-chained publication event. */
export function materializeLocalPrincipalSandboxNativeFixture(
  input: LocalPrincipalSandboxNativeFixtureInput,
): LocalPrincipalSandboxNativeFixtureArtifactSet {
  return materializeLocalPrincipalSandboxNativeFixtureCore(input, { bindPublicationAudit: true })
}

/** Exact legacy output is reserved for verifying already-existing pre-audit native seed batches. */
export function materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(
  input: LocalPrincipalSandboxNativeFixtureInput,
): LocalPrincipalSandboxNativeFixtureArtifactSet {
  return materializeLocalPrincipalSandboxNativeFixtureCore(input, { bindPublicationAudit: false })
}
