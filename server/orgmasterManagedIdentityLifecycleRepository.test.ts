import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { createPostgresManagedIdentityLifecycleRepository } from './orgmasterManagedIdentityLifecycleRepository'
import type { LifecycleCycleControl, ManagedIdentityWorkloadExecutor } from './orgmasterManagedIdentitySync'

type Row = Record<string, unknown>
type Statement = { sql: string; values: unknown[] }
type TargetQuery = (sql: string, values: unknown[]) => Row[] | Promise<Row[]>

function fakePool(replies: Row[][] = [], onTargetQuery?: TargetQuery) {
  const statements: Statement[] = []
  const clients: Array<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> = []
  const connect = vi.fn(async () => {
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values: [...values] })
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.startsWith('SELECT set_config(')) return { rows: [] as Row[] }
        const rows = onTargetQuery ? await onTargetQuery(sql, values) : replies.shift() ?? []
        return { rows }
      }),
      release: vi.fn(),
    }
    clients.push(client)
    return client
  })
  return { pool: { connect } as unknown as Pick<Pool, 'connect'>, connect, clients, statements }
}

function control(signal: AbortSignal = new AbortController().signal, deadlineAt = 10_000): LifecycleCycleControl {
  return { signal, deadlineAt }
}

function targetStatements(statements: Statement[]) {
  return statements.filter(({ sql }) => sql !== 'BEGIN' && sql !== 'COMMIT' && sql !== 'ROLLBACK' && !sql.startsWith('SELECT set_config('))
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/gu, ' ').trim()
}

const executorRow = {
  principal_id: 'orgmaster-lifecycle-executor',
  owner: 'orgmaster',
  purpose: 'managed-identity-lifecycle',
  binding_version: '5',
}
const executor: ManagedIdentityWorkloadExecutor = {
  principalId: executorRow.principal_id,
  owner: 'orgmaster',
  purpose: 'managed-identity-lifecycle',
  bindingVersion: executorRow.binding_version,
}
const leaseId = '00000000-0000-4000-8000-000000000010'
const requestId = '00000000-0000-4000-8000-000000000011'
const eventId = '00000000-0000-4000-8000-000000000012'
const receiptId = '00000000-0000-4000-8000-000000000013'
const refreshClaim = {
  requestId,
  attemptCount: 2,
  leaseGeneration: 7,
  directoryCustomerId: 'directory-customer-1',
  directoryUserId: 'directory-user-1',
}
const quotaWaitRow = (retryAfterMilliseconds: unknown = '2500') => ({
  claim_kind: 'quota_wait', retry_after_milliseconds: retryAfterMilliseconds,
  request_id: null, attempt_count: null, lease_generation: null,
  directory_customer_id: null, directory_user_id: null,
})
const leasedRefreshRow = {
  claim_kind: 'leased', request_id: requestId, attempt_count: '2', lease_generation: '7',
  directory_customer_id: 'directory-customer-1', directory_user_id: 'directory-user-1',
}
const lifecycleClaim = {
  eventId,
  operationId: '00000000-0000-4000-8000-000000000014',
  sourceRevision: 'workspace-revision-8',
  snapshotHash: 'a'.repeat(64),
  leaseGeneration: 9,
}

describe('PostgreSQL managed identity lifecycle repository', () => {
  it('resolves executor and consumer only through the versioned workload contract in short transactions', async () => {
    const fake = fakePool([
      [executorRow],
      [{ principal_id: 'platform-lifecycle-consumer', owner: 'platform', purpose: 'principal-lifecycle-invalidation', binding_version: '3' }],
    ])
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool, now: () => 1_000 })

    await expect(repository.resolveExecutor(control(undefined, 2_000))).resolves.toEqual(executor)
    await expect(repository.resolveConsumer(control(undefined, 2_000))).resolves.toEqual({
      principalId: 'platform-lifecycle-consumer', owner: 'platform', purpose: 'principal-lifecycle-invalidation', bindingVersion: '3',
    })

    const calls = targetStatements(fake.statements)
    expect(calls).toHaveLength(2)
    expect(normalizeSql(calls[0].sql)).toBe(normalizeSql(`SELECT principal_id,owner,purpose,binding_version::text
      FROM orgmaster_contract.v_workload_principals_v1
      WHERE contract_version='orgmaster.workload-principals.v1' AND enabled
        AND principal_id=orgmaster_core.assert_lifecycle_executor_v2(NULL)`))
    expect(calls[0].values).toEqual([])
    expect(normalizeSql(calls[1].sql)).toBe(normalizeSql(`SELECT principal_id,owner,purpose,binding_version::text
      FROM orgmaster_contract.v_workload_principals_v1
      WHERE contract_version='orgmaster.workload-principals.v1' AND enabled
        AND owner='platform' AND purpose='principal-lifecycle-invalidation'`))
    expect(calls[1].values).toEqual([])
    expect(fake.statements.filter(({ sql }) => sql.startsWith('SELECT set_config(')).map(({ values }) => values)).toEqual([['1000'], ['1000']])
    expect(fake.clients).toHaveLength(2)
    expect(fake.clients.every((client) => client.release.mock.calls.length === 1)).toBe(true)
  })

  it('maps only the resolved executor principal into fixed refresh SQL and claim DTOs', async () => {
    const fake = fakePool([
      [executorRow],
      [],
      [{ claim_kind: 'terminalized' }, leasedRefreshRow],
      [{ result: 'applied' }],
      [{ result: 'terminal' }],
    ])
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })
    const resolvedExecutor = await repository.resolveExecutor(control())
    await repository.enqueueDue(resolvedExecutor, control())
    await expect(repository.claimRefresh(resolvedExecutor, leaseId, 20, control())).resolves.toEqual({ terminalized: 1, claims: [refreshClaim] })
    await expect(repository.completeRefresh(resolvedExecutor, leaseId, refreshClaim, {
      directoryState: 'present', primaryEmail: 'person@example.invalid', sourceEtag: 'etag-1',
    }, control())).resolves.toBe('applied')
    await expect(repository.retryRefresh(resolvedExecutor, leaseId, refreshClaim, 'DIRECTORY_PERMANENT_ERROR', control())).resolves.toBe('terminal')

    const calls = targetStatements(fake.statements).slice(1)
    expect(calls.map(({ sql }) => normalizeSql(sql))).toEqual([
      'SELECT orgmaster_core.enqueue_due_managed_identity_refresh_v2($1)',
      'SELECT * FROM orgmaster_core.claim_managed_identity_refresh_v2($1,$2::uuid,$3)',
      'SELECT orgmaster_core.complete_managed_identity_refresh_v2($1,$2::uuid,$3::uuid,$4,$5,$6,$7) AS result',
      'SELECT orgmaster_core.retry_managed_identity_refresh_v2($1,$2::uuid,$3::uuid,$4,$5) AS result',
    ])
    expect(calls.map(({ values }) => values)).toEqual([
      [executor.principalId],
      [executor.principalId, leaseId, 20],
      [executor.principalId, leaseId, requestId, 7, 'present', 'person@example.invalid', 'etag-1'],
      [executor.principalId, leaseId, requestId, 7, 'DIRECTORY_PERMANENT_ERROR'],
    ])
    expect(fake.clients).toHaveLength(5)
    expect(fake.clients.every((client) => client.release.mock.calls.length === 1)).toBe(true)
    for (const client of fake.clients) {
      expect(client.query.mock.calls.map(([sql]) => sql === 'BEGIN' ? 'BEGIN' : sql === 'COMMIT' ? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : sql.startsWith('SELECT set_config(') ? 'TIMEOUT' : 'OWNER_SQL'))
        .toEqual(['BEGIN', 'TIMEOUT', 'OWNER_SQL', 'COMMIT'])
    }
  })

  it('maps one SQL quota_wait row to its bounded millisecond hint', async () => {
    const fake = fakePool([[quotaWaitRow('2500')]])
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })

    await expect(repository.claimRefresh(executor, leaseId, 20, control())).resolves.toEqual({
      terminalized: 0, claims: [], retryAfterMilliseconds: 2500,
    })
    expect(targetStatements(fake.statements)).toHaveLength(1)
    expect(fake.clients[0].release).toHaveBeenCalledOnce()
    expect(fake.clients[0].query.mock.calls.map(([sql]) => sql === 'BEGIN' ? 'BEGIN' : sql === 'COMMIT' ? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : sql.startsWith('SELECT set_config(') ? 'TIMEOUT' : 'OWNER_SQL'))
      .toEqual(['BEGIN', 'TIMEOUT', 'OWNER_SQL', 'COMMIT'])
  })

  it.each([
    ['0', 'MANAGED_LIFECYCLE_DATABASE_CONTRACT_INVALID'],
    ['60001', 'MANAGED_REFRESH_CLAIM_INVALID'],
    ['1.5', 'MANAGED_LIFECYCLE_DATABASE_CONTRACT_INVALID'],
    ['not-a-number', 'MANAGED_LIFECYCLE_DATABASE_CONTRACT_INVALID'],
  ])('rejects invalid quota_wait duration %s', async (duration, error) => {
    const fake = fakePool([[quotaWaitRow(duration)]])
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })

    await expect(repository.claimRefresh(executor, leaseId, 20, control())).rejects.toThrow(error)
    expect(fake.clients[0].release).toHaveBeenCalledOnce()
    expect(fake.clients[0].query.mock.calls.map(([sql]) => sql === 'BEGIN' ? 'BEGIN' : sql === 'COMMIT' ? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : sql.startsWith('SELECT set_config(') ? 'TIMEOUT' : 'OWNER_SQL'))
      .toEqual(['BEGIN', 'TIMEOUT', 'OWNER_SQL', 'COMMIT'])
  })

  it.each([
    ['duplicate quota_wait rows', [quotaWaitRow('2500'), quotaWaitRow('5000')]],
    ['quota_wait mixed with a leased claim', [quotaWaitRow('2500'), leasedRefreshRow]],
  ])('rejects %s from the SQL claim result', async (_label, rows) => {
    const fake = fakePool([rows])
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })

    await expect(repository.claimRefresh(executor, leaseId, 20, control())).rejects.toThrow('MANAGED_REFRESH_CLAIM_INVALID')
    expect(fake.clients[0].release).toHaveBeenCalledOnce()
    expect(fake.clients[0].query.mock.calls.map(([sql]) => sql === 'BEGIN' ? 'BEGIN' : sql === 'COMMIT' ? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : sql.startsWith('SELECT set_config(') ? 'TIMEOUT' : 'OWNER_SQL'))
      .toEqual(['BEGIN', 'TIMEOUT', 'OWNER_SQL', 'COMMIT'])
  })

  it('maps lifecycle claims and replays completion with only the receipt ID', async () => {
    const fake = fakePool([
      [{ event_id: eventId, operation_id: lifecycleClaim.operationId, source_revision: lifecycleClaim.sourceRevision, snapshot_hash: lifecycleClaim.snapshotHash, lease_generation: '9' }],
      [],
      [],
      [{ result: 'blocked' }],
    ])
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })

    await expect(repository.claimLifecycle(executor, leaseId, 12, control())).resolves.toEqual([lifecycleClaim])
    await repository.completeLifecycle(executor, leaseId, lifecycleClaim, receiptId, control())
    await repository.completeLifecycle(executor, leaseId, lifecycleClaim, receiptId, control())
    await expect(repository.retryLifecycle(executor, leaseId, lifecycleClaim, 'COMPLETION_UNAVAILABLE', control())).resolves.toBe('blocked')

    const calls = targetStatements(fake.statements)
    expect(calls.map(({ sql }) => normalizeSql(sql))).toEqual([
      'SELECT * FROM orgmaster_core.claim_principal_lifecycle_v2($1,$2::uuid,$3)',
      'SELECT orgmaster_core.complete_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5::uuid)',
      'SELECT orgmaster_core.complete_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5::uuid)',
      'SELECT orgmaster_core.retry_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5) AS result',
    ])
    expect(calls.map(({ values }) => values)).toEqual([
      [executor.principalId, leaseId, 12],
      [executor.principalId, leaseId, eventId, 9, receiptId],
      [executor.principalId, leaseId, eventId, 9, receiptId],
      [executor.principalId, leaseId, eventId, 9, 'COMPLETION_UNAVAILABLE'],
    ])
    expect(calls[1].values).toHaveLength(5)
    expect(calls[2].values).toEqual(calls[1].values)
    expect(fake.clients.every((client) => client.release.mock.calls.length === 1)).toBe(true)
  })

  it('rejects aborted cycles before connect and rolls back/releases when aborted during owner SQL', async () => {
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    const untouched = fakePool()
    const untouchedRepository = createPostgresManagedIdentityLifecycleRepository({ pool: untouched.pool })
    await expect(untouchedRepository.resolveExecutor(control(alreadyAborted.signal))).rejects.toThrow('MANAGED_LIFECYCLE_DEADLINE')
    expect(untouched.connect).not.toHaveBeenCalled()

    const duringQuery = new AbortController()
    const fake = fakePool([], () => {
      duringQuery.abort()
      return [executorRow]
    })
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })
    await expect(repository.resolveExecutor(control(duringQuery.signal))).rejects.toThrow('MANAGED_LIFECYCLE_DEADLINE')
    expect(fake.statements.map(({ sql }) => sql === 'BEGIN' ? 'BEGIN' : sql === 'COMMIT' ? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : sql.startsWith('SELECT set_config(') ? 'TIMEOUT' : 'OWNER_SQL'))
      .toEqual(['BEGIN', 'TIMEOUT', 'OWNER_SQL', 'ROLLBACK'])
    expect(fake.clients[0].release).toHaveBeenCalledOnce()
  })

  it('rolls back and releases the dedicated client when owner SQL rejects', async () => {
    const fake = fakePool([], () => { throw new Error('simulated owner SQL failure') })
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool: fake.pool })

    await expect(repository.enqueueDue(executor, control())).rejects.toThrow('simulated owner SQL failure')
    expect(fake.statements.map(({ sql }) => sql === 'BEGIN' ? 'BEGIN' : sql === 'COMMIT' ? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : sql.startsWith('SELECT set_config(') ? 'TIMEOUT' : 'OWNER_SQL'))
      .toEqual(['BEGIN', 'TIMEOUT', 'OWNER_SQL', 'ROLLBACK'])
    expect(fake.clients[0].release).toHaveBeenCalledOnce()
  })
})
