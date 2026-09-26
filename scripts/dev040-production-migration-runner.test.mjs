import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertMigrationBundle,
  assertRunnerTarget,
  canonicalize,
  crc32cBase64,
  executeProductionMigration,
  parseGsUri,
  parseRunnerArgs,
  planMigration,
  sha256,
} from './lib/dev012-production-migration-runner.mjs'
import { TARGET, runMain } from './dev040-production-migration-runner.mjs'

const H40 = 'a'.repeat(40)
const environment = {
  OWNER_APPLICATION_ID: TARGET.ownerApplicationId,
  RELEASE_BUCKET: TARGET.releaseBucket,
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
  GOOGLE_CLOUD_REGION: 'asia-east1',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_DATABASE: 'jenfu_prod',
  POSTGRES_IAM_LOGIN: TARGET.login,
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  CLOUD_RUN_JOB: TARGET.job,
}

function fixture() {
  const entries = Array.from({ length: TARGET.entryCount }, (_, index) => {
    const sql = Buffer.from(`SELECT ${index + 1};\n`)
    return { order: index + 1, version: `dev040-orgmaster-${String(index + 1).padStart(3, '0')}`, name: `migration_${index + 1}`, path: `db/migrations/${String(index + 1).padStart(3, '0')}.sql`, sourceSha256: sha256(sql), appliedSha256: sha256(sql), sqlBase64: sql.toString('base64') }
  })
  const core = { schemaVersion: 'jenfu.dev012.migration-bundle.v1', ownerApplicationId: TARGET.ownerApplicationId, sourceRevision: H40, projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod', ledger: TARGET.ledger, baselineCount: TARGET.baselineCount, entries }
  const bundle = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`)
  return { bundle, bytes, bundleSha256: sha256(bytes) }
}

test('DEV-014 runner entry count is derived from the controlled production profile', () => {
  const profile = JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json', import.meta.url), 'utf8'))
  assert.equal(TARGET.entryCount, profile.migrations.entries.length)
  assert.equal(profile.migrations.entries.at(-1).version, 'dev057-orgmaster-027')
})

test('S1B-21 OrgMaster runner accepts only exact production target and refs', () => {
  assert.equal(assertRunnerTarget(environment, TARGET).database, 'jenfu_prod')
  assert.throws(() => assertRunnerTarget({ ...environment, POSTGRES_DATABASE: 'jenfu_stg' }, TARGET), /TARGET_MISMATCH/)
  assert.equal(parseGsUri(`gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, TARGET.releaseBucket, 'source/migration-bundles').object, 'source/migration-bundles/a.json')
  assert.throws(() => parseGsUri('gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/a.json', TARGET.releaseBucket, 'source/migration-bundles'), /GCS_REF_INVALID/)
  const args = ['--bundle-ref', `gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, '--bundle-sha256', 'b'.repeat(64), '--source-revision', H40, '--output-ref', `gs://${TARGET.releaseBucket}/receipts/r/migrate.json`, '--data-ref', `gs://${TARGET.releaseBucket}/source/production-data/REL-001/data.json`, '--data-sha256', 'c'.repeat(64), '--bootstrap-ref', `gs://${TARGET.releaseBucket}/receipts/releases/REL-001/first-principal-bootstrap.json`, '--bootstrap-sha256', 'd'.repeat(64)]
  assert.equal(parseRunnerArgs(args.slice(0, 8)).sourceRevision, H40)
  assert.throws(() => parseRunnerArgs(args.slice(0, 6)), /MIGRATION_ARGUMENT_INVALID/)
  assert.throws(() => parseRunnerArgs(args), /MIGRATION_ARGUMENT_INVALID/)
  assert.equal(crc32cBase64(Buffer.from('123456789')), '4waSgw==')
})

test('OrgMaster runner validates the ten-row baseline and appends only 011-027', async () => {
  const input = fixture()
  assertMigrationBundle(input.bundle, { target: TARGET, sourceRevision: H40, bundleSha256: input.bundleSha256, bytes: input.bytes })
  let ledger = input.bundle.entries.slice(0, TARGET.baselineCount).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: 'prior' }))
  assert.equal(planMigration(input.bundle, ledger).length, 17)
  const statements = []
  const database = {
    async query(sql, values) {
      statements.push(sql)
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map((schema_name) => ({ schema_name, can_use: false })) }
      if (sql.includes('FROM pg_catalog.pg_class')) return { rows: [{ exists: true }] }
      if (sql.includes('ORDER BY applied_at')) return { rows: ledger.map((row) => ({ ...row })) }
      if (sql.startsWith('INSERT INTO')) ledger.push({ version: values[0], name: values[1], checksum_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    },
  }
  const receipt = await executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-08T00:00:00.000Z' })
  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.applied, 17)
  assert.equal(ledger.length, 27)
  assert.equal(statements.filter((value) => value === 'BEGIN').length, 17)
  const second = await executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-08T00:00:01.000Z' })
  assert.equal(second.applied, 0)
  const missing = ledger.slice(1)
  assert.throws(() => planMigration(input.bundle, missing), /LEDGER_PREFIX_MISMATCH|BASELINE_INCOMPLETE/)
})

test('S1B-21 OrgMaster schema runner rejects an empty or changed baseline without writes', async () => {
  const input = fixture()
  let ledger = []
  const statements = []
  const database = {
    async query(sql, values) {
      statements.push(sql)
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map((schema_name) => ({ schema_name, can_use: false })) }
      if (sql.includes('ORDER BY applied_at')) return { rows: ledger.map((row) => ({ ...row })) }
      if (sql.startsWith('INSERT INTO')) ledger.push({ version: values[0], name: values[1], checksum_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    },
  }
  const execute = () => executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true })
  await assert.rejects(execute, /MIGRATION_BASELINE_INCOMPLETE/)
  ledger = input.bundle.entries.slice(0, 10).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256 }))
  ledger[0].checksum_sha256 = 'f'.repeat(64)
  await assert.rejects(execute, /MIGRATION_LEDGER_PREFIX_MISMATCH/)
  database.query = async (sql) => {
    statements.push(sql)
    if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
    if (sql.includes('ORDER BY applied_at')) throw Object.assign(new Error('missing relation'), { code: '42P01' })
    return { rows: [] }
  }
  await assert.rejects(execute, /MIGRATION_BASELINE_MISSING/)
  assert.equal(statements.some((sql) => /^(BEGIN|CREATE|ALTER|INSERT|UPDATE|DELETE|REVOKE)/u.test(sql)), false)
})

test('schema runner rejects bootstrap arguments before credential, network or database access', async () => {
  await assert.rejects(() => runMain({ argv: ['--bootstrap-ref', 'gs://irrelevant'], fetchImpl: () => assert.fail('must not fetch credentials'), Client: class { constructor() { assert.fail('must not connect') } } }), /MIGRATION_ARGUMENT_INVALID/)
})

test('schema runner entrypoint migrates and publishes without reading or importing business data', async () => {
  const input = fixture()
  const requests = [], statements = []
  const ledger = input.bundle.entries.slice(0, 10).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256 }))
  let published
  class Client {
    constructor(options) { this.options = options }
    async connect() { if (this.options.database !== 'jenfu_prod') throw new Error('denied') }
    async end() {}
    async query(sql, values) {
      statements.push(sql)
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map((schema_name) => ({ schema_name, can_use: false })) }
      if (sql.includes('ORDER BY applied_at')) return { rows: ledger.map((row) => ({ ...row })) }
      if (sql.startsWith('INSERT INTO')) ledger.push({ version: values[0], name: values[1], checksum_sha256: values[2] })
      return { rows: [] }
    }
  }
  const fetchImpl = async (url, options = {}) => {
    requests.push(String(url))
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'x'.repeat(30), expires_in: 3600 })
    if (options.method === 'POST') { published = Buffer.from(options.body); return Response.json({ generation: '2' }) }
    const bytes = String(url).includes('migration-bundles') ? input.bytes : published
    assert.ok(bytes, 'only bundle and published receipt may be requested')
    return String(url).includes('alt=media') ? new Response(bytes) : Response.json({ generation: bytes === input.bytes ? '1' : '2', crc32c: crc32cBase64(bytes) })
  }
  const argv = ['--bundle-ref', `gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, '--bundle-sha256', input.bundleSha256, '--source-revision', H40, '--output-ref', `gs://${TARGET.releaseBucket}/receipts/schema.json`]
  const result = await runMain({ argv, environment, Client, fetchImpl })
  assert.equal(result.applied, 17)
  assert.equal(result.productionData, undefined)
  assert.equal(result.ledgerBootstrap, undefined)
  assert.equal(requests.some((url) => /production-data|bootstrap/u.test(url)), false)
  assert.equal(statements.filter((sql) => sql.startsWith('INSERT INTO')).length, 17)
  assert.equal(statements.some((sql) => /principal|governance|active_authority/u.test(sql)), false)
})
