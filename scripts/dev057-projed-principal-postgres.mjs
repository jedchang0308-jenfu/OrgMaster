import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { startDisposablePostgres } from './lib/dev014-disposable-postgres.mjs'
import { initializeLifecycleFixture } from './lib/dev014-lifecycle-postgres-fixture.mjs'

const root = process.cwd()
const platformRoot = process.env.ORGMASTER_DEV057_PLATFORM_ROOT ?? path.resolve(root, '../Jenfu-Platform')
const governorSession = process.env.ORGMASTER_DEV057_GOVERNOR_SESSION
const governorScript = path.join(process.env.USERPROFILE ?? '', '.codex/skills/ai-dev-resource-governor/scripts/resource_governor.py')
const runtimeLogin = 'orgmaster-prod-runtime@jenfu-platform-prod.iam'
const fixtureIssuer = 'https://securetoken.google.com/dev057-projed-fixture'
const googleIssuer = 'https://accounts.google.com'
const checks = []
let handle
let runtime
let cleanup = null
let firstFailure = null
let migrationSha256 = null
let migrationCounts = null
const currentBaselineMigrations = []
let legacyBaseline = null
let governorRuntime = null
let sourceInputs = null
const expectedChecks = 18

function registerRuntime() {
  if (!governorSession) return
  assert.match(governorSession, /^[a-f0-9-]{36}$/u)
  const pid = handle.process.pid
  const startToken = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`], { encoding: 'utf8', windowsHide: true }).trim()
  const result = JSON.parse(execFileSync('python', [governorScript, '--agent-host', 'codex', '--format', 'json',
    'session', 'runtime', 'register', '--session', governorSession, '--pid', String(pid), '--start-token', startToken,
    '--executable', handle.process.command, '--purpose', 'DEV-057 ProJED principal local PostgreSQL verification',
    '--cleanup-condition', 'task cluster stopped, private port released and task root removed', '--port', String(handle.port)], { encoding: 'utf8', windowsHide: true }))
  assert.equal(result.status, 'OK')
  governorRuntime = { pid, startToken }
}

function failureInfo(id, error) {
  const cause = error?.cause
  return {
    id,
    code: error?.code ?? cause?.code ?? null,
    message: error?.message ?? String(error),
    ...(cause ? { cause: cause.message ?? String(cause) } : {}),
  }
}

function rememberFailure(id, error) {
  const failure = failureInfo(id, error)
  if (!firstFailure) firstFailure = failure
  return failure
}

async function check(id, work) {
  try {
    await work()
    checks.push({ id, status: 'PASS' })
    console.log('PASS ' + id)
    return true
  } catch (error) {
    const failure = rememberFailure(id, error)
    checks.push({ id, status: 'FAIL', code: failure.code, message: failure.message })
    console.error('FAIL ' + id + ': ' + failure.message)
    return false
  }
}

function newProof(prefix) {
  const nonce = randomUUID()
  return {
    issuer: fixtureIssuer,
    subject: prefix + '-firebase-' + nonce,
    googleSubject: prefix + '-google-' + nonce,
    authenticatedAt: new Date(Date.now() - 60_000).toISOString(),
  }
}

async function enroll(client, requestId, proof) {
  const result = await client.query(
    'SELECT orgmaster_core.enroll_projed_principal_v1($1::uuid,$2::text,$3::text,$4::text,$5::timestamptz) AS result',
    [requestId, proof.issuer, proof.subject, proof.googleSubject, proof.authenticatedAt],
  )
  assert.equal(result.rowCount, 1)
  return result.rows[0].result
}

async function expectSqlMessage(work, expected) {
  let caught = null
  try {
    await work()
  } catch (error) {
    caught = error
  }
  assert.ok(caught, 'Expected database rejection: ' + expected)
  if (!String(caught.message ?? caught).includes(expected)) {
    const mismatch = new Error('Expected database marker ' + expected + '; observed SQLSTATE ' + String(caught.code ?? 'unknown'))
    mismatch.cause = caught
    throw mismatch
  }
  return caught
}

async function legacySnapshot(client) {
  const projection = await client.query(`
    SELECT COALESCE(jsonb_agg(to_jsonb(mapping)
      ORDER BY mapping.principal_issuer, mapping.principal_subject, mapping.principal_id), '[]'::jsonb) AS snapshot
    FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
  `)
  const facts = await client.query(
    'SELECT orgmaster_core.read_principal_lifecycle_facts_v2() AS snapshot',
  )
  return {
    activePrincipalMappingsV1: projection.rows[0].snapshot,
    principalLifecycleFactsV2: facts.rows[0].snapshot,
  }
}

function assertLegacyUnchanged(before, after) {
  assert.deepEqual(after, before, 'Employee-only v1 projection/lifecycle facts changed')
}

async function connectOrgmasterRuntime() {
  const client = new pg.Client({
    host: handle.host,
    port: handle.port,
    database: handle.databaseName,
    user: runtimeLogin,
    ssl: false,
    application_name: 'dev057-projed-principal-publisher-regression',
  })
  await client.connect()
  return client
}

async function seedLegacyReservation(client, input) {
  await client.query('BEGIN')
  try {
    if (input.owner) {
      await client.query(`
        INSERT INTO orgmaster_core.principal_ownership_reservations
          (principal_id, employee_id, account_type, first_seen_at, source_revision)
        VALUES ($1,$2,'human_personal',clock_timestamp(),$3)
        ON CONFLICT (principal_id) DO NOTHING
      `, [input.principalId, input.employeeId, input.sourceRevision])
    }
    await client.query(`
      INSERT INTO orgmaster_core.principal_identity_reservations
        (principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision, principal_id)
      VALUES ($1,$2,$3,clock_timestamp(),'legacy',$4,$5)
      ON CONFLICT (principal_issuer,principal_subject) DO NOTHING
    `, [input.issuer, input.subject, input.employeeId, input.sourceRevision, input.principalId ?? null])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function seedManagedIdentityWithLegacyPair(client) {
  const id = randomUUID()
  const principalId = 'principal-managed:' + id
  const employeeId = 'employee-one'
  const issuer = 'https://securetoken.google.com/dev057-managed-fixture'
  const subject = 'managed-firebase-' + id
  await client.query(`
    INSERT INTO orgmaster_core.managed_daily_identities
      (identity_record_id, employee_id, principal_id, directory_customer_id, directory_user_id,
       last_verified_primary_email, auth_issuer, auth_subject, bound_at, link_state, revision,
       created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),'active',1,
       'dev057-projed-managed-fixture','dev057-projed-managed-fixture')
  `, [id, employeeId, principalId, 'managed-customer-fixture', 'managed-user-' + id,
    'managed-' + id + '@example.test', issuer, subject])
  await client.query(`
    INSERT INTO orgmaster_core.principal_identity_reservations
      (principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision)
    VALUES ($1,$2,$3,clock_timestamp(),'managed',$4)
    ON CONFLICT (principal_issuer,principal_subject) DO NOTHING
  `, [issuer, subject, employeeId, 'managed:' + id])
  const oldPair = await client.query(`
    SELECT principal_id, employee_id, source_kind FROM orgmaster_core.principal_identity_reservations
    WHERE principal_issuer=$1 AND principal_subject=$2
  `, [issuer, subject])
  assert.deepEqual(oldPair.rows, [{ principal_id: principalId, employee_id: employeeId, source_kind: 'managed' }])
  const mirror = await client.query(`
    SELECT principal_id, principal_kind, employee_id FROM orgmaster_core.principal_subjects_v2
    WHERE principal_issuer=$1 AND principal_subject=$2
  `, [issuer, subject])
  assert.deepEqual(mirror.rows, [{ principal_id: principalId, principal_kind: 'employee', employee_id: employeeId }])
  const ownerMirror = await client.query(`
    SELECT principal_id, principal_kind, employee_id FROM orgmaster_core.principal_owners_v2
    WHERE principal_id=$1
  `, [principalId])
  assert.deepEqual(ownerMirror.rows, [{ principal_id: principalId, principal_kind: 'employee', employee_id: employeeId }])
}
async function assertRuntimeTableDenied(client, table, selectSql, insertSql, updateSql, deleteSql) {
  for (const [operation, sql] of [
    ['SELECT', selectSql],
    ['INSERT', insertSql],
    ['UPDATE', updateSql],
    ['DELETE', deleteSql],
  ]) {
    await client.query('BEGIN')
    let caught = null
    try {
      await client.query(sql)
    } catch (error) {
      caught = error
    }
    await client.query('ROLLBACK').catch(() => undefined)
    assert.ok(caught, 'Runtime unexpectedly had ' + operation + ' on ' + table)
    assert.equal(caught.code, '42501', 'Runtime core-table access must fail by ACL')
  }
}

function fixtureMigrationCounts(fixture) {
  const rows = fixture.appliedMigrations
  return {
    total: rows.length,
    orgmaster: rows.filter((entry) => entry.repo === 'orgmaster').length,
    platform: rows.filter((entry) => entry.repo === 'platform').length,
  }
}

try {
  sourceInputs = { orgmaster: root, platform: platformRoot }
  handle = await startDisposablePostgres({
    purpose: 'DEV-057 ProJED Principal publication migration 041 isolated PostgreSQL regression',
  })
  registerRuntime()
  await check('fixture-rejects-wrong-project-root', async () => {
    await assert.rejects(initializeLifecycleFixture(handle, { orgmasterRoot: root, platformRoot: root }),
      { code: 'DEV014_FIXTURE_REPOSITORY_ROOT_INVALID' })
  })
  const fixture = await initializeLifecycleFixture(handle, {
    orgmasterRoot: root,
    platformRoot,
  })
  migrationCounts = fixtureMigrationCounts(fixture)
  const fixtureOk = await check('fixture-applied-31-orgmaster-and-11-platform-migrations', async () => {
    assert.equal(fixture.status, 'INITIALIZED')
    assert.deepEqual(migrationCounts, { total: 42, orgmaster: 31, platform: 11 })
    assert.equal(fixture.productionReleaseAuthority, false)
    assert.equal(fixture.productionExecutionCount, 0)
    assert.equal(fixture.evidenceScope, 'LOCAL_SYNTHETIC_ONLY')
  })
  if (!fixtureOk) throw Object.assign(new Error('Required lifecycle fixture baseline did not match'), { code: 'DEV057_FIXTURE_BASELINE_INVALID' })

  const owner = handle.client
  const currentBaselineOk = await check('current-orgmaster-001-040-baseline-applied', async () => {
    const paths = fs.readdirSync(path.join(root, 'db/migrations'))
      .filter((name) => /^(03[2-9]|040)_.*\.sql$/u.test(name)).sort()
    assert.equal(paths.length, 9, 'Expected the current 032-040 source baseline')
    for (const name of paths) {
      const file = path.join(root, 'db/migrations', name)
      assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink())
      assert.equal(fs.realpathSync(file), file)
      const bytes = fs.readFileSync(file)
      await owner.query(bytes.toString('utf8'))
      currentBaselineMigrations.push({ path: 'db/migrations/' + name, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  })
  if (!currentBaselineOk) throw Object.assign(new Error('Current OrgMaster baseline did not apply'), { code: 'DEV057_CURRENT_BASELINE_INVALID' })
  legacyBaseline = await legacySnapshot(owner)
  const migrationPath = path.join(root, 'db/migrations/041_dev057_projed_principal_publication.sql')
  const migration = fs.readFileSync(migrationPath)
  migrationSha256 = createHash('sha256').update(migration).digest('hex')
  await owner.query(migration.toString('utf8'))

  const migrationOk = await check('041-additive-migration-preserves-employee-v1-state', async () => {
    const after = await legacySnapshot(owner)
    assertLegacyUnchanged(legacyBaseline, after)
    const permission = await owner.query(`
      SELECT binding.principal_id, binding.db_session_user, permission.purpose, permission.enabled
      FROM orgmaster_core.workload_principal_bindings binding
      JOIN orgmaster_core.principal_publication_permissions permission USING (principal_id)
      WHERE binding.owner='orgmaster'
        AND binding.purpose='managed-identity-lifecycle'
        AND binding.enabled
        AND permission.purpose='projed-principal-publication'
        AND permission.enabled
    `)
    assert.equal(permission.rowCount, 1, 'Expected one enabled purpose permission for the existing OrgMaster workload binding')
    assert.equal(permission.rows[0].db_session_user, runtimeLogin)
  })
  if (!migrationOk) throw Object.assign(new Error('Migration 041 baseline check failed'), { code: 'DEV057_MIGRATION_BASELINE_INVALID' })

  runtime = await connectOrgmasterRuntime()
  await check('publisher-uses-actual-session-user-and-existing-purpose-binding', async () => {
    const session = await runtime.query(`
      SELECT current_database() AS database_name, session_user::text AS session_user,
        current_user::text AS current_user, host(inet_server_addr())::text AS server_address,
        inet_server_port() AS server_port
    `)
    assert.equal(session.rowCount, 1)
    assert.equal(session.rows[0].database_name, handle.databaseName)
    assert.equal(session.rows[0].session_user, runtimeLogin)
    assert.equal(session.rows[0].current_user, runtimeLogin)
    assert.equal(session.rows[0].server_address, '127.0.0.1')
    assert.equal(Number(session.rows[0].server_port), handle.port)
    const binding = await runtime.query(`
      SELECT binding.principal_id, binding.db_session_user, binding.purpose, binding.enabled
      FROM orgmaster_contract.v_workload_principals_v1 binding
      WHERE binding.db_session_user=session_user::text
        AND binding.owner='orgmaster' AND binding.enabled
    `)
    assert.equal(binding.rowCount, 1)
    assert.equal(binding.rows[0].db_session_user, runtimeLogin)
  })

  await check('personal-principal-replay-stability-and-proof-conflicts', async () => {
    const proof = newProof('personal')
    const requestId = randomUUID()
    const before = await legacySnapshot(owner)
    const first = await enroll(runtime, requestId, proof)
    assert.equal(first.contractVersion, 'orgmaster.projed-principal.v1')
    assert.equal(first.principalKind, 'personal')
    assert.equal(first.employeeId, null)
    const replay = await enroll(runtime, requestId, proof)
    assert.deepEqual(replay, first)
    const secondRequest = await enroll(runtime, randomUUID(), proof)
    assert.equal(secondRequest.principalId, first.principalId)
    assert.equal(secondRequest.mappingRevision, first.mappingRevision)
    assert.equal(secondRequest.publishedAt, first.publishedAt)
    await expectSqlMessage(
      () => enroll(runtime, requestId, { ...proof, authenticatedAt: new Date(Date.parse(proof.authenticatedAt) + 1000).toISOString() }),
      'PROJED_PUBLICATION_REPLAY_CONFLICT',
    )
    const changedGoogle = { ...proof, googleSubject: proof.googleSubject + '-different' }
    await expectSqlMessage(
      () => enroll(runtime, randomUUID(), changedGoogle),
      'PROJED_PRINCIPAL_CONFLICT',
    )
    const alternateGoogle = await owner.query(`
      SELECT count(*)::int AS count FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer=$1 AND principal_subject=$2
    `, [googleIssuer, changedGoogle.googleSubject])
    assert.equal(alternateGoogle.rows[0].count, 0)
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })

  await check('cross-principal-firebase-google-rebinding-rejected', async () => {
    const firstProof = newProof('cross-a')
    const secondProof = newProof('cross-b')
    const first = await enroll(runtime, randomUUID(), firstProof)
    const second = await enroll(runtime, randomUUID(), secondProof)
    assert.notEqual(first.principalId, second.principalId)
    await expectSqlMessage(
      () => enroll(runtime, randomUUID(), { ...firstProof, googleSubject: secondProof.googleSubject }),
      'PROJED_PRINCIPAL_CONFLICT',
    )
  })

  await check('unresolved-legacy-provider-pair-cannot-be-claimed', async () => {
    const proof = newProof('unresolved')
    await seedLegacyReservation(owner, {
      issuer: proof.issuer,
      subject: proof.subject,
      employeeId: 'employee-inactive',
      principalId: null,
      sourceRevision: 'dev057-projed-unresolved-fixture',
    })
    const before = await legacySnapshot(owner)
    await expectSqlMessage(
      () => enroll(runtime, randomUUID(), proof),
      'PROJED_PRINCIPAL_CONFLICT',
    )
    const unresolved = await owner.query(`
      SELECT principal_id, principal_kind, employee_id
      FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer=$1 AND principal_subject=$2
    `, [proof.issuer, proof.subject])
    assert.deepEqual(unresolved.rows, [{ principal_id: null, principal_kind: 'employee', employee_id: 'employee-inactive' }])
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })

  await check('legacy-v1-writer-cannot-claim-personal-pair-even-with-on-conflict-do-nothing', async () => {
    const proof = newProof('legacy-writer')
    await enroll(runtime, randomUUID(), proof)
    const before = await legacySnapshot(owner)
    await owner.query('BEGIN')
    let caught = null
    try {
      await owner.query(`
        INSERT INTO orgmaster_core.principal_identity_reservations
          (principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision)
        VALUES ($1,$2,'employee-legacy',clock_timestamp(),'legacy','dev057-projed-old-writer')
        ON CONFLICT (principal_issuer,principal_subject) DO NOTHING
      `, [proof.issuer, proof.subject])
    } catch (error) {
      caught = error
    }
    await owner.query('ROLLBACK').catch(() => undefined)
    assert.ok(caught, 'Old v1 writer insert unexpectedly succeeded')
    assert.ok(String(caught.message).includes('PRINCIPAL_OWNERSHIP_CONFLICT'), 'Expected mirrored ownership conflict')
    const oldRow = await owner.query(`
      SELECT count(*)::int AS count FROM orgmaster_core.principal_identity_reservations
      WHERE principal_issuer=$1 AND principal_subject=$2
    `, [proof.issuer, proof.subject])
    assert.equal(oldRow.rows[0].count, 0)
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })

  await check('inactive-reserved-alias-of-active-employee-is-not-published', async () => {
    const mapping = await owner.query(`
      SELECT principal_issuer, principal_subject, principal_id, employee_id
      FROM orgmaster_contract.v_active_principal_mappings_v1
      WHERE employee_status='active' AND employee_id IS NOT NULL
      ORDER BY principal_issuer, principal_subject, principal_id
      FETCH FIRST 1 ROW ONLY
    `)
    assert.equal(mapping.rowCount, 1)
    const active = mapping.rows[0]
    const aliasSubject = 'historical-expired-alias-' + randomUUID()
    const proof = {
      issuer: active.principal_issuer,
      subject: aliasSubject,
      googleSubject: 'dev057-expired-alias-google-' + randomUUID(),
      authenticatedAt: new Date(Date.now() - 60_000).toISOString(),
    }
    await seedLegacyReservation(owner, {
      principalId: active.principal_id,
      issuer: proof.issuer,
      subject: proof.subject,
      employeeId: active.employee_id,
      sourceRevision: 'dev057-projed-expired-alias-fixture',
    })
    const isActivePair = await owner.query(`
      SELECT count(*)::int AS count FROM orgmaster_contract.v_active_principal_mappings_v1
      WHERE principal_issuer=$1 AND principal_subject=$2 AND principal_id=$3 AND employee_status='active'
    `, [proof.issuer, proof.subject, active.principal_id])
    assert.equal(isActivePair.rows[0].count, 0)
    const before = await legacySnapshot(owner)
    await expectSqlMessage(
      () => enroll(runtime, randomUUID(), proof),
      'PROJED_PRINCIPAL_INACTIVE',
    )
    const admission = await owner.query(
      'SELECT count(*)::int AS count FROM orgmaster_core.projed_principal_admissions WHERE principal_id=$1',
      [active.principal_id],
    )
    assert.equal(admission.rows[0].count, 0)
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })
  await check('active-employee-principal-can-enroll-without-changing-v1-facts', async () => {
    const mapping = await owner.query(`
      SELECT mapping.principal_issuer, mapping.principal_subject, mapping.principal_id, mapping.employee_id
      FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
      JOIN orgmaster_core.principal_subjects_v2 pair
        ON pair.principal_issuer=mapping.principal_issuer
       AND pair.principal_subject=mapping.principal_subject
       AND pair.principal_id=mapping.principal_id
       AND pair.principal_kind='employee'
      WHERE mapping.employee_status='active' AND mapping.employee_id IS NOT NULL
      ORDER BY mapping.principal_issuer, mapping.principal_subject, mapping.principal_id
      FETCH FIRST 1 ROW ONLY
    `)
    assert.equal(mapping.rowCount, 1, 'Expected an existing active Employee Principal from the native fixture')
    const row = mapping.rows[0]
    const before = await legacySnapshot(owner)
    const proof = {
      issuer: row.principal_issuer,
      subject: row.principal_subject,
      googleSubject: 'dev057-active-employee-google-' + randomUUID(),
      authenticatedAt: new Date(Date.now() - 60_000).toISOString(),
    }
    const result = await enroll(runtime, randomUUID(), proof)
    assert.equal(result.principalKind, 'employee')
    assert.equal(result.principalId, row.principal_id)
    assert.equal(result.employeeId, row.employee_id)
    assert.equal(result.identityIssuer, row.principal_issuer)
    assert.equal(result.identitySubject, row.principal_subject)
    const googleOwnership = await owner.query(`
      SELECT principal_id, principal_kind, employee_id
      FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer=$1 AND principal_subject=$2
    `, [googleIssuer, proof.googleSubject])
    assert.deepEqual(googleOwnership.rows, [{
      principal_id: row.principal_id,
      principal_kind: 'employee',
      employee_id: row.employee_id,
    }])
    const rawGoogleAdmission = await owner.query(`
      SELECT count(*)::int AS count
      FROM orgmaster_contract.v_projed_principal_admissions_v1
      WHERE principal_issuer=$1 AND principal_subject=$2
    `, [googleIssuer, proof.googleSubject])
    assert.equal(rawGoogleAdmission.rows[0].count, 0, 'Google alias is reserved for ownership, not an active login mapping')
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })

  await check('legacy-employee-writer-reservation-is-mirrored-to-v2', async () => {
    const id = randomUUID()
    const principalId = 'principal-dev057-mirror-' + id
    const issuer = fixtureIssuer
    const subject = 'firebase-mirror-' + id
    await seedLegacyReservation(owner, {
      owner: true,
      principalId,
      issuer,
      subject,
      employeeId: 'employee-two',
      sourceRevision: 'dev057-projed-legacy-mirror-fixture',
    })
    const ownerMirror = await owner.query(`
      SELECT principal_id, principal_kind, employee_id, account_type
      FROM orgmaster_core.principal_owners_v2 WHERE principal_id=$1
    `, [principalId])
    assert.deepEqual(ownerMirror.rows, [{
      principal_id: principalId,
      principal_kind: 'employee',
      employee_id: 'employee-two',
      account_type: 'human_personal',
    }])
    const pairMirror = await owner.query(`
      SELECT principal_id, principal_kind, employee_id
      FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer=$1 AND principal_subject=$2
    `, [issuer, subject])
    assert.deepEqual(pairMirror.rows, [{
      principal_id: principalId,
      principal_kind: 'employee',
      employee_id: 'employee-two',
    }])
    const projection = await owner.query(
      'SELECT count(*)::int AS count FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_id=$1',
      [principalId],
    )
    assert.equal(projection.rows[0].count, 0)
  })

  await check('managed-v1-insert-without-principal-id-mirrors-filled-principal', async () => {
    await seedManagedIdentityWithLegacyPair(owner)
  })
  await check('inactive-employee-pair-does-not-fallback-to-personal', async () => {
    const id = randomUUID()
    const principalId = 'principal-dev057-inactive-' + id
    const proof = {
      issuer: fixtureIssuer,
      subject: 'firebase-inactive-' + id,
      googleSubject: 'google-inactive-' + id,
      authenticatedAt: new Date(Date.now() - 60_000).toISOString(),
    }
    await seedLegacyReservation(owner, {
      owner: true,
      principalId,
      issuer: proof.issuer,
      subject: proof.subject,
      employeeId: 'employee-inactive',
      sourceRevision: 'dev057-projed-inactive-employee-fixture',
    })
    const before = await legacySnapshot(owner)
    await expectSqlMessage(
      () => enroll(runtime, randomUUID(), proof),
      'PROJED_PRINCIPAL_INACTIVE',
    )
    const admission = await owner.query(
      'SELECT count(*)::int AS count FROM orgmaster_core.projed_principal_admissions WHERE principal_id=$1',
      [principalId],
    )
    assert.equal(admission.rows[0].count, 0)
    const ownerMirror = await owner.query(
      'SELECT principal_kind, employee_id FROM orgmaster_core.principal_owners_v2 WHERE principal_id=$1',
      [principalId],
    )
    assert.deepEqual(ownerMirror.rows, [{ principal_kind: 'employee', employee_id: 'employee-inactive' }])
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })

  await check('admission-reactivation-advances-revision-and-invalidates-old-receipt', async () => {
    const proof = newProof('revision')
    const requestId = randomUUID()
    const first = await enroll(runtime, requestId, proof)
    const before = await legacySnapshot(owner)
    const inactive = await owner.query(`
      UPDATE orgmaster_core.projed_principal_admissions
      SET status='inactive' WHERE principal_id=$1
      RETURNING status, mapping_revision::text
    `, [first.principalId])
    assert.equal(inactive.rowCount, 1)
    assert.equal(inactive.rows[0].status, 'inactive')
    const reactivated = await owner.query(`
      UPDATE orgmaster_core.projed_principal_admissions
      SET status='active' WHERE principal_id=$1
      RETURNING status, mapping_revision::text
    `, [first.principalId])
    assert.equal(reactivated.rowCount, 1)
    assert.equal(reactivated.rows[0].status, 'active')
    assert.ok(BigInt(reactivated.rows[0].mapping_revision) > BigInt(first.mappingRevision))
    await expectSqlMessage(
      () => enroll(runtime, requestId, proof),
      'PROJED_PUBLICATION_REPLAY_CONFLICT',
    )
    assertLegacyUnchanged(before, await legacySnapshot(owner))
  })

  await check('runtime-has-only-purpose-function-and-versioned-view-access', async () => {
    const session = await runtime.query(`
      SELECT session_user::text AS session_user,
        has_function_privilege(session_user, 'orgmaster_core.enroll_projed_principal_v1(uuid,text,text,text,timestamptz)', 'EXECUTE') AS can_publish
    `)
    assert.equal(session.rows[0].session_user, runtimeLogin)
    assert.equal(session.rows[0].can_publish, true)
    const view = await runtime.query(
      'SELECT count(*)::int AS count FROM orgmaster_contract.v_projed_principal_admissions_v1 WHERE false',
    )
    assert.equal(view.rows[0].count, 0)
    const tableProbes = [
      ['principal_owners_v2', 'SELECT * FROM orgmaster_core.principal_owners_v2 LIMIT 0', 'INSERT INTO orgmaster_core.principal_owners_v2 DEFAULT VALUES', 'UPDATE orgmaster_core.principal_owners_v2 SET principal_id=principal_id WHERE false', 'DELETE FROM orgmaster_core.principal_owners_v2 WHERE false'],
      ['principal_subjects_v2', 'SELECT * FROM orgmaster_core.principal_subjects_v2 LIMIT 0', 'INSERT INTO orgmaster_core.principal_subjects_v2 DEFAULT VALUES', 'UPDATE orgmaster_core.principal_subjects_v2 SET principal_subject=principal_subject WHERE false', 'DELETE FROM orgmaster_core.principal_subjects_v2 WHERE false'],
      ['projed_principal_admissions', 'SELECT * FROM orgmaster_core.projed_principal_admissions LIMIT 0', 'INSERT INTO orgmaster_core.projed_principal_admissions DEFAULT VALUES', 'UPDATE orgmaster_core.projed_principal_admissions SET principal_id=principal_id WHERE false', 'DELETE FROM orgmaster_core.projed_principal_admissions WHERE false'],
      ['principal_publication_permissions', 'SELECT * FROM orgmaster_core.principal_publication_permissions LIMIT 0', 'INSERT INTO orgmaster_core.principal_publication_permissions DEFAULT VALUES', 'UPDATE orgmaster_core.principal_publication_permissions SET principal_id=principal_id WHERE false', 'DELETE FROM orgmaster_core.principal_publication_permissions WHERE false'],
      ['projed_principal_publication_receipts', 'SELECT * FROM orgmaster_core.projed_principal_publication_receipts LIMIT 0', 'INSERT INTO orgmaster_core.projed_principal_publication_receipts DEFAULT VALUES', 'UPDATE orgmaster_core.projed_principal_publication_receipts SET request_id=request_id WHERE false', 'DELETE FROM orgmaster_core.projed_principal_publication_receipts WHERE false'],
    ]
    for (const [table, selectSql, insertSql, updateSql, deleteSql] of tableProbes) {
      await assertRuntimeTableDenied(runtime, table, selectSql, insertSql, updateSql, deleteSql)
    }
    const sequence = await runtime.query(`
      SELECT has_sequence_privilege(session_user, 'orgmaster_core.projed_principal_revision_seq', 'USAGE') AS can_use_revision_sequence
    `)
    assert.equal(sequence.rows[0].can_use_revision_sequence, false)
  })

  await check('disabled-publisher-purpose-rejects-runtime-call', async () => {
    const disabled = await owner.query(`
      UPDATE orgmaster_core.principal_publication_permissions permission
      SET enabled=false
      FROM orgmaster_core.workload_principal_bindings binding
      WHERE binding.principal_id=permission.principal_id
        AND binding.owner='orgmaster' AND binding.purpose='managed-identity-lifecycle'
        AND permission.purpose='projed-principal-publication'
      RETURNING permission.principal_id
    `)
    assert.equal(disabled.rowCount, 1)
    await expectSqlMessage(
      () => enroll(runtime, randomUUID(), newProof('purpose-disabled')),
      'PROJED_PUBLISHER_EXECUTOR_INVALID',
    )
  })

  await check('legacy-v1-active-principal-projection-remains-unchanged', async () => {
    const after = await legacySnapshot(owner)
    assert.deepEqual(after.activePrincipalMappingsV1, legacyBaseline.activePrincipalMappingsV1)
  })
} catch (error) {
  rememberFailure('runner-setup', error)
  checks.push({
    id: 'runner-setup',
    status: 'FAIL',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  })
  console.error('FAIL runner-setup: ' + String(error?.message ?? error))
} finally {
  if (runtime) await runtime.end().catch(() => undefined)
  if (handle) {
    try {
      cleanup = await handle.cleanup()
    } catch (error) {
      const failure = rememberFailure('task-owned-postgres-cleanup', error)
      checks.push({ id: 'task-owned-postgres-cleanup', status: 'FAIL', code: failure.code, message: failure.message })
      cleanup = { completed: false, code: failure.code, message: failure.message }
    }
  }
  const cleanupOk = Boolean(
    cleanup?.clientClosed &&
    cleanup?.clusterStopped &&
    cleanup?.portReleased &&
    cleanup?.tempRemoved,
  )
  if (cleanupOk && governorRuntime) {
    try {
      const result = JSON.parse(execFileSync('python', [governorScript, '--agent-host', 'codex', '--format', 'json',
        'session', 'runtime', 'release', '--session', governorSession, '--pid', String(governorRuntime.pid),
        '--start-token', governorRuntime.startToken, '--reason', 'stopped'], { encoding: 'utf8', windowsHide: true }))
      assert.equal(result.status, 'OK')
    } catch (error) { rememberFailure('runtime-registration-release', error) }
  }
  const status = checks.length === expectedChecks &&
    checks.every((entry) => entry.status === 'PASS') &&
    cleanupOk &&
    firstFailure === null
    ? 'PASS'
    : 'FAIL'
  const report = {
    status,
    scope: 'LOCAL_SYNTHETIC_PG_ONLY; Google/Firebase token verification and HTTP session flow are not exercised',
    production: false,
    source: { migration041Sha256: migrationSha256, fixtureInputs: sourceInputs },
    fixture: migrationCounts,
    currentBaselineMigrations,
    checks,
    firstFailure,
    cleanup: cleanup ?? { completed: false, handleCreated: false },
  }
  const output = path.join(root, 'output/qa/dev-057/projed-principal', new Date().toISOString().replace(/[:.]/gu, '-') + '-' + randomUUID().slice(0, 8))
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, output }))
  if (status !== 'PASS') process.exitCode = 1
}
// The disposable local PostgreSQL handle is the sole runtime and is released in finally.
