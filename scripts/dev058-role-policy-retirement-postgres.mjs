import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { startDisposablePostgres } from './lib/dev014-disposable-postgres.mjs'

// Explicit native invocation only; no external DB URL or caller-selected target.
const session = process.env.ORGMASTER_DEV058_GOVERNOR_SESSION
assert.match(session ?? '', /^[a-f0-9-]{36}$/u, 'An active task-owned Governor session is required')
const root = process.cwd()
const output = path.join(root, 'output/qa/dev-058', `native-retirement-${Date.now()}-${randomUUID().slice(0, 8)}`)
fs.mkdirSync(output, { recursive: true })
const initial = fs.readFileSync('db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql', 'utf8')
const retirement = fs.readFileSync('db/migrations/036_dev058_retire_unused_role_policy_readiness.sql', 'utf8')
const hash = text => createHash('sha256').update(text).digest('hex')
const governor = 'C:/Users/user/.codex/skills/ai-dev-resource-governor/scripts/resource_governor.py'
const checks = []
let handle, startToken, registered = false, cleanup

function runtime(action) {
  const args = [governor, '--agent-host', 'codex', '--format', 'json', 'session', 'runtime', action,
    '--session', session, '--pid', String(handle.process.pid), '--start-token', startToken]
  if (action === 'register') args.push('--executable', handle.process.command,
    '--purpose', 'DEV-058 initial-state-only readiness retirement native checks',
    '--cleanup-condition', 'exact task cluster stopped, private port released and task directory removed', '--port', String(handle.port))
  else args.push('--reason', 'stopped')
  return JSON.parse(execFileSync('python', args, { encoding: 'utf8', windowsHide: true }))
}

try {
  handle = await startDisposablePostgres({ purpose: 'DEV-058 readiness retirement: exact 034/036, isolated PG only' })
  const pid = handle.process.pid
  startToken = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`], { encoding: 'utf8', windowsHide: true }).trim()
  runtime('register'); registered = true
  console.log(JSON.stringify({ runtime: { pid, startToken, port: handle.port, taskRoot: handle.taskRoot,
    host: handle.host, database: handle.databaseName, purpose: 'DEV-058 034/036 native retirement', production: false } }))
  const owner = handle.client
  await owner.query(`CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
    CREATE ROLE jenfu_orgmaster_runtime LOGIN;
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE ROLE jenfu_platform_runtime NOLOGIN;`)

  async function setup() {
    await owner.query('ROLLBACK; RESET ROLE; DROP SCHEMA IF EXISTS orgmaster_contract CASCADE; DROP SCHEMA IF EXISTS orgmaster_core CASCADE;')
    await owner.query(`CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
      CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
      SET ROLE jenfu_orgmaster_migrator;
      CREATE TABLE orgmaster_core.contract_manifest (
        contract_id text PRIMARY KEY, contract_version text NOT NULL,
        signature_sha256 text NOT NULL, payload_sha256 text);
      INSERT INTO orgmaster_core.contract_manifest VALUES ('fixture.other-contract','fixture.v1','unchanged',NULL);
      RESET ROLE;`)
    await owner.query(initial)
  }
  async function state() {
    return (await owner.query(`SELECT to_jsonb(c) AS declaration,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY contract_id) FROM orgmaster_core.contract_manifest m) AS manifests
      FROM orgmaster_core.ai_pdm_role_policy_compatibility c`)).rows
  }
  async function check(id, work) {
    try { await setup(); await work(); checks.push({ id, status: 'PASS' }); console.log(`PASS ${id}`) }
    catch (error) { await owner.query('ROLLBACK').catch(() => undefined); checks.push({ id, status: 'FAIL', code: error.code ?? null, message: error.message }); console.error(`FAIL ${id}: ${error.message}`) }
  }
  await check('cold-declaration-only-withdrawal', async () => {
    await owner.query(retirement)
    const row = (await owner.query(`SELECT to_regclass('orgmaster_core.ai_pdm_role_policy_compatibility') AS state,
      to_regclass('orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2') AS view`)).rows[0]
    assert.deepEqual(row, { state: null, view: null })
    assert.deepEqual((await owner.query('SELECT contract_id FROM orgmaster_core.contract_manifest')).rows, [{ contract_id: 'fixture.other-contract' }])
  })
  await check('configured-declaration-preserved', async () => {
    await owner.query("UPDATE orgmaster_core.ai_pdm_role_policy_compatibility SET accepted_registry_hash=repeat('a',64)")
    const before = await state()
    await assert.rejects(owner.query(retirement), /DEV058_CONFIGURED_COMPATIBILITY_REQUIRES_MIGRATION_PLAN/u)
    await owner.query('ROLLBACK')
    assert.deepEqual(await state(), before)
  })
  await check('enabled-declaration-preserved', async () => {
    await owner.query(`UPDATE orgmaster_core.ai_pdm_role_policy_compatibility SET readiness='READY',compatibility_revision=1,
      accepted_registry_hash=repeat('a',64),accepted_baseline_role_identity_hash=repeat('b',64),
      accepted_protected_policy_hash=repeat('c',64),consumer_source_revision=repeat('d',40),enablement_ref='fixture-only'`)
    const before = await state()
    await assert.rejects(owner.query(retirement), /DEV058_CONFIGURED_COMPATIBILITY_REQUIRES_MIGRATION_PLAN/u)
    await owner.query('ROLLBACK')
    assert.deepEqual(await state(), before)
  })
  await check('actual-runtime-login-cannot-migrate', async () => {
    const before = await state()
    const client = new pg.Client({ host: handle.host, port: handle.port, database: handle.databaseName, user: 'jenfu_orgmaster_runtime' })
    await client.connect()
    try { await assert.rejects(client.query(retirement), error => error.code === '42501') }
    finally { await client.query('ROLLBACK').catch(() => undefined); await client.end() }
    assert.deepEqual(await state(), before)
  })
} catch (error) {
  checks.push({ id: 'native-setup', status: 'FAIL', code: error.code ?? null, message: error.message })
} finally {
  if (handle) {
    fs.copyFileSync(path.join(handle.taskRoot, 'postgres.log'), path.join(output, 'postgres.log'))
    cleanup = await handle.cleanup()
    if (registered && cleanup.clusterStopped && cleanup.portReleased) runtime('release')
  }
  const passed = checks.length === 4 && checks.every(check => check.status === 'PASS')
  const clean = cleanup?.clientClosed && cleanup?.clusterStopped && cleanup?.portReleased && cleanup?.tempRemoved
  const report = { status: passed && clean ? 'PASS' : 'FAIL', source: { migration034: hash(initial), migration036: hash(retirement) },
    checks, cleanup, scope: 'isolated PG migration/ACL only; not manager behavior, normal SSO or bilateral acceptance', production: false }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ ...report, output }))
  if (report.status !== 'PASS') process.exitCode = 1
}
