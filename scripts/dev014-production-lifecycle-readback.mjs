import crypto from 'node:crypto'
import pg from 'pg'
import { pathToFileURL } from 'node:url'
import { metadataAccessToken, assertRunnerTarget, publishGcsJson, parseGsUri } from './lib/dev012-production-migration-runner.mjs'
import { TARGET, databaseOptions } from './dev040-production-migration-runner.mjs'
import { readLifecycleV2EventSnapshot, readLifecycleV2PreflightSnapshot } from './lib/dev014-lifecycle-v2-readback.mjs'

// parseGsUri adds '/' to the expected prefix in its guard comparison.
const OUTPUT_PREFIX = 'receipts/releases/DEV014-LIFECYCLE-READBACK'
const V2_OUTPUT_PREFIX = `${OUTPUT_PREFIX}/v2`
const RUNTIME_LOGIN = 'orgmaster-prod-runtime@jenfu-platform-prod.iam'
const MODES = Object.freeze({ migrator: TARGET.login, runtime: RUNTIME_LOGIN })
const V2_MODES = new Set(['v2-preflight', 'v2-event'])
const VALID_MODES = new Set([...Object.keys(MODES), ...V2_MODES])
const safeErrors = new Set(['TIMEOUT', 'RATE_LIMITED', 'DIRECTORY_READ_UNAVAILABLE', 'LEASE_EXHAUSTED', 'DIRECTORY_PERMANENT_ERROR'])
const safeRefreshTriggers = new Set(['manual', 'periodic', 'domain'])
const safeRefreshStates = new Set(['queued', 'leased', 'completed', 'retry', 'dead'])
const safeCompletionDispositions = new Set(['applied', 'superseded', 'terminal'])
const safeApplications = new Set(['orgmaster', 'platform', 'ai-pdm'])
const safeLifecycleEvents = new Set(['managed_identity_lifecycle_changed'])
const safeLifecycleStatuses = new Set(['pending', 'processing', 'failed', 'completed'])
const safeReasons = new Set(['entitlement_authority_switch', 'dev014-managed-login-activate', 'dev014-managed-login-rollback'])
const safeQueues = new Set(['refresh', 'lifecycle'])
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function fail(code) { throw new Error(`DEV014_LIFECYCLE_READBACK_${code}`) }
function count(value) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) fail('COUNT_INVALID'); return number }
function seconds(value) { const number = Number(value); if (!Number.isFinite(number) || number < 0) fail('DURATION_INVALID'); return number }
function safeClass(value, allowlist) { return typeof value === 'string' && allowlist.has(value) ? value : 'OTHER_SANITIZED' }
function single(result) { if (result.rows.length !== 1) fail('ROW_COUNT_INVALID'); return result.rows[0] }

function parseReadbackArgs(argv) {
  const allowed = new Set(['mode', 'source-revision', 'output-ref', 'include-jed-smoke', 'employee-number', 'operation-id', 'created-after'])
  const values = {}
  for (const argument of argv) {
    const match = argument.match(/^--([a-z0-9-]+)=(.*)$/u)
    if (!match || !allowed.has(match[1]) || Object.hasOwn(values, match[1]) || match[2].length === 0) fail('ARG_INVALID')
    values[match[1]] = match[2]
  }
  if (!Object.hasOwn(values, 'mode') || !Object.hasOwn(values, 'source-revision') || !Object.hasOwn(values, 'output-ref')
    || !VALID_MODES.has(values.mode) || !/^[a-f0-9]{40}$/u.test(values['source-revision'])) fail('ARG_INVALID')

  const supplied = new Set(Object.keys(values))
  const base = new Set(['mode', 'source-revision', 'output-ref'])
  const optional = new Set()
  if (values.mode === 'v2-preflight') optional.add('include-jed-smoke')
  if (values.mode === 'v2-event') {
    optional.add('employee-number')
    optional.add('operation-id')
    optional.add('created-after')
  }
  for (const key of supplied) if (!base.has(key) && !optional.has(key)) fail('ARG_INVALID')

  let selector = null
  let includeJedSmokePrincipal = false
  if (values.mode === 'v2-preflight') {
    if (values['include-jed-smoke'] !== undefined && !['true', 'false'].includes(values['include-jed-smoke'])) fail('ARG_INVALID')
    includeJedSmokePrincipal = values['include-jed-smoke'] === 'true'
  }
  if (values.mode === 'v2-event') {
    if (!['JFS9014', 'JFS9015'].includes(values['employee-number'])) fail('ARG_INVALID')
    const operationId = values['operation-id']
    const createdAfter = values['created-after']
    if ((operationId === undefined) === (createdAfter === undefined)) fail('ARG_INVALID')
    if (operationId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(operationId)) fail('ARG_INVALID')
    if (createdAfter !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(createdAfter)
      || !Number.isFinite(Date.parse(createdAfter)))) fail('ARG_INVALID')
    selector = operationId !== undefined
      ? { employeeNumber: values['employee-number'], operationId }
      : { employeeNumber: values['employee-number'], createdAfter }
  }
  return { values, selector, includeJedSmokePrincipal }
}

/** Only fixed owner-owned reads in one read-only snapshot. Runtime mode reads
 * its real session identity only: it cannot impersonate the migrator to read
 * owner tables. Queue provenance is aggregated, never an Employee-wide join. */
export async function readLifecycleSnapshot(database, mode = 'migrator') {
  const expectedLogin = MODES[mode]
  if (!expectedLogin) fail('MODE_INVALID')
  let begun = false
  try {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    begun = true
    await database.query("SET LOCAL statement_timeout = '10s'")
    await database.query("SET LOCAL idle_in_transaction_session_timeout = '10s'")
    const identity = single(await database.query('SELECT current_database() AS database, session_user::text AS session_user, current_user::text AS effective_user, current_setting(\'server_version_num\') AS server_version_num, current_setting(\'transaction_read_only\') AS transaction_read_only'))
    if (identity.database !== 'jenfu_prod' || identity.session_user !== expectedLogin || identity.effective_user !== expectedLogin || identity.transaction_read_only !== 'on') fail('DATABASE_IDENTITY_INVALID')
    const result = { schemaVersion: 'orgmaster.dev014-lifecycle-readback.v1', observedAt: new Date().toISOString(), mode, identity, databaseWrites: 0, employeeOrPrincipalPayloadsIncluded: false, ledgerRead: false, queueRead: false, directoryReads: 0, fullDev014Complete: false }
    if (mode === 'migrator') {
      await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
      const ledger = (await database.query('SELECT version, name, btrim(checksum_sha256) AS checksum_sha256, source_revision FROM orgmaster_core.schema_migrations ORDER BY applied_at, version FETCH FIRST 65 ROWS ONLY')).rows
      if (ledger.length > 64 || ledger.some(row => typeof row.version !== 'string' || typeof row.name !== 'string' || !/^[a-f0-9]{64}$/u.test(row.checksum_sha256) || typeof row.source_revision !== 'string')) fail('LEDGER_INVALID')
      const refresh = (await database.query(`SELECT CASE trigger WHEN 'manual' THEN 'manual' WHEN 'periodic' THEN 'periodic' WHEN 'domain' THEN 'domain' ELSE 'OTHER_SANITIZED' END AS trigger,
          CASE state WHEN 'queued' THEN 'queued' WHEN 'leased' THEN 'leased' WHEN 'completed' THEN 'completed' WHEN 'retry' THEN 'retry' WHEN 'dead' THEN 'dead' ELSE 'OTHER_SANITIZED' END AS state,
          CASE WHEN completion_disposition IS NULL THEN NULL WHEN completion_disposition IN ('applied','superseded','terminal') THEN completion_disposition ELSE 'OTHER_SANITIZED' END AS completion_disposition,
          count(*)::text AS count,
          count(*) FILTER (WHERE state = 'leased' AND lease_until <= clock_timestamp())::text AS expired_leases,
          count(*) FILTER (WHERE state IN ('queued','retry') AND available_at <= clock_timestamp())::text AS due,
          count(*) FILTER (WHERE rerun_requested)::text AS rerun,
          coalesce(max(attempt_count),0) AS max_attempts,
          coalesce(extract(epoch FROM clock_timestamp()-min(created_at) FILTER (WHERE state IN ('queued','retry','leased'))),0)::text AS oldest_open_seconds
        FROM orgmaster_core.managed_identity_refresh_outbox
        GROUP BY 1,2,3 ORDER BY 1,2,3 FETCH FIRST 61 ROWS ONLY`)).rows
      const lifecycle = (await database.query(`SELECT CASE application_id WHEN 'orgmaster' THEN 'orgmaster' WHEN 'platform' THEN 'platform' WHEN 'ai-pdm' THEN 'ai-pdm' ELSE 'OTHER_SANITIZED' END AS application_id,
          CASE event_kind WHEN 'managed_identity_lifecycle_changed' THEN 'managed_identity_lifecycle_changed' ELSE 'OTHER_SANITIZED' END AS event_kind,
          CASE reason_code WHEN 'entitlement_authority_switch' THEN 'entitlement_authority_switch' WHEN 'dev014-managed-login-activate' THEN 'dev014-managed-login-activate' WHEN 'dev014-managed-login-rollback' THEN 'dev014-managed-login-rollback' ELSE 'OTHER_SANITIZED' END AS reason_code,
          CASE status WHEN 'pending' THEN 'pending' WHEN 'processing' THEN 'processing' WHEN 'failed' THEN 'failed' WHEN 'completed' THEN 'completed' ELSE 'OTHER_SANITIZED' END AS status,
          count(*)::text AS count,
          count(*) FILTER (WHERE status = 'processing' AND lease_until <= clock_timestamp())::text AS expired_leases,
          count(*) FILTER (WHERE status IN ('pending','failed') AND next_attempt_at <= clock_timestamp())::text AS due,
          count(*) FILTER (WHERE platform_receipt_id IS NOT NULL)::text AS receipts,
          count(*) FILTER (WHERE operation_id IS NOT NULL AND actor IS NOT NULL AND reason_code IS NOT NULL)::text AS operation_provenance_rows,
          coalesce(max(attempt_count),0) AS max_attempts,
          coalesce(extract(epoch FROM clock_timestamp()-min(created_at) FILTER (WHERE status <> 'completed')),0)::text AS oldest_open_seconds
        FROM orgmaster_core.managed_identity_lifecycle_outbox
        GROUP BY 1,2,3,4 ORDER BY 1,2,3,4 FETCH FIRST 1025 ROWS ONLY`)).rows
      if (refresh.length > 60 || lifecycle.length > 1024) fail('AGGREGATE_LIMIT')
      const errors = (await database.query(`SELECT 'refresh' AS queue, CASE last_error_code WHEN 'TIMEOUT' THEN 'TIMEOUT' WHEN 'RATE_LIMITED' THEN 'RATE_LIMITED' WHEN 'DIRECTORY_READ_UNAVAILABLE' THEN 'DIRECTORY_READ_UNAVAILABLE' WHEN 'LEASE_EXHAUSTED' THEN 'LEASE_EXHAUSTED' WHEN 'DIRECTORY_PERMANENT_ERROR' THEN 'DIRECTORY_PERMANENT_ERROR' ELSE 'OTHER_SANITIZED' END AS code,
          count(*)::text AS count FROM orgmaster_core.managed_identity_refresh_outbox WHERE last_error_code IS NOT NULL GROUP BY 1,2
        UNION ALL SELECT 'lifecycle', CASE last_error_code WHEN 'TIMEOUT' THEN 'TIMEOUT' WHEN 'RATE_LIMITED' THEN 'RATE_LIMITED' WHEN 'DIRECTORY_READ_UNAVAILABLE' THEN 'DIRECTORY_READ_UNAVAILABLE' WHEN 'LEASE_EXHAUSTED' THEN 'LEASE_EXHAUSTED' WHEN 'DIRECTORY_PERMANENT_ERROR' THEN 'DIRECTORY_PERMANENT_ERROR' ELSE 'OTHER_SANITIZED' END,
          count(*)::text FROM orgmaster_core.managed_identity_lifecycle_outbox WHERE last_error_code IS NOT NULL GROUP BY 1,2
        ORDER BY 1,2 FETCH FIRST 1025 ROWS ONLY`)).rows
      if (errors.length > 1024) fail('ERROR_CLASS_LIMIT')
      const safeRefresh = refresh.map(row => ({ trigger: safeClass(row.trigger, safeRefreshTriggers), state: safeClass(row.state, safeRefreshStates),
        completion_disposition: row.completion_disposition === null ? null : safeClass(row.completion_disposition, safeCompletionDispositions),
        count: count(row.count), expired_leases: count(row.expired_leases), due: count(row.due), rerun: count(row.rerun),
        max_attempts: count(row.max_attempts), oldest_open_seconds: seconds(row.oldest_open_seconds) }))
      const safeLifecycle = lifecycle.map(row => ({ application_id: safeClass(row.application_id, safeApplications),
        event_kind: safeClass(row.event_kind, safeLifecycleEvents), reason_code: safeClass(row.reason_code, safeReasons),
        status: safeClass(row.status, safeLifecycleStatuses), count: count(row.count), expired_leases: count(row.expired_leases),
        due: count(row.due), receipts: count(row.receipts), operation_provenance_rows: count(row.operation_provenance_rows),
        max_attempts: count(row.max_attempts), oldest_open_seconds: seconds(row.oldest_open_seconds) }))
      Object.assign(result, { ledgerRead: true, queueRead: true, ledger, ledgerSha256: sha(JSON.stringify(ledger)), refresh: safeRefresh, lifecycle: safeLifecycle,
        errorClasses: errors.map(row=>({ queue:safeClass(row.queue, safeQueues), code:safeClass(row.code, safeErrors), count:count(row.count) })),
        lifecycleEventTimeSnapshotAvailable: false,
        lifecycleOpenCount: safeLifecycle.filter(row=>row.status!=='completed').reduce((total,row)=>total+row.count,0),
        provenanceMeaning: 'V1 operation metadata only; no claim of event-time principal targets.' })
    }
    await database.query('COMMIT')
    begun = false
    return result
  } catch (error) {
    if (begun) await database.query('ROLLBACK').catch(()=>undefined)
    throw error
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client } = {}) {
  const parsed = parseReadbackArgs(argv)
  const { values: args, selector, includeJedSmokePrincipal } = parsed
  if (environment.SOURCE_REVISION !== args['source-revision']) fail('IMAGE_SOURCE_MISMATCH')
  const ownerMode = args.mode === 'runtime' ? 'runtime' : 'migrator'
  const expected = {...TARGET, login: MODES[ownerMode], job: ownerMode === 'runtime' ? 'orgmaster-prod-dev014-lifecycle-runtime-readback' : TARGET.job}
  assertRunnerTarget(environment, expected)
  const outputObject = parseGsUri(args['output-ref'], TARGET.releaseBucket, OUTPUT_PREFIX).object
  if (V2_MODES.has(args.mode) && !outputObject.startsWith(`${V2_OUTPUT_PREFIX}/${args['source-revision']}/`)) fail('ARG_INVALID')
  const accessToken = await metadataAccessToken(fetchImpl)
  const database = new Client(databaseOptions(environment, accessToken))
  try {
    await database.connect()
    const snapshot = args.mode === 'v2-preflight'
      ? await readLifecycleV2PreflightSnapshot(database, { includeJedSmokePrincipal })
      : args.mode === 'v2-event'
        ? await readLifecycleV2EventSnapshot(database, selector)
        : await readLifecycleSnapshot(database, ownerMode)
    const receipt = { ...snapshot, ...(V2_MODES.has(args.mode) ? { mode: args.mode } : {}), sourceRevision:args['source-revision'], target:{project:'jenfu-platform-prod',projectNumber:'9536592944',region:'asia-east1',database:'jenfu_prod',owner:'orgmaster'} }
    await publishGcsJson({ uri:args['output-ref'],expectedBucket:TARGET.releaseBucket,expectedPrefix:OUTPUT_PREFIX,value:receipt,token:accessToken,fetchImpl })
    process.stdout.write(JSON.stringify({status:'READ_ONLY_COMPLETE',mode:args.mode,sourceRevision:args['source-revision'],databaseWrites:0,ledgerRead:receipt.ledgerRead,queueRead:receipt.queueRead})+'\n')
    return receipt
  } finally { await database.end() }
}

export function safeReadbackErrorCode(error) {
  const upstream = new Set(['MIGRATION_GCS_REF_INVALID', 'MIGRATION_GCS_METADATA_FAILED',
    'MIGRATION_GCS_METADATA_INVALID', 'MIGRATION_GCS_MEDIA_FAILED', 'MIGRATION_GCS_CRC32C_MISMATCH',
    'MIGRATION_GCS_IMMUTABILITY_CONFLICT', 'MIGRATION_GCS_PUBLISH_FAILED', 'MIGRATION_GCS_READBACK_MISMATCH',
    'MIGRATION_METADATA_TOKEN_FAILED', 'MIGRATION_METADATA_TOKEN_INVALID', 'MIGRATION_PRODUCTION_TARGET_MISMATCH',
    '42501', '42703', '42P01', '57014', '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
    '28P01', '28000', '53300', '53400', '55P03', '57P01', '57P02', '57P03', 'XX000', 'P0001',
    'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ABORT_ERR'])
  const guards = new Set(['COUNT_INVALID', 'DURATION_INVALID', 'ROW_COUNT_INVALID', 'MODE_INVALID',
    'DATABASE_IDENTITY_INVALID', 'LEDGER_INVALID', 'AGGREGATE_LIMIT', 'ERROR_CLASS_LIMIT',
    'ARG_INVALID', 'IMAGE_SOURCE_MISMATCH'].map(code=>'DEV014_LIFECYCLE_READBACK_'+code))
  const v2Guards = new Set(['DATABASE_IDENTITY_INVALID', 'DATABASE_OPERATION_FAILED', 'DATABASE_ROLE_INVALID',
    'DELIVERY_INVALID', 'DELIVERY_QUERY_INVALID', 'DELIVERY_RECEIPT_MISSING', 'EPOCH_QUERY_INVALID', 'EPOCH_RESULT_INVALID',
    'EVENT_CANDIDATE_CAP', 'EVENT_CONTRACT_INVALID', 'EVENT_METADATA_INVALID', 'EVENT_NOT_FOUND',
    'EVENT_NOT_UNIQUE', 'EVENT_QUERY_INVALID', 'EVENT_TARGET_AMBIGUOUS', 'EVENT_TARGET_CAP',
    'EVENT_TARGET_COUNT_INVALID', 'EVENT_TARGET_PRINCIPAL_COUNT_INVALID', 'EVENT_TARGET_QUERY_INVALID',
    'EVENT_TARGET_SCOPE_INVALID', 'FACT_QUERY_INVALID', 'FACT_ROW_CAP', 'FIXTURE_PRINCIPAL_AMBIGUOUS',
    'FIXTURE_SELECTOR_INVALID', 'IDENTITY_FACT_AMBIGUOUS', 'IDENTITY_FACT_INVALID', 'JED_SMOKE_FACT_INVALID',
    'NUMBER_INVALID', 'PREFLIGHT_OPTIONS_INVALID', 'QUERY_RESULT_INVALID', 'RECEIPT_EPOCH_MISMATCH',
    'RECEIPT_INVALID', 'RECEIPT_MISMATCH', 'RECEIPT_NOT_UNIQUE', 'RECEIPT_QUERY_INVALID',
    'RECEIPT_RESULT_INVALID', 'ROW_COUNT_INVALID', 'SELECTOR_INVALID', 'TIMESTAMP_INVALID',
    'WORKLOAD_BINDING_INVALID', 'WORKLOAD_BINDING_QUERY_INVALID'].map(code=>'DEV014_LIFECYCLE_V2_READBACK_'+code))
  if (upstream.has(error?.code)) return error.code
  if (guards.has(error?.message)) return error.message
  if (v2Guards.has(error?.message)) return error.message
  return 'UNCLASSIFIED_READBACK_FAILURE'
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) runMain().catch(error=>{
  process.stderr.write(JSON.stringify({status:'DEV014_LIFECYCLE_READBACK_FAILED',code:safeReadbackErrorCode(error)})+'\n')
  process.exitCode=1
})
