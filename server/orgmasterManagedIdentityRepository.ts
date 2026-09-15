import type { ManagedDailyIdentityV1, ManagedIdentityReadModelV1, ManagedIdentityRefreshClaimV1, ManagedIdentityRefreshResultV1 } from '../src/managedIdentity/types'
import { deriveManagedUsername } from '../src/managedIdentity/employeeNumber'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { createManagedIdentityStore, type ManagedIdentityStoreV1 } from './orgmasterManagedIdentityStore'

export type ManagedIdentityRepositoryMode = 'local-json' | 'postgresql'

export interface ManagedIdentityRepositoryV1 extends ManagedIdentityStoreV1 {
  readonly mode: ManagedIdentityRepositoryMode
  readEmployeeManagedIdentity(employeeId: string): Promise<ManagedIdentityReadModelV1 | null>
  resolveAuthIdentity(email: string): Promise<{ identity: ManagedDailyIdentityV1; employeeId: string } | null>
  assertEmployeeActivation(employeeId: string, workspaceRevision: string): Promise<{ allowed: boolean; correctionRequired: boolean }>
}

function rowToReadModel(row: Record<string, unknown>): ManagedIdentityReadModelV1 {
  if (row.payload) return row.payload as ManagedIdentityReadModelV1
  const employeeNumber = typeof row.employee_number === 'string' ? row.employee_number : null
  const identityState = String(row.identity_state ?? 'not_linked') as ManagedIdentityReadModelV1['identity']['state']
  return {
    contractVersion: 'orgmaster.managed-identity.v1',
    employee: { id: String(row.employee_id ?? ''), status: row.employee_status === 'inactive' ? 'inactive' : 'active' },
    employeeNumber: { status: employeeNumber ? 'assigned' : 'unassigned', value: employeeNumber, derivedUsername: employeeNumber ? deriveManagedUsername(employeeNumber, 'jenfu.com.tw') : null, revision: null },
    identity: { state: identityState, provider: 'google.com', note: identityState === 'active' ? '已連結公司 Cloud Identity' : identityState === 'directory_linked_pending_auth' ? '已確認 Directory 身分，等待首次 Google 登入' : 'Google Admin 建立後由 OrgMaster 連結', directoryState: (row.directory_state as ManagedIdentityReadModelV1['identity']['directoryState']) ?? 'unknown', primaryEmail: typeof row.primary_email === 'string' ? row.primary_email : null, freshness: (row.freshness as ManagedIdentityReadModelV1['identity']['freshness']) ?? 'unknown' },
    capabilities: { view: true, manageNumber: false, manageLink: false, refresh: false },
    registryRevision: row.registry_revision == null ? null : String(row.registry_revision),
    workspaceRevision: null,
    admissionEnabled: Boolean(row.admission_enabled),
  }
}

export function createPostgresManagedIdentityRepository(database: OrgmasterDatabase): ManagedIdentityRepositoryV1 {
  const run = async <T extends import('pg').QueryResultRow>(sql: string, values: unknown[] = []) => (await database.query<T>(sql, values)).rows
  return {
    mode: 'postgresql',
    async readExisting() { throw new Error('POSTGRES_REPOSITORY_READ_DOCUMENT_UNSUPPORTED') },
    async commit() { throw new Error('POSTGRES_REPOSITORY_COMMIT_UNSUPPORTED') },
    async appendAssignment(employeeId, employeeNumber, actor, expectedRevision, now, expectedWorkspaceRevision) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.assign_employee_number_v1($1,$2,$3,$4,$5,$6)', [employeeId, employeeNumber, actor, expectedWorkspaceRevision ?? null, expectedRevision, now ?? null])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      const row = rows[0]
      return { disposition: String(row.disposition ?? 'applied') as 'applied' | 'noop', assignment: row.assignment as never, document: row.document as never, revision: String(row.revision ?? '') }
    },
    async createCandidate(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [input.employeeId, input.employeeNumber, input.expectedPrimaryEmail, input.directoryCustomerId, input.directoryUserId, input.primaryEmail, input.sourceEtag, input.workspaceRevision, input.registryRevision, input.actor])
      if (rows.length !== 1) throw new Error('DIRECTORY_CANDIDATE_NOT_FOUND')
      return rows[0] as never
    },
    async confirmCandidate(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1($1,$2,$3,$4,$5,$6)', [input.commandId, input.employeeId, input.candidateToken, input.expectedWorkspaceRevision, input.expectedRegistryRevision, input.actor])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return rows[0] as never
    },
    async bindAuth(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1($1,$2,$3,$4,$5)', [input.employeeId, input.issuer, input.subject, input.email, input.commandId ?? null])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return rows[0] as never
    },
    async enqueueRefresh(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.enqueue_managed_identity_refresh_v1($1,$2,$3,$4)', [input.employeeId, input.trigger, input.commandId, input.actor])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return rows[0] as never
    },
    async claimRefresh(workerId, limit = 2, leaseSeconds = 30) {
      const rows = await run<ManagedIdentityRefreshClaimV1>('SELECT * FROM orgmaster_core.claim_managed_identity_refresh_v1($1,$2,$3)', [workerId, limit, leaseSeconds])
      return { claims: rows, document: {} as never, revision: '' }
    },
    async completeRefresh(input) {
      const rows = await run<ManagedIdentityRefreshResultV1>('SELECT * FROM orgmaster_core.complete_managed_identity_refresh_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)', [input.requestId, input.workerId, input.leaseVersion, input.directoryCustomerId, input.directoryUserId, input.directoryState, input.primaryEmail, input.sourceEtag, input.adapterOutcome])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT')
      return rows[0]
    },
    async retryRefresh(input) {
      const rows = await run<ManagedIdentityRefreshResultV1>('SELECT * FROM orgmaster_core.retry_managed_identity_refresh_v1($1,$2,$3,$4)', [input.requestId, input.workerId, input.leaseVersion, input.errorCode])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT')
      return rows[0]
    },
    async resolveAlias(employeeNumber) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.resolve_managed_identity_alias_v1($1)', [employeeNumber])
      if (rows.length !== 1) throw new Error('LOGIN_NOT_AVAILABLE')
      return rows[0] as never
    },
    async setAdmission(enabled, expectedRevision, actor, reasonCode) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,$2,$3,$4)', [expectedRevision, enabled, actor, reasonCode])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return rows[0] as never
    },
    async readEmployeeManagedIdentity(employeeId) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.read_employee_managed_identity_v1($1)', [employeeId])
      return rows.length === 1 ? rowToReadModel(rows[0]) : null
    },
    async resolveAuthIdentity(email) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.resolve_managed_identity_auth_v1($1)', [email])
      if (rows.length !== 1) return null
      const row = rows[0]
      return { employeeId: String(row.employee_id), identity: { identityRecordId: String(row.identity_record_id), identityKind: 'human_daily_managed', employeeId: String(row.employee_id), principalId: String(row.principal_id), directoryCustomerId: String(row.directory_customer_id), directoryUserId: String(row.directory_user_id), lastVerifiedPrimaryEmail: String(row.primary_email ?? email), authIssuer: row.auth_issuer == null ? null : String(row.auth_issuer), authSubject: row.auth_subject == null ? null : String(row.auth_subject), boundAt: null, linkState: String(row.link_state) as ManagedDailyIdentityV1['linkState'], revision: Number(row.revision ?? 1), admissionRevision: row.admission_revision == null ? null : Number(row.admission_revision), admissionChangedAt: null, createdAt: '', createdBy: 'postgres', updatedAt: '', updatedBy: 'postgres' } }
    },
    async assertEmployeeActivation(employeeId, workspaceRevision) {
      const rows = await run<{ allowed: boolean; correction_required: boolean }>('SELECT * FROM orgmaster_core.assert_employee_activation_v1($1,$2)', [employeeId, workspaceRevision])
      return rows.length === 1 ? { allowed: Boolean(rows[0].allowed), correctionRequired: Boolean(rows[0].correction_required) } : { allowed: false, correctionRequired: false }
    },
  }
}

export function createManagedIdentityRepository(input: { root: string; devEnabled: boolean; database?: OrgmasterDatabase }): ManagedIdentityRepositoryV1 {
  if (input.database) return createPostgresManagedIdentityRepository(input.database)
  const store = createManagedIdentityStore(input)
  return Object.assign(store, {
    mode: 'local-json' as const,
    async readEmployeeManagedIdentity() { return null },
    async resolveAuthIdentity(email: string) {
      const current = await store.readExisting()
      const identity = (current.document.managedDailyIdentities ?? []).find((entry) => entry.lastVerifiedPrimaryEmail.toLowerCase() === email.trim().toLowerCase())
      return identity ? { identity, employeeId: identity.employeeId } : null
    },
    async assertEmployeeActivation() { return { allowed: true, correctionRequired: false } },
  })
}
