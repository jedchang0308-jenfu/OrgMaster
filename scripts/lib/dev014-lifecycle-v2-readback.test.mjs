import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV014_JED_SMOKE,
  DEV014_LIFECYCLE_FIXTURES,
  readLifecycleV2EventSnapshot,
  readLifecycleV2PreflightSnapshot,
} from './dev014-lifecycle-v2-readback.mjs'

const EVENT_VERSION = 'orgmaster.principal-lifecycle.v2'
const RECEIPT_VERSION = 'platform.principal-lifecycle-receipt.v2'
const ACTIVE_VERSION = 'organization.active-principal.v1'
const WORKLOAD_VERSION = 'orgmaster.workload-principals.v1'
const EMPLOYEE_ID = DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId
const PRINCIPAL_ID = 'principal-firebase-fixture-jfs9014'
const OTHER_PRINCIPAL_ID = 'principal-firebase-fixture-jfs9015'
const EVENT_ID = '00000000-0000-4000-8000-000000000001'
const RECEIPT_ID = '00000000-0000-4000-8000-000000000002'
const OPERATION_ID = 'DEV014-JFS9014-REVOKE-0001'
const SOURCE_REVISION = 'a'.repeat(40)
const SNAPSHOT_HASH = 'b'.repeat(64)
const CREATED_AT = '2026-10-06T00:00:00.000Z'

const event = () => ({
  contract_version: EVENT_VERSION,
  event_id: EVENT_ID,
  operation_id: OPERATION_ID,
  source_revision: SOURCE_REVISION,
  reason_code: 'runtime_artifact_write',
  snapshot_hash: SNAPSHOT_HASH,
  created_at: CREATED_AT,
})

const target = (principalId = PRINCIPAL_ID, employeeId = EMPLOYEE_ID) => ({
  event_id: EVENT_ID,
  principal_id: principalId,
  employee_id: employeeId,
  account_type: 'human_personal',
  // These fields deliberately model sensitive provider-pair columns omitted by the reader query.
  principal_issuer: 'https://accounts.google.com',
  principal_subject: 'must-not-be-selected-or-returned',
})

const workloadBindings = () => [
  {
    contract_version: WORKLOAD_VERSION,
    principal_id: 'principal-workload:orgmaster-managed-identity-lifecycle',
    owner: 'orgmaster',
    purpose: 'managed-identity-lifecycle',
    db_session_user: 'orgmaster-prod-runtime@jenfu-platform-prod.iam',
    binding_version: 1,
    enabled: true,
  },
  {
    contract_version: WORKLOAD_VERSION,
    principal_id: 'principal-workload:platform-principal-lifecycle-invalidation',
    owner: 'platform',
    purpose: 'principal-lifecycle-invalidation',
    db_session_user: 'platform-prod-runtime@jenfu-platform-prod.iam',
    binding_version: 1,
    enabled: true,
  },
]

const receipt = (overrides = {}) => ({
  contract_version: RECEIPT_VERSION,
  receipt_id: RECEIPT_ID,
  event_id: EVENT_ID,
  operation_id: OPERATION_ID,
  source_revision: SOURCE_REVISION,
  snapshot_hash: SNAPSHOT_HASH,
  delivery_principal_id: 'principal-workload:orgmaster-managed-identity-lifecycle',
  executor_principal_id: 'principal-workload:platform-principal-lifecycle-invalidation',
  principal_only: true,
  principal_results: [{ principalId: PRINCIPAL_ID, result: 'invalidated', authEpoch: 5 }],
  completed_at: '2026-10-06T00:01:00.000Z',
  ...overrides,
})

const accountFact = (employeeId, principalId, accountType = 'human_personal', metadata = {}) => ({
  contract_version: ACTIVE_VERSION,
  employee_id: employeeId,
  principal_id: principalId,
  account_type: accountType,
  employee_status: 'active',
  mapping_version: Object.hasOwn(metadata, 'mapping_version') ? metadata.mapping_version : 3,
  published_at: Object.hasOwn(metadata, 'published_at') ? metadata.published_at : '2026-10-05T00:00:00.000Z',
  // The reader must not select these source-view provider-pair columns.
  principal_issuer: 'https://accounts.google.com',
  principal_subject: 'must-not-be-selected-or-returned',
})

function database(overrides = {}) {
  const calls = []
  let identityRead = 0
  const db = {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params })
      const statement = String(sql)
      if (/^BEGIN\b/u.test(statement) || /^COMMIT\b/u.test(statement)
        || /^ROLLBACK\b/u.test(statement) || /^SET LOCAL/u.test(statement)) return { rows: [] }
      if (overrides.throwOn && statement.includes(overrides.throwOn.queryPart)) throw new Error(overrides.throwOn.message)
      if (statement.includes('current_database()')) {
        identityRead += 1
        const defaultIdentity = {
          database: 'jenfu_prod',
          session_user: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
          effective_user: identityRead === 1
            ? 'orgmaster-prod-migrator@jenfu-platform-prod.iam'
            : 'jenfu_orgmaster_migrator',
          transaction_read_only: 'on',
        }
        const identities = overrides.identities ?? []
        return { rows: [{ ...defaultIdentity, ...(identities[identityRead - 1] ?? {}) }] }
      }
      if (statement.includes('v_active_principal_accounts_v1')) return { rows: overrides.accountRows ?? [] }
      if (statement.includes('read_principal_auth_state_v3')) {
        const requested = params[0] ?? []
        const epochs = overrides.epochs ?? new Map()
        return {
          rows: requested.map(principalId => {
            const state = epochs instanceof Map ? epochs.get(principalId) : epochs[principalId]
            return state
              ? { requested_principal_id: principalId, principal_id: principalId, ...state }
              : { requested_principal_id: principalId, principal_id: null, auth_epoch: null, revoked_before: null, version: null }
          }),
        }
      }
      if (statement.includes('v_principal_lifecycle_events_v2')) {
        if (statement.includes('created_at >= $2::timestamptz')) return { rows: overrides.eventCandidates ?? [event()] }
        return { rows: overrides.eventRows ?? [event()] }
      }
      if (statement.includes('v_principal_lifecycle_targets_v2')) return { rows: overrides.targetRows ?? [target()] }
      if (statement.includes('v_workload_principals_v1')) return { rows: overrides.workloadRows ?? workloadBindings() }
      if (statement.includes('principal_lifecycle_delivery_v2')) {
        return {
          rows: overrides.deliveryRows ?? [{
            event_id: EVENT_ID,
            status: 'completed',
            attempt_count: 1,
            lease_generation: 1,
            receipt_id: RECEIPT_ID,
            last_error_code: null,
            completed_at: '2026-10-06T00:01:00.000Z',
            lease_until: null,
          }],
        }
      }
      if (statement.includes('v_principal_lifecycle_receipts_v2')) return { rows: overrides.receiptRows ?? [receipt()] }
      throw new Error(`unexpected test SQL: ${statement}`)
    },
  }
  return db
}

const epochMap = (principalId = PRINCIPAL_ID, authEpoch = 5) => new Map([[principalId, {
  auth_epoch: authEpoch,
  revoked_before: '2026-10-06T00:00:30.000Z',
  version: 2,
}]])

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error.message, `DEV014_LIFECYCLE_V2_READBACK_${code}`)
    return true
  })
}

test('event readback joins the immutable event, exact target, delivery, receipt, and epoch without leaking snapshots or provider pairs', async () => {
  const db = database({ epochs: epochMap() })
  const result = await readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID })
  assert.equal(result.schemaVersion, 'orgmaster.dev014-lifecycle-v2-event-readback.v1')
  assert.equal(result.databaseWrites, 0)
  assert.equal(result.identity.sessionUser, 'orgmaster-prod-migrator@jenfu-platform-prod.iam')
  assert.equal(result.delivery.status, 'completed')
  assert.equal(result.receipt.principalResults[0].result, 'invalidated')
  assert.equal(result.receipt.principalResults[0].authEpoch, 5)
  assert.equal(result.epochs[0].authEpoch, 5)
  assert.match(result.targets[0].principalIdSha256, /^[a-f0-9]{64}$/u)
  const output = JSON.stringify(result)
  assert.equal(output.includes(PRINCIPAL_ID), false)
  assert.equal(output.includes('must-not-be-selected-or-returned'), false)
  assert.equal(output.includes('snapshot_text'), false)
  assert.equal(db.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.ok(db.calls.some(call => call.sql === 'SET LOCAL ROLE jenfu_orgmaster_migrator'))
  assert.ok(db.calls.at(-1).sql === 'COMMIT')
  const readSql = db.calls.map(call => call.sql).join('\n')
  assert.doesNotMatch(readSql, /principal_issuer|principal_subject|snapshot_text|platform_core|ai_pdm_core/iu)
  assert.doesNotMatch(readSql, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b/iu)
})

test('event selector returns not found for zero operation-id candidates', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({ eventRows: [] }), {
    employeeNumber: 'JFS9014', operationId: OPERATION_ID,
  }), 'EVENT_NOT_FOUND')
})

test('event selector rejects multiple operation-id candidates instead of choosing one', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({ eventRows: [event(), { ...event(), event_id: '00000000-0000-4000-8000-000000000003' }] }), {
    employeeNumber: 'JFS9014', operationId: OPERATION_ID,
  }), 'EVENT_NOT_UNIQUE')
})

test('created-after selector rejects multiple fixed-fixture candidates', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({ eventCandidates: [event(), { ...event(), event_id: '00000000-0000-4000-8000-000000000003' }] }), {
    employeeNumber: 'JFS9014', createdAfter: '2026-10-05T00:00:00Z',
  }), 'EVENT_NOT_UNIQUE')
})

test('created-after selector enforces the bounded candidate cap', async () => {
  const candidates = Array.from({ length: 33 }, (_, index) => ({
    ...event(), event_id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
  }))
  await rejectsCode(readLifecycleV2EventSnapshot(database({ eventCandidates: candidates }), {
    employeeNumber: 'JFS9014', createdAfter: '2026-10-05T00:00:00Z',
  }), 'EVENT_CANDIDATE_CAP')
})

test('event readback rejects a target outside the selected single fixture', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({
    targetRows: [target(), target(OTHER_PRINCIPAL_ID, DEV014_LIFECYCLE_FIXTURES.JFS9015.employeeId)],
    epochs: epochMap(),
  }), { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'EVENT_TARGET_SCOPE_INVALID')
})

test('event readback rejects multiple Principal targets even when they share the allowed employee', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({
    targetRows: [target(), target(OTHER_PRINCIPAL_ID)],
    epochs: epochMap(),
  }), { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'EVENT_TARGET_PRINCIPAL_COUNT_INVALID')
})

test('event readback rejects a receipt whose immutable snapshot hash differs from the event', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({
    receiptRows: [receipt({ snapshot_hash: 'c'.repeat(64) })],
    epochs: epochMap(),
  }), { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'RECEIPT_MISMATCH')
})

test('event readback rejects an epoch older than the receipt invalidation epoch', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({ epochs: epochMap(PRINCIPAL_ID, 4) }), {
    employeeNumber: 'JFS9014', operationId: OPERATION_ID,
  }), 'RECEIPT_EPOCH_MISMATCH')
})

test('event readback rejects a receipt body containing an unknown Principal', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({
    receiptRows: [receipt({ principal_results: [{ principalId: OTHER_PRINCIPAL_ID, result: 'invalidated', authEpoch: 5 }] })],
    epochs: epochMap(),
  }), { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'RECEIPT_RESULT_INVALID')
})

test('event readback rejects a no-state receipt body with an unexpected epoch field', async () => {
  await rejectsCode(readLifecycleV2EventSnapshot(database({
    receiptRows: [receipt({ principal_results: [{ principalId: PRINCIPAL_ID, result: 'no_issued_security_state', authEpoch: 0 }] })],
    epochs: new Map(),
  }), { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'RECEIPT_RESULT_INVALID')
})

test('event readback identifies an unfinished owner delivery without inventing a receipt', async () => {
  const db = database({
    deliveryRows: [{
      event_id: EVENT_ID, status: 'pending', attempt_count: 0, lease_generation: 0,
      receipt_id: null, last_error_code: null, completed_at: null, lease_until: null,
    }],
    receiptRows: [],
  })
  const result = await readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID })
  assert.equal(result.delivery.status, 'pending')
  assert.equal(result.receipt, null)
  assert.equal(result.ownerCompletionPending, false)
  assert.equal(result.epochs[0].statePresent, false)
})

test('event selector refuses a non-allowlisted fixture and unknown selector fields before opening a transaction', async () => {
  const db = database()
  await rejectsCode(readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9999', operationId: OPERATION_ID }), 'FIXTURE_SELECTOR_INVALID')
  await rejectsCode(readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID, latest: true }), 'SELECTOR_INVALID')
  assert.equal(db.calls.length, 0)
})

test('event readback refuses a mismatched authentic database session before role elevation', async () => {
  const db = database({ identities: [{ effective_user: 'orgmaster-prod-runtime@jenfu-platform-prod.iam' }] })
  await rejectsCode(readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'DATABASE_IDENTITY_INVALID')
  assert.equal(db.calls.some(call => call.sql === 'SET LOCAL ROLE jenfu_orgmaster_migrator'), false)
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
})

test('event readback refuses a transaction that is not actually read-only', async () => {
  const db = database({ identities: [{ transaction_read_only: 'off' }] })
  await rejectsCode(readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'DATABASE_IDENTITY_INVALID')
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
})

test('event readback verifies SESSION_USER again after SET LOCAL ROLE', async () => {
  const db = database({ identities: [undefined, { session_user: 'unexpected-session' }] })
  await rejectsCode(readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'DATABASE_ROLE_INVALID')
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
})

test('database failures are reduced to a fixed code without forwarding provider error details', async () => {
  const db = database({ throwOn: { queryPart: 'current_database()', message: 'SECRET123 provider connection detail' } })
  await rejectsCode(readLifecycleV2EventSnapshot(db, { employeeNumber: 'JFS9014', operationId: OPERATION_ID }), 'DATABASE_OPERATION_FAILED')
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
})

test('preflight resolves fixed fixture identities and only the explicitly selected fixed smoke Principal', async () => {
  const db = database({
    accountRows: [
      accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID),
      accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9015.employeeId, OTHER_PRINCIPAL_ID, 'human_privileged'),
      accountFact(DEV014_JED_SMOKE.employeeId, DEV014_JED_SMOKE.principalId, 'human_privileged'),
    ],
    epochs: new Map([
      [PRINCIPAL_ID, { auth_epoch: 5, revoked_before: null, version: 2 }],
      [OTHER_PRINCIPAL_ID, { auth_epoch: 2, revoked_before: null, version: 1 }],
    ]),
  })
  const result = await readLifecycleV2PreflightSnapshot(db, { includeJedSmokePrincipal: true })
  assert.equal(result.fixtures.length, 2)
  assert.equal(result.fixtures[0].employeeNumber, 'JFS9014')
  assert.equal(result.fixtures[0].epoch.authEpoch, 5)
  assert.equal(result.fixtures[1].employeeNumber, 'JFS9015')
  assert.equal(result.jedSmoke.employeeLabel, 'JED_SMOKE')
  assert.equal(result.jedSmoke.epoch.statePresent, false)
  const output = JSON.stringify(result)
  assert.equal(output.includes(PRINCIPAL_ID), false)
  assert.equal(output.includes(DEV014_JED_SMOKE.principalId), false)
  assert.equal(output.includes(DEV014_JED_SMOKE.employeeId), false)
  const accountSql = db.calls.find(call => call.sql.includes('v_active_principal_accounts_v1')).sql
  assert.doesNotMatch(accountSql, /principal_issuer|principal_subject/iu)
  assert.ok(db.calls.some(call => Array.isArray(call.params[0]) && call.params[0].includes(DEV014_JED_SMOKE.employeeId)))
})

test('preflight preserves distinct alias mapping metadata without treating it as identity ambiguity', async () => {
  const db = database({ accountRows: [
    accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID, 'human_personal', {
      mapping_version: 2, published_at: '2026-10-04T00:00:00.000Z',
    }),
    accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID, 'human_personal', {
      mapping_version: 3, published_at: '2026-10-05T00:00:00.000Z',
    }),
  ] })
  const result = await readLifecycleV2PreflightSnapshot(db)
  const fixture = result.fixtures.find(row => row.employeeNumber === 'JFS9014')
  assert.equal(fixture.status, 'ACTIVE_PRINCIPAL_RESOLVED')
  assert.equal(fixture.mappingVersion, null)
  assert.deepEqual(fixture.mappingVersions, [2, 3])
  assert.equal(fixture.publishedAt, null)
  assert.deepEqual(fixture.publishedAtValues, ['2026-10-04T00:00:00.000Z', '2026-10-05T00:00:00.000Z'])
})

test('preflight still rejects canonical Principal metadata conflicts', async () => {
  const cases = [
    {
      code: 'IDENTITY_FACT_AMBIGUOUS',
      rows: [
        accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID, 'human_personal'),
        accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID, 'human_privileged'),
      ],
    },
    {
      code: 'IDENTITY_FACT_AMBIGUOUS',
      rows: [
        accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID),
        accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9015.employeeId, PRINCIPAL_ID),
      ],
    },
  ]
  for (const item of cases) await rejectsCode(readLifecycleV2PreflightSnapshot(database({ accountRows: item.rows })), item.code)
})

test('preflight rejects null, missing, and blank publication timestamps instead of coercing them to 1970', async () => {
  for (const published_at of [null, undefined, '']) {
    await rejectsCode(readLifecycleV2PreflightSnapshot(database({
      accountRows: [accountFact(DEV014_LIFECYCLE_FIXTURES.JFS9014.employeeId, PRINCIPAL_ID, 'human_personal', { published_at })],
    })), 'IDENTITY_FACT_INVALID')
  }
})

test('preflight cannot accept arbitrary options or a guessed smoke Principal', async () => {
  const db = database()
  await rejectsCode(readLifecycleV2PreflightSnapshot(db, { principalId: 'caller-controlled' }), 'PREFLIGHT_OPTIONS_INVALID')
  await rejectsCode(readLifecycleV2PreflightSnapshot(db, { includeJedSmokePrincipal: 'true' }), 'PREFLIGHT_OPTIONS_INVALID')
  assert.equal(db.calls.length, 0)
})
