#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  canonicalize,
  metadataAccessToken,
  parseGsUri,
  publishGcsJson,
  sha256,
} from './lib/dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const SAFE_ID = /^[A-Za-z0-9._:@/-]{1,180}$/u
const OPERATION_ID = /^DEV014-LOGIN-AUTHORITY-[A-Z0-9-]{4,120}$/u
const DEADLINE_MAX_MS = 8 * 60 * 60 * 1_000

export const TARGET = Object.freeze({
  projectId: 'jenfu-platform-prod',
  projectNumber: '9536592944',
  region: 'asia-east1',
  instance: 'jenfu-platform-prod-pg',
  connectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  database: 'jenfu_prod',
  applicationId: 'ai-pdm',
  jobName: 'orgmaster-prod-migration-runner',
  serviceAccount: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
  login: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
  releaseBucket: 'jenfu-platform-prod-orgmaster-release',
  receiptPrefix: 'receipts/releases/DEV014-LOGIN-FIXTURE-AUTHORITY',
  actor: 'dev014-production-login-fixture',
})

export const FIXTURES = Object.freeze([
  Object.freeze({ alias: 'dev014-fp-google', employeeId: '01a0c82b-11c6-77ab-887f-58df9d243e63', employeeNumber: 'JFS9014' }),
  Object.freeze({ alias: 'dev014-fp-number', employeeId: '01a0c82b-372c-7d20-ba3b-6e3b892d2f63', employeeNumber: 'JFS9015' }),
])

function fail(code) { const error = new Error(code); error.code = code; throw error }
function one(rows, code) { if (!Array.isArray(rows) || rows.length !== 1) fail(code); return rows[0] }
function isIso(value) { return Number.isFinite(Date.parse(value ?? '')) }

export function parseArgs(argv) {
  const allowed = new Set(['--operation-id', '--source-revision', '--deadline-at', '--output-ref'])
  const parsed = {}
  if (argv.length !== 8 || argv.length % 2 !== 0) fail('DEV014_LOGIN_AUTHORITY_ARGUMENT_INVALID')
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(key) || !value) fail('DEV014_LOGIN_AUTHORITY_ARGUMENT_INVALID')
    const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    if (parsed[name]) fail('DEV014_LOGIN_AUTHORITY_ARGUMENT_INVALID')
    parsed[name] = value
  }
  if (!OPERATION_ID.test(parsed.operationId ?? '') || !H40.test(parsed.sourceRevision ?? '')
    || !isIso(parsed.deadlineAt) || Date.parse(parsed.deadlineAt) <= Date.now()
    || Date.parse(parsed.deadlineAt) - Date.now() > DEADLINE_MAX_MS
    || !parsed.outputRef) fail('DEV014_LOGIN_AUTHORITY_ARGUMENT_INVALID')
  parseGsUri(parsed.outputRef, TARGET.releaseBucket, TARGET.receiptPrefix)
  return parsed
}

export function assertEnvironment(environment, operation) {
  const observed = {
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    database: environment.POSTGRES_DATABASE,
    login: environment.POSTGRES_IAM_LOGIN,
    socket: environment.POSTGRES_SOCKET,
    job: environment.CLOUD_RUN_JOB,
    owner: environment.OWNER_APPLICATION_ID,
    sourceRevision: environment.OWNER_SOURCE_REVISION ?? environment.SOURCE_REVISION,
  }
  const expected = {
    projectId: TARGET.projectId,
    region: TARGET.region,
    database: TARGET.database,
    login: TARGET.login,
    socket: `/cloudsql/${TARGET.connectionName}`,
    job: TARGET.jobName,
    owner: 'orgmaster',
    sourceRevision: operation.sourceRevision,
  }
  if (canonicalize(observed) !== canonicalize(expected)) fail('DEV014_LOGIN_AUTHORITY_TARGET_INVALID')
  return observed
}

async function metadataServiceAccountEmail(fetchImpl) {
  const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) fail('DEV014_LOGIN_AUTHORITY_RUNTIME_IDENTITY_UNAVAILABLE')
  const email = (await response.text()).trim().toLowerCase()
  if (email !== TARGET.serviceAccount) fail('DEV014_LOGIN_AUTHORITY_RUNTIME_IDENTITY_INVALID')
  return email
}

async function readGovernance(database) {
  const result = await database.query("SELECT payload, canonical_sha256, source_revision FROM orgmaster_core.read_active_persistence_artifact_v1('orgmaster-governance.v3.json')")
  const row = one(result.rows, 'DEV014_LOGIN_AUTHORITY_GOVERNANCE_INVALID')
  const payload = row.payload
  const activePolicyVersionId = String(payload?.activePolicyVersionId ?? '')
  const versions = Array.isArray(payload?.publishedVersions) ? payload.publishedVersions : []
  const version = versions.find((entry) => entry?.id === activePolicyVersionId)
  if (!version || version.kind !== 'assignment-governance-v3' || !SAFE_ID.test(activePolicyVersionId)) fail('DEV014_LOGIN_AUTHORITY_GOVERNANCE_INVALID')
  if (!/^[a-f0-9]{64}$/u.test(String(row.canonical_sha256 ?? '')) || !H40.test(String(row.source_revision ?? ''))) fail('DEV014_LOGIN_AUTHORITY_GOVERNANCE_INVALID')
  return { activePolicyVersionId, version, canonicalSha256: String(row.canonical_sha256), sourceRevision: String(row.source_revision) }
}

async function readState(database, fixture) {
  const authority = one((await database.query(`SELECT application_id, authority_source, authority_version, employee_id, operation_id
    FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1
    WHERE application_id='ai-pdm' AND employee_id=$1`, [fixture.employeeId])).rows, 'DEV014_LOGIN_AUTHORITY_STATE_INVALID')
  const governance = await readGovernance(database)
  const assignments = (Array.isArray(governance.version.policy?.roleAssignments) ? governance.version.policy.roleAssignments : [])
    .filter((entry) => entry?.applicationId === TARGET.applicationId && entry?.employeeId === fixture.employeeId && entry?.status === 'active')
  if (assignments.length !== 1 || assignments[0].roleCodeSnapshot !== 'rd'
    || assignments[0].subjectKind !== 'employee' || assignments[0].scope?.kind !== 'workspace'
    || assignments[0].scope?.value !== 'current' || assignments[0].basis !== 'manual'
    || !Array.isArray(assignments[0].sources) || assignments[0].sources.length !== 0) fail('DEV014_LOGIN_AUTHORITY_ASSIGNMENT_INVALID')
  const effective = await database.query(`SELECT role_code, scope_kind, scope_key, authority_version
    FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
    WHERE application_id='ai-pdm' AND employee_id=$1 ORDER BY role_code`, [fixture.employeeId])
  return {
    authoritySource: String(authority.authority_source),
    authorityVersion: Number(authority.authority_version),
    overrideOperationId: authority.operation_id == null ? null : String(authority.operation_id),
    assignmentVersionId: governance.activePolicyVersionId,
    assignmentVersion: Number(governance.version.versionNumber),
    governanceSha256: governance.canonicalSha256,
    governanceSourceRevision: governance.sourceRevision,
    roleCodes: ['rd'],
    effectiveRows: effective.rows.map((row) => ({ roleCode: String(row.role_code), scopeKind: String(row.scope_kind), scopeKey: row.scope_key == null ? null : String(row.scope_key), authorityVersion: Number(row.authority_version) })),
    effectiveRoleCodes: effective.rows.map((row) => String(row.role_code)).sort(),
  }
}

async function readOperationRows(database, operation) {
  const receipt = await database.query(`SELECT receipt_id, operation_id, batch_id, application_id, employee_id,
      from_authority_source, to_authority_source, authority_version, assignment_version_id,
      session_refresh_state, actor, reason, switched_at
    FROM access_governance.authority_switch_receipts
    WHERE operation_id=$1 AND application_id=$2 AND employee_id=$3`, [operation.operationId, TARGET.applicationId, operation.employeeId])
  const outbox = await database.query(`SELECT event_id, operation_id, employee_id, application_id, event_kind,
      actor, reason_code, status, attempt_count, platform_receipt_id, created_at, completed_at
    FROM access_governance.entitlement_change_outbox
    WHERE operation_id=$1 AND application_id=$2 AND employee_id=$3`, [operation.operationId, TARGET.applicationId, operation.employeeId])
  if (receipt.rows.length > 1 || outbox.rows.length > 1) fail('DEV014_LOGIN_AUTHORITY_RECEIPT_CARDINALITY_INVALID')
  return { receipt: receipt.rows[0] ?? null, outbox: outbox.rows[0] ?? null }
}

function buildOperation(base, fixture, before) {
  const operationId = `${base.operationId}-${fixture.alias.toUpperCase()}`
  return {
    schemaVersion: 'jenfu.dev014.production-login-authority-operation.v1',
    operationKind: 'switch', sourceRevision: base.sourceRevision, operationId,
    batchId: base.operationId, actor: TARGET.actor, reason: `DEV-014 login fixture ${fixture.alias} switch to OrgMaster authority`,
    projectId: TARGET.projectId, projectNumber: TARGET.projectNumber, region: TARGET.region,
    instance: TARGET.instance, database: TARGET.database, applicationId: TARGET.applicationId,
    employeeId: fixture.employeeId, alias: fixture.alias, employeeNumber: fixture.employeeNumber,
    fromAuthoritySource: 'legacy_authority', toAuthoritySource: 'orgmaster_authority',
    expectedAuthorityVersion: 1, expectedNextAuthorityVersion: 2,
    expectedAssignmentVersionId: before.assignmentVersionId, expectedRoleCodes: ['rd'], deadlineAt: base.deadlineAt,
  }
}

function assertPreflightState(state) {
  if (state.authoritySource !== 'legacy_authority' || state.authorityVersion !== 1
    || state.effectiveRoleCodes.length !== 0) fail('DEV014_LOGIN_AUTHORITY_PREFLIGHT_FAILED')
}

function assertCommittedState(state) {
  if (state.authoritySource !== 'orgmaster_authority' || state.authorityVersion !== 2
    || state.effectiveRows.length !== 1 || canonicalize(state.effectiveRows[0]) !== canonicalize({ roleCode: 'rd', scopeKind: 'workspace', scopeKey: 'current', authorityVersion: 2 })) fail('DEV014_LOGIN_AUTHORITY_POSTCONDITION_FAILED')
}

export async function executeAuthorityBatch({ database, operation, now = new Date() }) {
  const nowDate = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(nowDate.getTime()) || Date.parse(operation.deadlineAt) <= nowDate.getTime()) fail('DEV014_LOGIN_AUTHORITY_DEADLINE_INVALID')
  const base = { operationId: operation.operationId, sourceRevision: operation.sourceRevision, deadlineAt: operation.deadlineAt }
  const preflight = []
  for (const fixture of FIXTURES) {
    const before = await readState(database, fixture)
    const op = buildOperation(base, fixture, before)
    preflight.push({ fixture, before, operation: op, rows: await readOperationRows(database, op) })
  }
  const replayCount = preflight.filter(({ before, rows }) => before.authoritySource === 'orgmaster_authority' && before.authorityVersion === 2 && rows.receipt && rows.outbox).length
  if (preflight.some(({ rows }) => (rows.receipt || rows.outbox) && !(rows.receipt && rows.outbox))
    || (replayCount === 0 && preflight.some(({ rows }) => rows.receipt || rows.outbox))) fail('DEV014_LOGIN_AUTHORITY_PARTIAL_STATE')
  if (replayCount > 0 && replayCount !== FIXTURES.length) fail('DEV014_LOGIN_AUTHORITY_PARTIAL_STATE')
  if (replayCount === FIXTURES.length) {
    return {
      status: 'PASS', disposition: 'REPLAY', mutationCount: 0, atomicity: 'single_transaction_all_fixtures',
      fixtures: preflight.map(({ fixture, before, operation: op, rows }) => ({ fixture, disposition: 'REPLAY', operation: op, before, after: before, databaseReceipt: rows.receipt, outbox: rows.outbox })),
    }
  }
  for (const item of preflight) assertPreflightState(item.before)
  await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    await database.query("SELECT pg_advisory_xact_lock(hashtext('dev014-login-fixture-authority'), hashtext(current_database()))")
    const locked = []
    for (const item of preflight) {
      const current = await readState(database, item.fixture)
      if (current.authoritySource !== item.before.authoritySource || current.authorityVersion !== item.before.authorityVersion
        || current.assignmentVersionId !== item.before.assignmentVersionId) fail('DEV014_LOGIN_AUTHORITY_CONDITION_DRIFT')
      locked.push({ ...item, before: current })
    }
    const applied = []
    for (const item of locked) {
      const result = one((await database.query(`SELECT receipt_id, authority_version, outbox_event_id, session_refresh_state, replayed
        FROM access_governance.switch_employee_entitlement_authority_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
        TARGET.applicationId, item.fixture.employeeId, 'orgmaster_authority', 1, item.operation.operationId,
        item.operation.batchId, item.before.assignmentVersionId, TARGET.actor, item.operation.reason,
      ])).rows, 'DEV014_LOGIN_AUTHORITY_FUNCTION_RESULT_INVALID')
      if (Number(result.authority_version) !== 2 || result.replayed !== false) fail('DEV014_LOGIN_AUTHORITY_FUNCTION_RESULT_INVALID')
      const after = await readState(database, item.fixture)
      assertCommittedState(after)
      const rows = await readOperationRows(database, item.operation)
      if (!rows.receipt || !rows.outbox || rows.receipt.from_authority_source !== 'legacy_authority'
        || rows.receipt.to_authority_source !== 'orgmaster_authority' || Number(rows.receipt.authority_version) !== 2
        || rows.receipt.assignment_version_id !== item.before.assignmentVersionId || rows.outbox.event_kind !== 'authority_switch'
        || !['pending', 'processing', 'completed'].includes(String(rows.outbox.status))) fail('DEV014_LOGIN_AUTHORITY_POSTCONDITION_FAILED')
      applied.push({ fixture: item.fixture, disposition: 'APPLIED', operation: item.operation, before: item.before, after, databaseReceipt: rows.receipt, outbox: rows.outbox })
    }
    await database.query('COMMIT')
    return { status: 'PASS', disposition: 'APPLIED', mutationCount: applied.length * 3, atomicity: 'single_transaction_all_fixtures', fixtures: applied }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

function databaseOptions(environment, token) {
  return { host: environment.POSTGRES_SOCKET, database: environment.POSTGRES_DATABASE, user: environment.POSTGRES_IAM_LOGIN,
    password: token, ssl: false, application_name: 'dev014-orgmaster-production-login-authority', connectionTimeoutMillis: 10_000,
    query_timeout: 35_000, statement_timeout: 30_000 }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client, now = () => new Date().toISOString() } = {}) {
  const operation = parseArgs(argv)
  assertEnvironment(environment, operation)
  const token = await metadataAccessToken(fetchImpl)
  await metadataServiceAccountEmail(fetchImpl)
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const batch = await executeAuthorityBatch({ database, operation, now: new Date(now()) })
    const core = { schemaVersion: 'jenfu.dev014.production-login-authority-batch-receipt.v1', ...batch,
      sourceRevision: operation.sourceRevision, operationId: operation.operationId, deadlineAt: operation.deadlineAt,
      target: { projectId: TARGET.projectId, projectNumber: TARGET.projectNumber, region: TARGET.region, instance: TARGET.instance, database: TARGET.database, applicationId: TARGET.applicationId },
      outputRef: operation.outputRef, committedAt: new Date().toISOString() }
    const receipt = { ...core, receiptSha256: sha256(canonicalize(core)) }
    const published = await publishGcsJson({ uri: operation.outputRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: TARGET.receiptPrefix, value: receipt, token, fetchImpl })
    return { ...receipt, outputGeneration: published.generation, outputSha256: published.sha256, outputReused: published.reused }
  } finally { await database.end() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
