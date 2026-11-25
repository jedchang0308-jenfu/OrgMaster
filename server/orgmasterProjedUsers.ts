import type { GovernanceActorContext } from '../src/governance/types'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { persistenceActorContext } from './orgmasterPersistenceRepository'

export class ProjedUserError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
export function parseProjedUserCommand(value: unknown) {
  const row = value as Record<string, unknown> | null
  if (!row || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'action,commandId,expectedRevision,googleSubject'
    || typeof row.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row.commandId)
    || typeof row.googleSubject !== 'string' || !row.googleSubject || row.googleSubject.length > 255
    || row.googleSubject.trim() !== row.googleSubject || /[\u0000-\u001f\u007f]/u.test(row.googleSubject)
    || typeof row.expectedRevision !== 'string' || !/^[0-9]{1,19}:[0-9]{1,19}$/u.test(row.expectedRevision)
    || !['disable', 'restore'].includes(String(row.action))) throw new ProjedUserError(400, 'PROJED_USER_REQUEST_INVALID')
  return row
}
const errors: Record<string, number> = {
  PROJED_USER_CONFLICT: 409, PROJED_USER_REQUEST_INVALID: 400, PROJED_USER_NOT_FOUND: 404,
  PROJED_USER_ADMIN_REQUIRED: 403, IDENTITY_CONTEXT_REQUIRED: 401,
}
export function createProjedUsersService(database: Pick<OrgmasterDatabase, 'query'> | (() => Pick<OrgmasterDatabase, 'query'>), beforeQuery?: () => Promise<void>) {
  return {
    async manage(actor: GovernanceActorContext, value?: unknown) {
      const command = value === undefined ? null : parseProjedUserCommand(value)
      try {
        await beforeQuery?.()
        const target = typeof database === 'function' ? database() : database
        const result = await target.query('SELECT orgmaster_core.manage_projed_user_v1($1::jsonb,$2::jsonb) AS result', [
          JSON.stringify({ ...persistenceActorContext(actor), principalId: actor.principalId }), command ? JSON.stringify(command) : null,
        ])
        if (result.rows.length !== 1 || !result.rows[0].result) throw new Error('result_missing')
        return result.rows[0].result
      } catch (error) {
        const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
        throw new ProjedUserError(Object.hasOwn(errors, code) ? errors[code] : 503,
          Object.hasOwn(errors, code) ? code : 'PROJED_USER_DIRECTORY_UNAVAILABLE')
      }
    },
  }
}
