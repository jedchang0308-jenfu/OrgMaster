import assert from 'node:assert/strict'
import test from 'node:test'
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
import { TARGET } from './dev040-production-migration-runner.mjs'

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
  const entries = Array.from({ length: 11 }, (_, index) => {
    const sql = Buffer.from(`SELECT ${index + 1};\n`)
    return { order: index + 1, version: `dev040-orgmaster-${String(index + 1).padStart(3, '0')}`, name: `migration_${index + 1}`, path: `db/migrations/${String(index + 1).padStart(3, '0')}.sql`, sourceSha256: sha256(sql), appliedSha256: sha256(sql), sqlBase64: sql.toString('base64') }
  })
  const core = { schemaVersion: 'jenfu.dev012.migration-bundle.v1', ownerApplicationId: TARGET.ownerApplicationId, sourceRevision: H40, projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod', ledger: TARGET.ledger, baselineCount: TARGET.baselineCount, entries }
  const bundle = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`)
  return { bundle, bytes, bundleSha256: sha256(bytes) }
}

test('S1B-21 OrgMaster runner accepts only exact production target and refs', () => {
  assert.equal(assertRunnerTarget(environment, TARGET).database, 'jenfu_prod')
  assert.throws(() => assertRunnerTarget({ ...environment, POSTGRES_DATABASE: 'jenfu_stg' }, TARGET), /TARGET_MISMATCH/)
  assert.equal(parseGsUri(`gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, TARGET.releaseBucket, 'source/migration-bundles').object, 'source/migration-bundles/a.json')
  assert.throws(() => parseGsUri('gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/a.json', TARGET.releaseBucket, 'source/migration-bundles'), /GCS_REF_INVALID/)
  const args = ['--bundle-ref', `gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, '--bundle-sha256', 'b'.repeat(64), '--source-revision', H40, '--output-ref', `gs://${TARGET.releaseBucket}/receipts/r/migrate.json`, '--data-ref', `gs://${TARGET.releaseBucket}/source/production-data/REL-001/data.json`, '--data-sha256', 'c'.repeat(64), '--bootstrap-ref', `gs://${TARGET.releaseBucket}/receipts/releases/REL-001/first-principal-bootstrap.json`, '--bootstrap-sha256', 'd'.repeat(64)]
  assert.equal(parseRunnerArgs(args, { productionDataRequired: true }).sourceRevision, H40)
  assert.throws(() => parseRunnerArgs(args.slice(0, 8), { productionDataRequired: true }), /MIGRATION_ARGUMENT_INVALID/)
  assert.throws(() => parseRunnerArgs(args), /MIGRATION_ARGUMENT_INVALID/)
  assert.equal(crc32cBase64(Buffer.from('123456789')), '4waSgw==')
})

test('S1B-21 OrgMaster runner validates ten-row baseline and appends only 011', async () => {
  const input = fixture()
  assertMigrationBundle(input.bundle, { target: TARGET, sourceRevision: H40, bundleSha256: input.bundleSha256, bytes: input.bytes })
  let ledger = input.bundle.entries.slice(0, TARGET.baselineCount).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: 'prior' }))
  assert.equal(planMigration(input.bundle, ledger).length, 1)
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
  const receipt = await executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-08T00:00:00.000Z' })
  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.applied, 1)
  assert.equal(ledger.length, 11)
  assert.equal(statements.filter((value) => value === 'BEGIN').length, 1)
  const second = await executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-08T00:00:01.000Z' })
  assert.equal(second.applied, 0)
  const missing = ledger.slice(1)
  assert.throws(() => planMigration(input.bundle, missing), /LEDGER_PREFIX_MISMATCH|BASELINE_INCOMPLETE/)
})
