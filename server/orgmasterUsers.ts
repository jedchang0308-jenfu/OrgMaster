import type { GovernanceActorContext } from '../src/governance/types'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { persistenceActorContext } from './orgmasterPersistenceRepository'
export class UserDirectoryError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
export function createUsersService(database: Pick<OrgmasterDatabase, 'query'> | (() => Pick<OrgmasterDatabase, 'query'>), beforeQuery?: () => Promise<void>) {
  return { async read(actor: GovernanceActorContext) {
    try {
      await beforeQuery?.()
      const target = typeof database === 'function' ? database() : database
      const result = await target.query('SELECT orgmaster_core.read_user_directory_v1($1::jsonb) AS result', [JSON.stringify({ ...persistenceActorContext(actor), principalId: actor.principalId })])
      if (result.rows.length !== 1 || !result.rows[0].result) throw new Error('result_missing')
      return result.rows[0].result
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'USER_DIRECTORY_ADMIN_REQUIRED') throw new UserDirectoryError(403, message)
      if (message === 'IDENTITY_CONTEXT_REQUIRED') throw new UserDirectoryError(401, message)
      throw new UserDirectoryError(503, 'USER_DIRECTORY_UNAVAILABLE')
    }
  } }
}
