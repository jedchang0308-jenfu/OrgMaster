import type { OrgmasterDatabase } from './orgmasterDatabase'

export class AuthEpochUnavailableError extends Error {
  constructor() { super('auth_epoch_unavailable') }
}

export type AuthEpochRepository = {
  read(issuer: string, subject: string): Promise<number>
  readState(issuer: string, subject: string): Promise<{ authEpoch: number; revokedBefore: string | null }>
  readPrincipalState(principalId: string): Promise<{ authEpoch: number; revokedBefore: string | null }>
}

export function createAuthEpochRepository(database: OrgmasterDatabase): AuthEpochRepository {
  return {
    async read(issuer, subject) {
      try {
        const result = await database.query<{ auth_epoch: string | number }>(
          'SELECT platform_contract.read_principal_auth_epoch_v1($1, $2) AS auth_epoch',
          [issuer, subject],
        )
        const epoch = Number(result.rows[0]?.auth_epoch ?? 0)
        if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('invalid epoch')
        return epoch
      } catch {
        throw new AuthEpochUnavailableError()
      }
    },
    async readState(issuer, subject) {
      try {
        const result = await database.query<{ auth_epoch: string | number; revoked_before: Date | string | null }>(
          'SELECT auth_epoch, revoked_before FROM platform_contract.read_principal_auth_state_v2($1, $2)',
          [issuer, subject],
        )
        const epoch = Number(result.rows[0]?.auth_epoch ?? 0)
        if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('invalid epoch')
        const revokedBefore = result.rows[0]?.revoked_before == null ? null : new Date(result.rows[0].revoked_before).toISOString()
        return { authEpoch: epoch, revokedBefore }
      } catch {
        throw new AuthEpochUnavailableError()
      }
    },
    async readPrincipalState(principalId) {
      try {
        const result = await database.query<{ principal_id: string; auth_epoch: string | number; revoked_before: Date | string | null }>(
          'SELECT principal_id, auth_epoch, revoked_before FROM platform_contract.read_principal_auth_state_v3($1)',
          [principalId],
        )
        const row = result.rows[0]
        const epoch = Number(row?.auth_epoch)
        if (result.rows.length !== 1 || row?.principal_id !== principalId || !Number.isSafeInteger(epoch) || epoch < 0) throw new Error('invalid principal state')
        const revokedBefore = row.revoked_before == null ? null : new Date(row.revoked_before).toISOString()
        return { authEpoch: epoch, revokedBefore }
      } catch {
        throw new AuthEpochUnavailableError()
      }
    },
  }
}
