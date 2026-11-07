import { AsyncLocalStorage } from 'node:async_hooks'

const stages = [
  'governance_session_store_read', 'governance_v3_artifact_exists', 'governance_v3_artifact_read',
  'governance_v3_audit_chain_validate', 'governance_workspace_source_read', 'governance_v3_owned_catalog_validate',
  'governance_v3_active_catalog_read', 'governance_v3_catalog_history_read', 'governance_v3_document_validate',
  'governance_system_catalog_sync',
] as const
export type GovernanceSessionReadStage = typeof stages[number]

const errorCodes = new Set<string>([
  'AUDIT_CHAIN_INVALID', 'GOVERNANCE_READ_FAILED', 'GOVERNANCE_V3_MIGRATION_REQUIRED',
  'GOVERNANCE_VALIDATION_FAILED', 'ORGMASTER_SYSTEM_CATALOG_CONFLICT', 'ORGANIZATION_REVISION_CONFLICT',
  'PERSISTENCE_NOT_CONFIGURED', 'PERSISTENCE_ARTIFACT_NOT_FOUND', 'PERSISTENCE_READ_FAILED',
  'PERSISTENCE_WRITE_FAILED', 'REVISION_CONFLICT', 'WORKSPACE_NOT_FOUND', 'WORKSPACE_ENTRY_NOT_FOUND',
  'VERSION_INVALID', 'EMPLOYEE_REKEY_IN_PROGRESS', 'CATALOG_REGISTRY_UNAVAILABLE',
  'CATALOG_APPLICATION_DUPLICATE', 'EXTERNAL_CATALOG_UNAVAILABLE', 'EXTERNAL_CATALOG_INVALID',
  'EXTERNAL_CATALOG_STALE',
])
const issueCodes = new Set<string>([
  'ACTIVE_VERSION_NOT_FOUND', 'ADMINISTRATION_INVALID', 'APPLICATION_NOT_FOUND',
  'ASSIGNMENT_SOURCE_INVALID', 'ASSIGNMENT_SUBJECT_INVALID', 'CATALOG_ROLE_CONTRACT_MISMATCH',
  'DUPLICATE_ACTIVE_ASSIGNMENT', 'EMPLOYEE_NOT_FOUND', 'EXTERNAL_ASSIGNMENT_SNAPSHOT_INVALID',
  'EXTERNAL_CATALOG_INVALID', 'EXTERNAL_CATALOG_STALE', 'EXTERNAL_CATALOG_UNAVAILABLE',
  'EXTERNAL_ROLE_INACTIVE', 'EXTERNAL_ROLE_UNASSIGNABLE', 'EXTERNAL_ROLE_UNKNOWN',
  'EXTERNAL_SCOPE_UNSUPPORTED', 'IDENTITY_CONFLICT', 'INTERNAL_ASSIGNMENT_INVALID',
  'MANAGEMENT_GRANT_PRINCIPAL_INVALID', 'PRIVILEGED_ASSIGNMENT_INVALID',
  'PRIVILEGED_PRINCIPAL_REQUIRED', 'REFERENCE_NOT_FOUND', 'ROLE_DELEGATION_INVALID', 'SCHEMA_UNSUPPORTED',
])

type Failure = { stage: GovernanceSessionReadStage; code: string; issueCodes?: string[] }
const scope = new AsyncLocalStorage<{ failure?: Failure }>()

function classify(stage: GovernanceSessionReadStage, error: unknown): Failure {
  const failure: Failure = { stage: stages.includes(stage) ? stage : 'governance_session_store_read', code: 'UNCLASSIFIED' }
  try {
    if (!error || typeof error !== 'object') return failure
    const candidate = error as { code?: unknown; details?: unknown; issues?: unknown }
    if (typeof candidate.code === 'string' && errorCodes.has(candidate.code)) failure.code = candidate.code
    else if (candidate.code === '42501') failure.code = 'DATABASE_PERMISSION_DENIED'
    const issues = candidate.details ?? candidate.issues
    if (Array.isArray(issues)) {
      const known = new Set<string>()
      for (const issue of issues.slice(0, 16)) {
        const code = issue?.code
        if (typeof code === 'string' && issueCodes.has(code)) known.add(code)
      }
      if (known.size) failure.issueCodes = [...known]
    }
  } catch { /* diagnostic inputs cannot affect the original result */ }
  return failure
}

export function recordGovernanceSessionReadFailure(stage: GovernanceSessionReadStage, error: unknown) {
  const current = scope.getStore()
  if (current && !current.failure) current.failure = classify(stage, error)
}

/** Only a verified, non-sandbox session route establishes this request scope. */
export function withGovernanceSessionReadDiagnostic<T>(read: () => Promise<T>): Promise<T> {
  const current: { failure?: Failure } = {}
  return scope.run(current, async () => {
    try { return await read() } catch (error) {
      const failure = current.failure ?? classify('governance_session_store_read', error)
      try { console.warn(JSON.stringify({ event: 'orgmaster_governance_session_read_failed', ...failure })) }
      catch { /* logging must not alter the original error */ }
      throw error
    }
  })
}
