import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as databaseModule from './orgmaster-production-database.mjs'
import { ORGMASTER_ADMISSION_TARGET } from './dev049-production-admission.mjs'
import { TARGET, databaseOptions } from './orgmaster-production-database.mjs'

const environment = {
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_IAM_LOGIN: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
}
const accessToken = 'synthetic-database-options-token'

function expectedOptions(database, user) {
  return {
    host: environment.POSTGRES_SOCKET,
    database,
    user,
    password: accessToken,
    ssl: false,
    application_name: 'dev012-orgmaster-production-migrator',
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
  }
}

test('shared target is the frozen four-field OrgMaster connection identity reused by admission', () => {
  assert.deepEqual(TARGET, {
    ownerApplicationId: 'orgmaster',
    releaseBucket: 'jenfu-platform-prod-orgmaster-release',
    job: 'orgmaster-prod-migration-runner',
    login: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
  })
  assert.deepEqual(Object.keys(TARGET), ['ownerApplicationId', 'releaseBucket', 'job', 'login'])
  assert.equal(Object.isFrozen(TARGET), true)
  assert.deepEqual({
    ownerApplicationId: ORGMASTER_ADMISSION_TARGET.ownerApplicationId,
    releaseBucket: ORGMASTER_ADMISSION_TARGET.releaseBucket,
    job: ORGMASTER_ADMISSION_TARGET.jobName,
    login: ORGMASTER_ADMISSION_TARGET.login,
  }, TARGET)
})

test('neutral database module has no imported policy or runtime dependencies', () => {
  const source = readFileSync(new URL('./orgmaster-production-database.mjs', import.meta.url), 'utf8')
  assert.deepEqual(Object.keys(databaseModule).sort(), ['TARGET', 'databaseOptions'])
  assert.doesNotMatch(source, /^\s*import\s/mu)
  assert.doesNotMatch(source, /^\s*export\s+(?:\*|\{)[^\n]*\bfrom\b/mu)
})

test('database options preserve every original production setting and honor the runtime login environment', () => {
  assert.deepEqual(databaseOptions(environment, accessToken), expectedOptions('jenfu_prod', environment.POSTGRES_IAM_LOGIN))

  const runtimeEnvironment = {
    ...environment,
    POSTGRES_IAM_LOGIN: 'orgmaster-prod-runtime@jenfu-platform-prod.iam',
  }
  assert.deepEqual(databaseOptions(runtimeEnvironment, accessToken), {
    ...expectedOptions('jenfu_prod', runtimeEnvironment.POSTGRES_IAM_LOGIN),
    host: runtimeEnvironment.POSTGRES_SOCKET,
  })
})

test('database options preserve the same connection settings for explicit denied-database probes', () => {
  for (const deniedDatabase of ['jenfu_dev', 'jenfu_stg']) {
    assert.deepEqual(
      databaseOptions(environment, accessToken, deniedDatabase),
      expectedOptions(deniedDatabase, environment.POSTGRES_IAM_LOGIN),
    )
  }
})
