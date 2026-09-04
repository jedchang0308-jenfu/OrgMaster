import { createHash } from 'node:crypto'
import type { OrgmasterDatabase } from './orgmasterDatabase'

export type PrivilegedSecurityAlert = {
  alertReference: string
  commandId: string
  operation: 'grant_system_admin' | 'revoke_system_admin'
  actorPrincipalId: string
  employeeId: string
  targetHint: string
  auditReference: string
  reasonSha256: string
  attemptCount: number
}

type AlertRow = {
  alert_reference: string
  command_id: string
  operation: PrivilegedSecurityAlert['operation']
  actor_principal_id: string
  employee_id: string
  target_hint: string
  audit_reference: string
  reason_sha256: string
  attempt_count: number | string
}

export type PrivilegedSecurityAlertDelivery = (alert: PrivilegedSecurityAlert) => Promise<{ providerReceipt: string }>

function mapAlert(row: AlertRow): PrivilegedSecurityAlert {
  return {
    alertReference: row.alert_reference,
    commandId: row.command_id,
    operation: row.operation,
    actorPrincipalId: row.actor_principal_id,
    employeeId: row.employee_id,
    targetHint: row.target_hint,
    auditReference: row.audit_reference,
    reasonSha256: row.reason_sha256,
    attemptCount: Number(row.attempt_count),
  }
}

function errorCode(error: unknown) {
  const value = error instanceof Error ? error.name || 'DELIVERY_FAILED' : 'DELIVERY_FAILED'
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128) || 'DELIVERY_FAILED'
}

export async function dispatchPrivilegedSecurityAlerts(
  database: OrgmasterDatabase,
  workerId: string,
  deliver: PrivilegedSecurityAlertDelivery,
  limit = 20,
) {
  const claimed = await database.query<AlertRow>('SELECT * FROM orgmaster_core.claim_privileged_security_alerts_v1($1, $2, 60)', [workerId, limit])
  const results: Array<{ alertReference: string; status: 'delivered' | 'retry_scheduled'; receiptId?: string }> = []
  for (const row of claimed.rows) {
    const alert = mapAlert(row)
    try {
      const delivered = await deliver(alert)
      const providerReceiptSha256 = createHash('sha256').update(delivered.providerReceipt).digest('hex')
      const completed = await database.query<{ receipt_id: string }>('SELECT orgmaster_core.complete_privileged_security_alert_v1($1, $2, $3) AS receipt_id', [alert.alertReference, workerId, providerReceiptSha256])
      results.push({ alertReference: alert.alertReference, status: 'delivered', receiptId: completed.rows[0].receipt_id })
    } catch (error) {
      await database.query('SELECT orgmaster_core.retry_privileged_security_alert_v1($1, $2, $3)', [alert.alertReference, workerId, errorCode(error)])
      results.push({ alertReference: alert.alertReference, status: 'retry_scheduled' })
    }
  }
  return results
}
