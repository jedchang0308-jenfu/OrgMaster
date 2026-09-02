import { describe, expect, it } from 'vitest'
import { dispatchEntitlementInvalidations } from './orgmasterEntitlementInvalidationDispatcher'

function event() {
  return {
    event_id: '10000000-0000-4000-8000-000000000001',
    operation_id: 'operation-1',
    employee_id: 'employee-1',
    application_id: 'ai-pdm',
    event_kind: 'authority_switch',
    actor: 'principal-admin',
    reason_code: 'entitlement_authority_switch',
    attempt_count: 1,
    lease_until: '2026-09-02T00:00:30.000Z',
  }
}

describe('dispatchEntitlementInvalidations', () => {
  it('claims, invalidates, then records the durable receipt', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const database = {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql, values })
        if (sql.includes('claim_entitlement_change_outbox_v1')) return { rows: [event()], rowCount: 1 }
        if (sql.includes('invalidate_employee_app_sessions_v1')) return { rows: [{ receipt_id: '20000000-0000-4000-8000-000000000001', affected_principal_count: 2 }], rowCount: 1 }
        return { rows: [], rowCount: 1 }
      },
      end: async () => undefined,
    }
    const result = await dispatchEntitlementInvalidations(database as never, { workerId: 'worker-1' })
    expect(result).toEqual([{ eventId: event().event_id, operationId: 'operation-1', status: 'completed', attemptCount: 1, platformReceiptId: '20000000-0000-4000-8000-000000000001', affectedPrincipalCount: 2 }])
    expect(calls.map((call) => call.sql)).toEqual([
      expect.stringContaining('claim_entitlement_change_outbox_v1'),
      expect.stringContaining('invalidate_employee_app_sessions_v1'),
      expect.stringContaining('complete_entitlement_change_outbox_v1'),
    ])
  })

  it('schedules retry without exposing the database message', async () => {
    const values: unknown[][] = []
    const database = {
      query: async (sql: string, parameters: unknown[]) => {
        values.push(parameters)
        if (sql.includes('claim_entitlement_change_outbox_v1')) return { rows: [event()], rowCount: 1 }
        if (sql.includes('invalidate_employee_app_sessions_v1')) throw Object.assign(new Error('secret connection detail'), { code: '08006' })
        return { rows: [], rowCount: 1 }
      },
      end: async () => undefined,
    }
    const result = await dispatchEntitlementInvalidations(database as never, { workerId: 'worker-2' })
    expect(result[0]).toMatchObject({ status: 'retry_scheduled', platformReceiptId: null })
    expect(values.at(-1)).toEqual([event().event_id, 'worker-2', '08006'])
  })
})
