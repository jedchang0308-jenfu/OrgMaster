import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { assertEnvironment, executeManagedLink, parseArgs, TARGET } from './dev014-production-managed-link-runner.mjs'

const operation = Object.freeze({
  operationId: 'DEV014-MANAGED-LINK-EMPLOYEE-SHIJIE-R1',
  sourceRevision: 'a'.repeat(40),
  workspaceRevision: 'workspace-revision-1',
  deadlineAt: '2026-09-22T08:00:00.000Z',
})
const directoryUser = Object.freeze({ customerId: TARGET.directoryCustomerId, userId: 'directory-user-5', primaryEmail: TARGET.primaryEmail, suspended: false, archived: false, etag: 'etag-5' })

function database({ replay = false, employeeNumberExists = replay } = {}) {
  const calls = []
  const query = async (sql, params) => {
    calls.push({ sql, params })
    const assigned = employeeNumberExists || calls.some((entry) => entry.sql.includes('assign_employee_number_v1'))
    if (sql.includes('read_employee_managed_identity_v1')) return { rows: [{ employee_id: TARGET.employeeId, employee_status: 'active', employee_number: assigned ? TARGET.employeeNumber : null, identity_state: replay ? 'directory_linked_pending_auth' : 'not_linked', registry_revision: assigned ? '1' : '0', admission_enabled: true }] }
    if (sql.includes('resolve_managed_login_alias_v1')) {
      const applied = replay || calls.some((entry) => entry.sql.includes('confirm_managed_identity_link_v1'))
      return { rows: applied ? [{ employee_id: TARGET.employeeId, employee_number: TARGET.employeeNumber, directory_customer_id: directoryUser.customerId, directory_user_id: directoryUser.userId, link_state: 'directory_linked_pending_auth', registry_revision: '1', principal_id: 'principal-5' }] : [] }
    }
    if (sql.includes('assign_employee_number_v1')) return { rows: [{ disposition: 'applied', assignment: { employee_id: TARGET.employeeId, employee_number: TARGET.employeeNumber }, document: {}, revision: '1' }] }
    if (sql.includes('lease_managed_identity_candidate_v1')) return { rows: [{ candidate_token: 'opaque-candidate', directory_customer_id: directoryUser.customerId, directory_user_id: directoryUser.userId }] }
    if (sql.includes('read_managed_identity_candidate_v1')) return { rows: [{ result: { kind: 'candidate', snapshot: { directoryCustomerId: directoryUser.customerId, directoryUserId: directoryUser.userId, primaryEmail: directoryUser.primaryEmail } } }] }
    if (sql.includes('confirm_managed_identity_link_v1')) return { rows: [{ employee_id: TARGET.employeeId }] }
    throw new Error(`UNEXPECTED_SQL:${sql}`)
  }
  return { calls, query }
}

test('parses one exact source-bound operation', () => {
  assert.deepEqual(parseArgs(['--operation-id', operation.operationId, '--source-revision', operation.sourceRevision, '--workspace-revision', operation.workspaceRevision, '--deadline-at', operation.deadlineAt]), operation)
  assert.throws(() => parseArgs(['--operation-id', operation.operationId]), /DEV014_MANAGED_LINK_ARGUMENT_INVALID/u)
})

test('binds the execution environment to the exact source revision', () => {
  const environment = { GOOGLE_CLOUD_PROJECT: TARGET.projectId, GOOGLE_CLOUD_REGION: TARGET.region, OWNER_APPLICATION_ID: 'orgmaster', POSTGRES_DATABASE: TARGET.database, POSTGRES_IAM_LOGIN: TARGET.runtimeDbLogin, OWNER_SOURCE_REVISION: operation.sourceRevision, POSTGRES_SOCKET: `/cloudsql/${TARGET.projectId}:${TARGET.region}:${TARGET.instance}` }
  assert.doesNotThrow(() => assertEnvironment(environment, operation))
  assert.throws(() => assertEnvironment({ ...environment, OWNER_SOURCE_REVISION: 'b'.repeat(40) }, operation), /DEV014_MANAGED_LINK_TARGET_INVALID/u)
})

test('applies candidate then confirm with a second stable-key Directory read', async () => {
  const db = database()
  const keys = []
  const result = await executeManagedLink({
    database: db,
    readDirectoryUser: async (key) => { keys.push(key); return directoryUser },
    operation,
    now: new Date('2026-09-22T04:00:00.000Z'),
  })
  assert.equal(result.disposition, 'APPLIED')
  assert.equal(result.employeeNumberDisposition, 'APPLIED')
  assert.equal(result.linkState, 'directory_linked_pending_auth')
  assert.deepEqual(keys, [TARGET.primaryEmail, directoryUser.userId])
  const lease = db.calls.find((entry) => entry.sql.includes('lease_managed_identity_candidate_v1'))
  const assignment = db.calls.find((entry) => entry.sql.includes('assign_employee_number_v1'))
  assert.deepEqual(assignment.params.slice(0, 5), [TARGET.employeeId, TARGET.employeeNumber, 'dev014-production-managed-link', operation.workspaceRevision, '0'])
  assert.deepEqual(lease.params.slice(0, 6), [TARGET.employeeId, TARGET.employeeNumber, TARGET.primaryEmail, directoryUser.customerId, directoryUser.userId, directoryUser.primaryEmail])
  assert.ok(!JSON.stringify(result).includes(TARGET.primaryEmail))
  assert.ok(!JSON.stringify(result).includes(directoryUser.userId))
})

test('replays exact existing link without a second write or Directory read', async () => {
  const db = database({ replay: true })
  const keys = []
  const result = await executeManagedLink({
    database: db,
    readDirectoryUser: async (key) => { keys.push(key); return directoryUser },
    operation,
    now: new Date('2026-09-22T04:00:00.000Z'),
  })
  assert.equal(result.disposition, 'REPLAY')
  assert.equal(result.employeeNumberDisposition, 'EXISTING')
  assert.deepEqual(keys, [TARGET.primaryEmail])
  assert.ok(!db.calls.some((entry) => entry.sql.includes('lease_managed_identity_candidate_v1')))
})

test('fails closed on directory drift and keeps the operator in the immutable runner image', async () => {
  const db = database()
  let count = 0
  await assert.rejects(executeManagedLink({
    database: db,
    readDirectoryUser: async () => (++count === 1 ? directoryUser : { ...directoryUser, etag: 'changed' }),
    operation,
    now: new Date('2026-09-22T04:00:00.000Z'),
  }), /DEV014_MANAGED_LINK_DIRECTORY_CHANGED/u)
  assert.ok(!db.calls.some((entry) => entry.sql.includes('confirm_managed_identity_link_v1')))
  const dockerfile = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile', import.meta.url), 'utf8')
  assert.match(dockerfile, /COPY scripts\/dev014-production-managed-link-runner\.mjs/u)
})
