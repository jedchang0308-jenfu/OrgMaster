import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const EXPECTED_PROJECT_NUMBER = '9536592944'
const EXPECTED_RUNTIME_SERVICE_ACCOUNT = 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'
const SIGNER_SERVICE_ACCOUNT = 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com'
const DELEGATED_SUBJECT = 'jedchang0308@jenfu.com.tw'
const EXPECTED_CUSTOMER_ID = 'C015t4buc'
const EXPECTED_DOMAIN = 'jenfu.com.tw'
const DIRECTORY_READ_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const IAM_CREDENTIALS_URL = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'
const DIRECTORY_USER_URL = 'https://admin.googleapis.com/admin/directory/v1/users/'
const REQUEST_TIMEOUT_MS = 5_000
const RESPONSE_BYTE_LIMITS = Object.freeze({
  runtime_metadata: 256,
  metadata_access_token: 16_384,
  sign_jwt: 32_768,
  oauth_exchange: 16_384,
  users_get: 65_536
})
const MAX_OPERATION_WINDOW_MS = 8 * 60 * 60 * 1_000
const DWD_ASSERTION_LIFETIME_SECONDS = 3_600

const EXPECTED_RUNTIME_FINGERPRINT = sha256(EXPECTED_PROJECT_NUMBER + '\0' + EXPECTED_RUNTIME_SERVICE_ACCOUNT.toLowerCase())
const KNOWN_CREDENTIAL_ALIASES = new Set([
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON_FILE',
  'GOOGLE_CLOUD_KEYFILE_JSON',
  'GOOGLE_CLOUD_KEY_FILE',
  'GOOGLE_SERVICE_ACCOUNT',
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_AUTH_CREDENTIALS',
  'GOOGLE_AUTH_CREDENTIALS_JSON',
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'GOOGLE_ACCESS_TOKEN',
  'GCLOUD_KEYFILE_JSON',
  'GCLOUD_KEY_FILE',
  'GCLOUD_SERVICE_ACCOUNT',
  'GCLOUD_SERVICE_ACCOUNT_KEY',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'CLOUDSDK_CONFIG',
  'CLOUDSDK_CORE_ACCOUNT',
  'CLOUDSDK_CORE_PROJECT',
  'GCP_CREDENTIALS',
  'GCP_SERVICE_ACCOUNT',
  'GCP_SERVICE_ACCOUNT_KEY',
  'GCP_ACCESS_TOKEN',
  'GCP_API_KEY'
])

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

class CanaryFailure extends Error {
  constructor(phase, status, retryClass, httpStatus = null) {
    super('canary_failure')
    this.phase = phase
    this.status = status
    this.retryClass = retryClass
    this.httpStatus = httpStatus
  }
}

function fail(phase, status, retryClass = 'non_retryable', httpStatus = null) {
  throw new CanaryFailure(phase, status, retryClass, httpStatus)
}

function safeReceipt(input = {}) {
  return {
    schema: 'dev014.directory-readback-canary.v1',
    operationIdHash: input.operationId ? sha256(input.operationId) : null,
    sourceRevisionHash: input.sourceRevision ? sha256(input.sourceRevision) : null,
    sourceFingerprint: input.sourceRevision ? sha256('orgmaster-source:' + input.sourceRevision) : null,
    runtimeFingerprint: EXPECTED_RUNTIME_FINGERPRINT,
    observedRuntimeFingerprint: null,
    phase: 'arguments',
    status: 'FAILED',
    retryClass: 'non_retryable',
    httpStatus: null,
    matches: {
      projectNumber: false,
      serviceAccount: false,
      customerId: false,
      domain: false,
      primaryEmail: false,
      userIdPresent: false
    },
    suspended: null,
    archived: null,
    credentialMaterialCaptured: false,
    directoryReadOperations: 0,
    databaseOperations: 0,
    mutationOperations: 0
  }
}

function parseArguments(argv, nowMs) {
  const names = new Set(['--operation-id', '--source-revision', '--expires-at'])
  if (!Array.isArray(argv) || argv.length !== 6) return null

  const values = Object.create(null)
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!names.has(name) || Object.hasOwn(values, name) || typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      return null
    }
    values[name] = value
  }
  if (Object.keys(values).length !== names.size) return null

  const operationId = values['--operation-id']
  const sourceRevision = values['--source-revision']
  const expiresAt = values['--expires-at']
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/.test(operationId)) return null
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(expiresAt)) return null

  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs - nowMs > MAX_OPERATION_WINDOW_MS) return null
  return { operationId, sourceRevision }
}

function hasCredentialAlias(env) {
  if (!env || typeof env !== 'object') return false
  return Object.keys(env).some((name) => {
    const upperName = name.toUpperCase()
    if (KNOWN_CREDENTIAL_ALIASES.has(upperName)) return true
    if (!/^(?:GOOGLE|GCLOUD|CLOUDSDK|GCP)_/.test(upperName)) return false
    return /(?:CREDENTIAL|KEYFILE|KEY_FILE|PRIVATE_KEY|SERVICE_ACCOUNT|IMPERSONATE|JWT|OAUTH.*TOKEN|ACCESS_TOKEN|API_KEY|CONFIG)/.test(upperName)
  })
}

function metadataUrl(path) {
  return 'http://metadata.google.internal/computeMetadata/v1/' + path
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function responseStatus(response, phase) {
  const status = response && Number.isInteger(response.status) ? response.status : 0
  if (status >= 200 && status < 300) return
  try {
    const pending = response && response.body && typeof response.body.cancel === 'function'
      ? response.body.cancel()
      : null
    if (pending && typeof pending.catch === 'function') pending.catch(() => {})
  } catch {}
  if (status === 429) fail(phase, 'rate_limited', 'retryable', status)
  if (status >= 500) fail(phase, 'upstream_error', 'retryable', status)
  if (status === 403) {
    const statusName = phase === 'sign_jwt'
      ? 'sign_denied'
      : phase === 'oauth_exchange'
        ? 'delegation_denied'
        : phase === 'users_get'
          ? 'directory_denied'
          : 'access_denied'
    fail(phase, statusName, 'non_retryable', status)
  }
  if (status === 404 && phase === 'users_get') fail(phase, 'not_found', 'non_retryable', status)
  if (status === 401) fail(phase, 'unauthorized', 'non_retryable', status)
  fail(phase, 'http_error', 'non_retryable', status || null)
}

async function readBoundedBody(response, phase) {
  const byteLimit = RESPONSE_BYTE_LIMITS[phase]
  const body = response && response.body
  if (!Number.isInteger(byteLimit) || !body || typeof body.getReader !== 'function') {
    fail(phase, 'invalid_response')
  }

  const reader = body.getReader()
  const chunks = []
  let totalBytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (!result || result.done) break
      const chunk = result.value
      if (!(chunk instanceof Uint8Array)) fail(phase, 'invalid_response')
      totalBytes += chunk.byteLength
      if (totalBytes > byteLimit) {
        try { await reader.cancel() } catch {}
        fail(phase, 'response_too_large')
      }
      chunks.push(chunk)
    }
  } finally {
    try { reader.releaseLock() } catch {}
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail(phase, 'invalid_response')
  }
}

async function request(fetchImpl, url, init, phase) {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new CanaryFailure(phase, 'timeout', 'retryable'))
    }, REQUEST_TIMEOUT_MS)
  })
  const operationPromise = Promise.resolve()
    .then(async () => {
      const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' })
      responseStatus(response, phase)
      const bodyText = await readBoundedBody(response, phase)
      return {
        status: response.status,
        async text() { return bodyText },
        async json() { return JSON.parse(bodyText) }
      }
    })
    .catch((error) => {
      if (error instanceof CanaryFailure) throw error
      if (timedOut || (error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
        throw new CanaryFailure(phase, 'timeout', 'retryable')
      }
      throw new CanaryFailure(phase, 'transport_error', 'retryable')
    })

  try {
    return await Promise.race([operationPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function responseText(response, phase) {
  try {
    const value = await response.text()
    if (typeof value !== 'string') fail(phase, 'invalid_response')
    return value
  } catch (error) {
    if (error instanceof CanaryFailure) throw error
    fail(phase, 'invalid_response')
  }
}

async function responseJson(response, phase) {
  try {
    const value = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(phase, 'invalid_response')
    return value
  } catch (error) {
    if (error instanceof CanaryFailure) throw error
    fail(phase, 'invalid_response')
  }
}

async function checkedText(response, phase) {
  responseStatus(response, phase)
  return responseText(response, phase)
}

async function checkedJson(response, phase) {
  responseStatus(response, phase)
  return responseJson(response, phase)
}

function currentSeconds(now) {
  const value = Number(now())
  if (!Number.isFinite(value)) fail('arguments', 'invalid_clock')
  return Math.floor(value / 1_000)
}

function runtimeFingerprint(projectNumber, serviceAccount) {
  const project = typeof projectNumber === 'string' ? projectNumber.trim().slice(0, 128) : ''
  const account = typeof serviceAccount === 'string' ? serviceAccount.trim().toLowerCase().slice(0, 256) : ''
  return sha256(project + '\0' + account)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

export async function runDirectoryReadbackCanary({
  argv,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const initialNow = Number(now())
  const parsed = Number.isFinite(initialNow) ? parseArguments(argv, initialNow) : null
  const receipt = safeReceipt(parsed ?? {})
  if (!parsed) {
    receipt.status = 'INVALID_ARGUMENTS'
    return receipt
  }
  if (typeof fetchImpl !== 'function') {
    receipt.status = 'FETCH_UNAVAILABLE'
    return receipt
  }

  try {
    receipt.phase = 'source_preflight'
    if (!env || typeof env.SOURCE_REVISION !== 'string' || env.SOURCE_REVISION !== parsed.sourceRevision) {
      fail(receipt.phase, 'source_revision_mismatch')
    }

    receipt.phase = 'credential_preflight'
    if (hasCredentialAlias(env)) fail(receipt.phase, 'credential_alias_rejected')

    receipt.phase = 'runtime_metadata'
    const projectNumber = (await checkedText(
      await request(fetchImpl, metadataUrl('project/numeric-project-id'), {
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google' }
      }, receipt.phase),
      receipt.phase
    )).trim()
    const serviceAccount = (await checkedText(
      await request(fetchImpl, metadataUrl('instance/service-accounts/default/email'), {
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google' }
      }, receipt.phase),
      receipt.phase
    )).trim()
    receipt.observedRuntimeFingerprint = runtimeFingerprint(projectNumber, serviceAccount)
    receipt.matches.projectNumber = projectNumber === EXPECTED_PROJECT_NUMBER
    receipt.matches.serviceAccount = normalizeEmail(serviceAccount) === EXPECTED_RUNTIME_SERVICE_ACCOUNT
    if (!receipt.matches.projectNumber || !receipt.matches.serviceAccount) {
      fail(receipt.phase, 'runtime_identity_mismatch')
    }

    receipt.phase = 'metadata_access_token'
    const metadataTokenBody = await checkedJson(
      await request(fetchImpl, metadataUrl('instance/service-accounts/default/token?scopes=' + encodeURIComponent(CLOUD_PLATFORM_SCOPE)), {
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google' }
      }, receipt.phase),
      receipt.phase
    )
    const metadataAccessToken = metadataTokenBody.access_token
    if (!isNonEmptyString(metadataAccessToken)) fail(receipt.phase, 'invalid_response')

    receipt.phase = 'sign_jwt'
    const issuedAt = currentSeconds(now)
    const claims = {
      iss: SIGNER_SERVICE_ACCOUNT,
      sub: DELEGATED_SUBJECT,
      scope: DIRECTORY_READ_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + DWD_ASSERTION_LIFETIME_SECONDS
    }
    const signerResponse = await checkedJson(
      await request(fetchImpl, IAM_CREDENTIALS_URL + encodeURIComponent(SIGNER_SERVICE_ACCOUNT) + ':signJwt', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + metadataAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payload: JSON.stringify(claims) })
      }, receipt.phase),
      receipt.phase
    )
    const signedJwt = signerResponse.signedJwt
    if (!isNonEmptyString(signedJwt)) fail(receipt.phase, 'invalid_response')

    receipt.phase = 'oauth_exchange'
    const tokenResponse = await checkedJson(
      await request(fetchImpl, OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: signedJwt
        }).toString()
      }, receipt.phase),
      receipt.phase
    )
    const directoryAccessToken = tokenResponse.access_token
    if (!isNonEmptyString(directoryAccessToken)) fail(receipt.phase, 'invalid_response')

    receipt.phase = 'users_get'
    const query = new URLSearchParams({
      projection: 'full',
      fields: 'id,primaryEmail,customerId,suspended,archived,etag'
    })
    const userUrl = DIRECTORY_USER_URL + encodeURIComponent(DELEGATED_SUBJECT) + '?' + query.toString()
    receipt.directoryReadOperations = 1
    const user = await checkedJson(
      await request(fetchImpl, userUrl, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + directoryAccessToken }
      }, receipt.phase),
      receipt.phase
    )

    const primaryEmail = normalizeEmail(user.primaryEmail)
    const domain = primaryEmail.includes('@') ? primaryEmail.slice(primaryEmail.lastIndexOf('@') + 1) : ''
    receipt.matches.customerId = user.customerId === EXPECTED_CUSTOMER_ID
    receipt.matches.domain = domain === EXPECTED_DOMAIN
    // The returned email is only a claim check; the users.get key above is always the fixed delegated subject.
    receipt.matches.primaryEmail = primaryEmail === normalizeEmail(DELEGATED_SUBJECT)
    receipt.matches.userIdPresent = isNonEmptyString(user.id)
    receipt.suspended = typeof user.suspended === 'boolean' ? user.suspended : null
    receipt.archived = typeof user.archived === 'boolean' ? user.archived : null

    const claimsMatch = Object.values(receipt.matches).every(Boolean)
    if (!claimsMatch) fail(receipt.phase, 'identity_claim_mismatch')
    if (receipt.suspended !== false || receipt.archived !== false) fail(receipt.phase, 'user_not_active')

    receipt.status = 'PASS'
    receipt.retryClass = 'none'
    return receipt
  } catch (error) {
    if (error instanceof CanaryFailure) {
      receipt.phase = error.phase
      receipt.status = error.status.toUpperCase()
      receipt.retryClass = error.retryClass
      receipt.httpStatus = error.httpStatus
      return receipt
    }
    receipt.phase = typeof receipt.phase === 'string' ? receipt.phase : 'internal'
    receipt.status = 'INTERNAL_ERROR'
    receipt.retryClass = 'unknown'
    return receipt
  }
}

function isDirectExecution() {
  const scriptPath = process.argv[1]
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) return false
  try {
    return import.meta.url === pathToFileURL(scriptPath).href
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  const receipt = await runDirectoryReadbackCanary({
    argv: process.argv.slice(2),
    env: process.env,
    fetchImpl: globalThis.fetch,
    now: Date.now
  })
  process.stdout.write(JSON.stringify(receipt) + '\n')
  if (receipt.status !== 'PASS') process.exitCode = 1
}