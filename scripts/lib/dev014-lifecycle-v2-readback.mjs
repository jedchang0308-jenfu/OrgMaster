import crypto from 'node:crypto'

const DATABASE = 'jenfu_prod'
const MIGRATOR_LOGIN = 'orgmaster-prod-migrator@jenfu-platform-prod.iam'
const MIGRATOR_ROLE = 'jenfu_orgmaster_migrator'
const ACTIVE_ACCOUNT_VERSION = 'organization.active-principal.v1'
const WORKLOAD_VERSION = 'orgmaster.workload-principals.v1'
const EVENT_VERSION = 'orgmaster.principal-lifecycle.v2'
const RECEIPT_VERSION = 'platform.principal-lifecycle-receipt.v2'
const MAX_EVENT_CANDIDATES = 32
const MAX_EVENT_TARGETS = 64
const MAX_FACT_ROWS = 128
const ACCOUNT_TYPES = new Set(['human_personal', 'human_privileged'])
const DELIVERY_STATUSES = new Set(['pending', 'processing', 'completed', 'blocked'])
const DELIVERY_ERRORS = new Set([
  'DISPATCH_UNAVAILABLE', 'RECEIPT_CONTRACT_INVALID', 'COMPLETION_UNAVAILABLE', 'ATTEMPTS_EXHAUSTED',
])
const RESULT_KINDS = new Set(['invalidated', 'no_issued_security_state'])

export const DEV014_LIFECYCLE_FIXTURES = Object.freeze({
  JFS9014: Object.freeze({ employeeId: '01a0c82b-11c6-77ab-887f-58df9d243e63' }),
  JFS9015: Object.freeze({ employeeId: '01a0c82b-372c-7d20-ba3b-6e3b892d2f63' }),
})

export const DEV014_JED_SMOKE = Object.freeze({
  employeeId: 'employee-shijie',
  principalId: 'principal-firebase-b71682bf0d7cc5596b48dfad991e4096',
})

const WORKLOAD_BINDINGS = Object.freeze([
  Object.freeze({
    owner: 'orgmaster', purpose: 'managed-identity-lifecycle',
    principalId: 'principal-workload:orgmaster-managed-identity-lifecycle',
    sessionUser: 'orgmaster-prod-runtime@jenfu-platform-prod.iam',
  }),
  Object.freeze({
    owner: 'platform', purpose: 'principal-lifecycle-invalidation',
    principalId: 'principal-workload:platform-principal-lifecycle-invalidation',
    sessionUser: 'platform-prod-runtime@jenfu-platform-prod.iam',
  }),
])

function fail(code) { throw new Error(`DEV014_LIFECYCLE_V2_READBACK_${code}`) }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function safeNumber(value, code = 'NUMBER_INVALID', minimum = 0) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum) fail(code)
  return number
}
function safeText(value, code, maximum = 255) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.trim() !== value) fail(code)
  return value
}
function timestamp(value, code = 'TIMESTAMP_INVALID') {
  if (!(value instanceof Date) && (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value)) fail(code)
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) fail(code)
  return date.toISOString()
}
function safeUuid(value, code) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fail(code)
  return value.toLowerCase()
}
function rows(result, code = 'QUERY_RESULT_INVALID', cap = Number.MAX_SAFE_INTEGER) {
  if (!result || !Array.isArray(result.rows) || result.rows.length > cap) fail(code)
  return result.rows
}
function one(result, code = 'ROW_COUNT_INVALID') {
  const values = rows(result, code)
  if (values.length !== 1) fail(code)
  return values[0]
}
function fixedEmployee(employeeNumber) {
  if (!Object.hasOwn(DEV014_LIFECYCLE_FIXTURES, employeeNumber)) fail('FIXTURE_SELECTOR_INVALID')
  return { employeeNumber, employeeId: DEV014_LIFECYCLE_FIXTURES[employeeNumber].employeeId }
}

async function withReadOnlyMigrator(database, read) {
  let begun = false
  try {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    begun = true
    await database.query("SET LOCAL statement_timeout = '10s'")
    await database.query("SET LOCAL idle_in_transaction_session_timeout = '10s'")
    const beforeRole = one(await database.query(`SELECT current_database() AS database,
        session_user::text AS session_user, current_user::text AS effective_user,
        current_setting('transaction_read_only') AS transaction_read_only`), 'DATABASE_IDENTITY_INVALID')
    if (beforeRole.database !== DATABASE || beforeRole.session_user !== MIGRATOR_LOGIN
      || beforeRole.effective_user !== MIGRATOR_LOGIN || beforeRole.transaction_read_only !== 'on') fail('DATABASE_IDENTITY_INVALID')
    await database.query(`SET LOCAL ROLE ${MIGRATOR_ROLE}`)
    const afterRole = one(await database.query(`SELECT current_database() AS database,
        session_user::text AS session_user, current_user::text AS effective_user,
        current_setting('transaction_read_only') AS transaction_read_only`), 'DATABASE_ROLE_INVALID')
    if (afterRole.database !== DATABASE || afterRole.session_user !== MIGRATOR_LOGIN
      || afterRole.effective_user !== MIGRATOR_ROLE || afterRole.transaction_read_only !== 'on') fail('DATABASE_ROLE_INVALID')
    const identity = {
      database: DATABASE,
      sessionUser: MIGRATOR_LOGIN,
      effectiveLoginBeforeRole: MIGRATOR_LOGIN,
      effectiveRole: MIGRATOR_ROLE,
      transactionReadOnly: true,
    }
    const value = await read(identity)
    await database.query('COMMIT')
    begun = false
    return value
  } catch (error) {
    if (begun) await database.query('ROLLBACK').catch(() => undefined)
    if (error instanceof Error && /^DEV014_LIFECYCLE_V2_READBACK_[A-Z0-9_]+$/u.test(error.message)) throw error
    fail('DATABASE_OPERATION_FAILED')
  }
}

function accountFacts(rowsFromDb, expectedEmployeeIds) {
  if (rowsFromDb.length > MAX_FACT_ROWS) fail('FACT_ROW_CAP')
  const expected = new Set(expectedEmployeeIds)
  const grouped = new Map(expectedEmployeeIds.map(employeeId => [employeeId, new Map()]))
  const employeeByPrincipal = new Map()
  for (const row of rowsFromDb) {
    if (!expected.has(row.employee_id) || row.contract_version !== ACTIVE_ACCOUNT_VERSION
      || typeof row.principal_id !== 'string' || row.principal_id.length < 1 || row.principal_id.length > 255
      || !ACCOUNT_TYPES.has(row.account_type) || row.employee_status !== 'active') fail('IDENTITY_FACT_INVALID')
    const ownerEmployee = employeeByPrincipal.get(row.principal_id)
    if (ownerEmployee !== undefined && ownerEmployee !== row.employee_id) fail('IDENTITY_FACT_AMBIGUOUS')
    employeeByPrincipal.set(row.principal_id, row.employee_id)
    const mappingVersion = safeNumber(row.mapping_version, 'IDENTITY_FACT_INVALID', 1)
    const publishedAt = timestamp(row.published_at, 'IDENTITY_FACT_INVALID')
    const fact = {
      principalId: row.principal_id,
      employeeId: row.employee_id,
      accountType: row.account_type,
      employeeStatus: row.employee_status,
      mappingVersions: new Set([mappingVersion]),
      publishedAtValues: new Set([publishedAt]),
    }
    const byPrincipal = grouped.get(row.employee_id)
    const prior = byPrincipal.get(fact.principalId)
    if (prior) {
      if (prior.employeeId !== fact.employeeId || prior.accountType !== fact.accountType
        || prior.employeeStatus !== fact.employeeStatus) fail('IDENTITY_FACT_AMBIGUOUS')
      prior.mappingVersions.add(mappingVersion)
      prior.publishedAtValues.add(publishedAt)
      continue
    }
    byPrincipal.set(fact.principalId, fact)
  }
  for (const byPrincipal of grouped.values()) {
    for (const fact of byPrincipal.values()) {
      fact.mappingVersions = [...fact.mappingVersions].sort((left, right) => left - right)
      fact.publishedAtValues = [...fact.publishedAtValues].sort()
      fact.mappingVersion = fact.mappingVersions.length === 1 ? fact.mappingVersions[0] : null
      fact.publishedAt = fact.publishedAtValues.length === 1 ? fact.publishedAtValues[0] : null
    }
  }
  return grouped
}

async function readEpochStates(database, principalIds) {
  const unique = [...new Set(principalIds)].sort()
  if (!unique.length) return new Map()
  const result = rows(await database.query(`SELECT requested.principal_id AS requested_principal_id,
      state.principal_id, state.auth_epoch, state.revoked_before, state.version
    FROM unnest($1::text[]) AS requested(principal_id)
    LEFT JOIN LATERAL platform_contract.read_principal_auth_state_v3(requested.principal_id) state ON true
    ORDER BY requested.principal_id`, [unique]), 'EPOCH_QUERY_INVALID', unique.length)
  if (result.length !== unique.length) fail('EPOCH_RESULT_INVALID')
  const epochs = new Map()
  for (const row of result) {
    const requested = safeText(row.requested_principal_id, 'EPOCH_RESULT_INVALID')
    if (!unique.includes(requested) || epochs.has(requested)) fail('EPOCH_RESULT_INVALID')
    if (row.principal_id === null || row.principal_id === undefined) {
      if (row.auth_epoch !== null && row.auth_epoch !== undefined) fail('EPOCH_RESULT_INVALID')
      epochs.set(requested, { statePresent: false, authEpoch: null, revokedBefore: null, version: null })
    } else {
      if (row.principal_id !== requested) fail('EPOCH_RESULT_INVALID')
      epochs.set(requested, {
        statePresent: true,
        authEpoch: safeNumber(row.auth_epoch, 'EPOCH_RESULT_INVALID'),
        revokedBefore: row.revoked_before === null ? null : timestamp(row.revoked_before, 'EPOCH_RESULT_INVALID'),
        version: safeNumber(row.version, 'EPOCH_RESULT_INVALID', 1),
      })
    }
  }
  return epochs
}

function publicEpoch(principalId, state) {
  return { principalIdSha256: sha(principalId), ...state }
}

/** Read active fixture Principal facts and auth epochs in one read-only owner snapshot. */
export async function readLifecycleV2PreflightSnapshot(database, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'includeJedSmokePrincipal')
    || (options.includeJedSmokePrincipal !== undefined && typeof options.includeJedSmokePrincipal !== 'boolean')) fail('PREFLIGHT_OPTIONS_INVALID')
  return withReadOnlyMigrator(database, async identity => {
    const fixtures = Object.entries(DEV014_LIFECYCLE_FIXTURES).map(([employeeNumber, value]) => ({ employeeNumber, ...value }))
    const employeeIds = fixtures.map(value => value.employeeId)
    if (options.includeJedSmokePrincipal) employeeIds.push(DEV014_JED_SMOKE.employeeId)
    const accountRows = rows(await database.query(`SELECT DISTINCT contract_version, principal_id, employee_id,
        account_type, employee_status, mapping_version, published_at
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE employee_id = ANY($1::text[])
      ORDER BY employee_id, principal_id, mapping_version`, [employeeIds]), 'FACT_QUERY_INVALID', MAX_FACT_ROWS)
    const facts = accountFacts(accountRows, employeeIds)
    const principalByEmployee = new Map()
    const fixtureResults = fixtures.map(fixture => {
      const principals = facts.get(fixture.employeeId)
      if (!principals.size) return { employeeNumber: fixture.employeeNumber, status: 'NO_ACTIVE_PRINCIPAL' }
      if (principals.size !== 1) fail('FIXTURE_PRINCIPAL_AMBIGUOUS')
      const fact = [...principals.values()][0]
      principalByEmployee.set(fixture.employeeNumber, fact.principalId)
      return {
        employeeNumber: fixture.employeeNumber,
        status: 'ACTIVE_PRINCIPAL_RESOLVED',
        principalIdSha256: sha(fact.principalId),
        accountType: fact.accountType,
        employeeStatus: fact.employeeStatus,
        mappingVersions: fact.mappingVersions,
        publishedAtValues: fact.publishedAtValues,
        mappingVersion: fact.mappingVersion,
        publishedAt: fact.publishedAt,
      }
    })
    let jedSmoke = null
    if (options.includeJedSmokePrincipal) {
      const jedFacts = facts.get(DEV014_JED_SMOKE.employeeId)
      const fixed = jedFacts.get(DEV014_JED_SMOKE.principalId)
      if (jedFacts.size !== 1 || !fixed || fixed.accountType !== 'human_privileged' || fixed.employeeStatus !== 'active') fail('JED_SMOKE_FACT_INVALID')
      principalByEmployee.set('JED_SMOKE', fixed.principalId)
      jedSmoke = {
        employeeLabel: 'JED_SMOKE',
        principalIdSha256: sha(fixed.principalId),
        accountType: fixed.accountType,
        employeeStatus: fixed.employeeStatus,
        mappingVersions: fixed.mappingVersions,
        publishedAtValues: fixed.publishedAtValues,
        mappingVersion: fixed.mappingVersion,
        publishedAt: fixed.publishedAt,
      }
    }
    const epochs = await readEpochStates(database, [...principalByEmployee.values()])
    return {
      schemaVersion: 'orgmaster.dev014-lifecycle-v2-preflight.v1',
      observedAt: new Date().toISOString(),
      identity,
      databaseWrites: 0,
      contractVersions: { activePrincipalFacts: ACTIVE_ACCOUNT_VERSION, authState: 'jenfu.platform-contract.principal-auth-state.v3' },
      fixtures: fixtureResults.map(fixture => {
        const principalId = principalByEmployee.get(fixture.employeeNumber)
        return principalId ? { ...fixture, epoch: publicEpoch(principalId, epochs.get(principalId)) } : fixture
      }),
      ...(jedSmoke ? { jedSmoke: { ...jedSmoke, epoch: publicEpoch(DEV014_JED_SMOKE.principalId, epochs.get(DEV014_JED_SMOKE.principalId)) } } : {}),
    }
  })
}

function parseSelector(selector) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) fail('SELECTOR_INVALID')
  const keys = Object.keys(selector).sort()
  const employee = fixedEmployee(selector.employeeNumber)
  if (keys.length === 2 && keys[0] === 'employeeNumber' && keys[1] === 'operationId') {
    const operationId = safeText(selector.operationId, 'SELECTOR_INVALID')
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(operationId)) fail('SELECTOR_INVALID')
    return { employee, kind: 'operation_id', value: operationId }
  }
  if (keys.length === 2 && keys[0] === 'createdAfter' && keys[1] === 'employeeNumber') {
    const createdAfter = safeText(selector.createdAfter, 'SELECTOR_INVALID', 40)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(createdAfter)
      || !Number.isFinite(Date.parse(createdAfter))) fail('SELECTOR_INVALID')
    return { employee, kind: 'created_after', value: new Date(createdAfter).toISOString() }
  }
  fail('SELECTOR_INVALID')
}

async function selectEvent(database, selector) {
  let found
  if (selector.kind === 'operation_id') {
    const result = rows(await database.query(`SELECT contract_version,event_id,operation_id,source_revision,
        reason_code,btrim(snapshot_hash) AS snapshot_hash,created_at
      FROM orgmaster_contract.v_principal_lifecycle_events_v2
      WHERE contract_version=$1 AND operation_id=$2
      FETCH FIRST 2 ROWS ONLY`, [EVENT_VERSION, selector.value]), 'EVENT_QUERY_INVALID', 2)
    if (result.length !== 1) fail(result.length ? 'EVENT_NOT_UNIQUE' : 'EVENT_NOT_FOUND')
    found = result[0]
  } else {
    const result = rows(await database.query(`SELECT DISTINCT e.contract_version,e.event_id,e.operation_id,e.source_revision,
        e.reason_code,btrim(e.snapshot_hash) AS snapshot_hash,e.created_at
      FROM orgmaster_contract.v_principal_lifecycle_events_v2 e
      WHERE e.contract_version=$1 AND e.created_at >= $2::timestamptz
        AND EXISTS (SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 t
          WHERE t.event_id=e.event_id AND t.employee_id=$3)
      ORDER BY e.created_at,e.event_id
      FETCH FIRST ${MAX_EVENT_CANDIDATES + 1} ROWS ONLY`, [EVENT_VERSION, selector.value, selector.employee.employeeId]), 'EVENT_QUERY_INVALID', MAX_EVENT_CANDIDATES + 1)
    if (result.length > MAX_EVENT_CANDIDATES) fail('EVENT_CANDIDATE_CAP')
    if (result.length !== 1) fail(result.length ? 'EVENT_NOT_UNIQUE' : 'EVENT_NOT_FOUND')
    found = result[0]
  }
  if (found.contract_version !== EVENT_VERSION) fail('EVENT_CONTRACT_INVALID')
  const eventId = safeUuid(found.event_id, 'EVENT_METADATA_INVALID')
  const operationId = safeText(found.operation_id, 'EVENT_METADATA_INVALID')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(operationId)) fail('EVENT_METADATA_INVALID')
  const sourceRevision = safeText(found.source_revision, 'EVENT_METADATA_INVALID')
  const snapshotHash = safeText(found.snapshot_hash, 'EVENT_METADATA_INVALID', 64)
  if (!/^[a-f0-9]{64}$/u.test(snapshotHash)) fail('EVENT_METADATA_INVALID')
  return {
    eventId,
    operationId,
    sourceRevision,
    reasonClass: ['runtime_artifact_write', 'governance_v3_write', 'management_methods_write'].includes(found.reason_code) ? found.reason_code : 'OTHER_SANITIZED',
    snapshotHash,
    createdAt: timestamp(found.created_at, 'EVENT_METADATA_INVALID'),
  }
}

function validateTargets(targetRows, eventId, employee) {
  if (!targetRows.length || targetRows.length > MAX_EVENT_TARGETS) fail('EVENT_TARGET_COUNT_INVALID')
  const unique = new Map()
  for (const row of targetRows) {
    if (String(row.event_id).toLowerCase() !== eventId || row.employee_id !== employee.employeeId
      || typeof row.principal_id !== 'string' || row.principal_id.length < 1 || row.principal_id.length > 255
      || !ACCOUNT_TYPES.has(row.account_type)) fail('EVENT_TARGET_SCOPE_INVALID')
    const prior = unique.get(row.principal_id)
    if (prior && prior.accountType !== row.account_type) fail('EVENT_TARGET_AMBIGUOUS')
    unique.set(row.principal_id, { accountType: row.account_type })
  }
  if (unique.size !== 1) fail('EVENT_TARGET_PRINCIPAL_COUNT_INVALID')
  const [principalId, fact] = [...unique.entries()][0]
  return [{ employeeNumber: employee.employeeNumber, principalId, accountType: fact.accountType }]
}

async function readWorkloadBindings(database) {
  const result = rows(await database.query(`SELECT contract_version,principal_id,owner,purpose,db_session_user,binding_version,enabled
    FROM orgmaster_contract.v_workload_principals_v1
    WHERE (owner='orgmaster' AND purpose='managed-identity-lifecycle')
       OR (owner='platform' AND purpose='principal-lifecycle-invalidation')
    ORDER BY owner,purpose`), 'WORKLOAD_BINDING_QUERY_INVALID', 3)
  if (result.length !== 2) fail('WORKLOAD_BINDING_INVALID')
  const found = new Map()
  for (const row of result) {
    const binding = WORKLOAD_BINDINGS.find(value => value.owner === row.owner && value.purpose === row.purpose)
    if (!binding || found.has(row.owner) || row.contract_version !== WORKLOAD_VERSION
      || row.principal_id !== binding.principalId || row.db_session_user !== binding.sessionUser
      || row.enabled !== true || safeNumber(row.binding_version, 'WORKLOAD_BINDING_INVALID', 1) < 1) fail('WORKLOAD_BINDING_INVALID')
    found.set(row.owner, binding)
  }
  return Object.fromEntries(found)
}

function parsePrincipalResults(value, targetPrincipals) {
  let results = value
  if (typeof results === 'string') {
    try { results = JSON.parse(results) } catch { fail('RECEIPT_RESULT_INVALID') }
  }
  if (!Array.isArray(results) || results.length !== targetPrincipals.length) fail('RECEIPT_RESULT_INVALID')
  const expected = new Set(targetPrincipals)
  const seen = new Set()
  return results.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('RECEIPT_RESULT_INVALID')
    const principalId = safeText(item.principalId, 'RECEIPT_RESULT_INVALID')
    if (!expected.has(principalId) || seen.has(principalId) || !RESULT_KINDS.has(item.result)) fail('RECEIPT_RESULT_INVALID')
    seen.add(principalId)
    if (item.result === 'invalidated') {
      if (Object.keys(item).sort().join(',') !== 'authEpoch,principalId,result') fail('RECEIPT_RESULT_INVALID')
      return { principalId, result: item.result, authEpoch: safeNumber(item.authEpoch, 'RECEIPT_RESULT_INVALID', 1) }
    }
    if (Object.keys(item).sort().join(',') !== 'principalId,result') fail('RECEIPT_RESULT_INVALID')
    return { principalId, result: item.result }
  }).sort((a, b) => a.principalId.localeCompare(b.principalId))
}

function deliverySnapshot(row, eventId) {
  if (!row || String(row.event_id).toLowerCase() !== eventId || !DELIVERY_STATUSES.has(row.status)) fail('DELIVERY_INVALID')
  const rawError = row.last_error_code
  const leaseUntil = row.lease_until === null || row.lease_until === undefined
    ? null : timestamp(row.lease_until, 'DELIVERY_INVALID')
  return {
    status: row.status,
    attemptCount: safeNumber(row.attempt_count, 'DELIVERY_INVALID'),
    leaseGeneration: safeNumber(row.lease_generation, 'DELIVERY_INVALID'),
    receiptId: row.receipt_id === null ? null : safeUuid(String(row.receipt_id), 'DELIVERY_INVALID'),
    completedAt: row.completed_at === null ? null : timestamp(row.completed_at, 'DELIVERY_INVALID'),
    leaseExpired: leaseUntil !== null && new Date(leaseUntil).getTime() <= Date.now(),
    lastErrorClass: rawError === null || rawError === undefined ? null : DELIVERY_ERRORS.has(rawError) ? rawError : 'OTHER_SANITIZED',
  }
}

/** Resolve exactly one immutable v2 event and read its frozen target, owner delivery, Platform receipt and current epochs. */
export async function readLifecycleV2EventSnapshot(database, rawSelector) {
  const selector = parseSelector(rawSelector)
  return withReadOnlyMigrator(database, async identity => {
    const event = await selectEvent(database, selector)
    const targetRows = rows(await database.query(`SELECT DISTINCT event_id,principal_id,employee_id,account_type
      FROM orgmaster_contract.v_principal_lifecycle_targets_v2
      WHERE event_id=$1::text
      ORDER BY employee_id,principal_id
      FETCH FIRST ${MAX_EVENT_TARGETS + 1} ROWS ONLY`, [event.eventId]), 'EVENT_TARGET_QUERY_INVALID', MAX_EVENT_TARGETS + 1)
    if (targetRows.length > MAX_EVENT_TARGETS) fail('EVENT_TARGET_CAP')
    const targets = validateTargets(targetRows, event.eventId, selector.employee)
    const bindings = await readWorkloadBindings(database)
    const deliveryRows = rows(await database.query(`SELECT event_id::text,status,attempt_count,lease_generation,
        receipt_id::text,last_error_code,completed_at,lease_until
      FROM orgmaster_core.principal_lifecycle_delivery_v2 WHERE event_id=$1::uuid
      FETCH FIRST 2 ROWS ONLY`, [event.eventId]), 'DELIVERY_QUERY_INVALID', 2)
    const delivery = deliverySnapshot(one({ rows: deliveryRows }, 'DELIVERY_INVALID'), event.eventId)
    const receiptRows = rows(await database.query(`SELECT contract_version,receipt_id,event_id,operation_id,source_revision,
        btrim(snapshot_hash) AS snapshot_hash,delivery_principal_id,executor_principal_id,
        principal_only,principal_results,completed_at
      FROM platform_contract.v_principal_lifecycle_receipts_v2
      WHERE contract_version=$1 AND event_id=$2::text
      FETCH FIRST 2 ROWS ONLY`, [RECEIPT_VERSION, event.eventId]), 'RECEIPT_QUERY_INVALID', 2)
    if (receiptRows.length > 1) fail('RECEIPT_NOT_UNIQUE')
    const epochStates = await readEpochStates(database, targets.map(target => target.principalId))
    let receipt = null
    if (receiptRows.length === 1) {
      const row = receiptRows[0]
      const receiptId = safeUuid(row.receipt_id, 'RECEIPT_INVALID')
      const receiptEventId = safeUuid(row.event_id, 'RECEIPT_INVALID')
      if (row.contract_version !== RECEIPT_VERSION || receiptEventId !== event.eventId
        || row.operation_id !== event.operationId || row.source_revision !== event.sourceRevision
        || String(row.snapshot_hash).trim() !== event.snapshotHash
        || row.delivery_principal_id !== bindings.orgmaster.principalId
        || row.executor_principal_id !== bindings.platform.principalId || row.principal_only !== true) fail('RECEIPT_MISMATCH')
      if (delivery.receiptId !== null && delivery.receiptId !== receiptId) fail('RECEIPT_MISMATCH')
      if (delivery.status === 'completed' && delivery.receiptId !== receiptId) fail('RECEIPT_MISMATCH')
      const results = parsePrincipalResults(row.principal_results, targets.map(target => target.principalId))
      for (const result of results) {
        const epoch = epochStates.get(result.principalId)
        if (result.result === 'invalidated' && (!epoch?.statePresent || epoch.authEpoch < result.authEpoch)) fail('RECEIPT_EPOCH_MISMATCH')
      }
      receipt = {
        contractVersion: RECEIPT_VERSION,
        receiptId,
        eventId: event.eventId,
        operationId: event.operationId,
        sourceRevision: event.sourceRevision,
        snapshotHash: event.snapshotHash,
        deliveryPrincipalId: row.delivery_principal_id,
        executorPrincipalId: row.executor_principal_id,
        principalOnly: true,
        principalResults: results.map(result => ({
          principalIdSha256: sha(result.principalId),
          result: result.result,
          ...(result.result === 'invalidated' ? { authEpoch: result.authEpoch } : {}),
        })),
        completedAt: timestamp(row.completed_at, 'RECEIPT_INVALID'),
      }
    } else if (delivery.status === 'completed' || delivery.receiptId !== null) {
      fail('DELIVERY_RECEIPT_MISSING')
    }
    return {
      schemaVersion: 'orgmaster.dev014-lifecycle-v2-event-readback.v1',
      observedAt: new Date().toISOString(),
      identity,
      databaseWrites: 0,
      selector: selector.kind === 'operation_id'
        ? { kind: selector.kind, value: selector.value, employeeNumber: selector.employee.employeeNumber }
        : { kind: selector.kind, value: selector.value, employeeNumber: selector.employee.employeeNumber },
      contractVersions: { event: EVENT_VERSION, targets: EVENT_VERSION, receipt: RECEIPT_VERSION, authState: 'jenfu.platform-contract.principal-auth-state.v3' },
      event: { eventId: event.eventId, operationId: event.operationId, sourceRevision: event.sourceRevision,
        reasonClass: event.reasonClass, snapshotHash: event.snapshotHash, createdAt: event.createdAt },
      targets: targets.map(target => ({ employeeNumber: target.employeeNumber,
        principalIdSha256: sha(target.principalId), accountType: target.accountType })),
      targetSetSha256: sha(targets.map(target => `${target.employeeNumber}:${sha(target.principalId)}:${target.accountType}`).sort().join('\n')),
      delivery,
      receipt,
      ownerCompletionPending: Boolean(receipt && delivery.status !== 'completed'),
      epochs: targets.map(target => ({ employeeNumber: target.employeeNumber,
        ...publicEpoch(target.principalId, epochStates.get(target.principalId)) })),
    }
  })
}
