import pg from 'pg'

export type OrgmasterDatabase = Pick<pg.Pool, 'query' | 'end'>

export type OrgmasterDatabaseConfig = {
  applicationName: string
  connectionTimeoutMillis: number
  idleTimeoutMillis: number
  max: number
  queryTimeoutMillis: number
  statementTimeoutMillis: number
}

let runtimePool: pg.Pool | null = null
let runtimeSignature = ''

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const normalized = value?.trim()
  const parsed = normalized ? Number.parseInt(normalized, 10) : fallback
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`DEV010_N2_${name}_INVALID`)
  return parsed
}

export function resolveOrgmasterDatabaseConfig(environment: NodeJS.ProcessEnv = process.env): OrgmasterDatabaseConfig {
  const runId = environment.DEV010_N2_RUN_ID?.trim().replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 80)
  const config = {
    applicationName: runId ? `dev010-n2-orgmaster-${runId}` : 'jenfu-orgmaster-runtime',
    connectionTimeoutMillis: positiveInteger(environment.ORGMASTER_POSTGRES_CONNECTION_TIMEOUT_MS, 5_000, 'ORGMASTER_CONNECTION_TIMEOUT'),
    idleTimeoutMillis: positiveInteger(environment.ORGMASTER_POSTGRES_IDLE_TIMEOUT_MS, 30_000, 'ORGMASTER_IDLE_TIMEOUT'),
    max: positiveInteger(environment.ORGMASTER_POSTGRES_POOL_MAX, 6, 'ORGMASTER_POOL_MAX'),
    queryTimeoutMillis: positiveInteger(environment.ORGMASTER_POSTGRES_QUERY_TIMEOUT_MS, 35_000, 'ORGMASTER_QUERY_TIMEOUT'),
    statementTimeoutMillis: positiveInteger(environment.ORGMASTER_POSTGRES_STATEMENT_TIMEOUT_MS, 30_000, 'ORGMASTER_STATEMENT_TIMEOUT'),
  }
  if (config.max > 32 || config.queryTimeoutMillis <= config.statementTimeoutMillis) throw new Error('DEV010_N2_ORGMASTER_POOL_CONFIG_INVALID')
  return config
}

export function createOrgmasterDatabase(connectionString: string, environment: NodeJS.ProcessEnv = process.env): OrgmasterDatabase {
  const config = resolveOrgmasterDatabaseConfig(environment)
  const signature = `${connectionString}|${JSON.stringify(config)}`
  if (runtimePool && runtimeSignature !== signature) {
    void runtimePool.end().catch(() => undefined)
    runtimePool = null
  }
  runtimePool ??= new pg.Pool({
    application_name: config.applicationName,
    connectionString,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    max: config.max,
    query_timeout: config.queryTimeoutMillis,
    statement_timeout: config.statementTimeoutMillis,
  })
  runtimeSignature = signature
  return runtimePool
}

export async function closeOrgmasterDatabase() {
  const pool = runtimePool
  runtimePool = null
  runtimeSignature = ''
  await pool?.end()
}
