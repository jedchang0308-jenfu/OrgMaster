import { randomBytes, randomUUID } from 'node:crypto'
import {
  assertFixtureEnvelope,
  contractDigest,
  isLoopbackHost,
  requireLoopbackOrigin,
  signLocalRequest,
  verifyLocalResponse,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'

export const LOCAL_PRINCIPAL_LIFECYCLE_VERSION = 'orgmaster.local-principal-lifecycle.v1'
export const LOCAL_PRINCIPAL_LIFECYCLE_PATH = '/api/local-sandbox/lifecycle'
const CLIENT_ID = 'orgmaster-fixture'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const HASH = /^[a-f0-9]{64}$/u
const PRINCIPAL_ID = /^local-[a-z0-9-]{1,100}$/u
const OPERATIONS = new Set(['disable', 'revoke', 'grants_changed', 'profile_changed'])
const EVENT_COLUMNS = [
  'contract_version', 'event_id', 'sandbox_id', 'generation', 'fixture_version', 'fixture_hash',
  'principal_id', 'expected_lifecycle_version', 'lifecycle_version', 'operation', 'snapshot_hash',
  'event_hash', 'state_snapshot', 'occurred_at',
]

function fail(code, status = 409) {
  throw Object.assign(new Error(code), { code, status })
}

function exactObject(value, keys) {
  return Boolean(value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)))
}

function plainObject(value) {
  return Boolean(value && Object.getPrototypeOf(value) === Object.prototype)
}

function validKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{43,128}$/u.test(key) &&
    Buffer.from(key, 'base64url').byteLength >= 32
}

function fixtureSnapshot(scenario) {
  return {
    principalStatus: scenario.principalStatus,
    employeeStatus: scenario.employeeStatus,
    accountLifecycleVersion: scenario.accountLifecycleVersion,
    profileVersion: scenario.profileVersion,
    grants: structuredClone(scenario.grants),
  }
}

export function transitionLocalPrincipalLifecycle(snapshot, operation, expectedLifecycleVersion) {
  if (!exactObject(snapshot, ['principalStatus', 'employeeStatus', 'accountLifecycleVersion', 'profileVersion', 'grants']) ||
    !Number.isSafeInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 1 ||
    snapshot.accountLifecycleVersion !== expectedLifecycleVersion || !Array.isArray(snapshot.grants) ||
    !OPERATIONS.has(operation)) fail('local_lifecycle_conflict')
  const next = structuredClone(snapshot)
  next.accountLifecycleVersion = expectedLifecycleVersion + 1
  if (operation === 'disable') {
    if (snapshot.principalStatus !== 'active' || snapshot.employeeStatus !== 'active') fail('local_lifecycle_conflict')
    next.principalStatus = 'disabled'
    next.employeeStatus = 'inactive'
  } else if (operation === 'revoke') {
    if (snapshot.principalStatus === 'revoked') fail('local_lifecycle_conflict')
    next.principalStatus = 'revoked'
    next.employeeStatus = 'inactive'
  } else if (operation === 'grants_changed') {
    const active = snapshot.grants.filter(grant => grant.status === 'active')
    if (!active.length || active.some(grant => !Number.isSafeInteger(grant.grantVersion) || grant.grantVersion >= Number.MAX_SAFE_INTEGER)) {
      fail('local_lifecycle_conflict')
    }
    next.grants = snapshot.grants.map(grant => grant.status === 'active'
      ? { ...grant, status: 'revoked', grantVersion: grant.grantVersion + 1 }
      : grant)
  } else {
    if (!Number.isSafeInteger(snapshot.profileVersion) || snapshot.profileVersion >= Number.MAX_SAFE_INTEGER) fail('local_lifecycle_conflict')
    next.profileVersion = snapshot.profileVersion + 1
  }
  return next
}

export function localPrincipalLifecycleLockKey({ sandboxId, generation, principalId }) {
  if (typeof sandboxId !== 'string' || !UUID.test(generation ?? '') || !PRINCIPAL_ID.test(principalId ?? '')) {
    fail('local_lifecycle_binding_invalid')
  }
  return `principal:${sandboxId}:${generation}:${principalId}`
}

function eventFromRow(row) {
  if (!exactObject(row, EVENT_COLUMNS)) fail('local_owner_contract_mismatch', 503)
  const event = {
    eventVersion: row.contract_version,
    eventId: row.event_id,
    sandboxId: row.sandbox_id,
    generation: row.generation,
    fixtureVersion: row.fixture_version,
    fixtureHash: String(row.fixture_hash).trim(),
    principalId: row.principal_id,
    expectedLifecycleVersion: Number(row.expected_lifecycle_version),
    lifecycleVersion: Number(row.lifecycle_version),
    operation: row.operation,
    snapshotHash: String(row.snapshot_hash).trim(),
  }
  if (event.eventVersion !== LOCAL_PRINCIPAL_LIFECYCLE_VERSION || !UUID.test(event.eventId) ||
    !UUID.test(event.generation) || !HASH.test(event.fixtureHash) || !HASH.test(event.snapshotHash) ||
    !PRINCIPAL_ID.test(event.principalId) || typeof event.sandboxId !== 'string' ||
    typeof event.fixtureVersion !== 'string' || !event.fixtureVersion ||
    !Number.isSafeInteger(event.expectedLifecycleVersion) || event.expectedLifecycleVersion < 1 ||
    event.lifecycleVersion !== event.expectedLifecycleVersion + 1 || !OPERATIONS.has(event.operation) ||
    !row.state_snapshot || Object.getPrototypeOf(row.state_snapshot) !== Object.prototype ||
    !HASH.test(String(row.event_hash).trim()) || event.snapshotHash !== contractDigest(row.state_snapshot) ||
    String(row.event_hash).trim() !== contractDigest({ event, stateSnapshot: row.state_snapshot })) {
    fail('local_owner_contract_mismatch', 503)
  }
  return { event, stateSnapshot: row.state_snapshot, eventHash: String(row.event_hash).trim() }
}

function rowMatchesScenario(row, scenario, config, profile) {
  return row.contract_version === 'orgmaster.local-principal-publication.v1' &&
    row.principal_issuer === scenario.identityIssuer && row.principal_subject === scenario.identitySubject &&
    row.principal_id === scenario.principalId && row.employee_id === scenario.employeeId &&
    row.account_type === scenario.accountType && row.employee_status === 'active' &&
    Number.isSafeInteger(Number(row.mapping_version)) && Number(row.mapping_version) >= 1 &&
    config.sandboxId === profile.sandboxId
}

async function assertLocalTarget(client, config, profile) {
  let rows
  try {
    rows = (await client.query(`SELECT current_database() AS database_name,
      host(inet_server_addr()) AS server_address, inet_server_port() AS server_port,
      session_user, current_user,
      (SELECT pg_catalog.shobj_description(oid, 'pg_database')
         FROM pg_catalog.pg_database WHERE datname = current_database()) AS database_comment`)).rows
  } catch { fail('local_owner_unavailable', 503) }
  const expectedDatabase = `jenfu_local_${profile.sandboxId.replaceAll('-', '_')}`
  let databaseUrl
  let expectedPort
  try {
    databaseUrl = new URL(config.databaseUrl)
    requireLoopbackOrigin(config.platformOrigin)
    expectedPort = databaseUrl.port ? Number(databaseUrl.port) : 5432
  } catch { fail('local_owner_target_invalid', 503) }
  const marker = `jenfu.local-principal-bootstrap.v1:${profile.sandboxId}:${profile.generation}`
  if (config.applicationId !== 'orgmaster' || config.sandboxId !== profile.sandboxId ||
    config.databaseName !== expectedDatabase || !isLoopbackHost(config.bindHost) ||
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !isLoopbackHost(databaseUrl.hostname) ||
    !/^[a-z][a-z0-9_]{2,62}$/u.test(config.runtimeRole) ||
    decodeURIComponent(databaseUrl.username) !== config.runtimeRole || !databaseUrl.password ||
    !Number.isSafeInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535 ||
    databaseUrl.pathname !== `/${expectedDatabase}` || databaseUrl.search || databaseUrl.hash ||
    rows?.length !== 1 || rows[0].database_name !== expectedDatabase || !isLoopbackHost(rows[0].server_address) ||
    Number(rows[0].server_port) !== expectedPort || rows[0].session_user !== config.runtimeRole ||
    rows[0].current_user !== config.runtimeRole || rows[0].database_comment !== marker) fail('local_owner_target_invalid', 503)
}

async function readPublication(client, scenario, config, profile) {
  let rows
  try {
    rows = (await client.query(`SELECT contract_version, principal_issuer, principal_subject,
      principal_id, employee_id, account_type, employee_status, mapping_version
      FROM orgmaster_contract.v_local_principal_publications_v1
      WHERE principal_id = $1 AND employee_id = $2 AND principal_issuer = $3 AND principal_subject = $4
      FETCH FIRST 2 ROWS ONLY`, [scenario.principalId, scenario.employeeId,
      scenario.identityIssuer, scenario.identitySubject])).rows
  } catch { fail('local_owner_unavailable', 503) }
  if (!Array.isArray(rows) || rows.length !== 1 || !rowMatchesScenario(rows[0], scenario, config, profile)) {
    fail('local_owner_contract_mismatch', 409)
  }
}

async function readRows(queryable, { sandboxId, generation, principalId, eventId } = {}) {
  const predicates = ['sandbox_id = $1', 'generation = $2']
  const values = [sandboxId, generation]
  if (principalId !== undefined) { values.push(principalId); predicates.push(`principal_id = $${values.length}`) }
  if (eventId !== undefined) { values.push(eventId); predicates.push(`event_id = $${values.length}`) }
  let rows
  try {
    rows = (await queryable.query(`SELECT ${EVENT_COLUMNS.join(', ')}
      FROM orgmaster_contract.v_local_principal_lifecycle_events_v1
      WHERE ${predicates.join(' AND ')}
      ORDER BY principal_id, lifecycle_version
      FETCH FIRST 1025 ROWS ONLY`, values)).rows
  } catch { fail('local_owner_unavailable', 503) }
  if (!Array.isArray(rows) || rows.length > 1024) fail('local_owner_contract_mismatch', 503)
  return rows.map(eventFromRow)
}

async function readEventId(queryable, sandboxId, eventId) {
  let rows
  try {
    rows = (await queryable.query(`SELECT ${EVENT_COLUMNS.join(', ')}
      FROM orgmaster_contract.v_local_principal_lifecycle_events_v1
      WHERE sandbox_id = $1 AND event_id = $2
      FETCH FIRST 2 ROWS ONLY`, [sandboxId, eventId])).rows
  } catch { fail('local_owner_unavailable', 503) }
  if (!Array.isArray(rows) || rows.length > 1) fail('local_owner_contract_mismatch', 503)
  return rows.map(eventFromRow)
}

export async function readCurrentLocalPrincipalLifecycleState(queryable, binding, scenario, profile) {
  if (!exactObject(binding, ['sandboxId', 'generation', 'principalId']) ||
    typeof binding.sandboxId !== 'string' || !UUID.test(binding.generation) || !PRINCIPAL_ID.test(binding.principalId) ||
    !plainObject(profile) || profile.sandboxId !== binding.sandboxId || profile.generation !== binding.generation ||
    !plainObject(scenario) || scenario.principalId !== binding.principalId ||
    !profile.fixture || !Array.isArray(profile.fixture.scenarios)) {
    fail('local_request_invalid', 400)
  }
  try { assertFixtureEnvelope(profile.fixture) } catch { fail('local_owner_contract_mismatch', 503) }
  const manifestScenario = profile.fixture.scenarios.find(value => value.principalId === binding.principalId)
  if (!manifestScenario || contractDigest(manifestScenario) !== contractDigest(scenario)) fail('local_lifecycle_principal_not_managed', 403)
  const rows = await readRows(queryable, binding)
  const { current, history } = validateHistory(rows, manifestScenario,
    { sandboxId: profile.sandboxId }, profile)
  return { state: current, stateHash: contractDigest(current),
    lastEventId: history.length ? history.at(-1).event.eventId : null }
}

function validateHistory(rows, scenario, config, profile) {
  let current = fixtureSnapshot(scenario)
  const history = []
  for (const item of rows) {
    const { event, stateSnapshot } = item
    if (event.sandboxId !== profile.sandboxId || event.generation !== profile.generation ||
      event.fixtureVersion !== profile.fixture.fixtureVersion || event.fixtureHash !== profile.fixture.fixtureHash ||
      event.principalId !== scenario.principalId || event.expectedLifecycleVersion !== current.accountLifecycleVersion ||
      event.lifecycleVersion !== current.accountLifecycleVersion + 1) fail('local_owner_contract_mismatch', 503)
    const expected = transitionLocalPrincipalLifecycle(current, event.operation, current.accountLifecycleVersion)
    if (contractDigest(expected) !== contractDigest(stateSnapshot)) fail('local_owner_contract_mismatch', 503)
    current = expected
    history.push(item)
  }
  return { current, history }
}

function eventBodyHash(event, stateSnapshot) {
  return contractDigest({ event, stateSnapshot })
}

async function appendEvent(pool, config, profile, input) {
  if (!exactObject(input, ['eventId', 'principalId', 'expectedLifecycleVersion', 'operation']) ||
    !UUID.test(input.eventId) || !PRINCIPAL_ID.test(input.principalId) ||
    !Number.isSafeInteger(input.expectedLifecycleVersion) || input.expectedLifecycleVersion < 1 ||
    !OPERATIONS.has(input.operation)) fail('local_request_invalid', 400)
  const scenario = profile.fixture.scenarios.find(value => value.principalId === input.principalId)
  if (!scenario) fail('local_lifecycle_principal_not_managed', 403)

  const client = await pool.connect()
  let commitAttempted = false
  let candidate
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await assertLocalTarget(client, config, profile)
    const lockKeys = [
      `event:${input.eventId}`,
      localPrincipalLifecycleLockKey({ sandboxId: profile.sandboxId, generation: profile.generation,
        principalId: scenario.principalId }),
    ].sort()
    for (const lockKey of lockKeys) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey])
    await readPublication(client, scenario, config, profile)
    const allMatches = await readEventId(client, profile.sandboxId, input.eventId)
    if (allMatches.length > 1) fail('local_owner_contract_mismatch', 503)
    if (allMatches.length === 1) {
      const existing = allMatches[0]
      const existingHistory = await readRows(client, { sandboxId: profile.sandboxId,
        generation: profile.generation, principalId: scenario.principalId })
      const { history } = validateHistory(existingHistory, scenario, config, profile)
      if (existing.event.sandboxId !== profile.sandboxId || existing.event.generation !== profile.generation ||
        existing.event.fixtureVersion !== profile.fixture.fixtureVersion || existing.event.fixtureHash !== profile.fixture.fixtureHash ||
        !history.some(item => item.event.eventId === input.eventId && item.eventHash === existing.eventHash) ||
        existing.event.principalId !== input.principalId ||
        existing.event.expectedLifecycleVersion !== input.expectedLifecycleVersion ||
        existing.event.operation !== input.operation) fail('local_lifecycle_event_conflict')
      candidate = existing
      await client.query('COMMIT')
      commitAttempted = true
      return candidate
    }

    const rows = await readRows(client, { sandboxId: profile.sandboxId,
      generation: profile.generation, principalId: scenario.principalId })
    const { current, history } = validateHistory(rows, scenario, config, profile)
    if (history.some(item => item.event.eventId === input.eventId) ||
      current.accountLifecycleVersion !== input.expectedLifecycleVersion) fail('local_lifecycle_conflict')
    const stateSnapshot = transitionLocalPrincipalLifecycle(current, input.operation, current.accountLifecycleVersion)
    const event = {
      eventVersion: LOCAL_PRINCIPAL_LIFECYCLE_VERSION,
      eventId: input.eventId,
      sandboxId: profile.sandboxId,
      generation: profile.generation,
      fixtureVersion: profile.fixture.fixtureVersion,
      fixtureHash: profile.fixture.fixtureHash,
      principalId: scenario.principalId,
      expectedLifecycleVersion: current.accountLifecycleVersion,
      lifecycleVersion: stateSnapshot.accountLifecycleVersion,
      operation: input.operation,
      snapshotHash: contractDigest(stateSnapshot),
    }
    const eventHash = eventBodyHash(event, stateSnapshot)
    const inserted = await client.query(`INSERT INTO orgmaster_core.local_principal_lifecycle_events
      (event_id, contract_version, sandbox_id, generation, fixture_version, fixture_hash,
       principal_id, expected_lifecycle_version, lifecycle_version, operation, snapshot_hash,
       event_hash, state_snapshot)
      VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING ${EVENT_COLUMNS.join(', ')}`,
    [event.eventId, event.eventVersion, event.sandboxId, event.generation, event.fixtureVersion,
      event.fixtureHash, event.principalId, event.expectedLifecycleVersion, event.lifecycleVersion,
      event.operation, event.snapshotHash, eventHash, JSON.stringify(stateSnapshot)])
    if (inserted.rows?.length !== 1) fail('local_owner_contract_mismatch', 503)
    candidate = eventFromRow(inserted.rows[0])
    if (candidate.eventHash !== eventHash || contractDigest(candidate.stateSnapshot) !== contractDigest(stateSnapshot)) {
      fail('local_owner_contract_mismatch', 503)
    }
    commitAttempted = true
    await client.query('COMMIT')
    return candidate
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (commitAttempted && candidate) {
      try {
        const rows = await readEventId(pool, profile.sandboxId, input.eventId)
        if (rows.length === 1 && rows[0].eventHash === candidate.eventHash) return rows[0]
      } catch { /* Preserve the ambiguous commit result below. */ }
      fail('local_lifecycle_commit_unknown_readback_required', 503)
    }
    throw error
  } finally {
    client.release()
  }
}

async function readBoundedResponse(response, limit = 16 * 1024) {
  if (!response.body) fail('local_lifecycle_response_invalid', 503)
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > limit)) fail('local_lifecycle_response_invalid', 503)
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) { await reader.cancel().catch(() => undefined); fail('local_lifecycle_response_invalid', 503) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } finally { reader.releaseLock() }
}

export async function sendLocalPrincipalLifecycleEvent({ config, ownerKey, applicationKey, event,
  fetchImpl = globalThis.fetch, now = Date.now, makeNonce = () => randomBytes(24).toString('base64url'), timeoutMs = 5000 }) {
  let audience
  try { audience = requireLoopbackOrigin(config.platformOrigin) } catch { fail('local_owner_target_invalid', 503) }
  if (!validKey(ownerKey) || ownerKey === applicationKey || !exactObject(event, [
    'eventVersion', 'eventId', 'sandboxId', 'generation', 'fixtureVersion', 'fixtureHash',
    'principalId', 'expectedLifecycleVersion', 'lifecycleVersion', 'operation', 'snapshotHash',
  ]) || event.eventVersion !== LOCAL_PRINCIPAL_LIFECYCLE_VERSION || event.sandboxId !== config.sandboxId ||
    !UUID.test(event.eventId) || !UUID.test(event.generation) || !HASH.test(event.fixtureHash) ||
    !HASH.test(event.snapshotHash) || !PRINCIPAL_ID.test(event.principalId) ||
    !Number.isSafeInteger(event.expectedLifecycleVersion) || event.expectedLifecycleVersion < 1 ||
    event.lifecycleVersion !== event.expectedLifecycleVersion + 1 || !OPERATIONS.has(event.operation) ||
    typeof fetchImpl !== 'function' || !Number.isSafeInteger(now()) ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) fail('local_owner_key_or_event_invalid', 503)
  const url = new URL(LOCAL_PRINCIPAL_LIFECYCLE_PATH, audience)
  const rawBody = JSON.stringify(event)
  if (Buffer.byteLength(rawBody, 'utf8') > 8 * 1024) fail('local_request_too_large', 413)
  const timestamp = now(), nonce = makeNonce()
  const signature = signLocalRequest({ method: 'POST', path: url.pathname, audience, clientId: CLIENT_ID,
    timestamp, nonce, rawBody }, ownerKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(url.href, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-jenfu-local-client': CLIENT_ID,
        'x-jenfu-local-timestamp': String(timestamp), 'x-jenfu-local-nonce': nonce,
        authorization: `JenfuLocal ${signature}` }, body: rawBody })
  } catch { fail('local_lifecycle_transport_unknown', 503) }
  finally { clearTimeout(timeout) }
  let rawResponse
  try { rawResponse = await readBoundedResponse(response) } catch { fail('local_lifecycle_response_invalid', 503) }
  if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    fail('local_lifecycle_response_invalid', 503)
  }
  verifyLocalResponse({ rawBody: rawResponse, nonce, audience, clientId: CLIENT_ID }, ownerKey,
    response.headers.get('x-jenfu-local-response-signature'))
  let body
  try { body = JSON.parse(rawResponse) } catch { fail('local_lifecycle_response_invalid', 503) }
  if (response.status !== 200) {
    if (!exactObject(body, ['code', 'correlationId']) || typeof body.code !== 'string') fail('local_lifecycle_response_invalid', 503)
    throw Object.assign(new Error(body.code), { code: body.code, status: response.status, eventId: event.eventId })
  }
  if (!exactObject(body, ['applied', 'eventId', 'authEpoch', 'correlationId']) || body.applied !== true ||
    body.eventId !== event.eventId || !Number.isSafeInteger(body.authEpoch) || body.authEpoch < 0 ||
    typeof body.correlationId !== 'string' || !UUID.test(body.correlationId)) fail('local_lifecycle_response_invalid', 503)
  return { applied: true, eventId: event.eventId, authEpoch: body.authEpoch }
}

/** Read only the OrgMaster versioned contract; this function never writes. */
export async function readLocalPrincipalLifecycleEvents(queryable, binding) {
  if (!exactObject(binding, ['sandboxId', 'generation', 'principalId']) ||
    typeof binding.sandboxId !== 'string' || !UUID.test(binding.generation) || !PRINCIPAL_ID.test(binding.principalId)) {
    fail('local_request_invalid', 400)
  }
  const rows = await readRows(queryable, binding)
  return rows
}

/** Append owner state first, then deliver the same immutable event over the
 * independent local fixture key. A failed/unknown delivery is retried with the
 * same eventId; appendEvent returns the original event without changing state.
 * stateSnapshot is the synthetic owner's new versioned lifecycle publication,
 * not the original native governance policy or live employment record. Platform
 * consumers must apply it as the current scenario and deny both current and new
 * logins after a disabling/revoking transition; preserved native policy cannot
 * bypass the central epoch/session invalidation.
 */
export function createLocalPrincipalLifecycleProducer({ pool, config, profile, ownerKey,
  fetchImpl = globalThis.fetch, now = Date.now, makeNonce } = {}) {
  if (!pool || typeof pool.connect !== 'function' || !profile?.fixture?.scenarios ||
    !validKey(ownerKey) || ownerKey === profile.key || !UUID.test(profile.generation ?? '') ||
    !/^[a-z][a-z0-9-]{2,63}$/u.test(profile.sandboxId ?? '') ||
    !config || config.applicationId !== 'orgmaster' || config.sandboxId !== profile.sandboxId) {
    fail('local_owner_key_or_runtime_invalid', 503)
  }
  try { assertFixtureEnvelope(profile.fixture) } catch { fail('local_owner_key_or_runtime_invalid', 503) }
  return Object.freeze({
    async publish(input) {
      const saved = await appendEvent(pool, config, profile, input)
      const receipt = await sendLocalPrincipalLifecycleEvent({ config, ownerKey, applicationKey: profile.key,
        event: saved.event, fetchImpl, now, ...(makeNonce ? { makeNonce } : {}) })
      return { event: saved.event, stateSnapshot: saved.stateSnapshot, receipt }
    },
    async readEvents(binding) {
      return readLocalPrincipalLifecycleEvents(pool, binding)
    },
  })
}

export function newLocalPrincipalLifecycleEventId() { return randomUUID() }
