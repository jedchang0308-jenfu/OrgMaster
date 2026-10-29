import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { createLedger, executeMigration, verifyNoSessions } from './dev060-local-native-bootstrap-owner.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const REVISION = 'a'.repeat(40)
const MIGRATION_SQL = 'ALTER TABLE orgmaster_core.sample ADD COLUMN local_value text;'
const LEDGER_COLUMNS = [
  ['version', 'text', null], ['name', 'text', null], ['checksum_sha256', 'character', 64],
  ['source_revision', 'text', null], ['applied_at', 'timestamp with time zone', null],
]
const RECEIPT_COLUMNS = [
  ['source_path', 'text', null], ['source_sha256', 'character', 64], ['applied_sha256', 'character', 64],
  ['source_revision', 'text', null], ['applied_at', 'timestamp with time zone', null],
]
const asColumnRows = columns => columns.map(([column_name, data_type, character_maximum_length]) => ({
  column_name, data_type, character_maximum_length, is_nullable: 'NO',
}))

class FakeClient {
  constructor({ ledgerRows = [], receiptRows = [], sessions = 0, legacySessions = 0,
    sessionTables = ['orgmaster_core.app_sessions'], nativeLedgerRows = [],
    badLedgerShape = false, failOn = null, legacyView = false } = {}) {
    this.ledgerRows = ledgerRows
    this.receiptRows = receiptRows
    this.sessions = sessions
    this.legacySessions = legacySessions
    this.sessionTables = sessionTables
    this.legacyView = legacyView
    this.nativeLedgerRows = nativeLedgerRows
    this.badLedgerShape = badLedgerShape
    this.failOn = failOn
    this.calls = []
  }

  async query(sql, values = []) {
    const normalized = sql.replace(/\s+/gu, ' ').trim()
    this.calls.push({ sql: normalized, values })
    if (normalized.startsWith('SELECT current_database()')) {
      return { rows: [{ database_name: 'jenfu_local_orgmaster', address: '127.0.0.1' }] }
    }
    if (normalized === 'BEGIN' || normalized.startsWith('BEGIN ISOLATION LEVEL ') || normalized === 'COMMIT' || normalized === 'ROLLBACK' ||
        normalized === 'SET LOCAL ROLE jenfu_orgmaster_migrator') return { rows: [] }
    if (normalized.startsWith('CREATE TABLE IF NOT EXISTS orgmaster_core.schema_migrations') ||
        normalized.startsWith('CREATE TABLE IF NOT EXISTS orgmaster_core.local_native_bootstrap_receipts') ||
        normalized.startsWith('CREATE TABLE orgmaster_core.schema_migrations')) return { rows: [] }
    if (normalized.startsWith('REVOKE ALL ON TABLE orgmaster_core.local_native_bootstrap_receipts')) return { rows: [] }
    if (normalized.includes('FROM information_schema.columns')) {
      const table = values[0]
      if (table === 'schema_migrations') {
        const columns = this.badLedgerShape ? LEDGER_COLUMNS.slice(0, -1) : LEDGER_COLUMNS
        return { rows: asColumnRows(columns) }
      }
      if (table === 'local_native_bootstrap_receipts') return { rows: asColumnRows(RECEIPT_COLUMNS) }
    }
    if (normalized.startsWith('SELECT pg_get_userbyid(c.relowner)')) {
      return { rows: [{ owner: 'jenfu_orgmaster_migrator', has_non_owner_grant: false }] }
    }
    if (normalized.startsWith('SELECT n.nspname AS schema_name,c.relname,c.relkind')) {
      const rows = this.sessionTables.map(qualifiedName => {
        const [schema_name, relname] = qualifiedName.split('.')
        return { schema_name, relname, relkind: this.legacyView && schema_name === 'orgmaster' ? 'v' : 'r' }
      })
      if (this.nativeLedgerRows !== null) rows.push({ schema_name: 'orgmaster_core', relname: 'schema_migrations', relkind: 'r' })
      return { rows }
    }
    if (normalized.startsWith('SELECT version,name,btrim(checksum_sha256)')) {
      return { rows: this.ledgerRows.filter(row => row.version === values[0]) }
    }
    if (normalized.startsWith('SELECT source_path, btrim(source_sha256)')) {
      return { rows: this.receiptRows.filter(row => row.source_path === values[0]) }
    }
    if (normalized === 'SELECT count(*)::int AS row_count FROM orgmaster.app_sessions') return { rows: [{ row_count: this.legacySessions }] }
    if (normalized === 'SELECT count(*)::int AS row_count FROM orgmaster_core.app_sessions') return { rows: [{ row_count: this.sessions }] }
    if (normalized === 'SELECT count(*)::int AS row_count FROM orgmaster_core.schema_migrations') {
      return { rows: [{ row_count: this.nativeLedgerRows?.length ?? 0 }] }
    }
    if (normalized === MIGRATION_SQL) return { rows: [] }
    if (normalized.startsWith('INSERT INTO orgmaster_core.schema_migrations')) {
      this.ledgerRows.push({ version: values[0], name: values[1], applied_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO orgmaster_core.local_native_bootstrap_receipts')) {
      if (this.failOn === 'receipt-insert') throw Object.assign(new Error(`permission denied while executing ${normalized}`), { code: '42501' })
      this.receiptRows.push({ source_path: values[0], source_sha256: values[1], applied_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    }
    throw new Error(`Unexpected fake query: ${normalized}`)
  }
}

function nativeEntry() {
  return { owner: 'orgmaster', version: 'native-1', name: 'native bootstrap', appliedSha256: sha256(MIGRATION_SQL),
    path: 'scripts/lib/native-orgmaster-bootstrap.sql', sql: MIGRATION_SQL }
}

function localEntry() {
  const source = '-- local source bytes for OrgMaster 042\n'
  return { owner: 'orgmaster', version: 'local-042', name: 'local session binding', localOnly: true,
    path: 'db/migrations/local/042_dev060_local_principal_session_binding.sql', sourceSha256: sha256(source),
    appliedSha256: sha256(MIGRATION_SQL), sql: MIGRATION_SQL }
}

test('createLedger uses IF NOT EXISTS and accepts only the expected ledger column shape', async () => {
  const client = new FakeClient()
  const audit = { bootstrapObjects: [] }
  await createLedger(client, REVISION, audit)
  assert.ok(client.calls.some(call => call.sql.startsWith('CREATE TABLE IF NOT EXISTS orgmaster_core.schema_migrations')))
  assert.deepEqual(audit.bootstrapObjects, [{ owner: 'jenfu_orgmaster_migrator', object: 'orgmaster_core.schema_migrations', sourceRevision: REVISION }])

  const invalid = new FakeClient({ badLedgerShape: true })
  await assert.rejects(createLedger(invalid, REVISION, { bootstrapObjects: [] }), { code: 'LOCAL_NATIVE_ORGMASTER_LEDGER_SHAPE_INVALID' })
  assert.ok(invalid.calls.some(call => call.sql === 'ROLLBACK'))
})

test('native migration reuses an exact ledger row without running callbacks or DDL', async () => {
  const entry = nativeEntry()
  const client = new FakeClient({ ledgerRows: [{ version: entry.version, name: entry.name,
    applied_sha256: entry.appliedSha256, source_revision: REVISION }] })
  let beforeCalls = 0
  const result = await executeMigration(client, entry, REVISION, { before: async () => { beforeCalls += 1 } })
  assert.deepEqual(result, { reused: true })
  assert.equal(beforeCalls, 0)
  assert.equal(client.calls.some(call => call.sql === MIGRATION_SQL), false)
  assert.equal(client.calls.some(call => call.sql.startsWith('INSERT INTO orgmaster_core.schema_migrations')), false)
  assert.ok(client.calls.some(call => call.sql === 'COMMIT'))
})

test('native migration inserts its own ledger row atomically when absent', async () => {
  const entry = nativeEntry()
  const client = new FakeClient()
  let beforeCalls = 0
  const result = await executeMigration(client, entry, REVISION, { before: async () => { beforeCalls += 1 } })
  assert.deepEqual(result, { reused: false })
  assert.equal(beforeCalls, 1)
  const migrationIndex = client.calls.findIndex(call => call.sql === MIGRATION_SQL)
  const ledgerIndex = client.calls.findIndex(call => call.sql.startsWith('INSERT INTO orgmaster_core.schema_migrations'))
  const commitIndex = client.calls.findIndex(call => call.sql === 'COMMIT')
  assert.ok(migrationIndex >= 0 && ledgerIndex > migrationIndex && commitIndex > ledgerIndex)
  assert.deepEqual(client.ledgerRows, [{ version: entry.version, name: entry.name,
    applied_sha256: entry.appliedSha256, source_revision: REVISION }])
})

test('native ledger name, checksum, or source revision conflicts fail closed and roll back', async () => {
  const entry = nativeEntry()
  const conflicts = [
    { version: entry.version, name: 'different name', applied_sha256: entry.appliedSha256, source_revision: REVISION },
    { version: entry.version, name: entry.name, applied_sha256: 'f'.repeat(64), source_revision: REVISION },
    { version: entry.version, name: entry.name, applied_sha256: entry.appliedSha256, source_revision: 'b'.repeat(40) },
  ]
  for (const row of conflicts) {
    const client = new FakeClient({ ledgerRows: [row] })
    await assert.rejects(executeMigration(client, entry, REVISION), error => {
      assert.equal(error.code, 'LOCAL_NATIVE_ORGMASTER_MIGRATION_LEDGER_CONFLICT')
      assert.equal(error.sourcePath, entry.path)
      assert.equal(error.message.includes(MIGRATION_SQL), false)
      return true
    })
    assert.equal(client.calls.some(call => call.sql === MIGRATION_SQL), false)
    assert.ok(client.calls.some(call => call.sql === 'ROLLBACK'))
    assert.equal(client.calls.some(call => call.sql === 'COMMIT'), false)
  }
})

test('local-only migration reuses an exact local receipt and never touches the native ledger', async () => {
  const entry = localEntry()
  const client = new FakeClient({ receiptRows: [{ source_path: entry.path, source_sha256: entry.sourceSha256,
    applied_sha256: entry.appliedSha256, source_revision: REVISION }] })
  let beforeCalls = 0
  const result = await executeMigration(client, entry, REVISION, { before: async () => { beforeCalls += 1 } })
  assert.deepEqual(result, { reused: true })
  assert.equal(beforeCalls, 0)
  assert.equal(client.calls.some(call => call.sql === MIGRATION_SQL), false)
  assert.equal(client.calls.some(call => call.sql.startsWith('INSERT INTO orgmaster_core.schema_migrations')), false)
  assert.ok(client.calls.some(call => call.sql.startsWith('CREATE TABLE IF NOT EXISTS orgmaster_core.local_native_bootstrap_receipts')))
})

test('local-only receipt source, applied checksum, and source revision conflicts fail closed', async () => {
  const entry = localEntry()
  const conflicts = [
    { source_path: entry.path, source_sha256: 'f'.repeat(64), applied_sha256: entry.appliedSha256, source_revision: REVISION },
    { source_path: entry.path, source_sha256: entry.sourceSha256, applied_sha256: 'f'.repeat(64), source_revision: REVISION },
    { source_path: entry.path, source_sha256: entry.sourceSha256, applied_sha256: entry.appliedSha256, source_revision: 'b'.repeat(40) },
  ]
  for (const row of conflicts) {
    const client = new FakeClient({ receiptRows: [row] })
    let beforeCalls = 0
    await assert.rejects(executeMigration(client, entry, REVISION, { before: async () => { beforeCalls += 1 } }), error => {
      assert.equal(error.code, 'LOCAL_NATIVE_ORGMASTER_LOCAL_RECEIPT_CONFLICT')
      assert.equal(error.sourcePath, entry.path)
      assert.equal(error.message.includes(MIGRATION_SQL), false)
      return true
    })
    assert.equal(beforeCalls, 0)
    assert.equal(client.calls.some(call => call.sql === MIGRATION_SQL), false)
    assert.ok(client.calls.some(call => call.sql === 'ROLLBACK'))
  }
})

test('a new local-only migration stores only its local receipt and commits after the SQL', async () => {
  const entry = localEntry()
  const client = new FakeClient()
  let beforeCalls = 0
  const result = await executeMigration(client, entry, REVISION, { before: async () => { beforeCalls += 1 } })
  assert.deepEqual(result, { reused: false })
  assert.equal(beforeCalls, 1)
  const migrationIndex = client.calls.findIndex(call => call.sql === MIGRATION_SQL)
  const receiptIndex = client.calls.findIndex(call => call.sql.startsWith('INSERT INTO orgmaster_core.local_native_bootstrap_receipts'))
  const commitIndex = client.calls.findIndex(call => call.sql === 'COMMIT')
  assert.ok(migrationIndex >= 0 && receiptIndex > migrationIndex && commitIndex > receiptIndex)
  assert.deepEqual(client.receiptRows, [{ source_path: entry.path, source_sha256: entry.sourceSha256,
    applied_sha256: entry.appliedSha256, source_revision: REVISION }])
  assert.equal(client.calls.some(call => call.sql.startsWith('INSERT INTO orgmaster_core.schema_migrations')), false)
})

test('local-only SQL and receipt share one transaction, with sanitized database failure on rollback', async () => {
  const entry = localEntry()
  const client = new FakeClient({ failOn: 'receipt-insert' })
  await assert.rejects(executeMigration(client, entry, REVISION), error => {
    assert.equal(error.code, 'LOCAL_NATIVE_ORGMASTER_MIGRATION_FAILED')
    assert.equal(error.owner, 'orgmaster')
    assert.equal(error.sourcePath, entry.path)
    assert.equal(error.databaseCode, '42501')
    assert.equal(error.message.includes(MIGRATION_SQL), false)
    return true
  })
  const migrationIndex = client.calls.findIndex(call => call.sql === MIGRATION_SQL)
  const receiptIndex = client.calls.findIndex(call => call.sql.startsWith('INSERT INTO orgmaster_core.local_native_bootstrap_receipts'))
  const rollbackIndex = client.calls.findIndex(call => call.sql === 'ROLLBACK')
  assert.ok(migrationIndex >= 0 && receiptIndex > migrationIndex && rollbackIndex > receiptIndex)
  assert.equal(client.calls.some(call => call.sql === 'COMMIT'), false)
  assert.equal(client.calls.some(call => call.sql.startsWith('INSERT INTO orgmaster_core.schema_migrations')), false)
})

test('verifyNoSessions admits the pre-foundation phase only when the OrgMaster ledger is absent or empty', async () => {
  for (const nativeLedgerRows of [null, []]) {
    const initial = new FakeClient({ sessionTables: [], nativeLedgerRows })
    assert.deepEqual(await verifyNoSessions(initial), { sessions: 0, phase: 'before-native-session-foundation' })
    assert.equal(initial.calls.some(call => call.sql.includes('platform_core') || call.sql.includes('ai_pdm_core')), false)
    assert.ok(initial.calls.some(call => call.sql === 'COMMIT'))
  }

  const appliedButMissing = new FakeClient({ sessionTables: [], nativeLedgerRows: [{ version: '001' }] })
  await assert.rejects(verifyNoSessions(appliedButMissing), { code: 'LOCAL_NATIVE_ORGMASTER_SESSION_FOUNDATION_DRIFT' })
  assert.ok(appliedButMissing.calls.some(call => call.sql === 'SELECT count(*)::int AS row_count FROM orgmaster_core.schema_migrations'))
  assert.equal(appliedButMissing.calls.some(call => call.sql.startsWith('SELECT count(*)::int AS row_count FROM') && call.sql.includes('app_sessions')), false)
  assert.ok(appliedButMissing.calls.some(call => call.sql === 'ROLLBACK'))
})

test('verifyNoSessions counts every present OrgMaster session table and rejects legacy rows', async () => {
  const empty = new FakeClient({ sessions: 0, legacySessions: 0,
    sessionTables: ['orgmaster.app_sessions', 'orgmaster_core.app_sessions'] })
  assert.deepEqual(await verifyNoSessions(empty), { sessions: 0 })
  assert.ok(empty.calls.some(call => call.sql === 'SELECT count(*)::int AS row_count FROM orgmaster.app_sessions'))
  assert.ok(empty.calls.some(call => call.sql === 'SELECT count(*)::int AS row_count FROM orgmaster_core.app_sessions'))
  assert.equal(empty.calls.some(call => call.sql.includes('platform_core') || call.sql.includes('ai_pdm_core')), false)

  const legacyRows = new FakeClient({ sessions: 0, legacySessions: 1,
    sessionTables: ['orgmaster.app_sessions', 'orgmaster_core.app_sessions'] })
  await assert.rejects(verifyNoSessions(legacyRows), { code: 'LOCAL_NATIVE_ORGMASTER_SESSIONS_PRESENT' })
  assert.ok(legacyRows.calls.some(call => call.sql === 'ROLLBACK'))
})

test('migration 010 compatibility view requires the real core session table and its complete zero-row readback', async () => {
  const options = {legacyView:true,sessionTables:['orgmaster.app_sessions','orgmaster_core.app_sessions']}
  assert.deepEqual(await verifyNoSessions(new FakeClient(options)),{sessions:0})
  await assert.rejects(verifyNoSessions(new FakeClient({...options,sessions:1})),{code:'LOCAL_NATIVE_ORGMASTER_SESSIONS_PRESENT'})
  await assert.rejects(verifyNoSessions(new FakeClient({legacyView:true,sessionTables:['orgmaster.app_sessions']})),{code:'LOCAL_NATIVE_ORGMASTER_SESSION_FOUNDATION_DRIFT'})
})
