import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { assertEnvironment, executeFixturePhase, executeFixtureTransaction, FIXTURES, parseArgs, TARGET } from './dev014-production-login-fixture-runner.mjs'

const base = Object.freeze({
  operationId: 'DEV014-LOGIN-FIXTURE-R0001',
  sourceRevision: 'a'.repeat(40),
  workspaceRevision: 'workspace-revision-1',
  deadlineAt: '2026-09-22T12:00:00.000Z',
})

function database({ active = false, assigned = false, linked = false, invalidSecond = false } = {}) {
  const state = new Map(FIXTURES.map((fixture) => [fixture.employeeId, {
    fixture, employeeStatus: active ? 'active' : 'inactive', employeeNumber: assigned ? fixture.employeeNumber : '', identityState: linked ? 'directory_linked_pending_auth' : 'not_linked', registryRevision: assigned ? '2' : '1', directoryUserId: `directory-${fixture.alias}`,
  }]))
  const calls = []
  let transactionSnapshot = null
  let workspaceRevision = base.workspaceRevision
  let workspacePayload = {
    app: 'OrgMaster', version: 8, kind: 'document', savedAt: '2026-09-22T07:00:00.000Z',
    state: { employees: FIXTURES.map((fixture) => ({ id: fixture.employeeId, name: `DEV014 Free ${fixture.alias === 'dev014-fp-google' ? 'Google' : 'Number'}`, status: active ? 'active' : 'inactive' })) },
  }
  const byNumber = (number) => [...state.values()].find((entry) => entry.employeeNumber === number)
  const query = async (sql, params) => {
    calls.push({ sql, params })
    if (sql === 'BEGIN') { transactionSnapshot = structuredClone([...state.entries()]); return { rows: [] } }
    if (sql === 'COMMIT') { transactionSnapshot = null; return { rows: [] } }
    if (sql === 'ROLLBACK') {
      if (transactionSnapshot) {
        state.clear()
        for (const [key, value] of transactionSnapshot) state.set(key, value)
      }
      transactionSnapshot = null
      return { rows: [] }
    }
    if (sql.includes('read_employee_managed_identity_v1')) {
      const entry = state.get(params[0])
      return { rows: entry ? [{ employee_id: entry.fixture.employeeId, employee_status: entry.employeeStatus, employee_number: entry.employeeNumber || null, identity_state: entry.identityState, registry_revision: entry.registryRevision, admission_enabled: !(invalidSecond && entry.fixture === FIXTURES[1]) }] : [] }
    }
    if (sql.includes('read_active_persistence_artifact_v1')) {
      if (params[0] === 'orgmaster-workspace.v1.json') return { rows: [{ artifact_key: params[0], artifact_kind: 'workspace-manifest', payload: { currentVersionId: 'current-dev014' }, canonical_sha256: 'manifest-revision', source_revision: 'c'.repeat(64) }] }
      if (params[0] === 'orgmaster-versions/current-dev014.json') return { rows: [{ artifact_key: params[0], artifact_kind: 'workspace-version', payload: structuredClone(workspacePayload), canonical_sha256: workspaceRevision, source_revision: 'c'.repeat(64) }] }
      return { rows: [] }
    }
    if (sql.includes('assert_employee_activation_v1')) return { rows: [{ allowed: !(invalidSecond && params[0] === FIXTURES[1].employeeId), correction_required: invalidSecond && params[0] === FIXTURES[1].employeeId }] }
    if (sql.includes('read_active_persistence_authority_v1')) return { rows: [{ authority_version: 1, source_revision: 'c'.repeat(64) }] }
    if (sql.includes('write_active_persistence_artifacts_with_identity_fence_v1')) {
      const [change] = JSON.parse(params[0])
      workspacePayload = structuredClone(change.payload)
      workspaceRevision = change.nextCanonicalSha256
      for (const employee of workspacePayload.state.employees) state.get(employee.id).employeeStatus = employee.status
      return { rows: [{ authority_version: 2, source_revision: params[1], outbox_count: 0 }] }
    }
    if (sql.includes('resolve_managed_login_alias_v1')) {
      const entry = byNumber(params[0])
      return { rows: entry?.identityState === 'directory_linked_pending_auth' ? [{ employee_id: entry.fixture.employeeId, employee_number: entry.fixture.employeeNumber, directory_customer_id: TARGET.directoryCustomerId, directory_user_id: entry.directoryUserId, link_state: entry.identityState, registry_revision: entry.registryRevision }] : [] }
    }
    if (sql.includes('assign_employee_number_v1')) {
      const entry = state.get(params[0]); entry.employeeNumber = params[1]; entry.registryRevision = String(Number(entry.registryRevision) + 1)
      return { rows: [{ disposition: 'applied', assignment: { employee_id: entry.fixture.employeeId, employee_number: entry.fixture.employeeNumber } }] }
    }
    if (sql.includes('lease_managed_identity_candidate_v1')) return { rows: [{ candidate_token: `candidate-${params[0]}`, directory_customer_id: params[3], directory_user_id: params[4] }] }
    if (sql.includes('read_managed_identity_candidate_v1')) return { rows: [{ result: { kind: 'candidate', snapshot: { directoryCustomerId: TARGET.directoryCustomerId, directoryUserId: `directory-${state.get(params[1]).fixture.alias}`, primaryEmail: state.get(params[1]).fixture.primaryEmail } } }] }
    if (sql.includes('confirm_managed_identity_link_v1')) { state.get(params[1]).identityState = 'directory_linked_pending_auth'; return { rows: [{ employee_id: params[1] }] } }
    throw new Error(`UNEXPECTED_SQL:${sql}`)
  }
  return { calls, query, state, workspace: () => ({ payload: workspacePayload, revision: workspaceRevision }) }
}

function operation(phase) { return { ...base, phase } }

test('parses one exact phase and source-bound operation', () => {
  const value = operation('assign')
  const argv = ['--operation-id', value.operationId, '--source-revision', value.sourceRevision, '--workspace-revision', value.workspaceRevision, '--deadline-at', value.deadlineAt, '--phase', value.phase]
  assert.deepEqual(parseArgs(argv), value)
  assert.throws(() => parseArgs(argv.slice(0, -2)), /DEV014_LOGIN_FIXTURE_ARGUMENT_INVALID/u)
})

test('binds execution to the OrgMaster migrator and exact source', () => {
  const environment = { GOOGLE_CLOUD_PROJECT: TARGET.projectId, GOOGLE_CLOUD_REGION: TARGET.region, OWNER_APPLICATION_ID: 'orgmaster', POSTGRES_DATABASE: TARGET.database, POSTGRES_IAM_LOGIN: TARGET.operatorDbLogin, CLOUD_RUN_JOB: TARGET.jobName, OWNER_SOURCE_REVISION: base.sourceRevision, POSTGRES_SOCKET: `/cloudsql/${TARGET.projectId}:${TARGET.region}:${TARGET.instance}` }
  assert.doesNotThrow(() => assertEnvironment(environment, operation('assign')))
  assert.throws(() => assertEnvironment({ ...environment, POSTGRES_IAM_LOGIN: 'orgmaster-prod-runtime@jenfu-platform-prod.iam' }, operation('assign')), /DEV014_LOGIN_FIXTURE_TARGET_INVALID/u)
  assert.throws(() => assertEnvironment({ ...environment, OWNER_SOURCE_REVISION: 'b'.repeat(40) }, operation('assign')), /DEV014_LOGIN_FIXTURE_TARGET_INVALID/u)
})

test('assigns only the two fixed employee numbers and replays exact assignments', async () => {
  const db = database()
  const first = await executeFixturePhase({ database: db, operation: operation('assign'), now: new Date('2026-09-22T08:00:00.000Z') })
  assert.deepEqual(first.map((entry) => entry.disposition), ['APPLIED', 'APPLIED'])
  assert.deepEqual(db.calls.filter((entry) => entry.sql.includes('assign_employee_number_v1')).map((entry) => entry.params.slice(0, 2)), FIXTURES.map((fixture) => [fixture.employeeId, fixture.employeeNumber]))
  const replay = await executeFixturePhase({ database: db, operation: operation('assign'), now: new Date('2026-09-22T08:01:00.000Z') })
  assert.deepEqual(replay.map((entry) => entry.disposition), ['EXISTING', 'EXISTING'])
})

test('activates both fixed employees in one CAS write and replays the exact result', async () => {
  const db = database({ assigned: true })
  const first = await executeFixturePhase({ database: db, operation: operation('activate'), now: new Date('2026-09-22T08:00:00.000Z') })
  assert.deepEqual(first.map((entry) => entry.disposition), ['APPLIED', 'APPLIED'])
  assert.deepEqual(db.workspace().payload.state.employees.map((employee) => employee.status), ['active', 'active'])
  assert.equal(db.calls.filter((entry) => entry.sql.includes('write_active_persistence_artifacts_with_identity_fence_v1')).length, 1)
  const replay = await executeFixturePhase({ database: db, operation: { ...operation('activate'), workspaceRevision: db.workspace().revision }, now: new Date('2026-09-22T08:01:00.000Z') })
  assert.deepEqual(replay.map((entry) => entry.disposition), ['REPLAY', 'REPLAY'])
  assert.equal(db.calls.filter((entry) => entry.sql.includes('write_active_persistence_artifacts_with_identity_fence_v1')).length, 1)
})

test('rejects activation before any workspace write when either fixed employee fails the database fence', async () => {
  const db = database({ assigned: true, invalidSecond: true })
  await assert.rejects(executeFixtureTransaction({ database: db, operation: operation('activate'), now: new Date('2026-09-22T08:00:00.000Z') }), /DEV014_LOGIN_FIXTURE_ACTIVATION_FENCE_REJECTED/u)
  assert.deepEqual(db.workspace().payload.state.employees.map((employee) => employee.status), ['inactive', 'inactive'])
  assert.ok(!db.calls.some((entry) => entry.sql.includes('write_active_persistence_artifacts_with_identity_fence_v1')))
})

test('links both fixed Directory users and redacts raw account identifiers', async () => {
  const db = database({ active: true, assigned: true })
  const keys = []
  const result = await executeFixturePhase({
    database: db,
    readDirectoryUser: async (key, expectedEmail) => {
      keys.push(key)
      const fixture = FIXTURES.find((entry) => entry.primaryEmail === expectedEmail)
      return { customerId: TARGET.directoryCustomerId, userId: `directory-${fixture.alias}`, primaryEmail: fixture.primaryEmail, suspended: false, archived: false, etag: `etag-${fixture.alias}` }
    },
    operation: operation('link'),
    now: new Date('2026-09-22T08:00:00.000Z'),
  })
  assert.deepEqual(result.map((entry) => entry.linkState), ['directory_linked_pending_auth', 'directory_linked_pending_auth'])
  assert.deepEqual(keys, [FIXTURES[0].primaryEmail, `directory-${FIXTURES[0].alias}`, FIXTURES[1].primaryEmail, `directory-${FIXTURES[1].alias}`])
  for (const fixture of FIXTURES) assert.ok(!JSON.stringify(result).includes(fixture.primaryEmail))
})

test('readback reports the exact active workspace revision without writing', async () => {
  const db = database({ assigned: true })
  const result = await executeFixturePhase({ database: db, operation: operation('readback'), now: new Date('2026-09-22T08:00:00.000Z') })
  assert.deepEqual(result.map((entry) => ({ version: entry.workspaceVersionId, revision: entry.workspaceRevision })), [
    { version: 'current-dev014', revision: base.workspaceRevision },
    { version: 'current-dev014', revision: base.workspaceRevision },
  ])
  assert.ok(!db.calls.some((entry) => entry.sql.includes('write_active_persistence_artifacts_with_identity_fence_v1')))
})

test('fails closed on Directory drift before confirmation', async () => {
  const db = database({ active: true, assigned: true })
  let reads = 0
  await assert.rejects(executeFixturePhase({
    database: db,
    readDirectoryUser: async (_key, expectedEmail) => {
      const fixture = FIXTURES.find((entry) => entry.primaryEmail === expectedEmail)
      return { customerId: TARGET.directoryCustomerId, userId: `directory-${fixture.alias}`, primaryEmail: fixture.primaryEmail, suspended: false, archived: false, etag: ++reads === 2 ? 'changed' : `etag-${fixture.alias}` }
    },
    operation: operation('link'),
    now: new Date('2026-09-22T08:00:00.000Z'),
  }), /DEV014_LOGIN_FIXTURE_DIRECTORY_CHANGED/u)
  assert.ok(!db.calls.some((entry) => entry.sql.includes('confirm_managed_identity_link_v1')))
})

test('rolls back both fixtures when the second target fails closed', async () => {
  const db = database({ invalidSecond: true })
  await assert.rejects(executeFixtureTransaction({
    database: db,
    operation: operation('assign'),
    now: new Date('2026-09-22T08:00:00.000Z'),
  }), /DEV014_LOGIN_FIXTURE_ASSIGN_PREFLIGHT_INVALID/u)
  assert.deepEqual([...db.state.values()].map((entry) => entry.employeeNumber), ['', ''])
  assert.deepEqual(db.calls.filter((entry) => ['BEGIN', 'ROLLBACK'].includes(entry.sql)).map((entry) => entry.sql), ['BEGIN', 'ROLLBACK'])
})

test('keeps the fixture operator in the immutable migration-runner image', () => {
  const dockerfile = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile', import.meta.url), 'utf8')
  assert.match(dockerfile, /COPY scripts\/dev014-production-login-fixture-runner\.mjs/u)
})
