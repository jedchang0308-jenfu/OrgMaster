import type { OrgmasterDatabase } from './orgmasterDatabase'

export class AuthEpochUnavailableError extends Error {
  constructor() { super('auth_epoch_unavailable') }
}

export type AuthEpochRepository = {
  read(issuer: string, subject: string): Promise<number>
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
  }
}
