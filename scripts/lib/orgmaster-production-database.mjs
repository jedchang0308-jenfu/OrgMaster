// Connection identity only. Migration ledger and admission policy belong to their runners.
export const TARGET = Object.freeze({
  ownerApplicationId: 'orgmaster',
  releaseBucket: 'jenfu-platform-prod-orgmaster-release',
  job: 'orgmaster-prod-migration-runner',
  login: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
})

export function databaseOptions(environment, token, database = 'jenfu_prod') {
  return {
    host: environment.POSTGRES_SOCKET,
    database,
    user: environment.POSTGRES_IAM_LOGIN,
    password: token,
    ssl: false,
    application_name: 'dev012-orgmaster-production-migrator',
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
  }
}
