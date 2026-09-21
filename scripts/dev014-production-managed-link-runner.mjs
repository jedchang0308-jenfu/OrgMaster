#!/usr/bin/env node
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { metadataAccessToken } from './lib/dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const OPERATION_ID = /^DEV014-MANAGED-LINK-[A-Z0-9-]{8,120}$/u
const ACTOR = 'dev014-production-managed-link'
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
  employeeId: 'employee-shijie',
  employeeNumber: 'JFS0005',
  primaryEmail: 'jedchang0308@jenfu.com.tw',
})

function fail(code) { throw new Error(code) }
function sha256(value) { return createHash('sha256').update(String(value), 'utf8').digest('hex') }
function one(rows, code) { if (!Array.isArray(rows) || rows.length !== 1) fail(code); return rows[0] }
function normalizedEmail(value) { return String(value ?? '').trim().toLowerCase() }

export function parseArgs(argv) {
  const names = new Set(['--operation-id', '--source-revision', '--workspace-revision', '--deadline-at'])
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const next = argv[index + 1]
    if (!names.has(key) || !next) fail('DEV014_MANAGED_LINK_ARGUMENT_INVALID')
    const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    if (value[name]) fail('DEV014_MANAGED_LINK_ARGUMENT_INVALID')
    value[name] = next
  }
  if (Object.keys(value).length !== names.size || !OPERATION_ID.test(value.operationId ?? '')
    || !H40.test(value.sourceRevision ?? '') || typeof value.workspaceRevision !== 'string' || !value.workspaceRevision.trim()
    || !Number.isFinite(Date.parse(value.deadlineAt ?? ''))) fail('DEV014_MANAGED_LINK_ARGUMENT_INVALID')
  return value
}

export function assertEnvironment(environment, operation) {
  if (environment.GOOGLE_CLOUD_PROJECT !== TARGET.projectId
    || environment.GOOGLE_CLOUD_REGION !== TARGET.region
    || environment.OWNER_APPLICATION_ID !== 'orgmaster'
    || environment.POSTGRES_DATABASE !== TARGET.database
    || environment.POSTGRES_IAM_LOGIN !== TARGET.runtimeDbLogin
    || environment.OWNER_SOURCE_REVISION !== operation.sourceRevision
    || environment.POSTGRES_SOCKET !== `/cloudsql/${TARGET.projectId}:${TARGET.region}:${TARGET.instance}`) fail('DEV014_MANAGED_LINK_TARGET_INVALID')
}

async function metadataServiceAccountEmail(fetchImpl) {
  const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
  if (!response.ok) fail('DEV014_MANAGED_LINK_RUNTIME_IDENTITY_UNAVAILABLE')
  const email = (await response.text()).trim().toLowerCase()
  if (email !== TARGET.runtimeServiceAccount) fail('DEV014_MANAGED_LINK_RUNTIME_IDENTITY_INVALID')
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
  const signed = await jsonResponse(signResponse, 'DEV014_MANAGED_LINK_DWD_SIGN_FAILED')
  if (typeof signed.signedJwt !== 'string' || !signed.signedJwt) fail('DEV014_MANAGED_LINK_DWD_SIGN_FAILED')
  const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signed.signedJwt }).toString(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const delegated = await jsonResponse(tokenResponse, 'DEV014_MANAGED_LINK_DWD_EXCHANGE_FAILED')
  if (typeof delegated.access_token !== 'string' || !delegated.access_token) fail('DEV014_MANAGED_LINK_DWD_EXCHANGE_FAILED')
  return async (userKey) => {
    const response = await fetchImpl(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(userKey)}?projection=full`, {
      headers: { Authorization: `Bearer ${delegated.access_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    const body = await jsonResponse(response, 'DEV014_MANAGED_LINK_DIRECTORY_READ_FAILED')
    const user = {
      customerId: String(body.customerId ?? '').trim(),
      userId: String(body.id ?? '').trim(),
      primaryEmail: normalizedEmail(body.primaryEmail),
      suspended: body.suspended === true,
      archived: body.archived === true,
      etag: typeof body.etag === 'string' && body.etag ? body.etag : null,
    }
    if (!user.userId || user.customerId !== TARGET.directoryCustomerId || user.primaryEmail !== TARGET.primaryEmail || user.suspended || user.archived) fail('DEV014_MANAGED_LINK_DIRECTORY_IDENTITY_INVALID')
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

export async function executeManagedLink({ database, readDirectoryUser, operation, now = new Date() }) {
  if (Date.parse(operation.deadlineAt) <= now.getTime() || Date.parse(operation.deadlineAt) > now.getTime() + 8 * 60 * 60 * 1_000) fail('DEV014_MANAGED_LINK_DEADLINE_INVALID')
  const directoryUser = await readDirectoryUser(TARGET.primaryEmail)
  let detail = readModel(one((await database.query('SELECT * FROM orgmaster_core.read_employee_managed_identity_v1($1)', [TARGET.employeeId])).rows, 'DEV014_MANAGED_LINK_EMPLOYEE_MISSING'))
  if (detail.employeeId !== TARGET.employeeId || detail.employeeStatus !== 'active' || !detail.admissionEnabled
    || (detail.employeeNumber && detail.employeeNumber !== TARGET.employeeNumber)
    || (!detail.employeeNumber && detail.registryRevision !== '0')
    || (detail.employeeNumber && detail.registryRevision === '0')) fail('DEV014_MANAGED_LINK_PREFLIGHT_INVALID')

  const existingRows = (await database.query('SELECT * FROM orgmaster_core.resolve_managed_login_alias_v1($1)', [TARGET.employeeNumber])).rows
  if (existingRows.length > 1) fail('DEV014_MANAGED_LINK_READBACK_INVALID')
  if (existingRows.length === 1) {
    const existing = existingRows[0]
    if (String(existing.employee_id) !== TARGET.employeeId || String(existing.employee_number) !== TARGET.employeeNumber
      || String(existing.directory_customer_id) !== directoryUser.customerId || String(existing.directory_user_id) !== directoryUser.userId
      || !['directory_linked_pending_auth', 'active'].includes(String(existing.link_state))) fail('DEV014_MANAGED_LINK_REPLAY_MISMATCH')
    return {
      disposition: 'REPLAY',
      employeeNumberDisposition: 'EXISTING',
      linkState: String(existing.link_state),
      registryRevision: String(existing.registry_revision),
      principalIdSha256: sha256(existing.principal_id),
      directoryCustomerIdSha256: sha256(directoryUser.customerId),
      directoryUserIdSha256: sha256(directoryUser.userId),
    }
  }
  if (detail.identityState !== 'not_linked') fail('DEV014_MANAGED_LINK_ZERO_STATE_REQUIRED')

  let employeeNumberDisposition = 'EXISTING'
  if (!detail.employeeNumber) {
    const assigned = one((await database.query(
      'SELECT * FROM orgmaster_core.assign_employee_number_v1($1,$2,$3,$4,$5,$6)',
      [TARGET.employeeId, TARGET.employeeNumber, ACTOR, operation.workspaceRevision, detail.registryRevision, now],
    )).rows, 'DEV014_MANAGED_LINK_EMPLOYEE_NUMBER_ASSIGNMENT_FAILED')
    if (String(assigned.disposition) !== 'applied' || String(assigned.assignment?.employee_id) !== TARGET.employeeId
      || String(assigned.assignment?.employee_number) !== TARGET.employeeNumber || String(assigned.revision) === '0') {
      fail('DEV014_MANAGED_LINK_EMPLOYEE_NUMBER_ASSIGNMENT_INVALID')
    }
    employeeNumberDisposition = 'APPLIED'
    detail = readModel(one((await database.query('SELECT * FROM orgmaster_core.read_employee_managed_identity_v1($1)', [TARGET.employeeId])).rows, 'DEV014_MANAGED_LINK_EMPLOYEE_MISSING'))
  }
  if (detail.employeeNumber !== TARGET.employeeNumber || detail.registryRevision === '0' || detail.identityState !== 'not_linked') {
    fail('DEV014_MANAGED_LINK_EMPLOYEE_NUMBER_READBACK_INVALID')
  }

  const leased = one((await database.query(
    'SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [TARGET.employeeId, TARGET.employeeNumber, TARGET.primaryEmail, directoryUser.customerId, directoryUser.userId, directoryUser.primaryEmail, directoryUser.etag, operation.workspaceRevision, detail.registryRevision, ACTOR],
  )).rows, 'DEV014_MANAGED_LINK_LEASE_FAILED')
  const candidateToken = String(leased.candidate_token ?? '')
  if (!candidateToken || String(leased.directory_customer_id) !== directoryUser.customerId || String(leased.directory_user_id) !== directoryUser.userId) fail('DEV014_MANAGED_LINK_LEASE_INVALID')

  const live = await readDirectoryUser(directoryUser.userId)
  if (!sameDirectoryUser(directoryUser, live)) fail('DEV014_MANAGED_LINK_DIRECTORY_CHANGED')
  const confirmation = one((await database.query(
    'SELECT orgmaster_core.read_managed_identity_candidate_v1($1,$2,$3,$4,$5,$6) AS result',
    [operation.operationId, TARGET.employeeId, candidateToken, operation.workspaceRevision, detail.registryRevision, ACTOR],
  )).rows, 'DEV014_MANAGED_LINK_CONFIRMATION_READ_FAILED').result
  if (!confirmation || confirmation.kind !== 'candidate' || confirmation.snapshot?.directoryCustomerId !== directoryUser.customerId
    || confirmation.snapshot?.directoryUserId !== directoryUser.userId || normalizedEmail(confirmation.snapshot?.primaryEmail) !== TARGET.primaryEmail) fail('DEV014_MANAGED_LINK_CONFIRMATION_INVALID')

  const confirmed = one((await database.query(
    'SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1($1,$2,$3,$4,$5,$6)',
    [operation.operationId, TARGET.employeeId, candidateToken, operation.workspaceRevision, detail.registryRevision, ACTOR],
  )).rows, 'DEV014_MANAGED_LINK_CONFIRM_FAILED')
  const readback = one((await database.query('SELECT * FROM orgmaster_core.resolve_managed_login_alias_v1($1)', [TARGET.employeeNumber])).rows, 'DEV014_MANAGED_LINK_READBACK_INVALID')
  if (String(confirmed.employee_id) !== TARGET.employeeId || String(readback.employee_id) !== TARGET.employeeId
    || String(readback.directory_customer_id) !== directoryUser.customerId || String(readback.directory_user_id) !== directoryUser.userId
    || String(readback.link_state) !== 'directory_linked_pending_auth') fail('DEV014_MANAGED_LINK_READBACK_INVALID')
  return {
    disposition: 'APPLIED',
    employeeNumberDisposition,
    linkState: String(readback.link_state),
    registryRevision: String(readback.registry_revision),
    principalIdSha256: sha256(readback.principal_id),
    directoryCustomerIdSha256: sha256(directoryUser.customerId),
    directoryUserIdSha256: sha256(directoryUser.userId),
  }
}

function databaseOptions(environment, token) {
  return {
    host: environment.POSTGRES_SOCKET,
    database: environment.POSTGRES_DATABASE,
    user: environment.POSTGRES_IAM_LOGIN,
    password: token,
    ssl: false,
    application_name: 'dev014-orgmaster-production-managed-link',
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
  const readDirectoryUser = await createDirectoryReader({ sourceToken, fetchImpl, now: () => now.getTime() })
  const database = new Client(databaseOptions(environment, sourceToken))
  await database.connect()
  try {
    const result = await executeManagedLink({ database, readDirectoryUser, operation, now })
    return {
      schemaVersion: 'jenfu.dev014.orgmaster-production-managed-link-receipt.v1',
      status: 'PASS',
      operationId: operation.operationId,
      sourceRevision: operation.sourceRevision,
      target: { projectId: TARGET.projectId, projectNumber: TARGET.projectNumber, region: TARGET.region, instance: TARGET.instance, database: TARGET.database, employeeId: TARGET.employeeId, employeeNumber: TARGET.employeeNumber },
      primaryEmailSha256: sha256(TARGET.primaryEmail),
      ...result,
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
