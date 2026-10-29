import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LOCAL_FIXTURE_VERSION,
  contractDigest,
  signLocalResponse,
  verifyLocalRequest,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import {
  LOCAL_PRINCIPAL_LIFECYCLE_PATH,
  LOCAL_PRINCIPAL_LIFECYCLE_VERSION,
  createLocalPrincipalLifecycleProducer,
  readCurrentLocalPrincipalLifecycleState,
  readLocalPrincipalLifecycleEvents,
  sendLocalPrincipalLifecycleEvent,
  transitionLocalPrincipalLifecycle,
} from './localPrincipalSandboxLifecycle.mjs'

const sandboxId = 'dev060-local-20261029'
const generation = '40000000-0000-4000-8000-000000000001'
const principalId = 'local-active-personal'
const employeeId = 'employee-local-active-personal'
const ownerKey = Buffer.alloc(32, 7).toString('base64url')
const appKey = Buffer.alloc(32, 8).toString('base64url')
const scenario = {
  scenarioId: 'active', label: 'Synthetic active', principalId, employeeId,
  identityIssuer: 'urn:jenfu:local-principal-sandbox', identitySubject: principalId,
  accountType: 'human_personal', principalStatus: 'active', employeeStatus: 'active',
  accountLifecycleVersion: 1, profileVersion: 1,
  grants: [{ applicationId: 'orgmaster', companyId: 'company-jenfu', stableRoleId: 'role-orgmaster-admin',
    catalogVersion: 'orgmaster.local.v1', catalogSha256: 'a'.repeat(64), roleDefinitionHash: 'b'.repeat(64),
    scopeKind: 'global', scopeRef: null, grantVersion: 1, status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z', validUntil: null }],
}
const fixturePayload = { contractVersion: LOCAL_FIXTURE_VERSION,
  fixtureVersion: 'orgmaster.local-principal-fixtures.2026-10-29.v1', scenarios: [scenario] }
const fixture = { ...fixturePayload, fixtureHash: contractDigest(fixturePayload) }
const profile = { sandboxId, generation, key: appKey, fixture }
const config = {
  applicationId: 'orgmaster', sandboxId, bindHost: '127.0.0.1',
  databaseName: 'jenfu_local_dev060_local_20261029', runtimeRole: 'jenfu_orgmaster_runtime',
  databaseUrl: 'postgresql://jenfu_orgmaster_runtime:private@127.0.0.1:53761/jenfu_local_dev060_local_20261029',
  platformOrigin: 'http://127.0.0.1:12000',
}

function publicationRow() {
  return { contract_version: 'orgmaster.local-principal-publication.v1',
    principal_issuer: scenario.identityIssuer, principal_subject: scenario.identitySubject,
    principal_id: principalId, employee_id: employeeId, account_type: scenario.accountType,
    employee_status: 'active', mapping_version: 1 }
}

class FakePool {
  constructor(target = config, databaseComment = `jenfu.local-principal-bootstrap.v1:${sandboxId}:${generation}`) {
    this.target = target; this.databaseComment = databaseComment; this.events = []; this.calls = []
  }
  async connect() { return new FakeClient(this) }
  async query(sql, values = []) { return new FakeClient(this).query(sql, values) }
}

class FakeClient {
  constructor(pool) { this.pool = pool; this.before = null }
  async query(sql, values = []) {
    const normalized = sql.replace(/\s+/gu, ' ').trim()
    this.pool.calls.push({ sql: normalized, values })
    if (normalized.startsWith('BEGIN')) { this.before = structuredClone(this.pool.events); return { rows: [] } }
    if (normalized === 'COMMIT') { this.before = null; return { rows: [] } }
    if (normalized === 'ROLLBACK') { if (this.before) this.pool.events = this.before; this.before = null; return { rows: [] } }
    if (normalized.startsWith('SELECT current_database() AS database_name')) return { rows: [{
      database_name: this.pool.target.databaseName, server_address: '127.0.0.1',
      server_port: Number(new URL(this.pool.target.databaseUrl).port), database_comment: this.pool.databaseComment,
      session_user: this.pool.target.runtimeRole, current_user: this.pool.target.runtimeRole,
    }] }
    if (normalized.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] }
    if (normalized.startsWith('SELECT contract_version, principal_issuer')) return { rows: [publicationRow()] }
    if (normalized.startsWith('SELECT contract_version, event_id, sandbox_id')) {
      let rows = this.pool.events.filter(row => row.sandbox_id === values[0])
      if (/generation = \$2/u.test(normalized)) {
        rows = rows.filter(row => row.generation === values[1])
        if (values.length === 3) {
          if (/principal_id = \$3/u.test(normalized)) rows = rows.filter(row => row.principal_id === values[2])
          else rows = rows.filter(row => row.event_id === values[2])
        } else if (values.length === 4) rows = rows.filter(row => row.principal_id === values[2] && row.event_id === values[3])
      } else if (values.length === 2) rows = rows.filter(row => row.event_id === values[1])
      rows.sort((a, b) => a.principal_id.localeCompare(b.principal_id) || a.lifecycle_version - b.lifecycle_version)
      return { rows: rows.slice(0, 1025).map(row => structuredClone(row)) }
    }
    if (normalized.startsWith('INSERT INTO orgmaster_core.local_principal_lifecycle_events')) {
      const [event_id, contract_version, sandbox_id, generationValue, fixture_version, fixture_hash,
        principal_id, expected_lifecycle_version, lifecycle_version, operation, snapshot_hash, event_hash, state] = values
      const row = { contract_version, event_id, sandbox_id, generation: generationValue, fixture_version,
        fixture_hash, principal_id, expected_lifecycle_version, lifecycle_version, operation, snapshot_hash,
        event_hash, state_snapshot: JSON.parse(state), occurred_at: new Date('2026-10-30T00:00:00.000Z') }
      this.pool.events.push(row)
      return { rows: [structuredClone(row)] }
    }
    throw new Error(`Unexpected query: ${normalized}`)
  }
  release() {}
}

function successFetch(events) {
  return async (url, init) => {
    assert.equal(url, new URL(LOCAL_PRINCIPAL_LIFECYCLE_PATH, config.platformOrigin).href)
    assert.equal(init.method, 'POST')
    assert.equal(init.redirect, 'error')
    const request = new Request(url, { method: init.method, headers: init.headers, body: init.body })
    const clientId = await verifyLocalRequest(request, init.body, {
      audience: config.platformOrigin, resolveKey: id => id === 'orgmaster-fixture' ? ownerKey : null,
      consumeNonce: async () => true, nowMs: Number(init.headers['x-jenfu-local-timestamp']),
    })
    assert.equal(clientId, 'orgmaster-fixture')
    const event = JSON.parse(init.body)
    events.push(event)
    const body = JSON.stringify({ applied: true, eventId: event.eventId, authEpoch: events.length,
      correlationId: '40000000-0000-4000-8000-000000000099' })
    return new Response(body, { status: 200, headers: {
      'content-type': 'application/json',
      'x-jenfu-local-response-signature': signLocalResponse({ rawBody: body,
        nonce: init.headers['x-jenfu-local-nonce'], audience: config.platformOrigin,
        clientId: 'orgmaster-fixture' }, ownerKey),
    } })
  }
}

test('synthetic lifecycle transitions are deterministic, versioned and leave manifest baseline untouched', () => {
  const baselineHash = fixture.fixtureHash
  const disabled = transitionLocalPrincipalLifecycle({
    principalStatus: scenario.principalStatus, employeeStatus: scenario.employeeStatus,
    accountLifecycleVersion: scenario.accountLifecycleVersion, profileVersion: scenario.profileVersion,
    grants: scenario.grants,
  }, 'disable', 1)
  assert.equal(disabled.principalStatus, 'disabled')
  assert.equal(disabled.employeeStatus, 'inactive')
  assert.equal(disabled.accountLifecycleVersion, 2)
  const grantChange = transitionLocalPrincipalLifecycle({
    principalStatus: 'active', employeeStatus: 'active', accountLifecycleVersion: 1,
    profileVersion: 1, grants: scenario.grants,
  }, 'grants_changed', 1)
  assert.equal(grantChange.grants[0].status, 'revoked')
  assert.equal(grantChange.grants[0].grantVersion, 2)
  const profileChange = transitionLocalPrincipalLifecycle({
    principalStatus: 'active', employeeStatus: 'active', accountLifecycleVersion: 1,
    profileVersion: 1, grants: scenario.grants,
  }, 'profile_changed', 1)
  assert.equal(profileChange.profileVersion, 2)
  assert.equal(profileChange.accountLifecycleVersion, 2)
  assert.equal(fixture.fixtureHash, baselineHash)
  assert.equal(scenario.accountLifecycleVersion, 1)
  assert.throws(() => transitionLocalPrincipalLifecycle({ ...disabled, grants: scenario.grants }, 'disable', 2),
    error => error.code === 'local_lifecycle_conflict')
})

test('owner writes one manifest-bound event, retries identical event IDs without duplicating state, and rejects changed bodies', async () => {
  const pool = new FakePool(), sent = []
  const producer = createLocalPrincipalLifecycleProducer({ pool, config, profile, ownerKey,
    fetchImpl: successFetch(sent), now: () => 1_798_704_000_000,
    makeNonce: () => 'A'.repeat(32) })
  const input = { eventId: '40000000-0000-4000-8000-000000000002', principalId,
    expectedLifecycleVersion: 1, operation: 'disable' }
  const first = await producer.publish(input)
  const replay = await producer.publish(input)
  assert.equal(first.event.eventVersion, LOCAL_PRINCIPAL_LIFECYCLE_VERSION)
  assert.equal(first.event.fixtureHash, fixture.fixtureHash)
  assert.equal(first.event.expectedLifecycleVersion, 1)
  assert.equal(first.event.lifecycleVersion, 2)
  assert.equal(first.stateSnapshot.principalStatus, 'disabled')
  assert.equal(first.receipt.authEpoch, 1)
  assert.deepEqual(replay.event, first.event)
  assert.equal(pool.events.length, 1)
  assert.equal(sent.length, 2)
  await assert.rejects(producer.publish({ ...input, operation: 'revoke' }), error => error.code === 'local_lifecycle_event_conflict')
  await assert.rejects(producer.publish({ ...input, eventId: '40000000-0000-4000-8000-000000000003',
    expectedLifecycleVersion: 1, operation: 'revoke' }), error => error.code === 'local_lifecycle_conflict')
  const secondInput = { eventId: '40000000-0000-4000-8000-000000000009', principalId,
    expectedLifecycleVersion: 2, operation: 'profile_changed' }
  const second = await producer.publish(secondInput)
  const oldReplay = await producer.publish(input)
  assert.equal(second.event.lifecycleVersion, 3)
  assert.equal(second.stateSnapshot.profileVersion, 2)
  assert.deepEqual(oldReplay.event, first.event)
  assert.equal(pool.events.length, 2)
  assert.equal(sent.length, 4)
  assert.equal(pool.calls.every(call => !/\b(?:platform|ai_pdm)_core\./iu.test(call.sql)), true)
})

test('owner accepts only current manifest principals and an independent local owner key', async () => {
  const pool = new FakePool()
  assert.throws(() => createLocalPrincipalLifecycleProducer({ pool, config, profile,
    ownerKey: appKey }), error => error.code === 'local_owner_key_or_runtime_invalid')
  const producer = createLocalPrincipalLifecycleProducer({ pool, config, profile, ownerKey,
    fetchImpl: successFetch([]), now: () => 1_798_704_000_000, makeNonce: () => 'B'.repeat(32) })
  await assert.rejects(producer.publish({ eventId: '40000000-0000-4000-8000-000000000004',
    principalId: 'local-not-in-manifest', expectedLifecycleVersion: 1, operation: 'disable' }),
  error => error.code === 'local_lifecycle_principal_not_managed')
  assert.equal(pool.events.length, 0)
})

test('database target uses the configured loopback port and exact sandbox-generation marker', async () => {
  const alternate = { ...config, databaseUrl: config.databaseUrl.replace(':53761/', ':15439/') }
  const pool = new FakePool(alternate), sent = []
  const producer = createLocalPrincipalLifecycleProducer({ pool, config: alternate, profile, ownerKey,
    fetchImpl: successFetch(sent), now: () => 1_798_704_000_000, makeNonce: () => 'E'.repeat(32) })
  const result = await producer.publish({ eventId: '40000000-0000-4000-8000-000000000007', principalId,
    expectedLifecycleVersion: 1, operation: 'profile_changed' })
  assert.equal(result.event.lifecycleVersion, 2)
  const wrongMarkerPool = new FakePool(alternate, 'jenfu.local-principal-bootstrap.v1:another-sandbox:40000000-0000-4000-8000-000000000001')
  const wrongMarkerProducer = createLocalPrincipalLifecycleProducer({ pool: wrongMarkerPool, config: alternate, profile,
    ownerKey, fetchImpl: successFetch([]), now: () => 1_798_704_000_000, makeNonce: () => 'F'.repeat(32) })
  await assert.rejects(wrongMarkerProducer.publish({ eventId: '40000000-0000-4000-8000-000000000008',
    principalId, expectedLifecycleVersion: 1, operation: 'profile_changed' }),
  error => error.code === 'local_owner_target_invalid')
  assert.equal(wrongMarkerPool.events.length, 0)
})

test('read-only lifecycle reader queries only the versioned OrgMaster contract', async () => {
  const pool = new FakePool(), sent = []
  const producer = createLocalPrincipalLifecycleProducer({ pool, config, profile, ownerKey,
    fetchImpl: successFetch(sent), now: () => 1_798_704_000_000, makeNonce: () => 'C'.repeat(32) })
  await producer.publish({ eventId: '40000000-0000-4000-8000-000000000005', principalId,
    expectedLifecycleVersion: 1, operation: 'profile_changed' })
  const before = pool.events.length
  const events = await readLocalPrincipalLifecycleEvents(pool, { sandboxId, generation, principalId })
  assert.equal(events.length, 1)
  assert.equal(events[0].event.lifecycleVersion, 2)
  assert.equal(events[0].stateSnapshot.profileVersion, 2)
  assert.equal(pool.events.length, before)
  assert.ok(pool.calls.some(call => call.sql.includes('orgmaster_contract.v_local_principal_lifecycle_events_v1')))
})

test('current owner lifecycle reader overlays the immutable manifest with the verified latest event chain', async () => {
  const pool = new FakePool(), producer = createLocalPrincipalLifecycleProducer({ pool, config, profile, ownerKey,
    fetchImpl: successFetch([]), now: () => 1_798_704_000_000, makeNonce: () => 'G'.repeat(32) })
  await producer.publish({ eventId: '40000000-0000-4000-8000-000000000010', principalId,
    expectedLifecycleVersion: 1, operation: 'profile_changed' })
  const current = await readCurrentLocalPrincipalLifecycleState(pool,
    { sandboxId, generation, principalId }, scenario, profile)
  assert.equal(current.state.accountLifecycleVersion, 2)
  assert.equal(current.state.profileVersion, 2)
  assert.equal(current.stateHash, contractDigest(current.state))
  assert.equal(current.lastEventId, '40000000-0000-4000-8000-000000000010')
  assert.equal(scenario.accountLifecycleVersion, 1)
  assert.equal(profile.fixture.scenarios[0].profileVersion, 1)
})

test('local owner transport signs the exact lifecycle body and fails closed outside loopback or on key reuse', async () => {
  const event = { eventVersion: LOCAL_PRINCIPAL_LIFECYCLE_VERSION,
    eventId: '40000000-0000-4000-8000-000000000006', sandboxId,
    generation, fixtureVersion: fixture.fixtureVersion, fixtureHash: fixture.fixtureHash,
    principalId, expectedLifecycleVersion: 1, lifecycleVersion: 2, operation: 'revoke',
    snapshotHash: 'c'.repeat(64) }
  const response = await sendLocalPrincipalLifecycleEvent({ config, ownerKey, applicationKey: appKey, event,
    fetchImpl: successFetch([]), now: () => 1_798_704_000_000, makeNonce: () => 'D'.repeat(32) })
  assert.equal(response.applied, true)
  await assert.rejects(sendLocalPrincipalLifecycleEvent({ config: { ...config,
    platformOrigin: 'https://example.com' }, ownerKey, applicationKey: appKey, event,
    fetchImpl: successFetch([]), now: () => 1_798_704_000_000 }), error => error.code === 'local_owner_target_invalid')
  await assert.rejects(sendLocalPrincipalLifecycleEvent({ config, ownerKey, applicationKey: ownerKey, event,
    fetchImpl: successFetch([]), now: () => 1_798_704_000_000 }), error => error.code === 'local_owner_key_or_event_invalid')
  assert.equal(LOCAL_PRINCIPAL_LIFECYCLE_PATH, '/api/local-sandbox/lifecycle')
})
