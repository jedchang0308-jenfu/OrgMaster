import { createHash } from 'node:crypto'

export type FmsPublicationOperation = {
  operationId: string
  prepareEventId: string
  terminalEventId: string
  baselineVersion: string
  targetVersion: string
  principalIds: readonly string[]
}
export type FmsRevocationPhase = 'prepare' | 'published' | 'cancelled'
export type FmsRevocationReceipt = {
  contractVersion: 'jf-fms.session-revocation-receipt.v1'
  eventId: string
  operationId: string
  phase: FmsRevocationPhase
  digest: string
  receiptId: string
  appliedAt: string
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u
const hash = /^[0-9a-f]{64}$/u
const principal = /^[A-Za-z0-9._:@/-]{1,255}$/u

export function fmsRevocationCommand(operation: FmsPublicationOperation, phase: FmsRevocationPhase, prepareReceiptId: string | null) {
  const { operationId, prepareEventId, terminalEventId, baselineVersion, targetVersion, principalIds } = operation
  const invalid = () => new Error('FMS_REVOCATION_COMMAND_INVALID')
  if (!uuid.test(operationId) || !uuid.test(prepareEventId) || !uuid.test(terminalEventId) || prepareEventId === terminalEventId
    || !hash.test(baselineVersion) || !hash.test(targetVersion) || baselineVersion === targetVersion
    || !principalIds.length || principalIds.length > 4096
    || principalIds.some((id, index) => !principal.test(id) || (index > 0 && principalIds[index - 1] >= id))) throw invalid()
  if (phase === 'prepare' ? prepareReceiptId !== null
    : (phase !== 'published' && phase !== 'cancelled') || !prepareReceiptId || !uuid.test(prepareReceiptId)) throw invalid()
  const contractVersion = 'jenfu.fms-session-revocation.v1'
  const sourceApp = 'orgmaster'
  const targetApp = 'financial-management-system'
  const eventId = phase === 'prepare' ? prepareEventId : terminalEventId
  const digest = createHash('sha256').update(JSON.stringify([contractVersion, targetApp, sourceApp, operationId,
    eventId, terminalEventId, phase, baselineVersion, targetVersion, principalIds, prepareReceiptId])).digest('hex')
  const command = { contractVersion, targetApp, sourceApp, operationId, eventId, terminalEventId, phase,
    baselineVersion, targetVersion, principalIds, prepareReceiptId, digest } as const
  if (Buffer.byteLength(JSON.stringify(command)) > 1024 * 1024) throw invalid()
  return command
}

export function parseFmsRevocationReceipt(value: unknown, command: ReturnType<typeof fmsRevocationCommand>): FmsRevocationReceipt {
  const invalid = () => new Error('FMS_REVOCATION_RECEIPT_INVALID')
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== 7) throw invalid()
  const row = value as Record<string, unknown>
  if (row.contractVersion !== 'jf-fms.session-revocation-receipt.v1' || row.eventId !== command.eventId
    || row.operationId !== command.operationId || row.phase !== command.phase || row.digest !== command.digest
    || typeof row.receiptId !== 'string' || !uuid.test(row.receiptId)
    || typeof row.appliedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(row.appliedAt)
    || !Number.isFinite(Date.parse(row.appliedAt)) || new Date(row.appliedAt).toISOString() !== row.appliedAt) throw invalid()
  return row as FmsRevocationReceipt
}
