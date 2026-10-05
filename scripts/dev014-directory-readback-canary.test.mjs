import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runDirectoryReadbackCanary } from './dev014-directory-readback-canary.mjs'

const SOURCE_REVISION = '0123456789abcdef0123456789abcdef01234567'
const OPERATION_ID = 'DEV014-DWD-READBACK-20261005'
const NOW = Date.parse('2026-10-05T00:00:00.000Z')
const EXPIRY = '2026-10-05T01:00:00.000Z'
const FIXED_EMAIL = 'jedchang0308@jenfu.com.tw'
const SECRET_MARKERS = [
  'metadata-access-secret',
  'signed-jwt-secret',
  'directory-access-secret',
  'raw-provider-error-secret',
  FIXED_EMAIL,
  'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
  'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com'
]

function args(extra = []) {
  return [
    '--operation-id', OPERATION_ID,
    '--source-revision', SOURCE_REVISION,
    '--expires-at', EXPIRY,
    ...extra
  ]
}

function streamBody(text) {
  const bytes = new TextEncoder().encode(text)
  let read = false
  let cancelled = false
  return {
    async cancel() { cancelled = true },
    getReader() {
      return {
        async read() {
          if (cancelled || read) return { done: true, value: undefined }
          read = true
          return { done: false, value: bytes }
        },
        async cancel() { cancelled = true },
        releaseLock() {}
      }
    }
  }
}

function jsonResponse(body, status = 200) {
  return {
    status,
    async json() { return body },
    async text() { return JSON.stringify(body) },
    body: streamBody(JSON.stringify(body))
  }
}

function textResponse(body, status = 200) {
  return {
    status,
    async text() { return body },
    async json() { return { text: body } },
    body: streamBody(body)
  }
}

function userRecord(overrides = {}) {
  return {
    id: 'directory-user-id-private',
    primaryEmail: FIXED_EMAIL,
    customerId: 'C015t4buc',
    suspended: false,
    archived: false,
    etag: 'user-etag-private',
    ...overrides
  }
}

function makeFetch({ project = '9536592944', serviceAccount = 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', user = userRecord(), failures = {} } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (typeof failures[url] === 'function') return failures[url](url, init, calls)
    if (failures[url]) return failures[url]
    if (String(url).endsWith('/project/numeric-project-id')) return textResponse(project)
    if (String(url).endsWith('/instance/service-accounts/default/email')) return textResponse(serviceAccount)
    if (String(url).includes('/instance/service-accounts/default/token?')) return jsonResponse({ access_token: 'metadata-access-secret', expires_in: 300, token_type: 'Bearer' })
    if (String(url).endsWith(':signJwt')) return jsonResponse({ signedJwt: 'signed-jwt-secret' })
    if (String(url) === 'https://oauth2.googleapis.com/token') return jsonResponse({ access_token: 'directory-access-secret', expires_in: 3600, token_type: 'Bearer' })
    if (String(url).startsWith('https://admin.googleapis.com/admin/directory/v1/users/')) return jsonResponse(user)
    throw new Error('raw-provider-error-secret')
  }
  return { fetchImpl, calls }
}

function run(fetchImpl, options = {}) {
  return runDirectoryReadbackCanary({
    argv: options.argv ?? args(),
    env: options.env ?? { SOURCE_REVISION },
    fetchImpl,
    now: () => NOW
  })
}

test('happy path uses metadata identity, one-scope DWD and exactly one fixed users.get', async () => {
  const { fetchImpl, calls } = makeFetch()
  const receipt = await run(fetchImpl)

  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.phase, 'users_get')
  assert.equal(receipt.directoryReadOperations, 1)
  assert.equal(receipt.databaseOperations, 0)
  assert.equal(receipt.mutationOperations, 0)
  assert.equal(receipt.credentialMaterialCaptured, false)
  assert.deepEqual(receipt.matches, {
    projectNumber: true,
    serviceAccount: true,
    customerId: true,
    domain: true,
    primaryEmail: true,
    userIdPresent: true
  })
  assert.equal(receipt.suspended, false)
  assert.equal(receipt.archived, false)
  assert.equal(calls.length, 6)
  const userGetCalls = calls.filter((call) => call.url.startsWith('https://admin.googleapis.com/admin/directory/v1/users/'))
  assert.equal(userGetCalls.length, 1)
  const userGetCall = userGetCalls[0]
  assert.equal(userGetCall.init.method ?? 'GET', 'GET')
  const expectedUserGetUrl = 'https://admin.googleapis.com/admin/directory/v1/users/' +
    encodeURIComponent(FIXED_EMAIL) +
    '?projection=full&fields=id%2CprimaryEmail%2CcustomerId%2Csuspended%2Carchived%2Cetag'
  assert.equal(userGetCall.url, expectedUserGetUrl)
  assert.deepEqual([...new URL(userGetCall.url).searchParams.entries()], [
    ['projection', 'full'],
    ['fields', 'id,primaryEmail,customerId,suspended,archived,etag']
  ])

  const signCall = calls.find((call) => call.url.endsWith(':signJwt'))
  assert.equal(signCall.init.method, 'POST')
  const signedPayload = JSON.parse(JSON.parse(signCall.init.body).payload)
  assert.equal(signedPayload.sub, FIXED_EMAIL)
  assert.equal(signedPayload.scope, 'https://www.googleapis.com/auth/admin.directory.user.readonly')
  assert.equal(Object.keys(signedPayload).filter((key) => key === 'scope').length, 1)
  assert.equal(signCall.init.headers.Authorization, 'Bearer metadata-access-secret')
})

test('signJwt 403 is a safe non-retryable failure and does not read its body', async () => {
  const signUrl = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
    encodeURIComponent('orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com') + ':signJwt'
  let bodyRead = false
  const { fetchImpl } = makeFetch({
    failures: {
      [signUrl]: {
        status: 403,
        async json() { bodyRead = true; return { message: 'raw-provider-error-secret' } },
        async text() { bodyRead = true; return 'raw-provider-error-secret' },
        body: { async cancel() {} }
      }
    }
  })
  const receipt = await run(fetchImpl)
  assert.equal(receipt.phase, 'sign_jwt')
  assert.equal(receipt.status, 'SIGN_DENIED')
  assert.equal(receipt.retryClass, 'non_retryable')
  assert.equal(receipt.directoryReadOperations, 0)
  assert.equal(bodyRead, false)
  assert.equal(receipt.credentialMaterialCaptured, false)
  assert.equal(JSON.stringify(receipt).includes('raw-provider-error-secret'), false)
})

test('OAuth delegated token 403 is classified as delegation denial', async () => {
  const { fetchImpl } = makeFetch({
    failures: {
      'https://oauth2.googleapis.com/token': jsonResponse({ message: 'raw-provider-error-secret' }, 403)
    }
  })
  const receipt = await run(fetchImpl)
  assert.equal(receipt.phase, 'oauth_exchange')
  assert.equal(receipt.status, 'DELEGATION_DENIED')
  assert.equal(receipt.retryClass, 'non_retryable')
  assert.equal(receipt.directoryReadOperations, 0)
  assert.equal(receipt.credentialMaterialCaptured, false)
  assert.equal(JSON.stringify(receipt).includes('raw-provider-error-secret'), false)
})

test('429 is reported as retryable without retrying', async () => {
  const dirPrefix = 'https://admin.googleapis.com/admin/directory/v1/users/'
  let directoryCalls = 0
  const { fetchImpl } = makeFetch({
    failures: {
      [dirPrefix + encodeURIComponent(FIXED_EMAIL) + '?projection=full&fields=id%2CprimaryEmail%2CcustomerId%2Csuspended%2Carchived%2Cetag']: () => {
        directoryCalls += 1
        return jsonResponse({ message: 'raw-provider-error-secret' }, 429)
      }
    }
  })
  const receipt = await run(async (url, init) => {
    if (String(url).startsWith(dirPrefix)) {
      directoryCalls += 1
      return jsonResponse({ message: 'raw-provider-error-secret' }, 429)
    }
    return fetchImpl(url, init)
  })
  assert.equal(receipt.phase, 'users_get')
  assert.equal(receipt.status, 'RATE_LIMITED')
  assert.equal(receipt.retryClass, 'retryable')
  assert.equal(receipt.directoryReadOperations, 1)
  assert.equal(directoryCalls, 1)
})

test('headers-ready response body stall is aborted by the same bounded deadline', async () => {
  let aborted = false
  const { fetchImpl } = makeFetch()
  const receipt = await run((url, init) => {
    if (String(url).endsWith('/project/numeric-project-id')) {
      return Promise.resolve({
        status: 200,
        body: {
          async cancel() {},
          getReader() {
            return {
              read() {
                return new Promise((_, reject) => {
                  init.signal.addEventListener('abort', () => {
                    aborted = true
                    reject(new DOMException('raw-provider-error-secret', 'AbortError'))
                  }, { once: true })
                })
              },
              async cancel() {},
              releaseLock() {}
            }
          }
        }
      })
    }
    return fetchImpl(url, init)
  })
  assert.equal(aborted, true)
  assert.equal(receipt.phase, 'runtime_metadata')
  assert.equal(receipt.status, 'TIMEOUT')
  assert.equal(receipt.retryClass, 'retryable')
})

test('oversized metadata body is rejected before any later request', async () => {
  let calls = 0
  const receipt = await run((url) => {
    calls += 1
    if (String(url).endsWith('/project/numeric-project-id')) return textResponse('x'.repeat(257))
    throw new Error('raw-provider-error-secret')
  })
  assert.equal(receipt.phase, 'runtime_metadata')
  assert.equal(receipt.status, 'RESPONSE_TOO_LARGE')
  assert.equal(calls, 1)
})

test('SOURCE_REVISION must exist in the image environment and match the CLI argument', async (t) => {
  const { fetchImpl } = makeFetch()
  await t.test('missing', async () => {
    let calls = 0
    const receipt = await run(async () => { calls += 1; return textResponse('unused') }, { env: {} })
    assert.equal(receipt.phase, 'source_preflight')
    assert.equal(receipt.status, 'SOURCE_REVISION_MISMATCH')
    assert.equal(calls, 0)
  })
  await t.test('mismatch', async () => {
    let calls = 0
    const receipt = await run(async () => { calls += 1; return textResponse('unused') }, { env: { SOURCE_REVISION: 'f'.repeat(40) } })
    assert.equal(receipt.phase, 'source_preflight')
    assert.equal(receipt.status, 'SOURCE_REVISION_MISMATCH')
    assert.equal(calls, 0)
  })
  await t.test('matching', async () => {
    const receipt = await run(fetchImpl, { env: { SOURCE_REVISION } })
    assert.equal(receipt.status, 'PASS')
  })
})

test('fixed users.get 404 is reported as not found', async () => {
  const dirPrefix = 'https://admin.googleapis.com/admin/directory/v1/users/'
  const { fetchImpl } = makeFetch()
  const receipt = await run(async (url, init) => {
    if (String(url).startsWith(dirPrefix)) return jsonResponse({ message: 'raw-provider-error-secret' }, 404)
    return fetchImpl(url, init)
  })
  assert.equal(receipt.phase, 'users_get')
  assert.equal(receipt.status, 'NOT_FOUND')
  assert.equal(receipt.httpStatus, 404)
  assert.equal(receipt.directoryReadOperations, 1)
})

test('wrong runtime service account stops before metadata token and signing', async () => {
  const { fetchImpl, calls } = makeFetch({ serviceAccount: 'unexpected-runtime@other-project.iam.gserviceaccount.com' })
  const receipt = await run(fetchImpl)
  assert.equal(receipt.status, 'RUNTIME_IDENTITY_MISMATCH')
  assert.equal(receipt.phase, 'runtime_metadata')
  assert.equal(receipt.matches.projectNumber, true)
  assert.equal(receipt.matches.serviceAccount, false)
  assert.equal(receipt.directoryReadOperations, 0)
  assert.equal(calls.length, 2)
})

test('wrong project number stops before metadata token, signing and users.get', async () => {
  const { fetchImpl, calls } = makeFetch({ project: '9536592945' })
  const receipt = await run(fetchImpl)
  assert.equal(receipt.status, 'RUNTIME_IDENTITY_MISMATCH')
  assert.equal(receipt.phase, 'runtime_metadata')
  assert.equal(receipt.matches.projectNumber, false)
  assert.equal(receipt.matches.serviceAccount, true)
  assert.equal(receipt.directoryReadOperations, 0)
  assert.equal(calls.length, 2)
  assert.equal(calls.some((call) => call.url.includes('/instance/service-accounts/default/token')), false)
  assert.equal(calls.some((call) => call.url.endsWith(':signJwt')), false)
  assert.equal(calls.some((call) => call.url.startsWith('https://admin.googleapis.com/admin/directory/v1/users/')), false)
})

test('customer mismatch and domain mismatch fail closed after one fixed users.get', async (t) => {
  await t.test('customer', async () => {
    const { fetchImpl } = makeFetch({ user: userRecord({ customerId: 'wrong-customer' }) })
    const receipt = await run(fetchImpl)
    assert.equal(receipt.status, 'IDENTITY_CLAIM_MISMATCH')
    assert.equal(receipt.matches.customerId, false)
    assert.equal(receipt.directoryReadOperations, 1)
  })
  await t.test('domain', async () => {
    const { fetchImpl } = makeFetch({ user: userRecord({ primaryEmail: 'jedchang0308@example.invalid' }) })
    const receipt = await run(fetchImpl)
    assert.equal(receipt.status, 'IDENTITY_CLAIM_MISMATCH')
    assert.equal(receipt.matches.domain, false)
    assert.equal(receipt.matches.primaryEmail, false)
    assert.equal(receipt.directoryReadOperations, 1)
  })
})

test('credential and project config aliases are rejected before metadata or signJwt', async (t) => {
  for (const env of [
    { GOOGLE_APPLICATION_CREDENTIALS: 'private-key-file.json' },
    { google_application_credentials: 'service-account.json' },
    { CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: 'key.json' },
    { GOOGLE_OAUTH_ACCESS_TOKEN: 'secret-token' },
    { CLOUDSDK_CORE_PROJECT: 'other-project' },
    { GOOGLE_PRIVATE_KEY: 'private-key' }
  ]) {
    await t.test(Object.keys(env)[0], async () => {
      let calls = 0
      const receipt = await run(async () => { calls += 1; return textResponse('unused') }, { env: { SOURCE_REVISION, ...env } })
      assert.equal(receipt.status, 'CREDENTIAL_ALIAS_REJECTED')
      assert.equal(receipt.phase, 'credential_preflight')
      assert.equal(calls, 0)
      assert.equal(receipt.credentialMaterialCaptured, false)
    })
  }
})

test('receipt never includes tokens, JWTs, service-account emails, subject email or provider errors', async () => {
  const { fetchImpl } = makeFetch()
  const receipt = await run(fetchImpl)
  const serialized = JSON.stringify(receipt)
  for (const marker of SECRET_MARKERS) assert.equal(serialized.includes(marker), false)
  assert.equal(receipt.credentialMaterialCaptured, false)
  assert.match(receipt.sourceRevisionHash, /^[a-f0-9]{64}$/)
  assert.match(receipt.sourceFingerprint, /^[a-f0-9]{64}$/)
  assert.match(receipt.runtimeFingerprint, /^[a-f0-9]{64}$/)
  assert.match(receipt.observedRuntimeFingerprint, /^[a-f0-9]{64}$/)
})

test('canary has no database client imports or DB driver dependency', async () => {
  const source = await readFile(fileURLToPath(new URL('./dev014-directory-readback-canary.mjs', import.meta.url)), 'utf8')
  assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:pg|postgres|postgresql|mysql|sqlite3?)['"]/i)
  assert.doesNotMatch(source, /(?:createPool|createConnection|Pool\(|Client\()/)
})

test('argument parser requires exactly the three named values and bounds expiry', async () => {
  const { fetchImpl } = makeFetch()
  const missing = await run(fetchImpl, { argv: args().slice(0, 4) })
  assert.equal(missing.status, 'INVALID_ARGUMENTS')
  const extra = await run(fetchImpl, { argv: args(['--fetch-url', 'https://example.invalid']) })
  assert.equal(extra.status, 'INVALID_ARGUMENTS')
  const expired = await run(fetchImpl, { argv: [
    '--operation-id', OPERATION_ID,
    '--source-revision', SOURCE_REVISION,
    '--expires-at', '2026-10-04T23:59:59Z'
  ] })
  assert.equal(expired.status, 'INVALID_ARGUMENTS')
})