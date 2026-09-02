import pg from 'pg'

export type OrgmasterDatabase = Pick<pg.Pool, 'query' | 'end'>

export function createOrgmasterDatabase(connectionString: string): OrgmasterDatabase {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
}
