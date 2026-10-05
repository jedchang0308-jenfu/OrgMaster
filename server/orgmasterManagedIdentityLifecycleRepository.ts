import type { Pool, PoolClient, QueryResultRow } from 'pg'
import { performance } from 'node:perf_hooks'
import type { LifecycleCycleControl, ManagedIdentityLifecycleRepositoryV2 } from './orgmasterManagedIdentitySync'

function text(row: Record<string, unknown>, name: string): string {
  const value = row[name]
  if (typeof value !== 'string' || !value || value.length > 255) throw new Error('MANAGED_LIFECYCLE_DATABASE_CONTRACT_INVALID')
  return value.trim()
}
function integer(row: Record<string, unknown>, name: string) {
  const value = Number(row[name])
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('MANAGED_LIFECYCLE_DATABASE_CONTRACT_INVALID')
  return value
}

/** A dedicated owner-local client per short transaction. Deadline rejection
 * cannot commit an unobserved query: server statement timeout plus rollback
 * fence bound it. A lost COMMIT reply remains replayable through queue CAS.
 * No caller-supplied DB login, target, Principal or SQL is accepted. */
export function createPostgresManagedIdentityLifecycleRepository(input: {
  pool: Pick<Pool, 'connect'>
  now?: () => number
}): ManagedIdentityLifecycleRepositoryV2 {
  const now = input.now ?? (() => performance.now())
  const guard = (control: LifecycleCycleControl) => {
    if (control.signal.aborted || now() >= control.deadlineAt) throw new Error('MANAGED_LIFECYCLE_DEADLINE')
  }
  async function query<Row extends QueryResultRow>(control: LifecycleCycleControl, sql: string, values: unknown[] = []) {
    guard(control)
    const client: PoolClient = await input.pool.connect()
    let begun = false
    try {
      guard(control)
      await client.query('BEGIN')
      begun = true
      guard(control)
      const remaining = Math.max(1, Math.min(5_000, Math.floor(control.deadlineAt - now())))
      await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", [String(remaining)])
      guard(control)
      const result = await client.query<Row>(sql, values)
      guard(control)
      await client.query('COMMIT')
      begun = false
      guard(control)
      return result.rows
    } catch (error) {
      if (begun) await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }
  async function result(control: LifecycleCycleControl, sql: string, values: unknown[]) {
    const rows = await query<{ result: string }>(control, sql, values)
    if (rows.length !== 1) throw new Error('MANAGED_LIFECYCLE_DATABASE_CONTRACT_INVALID')
    return rows[0].result
  }
  return {
    async resolveExecutor(control) {
      const rows = await query<Record<string, unknown>>(control, `SELECT principal_id,owner,purpose,binding_version::text
        FROM orgmaster_contract.v_workload_principals_v1
        WHERE contract_version='orgmaster.workload-principals.v1' AND enabled
          AND principal_id=orgmaster_core.assert_lifecycle_executor_v2(NULL)`)
      if (rows.length !== 1 || rows[0].owner !== 'orgmaster' || rows[0].purpose !== 'managed-identity-lifecycle') throw new Error('MANAGED_LIFECYCLE_EXECUTOR_INVALID')
      return { principalId: text(rows[0], 'principal_id'), owner: 'orgmaster', purpose: 'managed-identity-lifecycle', bindingVersion: String(integer(rows[0], 'binding_version')) }
    },
    async resolveConsumer(control) {
      const rows = await query<Record<string, unknown>>(control, `SELECT principal_id,owner,purpose,binding_version::text
        FROM orgmaster_contract.v_workload_principals_v1
        WHERE contract_version='orgmaster.workload-principals.v1' AND enabled
          AND owner='platform' AND purpose='principal-lifecycle-invalidation'`)
      if (rows.length !== 1) throw new Error('MANAGED_LIFECYCLE_CONSUMER_INVALID')
      return { principalId: text(rows[0], 'principal_id'), owner: 'platform', purpose: 'principal-lifecycle-invalidation', bindingVersion: String(integer(rows[0], 'binding_version')) }
    },
    async enqueueDue(executor, control) {
      await query(control, 'SELECT orgmaster_core.enqueue_due_managed_identity_refresh_v2($1)', [executor.principalId])
    },
    async claimRefresh(executor, leaseId, limit, control) {
      const rows = await query<Record<string, unknown>>(control, 'SELECT * FROM orgmaster_core.claim_managed_identity_refresh_v2($1,$2::uuid,$3)', [executor.principalId, leaseId, limit])
      const terminalized = rows.filter(row => row.claim_kind === 'terminalized').length
      if (rows.some(row => !['terminalized','leased','quota_wait'].includes(String(row.claim_kind)))) throw new Error('MANAGED_REFRESH_CLAIM_INVALID')
      const waiting = rows.filter(row => row.claim_kind === 'quota_wait')
      const claims = rows.filter(row => row.claim_kind === 'leased').map(row => ({ requestId: text(row, 'request_id'), attemptCount: integer(row, 'attempt_count'), leaseGeneration: integer(row, 'lease_generation'), directoryCustomerId: text(row, 'directory_customer_id'), directoryUserId: text(row, 'directory_user_id') }))
      if (waiting.length > 1 || (waiting.length && claims.length)) throw new Error('MANAGED_REFRESH_CLAIM_INVALID')
      if (!waiting.length) return { terminalized, claims }
      const retryAfterMilliseconds = integer(waiting[0], 'retry_after_milliseconds')
      if (retryAfterMilliseconds > 60_000 || ['request_id','attempt_count','lease_generation','directory_customer_id','directory_user_id'].some(key => waiting[0][key] != null)) throw new Error('MANAGED_REFRESH_CLAIM_INVALID')
      return { terminalized, claims, retryAfterMilliseconds }
    },
    async completeRefresh(executor, leaseId, claim, observation, control) {
      const outcome = await result(control, 'SELECT orgmaster_core.complete_managed_identity_refresh_v2($1,$2::uuid,$3::uuid,$4,$5,$6,$7) AS result', [executor.principalId, leaseId, claim.requestId, claim.leaseGeneration, observation.directoryState, observation.primaryEmail, observation.sourceEtag])
      if (outcome !== 'applied' && outcome !== 'superseded') throw new Error('MANAGED_REFRESH_COMPLETION_INVALID')
      return outcome
    },
    async retryRefresh(executor, leaseId, claim, error, control) {
      const outcome = await result(control, 'SELECT orgmaster_core.retry_managed_identity_refresh_v2($1,$2::uuid,$3::uuid,$4,$5) AS result', [executor.principalId, leaseId, claim.requestId, claim.leaseGeneration, error])
      if (outcome !== 'retry' && outcome !== 'terminal') throw new Error('MANAGED_REFRESH_RETRY_INVALID')
      return outcome
    },
    async claimLifecycle(executor, leaseId, limit, control) {
      const rows = await query<Record<string, unknown>>(control, 'SELECT * FROM orgmaster_core.claim_principal_lifecycle_v2($1,$2::uuid,$3)', [executor.principalId, leaseId, limit])
      return rows.map(row => ({ eventId: text(row, 'event_id'), operationId: text(row, 'operation_id'), sourceRevision: text(row, 'source_revision'), snapshotHash: text(row, 'snapshot_hash'), leaseGeneration: integer(row, 'lease_generation') }))
    },
    async completeLifecycle(executor, leaseId, claim, receiptId, control) {
      await query(control, 'SELECT orgmaster_core.complete_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5::uuid)', [executor.principalId, leaseId, claim.eventId, claim.leaseGeneration, receiptId])
    },
    async retryLifecycle(executor, leaseId, claim, error, control) {
      const outcome = await result(control, 'SELECT orgmaster_core.retry_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5) AS result', [executor.principalId, leaseId, claim.eventId, claim.leaseGeneration, error])
      if (outcome !== 'retry' && outcome !== 'blocked') throw new Error('MANAGED_LIFECYCLE_RETRY_INVALID')
      return outcome
    },
  }
}
