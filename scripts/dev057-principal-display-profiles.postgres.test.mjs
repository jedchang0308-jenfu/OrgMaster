import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import pg from 'pg'

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin'
const TEMP_PREFIX = 'orgmaster-dev057-display-profile-'
const MIGRATION_PATH = new URL('../db/migrations/042_dev057_principal_display_profiles.sql', import.meta.url)

function postgresBinary(name) { return path.join(PG_BIN, name) }

function runPostgres(name, args, options = {}) {
  return execFileSync(postgresBinary(name), args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 2 * 1024 * 1024,
    ...(options.stdio ? { stdio: options.stdio } : {}),
  })
}

async function chooseLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function isLoopbackPortReleased(port) {
  if (!Number.isSafeInteger(port)) return true
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => resolve(true))
  })
}

async function exists(filename) {
  try { await stat(filename); return true } catch { return false }
}

function assertTaskOwnedTempRoot(taskRoot) {
  const resolved = path.resolve(taskRoot)
  const tempRoot = path.resolve(os.tmpdir())
  assert.equal(path.dirname(resolved), tempRoot, 'temporary PostgreSQL root must be directly under the OS temp directory')
  assert.ok(path.basename(resolved).startsWith(TEMP_PREFIX), 'temporary PostgreSQL root must have the task-owned prefix')
}

async function runAsRole(client, role, action) {
  assert.ok(['jenfu_platform_runtime', 'jenfu_orgmaster_runtime'].includes(role))
  await client.query(`SET ROLE ${role}`)
  try { return await action() } finally { await client.query('RESET ROLE') }
}

async function expectPermissionDenied(client, sql) {
  await assert.rejects(client.query(sql), (error) => error?.code === '42501')
}

test('DEV-057 principal display profile view exposes only unique active Principal/Employee names', async (t) => {
  assert.ok(['initdb.exe', 'pg_ctl.exe', 'postgres.exe'].every((name) => existsSync(postgresBinary(name))), `PostgreSQL 18 binaries missing at ${PG_BIN}`)

  let taskRoot
  let clusterDir
  let port
  let client
  let clusterStarted = false
  const cleanup = { clientClosed: false, postgresStopped: false, portReleased: false, tempRootRemoved: false }
  let cleanupFailure

  try {
    taskRoot = await mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX))
    assertTaskOwnedTempRoot(taskRoot)
    clusterDir = path.join(taskRoot, 'cluster')
    port = await chooseLoopbackPort()
    const logPath = path.join(taskRoot, 'postgres.log')

    runPostgres('initdb.exe', ['-D', clusterDir, '--auth=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
    runPostgres('pg_ctl.exe', ['-D', clusterDir, '-l', logPath, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
    clusterStarted = true

    client = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', connectionTimeoutMillis: 5_000 })
    await client.connect()
    const serverVersion = (await client.query('SHOW server_version')).rows[0].server_version
    assert.match(serverVersion, /^18\./u, `expected PostgreSQL 18, got ${serverVersion}`)

    await client.query(`
      CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
      CREATE ROLE jenfu_platform_runtime NOLOGIN;
      CREATE ROLE jenfu_orgmaster_runtime NOLOGIN;
      CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
      CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
      GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_platform_runtime, jenfu_orgmaster_runtime;
    `)
    await client.query('SET ROLE jenfu_orgmaster_migrator')
    await client.query(`
      CREATE TABLE orgmaster_core.persistence_authority (
        singleton boolean PRIMARY KEY,
        active_batch_id uuid
      );
      CREATE TABLE orgmaster_core.persistence_batches (
        id uuid PRIMARY KEY,
        status text NOT NULL
      );
      CREATE TABLE orgmaster_core.persistence_artifacts (
        batch_id uuid NOT NULL REFERENCES orgmaster_core.persistence_batches(id),
        artifact_key text NOT NULL,
        artifact_kind text NOT NULL,
        payload jsonb NOT NULL,
        PRIMARY KEY (batch_id, artifact_key)
      );
      CREATE TABLE orgmaster_core.synthetic_principal_mappings (
        principal_id text NOT NULL,
        employee_id text NOT NULL,
        employee_status text NOT NULL
      );
      CREATE VIEW orgmaster_contract.v_active_principal_mappings_v1 AS
        SELECT principal_id, employee_id, employee_status
          FROM orgmaster_core.synthetic_principal_mappings;
    `)
    await client.query('RESET ROLE')

    const migrationSql = await readFile(MIGRATION_PATH, 'utf8')
    await client.query(migrationSql)

    const activeBatchId = '00000000-0000-4000-8000-000000000001'
    await client.query('INSERT INTO orgmaster_core.persistence_batches(id, status) VALUES ($1, $2)', [activeBatchId, 'active'])
    await client.query('INSERT INTO orgmaster_core.persistence_authority(singleton, active_batch_id) VALUES (true, $1)', [activeBatchId])
    await client.query('INSERT INTO orgmaster_core.persistence_artifacts(batch_id, artifact_key, artifact_kind, payload) VALUES ($1, $2, $3, $4::jsonb)', [
      activeBatchId,
      'orgmaster-workspace.v1.json',
      'workspace-manifest',
      JSON.stringify({ currentVersionId: 'current-1' }),
    ])
    const workspaceVersion = {
      kind: 'document',
      state: {
        employees: [
          { id: 'employee-valid', name: '  林怡君  ', status: 'active' },
          { id: 'employee-inactive', name: '不應洩漏的停用姓名', status: 'inactive' },
          { id: 'employee-duplicate', name: '重複姓名甲', status: 'active' },
          { id: 'employee-duplicate', name: '重複姓名乙', status: 'active' },
          { id: 'employee-other', name: '另一位員工', status: 'active' },
        ],
      },
    }
    await client.query('INSERT INTO orgmaster_core.persistence_artifacts(batch_id, artifact_key, artifact_kind, payload) VALUES ($1, $2, $3, $4::jsonb)', [
      activeBatchId,
      'orgmaster-versions/current-1.json',
      'workspace-version',
      JSON.stringify(workspaceVersion),
    ])
    await client.query(`
      INSERT INTO orgmaster_core.synthetic_principal_mappings(principal_id, employee_id, employee_status) VALUES
        ('principal-valid', 'employee-valid', 'active'),
        ('principal-alias', 'employee-valid', 'active'),
        ('principal-alias', 'employee-valid', 'active'),
        ('principal-inactive', 'employee-inactive', 'inactive'),
        ('principal-duplicate', 'employee-duplicate', 'active'),
        ('principal-ambiguous', 'employee-valid', 'active'),
        ('principal-ambiguous', 'employee-other', 'active');
    `)

    await t.test('trims the Chinese name, collapses same-Employee aliases, and does not return wrong Principal/Employee pairs', async () => {
      const rows = (await client.query('SELECT principal_id, employee_id, employee_name FROM orgmaster_contract.v_principal_display_profiles_v1 ORDER BY principal_id')).rows
      assert.deepEqual(rows, [
        { principal_id: 'principal-alias', employee_id: 'employee-valid', employee_name: '林怡君' },
        { principal_id: 'principal-valid', employee_id: 'employee-valid', employee_name: '林怡君' },
      ])
      assert.equal((await client.query('SELECT 1 FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id=$1 AND employee_id=$2', ['principal-valid', 'employee-other'])).rowCount, 0)
      assert.equal((await client.query('SELECT 1 FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id=$1 AND employee_id=$2', ['principal-missing', 'employee-valid'])).rowCount, 0)
      assert.equal((await client.query('SELECT count(*)::int AS count FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id=$1', ['principal-alias'])).rows[0].count, 1)
    })

    await t.test('suppresses inactive Employee names, duplicate Employee JSON rows, and ambiguous Principal mappings', async () => {
      const rows = (await client.query('SELECT principal_id, employee_id, employee_name FROM orgmaster_contract.v_principal_display_profiles_v1 ORDER BY principal_id')).rows
      assert.equal(rows.some((row) => row.principal_id === 'principal-inactive'), false)
      assert.equal(rows.some((row) => row.principal_id === 'principal-duplicate'), false)
      assert.equal(rows.some((row) => row.principal_id === 'principal-ambiguous'), false)
      assert.equal(JSON.stringify(rows).includes('不應洩漏的停用姓名'), false)
      assert.equal(JSON.stringify(rows).includes('重複姓名甲'), false)
      assert.equal(JSON.stringify(rows).includes('重複姓名乙'), false)
    })

    await t.test('grants Platform runtime SELECT on the display view without exposing core or source mapping tables', async () => {
      const privileges = (await client.query(`
        SELECT
          has_table_privilege('jenfu_platform_runtime', 'orgmaster_contract.v_principal_display_profiles_v1', 'SELECT') AS display_select,
          has_table_privilege('jenfu_platform_runtime', 'orgmaster_core.persistence_artifacts', 'SELECT') AS core_select,
          has_schema_privilege('jenfu_platform_runtime', 'orgmaster_core', 'USAGE') AS core_schema_usage,
          has_table_privilege('jenfu_platform_runtime', 'orgmaster_contract.v_active_principal_mappings_v1', 'SELECT') AS source_mapping_select,
          pg_get_userbyid(view.relowner) AS view_owner
        FROM pg_class view
        WHERE view.oid = 'orgmaster_contract.v_principal_display_profiles_v1'::regclass
      `)).rows[0]
      assert.deepEqual(privileges, {
        display_select: true,
        core_select: false,
        core_schema_usage: false,
        source_mapping_select: false,
        view_owner: 'jenfu_orgmaster_migrator',
      })

      const runtimeRows = await runAsRole(client, 'jenfu_platform_runtime', async () =>
        (await client.query('SELECT principal_id, employee_id, employee_name FROM orgmaster_contract.v_principal_display_profiles_v1 ORDER BY principal_id')).rows)
      assert.deepEqual(runtimeRows, [
        { principal_id: 'principal-alias', employee_id: 'employee-valid', employee_name: '林怡君' },
        { principal_id: 'principal-valid', employee_id: 'employee-valid', employee_name: '林怡君' },
      ])
      await runAsRole(client, 'jenfu_platform_runtime', async () => {
        await expectPermissionDenied(client, 'SELECT * FROM orgmaster_core.persistence_artifacts')
        await expectPermissionDenied(client, 'SELECT * FROM orgmaster_contract.v_active_principal_mappings_v1')
      })
    })

    await t.test('does not grant the display view to unrelated OrgMaster runtime or PUBLIC', async () => {
      const privileges = (await client.query(`
        SELECT
          has_table_privilege('jenfu_orgmaster_runtime', 'orgmaster_contract.v_principal_display_profiles_v1', 'SELECT') AS orgmaster_runtime_select,
          (SELECT count(*)::int
             FROM aclexplode(COALESCE(display.relacl, acldefault('r', display.relowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'SELECT') AS public_select_count
        FROM pg_class display
        WHERE display.oid = 'orgmaster_contract.v_principal_display_profiles_v1'::regclass
      `)).rows[0]
      assert.deepEqual(privileges, { orgmaster_runtime_select: false, public_select_count: 0 })
      await runAsRole(client, 'jenfu_orgmaster_runtime', async () =>
        await expectPermissionDenied(client, 'SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1'))
    })
  } finally {
    try {
      if (client) {
        await client.end()
        cleanup.clientClosed = true
      } else cleanup.clientClosed = true
    } catch (error) { cleanupFailure ??= error }

    try {
      const postmasterPid = clusterDir ? path.join(clusterDir, 'postmaster.pid') : null
      if (clusterDir && (clusterStarted || await exists(postmasterPid))) {
        try {
          runPostgres('pg_ctl.exe', ['-D', clusterDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
          cleanup.postgresStopped = true
        } catch (error) {
          cleanup.postgresStopped = await isLoopbackPortReleased(port)
          if (!cleanup.postgresStopped) cleanupFailure ??= error
        }
      } else cleanup.postgresStopped = true
    } catch (error) { cleanupFailure ??= error }

    try {
      cleanup.portReleased = await isLoopbackPortReleased(port)
      if (!cleanup.portReleased) cleanupFailure ??= new Error('task-owned PostgreSQL loopback port is still listening')
    } catch (error) { cleanupFailure ??= error }

    try {
      if (taskRoot) {
        if (!cleanup.postgresStopped) cleanupFailure ??= new Error(`PostgreSQL may still own ${taskRoot}; retained its files for safe recovery`)
        else {
          assertTaskOwnedTempRoot(taskRoot)
          await rm(taskRoot, { recursive: true, force: true })
          cleanup.tempRootRemoved = !(await exists(taskRoot))
          if (!cleanup.tempRootRemoved) cleanupFailure ??= new Error('task-owned temporary PostgreSQL root was not removed')
        }
      } else cleanup.tempRootRemoved = true
    } catch (error) { cleanupFailure ??= error }

    t.diagnostic(JSON.stringify({ runtime: 'task-owned PostgreSQL 18, loopback only, synthetic fixture', cleanup }))
    if (cleanupFailure) throw cleanupFailure
  }

  assert.deepEqual(cleanup, { clientClosed: true, postgresStopped: true, portReleased: true, tempRootRemoved: true })
})
