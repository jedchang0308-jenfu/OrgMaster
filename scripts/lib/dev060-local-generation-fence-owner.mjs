import path from 'node:path'

// One-shot OrgMaster owner adapter for DEV-060 local generation reset. It is
// deliberately not imported by an HTTP route and never restores application
// data, lifecycle history, Principal epochs, or a runtime profile.
const OWNER = 'orgmaster'
const MIGRATOR = 'jenfu_orgmaster_migrator'
const ORGMASTER_RUNTIME = 'jenfu_orgmaster_runtime'
const APP_RUNTIME_ROLES = Object.freeze([
  'jenfu_platform_runtime',
  ORGMASTER_RUNTIME,
  'jenfu_ai_pdm_runtime',
  'fms_runtime',
])
const TARGET_FORMAT = 'orgmaster.local-generation-fence-target.v1'
const MARKER_PREFIX = 'jenfu.local-principal-bootstrap.v1:'
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,63}$/u
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const OPERATOR_ROLE = /^local_org_seed_[a-f0-9]{16}$/u
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/u

const makeError = code => Object.assign(new Error(`LOCAL_GENERATION_FENCE_${code}`), {
  code: `LOCAL_GENERATION_FENCE_${code}`,
})
const fail = code => { throw makeError(code) }

function exactObject(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
}

function markerFor(sandboxId, generation) {
  return `${MARKER_PREFIX}${sandboxId}:${generation}`
}

function assertScope(value) {
  if (!exactObject(value, ['sandboxId', 'resetId', 'sourceGeneration', 'generation']) ||
    typeof value.sandboxId !== 'string' || !SANDBOX_ID.test(value.sandboxId) ||
    !UUID_V4.test(value.resetId ?? '') || !UUID_V4.test(value.sourceGeneration ?? '') ||
    !UUID_V4.test(value.generation ?? '') || value.sourceGeneration === value.generation) {
    fail('SCOPE_INVALID')
  }
  return Object.freeze({ ...value })
}

function absoluteDataDirectory(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.includes('\0') ||
    value.includes('/') && value.startsWith('//')) return false
  const slash = value.replaceAll('\\', '/')
  const absolute = slash.startsWith('/') || /^[a-z]:\//iu.test(slash)
  return absolute && !slash.split('/').includes('..') && !slash.endsWith('/..')
}

function assertTarget(value) {
  const keys = ['contractVersion', 'applicationId', 'sandboxId', 'databaseName', 'dataDirectory', 'port',
    'operatorRole', 'databaseOwnerRole', 'runtimeRoles']
  if (!exactObject(value, keys) || value.contractVersion !== TARGET_FORMAT || value.applicationId !== OWNER ||
    typeof value.sandboxId !== 'string' || !SANDBOX_ID.test(value.sandboxId) ||
    value.databaseName !== `jenfu_local_${value.sandboxId.replaceAll('-', '_')}` ||
    !/^jenfu_local_[a-z0-9_]{3,51}$/u.test(value.databaseName) ||
    !absoluteDataDirectory(value.dataDirectory) || !Number.isSafeInteger(value.port) ||
    value.port < 1024 || value.port > 65535 ||
    !(OPERATOR_ROLE.test(value.operatorRole ?? '') || value.operatorRole === 'postgres') ||
    typeof value.databaseOwnerRole !== 'string' || !ROLE_NAME.test(value.databaseOwnerRole) ||
    (value.operatorRole === 'postgres' && value.databaseOwnerRole !== 'postgres') ||
    !Array.isArray(value.runtimeRoles) || value.runtimeRoles.length !== APP_RUNTIME_ROLES.length ||
    value.runtimeRoles.some((role, index) => role !== APP_RUNTIME_ROLES[index])) {
    fail('TARGET_DESCRIPTOR_INVALID')
  }
  return Object.freeze({ ...value, runtimeRoles: Object.freeze([...value.runtimeRoles]) })
}

function assertPlatformFence(scope, value) {
  const keys = ['sandboxId', 'resetId', 'sourceGeneration', 'generation', 'status', 'sessionsRevoked', 'registryRetained']
  if (!exactObject(value, keys) || value.sandboxId !== scope.sandboxId || value.resetId !== scope.resetId ||
    value.sourceGeneration !== scope.sourceGeneration || value.generation !== scope.generation ||
    !['resetting', 'ready', 'failed'].includes(value.status) ||
    typeof value.sessionsRevoked !== 'boolean' || typeof value.registryRetained !== 'boolean') {
    fail('PLATFORM_FENCE_MISMATCH')
  }
  return Object.freeze({ ...value })
}

function platformFenceFor(scope, readPlatformFence) {
  return Promise.resolve().then(() => readPlatformFence(scope)).then(value => assertPlatformFence(scope, value)).catch(error => {
    if (error?.code?.startsWith('LOCAL_GENERATION_FENCE_')) throw error
    throw fail('PLATFORM_FENCE_UNAVAILABLE')
  })
}

function requireResettingFence(fence) {
  if (fence.status !== 'resetting' || fence.sessionsRevoked !== true || fence.registryRetained !== true) {
    fail('PLATFORM_RESET_FENCE_REQUIRED')
  }
}

function parseTargetGeneration(databaseComment, scope) {
  const sourceMarker = markerFor(scope.sandboxId, scope.sourceGeneration)
  const generationMarker = markerFor(scope.sandboxId, scope.generation)
  if (databaseComment === sourceMarker) return scope.sourceGeneration
  if (databaseComment === generationMarker) return scope.generation
  fail('TARGET_GENERATION_MISMATCH')
}

function exactCount(row, field, code) {
  const value = typeof row?.[field] === 'number' ? row[field] :
    typeof row?.[field] === 'string' && row[field].trim() ? Number(row[field]) : Number.NaN
  if (!Number.isSafeInteger(value) || value < 0) fail(code)
  return value
}

async function readTargetFacts(client, target, scope) {
  const result = await client.query(`SELECT current_database() AS database_name,
      pg_catalog.host(pg_catalog.inet_server_addr()) AS server_address,
      pg_catalog.inet_server_port() AS server_port,
      pg_catalog.current_setting('data_directory') AS data_directory,
      session_user::text AS session_user,current_user::text AS current_user,
      (SELECT pg_catalog.shobj_description(oid,'pg_database') FROM pg_catalog.pg_database
        WHERE datname=current_database()) AS database_comment,
      pg_catalog.pg_get_userbyid(database.datdba) AS database_owner,
      (operator_role.rolsuper OR pg_catalog.pg_has_role(session_user,'${MIGRATOR}','MEMBER')) AS operator_can_set_migrator,
      (operator_role.rolsuper OR pg_catalog.pg_has_role(session_user,'pg_monitor','MEMBER') OR
        pg_catalog.pg_has_role(session_user,'pg_read_all_stats','MEMBER')) AS operator_can_read_activity
    FROM pg_catalog.pg_database database
    JOIN pg_catalog.pg_roles operator_role ON operator_role.rolname=session_user
    WHERE database.datname=current_database()`)
  const row = result.rows?.[0]
  const expectedMarker = row?.database_comment
  const targetGeneration = parseTargetGeneration(expectedMarker, scope)
  const clusterSuperuser = target.operatorRole === 'postgres'
  if (result.rows?.length !== 1 || row.database_name !== target.databaseName ||
    !['127.0.0.1', '::1'].includes(row.server_address) || Number(row.server_port) !== target.port ||
    row.data_directory !== target.dataDirectory || row.session_user !== target.operatorRole ||
    row.current_user !== target.operatorRole ||
    row.database_owner !== target.databaseOwnerRole ||
    row.operator_is_superuser !== clusterSuperuser ||
    row.operator_can_set_migrator !== true || row.operator_can_read_activity !== true) {
    fail('TARGET_IDENTITY_MISMATCH')
  }
  return Object.freeze({ targetGeneration, databaseComment: expectedMarker })
}

async function assertRuntimeRoles(client) {
  const roles = [...APP_RUNTIME_ROLES, MIGRATOR]
  const result = await client.query(`SELECT rolname::text AS role_name,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
    FROM pg_catalog.pg_roles WHERE rolname=ANY($1::name[])`, [roles])
  const rows = result.rows ?? []
  const byName = new Map(rows.map(row => [row.role_name, row]))
  if (byName.size !== roles.length || roles.some(role => !byName.has(role)) ||
    rows.some(row => row.rolsuper !== false || row.rolcreatedb !== false || row.rolcreaterole !== false ||
      row.rolbypassrls !== false)) fail('ROLE_SHAPE_MISMATCH')
}

async function assertNoApplicationConnections(client, target) {
  const result = await client.query(`SELECT count(*)::int AS connection_count
    FROM pg_catalog.pg_stat_activity
    WHERE pid <> pg_catalog.pg_backend_pid() AND usename=ANY($1::name[])`, [target.runtimeRoles])
  if (result.rows?.length !== 1 || exactCount(result.rows[0], 'connection_count', 'APP_CONNECTION_READBACK_INVALID') !== 0) {
    fail('APPLICATIONS_NOT_OFFLINE')
  }
  return 0
}

const requiredColumns = Object.freeze({
  app_sessions: Object.freeze({
    id: 'uuid', app_id: 'text', revoked_at: 'timestamp with time zone',
    revoke_reason: 'text', expires_at: 'timestamp with time zone', updated_at: 'timestamp with time zone',
  }),
  local_sandbox_session_bindings: Object.freeze({
    session_id: 'uuid', sandbox_id: 'text', generation: 'uuid', status: 'text', updated_at: 'timestamp with time zone',
  }),
  local_principal_lifecycle_events: Object.freeze({ event_id: 'uuid', sandbox_id: 'text', generation: 'uuid' }),
  local_principal_lifecycle_session_bindings: Object.freeze({ session_id: 'uuid', sandbox_id: 'text', generation: 'uuid' }),
})

async function assertOwnerObjects(client) {
  const objects = await client.query(`SELECT
      to_regclass('orgmaster_core.app_sessions') IS NOT NULL AS app_sessions,
      to_regclass('orgmaster_core.local_sandbox_session_bindings') IS NOT NULL AS native_bindings,
      to_regclass('orgmaster_core.local_principal_lifecycle_events') IS NOT NULL AS lifecycle_events,
      to_regclass('orgmaster_contract.v_local_principal_lifecycle_events_v1') IS NOT NULL AS lifecycle_contract,
      to_regclass('orgmaster_core.local_principal_lifecycle_session_bindings') IS NOT NULL AS lifecycle_bindings,
      to_regclass('orgmaster_contract.v_local_principal_lifecycle_state_v1') IS NOT NULL AS lifecycle_state`)
  const objectRow = objects.rows?.[0]
  if (objects.rows?.length !== 1 || !objectRow || Object.values(objectRow).some(value => value !== true)) {
    fail('OWNER_OBJECTS_MISSING')
  }

  const tableNames = Object.keys(requiredColumns)
  const columns = await client.query(`SELECT table_name,column_name,data_type
    FROM information_schema.columns
    WHERE table_schema='orgmaster_core' AND table_name=ANY($1::text[])`, [tableNames])
  const present = new Map((columns.rows ?? []).map(row => [`${row.table_name}.${row.column_name}`, row.data_type]))
  for (const [table, columnsByName] of Object.entries(requiredColumns)) {
    for (const [column, type] of Object.entries(columnsByName)) {
      if (present.get(`${table}.${column}`) !== type) fail('OWNER_BINDING_SHAPE_MISMATCH')
    }
  }

  const ownership = await client.query(`SELECT namespace.nspname AS schema_name,relation.relname,
      relation.relkind,pg_catalog.pg_get_userbyid(relation.relowner) AS owner
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE (namespace.nspname='orgmaster_core' AND relation.relname=ANY($1::text[]))
       OR (namespace.nspname='orgmaster_contract' AND relation.relname=ANY($2::text[]))`, [
    ['local_sandbox_session_bindings', 'local_principal_lifecycle_events', 'local_principal_lifecycle_session_bindings'],
    ['v_local_principal_lifecycle_events_v1', 'v_local_principal_lifecycle_state_v1'],
  ])
  const ownershipByName = new Map((ownership.rows ?? []).map(row => [`${row.schema_name}.${row.relname}`, row]))
  const expected = [
    ['orgmaster_core.local_sandbox_session_bindings', 'r'],
    ['orgmaster_core.local_principal_lifecycle_events', 'r'],
    ['orgmaster_core.local_principal_lifecycle_session_bindings', 'r'],
    ['orgmaster_contract.v_local_principal_lifecycle_events_v1', 'v'],
    ['orgmaster_contract.v_local_principal_lifecycle_state_v1', 'v'],
  ]
  if (ownershipByName.size !== expected.length || expected.some(([name, kind]) => {
    const row = ownershipByName.get(name)
    return !row || row.relkind !== kind || row.owner !== MIGRATOR
  })) fail('OWNER_BINDING_OWNER_MISMATCH')
}

async function readPreservedCounts(client, sandboxId) {
  const result = await client.query(`SELECT
      (SELECT count(*)::int FROM orgmaster_core.local_principal_lifecycle_events WHERE sandbox_id=$1) AS lifecycle_event_count,
      (SELECT count(*)::int FROM orgmaster_core.local_principal_lifecycle_session_bindings WHERE sandbox_id=$1) AS lifecycle_binding_count,
      (SELECT count(*)::int FROM orgmaster_core.local_sandbox_session_bindings WHERE sandbox_id=$1) AS registration_binding_count`, [sandboxId])
  if (result.rows?.length !== 1) fail('PRESERVATION_READBACK_INVALID')
  return Object.freeze({
    lifecycleEventCount: exactCount(result.rows[0], 'lifecycle_event_count', 'PRESERVATION_READBACK_INVALID'),
    lifecycleSessionBindingCount: exactCount(result.rows[0], 'lifecycle_binding_count', 'PRESERVATION_READBACK_INVALID'),
    registrationBindingCount: exactCount(result.rows[0], 'registration_binding_count', 'PRESERVATION_READBACK_INVALID'),
  })
}

async function readSessionFenceCounts(client, scope) {
  const result = await client.query(`WITH bindings AS (
      SELECT session_id,sandbox_id,generation FROM orgmaster_core.local_sandbox_session_bindings WHERE sandbox_id=$1
      UNION
      SELECT session_id,sandbox_id,generation FROM orgmaster_core.local_principal_lifecycle_session_bindings WHERE sandbox_id=$1
    ), conflicts AS (
      SELECT session_id FROM bindings GROUP BY session_id HAVING count(DISTINCT generation) > 1
    ), active AS (
      SELECT DISTINCT binding.session_id,binding.generation
      FROM bindings binding JOIN orgmaster_core.app_sessions session ON session.id=binding.session_id
      WHERE session.app_id='orgmaster' AND session.revoked_at IS NULL AND session.expires_at > clock_timestamp()
    )
    SELECT
      (SELECT count(*)::int FROM conflicts) AS conflicting_binding_count,
      (SELECT count(*)::int FROM orgmaster_core.local_sandbox_session_bindings
        WHERE sandbox_id=$1 AND generation=$2::uuid AND status <> 'revoked') AS unrevoked_source_binding_count,
      count(*) FILTER (WHERE generation <> $3::uuid)::int AS active_prior_session_count,
      count(*) FILTER (WHERE generation = $2::uuid)::int AS active_source_session_count,
      count(*) FILTER (WHERE generation = $3::uuid)::int AS active_target_session_count,
      COALESCE(array_agg(DISTINCT generation::text) FILTER (WHERE generation <> $3::uuid),ARRAY[]::text[]) AS active_prior_generations
    FROM active`, [scope.sandboxId, scope.sourceGeneration, scope.generation])
  if (result.rows?.length !== 1) fail('SESSION_FENCE_READBACK_INVALID')
  const row = result.rows[0]
  const priorGenerations = row.active_prior_generations
  if (!Array.isArray(priorGenerations) || priorGenerations.some(value => typeof value !== 'string' || !UUID_V4.test(value))) {
    fail('SESSION_FENCE_READBACK_INVALID')
  }
  const conflictingBindingCount = exactCount(row, 'conflicting_binding_count', 'SESSION_FENCE_READBACK_INVALID')
  if (conflictingBindingCount !== 0) fail('BINDING_GENERATION_CONFLICT')
  return Object.freeze({
    unrevokedSourceBindingCount: exactCount(row, 'unrevoked_source_binding_count', 'SESSION_FENCE_READBACK_INVALID'),
    activePriorSessionCount: exactCount(row, 'active_prior_session_count', 'SESSION_FENCE_READBACK_INVALID'),
    activeSourceSessionCount: exactCount(row, 'active_source_session_count', 'SESSION_FENCE_READBACK_INVALID'),
    activeTargetSessionCount: exactCount(row, 'active_target_session_count', 'SESSION_FENCE_READBACK_INVALID'),
    activePriorGenerations: Object.freeze([...priorGenerations]),
  })
}

async function readFenceSnapshot(client, target, scope, platformFence) {
  const dbTarget = await readTargetFacts(client, target, scope)
  await assertRuntimeRoles(client)
  await assertOwnerObjects(client)
  const activeApplicationConnectionCount = await assertNoApplicationConnections(client, target)
  const sessionCounts = await readSessionFenceCounts(client, scope)
  const preservedCounts = await readPreservedCounts(client, scope.sandboxId)
  return Object.freeze({
    sandboxId: scope.sandboxId,
    resetId: scope.resetId,
    sourceGeneration: scope.sourceGeneration,
    generation: scope.generation,
    targetGeneration: dbTarget.targetGeneration,
    platformFence,
    ...sessionCounts,
    activeApplicationConnectionCount,
    ...preservedCounts,
  })
}

function buildReadiness(snapshot) {
  const reasons = []
  if (snapshot.targetGeneration !== snapshot.generation) reasons.push('target_generation_not_rebound')
  if (snapshot.platformFence.status !== 'resetting' && snapshot.platformFence.status !== 'ready' ||
    snapshot.platformFence.sessionsRevoked !== true || snapshot.platformFence.registryRetained !== true) {
    reasons.push('platform_fence_not_ready')
  }
  if (snapshot.activePriorSessionCount !== 0) reasons.push('active_prior_sessions')
  if (snapshot.unrevokedSourceBindingCount !== 0) reasons.push('unrevoked_source_bindings')
  if (snapshot.activeTargetSessionCount !== 0) reasons.push('active_target_sessions')
  if (snapshot.activeApplicationConnectionCount !== 0) reasons.push('applications_not_offline')
  return Object.freeze({
    ready: reasons.length === 0,
    reasons: Object.freeze(reasons),
    targetGeneration: snapshot.targetGeneration,
    unrevokedSourceBindingCount: snapshot.unrevokedSourceBindingCount,
    activePriorSessionCount: snapshot.activePriorSessionCount,
    activeSourceSessionCount: snapshot.activeSourceSessionCount,
    activeTargetSessionCount: snapshot.activeTargetSessionCount,
    activeApplicationConnectionCount: snapshot.activeApplicationConnectionCount,
    platformFence: snapshot.platformFence,
    preserved: Object.freeze({
      lifecycleEventCount: snapshot.lifecycleEventCount,
      lifecycleSessionBindingCount: snapshot.lifecycleSessionBindingCount,
      registrationBindingCount: snapshot.registrationBindingCount,
    }),
  })
}

function isReady(readiness) { return readiness.ready === true }

function databaseError(error) {
  if (typeof error?.code === 'string' && error.code.startsWith('LOCAL_GENERATION_FENCE_')) return error
  const wrapped = makeError('OWNER_OPERATION_FAILED')
  if (typeof error?.code === 'string' && /^[0-9A-Z_]{1,64}$/u.test(error.code)) wrapped.databaseCode = error.code
  return wrapped
}

/**
 * Creates the OrgMaster-owned local generation fence facade. The caller owns
 * the connection and supplies the task-verified target plus a server-side
 * Platform ownerport readState closure; browser-reported state is not accepted.
 * No file, PDM, FMS, Platform, or business-data writes occur.
 */
export function createOrgmasterLocalGenerationFenceOwner({ client, target: targetValue, readPlatformFence } = {}) {
  if (!client || typeof client.query !== 'function' || typeof readPlatformFence !== 'function') {
    fail('INPUT_INVALID')
  }
  const target = assertTarget(targetValue)

  async function readGenerationFence(scopeValue) {
    const scope = assertScope(scopeValue)
    if (scope.sandboxId !== target.sandboxId) fail('TARGET_SCOPE_MISMATCH')
    const platformFence = await platformFenceFor(scope, readPlatformFence)
    let transactionStarted = false
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      transactionStarted = true
      const snapshot = await readFenceSnapshot(client, target, scope, platformFence)
      await client.query('COMMIT')
      transactionStarted = false
      return snapshot
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
      throw databaseError(error)
    }
  }

  async function readiness(scopeValue) {
    return buildReadiness(await readGenerationFence(scopeValue))
  }

  async function rebindAndFenceSessions(scopeValue) {
    const scope = assertScope(scopeValue)
    if (scope.sandboxId !== target.sandboxId) fail('TARGET_SCOPE_MISMATCH')
    requireResettingFence(await platformFenceFor(scope, readPlatformFence))

    let transactionStarted = false
    let commitAttempted = false
    let revokedSessionCount = 0
    let revokedBindingCount = 0
    let preservedBefore
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
      transactionStarted = true
      await client.query(`SET LOCAL lock_timeout = '5s'`)
      await client.query(`SET LOCAL statement_timeout = '30s'`)
      await client.query(`SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('orgmaster-local-generation-fence:' || $1,0))`, [scope.sandboxId])

      const before = await readTargetFacts(client, target, scope)
      requireResettingFence(await platformFenceFor(scope, readPlatformFence))
      // Platform beginFence owns the database marker and switches it in the
      // same transaction that revokes the previous central generation.
      if (before.targetGeneration !== scope.generation) fail('TARGET_GENERATION_MISMATCH')
      await assertRuntimeRoles(client)
      await assertOwnerObjects(client)
      await assertNoApplicationConnections(client, target)
      const sessionCounts = await readSessionFenceCounts(client, scope)
      const unknownActiveGenerations = sessionCounts.activePriorGenerations.filter(generation =>
        generation !== scope.sourceGeneration)
      if (unknownActiveGenerations.length) fail('UNKNOWN_ACTIVE_PRIOR_GENERATION')
      if (sessionCounts.activeTargetSessionCount !== 0) fail('ACTIVE_TARGET_GENERATION_SESSION_PRESENT')
      preservedBefore = await readPreservedCounts(client, scope.sandboxId)

      await client.query(`SET LOCAL ROLE ${MIGRATOR}`)
      const changedBindings = await client.query(`UPDATE orgmaster_core.local_sandbox_session_bindings
        SET status='revoked',updated_at=clock_timestamp()
        WHERE sandbox_id=$1 AND generation=$2::uuid AND status <> 'revoked'
        RETURNING session_id::text`, [scope.sandboxId, scope.sourceGeneration])
      revokedBindingCount = changedBindings.rows?.length ?? 0

      const changedSessions = await client.query(`UPDATE orgmaster_core.app_sessions AS session
        SET revoked_at=COALESCE(session.revoked_at,clock_timestamp()),
            revoke_reason=COALESCE(session.revoke_reason,'local_generation_reset'),
            updated_at=clock_timestamp()
        WHERE session.app_id='${OWNER}' AND session.revoked_at IS NULL AND session.id IN (
          SELECT session_id FROM orgmaster_core.local_sandbox_session_bindings
           WHERE sandbox_id=$1 AND generation=$2::uuid
          UNION
          SELECT session_id FROM orgmaster_core.local_principal_lifecycle_session_bindings
           WHERE sandbox_id=$1 AND generation=$2::uuid
        ) RETURNING session.id::text`, [scope.sandboxId, scope.sourceGeneration])
      revokedSessionCount = changedSessions.rows?.length ?? 0

      await client.query('RESET ROLE')
      await assertRuntimeRoles(client)
      const targetAfter = await readTargetFacts(client, target, scope)
      if (targetAfter.targetGeneration !== scope.generation) fail('TARGET_REBIND_READBACK_MISMATCH')
      const sessionsAfter = await readSessionFenceCounts(client, scope)
      if (sessionsAfter.activePriorSessionCount !== 0 || sessionsAfter.activeSourceSessionCount !== 0 ||
        sessionsAfter.activeTargetSessionCount !== 0 || sessionsAfter.activePriorGenerations.length !== 0) {
        fail('ACTIVE_PRIOR_SESSION_READBACK_MISMATCH')
      }
      if (sessionsAfter.unrevokedSourceBindingCount !== 0) fail('SOURCE_BINDING_READBACK_MISMATCH')
      const preservedAfter = await readPreservedCounts(client, scope.sandboxId)
      if (JSON.stringify(preservedAfter) !== JSON.stringify(preservedBefore)) fail('PRESERVED_HISTORY_CHANGED')

      commitAttempted = true
      await client.query('COMMIT')
      transactionStarted = false
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
      if (commitAttempted) {
        try {
          const snapshot = await readGenerationFence(scope)
          const observedReadiness = buildReadiness(snapshot)
          if (isReady(observedReadiness)) {
            return Object.freeze({
              status: 'replayed', sandboxId: scope.sandboxId, resetId: scope.resetId,
              sourceGeneration: scope.sourceGeneration, generation: scope.generation,
              revokedSessionCount, revokedBindingCount, readiness: observedReadiness,
            })
          }
        } catch { /* Keep the commit-unknown result and require an explicit readback. */ }
        throw fail('COMMIT_UNKNOWN_READBACK_REQUIRED')
      }
      throw databaseError(error)
    }

    const observed = await readGenerationFence(scope)
    const observedReadiness = buildReadiness(observed)
    if (!isReady(observedReadiness)) fail('POST_COMMIT_READBACK_NOT_READY')
    return Object.freeze({
      status: revokedSessionCount > 0 || revokedBindingCount > 0 ? 'rebound' : 'replayed',
      sandboxId: scope.sandboxId,
      resetId: scope.resetId,
      sourceGeneration: scope.sourceGeneration,
      generation: scope.generation,
      revokedSessionCount,
      revokedBindingCount,
      readiness: observedReadiness,
    })
  }

  return Object.freeze({ rebindAndFenceSessions, readGenerationFence, readiness })
}
