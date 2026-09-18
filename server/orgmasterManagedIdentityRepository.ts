import type { ManagedDailyIdentityV1, ManagedEmployeeNumberListReadModelV1, ManagedIdentityReadModelV1, ManagedIdentityRefreshClaimV1, ManagedIdentityRefreshResultV1 } from '../src/managedIdentity/types'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { createManagedIdentityStore, type ManagedIdentityAliasResolution, type ManagedIdentityConfirmationRead, type ManagedIdentityStoreV1 } from './orgmasterManagedIdentityStore'
import type { ManagedLoginIdentity } from './orgmasterManagedLoginContract'

export type ManagedIdentityRepositoryMode = 'local-json' | 'postgresql'

export interface ManagedIdentityRepositoryV1 extends ManagedIdentityStoreV1 {
  readonly mode: ManagedIdentityRepositoryMode
  readEmployeeManagedIdentity(employeeId: string): Promise<ManagedIdentityReadModelV1 | null>
  readEmployeeNumbers(employees: Array<{ id: string; name: string }>): Promise<ManagedEmployeeNumberListReadModelV1>
  resolveAuthIdentity(email: string): Promise<{ identity: ManagedDailyIdentityV1; employeeId: string } | null>
  assertEmployeeActivation(employeeId: string, workspaceRevision: string): Promise<{ allowed: boolean; correctionRequired: boolean }>
  reserveDirectoryRead(): Promise<void>
  resolveManagedLoginAlias(employeeNumber: string): Promise<ManagedLoginIdentity | null>
  readManagedLoginIdentity(directoryCustomerId: string, directoryUserId: string): Promise<ManagedLoginIdentity | null>
  readManagedLoginSnapshot(directoryCustomerId: string, directoryUserId: string): Promise<{ identity: ManagedLoginIdentity; primaryEmail: string } | null>
  verifyManagedLoginIdentity(input: { requestId: string; requestHash: string; current: ManagedLoginIdentity; issuer: string; subject: string; actor: string }): Promise<{ identity: ManagedLoginIdentity & { linkState: 'active'; pair: { issuer: string; subject: string } }; mappingVersion: string }>
}

function rowToReadModel(row: Record<string, unknown>): ManagedIdentityReadModelV1 {
  if (row.payload) return row.payload as ManagedIdentityReadModelV1
  const employeeNumber = typeof row.employee_number === 'string' ? row.employee_number : null
  const identityState = String(row.identity_state ?? 'not_linked') as ManagedIdentityReadModelV1['identity']['state']
  return {
    contractVersion: 'orgmaster.managed-identity.v1',
    employee: { id: String(row.employee_id ?? ''), status: row.employee_status === 'inactive' ? 'inactive' : 'active' },
    employeeNumber: { status: employeeNumber ? 'assigned' : 'unassigned', value: employeeNumber, revision: employeeNumber ? Number(row.registry_revision) : null },
    identity: { state: identityState, provider: 'google.com', note: identityState === 'active' ? '已連結公司 Cloud Identity' : identityState === 'directory_linked_pending_auth' ? '已確認 Directory 身分，等待首次 Google 登入' : 'Google Admin 建立後由 OrgMaster 連結', directoryState: (row.directory_state as ManagedIdentityReadModelV1['identity']['directoryState']) ?? 'unknown', primaryEmail: typeof row.primary_email === 'string' ? row.primary_email : null, freshness: (row.freshness as ManagedIdentityReadModelV1['identity']['freshness']) ?? 'unknown' },
    capabilities: { view: true, manageNumber: false, manageLink: false, refresh: false },
    registryRevision: row.registry_revision == null ? null : String(row.registry_revision),
    workspaceRevision: null,
    admissionEnabled: Boolean(row.admission_enabled),
  }
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error('MANAGED_IDENTITY_READ_FAILED')
  return value
}

function dateString(row: Record<string, unknown>, key: string) {
  const value = row[key]
  const parsed = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null
  if (!parsed || !Number.isFinite(parsed.getTime())) throw new Error('MANAGED_IDENTITY_READ_FAILED')
  return parsed.toISOString()
}

function jsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('MANAGED_IDENTITY_READ_FAILED')
  return parsed as Record<string, unknown>
}

function managedLoginIdentityFromRow(row: Record<string, unknown>): ManagedLoginIdentity {
  const linkState = row.link_state
  if (linkState !== 'directory_linked_pending_auth' && linkState !== 'active') throw new Error('MANAGED_LOGIN_READ_FAILED')
  const issuer = row.auth_issuer
  const subject = row.auth_subject
  const pair = issuer === null || issuer === undefined || subject === null || subject === undefined
    ? null
    : { issuer: requiredString(row, 'auth_issuer'), subject: requiredString(row, 'auth_subject') }
  if (linkState === 'active' && pair === null || linkState === 'directory_linked_pending_auth' && pair !== null) throw new Error('MANAGED_LOGIN_READ_FAILED')
  const identityRevision = requiredString(row, 'identity_revision')
  const registryRevision = requiredString(row, 'registry_revision')
  if (!/^[0-9]+$/u.test(identityRevision) || !/^[0-9]+$/u.test(registryRevision)) throw new Error('MANAGED_LOGIN_READ_FAILED')
  return {
    employeeId: requiredString(row, 'employee_id'),
    principalId: requiredString(row, 'principal_id'),
    employeeNumber: requiredString(row, 'employee_number'),
    directoryCustomerId: requiredString(row, 'directory_customer_id'),
    directoryUserId: requiredString(row, 'directory_user_id'),
    identityRecordId: requiredString(row, 'identity_record_id'),
    identityRevision,
    registryRevision,
    linkState,
    pair,
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
      const disposition = row.disposition === 'noop' ? 'noop' : row.disposition === 'applied' ? 'applied' : null
      const assignment = jsonObject(row.assignment)
      const revision = requiredString(row, 'revision')
      if (!disposition || typeof assignment.employee_id !== 'string' || typeof assignment.employee_number !== 'string' || !Number.isSafeInteger(Number(assignment.revision))) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return { disposition, assignment: { employeeId: assignment.employee_id, employeeNumber: assignment.employee_number, revision: Number(assignment.revision), assignedAt: String(assignment.assigned_at ?? ''), assignedBy: String(assignment.assigned_by ?? '') }, revision }
    },
    async createCandidate(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [input.employeeId, input.employeeNumber, input.expectedPrimaryEmail, input.directoryCustomerId, input.directoryUserId, input.primaryEmail, input.sourceEtag, input.workspaceRevision, input.registryRevision, input.actor])
      if (rows.length !== 1) throw new Error('DIRECTORY_CANDIDATE_NOT_FOUND')
      const row = rows[0]
      const token = requiredString(row, 'candidate_token')
      const expiresAt = dateString(row, 'expires_at')
      return { token, expiresAt, workspaceRevision: input.workspaceRevision, registryRevision: input.registryRevision }
    },
    async readCandidateForConfirmation(input) {
      const rows = await run<Record<string, unknown>>('SELECT orgmaster_core.read_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6) AS result', [input.commandId, input.employeeId, input.candidateToken, input.expectedWorkspaceRevision, input.expectedRegistryRevision, input.actor])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_CANDIDATE_INVALID')
      const result = jsonObject(rows[0].result)
      if (result.kind === 'replayed' && typeof result.identityRecordId === 'string' && result.identityRecordId) return { kind: 'replayed', identityRecordId: result.identityRecordId } satisfies ManagedIdentityConfirmationRead
      const snapshot = jsonObject(result.snapshot)
      if (result.kind !== 'candidate' || typeof snapshot.employeeId !== 'string' || typeof snapshot.employeeNumber !== 'string' || typeof snapshot.registryRevision !== 'string' || typeof snapshot.directoryCustomerId !== 'string' || typeof snapshot.directoryUserId !== 'string' || typeof snapshot.primaryEmail !== 'string' || typeof snapshot.expiresAt !== 'string' || !Number.isFinite(Date.parse(snapshot.expiresAt))) throw new Error('MANAGED_IDENTITY_CANDIDATE_INVALID')
      return { kind: 'candidate', snapshot: { employeeId: snapshot.employeeId, employeeNumber: snapshot.employeeNumber, workspaceRevision: typeof snapshot.workspaceRevision === 'string' ? snapshot.workspaceRevision : null, registryRevision: snapshot.registryRevision, directoryCustomerId: snapshot.directoryCustomerId, directoryUserId: snapshot.directoryUserId, primaryEmail: snapshot.primaryEmail, sourceEtag: typeof snapshot.sourceEtag === 'string' ? snapshot.sourceEtag : null, expiresAt: new Date(snapshot.expiresAt).toISOString() } } satisfies ManagedIdentityConfirmationRead
    },
    async confirmCandidate(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1($1,$2,$3,$4,$5,$6)', [input.commandId, input.employeeId, input.candidateToken, input.expectedWorkspaceRevision, input.expectedRegistryRevision, input.actor])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      const row = rows[0]
      return { identityRecordId: requiredString(row, 'identity_record_id'), employeeId: requiredString(row, 'employee_id') }
    },
    async bindAuth(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1($1,$2,$3,$4,$5)', [input.employeeId, input.issuer, input.subject, input.email, input.commandId ?? null])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      const row = rows[0]
      return { identityRecordId: requiredString(row, 'identity_record_id'), employeeId: requiredString(row, 'employee_id') }
    },
    async enqueueRefresh(input) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.enqueue_managed_identity_refresh_v1($1,$2,$3,$4)', [input.employeeId, input.trigger, input.commandId, input.actor])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      const row = rows[0]
      const disposition = row.disposition === 'queued' ? 'queued' : row.disposition === 'deduplicated' ? 'deduplicated' : null
      if (!disposition) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return { disposition, requestId: requiredString(row, 'request_id') }
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
      const row = rows[0]
      const linkState = row.link_state
      if (linkState !== 'directory_linked_pending_auth' && linkState !== 'active') throw new Error('LOGIN_NOT_AVAILABLE')
      return { employeeId: requiredString(row, 'employee_id'), employeeNumber: employeeNumber.trim().toUpperCase(), identityRecordId: requiredString(row, 'identity_record_id'), loginHint: requiredString(row, 'login_hint'), linkState } satisfies ManagedIdentityAliasResolution
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
    async readEmployeeNumbers(employees: Array<{ id: string; name: string }>) {
      const names = new Map(employees.map((employee) => [employee.id, employee.name]))
      const rows = (await Promise.all(employees.map(({ id }) => run<Record<string, unknown>>('SELECT employee_id, employee_number, registry_revision FROM orgmaster_core.read_employee_managed_identity_v1($1)', [id])))).flat()
      const items = rows
        .filter((row) => typeof row.employee_number === 'string' && row.employee_number.trim())
        .map((row) => {
          const employeeId = String(row.employee_id)
          return { employeeId, employeeName: names.get(employeeId) ?? employeeId, employeeNumber: String(row.employee_number), status: 'active' as const }
        })
        .sort((first, second) => second.employeeNumber.localeCompare(first.employeeNumber))
      return {
        contractVersion: 'orgmaster.managed-identity-numbers.v1' as const,
        items,
        registryRevision: rows.reduce<string | null>((latest, row) => row.registry_revision == null ? latest : String(row.registry_revision), null),
      }
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
    async reserveDirectoryRead() {
      const rows = await run<{ allowed: boolean }>('SELECT * FROM orgmaster_core.reserve_managed_directory_read_v1()')
      if (rows.length !== 1 || rows[0].allowed !== true) throw new Error('DIRECTORY_READ_UNAVAILABLE')
    },
    async resolveManagedLoginAlias(employeeNumber) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.resolve_managed_login_alias_v1($1)', [employeeNumber])
      if (rows.length > 1) throw new Error('MANAGED_LOGIN_READ_FAILED')
      return rows.length === 1 ? managedLoginIdentityFromRow(rows[0]) : null
    },
    async readManagedLoginIdentity(directoryCustomerId, directoryUserId) {
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.read_managed_login_identity_v1($1,$2)', [directoryCustomerId, directoryUserId])
      if (rows.length > 1) throw new Error('MANAGED_LOGIN_READ_FAILED')
      return rows.length === 1 ? managedLoginIdentityFromRow(rows[0]) : null
    },
    async readManagedLoginSnapshot(directoryCustomerId, directoryUserId) {
      const rows = await run<Record<string, unknown>>(`
        WITH login AS MATERIALIZED (
          SELECT * FROM orgmaster_core.read_managed_login_identity_v1($1, $2)
        )
        SELECT login.*, detail.primary_email AS snapshot_primary_email
          FROM login
          JOIN LATERAL orgmaster_core.read_employee_managed_identity_v1(login.employee_id) detail ON true
         WHERE detail.employee_id = login.employee_id
           AND detail.employee_status = 'active'
           AND detail.identity_record_id = login.identity_record_id
           AND detail.employee_number = login.employee_number
           AND detail.registry_revision::text = login.registry_revision
           AND detail.admission_enabled = true
           AND detail.primary_email IS NOT NULL
      `, [directoryCustomerId, directoryUserId])
      if (rows.length > 1) throw new Error('MANAGED_LOGIN_READ_FAILED')
      if (rows.length === 0) return null
      const identity = managedLoginIdentityFromRow(rows[0])
      const primaryEmail = rows[0].snapshot_primary_email
      if (typeof primaryEmail !== 'string' || !primaryEmail.trim()) throw new Error('MANAGED_LOGIN_READ_FAILED')
      return { identity, primaryEmail: primaryEmail.trim().toLowerCase() }
    },
    async verifyManagedLoginIdentity(input) {
      const current = input.current
      const rows = await run<Record<string, unknown>>('SELECT * FROM orgmaster_core.verify_managed_login_identity_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [
        input.requestId, input.requestHash, current.directoryCustomerId, current.directoryUserId, input.issuer, input.subject,
        current.employeeId, current.identityRecordId, current.identityRevision, current.registryRevision, current.linkState,
        current.pair?.issuer ?? null, current.pair?.subject ?? null, input.actor,
      ])
      if (rows.length !== 1) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      const identity = managedLoginIdentityFromRow(rows[0])
      if (identity.linkState !== 'active' || identity.pair === null) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      const mappingVersion = requiredString(rows[0], 'mapping_version')
      if (!/^[0-9]+$/u.test(mappingVersion)) throw new Error('MANAGED_IDENTITY_WRITE_FAILED')
      return { identity: { ...identity, linkState: 'active', pair: identity.pair }, mappingVersion }
    },
  }
}

export function createManagedIdentityRepository(input: { root: string; devEnabled: boolean; database?: OrgmasterDatabase }): ManagedIdentityRepositoryV1 {
  if (input.database) return createPostgresManagedIdentityRepository(input.database)
  const store = createManagedIdentityStore(input)
  const localIdentity = (document: Awaited<ReturnType<typeof store.readExisting>>['document'], predicate: (identity: ManagedDailyIdentityV1) => boolean) => {
    if (!document.admissionAuthority?.admissionEnabled) throw new Error('MANAGED_IDENTITY_ADMISSION_DISABLED')
    const identities = (document.managedDailyIdentities ?? []).filter(predicate)
    if (identities.length !== 1) return null
    const identity = identities[0]
    const assignment = document.registry.assignments.find((entry) => entry.employeeId === identity.employeeId)
    const observation = (document.observations ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId)
    const employeeCurrent = !document.currentWorkspaceAuthority || document.currentWorkspaceAuthority.employeeIds.includes(identity.employeeId)
    const lifecycleClear = !(document.lifecycleEvents ?? []).some((entry) => entry.employeeId === identity.employeeId && entry.state !== 'completed')
    if (!assignment || !observation || observation.directoryState !== 'present' || observation.primaryEmail?.toLowerCase() !== identity.lastVerifiedPrimaryEmail.toLowerCase() || !employeeCurrent || !lifecycleClear || !['directory_linked_pending_auth', 'active'].includes(identity.linkState)) return null
    const pair = identity.authIssuer && identity.authSubject ? { issuer: identity.authIssuer, subject: identity.authSubject } : null
    if (identity.linkState === 'active' && (!pair || identity.admissionRevision === null) || identity.linkState === 'directory_linked_pending_auth' && pair) return null
    return { employeeId: identity.employeeId, principalId: identity.principalId, employeeNumber: assignment.employeeNumber, directoryCustomerId: identity.directoryCustomerId, directoryUserId: identity.directoryUserId, identityRecordId: identity.identityRecordId, identityRevision: String(identity.revision), registryRevision: String(assignment.revision), linkState: identity.linkState as ManagedLoginIdentity['linkState'], pair } satisfies ManagedLoginIdentity
  }
  return Object.assign(store, {
    mode: 'local-json' as const,
    async readEmployeeManagedIdentity() { return null },
    async readEmployeeNumbers(employees: Array<{ id: string; name: string }>) {
      const current = await store.readExisting()
      const names = new Map(employees.map((employee) => [employee.id, employee.name]))
      const active = current.document.registry.assignments.map((entry) => ({ employeeId: entry.employeeId, employeeName: names.get(entry.employeeId) ?? entry.employeeId, employeeNumber: entry.employeeNumber, status: 'active' as const }))
      const retired = current.document.registry.tombstones
        .filter((entry) => entry.retiredAt !== null)
        .map((entry) => ({ employeeId: entry.firstEmployeeId, employeeName: names.get(entry.firstEmployeeId) ?? entry.firstEmployeeId, employeeNumber: entry.employeeNumber, status: 'retired' as const }))
      return { contractVersion: 'orgmaster.managed-identity-numbers.v1' as const, items: [...active, ...retired].sort((first, second) => second.employeeNumber.localeCompare(first.employeeNumber)), registryRevision: current.revision }
    },
    async resolveAuthIdentity(email: string) {
      const current = await store.readExisting()
      const identity = (current.document.managedDailyIdentities ?? []).find((entry) => entry.lastVerifiedPrimaryEmail.toLowerCase() === email.trim().toLowerCase())
      return identity ? { identity, employeeId: identity.employeeId } : null
    },
    async assertEmployeeActivation() { return { allowed: true, correctionRequired: false } },
    async reserveDirectoryRead() {
      const before = await store.readExisting()
      const now = Date.now()
      await store.commit(before.revision, (document) => {
        const grants = (document.directoryReadBudget ?? []).filter((value) => Number.isFinite(Date.parse(value)) && Date.parse(value) > now - 60_000)
        if (grants.length >= 60) throw new Error('DIRECTORY_READ_UNAVAILABLE')
        return { ...document, directoryReadBudget: [...grants, new Date(now).toISOString()] }
      }, `directory-read:${now}`)
    },
    async resolveManagedLoginAlias(employeeNumber: string) {
      const current = await store.readExisting()
      const normalized = employeeNumber.trim().toUpperCase()
      if (!/^JFS[0-9]{4}$/u.test(normalized) || normalized === 'JFS0000') return null
      const assignment = current.document.registry.assignments.find((entry) => entry.employeeNumber === normalized)
      return assignment ? localIdentity(current.document, (entry) => entry.employeeId === assignment.employeeId) : null
    },
    async readManagedLoginIdentity(directoryCustomerId: string, directoryUserId: string) {
      const current = await store.readExisting()
      return localIdentity(current.document, (entry) => entry.directoryCustomerId === directoryCustomerId && entry.directoryUserId === directoryUserId)
    },
    async readManagedLoginSnapshot(directoryCustomerId: string, directoryUserId: string) {
      const current = await store.readExisting()
      const identity = localIdentity(current.document, (entry) => entry.directoryCustomerId === directoryCustomerId && entry.directoryUserId === directoryUserId)
      if (!identity) return null
      const stored = (current.document.managedDailyIdentities ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId)
      if (!stored?.lastVerifiedPrimaryEmail?.trim()) throw new Error('MANAGED_LOGIN_READ_FAILED')
      return { identity, primaryEmail: stored.lastVerifiedPrimaryEmail.trim().toLowerCase() }
    },
    async verifyManagedLoginIdentity(request: { requestId: string; requestHash: string; current: ManagedLoginIdentity; issuer: string; subject: string; actor: string }) {
      return store.verifyManagedLoginIdentity(request)
    },
  })
}
