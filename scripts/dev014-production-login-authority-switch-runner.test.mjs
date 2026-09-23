import assert from 'node:assert/strict'
import test from 'node:test'
import { assertEnvironment, executeAuthorityBatch, FIXTURES, TARGET, parseArgs } from './dev014-production-login-authority-switch-runner.mjs'

const sourceRevision = 'a'.repeat(40)
const governanceSha = 'b'.repeat(64)
const operation = { operationId: 'DEV014-LOGIN-AUTHORITY-20260923-R1', sourceRevision, deadlineAt: '2099-09-23T00:00:00.000Z' }

function fakeDatabase({ mode = 'legacy', failSecond = false, partial = false } = {}) {
  const state = new Map(FIXTURES.map((fixture) => [fixture.employeeId, {
    source: mode === 'replay' ? 'orgmaster_authority' : 'legacy_authority', version: mode === 'replay' ? 2 : 1,
    receipt: mode === 'replay' ? { receipt_id: `receipt-${fixture.alias}`, operation_id: `${operation.operationId}-${fixture.alias.toUpperCase()}`, batch_id: operation.operationId, application_id: 'ai-pdm', employee_id: fixture.employeeId, from_authority_source: 'legacy_authority', to_authority_source: 'orgmaster_authority', authority_version: 2, assignment_version_id: 'assignment-policy-fixture', session_refresh_state: 'pending', actor: TARGET.actor, reason: `DEV-014 login fixture ${fixture.alias} switch to OrgMaster authority`, switched_at: '2026-09-23T00:00:01.000Z' } : null,
    outbox: mode === 'replay' ? { event_id: `event-${fixture.alias}`, operation_id: `${operation.operationId}-${fixture.alias.toUpperCase()}`, employee_id: fixture.employeeId, application_id: 'ai-pdm', event_kind: 'authority_switch', actor: TARGET.actor, reason_code: 'entitlement_authority_switch', status: 'pending', attempt_count: 0, platform_receipt_id: null, created_at: '2026-09-23T00:00:01.000Z', completed_at: null } : null,
  }]))
  if (partial) state.get(FIXTURES[0].employeeId).receipt = { receipt_id: 'partial', operation_id: `${operation.operationId}-${FIXTURES[0].alias.toUpperCase()}` }
  const calls = []
  let snapshot = null
  const governance = {
    activePolicyVersionId: 'assignment-policy-fixture',
    publishedVersions: [{ id: 'assignment-policy-fixture', kind: 'assignment-governance-v3', versionNumber: 4, policy: { roleAssignments: FIXTURES.map((fixture) => ({ applicationId: 'ai-pdm', employeeId: fixture.employeeId, roleCodeSnapshot: 'rd', subjectKind: 'employee', scope: { kind: 'workspace', value: 'current' }, status: 'active', basis: 'manual', sources: [] })) } }],
  }
  const query = async (sql, params = []) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT payload')) return { rows: [{ payload: governance, canonical_sha256: governanceSha, source_revision: sourceRevision }] }
    if (sql.includes('v_ai_pdm_entitlement_authority_v1')) {
      const entry = state.get(params[0]); return { rows: [{ application_id: 'ai-pdm', authority_source: entry.source, authority_version: entry.version, employee_id: params[0], operation_id: entry.receipt?.operation_id ?? null }] }
    }
    if (sql.includes('v_ai_pdm_effective_role_assignments_v1')) {
      const entry = state.get(params[0]); return { rows: entry.source === 'orgmaster_authority' ? [{ role_code: 'rd', scope_kind: 'workspace', scope_key: 'current', authority_version: 2 }] : [] }
    }
    if (sql.includes('authority_switch_receipts')) {
      const entry = state.get(params[2]);
      return { rows: entry.receipt && entry.receipt.operation_id === params[0] ? [entry.receipt] : [] }
    }
    if (sql.includes('entitlement_change_outbox')) {
      const entry = state.get(params[2]);
      return { rows: entry.outbox && entry.outbox.operation_id === params[0] ? [entry.outbox] : [] }
    }
    if (sql.startsWith('BEGIN')) { snapshot = structuredClone([...state.entries()]); return { rows: [] } }
    if (sql.startsWith('ROLLBACK')) { state.clear(); for (const [key, value] of snapshot ?? []) state.set(key, value); snapshot = null; return { rows: [] } }
    if (sql.startsWith('COMMIT')) { snapshot = null; return { rows: [] } }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes('switch_employee_entitlement_authority_v1')) {
      const employeeId = params[1]
      if (failSecond && employeeId === FIXTURES[1].employeeId) throw new Error('FIXTURE_SECOND_FAIL')
      const entry = state.get(employeeId)
      entry.source = 'orgmaster_authority'; entry.version = 2
      entry.receipt = { receipt_id: `receipt-${employeeId}`, operation_id: params[4], batch_id: params[5], application_id: params[0], employee_id: employeeId, from_authority_source: 'legacy_authority', to_authority_source: params[2], authority_version: 2, assignment_version_id: params[6], session_refresh_state: 'pending', actor: params[7], reason: params[8], switched_at: '2026-09-23T00:00:01.000Z' }
      entry.outbox = { event_id: `event-${employeeId}`, operation_id: params[4], employee_id: employeeId, application_id: params[0], event_kind: 'authority_switch', actor: params[7], reason_code: 'entitlement_authority_switch', status: 'pending', attempt_count: 0, platform_receipt_id: null, created_at: '2026-09-23T00:00:01.000Z', completed_at: null }
      return { rows: [{ receipt_id: entry.receipt.receipt_id, authority_version: 2, outbox_event_id: entry.outbox.event_id, session_refresh_state: 'pending', replayed: false }] }
    }
    throw new Error(`UNEXPECTED_SQL:${sql}`)
  }
  return { query, calls, state }
}

test('parses exact source-bound operation and output prefix', () => {
  const future = new Date(Date.now() + 60 * 60 * 1_000).toISOString()
  const parsed = parseArgs(['--operation-id', operation.operationId, '--source-revision', sourceRevision, '--deadline-at', future, '--output-ref', `gs://${TARGET.releaseBucket}/${TARGET.receiptPrefix}/batch.json`])
  assert.deepEqual(parsed.operationId, operation.operationId)
  assert.throws(() => parseArgs(['--operation-id', 'WRONG', '--source-revision', sourceRevision, '--deadline-at', future, '--output-ref', `gs://${TARGET.releaseBucket}/${TARGET.receiptPrefix}/batch.json`]), /DEV014_LOGIN_AUTHORITY_ARGUMENT_INVALID/u)
  assert.throws(() => parseArgs(['--operation-id', operation.operationId, '--source-revision', sourceRevision, '--deadline-at', future, '--output-ref', `gs://${TARGET.releaseBucket}/${TARGET.receiptPrefix}/r1.json`]), /DEV014_LOGIN_AUTHORITY_ARGUMENT_INVALID/u)
})

test('binds the operator to the exact migrator identity and production job target', () => {
  assert.doesNotThrow(() => assertEnvironment({
    GOOGLE_CLOUD_PROJECT: TARGET.projectId, GOOGLE_CLOUD_REGION: TARGET.region, POSTGRES_DATABASE: TARGET.database,
    POSTGRES_IAM_LOGIN: TARGET.login, POSTGRES_SOCKET: `/cloudsql/${TARGET.connectionName}`, CLOUD_RUN_JOB: TARGET.jobName,
    OWNER_APPLICATION_ID: 'orgmaster', OWNER_SOURCE_REVISION: sourceRevision,
  }, operation))
  assert.throws(() => assertEnvironment({
    GOOGLE_CLOUD_PROJECT: TARGET.projectId, GOOGLE_CLOUD_REGION: TARGET.region, POSTGRES_DATABASE: TARGET.database,
    POSTGRES_IAM_LOGIN: 'orgmaster-prod-runtime@jenfu-platform-prod.iam', POSTGRES_SOCKET: `/cloudsql/${TARGET.connectionName}`, CLOUD_RUN_JOB: TARGET.jobName,
    OWNER_APPLICATION_ID: 'orgmaster', OWNER_SOURCE_REVISION: sourceRevision,
  }, operation), /DEV014_LOGIN_AUTHORITY_TARGET_INVALID/u)
})

test('switches both fixtures in one serializable transaction and proves effective rd projection', async () => {
  const db = fakeDatabase()
  const result = await executeAuthorityBatch({ database: db, operation, now: new Date('2026-09-23T00:00:00.000Z') })
  assert.equal(result.status, 'PASS')
  assert.equal(result.disposition, 'APPLIED')
  assert.equal(result.mutationCount, 6)
  assert.equal(result.atomicity, 'single_transaction_all_fixtures')
  assert.deepEqual(result.fixtures.map(({ disposition, after }) => [disposition, after.effectiveRoleCodes]), [['APPLIED', ['rd']], ['APPLIED', ['rd']]])
  assert.deepEqual(db.calls.filter(({ sql }) => sql.startsWith('BEGIN') || sql.startsWith('COMMIT')).map(({ sql }) => sql), ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT'])
})

test('replays the exact two committed receipts without a second mutation', async () => {
  const db = fakeDatabase({ mode: 'replay' })
  const result = await executeAuthorityBatch({ database: db, operation, now: new Date('2026-09-23T00:00:00.000Z') })
  assert.equal(result.disposition, 'REPLAY')
  assert.equal(result.mutationCount, 0)
  assert.equal(db.calls.some(({ sql }) => sql.includes('switch_employee_entitlement_authority_v1')), false)
})

test('fails closed on partial receipt state before any transaction or mutation', async () => {
  const db = fakeDatabase({ partial: true })
  await assert.rejects(executeAuthorityBatch({ database: db, operation, now: new Date('2026-09-23T00:00:00.000Z') }), /DEV014_LOGIN_AUTHORITY_PARTIAL_STATE/u)
  assert.equal(db.calls.some(({ sql }) => sql.includes('switch_employee_entitlement_authority_v1')), false)
})

test('rolls back the first fixture when the second CAS call fails', async () => {
  const db = fakeDatabase({ failSecond: true })
  await assert.rejects(executeAuthorityBatch({ database: db, operation, now: new Date('2026-09-23T00:00:00.000Z') }), /FIXTURE_SECOND_FAIL/u)
  assert.deepEqual([...db.state.values()].map(({ source, version, receipt, outbox }) => [source, version, receipt, outbox]), [['legacy_authority', 1, null, null], ['legacy_authority', 1, null, null]])
  assert.equal(db.calls.some(({ sql }) => sql.startsWith('ROLLBACK')), true)
})

test('rejects a fixture role drift before the CAS function', async () => {
  const db = fakeDatabase()
  const original = db.query
  db.query = async (sql, params = []) => {
    if (sql.startsWith('SELECT payload')) {
      const value = await original(sql, params)
      value.rows[0].payload.publishedVersions[0].policy.roleAssignments[1].roleCodeSnapshot = 'pdm_admin'
      return value
    }
    return original(sql, params)
  }
  await assert.rejects(executeAuthorityBatch({ database: db, operation, now: new Date('2026-09-23T00:00:00.000Z') }), /DEV014_LOGIN_AUTHORITY_ASSIGNMENT_INVALID/u)
  assert.equal(db.calls.some(({ sql }) => sql.includes('switch_employee_entitlement_authority_v1')), false)
})

test('rejects governance artifact source drift before the CAS function', async () => {
  const db = fakeDatabase()
  const original = db.query
  db.query = async (sql, params = []) => {
    const value = await original(sql, params)
    if (sql.startsWith('SELECT payload')) value.rows[0].source_revision = 'c'.repeat(40)
    return value
  }
  await assert.rejects(executeAuthorityBatch({ database: db, operation, now: new Date('2026-09-23T00:00:00.000Z') }), /DEV014_LOGIN_AUTHORITY_GOVERNANCE_SOURCE_INVALID/u)
  assert.equal(db.calls.some(({ sql }) => sql.includes('switch_employee_entitlement_authority_v1')), false)
})
