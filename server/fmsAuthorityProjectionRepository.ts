import type { OrgmasterDatabase } from './orgmasterDatabase'

export const FMS_AUTHORITY_CONTRACT_VERSION = 'jenfu.orgmaster.fms-authority.v1' as const
export const FMS_AUTHORITY_MANIFEST_HASH = 'abdbcf13cdaea492a8e506d274800b74e2336dafd38be221efa1f4b14d28c6c2' as const
export const FMS_AUTHORITY_VIEW = 'orgmaster_contract.v_fms_authority_v1' as const
export const FMS_CANDIDATE_VIEW = 'orgmaster_contract.v_fms_principal_candidates_v1' as const

export type FmsAuthorityProjectionRow = {
  contract_version: string
  manifest_hash: string
  application_id: string
  principal_id: string
  employee_id: string
  principal_binding_version: string
  read_at: Date | string
  governance_revision: string
  assignment_version: string
  workspace_version_id: string
  workspace_revision: string
  catalog_version: string
  catalog_content_sha256: string
  catalog_artifact_sha256: string
  assignments: unknown
  protected_grants: unknown
}

export type FmsPrincipalCandidateProjectionRow = {
  contract_version: string
  manifest_hash: string
  application_id: string
  principal_id: string
  employee_id: string
  principal_binding_version: string
  governance_revision: string
  assignment_version: string
  workspace_version_id: string
  workspace_revision: string
  catalog_version: string
  catalog_content_sha256: string
  catalog_artifact_sha256: string
  assignment_id: string
  stable_role_id: string
  scope_kind: string
  scope_key: string
  valid_from: Date | string
  valid_until: Date | string | null
  source_assignment_id: string
  authoring_catalog_version: string | null
  authoring_catalog_sha256: string | null
}

export type FmsAuthorityWire = {
  contractVersion: typeof FMS_AUTHORITY_CONTRACT_VERSION
  manifestHash: string
  applicationId: 'financial-management-system'
  principalId: string
  employeeId: string
  principalBindingVersion: string
  readAt: string
  governanceRevision: string
  assignmentVersion: string
  workspaceVersionId: string
  workspaceRevision: string
  activeCatalog: { version: string; contentSha256: string; artifactSha256: string }
  assignments: unknown[]
  protectedGrants: unknown[]
}

export class FmsAuthorityProjectionError extends Error {
  constructor(readonly code: 'authority_unavailable' | 'authority_contract_mismatch' | 'authority_not_found') {
    super(code)
    this.name = 'FmsAuthorityProjectionError'
  }
}

function iso(value: Date | string) { return new Date(value).toISOString() }

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  const row = value as Record<string, unknown>
  const actual = Object.keys(row).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  return row
}

function requiredText(value: unknown) { return typeof value === 'string' && value.trim().length > 0 }
function optionalInstant(value: unknown) { return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value))) }

function assertAssignments(value: unknown) {
  if (!Array.isArray(value)) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  for (const item of value) {
    const row = exactRecord(item, ['principalId', 'employeeId', 'assignmentId', 'stableRoleId', 'scope', 'validFrom', 'validUntil', 'revokedAt', 'catalogVersion', 'catalogSha256', 'assignmentVersion', 'sourceAssignmentId', 'authoringCatalogVersion', 'authoringCatalogSha256'])
    const scope = exactRecord(row.scope, ['kind', 'key'])
    if (![row.principalId, row.employeeId, row.assignmentId, row.stableRoleId, row.validFrom, row.catalogVersion, row.assignmentVersion, row.sourceAssignmentId, row.authoringCatalogVersion].every(requiredText)
      || scope.kind !== 'workspace' || scope.key !== 'company-jenfu' || row.revokedAt !== null || !optionalInstant(row.validUntil)
      || !/^[a-f0-9]{64}$/u.test(String(row.catalogSha256)) || !/^[a-f0-9]{64}$/u.test(String(row.authoringCatalogSha256))) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  }
}

function assertProtectedGrants(value: unknown) {
  if (!Array.isArray(value)) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  for (const item of value) {
    const row = exactRecord(item, ['grantId', 'applicationId', 'principalId', 'operation', 'revision', 'validFrom', 'validUntil'])
    if (![row.grantId, row.principalId, row.operation, row.revision, row.validFrom].every(requiredText)
      || row.applicationId !== 'financial-management-system' || !optionalInstant(row.validUntil)) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  }
}

function assertAuthorityRow(row: FmsAuthorityProjectionRow) {
  if (row.contract_version !== FMS_AUTHORITY_CONTRACT_VERSION || row.manifest_hash !== FMS_AUTHORITY_MANIFEST_HASH || row.application_id !== 'financial-management-system' || !row.principal_id || !row.employee_id || !row.principal_binding_version || !row.assignment_version || !row.workspace_version_id || !/^[a-f0-9]{64}$/u.test(row.workspace_revision) || !row.catalog_version || !/^[a-f0-9]{64}$/u.test(row.governance_revision) || !/^[a-f0-9]{64}$/u.test(row.catalog_content_sha256) || !/^[a-f0-9]{64}$/u.test(row.catalog_artifact_sha256)) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
  assertAssignments(row.assignments)
  assertProtectedGrants(row.protected_grants)
}

export function createFmsAuthorityProjectionRepository(database: Pick<OrgmasterDatabase, 'query'>) {
  return {
    async readAuthority(principalId: string, applicationId = 'financial-management-system'): Promise<FmsAuthorityProjectionRow> {
      try {
        const result = await database.query<FmsAuthorityProjectionRow>(`SELECT contract_version, manifest_hash, application_id, principal_id, employee_id, principal_binding_version, read_at, governance_revision, assignment_version, workspace_version_id, workspace_revision, catalog_version, catalog_content_sha256, catalog_artifact_sha256, assignments, protected_grants FROM ${FMS_AUTHORITY_VIEW} WHERE principal_id = $1 AND application_id = $2`, [principalId, applicationId])
        if (result.rows.length !== 1) throw new FmsAuthorityProjectionError('authority_not_found')
        const row = result.rows[0]
        assertAuthorityRow(row)
        return row
      } catch (error) {
        if (error instanceof FmsAuthorityProjectionError) throw error
        throw new FmsAuthorityProjectionError('authority_unavailable')
      }
    },
    async readCandidates(applicationId = 'financial-management-system'): Promise<FmsPrincipalCandidateProjectionRow[]> {
      try {
        const result = await database.query<FmsPrincipalCandidateProjectionRow>(`SELECT contract_version, manifest_hash, application_id, principal_id, employee_id, principal_binding_version, governance_revision, assignment_version, workspace_version_id, workspace_revision, catalog_version, catalog_content_sha256, catalog_artifact_sha256, assignment_id, stable_role_id, scope_kind, scope_key, valid_from, valid_until, source_assignment_id, authoring_catalog_version, authoring_catalog_sha256 FROM ${FMS_CANDIDATE_VIEW} WHERE application_id = $1 ORDER BY principal_id, assignment_id`, [applicationId])
        if (result.rows.some((row) => row.contract_version !== FMS_AUTHORITY_CONTRACT_VERSION || row.manifest_hash !== FMS_AUTHORITY_MANIFEST_HASH || row.application_id !== applicationId || !row.principal_id || !row.employee_id || !row.principal_binding_version || !row.assignment_version || !row.workspace_version_id || !/^[a-f0-9]{64}$/u.test(row.workspace_revision) || !/^[a-f0-9]{64}$/u.test(row.governance_revision) || !row.catalog_version || !/^[a-f0-9]{64}$/u.test(row.catalog_content_sha256) || !/^[a-f0-9]{64}$/u.test(row.catalog_artifact_sha256) || !row.assignment_id || !row.stable_role_id || row.scope_kind !== 'workspace' || row.scope_key !== 'company-jenfu' || !row.source_assignment_id || !row.authoring_catalog_version || !/^[a-f0-9]{64}$/u.test(row.authoring_catalog_sha256 ?? '') || !Number.isFinite(new Date(row.valid_from).getTime()) || (row.valid_until !== null && !Number.isFinite(new Date(row.valid_until).getTime())))) throw new FmsAuthorityProjectionError('authority_contract_mismatch')
        return result.rows
      } catch (error) {
        if (error instanceof FmsAuthorityProjectionError) throw error
        throw new FmsAuthorityProjectionError('authority_unavailable')
      }
    },
  }
}

export function normalizeFmsAuthorityRow(row: FmsAuthorityProjectionRow): FmsAuthorityWire {
  assertAuthorityRow(row)
  return {
    contractVersion: row.contract_version,
    manifestHash: row.manifest_hash,
    applicationId: row.application_id,
    principalId: row.principal_id,
    employeeId: row.employee_id,
    principalBindingVersion: row.principal_binding_version,
    readAt: iso(row.read_at),
    governanceRevision: row.governance_revision,
    assignmentVersion: row.assignment_version,
    workspaceVersionId: row.workspace_version_id,
    workspaceRevision: row.workspace_revision,
    activeCatalog: { version: row.catalog_version, contentSha256: row.catalog_content_sha256, artifactSha256: row.catalog_artifact_sha256 },
    assignments: row.assignments,
    protectedGrants: row.protected_grants,
  }
}
