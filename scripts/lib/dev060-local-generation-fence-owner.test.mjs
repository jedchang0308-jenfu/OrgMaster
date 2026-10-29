import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOrgmasterLocalGenerationFenceOwner } from './dev060-local-generation-fence-owner.mjs'

const sandboxId = 'orgmaster-reset-test'
const resetId = '60000000-0000-4000-8000-000000000001'
const sourceGeneration = '60000000-0000-4000-8000-000000000002'
const generation = '60000000-0000-4000-8000-000000000003'
const unrelatedGeneration = '60000000-0000-4000-8000-000000000004'
const sessionId = '60000000-0000-4000-8000-000000000010'
const fixedTime = '2026-10-30T00:00:00.000Z'
const ownerRole = 'jenfu_orgmaster_migrator'
const runtimeRoles = ['jenfu_platform_runtime', 'jenfu_orgmaster_runtime', 'jenfu_ai_pdm_runtime', 'fms_runtime']
const scope = Object.freeze({ sandboxId, resetId, sourceGeneration, generation })
const target = Object.freeze({
  contractVersion: 'orgmaster.local-generation-fence-target.v1',
  applicationId: 'orgmaster', sandboxId, databaseName: 'jenfu_local_orgmaster_reset_test',
  dataDirectory: '/var/lib/postgresql/data/orgmaster-reset-test', port: 55432,
  operatorRole: 'local_org_seed_0123456789abcdef', databaseOwnerRole: 'local_org_seed_0123456789abcdef',
  runtimeRoles,
})

function rowCounts(sessions, sandboxValue, sourceGenerationValue, generationValue) {
  const boundIds = new Set([
    ...sessions.bindings.map(binding => binding.sessionId),
    ...sessions.lifecycleBindings.map(binding => binding.sessionId),
  ])
  const active = [...sessions.nativeSessions.values()].filter(session => boundIds.has(session.id) &&
    session.appId === 'orgmaster' && session.generation && session.revokedAt === null && session.expiresAt > fixedTime)
  const prior = active.filter(session => session.generation !== generationValue)
  return {
    conflictCount: 0,
    unrevokedSourceBindingCount: sessions.bindings.filter(binding => binding.sandboxId === sandboxValue &&
      binding.generation === sourceGenerationValue && binding.status !== 'revoked').length,
    activePriorSessionCount: prior.length,
    activeSourceSessionCount: active.filter(session => session.generation === sourceGeneration).length,
    activeTargetSessionCount: active.filter(session => session.generation === generationValue).length,
    activePriorGenerations: [...new Set(prior.map(session => session.generation))],
  }
}

class FakeOrgmasterOwnerClient {
  constructor({ target: targetValue = target, operatorIsSuperuser = false, migratorMembership = true,
    monitorMembership = true, dataDirectoryReadable = true, markerGeneration = sourceGeneration, appConnections = 0,
    unknownActiveGeneration = false } = {}) {
    this.target = targetValue
    this.operatorIsSuperuser = operatorIsSuperuser
    this.migratorMembership = migratorMembership
    this.monitorMembership = monitorMembership
    this.dataDirectoryReadable = dataDirectoryReadable
    this.markerGeneration = markerGeneration
    this.appConnections = appConnections
    this.calls = []
    this.currentRole = this.target.operatorRole
    this.transactions = []
    this.sessions = {
      nativeSessions: new Map([
        [sessionId, { id: sessionId, appId: 'orgmaster', generation: sourceGeneration,
          revokedAt: null, revokeReason: null, principalAuthEpoch: 7, expiresAt: '2027-01-01T00:00:00.000Z' }],
        ['60000000-0000-4000-8000-000000000011', { id: '60000000-0000-4000-8000-000000000011',
          appId: 'orgmaster', generation: unrelatedGeneration, revokedAt: fixedTime, revokeReason: 'prior_reset',
          expiresAt: '2027-01-01T00:00:00.000Z' }],
        ['60000000-0000-4000-8000-000000000012', { id: '60000000-0000-4000-8000-000000000012',
          appId: 'orgmaster', generation: sourceGeneration, revokedAt: null, revokeReason: null,
          expiresAt: '2025-01-01T00:00:00.000Z' }],
        ['60000000-0000-4000-8000-000000000013', { id: '60000000-0000-4000-8000-000000000013',
          appId: 'orgmaster', generation: null, revokedAt: null, revokeReason: null,
          expiresAt: '2027-01-01T00:00:00.000Z' }],
      ]),
      bindings: [
        { sessionId, sandboxId, generation: sourceGeneration, status: 'active' },
        { sessionId: '60000000-0000-4000-8000-000000000012', sandboxId, generation: sourceGeneration, status: 'pending' },
        { sessionId: '60000000-0000-4000-8000-000000000011', sandboxId, generation: unrelatedGeneration, status: 'revoked' },
      ],
      lifecycleBindings: [{ sessionId, sandboxId, generation: sourceGeneration }],
      events: [{ eventId: '60000000-0000-4000-8000-000000000020', generation: sourceGeneration, hash: 'a'.repeat(64) }],
    }
    if (unknownActiveGeneration) {
      const id = '60000000-0000-4000-8000-000000000014'
      this.sessions.nativeSessions.set(id, { id, appId: 'orgmaster', generation: unrelatedGeneration,
        revokedAt: null, revokeReason: null, expiresAt: '2027-01-01T00:00:00.000Z' })
      this.sessions.bindings.push({ sessionId: id, sandboxId, generation: unrelatedGeneration, status: 'active' })
    }
    this.profileFileBytes = '{"generation":"source-generation-profile"}'
    this.governanceArtifact = { publishedVersions: ['immutable-policy-version'] }
    this.businessRows = [{ id: 'work-1', value: 'preserve-me' }]
  }

  async query(sql, values = []) {
    const flat = sql.replace(/\s+/gu, ' ').trim()
    this.calls.push({ sql: flat, values: structuredClone(values), currentRole: this.currentRole })
    if (flat === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || flat === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') {
      this.transactions.push({ markerGeneration: this.markerGeneration, currentRole: this.currentRole,
        sessions: structuredClone(this.sessions) })
      return { rows: [], rowCount: null }
    }
    if (flat === 'ROLLBACK') {
      const previous = this.transactions.pop()
      if (previous) {
        this.markerGeneration = previous.markerGeneration
        this.currentRole = previous.currentRole
        this.sessions = previous.sessions
      }
      return { rows: [], rowCount: null }
    }
    if (flat === 'COMMIT') { this.transactions.pop(); this.currentRole = this.target.operatorRole; return { rows: [], rowCount: null } }
    if (flat.startsWith('SET LOCAL lock_timeout') || flat.startsWith('SET LOCAL statement_timeout') ||
      flat === `SET LOCAL ROLE ${ownerRole}`) {
      if (flat === `SET LOCAL ROLE ${ownerRole}`) this.currentRole = ownerRole
      return { rows: [], rowCount: null }
    }
    if (flat === 'RESET ROLE') {
      this.currentRole = this.target.operatorRole
      return { rows: [], rowCount: null }
    }
    if (flat.includes('pg_advisory_xact_lock')) return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 }
    if (flat.includes("current_setting('data_directory')") &&
      (this.currentRole !== this.target.operatorRole || !this.dataDirectoryReadable)) {
      throw Object.assign(new Error('permission denied to read parameter "data_directory"'), { code: '42501' })
    }
    if (flat.includes('current_database() AS database_name')) return { rows: [{
      database_name: this.target.databaseName, server_address: '127.0.0.1', server_port: this.target.port,
      data_directory: this.target.dataDirectory, session_user: this.target.operatorRole, current_user: this.currentRole,
      database_comment: `jenfu.local-principal-bootstrap.v1:${sandboxId}:${this.markerGeneration}`,
      database_owner: this.target.databaseOwnerRole, operator_is_superuser: this.operatorIsSuperuser,
      operator_can_set_migrator: this.operatorIsSuperuser || this.migratorMembership,
      operator_can_read_activity: this.operatorIsSuperuser || this.monitorMembership,
    }], rowCount: 1 }
    if (flat.startsWith('SELECT rolname::text AS role_name')) return { rows: [...runtimeRoles, ownerRole].map(role_name => ({
      role_name, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false,
    })), rowCount: runtimeRoles.length + 1 }
    if (flat.startsWith('SELECT to_regclass(')) return { rows: [{ app_sessions: true, native_bindings: true,
      lifecycle_events: true, lifecycle_contract: true, lifecycle_bindings: true, lifecycle_state: true }], rowCount: 1 }
    if (flat.startsWith('SELECT table_name,column_name,data_type')) {
      const valuesByTable = {
        app_sessions: { id: 'uuid', app_id: 'text', revoked_at: 'timestamp with time zone', revoke_reason: 'text',
          expires_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' },
        local_sandbox_session_bindings: { session_id: 'uuid', sandbox_id: 'text', generation: 'uuid', status: 'text',
          updated_at: 'timestamp with time zone' },
        local_principal_lifecycle_events: { event_id: 'uuid', sandbox_id: 'text', generation: 'uuid' },
        local_principal_lifecycle_session_bindings: { session_id: 'uuid', sandbox_id: 'text', generation: 'uuid' },
      }
      return { rows: Object.entries(valuesByTable).flatMap(([table_name, columns]) =>
        Object.entries(columns).map(([column_name, data_type]) => ({ table_name, column_name, data_type }))), rowCount: 19 }
    }
    if (flat.startsWith('SELECT namespace.nspname AS schema_name')) return { rows: [
      ['orgmaster_core', 'local_sandbox_session_bindings', 'r'],
      ['orgmaster_core', 'local_principal_lifecycle_events', 'r'],
      ['orgmaster_core', 'local_principal_lifecycle_session_bindings', 'r'],
      ['orgmaster_contract', 'v_local_principal_lifecycle_events_v1', 'v'],
      ['orgmaster_contract', 'v_local_principal_lifecycle_state_v1', 'v'],
    ].map(([schema_name, relname, relkind]) => ({ schema_name, relname, relkind, owner: ownerRole })), rowCount: 5 }
    if (flat.includes('FROM pg_catalog.pg_stat_activity')) return { rows: [{ connection_count: this.appConnections }], rowCount: 1 }
    if (flat.startsWith('WITH bindings AS')) {
      const counts = rowCounts(this.sessions, values[0], values[1], values[2])
      return { rows: [{ conflicting_binding_count: counts.conflictCount,
        unrevoked_source_binding_count: counts.unrevokedSourceBindingCount,
        active_prior_session_count: counts.activePriorSessionCount,
        active_source_session_count: counts.activeSourceSessionCount,
        active_target_session_count: counts.activeTargetSessionCount,
        active_prior_generations: counts.activePriorGenerations }], rowCount: 1 }
    }
    if (flat.startsWith('SELECT (SELECT count(*)::int FROM orgmaster_core.local_principal_lifecycle_events')) {
      return { rows: [{ lifecycle_event_count: this.sessions.events.length,
        lifecycle_binding_count: this.sessions.lifecycleBindings.length,
        registration_binding_count: this.sessions.bindings.length }], rowCount: 1 }
    }
    if (flat.startsWith('UPDATE orgmaster_core.local_sandbox_session_bindings')) {
      const updated = []
      for (const binding of this.sessions.bindings) {
        if (binding.sandboxId === values[0] && binding.generation === values[1] && binding.status !== 'revoked') {
          binding.status = 'revoked'
          updated.push({ session_id: binding.sessionId })
        }
      }
      return { rows: updated, rowCount: updated.length }
    }
    if (flat.startsWith('UPDATE orgmaster_core.app_sessions AS session')) {
      const boundIds = new Set([
        ...this.sessions.bindings.filter(binding => binding.sandboxId === values[0] && binding.generation === values[1]).map(binding => binding.sessionId),
        ...this.sessions.lifecycleBindings.filter(binding => binding.sandboxId === values[0] && binding.generation === values[1]).map(binding => binding.sessionId),
      ])
      const updated = []
      for (const session of this.sessions.nativeSessions.values()) {
        if (boundIds.has(session.id) && session.appId === 'orgmaster' && session.revokedAt === null) {
          session.revokedAt = fixedTime
          session.revokeReason ??= 'local_generation_reset'
          updated.push({ id: session.id })
        }
      }
      return { rows: updated, rowCount: updated.length }
    }
    throw new Error(`Unexpected owner SQL in test double: ${flat}`)
  }
}

function platformFence(requested, overrides = {}) {
  return {
    sandboxId: requested.sandboxId, resetId: requested.resetId,
    sourceGeneration: requested.sourceGeneration, generation: requested.generation,
    status: 'resetting', sessionsRevoked: true, registryRetained: true, ...overrides,
  }
}

function owner(client, fence = {}, targetValue = target) {
  return createOrgmasterLocalGenerationFenceOwner({
    client,
    target: targetValue,
    readPlatformFence: async requested => platformFence(requested, fence),
  })
}

test('generation fence serializes OrgMaster rebinding, revokes only source-generation native sessions, and preserves history', async () => {
  const client = new FakeOrgmasterOwnerClient()
  const api = owner(client)
  const before = await api.readiness(scope)
  assert.equal(before.ready, false)
  assert.ok(before.reasons.includes('target_generation_not_rebound'))
  assert.equal(before.activeSourceSessionCount, 1)

  // Platform's beginFence transaction owns the marker change.
  client.markerGeneration = generation
  const result = await api.rebindAndFenceSessions(scope)
  assert.equal(result.status, 'rebound')
  assert.equal(result.revokedSessionCount, 2)
  assert.equal(result.revokedBindingCount, 2)
  assert.equal(result.readiness.ready, true)
  assert.equal(result.readiness.targetGeneration, generation)
  assert.equal(result.readiness.unrevokedSourceBindingCount, 0)
  assert.equal(result.readiness.activePriorSessionCount, 0)
  assert.equal(client.markerGeneration, generation)
  assert.equal(client.sessions.events.length, 1)
  assert.equal(client.sessions.events[0].hash, 'a'.repeat(64))
  assert.equal(client.sessions.lifecycleBindings.length, 1)
  assert.equal(client.sessions.bindings.length, 3)
  assert.equal(client.sessions.nativeSessions.get(sessionId).principalAuthEpoch, 7)
  assert.deepEqual(client.businessRows, [{ id: 'work-1', value: 'preserve-me' }])
  assert.deepEqual(client.governanceArtifact, { publishedVersions: ['immutable-policy-version'] })
  assert.equal(client.profileFileBytes, '{"generation":"source-generation-profile"}')

  const statements = client.calls.map(call => call.sql)
  assert.ok(statements.includes('BEGIN ISOLATION LEVEL SERIALIZABLE'))
  assert.ok(statements.some(sql => sql.includes('pg_advisory_xact_lock')))
  assert.ok(client.calls.some(call => call.sql.includes('pg_stat_activity') &&
    JSON.stringify(call.values) === JSON.stringify([runtimeRoles])))
  const targetFactReads = client.calls.filter(call => call.sql.includes("current_setting('data_directory')"))
  assert.ok(targetFactReads.length >= 3)
  assert.ok(targetFactReads.every(call => call.currentRole === target.operatorRole))
  const appUpdateIndex = statements.findIndex(sql => sql.startsWith('UPDATE orgmaster_core.app_sessions AS session'))
  const resetRoleIndex = statements.indexOf('RESET ROLE')
  const targetReadbackIndex = statements.findIndex((sql, index) => index > appUpdateIndex &&
    sql.includes("current_setting('data_directory')"))
  assert.ok(resetRoleIndex > appUpdateIndex && resetRoleIndex < targetReadbackIndex)
  assert.ok(statements.every(sql => !sql.startsWith('COMMENT ON DATABASE')))
  assert.ok(statements.some(sql => sql.startsWith('UPDATE orgmaster_core.local_sandbox_session_bindings')))
  assert.ok(statements.some(sql => sql.startsWith('UPDATE orgmaster_core.app_sessions')))
  assert.ok(statements.every(sql => !/\b(?:DELETE|TRUNCATE)\b/iu.test(sql)))
  assert.ok(statements.every(sql => !/(?:persistence_artifacts|published_versions|local_principal_lifecycle_events\s+SET|local_principal_lifecycle_session_bindings\s+SET)/iu.test(sql)))
})

test('mock enforces PostgreSQL 42501 for data_directory reads under the migrator role', async () => {
  const client = new FakeOrgmasterOwnerClient()
  client.currentRole = ownerRole
  await assert.rejects(client.query("SELECT pg_catalog.current_setting('data_directory')"), error => error.code === '42501')
})

test('readiness blocks already-inactive native sessions while source registration bindings remain unrevoked', async () => {
  const client = new FakeOrgmasterOwnerClient({ markerGeneration: generation })
  for (const session of client.sessions.nativeSessions.values()) {
    if (session.generation === sourceGeneration) {
      session.revokedAt = fixedTime
      session.revokeReason = 'prior_reset'
    }
  }
  const api = owner(client)
  const before = await api.readiness(scope)
  assert.equal(before.activeSourceSessionCount, 0)
  assert.equal(before.unrevokedSourceBindingCount, 2)
  assert.equal(before.ready, false)
  assert.ok(before.reasons.includes('unrevoked_source_bindings'))

  const result = await api.rebindAndFenceSessions(scope)
  assert.equal(result.status, 'rebound')
  assert.equal(result.revokedSessionCount, 0)
  assert.equal(result.revokedBindingCount, 2)
  assert.equal(result.readiness.ready, true)
  assert.equal(result.readiness.unrevokedSourceBindingCount, 0)
  assert.ok(client.sessions.bindings.filter(binding => binding.generation === sourceGeneration)
    .every(binding => binding.status === 'revoked'))
  assert.equal(client.sessions.lifecycleBindings.length, 1)
})

test('supports the verified local postgres superuser without extra grants', async () => {
  const postgresTarget = { ...target, operatorRole: 'postgres', databaseOwnerRole: 'postgres' }
  const client = new FakeOrgmasterOwnerClient({ target: postgresTarget, operatorIsSuperuser: true,
    migratorMembership: false, monitorMembership: false, markerGeneration: generation })
  const result = await owner(client, {}, postgresTarget).rebindAndFenceSessions(scope)

  assert.equal(result.readiness.ready, true)
  assert.equal(client.currentRole, 'postgres')
  assert.ok(client.calls.some(call => call.sql.includes('(operator_role.rolsuper OR pg_catalog.pg_has_role(session_user')))
  assert.ok(client.calls.filter(call => call.sql.includes("current_setting('data_directory')"))
    .every(call => call.currentRole === 'postgres'))
  assert.ok(client.calls.every(call => !/^GRANT\b/iu.test(call.sql)))
})

test('rejects postgres target when the connected role is not actually a superuser', async () => {
  const postgresTarget = { ...target, operatorRole: 'postgres', databaseOwnerRole: 'postgres' }
  const client = new FakeOrgmasterOwnerClient({ target: postgresTarget, operatorIsSuperuser: false,
    migratorMembership: false, monitorMembership: false, dataDirectoryReadable: true, markerGeneration: generation })
  const api = owner(client, {}, postgresTarget)
  await assert.rejects(api.readGenerationFence(scope), error => error.code === 'LOCAL_GENERATION_FENCE_TARGET_IDENTITY_MISMATCH')
  assert.equal(client.calls.some(call => call.sql.startsWith('UPDATE ')), false)
})

test('rejects a scoped operator without data_directory visibility instead of granting it', async () => {
  const client = new FakeOrgmasterOwnerClient({ dataDirectoryReadable: false })
  const api = owner(client)
  await assert.rejects(api.readGenerationFence(scope), error =>
    error.code === 'LOCAL_GENERATION_FENCE_OWNER_OPERATION_FAILED' && error.databaseCode === '42501')
  assert.equal(client.calls.some(call => call.sql.startsWith('GRANT ')), false)
  assert.equal(client.calls.some(call => call.sql.startsWith('UPDATE ')), false)
})

test('requires postgres operator targets to declare postgres as database owner', async () => {
  const client = new FakeOrgmasterOwnerClient()
  const invalidTarget = { ...target, operatorRole: 'postgres' }
  assert.throws(() => owner(client, {}, invalidTarget), error => error.code === 'LOCAL_GENERATION_FENCE_TARGET_DESCRIPTOR_INVALID')
  assert.equal(client.calls.length, 0)
})

test('same reset replays by generation-marker and readback without repeated target mutation', async () => {
  const client = new FakeOrgmasterOwnerClient({ markerGeneration: generation })
  for (const session of client.sessions.nativeSessions.values()) {
    if (session.generation === sourceGeneration) {
      session.revokedAt = fixedTime
      session.revokeReason = 'local_generation_reset'
    }
  }
  for (const binding of client.sessions.bindings) {
    if (binding.generation === sourceGeneration) binding.status = 'revoked'
  }
  const api = owner(client)
  const result = await api.rebindAndFenceSessions(scope)
  assert.equal(result.status, 'replayed')
  assert.equal(result.revokedSessionCount, 0)
  assert.equal(result.revokedBindingCount, 0)
  assert.equal(result.readiness.ready, true)
  assert.equal(client.calls.every(call => !call.sql.startsWith('COMMENT ON DATABASE')), true)
})

test('readiness remains false while any prior generation session is active; rebind refuses to touch an unknown one', async () => {
  const client = new FakeOrgmasterOwnerClient({ unknownActiveGeneration: true })
  const api = owner(client)
  const status = await api.readiness(scope)
  assert.equal(status.ready, false)
  assert.ok(status.reasons.includes('active_prior_sessions'))
  client.markerGeneration = generation
  await assert.rejects(api.rebindAndFenceSessions(scope), error => error.code === 'LOCAL_GENERATION_FENCE_UNKNOWN_ACTIVE_PRIOR_GENERATION')
  assert.equal(client.markerGeneration, generation)
  assert.equal(client.calls.every(call => !call.sql.startsWith('COMMENT ON DATABASE')), true)
  assert.equal(client.sessions.nativeSessions.get(sessionId).revokedAt, null)
})

test('rejects mismatched marker, data directory, operator, or application connection before writes', async () => {
  for (const setup of [
    client => { client.markerGeneration = unrelatedGeneration },
    client => { client.markerGeneration = generation; client.appConnections = 1 },
  ]) {
    const client = new FakeOrgmasterOwnerClient()
    setup(client)
    const api = owner(client)
    await assert.rejects(api.rebindAndFenceSessions(scope), error =>
      ['LOCAL_GENERATION_FENCE_TARGET_GENERATION_MISMATCH', 'LOCAL_GENERATION_FENCE_APPLICATIONS_NOT_OFFLINE'].includes(error.code))
    assert.equal(client.calls.every(call => !call.sql.startsWith('COMMENT ON DATABASE')), true)
    assert.equal(client.sessions.nativeSessions.get(sessionId).revokedAt, null)
  }

  const wrongTarget = { ...target, dataDirectory: '/var/lib/postgresql/wrong-data-directory' }
  const client = new FakeOrgmasterOwnerClient()
  client.markerGeneration = generation
  const api = createOrgmasterLocalGenerationFenceOwner({
    client, target: wrongTarget,
    readPlatformFence: async requested => platformFence(requested),
  })
  await assert.rejects(api.rebindAndFenceSessions(scope), error => error.code === 'LOCAL_GENERATION_FENCE_TARGET_IDENTITY_MISMATCH')
  assert.equal(client.calls.every(call => !call.sql.startsWith('COMMENT ON DATABASE')), true)

  const wrongOperatorTarget = { ...target, operatorRole: 'local_org_seed_fedcba9876543210' }
  const operatorClient = new FakeOrgmasterOwnerClient({ markerGeneration: generation })
  const operatorApi = createOrgmasterLocalGenerationFenceOwner({
    client: operatorClient, target: wrongOperatorTarget,
    readPlatformFence: async requested => platformFence(requested),
  })
  await assert.rejects(operatorApi.rebindAndFenceSessions(scope), error => error.code === 'LOCAL_GENERATION_FENCE_TARGET_IDENTITY_MISMATCH')
  assert.equal(operatorClient.calls.some(call => call.sql.startsWith('UPDATE ')), false)
})

test('requires the exact Platform resetting DTO with revoked sessions and retained registry before opening a transaction', async () => {
  for (const fence of [
    { status: 'ready' },
    { sessionsRevoked: false },
    { registryRetained: false },
  ]) {
    const client = new FakeOrgmasterOwnerClient()
    const api = owner(client, fence)
    await assert.rejects(api.rebindAndFenceSessions(scope), error => error.code === 'LOCAL_GENERATION_FENCE_PLATFORM_RESET_FENCE_REQUIRED')
    assert.equal(client.calls.some(call => call.sql.startsWith('BEGIN')), false)
    assert.equal(client.calls.every(call => !call.sql.startsWith('COMMENT ON DATABASE')), true)
  }
})

test('rejects a mismatched Platform generation identity without touching the target', async () => {
  const client = new FakeOrgmasterOwnerClient()
  const api = createOrgmasterLocalGenerationFenceOwner({ client, target,
    readPlatformFence: async requested => platformFence(requested, { generation: unrelatedGeneration }) })
  await assert.rejects(api.readGenerationFence(scope), error => error.code === 'LOCAL_GENERATION_FENCE_PLATFORM_FENCE_MISMATCH')
  assert.equal(client.calls.length, 0)
})

test('accepts only the exact server-side Platform readState DTO shape', async () => {
  const client = new FakeOrgmasterOwnerClient()
  const api = createOrgmasterLocalGenerationFenceOwner({ client, target,
    readPlatformFence: async requested => ({ ...platformFence(requested), browserReportedStatus: 'resetting' }) })
  await assert.rejects(api.readGenerationFence(scope), error => error.code === 'LOCAL_GENERATION_FENCE_PLATFORM_FENCE_MISMATCH')
  assert.equal(client.calls.length, 0)
})
