#!/usr/bin/env node
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { metadataAccessToken } from './lib/dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const OPERATION_ID = /^DEV014-LOGIN-FIXTURE-[A-Z0-9-]{4,120}$/u
const ACTOR = 'dev014-production-login-fixture'
const GOOGLE_DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const HTTP_TIMEOUT_MS = 20_000

export const TARGET = Object.freeze({
  projectId: 'jenfu-platform-prod',
  projectNumber: '9536592944',
  region: 'asia-east1',
  instance: 'jenfu-platform-prod-pg',
  database: 'jenfu_prod',
  jobName: 'orgmaster-prod-migration-runner',
  runtimeServiceAccount: 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
  runtimeDbLogin: 'orgmaster-prod-runtime@jenfu-platform-prod.iam',
  signerServiceAccount: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
  directoryCustomerId: 'C015t4buc',
  delegatedSubject: 'jedchang0308@jenfu.com.tw',
  directoryDomain: 'jenfu.com.tw',
})

export const FIXTURES = Object.freeze([
  Object.freeze({
    alias: 'dev014-fp-google',
    employeeId: '01a0c82b-11c6-77ab-887f-58df9d243e63',
    employeeNumber: 'JFS9014',
    primaryEmail: 'dev014-fp-google@jenfu.com.tw',
  }),
  Object.freeze({
    alias: 'dev014-fp-number',
    employeeId: '01a0c82b-372c-7d20-ba3b-6e3b892d2f63',
    employeeNumber: 'JFS9015',
    primaryEmail: 'dev014-fp-number@jenfu.com.tw',
  }),
])

function fail(code) { throw new Error(code) }
function sha256(value) { return createHash('sha256').update(String(value), 'utf8').digest('hex') }
function one(rows, code) { if (!Array.isArray(rows) || rows.length !== 1) fail(code); return rows[0] }
function normalizedEmail(value) { return String(value ?? '').trim().toLowerCase() }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}
function canonicalJson(value) { return JSON.stringify(canonicalize(value)) }

export function parseArgs(argv) {
  const names = new Set(['--operation-id', '--source-revision', '--workspace-revision', '--deadline-at', '--phase'])
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const next = argv[index + 1]
    if (!names.has(key) || !next) fail('DEV014_LOGIN_FIXTURE_ARGUMENT_INVALID')
    const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    if (value[name]) fail('DEV014_LOGIN_FIXTURE_ARGUMENT_INVALID')
    value[name] = next
  }
  if (Object.keys(value).length !== names.size || !OPERATION_ID.test(value.operationId ?? '')
    || !H40.test(value.sourceRevision ?? '') || typeof value.workspaceRevision !== 'string' || !value.workspaceRevision.trim()
    || !Number.isFinite(Date.parse(value.deadlineAt ?? '')) || !['assign', 'activate', 'link', 'readback'].includes(value.phase ?? '')) {
    fail('DEV014_LOGIN_FIXTURE_ARGUMENT_INVALID')
  }
  return value
}

export function assertEnvironment(environment, operation) {
  if (environment.GOOGLE_CLOUD_PROJECT !== TARGET.projectId
    || environment.GOOGLE_CLOUD_REGION !== TARGET.region
    || environment.OWNER_APPLICATION_ID !== 'orgmaster'
    || environment.POSTGRES_DATABASE !== TARGET.database
    || environment.POSTGRES_IAM_LOGIN !== TARGET.runtimeDbLogin
    || environment.CLOUD_RUN_JOB !== TARGET.jobName
    || environment.OWNER_SOURCE_REVISION !== operation.sourceRevision
    || environment.POSTGRES_SOCKET !== `/cloudsql/${TARGET.projectId}:${TARGET.region}:${TARGET.instance}`) {
    fail('DEV014_LOGIN_FIXTURE_TARGET_INVALID')
  }
}

async function metadataServiceAccountEmail(fetchImpl) {
  const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (!response.ok) fail('DEV014_LOGIN_FIXTURE_RUNTIME_IDENTITY_UNAVAILABLE')
  const email = (await response.text()).trim().toLowerCase()
  if (email !== TARGET.runtimeServiceAccount) fail('DEV014_LOGIN_FIXTURE_RUNTIME_IDENTITY_INVALID')
  return email
}

async function jsonResponse(response, code) {
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) fail(code)
  return body
}

async function createDirectoryReader({ sourceToken, fetchImpl, now = Date.now }) {
  const issuedAt = Math.floor(now() / 1_000)
  const claims = {
    iss: TARGET.signerServiceAccount,
    sub: TARGET.delegatedSubject,
    scope: GOOGLE_DIRECTORY_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3_600,
  }
  const signResponse = await fetchImpl(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(TARGET.signerServiceAccount)}:signJwt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sourceToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(claims) }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const signed = await jsonResponse(signResponse, 'DEV014_LOGIN_FIXTURE_DWD_SIGN_FAILED')
  if (typeof signed.signedJwt !== 'string' || !signed.signedJwt) fail('DEV014_LOGIN_FIXTURE_DWD_SIGN_FAILED')
  const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signed.signedJwt }).toString(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const delegated = await jsonResponse(tokenResponse, 'DEV014_LOGIN_FIXTURE_DWD_EXCHANGE_FAILED')
  if (typeof delegated.access_token !== 'string' || !delegated.access_token) fail('DEV014_LOGIN_FIXTURE_DWD_EXCHANGE_FAILED')
  return async (userKey, expectedEmail) => {
    const response = await fetchImpl(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(userKey)}?projection=full`, {
      headers: { Authorization: `Bearer ${delegated.access_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    const body = await jsonResponse(response, 'DEV014_LOGIN_FIXTURE_DIRECTORY_READ_FAILED')
    const user = {
      customerId: String(body.customerId ?? '').trim(),
      userId: String(body.id ?? '').trim(),
      primaryEmail: normalizedEmail(body.primaryEmail),
      suspended: body.suspended === true,
      archived: body.archived === true,
      etag: typeof body.etag === 'string' && body.etag ? body.etag : null,
    }
    if (!user.userId || user.customerId !== TARGET.directoryCustomerId || user.primaryEmail !== expectedEmail || user.suspended || user.archived) {
      fail('DEV014_LOGIN_FIXTURE_DIRECTORY_IDENTITY_INVALID')
    }
    return user
  }
}

function sameDirectoryUser(left, right) {
  return left.customerId === right.customerId && left.userId === right.userId && left.primaryEmail === right.primaryEmail && left.etag === right.etag
}

function readModel(row) {
  return {
    employeeId: String(row.employee_id ?? ''),
    employeeStatus: String(row.employee_status ?? ''),
    employeeNumber: String(row.employee_number ?? ''),
    identityState: String(row.identity_state ?? ''),
    registryRevision: String(row.registry_revision ?? ''),
    admissionEnabled: row.admission_enabled === true,
  }
}

async function readEmployee(database, fixture) {
  return readModel(one((await database.query(
    'SELECT * FROM orgmaster_core.read_employee_managed_identity_v1($1)',
    [fixture.employeeId],
  )).rows, 'DEV014_LOGIN_FIXTURE_EMPLOYEE_MISSING'))
}

async function readAlias(database, fixture) {
  const rows = (await database.query('SELECT * FROM orgmaster_core.resolve_managed_login_alias_v1($1)', [fixture.employeeNumber])).rows
  if (!Array.isArray(rows) || rows.length > 1) fail('DEV014_LOGIN_FIXTURE_ALIAS_READBACK_INVALID')
  return rows[0] ?? null
}

async function assignFixture(database, fixture, operation, now) {
  let detail = await readEmployee(database, fixture)
  if (detail.employeeId !== fixture.employeeId || !['active', 'inactive'].includes(detail.employeeStatus)
    || !detail.admissionEnabled || !/^\d+$/u.test(detail.registryRevision)
    || (detail.employeeNumber && detail.employeeNumber !== fixture.employeeNumber)
    || !['not_linked', 'directory_linked_pending_auth', 'active'].includes(detail.identityState)) {
    fail('DEV014_LOGIN_FIXTURE_ASSIGN_PREFLIGHT_INVALID')
  }
  const existingAlias = await readAlias(database, fixture)
  if (existingAlias) {
    if (String(existingAlias.employee_id) !== fixture.employeeId || String(existingAlias.employee_number) !== fixture.employeeNumber) {
      fail('DEV014_LOGIN_FIXTURE_ALIAS_COLLISION')
    }
    return { alias: fixture.alias, disposition: 'REPLAY', employeeId: fixture.employeeId, employeeNumber: fixture.employeeNumber, employeeStatus: detail.employeeStatus, linkState: String(existingAlias.link_state), registryRevision: String(existingAlias.registry_revision) }
  }
  if (detail.identityState !== 'not_linked') fail('DEV014_LOGIN_FIXTURE_ASSIGN_IDENTITY_STATE_INVALID')
  let disposition = 'EXISTING'
  if (!detail.employeeNumber) {
    const assigned = one((await database.query(
      'SELECT * FROM orgmaster_core.assign_employee_number_v1($1,$2,$3,$4,$5,$6)',
      [fixture.employeeId, fixture.employeeNumber, ACTOR, operation.workspaceRevision, detail.registryRevision, now],
    )).rows, 'DEV014_LOGIN_FIXTURE_ASSIGN_FAILED')
    if (!['applied', 'noop'].includes(String(assigned.disposition))) fail('DEV014_LOGIN_FIXTURE_ASSIGN_INVALID')
    disposition = String(assigned.disposition).toUpperCase()
    detail = await readEmployee(database, fixture)
  }
  if (detail.employeeNumber !== fixture.employeeNumber || detail.identityState !== 'not_linked') fail('DEV014_LOGIN_FIXTURE_ASSIGN_READBACK_INVALID')
  return { alias: fixture.alias, disposition, employeeId: fixture.employeeId, employeeNumber: fixture.employeeNumber, employeeStatus: detail.employeeStatus, linkState: detail.identityState, registryRevision: detail.registryRevision }
}

async function linkFixture(database, readDirectoryUser, fixture, operation) {
  const expectedEmail = normalizedEmail(fixture.primaryEmail)
  const directoryUser = await readDirectoryUser(expectedEmail, expectedEmail)
  let detail = await readEmployee(database, fixture)
  if (detail.employeeId !== fixture.employeeId || detail.employeeStatus !== 'active' || !detail.admissionEnabled
    || detail.employeeNumber !== fixture.employeeNumber || !/^\d+$/u.test(detail.registryRevision)) {
    fail('DEV014_LOGIN_FIXTURE_LINK_PREFLIGHT_INVALID')
  }
  const existingAlias = await readAlias(database, fixture)
  if (existingAlias) {
    if (String(existingAlias.employee_id) !== fixture.employeeId || String(existingAlias.employee_number) !== fixture.employeeNumber
      || String(existingAlias.directory_customer_id) !== directoryUser.customerId || String(existingAlias.directory_user_id) !== directoryUser.userId
      || !['directory_linked_pending_auth', 'active'].includes(String(existingAlias.link_state))) fail('DEV014_LOGIN_FIXTURE_REPLAY_MISMATCH')
    return {
      alias: fixture.alias,
      disposition: 'REPLAY',
      employeeId: fixture.employeeId,
      employeeNumber: fixture.employeeNumber,
      employeeStatus: detail.employeeStatus,
      linkState: String(existingAlias.link_state),
      registryRevision: String(existingAlias.registry_revision),
      primaryEmailSha256: sha256(expectedEmail),
      directoryUserIdSha256: sha256(directoryUser.userId),
    }
  }
  if (detail.identityState !== 'not_linked') fail('DEV014_LOGIN_FIXTURE_LINK_ZERO_STATE_REQUIRED')
  const leased = one((await database.query(
    'SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [fixture.employeeId, fixture.employeeNumber, expectedEmail, directoryUser.customerId, directoryUser.userId, directoryUser.primaryEmail, directoryUser.etag, operation.workspaceRevision, detail.registryRevision, ACTOR],
  )).rows, 'DEV014_LOGIN_FIXTURE_LEASE_FAILED')
  const candidateToken = String(leased.candidate_token ?? '')
  if (!candidateToken || String(leased.directory_customer_id) !== directoryUser.customerId || String(leased.directory_user_id) !== directoryUser.userId) fail('DEV014_LOGIN_FIXTURE_LEASE_INVALID')
  const live = await readDirectoryUser(directoryUser.userId, expectedEmail)
  if (!sameDirectoryUser(directoryUser, live)) fail('DEV014_LOGIN_FIXTURE_DIRECTORY_CHANGED')
  const commandId = `${operation.operationId}-${fixture.alias.toUpperCase()}`
  const confirmation = one((await database.query(
    'SELECT orgmaster_core.read_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6) AS result',
    [commandId, fixture.employeeId, candidateToken, operation.workspaceRevision, detail.registryRevision, ACTOR],
  )).rows, 'DEV014_LOGIN_FIXTURE_CONFIRMATION_READ_FAILED').result
  if (!confirmation || confirmation.kind !== 'candidate' || confirmation.snapshot?.directoryCustomerId !== directoryUser.customerId
    || confirmation.snapshot?.directoryUserId !== directoryUser.userId || normalizedEmail(confirmation.snapshot?.primaryEmail) !== expectedEmail) {
    fail('DEV014_LOGIN_FIXTURE_CONFIRMATION_INVALID')
  }
  await database.query(
    'SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1($1,$2,$3,$4,$5,$6)',
    [commandId, fixture.employeeId, candidateToken, operation.workspaceRevision, detail.registryRevision, ACTOR],
  )
  const readback = await readAlias(database, fixture)
  if (!readback || String(readback.employee_id) !== fixture.employeeId
    || String(readback.directory_customer_id) !== directoryUser.customerId || String(readback.directory_user_id) !== directoryUser.userId
    || String(readback.link_state) !== 'directory_linked_pending_auth') fail('DEV014_LOGIN_FIXTURE_LINK_READBACK_INVALID')
  detail = await readEmployee(database, fixture)
  return {
    alias: fixture.alias,
    disposition: 'APPLIED',
    employeeId: fixture.employeeId,
    employeeNumber: fixture.employeeNumber,
    employeeStatus: detail.employeeStatus,
    linkState: String(readback.link_state),
    registryRevision: String(readback.registry_revision),
    primaryEmailSha256: sha256(expectedEmail),
    directoryUserIdSha256: sha256(directoryUser.userId),
  }
}

async function readbackFixture(database, fixture) {
  const detail = await readEmployee(database, fixture)
  const alias = await readAlias(database, fixture)
  if (detail.employeeId !== fixture.employeeId || (detail.employeeNumber && detail.employeeNumber !== fixture.employeeNumber)
    || alias && String(alias.employee_id) !== fixture.employeeId) fail('DEV014_LOGIN_FIXTURE_READBACK_INVALID')
  return {
    alias: fixture.alias,
    disposition: 'READBACK',
    employeeId: fixture.employeeId,
    employeeNumber: detail.employeeNumber || null,
    employeeStatus: detail.employeeStatus,
    linkState: alias ? String(alias.link_state) : detail.identityState,
    registryRevision: detail.registryRevision,
  }
}

async function readActiveArtifact(database, artifactKey, artifactKind, code) {
  const row = one((await database.query(
    'SELECT artifact_key, artifact_kind, payload, canonical_sha256, source_revision FROM orgmaster_core.read_active_persistence_artifact_v1($1)',
    [artifactKey],
  )).rows, code)
  if (String(row.artifact_key) !== artifactKey || String(row.artifact_kind) !== artifactKind
    || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) fail(code)
  return {
    payload: row.payload,
    revision: String(row.canonical_sha256 ?? '').trim(),
    sourceRevision: String(row.source_revision ?? '').trim(),
  }
}

async function readCurrentWorkspace(database) {
  const manifest = await readActiveArtifact(database, 'orgmaster-workspace.v1.json', 'workspace-manifest', 'DEV014_LOGIN_FIXTURE_WORKSPACE_INVALID')
  const currentVersionId = String(manifest.payload.currentVersionId ?? '')
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(currentVersionId)) fail('DEV014_LOGIN_FIXTURE_WORKSPACE_INVALID')
  const artifactKey = `orgmaster-versions/${currentVersionId}.json`
  const current = await readActiveArtifact(database, artifactKey, 'workspace-version', 'DEV014_LOGIN_FIXTURE_WORKSPACE_INVALID')
  if (current.payload.app !== 'OrgMaster' || current.payload.kind !== 'document'
    || !current.payload.state || typeof current.payload.state !== 'object'
    || !Array.isArray(current.payload.state.employees)) fail('DEV014_LOGIN_FIXTURE_WORKSPACE_INVALID')
  return { artifactKey, currentVersionId, current }
}

async function activateFixtures(database, operation, now) {
  const { artifactKey, current } = await readCurrentWorkspace(database)
  if (current.revision !== operation.workspaceRevision) fail('DEV014_LOGIN_FIXTURE_WORKSPACE_REVISION_CONFLICT')

  const employees = current.payload.state.employees
  const targets = FIXTURES.map((fixture) => {
    const matches = employees.filter((employee) => employee && employee.id === fixture.employeeId)
    if (matches.length !== 1 || matches[0].name !== `DEV014 Free ${fixture.alias === 'dev014-fp-google' ? 'Google' : 'Number'}`
      || !['active', 'inactive'].includes(matches[0].status)) fail('DEV014_LOGIN_FIXTURE_ACTIVATE_TARGET_INVALID')
    return { fixture, employee: matches[0] }
  })
  if (targets.every(({ employee }) => employee.status === 'active')) {
    return targets.map(({ fixture }) => ({ alias: fixture.alias, disposition: 'REPLAY', employeeId: fixture.employeeId, employeeNumber: fixture.employeeNumber, employeeStatus: 'active', workspaceRevision: current.revision }))
  }
  if (!targets.every(({ employee }) => employee.status === 'inactive')) fail('DEV014_LOGIN_FIXTURE_ACTIVATE_PARTIAL_STATE')

  for (const { fixture } of targets) {
    const check = one((await database.query(
      'SELECT allowed, correction_required FROM orgmaster_core.assert_employee_activation_v1($1,$2)',
      [fixture.employeeId, operation.workspaceRevision],
    )).rows, 'DEV014_LOGIN_FIXTURE_ACTIVATION_FENCE_FAILED')
    if (check.allowed !== true || check.correction_required === true) fail('DEV014_LOGIN_FIXTURE_ACTIVATION_FENCE_REJECTED')
  }

  const nextPayload = structuredClone(current.payload)
  nextPayload.savedAt = now.toISOString()
  for (const fixture of FIXTURES) nextPayload.state.employees.find((employee) => employee.id === fixture.employeeId).status = 'active'
  const raw = `${JSON.stringify(nextPayload, null, 2)}\n`
  const change = {
    artifactKey,
    artifactKind: 'workspace-version',
    payload: nextPayload,
    expectedCanonicalSha256: current.revision,
    nextCanonicalSha256: sha256(canonicalJson(nextPayload)),
    sourceSha256: sha256(raw),
    sourceBytes: Buffer.byteLength(raw),
  }
  const authority = one((await database.query('SELECT authority_version, source_revision FROM orgmaster_core.read_active_persistence_authority_v1()')).rows, 'DEV014_LOGIN_FIXTURE_AUTHORITY_INVALID')
  const previousSourceRevision = String(authority.source_revision ?? '').trim()
  if (!H64.test(previousSourceRevision)) fail('DEV014_LOGIN_FIXTURE_AUTHORITY_INVALID')
  const { payload: _payload, ...metadata } = change
  const nextSourceRevision = sha256(canonicalJson({ previousSourceRevision, changes: [metadata] }))
  const written = one((await database.query(
    'SELECT authority_version, source_revision, outbox_count FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,$3,$4,$5,$6::jsonb)',
    [JSON.stringify([change]), nextSourceRevision, ACTOR, 'dev014_login_fixture_activate', operation.operationId, '[]'],
  )).rows, 'DEV014_LOGIN_FIXTURE_ACTIVATE_WRITE_FAILED')
  if (String(written.source_revision ?? '').trim() !== nextSourceRevision || Number(written.outbox_count) !== 0) fail('DEV014_LOGIN_FIXTURE_ACTIVATE_WRITE_INVALID')

  const readback = []
  for (const fixture of FIXTURES) {
    const detail = await readEmployee(database, fixture)
    if (detail.employeeStatus !== 'active' || detail.employeeNumber !== fixture.employeeNumber || !detail.admissionEnabled) fail('DEV014_LOGIN_FIXTURE_ACTIVATE_READBACK_INVALID')
    readback.push({ alias: fixture.alias, disposition: 'APPLIED', employeeId: fixture.employeeId, employeeNumber: fixture.employeeNumber, employeeStatus: 'active', workspaceRevision: change.nextCanonicalSha256 })
  }
  return readback
}

export async function executeFixturePhase({ database, readDirectoryUser, operation, now = new Date() }) {
  if (Date.parse(operation.deadlineAt) <= now.getTime() || Date.parse(operation.deadlineAt) > now.getTime() + 8 * 60 * 60 * 1_000) fail('DEV014_LOGIN_FIXTURE_DEADLINE_INVALID')
  if (operation.phase === 'activate') return activateFixtures(database, operation, now)
  const results = []
  const workspace = operation.phase === 'readback' ? await readCurrentWorkspace(database) : null
  for (const fixture of FIXTURES) {
    if (operation.phase === 'assign') results.push(await assignFixture(database, fixture, operation, now))
    else if (operation.phase === 'link') {
      if (!readDirectoryUser) fail('DEV014_LOGIN_FIXTURE_DIRECTORY_READER_REQUIRED')
      results.push(await linkFixture(database, readDirectoryUser, fixture, operation))
    } else results.push({
      ...await readbackFixture(database, fixture),
      workspaceVersionId: workspace.currentVersionId,
      workspaceRevision: workspace.current.revision,
    })
  }
  return results
}

export async function executeFixtureTransaction({ database, readDirectoryUser, operation, now = new Date() }) {
  await database.query('BEGIN')
  try {
    const fixtures = await executeFixturePhase({ database, readDirectoryUser, operation, now })
    await database.query('COMMIT')
    return fixtures
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

function databaseOptions(environment, token) {
  return {
    host: environment.POSTGRES_SOCKET,
    database: environment.POSTGRES_DATABASE,
    user: environment.POSTGRES_IAM_LOGIN,
    password: token,
    ssl: false,
    application_name: 'dev014-orgmaster-production-login-fixture',
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client, now = new Date() } = {}) {
  const operation = parseArgs(argv)
  assertEnvironment(environment, operation)
  await metadataServiceAccountEmail(fetchImpl)
  const sourceToken = await metadataAccessToken(fetchImpl)
  const readDirectoryUser = operation.phase === 'link' ? await createDirectoryReader({ sourceToken, fetchImpl, now: () => now.getTime() }) : null
  const database = new Client(databaseOptions(environment, sourceToken))
  await database.connect()
  try {
    const fixtures = await executeFixtureTransaction({ database, readDirectoryUser, operation, now })
    return {
      schemaVersion: 'jenfu.dev014.orgmaster-production-login-fixture-receipt.v1',
      status: 'PASS',
      operationId: operation.operationId,
      phase: operation.phase,
      sourceRevision: operation.sourceRevision,
      target: { projectId: TARGET.projectId, projectNumber: TARGET.projectNumber, region: TARGET.region, instance: TARGET.instance, database: TARGET.database },
      fixtures,
      completedAt: now.toISOString(),
    }
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => {
    process.stderr.write(`${error.code || error.message}\n`)
    process.exitCode = 1
  })
}
