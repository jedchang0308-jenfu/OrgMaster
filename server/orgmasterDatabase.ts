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

export type OrgmasterN1cTarget = {
  environment: 'staging'
  projectId: 'jenfu-platform-nonprod'
  region: 'asia-east1'
  instance: 'jenfu-platform-nonprod-pg'
  connectionName: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg'
  database: 'jenfu_stg'
  login: 'dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam'
}

export type OrgmasterProductionTarget = {
  environment: 'production'
  projectId: 'jenfu-platform-prod'
  region: 'asia-east1'
  instance: 'jenfu-platform-prod-pg'
  connectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
  database: 'jenfu_prod'
  login: 'orgmaster-prod-runtime@jenfu-platform-prod.iam' | 'orgmaster-prod-migrator@jenfu-platform-prod.iam'
}

let runtimePool: pg.Pool | null = null
let runtimeSignature = ''

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const normalized = value?.trim()
  const parsed = normalized ? Number.parseInt(normalized, 10) : fallback
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`DEV010_N2_${name}_INVALID`)
  return parsed
}

export function assertOrgmasterN1cTarget(environment: NodeJS.ProcessEnv = process.env): OrgmasterN1cTarget {
  const target = {
    environment: environment.ORGMASTER_DEPLOYMENT_ENV,
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    instance: environment.ORGMASTER_CLOUD_SQL_INSTANCE,
    connectionName: environment.ORGMASTER_CLOUD_SQL_CONNECTION_NAME,
    database: environment.ORGMASTER_POSTGRES_DATABASE,
    login: environment.ORGMASTER_POSTGRES_IAM_LOGIN,
  }
  const expected: OrgmasterN1cTarget = {
    environment: 'staging',
    projectId: 'jenfu-platform-nonprod',
    region: 'asia-east1',
    instance: 'jenfu-platform-nonprod-pg',
    connectionName: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
    database: 'jenfu_stg',
    login: 'dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam',
  }
  if (Object.entries(expected).some(([key, value]) => target[key as keyof typeof target] !== value)) {
    throw new Error('DEV010_N1C_ORGMASTER_WRONG_TARGET')
  }
  return expected
}

export function assertOrgmasterProductionTarget(environment: NodeJS.ProcessEnv = process.env, role: 'runtime' | 'migrator' = 'runtime'): OrgmasterProductionTarget {
  const expected: OrgmasterProductionTarget = {
    environment: 'production',
    projectId: 'jenfu-platform-prod',
    region: 'asia-east1',
    instance: 'jenfu-platform-prod-pg',
    connectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    database: 'jenfu_prod',
    login: role === 'runtime' ? 'orgmaster-prod-runtime@jenfu-platform-prod.iam' : 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
  }
  const observed = {
    environment: environment.ORGMASTER_DEPLOYMENT_ENV,
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    instance: environment.ORGMASTER_CLOUD_SQL_INSTANCE,
    connectionName: environment.ORGMASTER_CLOUD_SQL_CONNECTION_NAME,
    database: environment.ORGMASTER_POSTGRES_DATABASE,
    login: environment.ORGMASTER_POSTGRES_IAM_LOGIN,
  }
  if (Object.entries(expected).some(([key, value]) => observed[key as keyof typeof observed] !== value)) {
    throw new Error('DEV040_R2_ORGMASTER_WRONG_PRODUCTION_TARGET')
  }
  return expected
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
  if (environment.DEV010_N1C_TARGET_GUARD === 'required') assertOrgmasterN1cTarget(environment)
  if (environment.DEV040_R2_TARGET_GUARD === 'required') assertOrgmasterProductionTarget(environment, 'runtime')
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
