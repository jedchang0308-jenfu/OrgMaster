import { createHash } from 'node:crypto'
export type OrgmasterPdmRevocationPhase = 'prepare' | 'published' | 'cancelled'
export type OrgmasterPdmRevocationOperation = {
  operationId: string
  baselineVersion: string
  publicationVersion: string
  principalIds: string[]
}
export type PdmRevocationReceipt = {
  contractVersion: 'ai-pdm.session-revocation-receipt.v1'
  eventId: string
  operationId: string
  phase: OrgmasterPdmRevocationPhase
  digest: string
  receiptId: string
  appliedAt: string
}


const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u
const OPAQUE = /^[A-Za-z0-9._:@/-]{1,255}$/u
const INVALID = 'PDM_REVOCATION_RECEIPT_INVALID'


export function pdmRevocationCommand(operation: OrgmasterPdmRevocationOperation, eventId: string, phase: OrgmasterPdmRevocationPhase) {
  const { operationId, baselineVersion, publicationVersion, principalIds } = operation
  if (!UUID.test(operationId) || !UUID.test(eventId) || !OPAQUE.test(baselineVersion)
    || !OPAQUE.test(publicationVersion) || baselineVersion === publicationVersion
    || principalIds.length === 0 || principalIds.length > 4096
    || principalIds.some((id, i) => !OPAQUE.test(id) || (i > 0 && principalIds[i - 1] >= id))) {
    throw new Error('PDM_REVOCATION_COMMAND_INVALID')
  }
  const contractVersion = 'jenfu.pdm-session-revocation.v1'
  const sourceApp = 'orgmaster'
  const targetApp = 'ai-pdm'
  const sourceEpoch = null
  const revokedBefore = null
  const digest = createHash('sha256').update(JSON.stringify([
    contractVersion, sourceApp, targetApp, eventId, operationId, phase,
    baselineVersion, publicationVersion, principalIds, sourceEpoch, revokedBefore,
  ])).digest('hex')
  const command = { contractVersion, sourceApp, targetApp, eventId, operationId, phase,
    baselineVersion, publicationVersion, principalIds, sourceEpoch, revokedBefore, digest } as const
  if (Buffer.byteLength(JSON.stringify(command)) > 1024 * 1024) throw new Error('PDM_REVOCATION_COMMAND_INVALID')
  return command
}

type Command = ReturnType<typeof pdmRevocationCommand>

export function parsePdmRevocationReceipt(value: unknown, command: Command): PdmRevocationReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID)
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 7 || row.contractVersion !== 'ai-pdm.session-revocation-receipt.v1'
    || row.eventId !== command.eventId || row.operationId !== command.operationId
    || row.phase !== command.phase || row.digest !== command.digest
    || typeof row.receiptId !== 'string' || !UUID.test(row.receiptId)
    || typeof row.appliedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(row.appliedAt)
    || !Number.isFinite(Date.parse(row.appliedAt))
    || new Date(row.appliedAt).toISOString() !== row.appliedAt) throw new Error(INVALID)
  return row as PdmRevocationReceipt
}
