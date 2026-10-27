import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

function dockerCopyDestinations(dockerfile) {
  const destinations = new Set()
  for (const line of dockerfile.split(/\r?\n/u)) {
    const parts = line.trim().split(/\s+/u)
    if (parts[0] !== 'COPY') continue
    const sources = parts.slice(1, -1)
    const target = parts.at(-1)
    const targetIsDirectory = sources.length > 1 || target === '.' || target === './' || target.endsWith('/')
    for (const source of sources) {
      destinations.add(targetIsDirectory ? path.posix.join(target, path.posix.basename(source)) : target)
    }
  }
  return destinations
}

function localStaticImports(source) {
  const imports = []
  const pattern = /^\s*(?:import|export)\s+(?:[^'";]*?\s+from\s*)?(['"])([^'"]+)\1/gmu
  for (const match of source.matchAll(pattern)) imports.push(match[2])
  return imports.filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../'))
}

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
  const profile = JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json', import.meta.url), 'utf8'))
  const n1c = JSON.parse(readFileSync(new URL('../config/dev-010/n1c-orgmaster.json', import.meta.url), 'utf8'))
  const files = new Map(profile.migrations.entries.map((entry) => [entry.path, readFileSync(path.join(repositoryRoot, entry.path))]))
  return buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, H40)
}

function ledgerFor(bundle, count, { sourceRevision = 'prior' } = {}) {
  return bundle.entries.slice(0, count).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: sourceRevision }))
}

function repackBundle(bundle) {
  const core = { ...bundle }
  delete core.manifestSha256
  const value = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${canonicalize(value)}\n`, 'utf8')
  return { bundle: value, bytes, bundleSha256: sha256(bytes) }
}

async function assertRunnerRejectsBundle(input, pattern) {
  let clientConstructed = false
  class Client {
    constructor() {
      clientConstructed = true
      throw new Error('database connection must not be attempted')
    }
  }
  const fetchImpl = async (url) => {
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'x'.repeat(30), expires_in: 3600 })
    return String(url).includes('alt=media')
      ? new Response(input.bytes)
      : Response.json({ generation: '1', crc32c: crc32cBase64(input.bytes) })
  }
  const argv = ['--bundle-ref', `gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, '--bundle-sha256', input.bundleSha256, '--source-revision', H40, '--output-ref', `gs://${TARGET.releaseBucket}/receipts/schema.json`]
  await assert.rejects(() => runMain({ argv, environment, Client, fetchImpl }), pattern)
  assert.equal(clientConstructed, false, 'invalid bundle must be rejected before database construction')
}

function fakeDatabase(ledger, statements, { missingLedger = false } = {}) {
  return {
    async query(sql, values) {
      statements.push(sql)
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map((schema_name) => ({ schema_name, can_use: false })) }
      if (sql.includes('ORDER BY applied_at')) {
        if (missingLedger) throw Object.assign(new Error('missing relation'), { code: '42P01' })
        return { rows: ledger.map((row) => ({ ...row })) }
      }
      if (sql.startsWith('INSERT INTO')) ledger.push({ version: values[0], name: values[1], checksum_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    },
  }
}

const writesStarted = (statements) => statements.some((sql) => /^\s*(?:BEGIN\b|CREATE\b|ALTER\b|DROP\b|INSERT\b|UPDATE\b|DELETE\b|GRANT\b|REVOKE\b)/imu.test(sql))

test('DEV-058/059 runner entry count matches the controlled production profile and real bundle', () => {
  const profile = JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json', import.meta.url), 'utf8'))
  assert.equal(TARGET.entryCount, profile.migrations.entries.length)
  assert.equal(TARGET.entryCount, 38)
  assert.equal(profile.migrations.baselineCount, 10)
  assert.deepEqual(TARGET.allowedExistingLedgerCounts, [31, 32, 33, 34, 35, 36, 37, 38])
  assert.deepEqual(profile.migrations.entries.slice(31).map((entry) => entry.version), ['dev058-orgmaster-034', 'dev058-orgmaster-035', 'dev058-orgmaster-036', 'dev058-orgmaster-037', 'dev059-orgmaster-038', 'dev065-orgmaster-039', 'dev065-orgmaster-040'])
  const input = fixture()
  assertMigrationBundle(input.bundle, { target: TARGET, sourceRevision: H40, bundleSha256: input.bundleSha256, bytes: input.bytes })
  assert.deepEqual(input.bundle.entries.slice(31).map(({ order, version, path, sourceSha256, appliedSha256 }) => ({ order, version, path, sourceSha256, appliedSha256 })), profile.migrations.entries.slice(31))
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

test('OrgMaster runner applies the full DEV-058/059 suffix and resumes only verified 31-38 row prefixes', async () => {
  const input = fixture()
  for (const count of [31, 32, 33, 34, 35, 36, 37, 38]) {
    const ledger = ledgerFor(input.bundle, count)
    assert.deepEqual(planMigration(input.bundle, ledger).map((entry) => entry.version), input.bundle.entries.slice(count).map((entry) => entry.version))
    const statements = []
    const receipt = await executeProductionMigration({ bundle: input.bundle, database: fakeDatabase(ledger, statements), target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-08T00:00:00.000Z' })
    assert.equal(receipt.status, 'PASS')
    assert.equal(receipt.applied, 38 - count)
    assert.equal(receipt.replayed, count)
    assert.equal(receipt.ledgerCount, 38)
    assert.equal(ledger.length, 38)
    assert.equal(statements.filter((value) => value === 'BEGIN').length, 38 - count)
  }
  const missing = ledgerFor(input.bundle, 38).slice(1)
  assert.throws(() => planMigration(input.bundle, missing), /LEDGER_PREFIX_MISMATCH|BASELINE_INCOMPLETE/)
})

test('OrgMaster pre-write ledger guard rejects 030/010/029/037 and invalid prefix fields', async () => {
  const input = fixture()
  for (const count of [30, 10, 29, 39]) {
    const ledger = ledgerFor(input.bundle, Math.min(count, 38))
    if (count === 39) ledger.push({ version: 'unexpected-extra', name: 'unexpected', checksum_sha256: 'f'.repeat(64), source_revision: 'prior' })
    const statements = []
    await assert.rejects(() => executeProductionMigration({ bundle: input.bundle, database: fakeDatabase(ledger, statements), target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true }), /MIGRATION_EXISTING_LEDGER_COUNT_INVALID/)
    assert.equal(writesStarted(statements), false, `count ${count} must be rejected before any write`)
  }
  const missingStatements = []
  await assert.rejects(() => executeProductionMigration({ bundle: input.bundle, database: fakeDatabase([], missingStatements, { missingLedger: true }), target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true }), /MIGRATION_BASELINE_MISSING/)
  assert.equal(writesStarted(missingStatements), false)
  for (const field of ['version', 'name', 'checksum_sha256']) {
    const corrupt = ledgerFor(input.bundle, 31)
    corrupt[30][field] = field === 'checksum_sha256' ? 'f'.repeat(64) : `wrong-${field}`
    const corruptStatements = []
    await assert.rejects(() => executeProductionMigration({ bundle: input.bundle, database: fakeDatabase(corrupt, corruptStatements), target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true }), /MIGRATION_LEDGER_PREFIX_MISMATCH/)
    assert.equal(writesStarted(corruptStatements), false, `${field} drift must fail before append SQL or ledger insert`)
  }
})

test('runner rejects rehashed prefix or 034-040 tampering before database construction', async () => {
  const input = fixture()
  const prefixEntries = input.bundle.entries.map((entry) => ({ ...entry }))
  const prefixSql = Buffer.concat([Buffer.from(prefixEntries[30].sqlBase64, 'base64'), Buffer.from('\n-- prefix tamper\n')])
  prefixEntries[30] = { ...prefixEntries[30], sqlBase64: prefixSql.toString('base64'), sourceSha256: sha256(prefixSql), appliedSha256: sha256(prefixSql) }
  await assertRunnerRejectsBundle(repackBundle({ ...input.bundle, entries: prefixEntries }), /MIGRATION_PREFIX_001_031_DRIFT/)
  for (const index of [31, 32, 33, 34]) {
    const entries = input.bundle.entries.map((entry) => ({ ...entry }))
    const sql = Buffer.concat([Buffer.from(entries[index].sqlBase64, 'base64'), Buffer.from(`\n-- suffix ${index + 1} tamper\n` )])
    entries[index] = { ...entries[index], path: entries[index].path.replace('.sql', '-tampered.sql'), sqlBase64: sql.toString('base64'), sourceSha256: sha256(sql), appliedSha256: sha256(sql) }
    await assertRunnerRejectsBundle(repackBundle({ ...input.bundle, entries }), /DEV058_MIGRATION_APPEND_INVALID/)
  }
  for (const index of [35, 36, 37]) {
    const entries = input.bundle.entries.map((entry) => ({ ...entry }))
    const sql = Buffer.concat([Buffer.from(entries[index].sqlBase64, 'base64'), Buffer.from(`\n-- suffix ${index + 1} tamper\n`)])
    entries[index] = { ...entries[index], path: entries[index].path.replace('.sql', '-tampered.sql'), sqlBase64: sql.toString('base64'), sourceSha256: sha256(sql), appliedSha256: sha256(sql) }
    await assertRunnerRejectsBundle(repackBundle({ ...input.bundle, entries }), /DEV059_MIGRATION_APPEND_INVALID/)
  }
  for (const index of [0, 30, 31, 32, 33, 34]) {
    const entries = input.bundle.entries.map(entry => ({ ...entry }))
    entries[index].name = 'wrong-ledger-name'
    await assertRunnerRejectsBundle(repackBundle({ ...input.bundle, entries }), /DEV058_MIGRATION_NAME_INVALID/)
  }
  for (const index of [35, 36, 37]) {
    const entries = input.bundle.entries.map(entry => ({ ...entry }))
    entries[index].name = 'wrong-ledger-name'
    await assertRunnerRejectsBundle(repackBundle({ ...input.bundle, entries }), /DEV059_MIGRATION_NAME_INVALID/)
  }
})

test('generic migration callers without the optional exact-count policy keep baseline behavior', async () => {
  const input = fixture()
  const target = { ...TARGET, allowedExistingLedgerCounts: undefined }
  const ledger = input.bundle.entries.slice(0, target.baselineCount).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: 'prior' }))
  const statements = []
  const receipt = await executeProductionMigration({ bundle: input.bundle, database: fakeDatabase(ledger, statements), target, sourceRevision: H40, denyDatabaseConnect: async () => true })
  assert.equal(receipt.applied, 28)
  assert.equal(receipt.ledgerCount, 38)
})

test('OrgMaster Job entrypoint forwards the exact-count policy and blocks a ten-row catch-up before publication', async () => {
  const input = fixture()
  const ledger = input.bundle.entries.slice(0, 10).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: 'prior' }))
  const statements = []
  const database = fakeDatabase(ledger, statements)
  class Client {
    async connect() {}
    async end() {}
    async query(sql, values) { return database.query(sql, values) }
  }
  let published = false
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'x'.repeat(30), expires_in: 3600 })
    if (options.method === 'POST') { published = true; return Response.json({ generation: '2' }) }
    const bytes = input.bytes
    return String(url).includes('alt=media') ? new Response(bytes) : Response.json({ generation: '1', crc32c: crc32cBase64(bytes) })
  }
  const argv = ['--bundle-ref', `gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, '--bundle-sha256', input.bundleSha256, '--source-revision', H40, '--output-ref', `gs://${TARGET.releaseBucket}/receipts/schema.json`]
  await assert.rejects(() => runMain({ argv, environment, Client, fetchImpl }), /MIGRATION_EXISTING_LEDGER_COUNT_INVALID/)
  assert.equal(writesStarted(statements), false)
  assert.equal(published, false)
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
  const genericTarget = { ...TARGET, allowedExistingLedgerCounts: undefined }
  const execute = () => executeProductionMigration({ bundle: input.bundle, database, target: genericTarget, sourceRevision: H40, denyDatabaseConnect: async () => true })
  await assert.rejects(execute, /MIGRATION_BASELINE_INCOMPLETE/)
  ledger = ledgerFor(input.bundle, 31)
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
  const ledger = ledgerFor(input.bundle, 31)
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
  assert.equal(result.applied, 7)
  assert.equal(result.productionData, undefined)
  assert.equal(result.ledgerBootstrap, undefined)
  assert.equal(requests.some((url) => /production-data|bootstrap/u.test(url)), false)
  assert.equal(statements.filter((sql) => sql.startsWith('INSERT INTO')).length, 7)
  assert.equal(ledger.length, 38)
  const businessReads = statements.filter((sql) => {
    const statement = sql.trimStart()
    return /^SELECT\b/iu.test(statement) &&
      !/^SELECT current_database\b/u.test(statement) &&
      !/^SELECT pg_advisory_(?:un)?lock\b/u.test(statement) &&
      !statement.includes('unnest(') &&
      !statement.includes('ORDER BY applied_at')
  })
  assert.deepEqual(businessReads, [])
})

test('migration runner Docker copies the migration and lifecycle readback static import closures', () => {
  const dockerfile = readFileSync(new URL('../infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile', import.meta.url), 'utf8')
  const copiedDestinations = dockerCopyDestinations(dockerfile)
  const visited = new Set()

  const visit = (modulePath) => {
    const normalizedPath = path.posix.normalize(modulePath)
    if (visited.has(normalizedPath)) return
    visited.add(normalizedPath)
    assert.ok(copiedDestinations.has(normalizedPath), `Dockerfile must copy ${normalizedPath} to its import path`)
    const absolutePath = path.join(repositoryRoot, ...normalizedPath.split('/'))
    assert.ok(existsSync(absolutePath), `repository module must exist: ${normalizedPath}`)
    const source = readFileSync(absolutePath, 'utf8')
    for (const specifier of localStaticImports(source)) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(normalizedPath), specifier))
      assert.ok(!dependency.startsWith('../'), `local import must stay inside repository: ${normalizedPath} -> ${specifier}`)
      visit(dependency)
    }
  }

  visit('scripts/dev040-production-migration-runner.mjs')
  visit('scripts/dev014-production-lifecycle-readback.mjs')
  assert.match(readFileSync(new URL('./dev040-production-migration-runner.mjs', import.meta.url), 'utf8'), /export const TARGET\s*=\s*Object\.freeze/u)
})
