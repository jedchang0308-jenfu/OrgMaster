import { PROJED_EXTERNAL_VERSION, type ProjedExternalDecision, type ProjedExternalNotification } from '../src/governance/projedExternal'
import type { GovernanceActorContext } from '../src/governance/types'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { persistenceActorContext } from './orgmasterPersistenceRepository'

export class ProjedExternalError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
function text(value: unknown, max = 255, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && (empty || value.length > 0) && value.trim() === value
}
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
}
export function parseProjedExternalNotification(value: unknown): ProjedExternalNotification {
  const candidate = value as Record<string, unknown> | null
  const fields = candidate?.action === 'submit'
    ? ['invitationId', 'inviterPrincipalId', 'boardId', 'role', 'expiresAt', 'contactEmail', 'company', 'note']
    : candidate?.action === 'bind' ? ['principalId', 'googleSubject'] : candidate?.action === 'withdraw' ? [] : null
  if (!fields || !keys(value, ['contractVersion', 'action', 'requestId', ...fields])
    || value.contractVersion !== PROJED_EXTERNAL_VERSION || !text(value.requestId) || !uuid.test(value.requestId)) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
  for (const field of fields) if (!text(value[field], field === 'note' ? 2000 : 255, ['note', 'company', 'contactEmail'].includes(field))) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
  if (value.action === 'submit' && (!text(value.expiresAt) || !Number.isFinite(Date.parse(value.expiresAt)))) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
  return value as unknown as ProjedExternalNotification
}
export function parseProjedExternalDecision(value: unknown): ProjedExternalDecision {
  if (!keys(value, ['commandId', 'requestId', 'expectedRevision', 'action', 'note'])
    || !text(value.commandId) || !uuid.test(value.commandId) || !text(value.requestId) || !uuid.test(value.requestId)
    || !text(value.expectedRevision) || !/^[1-9][0-9]{0,18}$/u.test(value.expectedRevision)
    || !['approve', 'reject', 'disable', 'restore'].includes(String(value.action)) || !text(value.note, 2000, true)) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
  return value as unknown as ProjedExternalDecision
}
export function createProjedExternalService(database: Pick<OrgmasterDatabase, 'query'>, beforeQuery?: () => Promise<void>) {
  async function query(sql: string, params: unknown[]) {
    try {
      await beforeQuery?.()
      const result = await database.query(sql, params)
      if (result.rows.length !== 1 || !result.rows[0].result) throw new Error('missing')
      return result.rows[0].result
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (['EXTERNAL_CONFLICT', 'EXTERNAL_IDENTITY_CONFLICT'].includes(message)) throw new ProjedExternalError(409, message)
      if (message === 'EXTERNAL_REQUEST_INVALID') throw new ProjedExternalError(400, message)
      if (message === 'EXTERNAL_NOT_FOUND') throw new ProjedExternalError(404, message)
      if (message === 'EXTERNAL_ADMIN_REQUIRED') throw new ProjedExternalError(403, message)
      if (message === 'IDENTITY_CONTEXT_REQUIRED') throw new ProjedExternalError(401, message)
      throw new ProjedExternalError(503, 'EXTERNAL_QUALIFICATION_UNAVAILABLE')
    }
  }
  return {
    notify(value: unknown) {
      const request = parseProjedExternalNotification(value)
      return query('SELECT orgmaster_core.notify_projed_external_request_v1($1::jsonb) AS result', [JSON.stringify(request)])
    },
    manage(actor: GovernanceActorContext, value?: unknown) {
      const command = value === undefined ? null : parseProjedExternalDecision(value)
      return query('SELECT orgmaster_core.manage_projed_external_request_v1($1::jsonb,$2::jsonb) AS result', [JSON.stringify({ ...persistenceActorContext(actor), principalId: actor.principalId }), command ? JSON.stringify(command) : null])
    },
  }
}
export type ProjedExternalService = ReturnType<typeof createProjedExternalService>
