import { afterEach, describe, expect, it, vi } from 'vitest'
import { Compute, GoogleAuth, JWT, UserRefreshClient } from 'google-auth-library'
import {
  GOOGLE_DIRECTORY_READ_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL,
  createGoogleDirectoryAuthPort,
  createGoogleDirectoryReadOnlyPort,
  createLocalDeterministicDirectoryPort,
  readGoogleDirectoryRuntimeConfig,
  type GoogleDirectoryCredentialTransport,
} from './orgmasterManagedDirectoryPort'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const auth = { getRequestHeaders: vi.fn(async () => ({ Authorization: 'Bearer test' })) }

function transport(body: Record<string, unknown>) {
  return vi.fn(async () => ({ status: 200, headers: new Headers(), json: async () => body }))
}

describe('Google Directory read-only adapter', () => {
  it('does not send an unsupported customer query and rejects a response without customerId', async () => {
    const request = transport({ id: 'user-1', primaryEmail: 'person@jenfu.com.tw', suspended: false, archived: false })
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: request })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, code: 'DIRECTORY_RESPONSE_INVALID' })
    expect(request.mock.calls[0]?.[0]).not.toContain('customer=')
  })

  it('rejects a suspended candidate', async () => {
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: transport({ id: 'user-1', customerId: 'customer-1', primaryEmail: 'person@jenfu.com.tw', suspended: true, archived: false }) })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, kind: 'candidate_miss', code: 'DIRECTORY_USER_INELIGIBLE' })
  })

  it('rejects a stable-key response whose user id changed', async () => {
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: transport({ id: 'other-user', customerId: 'customer-1', primaryEmail: 'person@jenfu.com.tw', suspended: false, archived: false }) })
    await expect(port.readByDirectoryKey('customer-1', 'user-1')).resolves.toMatchObject({ ok: false, kind: 'candidate_miss', code: 'DIRECTORY_CANDIDATE_MISMATCH' })
  })
})

describe('keyless Google Directory domain-wide delegation', () => {
  it('accepts only the five canonical runtime keys and ignores legacy aliases', () => {
    const canonical = readGoogleDirectoryRuntimeConfig({
      ORGMASTER_MANAGED_IDENTITY_ENABLED: 'true',
      ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID: 'C012345',
      ORGMASTER_GOOGLE_DIRECTORY_DOMAIN: 'Jenfu.com.tw',
      ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT: 'Admin@Jenfu.com.tw',
      ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
    })
    expect(canonical).toEqual({
      enabled: true,
      state: 'enabled',
      customerId: 'C012345',
      domain: 'jenfu.com.tw',
      delegatedSubject: 'admin@jenfu.com.tw',
      serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
    })
    expect(readGoogleDirectoryRuntimeConfig({
      ORGMASTER_MANAGED_IDENTITY_ENABLED: 'true',
      ORGMASTER_DIRECTORY_CUSTOMER_ID: 'C012345',
      ORGMASTER_MANAGED_DOMAIN: 'jenfu.com.tw',
      ORGMASTER_DIRECTORY_DWD_SUBJECT: 'admin@jenfu.com.tw',
    })).toEqual({ enabled: false, state: 'invalid' })
    expect(readGoogleDirectoryRuntimeConfig({ ORGMASTER_MANAGED_IDENTITY_ENABLED: 'TRUE' })).toEqual({ enabled: false, state: 'disabled' })
  })

  it('rejects explicit key-file ADC only when Directory delegation is enabled', () => {
    const enabled = {
      ORGMASTER_MANAGED_IDENTITY_ENABLED: 'true',
      ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID: 'C012345',
      ORGMASTER_GOOGLE_DIRECTORY_DOMAIN: 'jenfu.com.tw',
      ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT: 'admin@jenfu.com.tw',
      ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
    }
    expect(readGoogleDirectoryRuntimeConfig({ ...enabled, GOOGLE_APPLICATION_CREDENTIALS: 'credential-path-present' })).toEqual({ enabled: false, state: 'invalid' })
    expect(readGoogleDirectoryRuntimeConfig({ ...enabled, google_application_credentials: 'credential-path-present' })).toEqual({ enabled: false, state: 'invalid' })
    expect(readGoogleDirectoryRuntimeConfig({ ORGMASTER_MANAGED_IDENTITY_ENABLED: 'false', GOOGLE_APPLICATION_CREDENTIALS: 'credential-path-present' })).toEqual({ enabled: false, state: 'disabled' })
  })

  it('uses runtime ADC only to sign an exact short-lived read-only DWD assertion and caches the delegated token', async () => {
    let currentTime = Date.parse('2026-09-21T04:00:00.000Z')
    const requests: Array<{ url: string; headers: Record<string, string>; body: string }> = []
    const transport: GoogleDirectoryCredentialTransport = vi.fn(async (url, init) => {
      requests.push({ url, headers: init.headers, body: init.body })
      if (url.includes(':signJwt')) return { status: 200, json: async () => ({ signedJwt: 'header.payload.signature' }) }
      return { status: 200, json: async () => ({ access_token: 'delegated-access-token', expires_in: 3600, token_type: 'Bearer' }) }
    })
    const getAccessToken = vi.fn(async () => ({ token: 'runtime-adc-token' }))
    const sourceClient = Object.assign(Object.create(Compute.prototype), { getAccessToken }) as Compute
    const getClient = vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue(sourceClient)
    const auth = createGoogleDirectoryAuthPort({
      delegatedSubject: 'admin@jenfu.com.tw',
      serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
      transport,
      now: () => currentTime,
    })

    await expect(Promise.all([
      auth.getRequestHeaders('https://admin.googleapis.com/first'),
      auth.getRequestHeaders('https://admin.googleapis.com/concurrent'),
    ])).resolves.toEqual([
      { Authorization: 'Bearer delegated-access-token', Accept: 'application/json' },
      { Authorization: 'Bearer delegated-access-token', Accept: 'application/json' },
    ])
    currentTime += 1_000
    await expect(auth.getRequestHeaders('https://admin.googleapis.com/second')).resolves.toEqual({ Authorization: 'Bearer delegated-access-token', Accept: 'application/json' })

    expect(getClient).toHaveBeenCalledTimes(1)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(requests[0]?.url).toBe('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/orgmaster-prod-directory-dwd%40jenfu-platform-prod.iam.gserviceaccount.com:signJwt')
    expect(requests[0]?.headers).toEqual({ Authorization: 'Bearer runtime-adc-token', 'Content-Type': 'application/json', Accept: 'application/json' })
    const signRequest = JSON.parse(requests[0]!.body) as { payload: string }
    const claims = JSON.parse(signRequest.payload) as Record<string, unknown>
    expect(claims).toEqual({
      iss: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
      sub: 'admin@jenfu.com.tw',
      scope: GOOGLE_DIRECTORY_READ_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: Math.floor(Date.parse('2026-09-21T04:00:00.000Z') / 1_000),
      exp: Math.floor(Date.parse('2026-09-21T05:00:00.000Z') / 1_000),
    })
    expect(requests[1]?.url).toBe(GOOGLE_OAUTH_TOKEN_URL)
    const exchange = new URLSearchParams(requests[1]!.body)
    expect(exchange.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(exchange.get('assertion')).toBe('header.payload.signature')
    expect(requests.map((request) => request.body).join('\n')).not.toContain('runtime-adc-token')
  })

  it('classifies an IAM delegation rejection as permanent and does not call Directory', async () => {
    const directoryTransport = vi.fn()
    const getAccessToken = vi.fn(async () => ({ token: 'runtime-adc-token' }))
    const sourceClient = Object.assign(Object.create(UserRefreshClient.prototype), { getAccessToken }) as UserRefreshClient
    const getClient = vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue(sourceClient)
    const credentialTransport = vi.fn(async () => ({ status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED' } }) }))
    const authPort = createGoogleDirectoryAuthPort({
      delegatedSubject: 'admin@jenfu.com.tw',
      serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
      transport: credentialTransport,
    })
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'C012345', domain: 'jenfu.com.tw', auth: authPort, transport: directoryTransport })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, kind: 'permanent_error', code: 'DIRECTORY_DELEGATION_INVALID' })
    expect(getClient).toHaveBeenCalledTimes(1)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(credentialTransport).toHaveBeenCalledTimes(1)
    expect(directoryTransport).not.toHaveBeenCalled()
  })

  it('rejects key-backed JWT ADC before requesting a source token or calling IAM/Directory', async () => {
    const directoryTransport = vi.fn()
    const credentialTransport = vi.fn()
    const getAccessToken = vi.fn(async () => ({ token: 'must-not-be-used' }))
    const keyClient = Object.assign(Object.create(JWT.prototype), {
      credentials: { type: 'service_account' },
      getAccessToken,
    }) as JWT
    const getClient = vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue(keyClient)
    const authPort = createGoogleDirectoryAuthPort({
      delegatedSubject: 'admin@jenfu.com.tw',
      serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
      transport: credentialTransport,
    })
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'C012345', domain: 'jenfu.com.tw', auth: authPort, transport: directoryTransport })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, kind: 'permanent_error', code: 'DIRECTORY_DELEGATION_INVALID' })
    expect(getClient).toHaveBeenCalledTimes(1)
    expect(getAccessToken).not.toHaveBeenCalled()
    expect(credentialTransport).not.toHaveBeenCalled()
    expect(directoryTransport).not.toHaveBeenCalled()
  })
})

describe('local deterministic Directory adapter', () => {
  it('preserves the fixture key as primary email during stable-key readback', async () => {
    const port = createLocalDeterministicDirectoryPort({
      customerId: 'customer-1',
      domain: 'jenfu.com.tw',
      users: { 'person@jenfu.com.tw': { userId: 'user-1', directoryState: 'present', sourceEtag: 'etag-1' } },
    })
    await expect(port.readByDirectoryKey('customer-1', 'user-1')).resolves.toMatchObject({
      ok: true,
      user: { customerId: 'customer-1', userId: 'user-1', primaryEmail: 'person@jenfu.com.tw', directoryState: 'present', sourceEtag: 'etag-1' },
    })
  })
})


describe('Directory full-response deadlines', () => {
  const canonicalUser = { id: 'user-1', customerId: 'customer-1', primaryEmail: 'person@jenfu.com.tw', suspended: false, archived: false }
  const createCredentialPort = (transport: GoogleDirectoryCredentialTransport) => {
    const sourceClient = Object.assign(Object.create(Compute.prototype), { getAccessToken: vi.fn(async () => ({ token: 'synthetic-runtime-token' })) }) as Compute
    vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue(sourceClient)
    return createGoogleDirectoryAuthPort({ delegatedSubject: 'admin@jenfu.com.tw', serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com', transport, timeoutMs: 20 })
  }

  it.each(['signJwt', 'oauth'] as const)('bounds a stalled %s body and clears the in-flight refresh for a safe retry', async (stage) => {
    vi.useFakeTimers()
    let stall = true
    const signals: AbortSignal[] = []
    const request: GoogleDirectoryCredentialTransport = vi.fn(async (url, init) => {
      signals.push(init.signal)
      const signing = url.includes(':signJwt')
      return { status: 200, json: () => stall && (stage === 'signJwt' ? signing : !signing) ? new Promise<unknown>(() => {}) : Promise.resolve(signing ? { signedJwt: 'synthetic-signed-assertion' } : { access_token: 'synthetic-delegated-token', expires_in: 3600 }) }
    })
    const authPort = createCredentialPort(request)
    const result = authPort.getRequestHeaders('https://admin.googleapis.com/unused').then(() => null, (error: unknown) => error)
    await vi.advanceTimersByTimeAsync(21)
    expect(await result).toMatchObject({ code: 'DIRECTORY_AUTH_UNAVAILABLE', retryable: true })
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    stall = false
    await expect(authPort.getRequestHeaders('https://admin.googleapis.com/unused')).resolves.toMatchObject({ Authorization: 'Bearer synthetic-delegated-token' })
  })

  it('bounds stalled ADC and never signs with a source token resolved after the deadline', async () => {
    vi.useFakeTimers()
    let resolveToken!: (value: { token: string }) => void
    const sourceClient = Object.assign(Object.create(Compute.prototype), { getAccessToken: vi.fn(() => new Promise<{ token: string }>((resolve) => { resolveToken = resolve })) }) as Compute
    vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue(sourceClient)
    const request: GoogleDirectoryCredentialTransport = vi.fn()
    const authPort = createGoogleDirectoryAuthPort({ delegatedSubject: 'admin@jenfu.com.tw', serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com', transport: request, timeoutMs: 20 })
    const result = authPort.getRequestHeaders('https://admin.googleapis.com/unused').then(() => null, (error: unknown) => error)
    await vi.advanceTimersByTimeAsync(21)
    expect(await result).toMatchObject({ code: 'DIRECTORY_AUTH_UNAVAILABLE', retryable: true })
    resolveToken({ token: 'synthetic-late-token' })
    await vi.advanceTimersByTimeAsync(1)
    expect(request).not.toHaveBeenCalled()
  })

  it('preserves a known delegation denial without waiting for or exposing its error body', async () => {
    const body = vi.fn(() => new Promise<unknown>(() => {}))
    const authPort = createCredentialPort(vi.fn(async () => ({ status: 403, json: body })))
    await expect(authPort.getRequestHeaders('https://admin.googleapis.com/unused')).rejects.toMatchObject({ code: 'DIRECTORY_DELEGATION_INVALID', retryable: false })
    expect(body).not.toHaveBeenCalled()
  })

  it('bounds users.get body decoding even when the transport ignores abort', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const request = vi.fn(async (_url: string, init: { signal: AbortSignal }) => { signal = init.signal; return { status: 200, headers: new Headers(), json: () => new Promise<unknown>(() => {}) } })
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: request, timeoutMs: 20 })
    const result = port.findExactCandidate('person@jenfu.com.tw')
    await vi.advanceTimersByTimeAsync(21)
    await expect(result).resolves.toMatchObject({ ok: false, kind: 'retryable_error', code: 'DIRECTORY_TIMEOUT' })
    expect(signal?.aborted).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not issue a late Directory read after authentication exceeds the read deadline', async () => {
    vi.useFakeTimers()
    let resolveHeaders!: (headers: Record<string, string>) => void
    const request = vi.fn()
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth: { getRequestHeaders: () => new Promise((resolve) => { resolveHeaders = resolve }) }, transport: request, timeoutMs: 20 })
    const result = port.findExactCandidate('person@jenfu.com.tw')
    await vi.advanceTimersByTimeAsync(21)
    await expect(result).resolves.toMatchObject({ ok: false, code: 'DIRECTORY_TIMEOUT', kind: 'retryable_error' })
    resolveHeaders({ Authorization: 'Bearer synthetic-late-token' })
    await vi.advanceTimersByTimeAsync(1)
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    [404, 'not_found', 'DIRECTORY_NOT_FOUND'],
    [429, 'retryable_error', 'DIRECTORY_RATE_LIMITED'],
    [503, 'retryable_error', 'DIRECTORY_READ_UNAVAILABLE'],
    [403, 'permanent_error', 'DIRECTORY_HTTP_403'],
  ])('classifies HTTP %i without decoding or persisting an error body', async (status, kind, code) => {
    const body = vi.fn(async () => ({ sensitiveProviderMaterial: 'never-read' }))
    const request = vi.fn(async () => ({ status: Number(status), headers: new Headers(), json: body }))
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: request })
    await expect(port.readByDirectoryKey('customer-1', 'user-1')).resolves.toMatchObject({ ok: false, kind, code })
    expect(body).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(port.writeOperations).toBe(0)
  })

  it.each([
    [{ ...canonicalUser, archived: true }, 'DIRECTORY_USER_INELIGIBLE'],
    [{ ...canonicalUser, customerId: 'other-customer' }, 'DIRECTORY_RESPONSE_INVALID'],
    [{ ...canonicalUser, primaryEmail: 'primary@jenfu.com.tw' }, 'DIRECTORY_CANDIDATE_MISMATCH'],
  ])('rejects archived, foreign customer and alias-hit candidates', async (user, code) => {
    const request = transport(user)
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: request })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, code })
    expect(request).toHaveBeenCalledTimes(1)
    expect(port.writeOperations).toBe(0)
  })

  it('rejects a foreign input domain and customer before any Directory read', async () => {
    const request = transport(canonicalUser)
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: request })
    await expect(port.findExactCandidate('person@other.test')).resolves.toMatchObject({ ok: false, code: 'DIRECTORY_DOMAIN_MISMATCH' })
    await expect(port.readByDirectoryKey('other-customer', 'user-1')).resolves.toMatchObject({ ok: false, code: 'DIRECTORY_KEY_MISMATCH' })
    expect(request).not.toHaveBeenCalled()
  })
})
