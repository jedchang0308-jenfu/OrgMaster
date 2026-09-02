import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const scriptRoot = dirname(fileURLToPath(import.meta.url))
const orgRoot = resolve(scriptRoot, '..')
const workspaceRoot = resolve(orgRoot, '..')
const platformRoot = join(workspaceRoot, 'Jenfu-Management-system')
const composeFile = join(orgRoot, 'qa', 'dev-006', 'docker-compose.yml')
const composeProject = `dev040principal-${randomUUID().slice(0, 8)}`
const runId = `DEV040-PRINCIPAL-${new Date().toISOString().replace(/[-:.]/gu, '')}-${randomUUID().slice(0, 8)}`
const evidenceRoot = join(platformRoot, 'output', 'dev-040', runId)
const bootstrapRoles = join(platformRoot, 'qa', 'dev-004', 'postgres', '000_bootstrap_roles.sql')
const migrations = [
  join(orgRoot, 'db', 'migrations', '002_dev006_orgmaster_persistence.sql'),
  join(orgRoot, 'db', 'migrations', '003_dev006_orgmaster_runtime_repository.sql'),
  join(orgRoot, 'db', 'migrations', '004_dev040_active_principal_view.sql'),
]
const cases = []
let port = null
let started = false
let fatalError = null

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? orgRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
  })
}

function record(id, passed, detail = {}) {
  const row = { id, status: passed ? 'PASS' : 'FAIL', checkedAt: new Date().toISOString(), ...detail }
  cases.push(row)
  if (!passed) throw new Error(`${id}_FAILED`)
}

async function canBind(candidate) {
  return new Promise((done) => {
    const server = createServer()
    server.unref()
    server.once('error', () => done(false))
    server.listen({ host: '127.0.0.1', port: candidate, exclusive: true }, () => server.close(() => done(true)))
  })
}

async function choosePort() {
  for (let candidate = 55460; candidate <= 55480; candidate += 1) if (await canBind(candidate)) return candidate
  throw new Error('NO_DEV040_FIXTURE_PORT')
}

async function waitForRelease(candidate) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await canBind(candidate)) return true
    await new Promise((done) => setTimeout(done, 250))
  }
  return false
}

function governancePayload({ active = true, links = [], revision = 'a'.repeat(64) } = {}) {
  const version = {
    kind: 'assignment-governance-v2',
    id: 'assignment-policy-fixture-v7',
    versionNumber: 7,
    publishedAt: '2026-09-01T00:00:00.000Z',
    policy: { identityLinks: links },
    organizationSnapshot: { workspaceVersionId: 'current-fixture-v1', workspaceRevision: revision },
  }
  return {
    app: 'OrgMaster',
    schemaVersion: 2,
    draft: { identityLinks: links },
    activePolicyVersionId: active ? version.id : null,
    publishedVersions: [version],
  }
}

function link(overrides = {}) {
  return {
    id: 'link-1',
    issuer: 'https://securetoken.google.com/jenfu-test',
    subject: 'Case-Sensitive-UID',
    principalId: 'principal-1',
    employeeId: 'employee-1',
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    ...overrides,
  }
}

function workspacePayload(employees = [{ id: 'employee-1', status: 'active' }]) {
  return { app: 'OrgMaster', version: 4, kind: 'document', savedAt: '2026-09-01T00:00:00.000Z', state: { employees } }
}

async function setFixture(pool, input = {}) {
  const sourceRevision = input.sourceRevision ?? 'a'.repeat(64)
  const governance = governancePayload({ active: input.active ?? true, links: input.links ?? [link()], revision: input.governanceRevision ?? sourceRevision })
  const workspace = workspacePayload(input.employees ?? [{ id: 'employee-1', status: 'active' }])
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE jenfu_platform_migrator')
    await client.query("UPDATE orgmaster.persistence_authority SET active_batch_id = NULL, authority_version = 0, updated_at = clock_timestamp(), updated_by = 'qc', reason_code = 'fixture_reset' WHERE singleton = true")
    await client.query('DELETE FROM orgmaster.persistence_media_inventory')
    await client.query('DELETE FROM orgmaster.persistence_artifacts')
    await client.query('DELETE FROM orgmaster.persistence_batches')
    await client.query(`INSERT INTO orgmaster.persistence_batches
      (id, source_revision, contract_version, source_manifest, artifact_count, media_count, source_bytes, status, imported_at, verified_at, activated_at)
      VALUES ('00000000-0000-4000-8000-000000000040', $1, 'jenfu.orgmaster-persistence.v1', '{}'::jsonb, 2, 0, 0, 'active', clock_timestamp(), clock_timestamp(), clock_timestamp())`, [sourceRevision])
    await client.query(`INSERT INTO orgmaster.persistence_artifacts
      (batch_id, artifact_key, artifact_kind, payload, source_sha256, canonical_sha256, source_bytes, imported_at) VALUES
      ('00000000-0000-4000-8000-000000000040', 'orgmaster-governance.v2.json', 'governance', $1::jsonb, $2, $2, 0, clock_timestamp()),
      ('00000000-0000-4000-8000-000000000040', 'orgmaster-versions/current-fixture-v1.json', 'workspace-version', $3::jsonb, $4, $4, 0, clock_timestamp())`,
      [JSON.stringify(governance), 'b'.repeat(64), JSON.stringify(workspace), sourceRevision])
    await client.query("UPDATE orgmaster.persistence_authority SET active_batch_id = '00000000-0000-4000-8000-000000000040', authority_version = 1, updated_at = clock_timestamp(), updated_by = 'qc', reason_code = 'fixture_activate' WHERE singleton = true")
    await client.query('COMMIT')
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* best effort fixture cleanup */ }
    throw error
  } finally {
    client.release()
  }
}

async function rows(pool) {
  return (await pool.query(`SELECT contract_version, principal_issuer, principal_subject, principal_id,
      employee_id, employee_status, mapping_version, published_at
    FROM organization.v_active_principal_mappings_v1
    ORDER BY principal_id`)).rows
}

async function expectDenied(pool, role, sql, acceptedCodes = ['42501']) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    await client.query(sql)
    return false
  } catch (error) {
    return acceptedCodes.includes(error?.code)
  } finally {
    try { await client.query('ROLLBACK') } catch { /* best effort fixture cleanup */ }
    client.release()
  }
}

async function selectViewAsRole(pool, role) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    const result = await client.query('SELECT count(*)::int AS count FROM organization.v_active_principal_mappings_v1')
    await client.query('ROLLBACK')
    return result.rows[0]?.count
  } finally {
    try { await client.query('ROLLBACK') } catch { /* best effort fixture cleanup */ }
    client.release()
  }
}

async function main() {
  mkdirSync(evidenceRoot, { recursive: true })
  port = await choosePort()
  const environment = { ...process.env, DEV006_POSTGRES_PORT: String(port) }
  const up = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'up', '-d', '--wait'], { env: environment })
  if (up.status !== 0) throw new Error(`COMPOSE_UP_FAILED:${up.stderr || up.stdout}`)
  started = true
  const pool = new pg.Pool({ connectionString: `postgresql://postgres:dev006-local-fixture-only@127.0.0.1:${port}/jenfu_dev006`, max: 2 })
  try {
    await pool.query(readFileSync(bootstrapRoles, 'utf8'))
    for (const migration of migrations) await pool.query(readFileSync(migration, 'utf8'))
    record('PAV-01', true, { assertion: 'fresh migrations apply' })

    await pool.query(readFileSync(migrations.at(-1), 'utf8'))
    record('PAV-02', true, { assertion: 'migration immediate replay' })

    await setFixture(pool, { active: false })
    record('PAV-03', (await rows(pool)).length === 0, { assertion: 'draft and inactive policy excluded' })

    await setFixture(pool)
    const activeRows = await rows(pool)
    record('PAV-04', activeRows.length === 1
      && activeRows[0].contract_version === 'organization.active-principal.v1'
      && activeRows[0].principal_subject === 'Case-Sensitive-UID'
      && activeRows[0].employee_status === 'active'
      && Number(activeRows[0].mapping_version) === 7,
    { assertion: 'exact active mapping projection' })

    await setFixture(pool, { governanceRevision: 'c'.repeat(64) })
    record('PAV-05', (await rows(pool)).length === 0, { assertion: 'workspace revision mismatch excluded' })

    await setFixture(pool, { employees: [{ id: 'employee-1', status: 'inactive' }] })
    record('PAV-06', (await rows(pool)).length === 0, { assertion: 'inactive employee excluded' })

    await setFixture(pool, { employees: [{ id: 'employee-1' }] })
    record('PAV-07', (await rows(pool)).length === 0, { assertion: 'missing employee status fails closed' })

    await setFixture(pool, { links: [link({ validTo: '2026-08-01T00:00:00.000Z' })] })
    record('PAV-08', (await rows(pool)).length === 0, { assertion: 'expired identity excluded' })

    await setFixture(pool, {
      links: [link(), link({ id: 'link-2', principalId: 'principal-2', employeeId: 'employee-2' })],
      employees: [{ id: 'employee-1', status: 'active' }, { id: 'employee-2', status: 'active' }],
    })
    record('PAV-09', (await rows(pool)).length === 2, { assertion: 'duplicate subject preserved for app fail-closed' })

    await pool.query(`UPDATE orgmaster.persistence_authority SET active_batch_id = NULL WHERE singleton = true`)
    record('PAV-10', (await rows(pool)).length === 0, { assertion: 'no authority yields no rows' })
    await setFixture(pool)

    for (const role of ['jenfu_platform_runtime', 'jenfu_orgmaster_runtime', 'jenfu_ai_pdm_runtime']) {
      const allowedCount = await selectViewAsRole(pool, role)
      record(`PAV-11-${role}`, allowedCount === 1, { assertion: 'runtime view SELECT only', role })
      record(`PAV-12-${role}`, await expectDenied(pool, role, 'SELECT count(*) FROM orgmaster.persistence_artifacts'), { assertion: 'direct persistence read denied', role })
      const writePrivilege = await pool.query("SELECT has_table_privilege($1, 'organization.v_active_principal_mappings_v1', 'DELETE') AS allowed", [role])
      const writeRejected = await expectDenied(pool, role, 'DELETE FROM organization.v_active_principal_mappings_v1 WHERE false', ['42501', '55000', '0A000'])
      record(`PAV-13-${role}`, writePrivilege.rows[0].allowed === false && writeRejected, { assertion: 'view write denied', role })
    }
  } finally {
    await pool.end()
  }
}

try {
  await main()
} catch (error) {
  fatalError = error instanceof Error ? error.message : String(error)
} finally {
  let cleanup = { composeDown: !started, portReleased: port === null }
  if (started) {
    const environment = { ...process.env, DEV006_POSTGRES_PORT: String(port) }
    const down = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'down', '--volumes', '--remove-orphans'], { env: environment })
    cleanup.composeDown = down.status === 0
    cleanup.portReleased = await waitForRelease(port)
  }
  const passed = !fatalError && cases.every((item) => item.status === 'PASS') && cleanup.composeDown && cleanup.portReleased
  const receipt = {
    contractVersion: 'jenfu.dev040.active-principal-qc.v1',
    runId,
    status: passed ? 'PASS' : 'FAIL',
    targetClass: 'isolated-postgresql-17',
    productBehaviorChanged: false,
    productionConnected: false,
    cases,
    cleanup,
    fatalError,
    completedAt: new Date().toISOString(),
  }
  writeFileSync(join(evidenceRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({ ...receipt, evidenceRoot }, null, 2)}\n`)
  if (!passed) process.exitCode = 1
}
