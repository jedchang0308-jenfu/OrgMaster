import type { OrgmasterDatabase } from './orgmasterDatabase'

export type EntitlementInvalidationEvent = {
  event_id: string
  operation_id: string
  employee_id: string
  application_id: string
  event_kind: string
  actor: string
  reason_code: string
  attempt_count: number
  lease_until: string
}

export type EntitlementInvalidationDispatchResult = {
  eventId: string
  operationId: string
  status: 'completed' | 'retry_scheduled'
  attemptCount: number
  platformReceiptId: string | null
  affectedPrincipalCount: number | null
}

function boundedWorkerId(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 128) throw new Error('ENTITLEMENT_OUTBOX_WORKER_ID_INVALID')
  return normalized
}

function redactedErrorCode(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'PLATFORM_INVALIDATION_FAILED'
  return /^[A-Z0-9_]{1,128}$/u.test(code) ? code : 'PLATFORM_INVALIDATION_FAILED'
}

export async function dispatchEntitlementInvalidations(
  database: OrgmasterDatabase,
  input: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<EntitlementInvalidationDispatchResult[]> {
  const workerId = boundedWorkerId(input.workerId)
  const limit = input.limit ?? 16
  const leaseSeconds = input.leaseSeconds ?? 30
  const claimed = await database.query<EntitlementInvalidationEvent>(
    `SELECT event_id, operation_id, employee_id, application_id, event_kind,
            actor, reason_code, attempt_count, lease_until::text
       FROM access_governance.claim_entitlement_change_outbox_v1($1, $2, $3)`,
    [workerId, limit, leaseSeconds],
  )
  const results: EntitlementInvalidationDispatchResult[] = []
  for (const event of claimed.rows) {
    try {
      const invalidation = await database.query<{ receipt_id: string; affected_principal_count: number }>(
        `SELECT receipt_id, affected_principal_count
           FROM platform_core.invalidate_employee_app_sessions_v1($1, $2, $3, $4, $5)`,
        [event.employee_id, event.application_id, event.operation_id, event.actor, event.reason_code],
      )
      if (invalidation.rowCount !== 1) throw new Error('PLATFORM_INVALIDATION_RECEIPT_INVALID')
      const receipt = invalidation.rows[0]
      await database.query(
        'SELECT access_governance.complete_entitlement_change_outbox_v1($1, $2, $3)',
        [event.event_id, workerId, receipt.receipt_id],
      )
      results.push({
        eventId: event.event_id,
        operationId: event.operation_id,
        status: 'completed',
        attemptCount: Number(event.attempt_count),
        platformReceiptId: receipt.receipt_id,
        affectedPrincipalCount: Number(receipt.affected_principal_count),
      })
    } catch (error) {
      await database.query(
        'SELECT access_governance.retry_entitlement_change_outbox_v1($1, $2, $3)',
        [event.event_id, workerId, redactedErrorCode(error)],
      )
      results.push({
        eventId: event.event_id,
        operationId: event.operation_id,
        status: 'retry_scheduled',
        attemptCount: Number(event.attempt_count),
        platformReceiptId: null,
        affectedPrincipalCount: null,
      })
    }
  }
  return results
}
