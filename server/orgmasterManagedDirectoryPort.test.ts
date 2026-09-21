import { describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_DIRECTORY_READ_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL,
  createGoogleDirectoryAuthPort,
  createGoogleDirectoryReadOnlyPort,
  createLocalDeterministicDirectoryPort,
  readGoogleDirectoryRuntimeConfig,
  type GoogleDirectoryCredentialTransport,
} from './orgmasterManagedDirectoryPort'

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

  it('uses runtime ADC only to sign an exact short-lived read-only DWD assertion and caches the delegated token', async () => {
    let currentTime = Date.parse('2026-09-21T04:00:00.000Z')
    const requests: Array<{ url: string; headers: Record<string, string>; body: string }> = []
    const transport: GoogleDirectoryCredentialTransport = vi.fn(async (url, init) => {
      requests.push({ url, headers: init.headers, body: init.body })
      if (url.includes(':signJwt')) return { status: 200, json: async () => ({ signedJwt: 'header.payload.signature' }) }
      return { status: 200, json: async () => ({ access_token: 'delegated-access-token', expires_in: 3600, token_type: 'Bearer' }) }
    })
    const getSourceAccessToken = vi.fn(async () => 'runtime-adc-token')
    const auth = createGoogleDirectoryAuthPort({
      delegatedSubject: 'admin@jenfu.com.tw',
      serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
      getSourceAccessToken,
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

    expect(getSourceAccessToken).toHaveBeenCalledTimes(1)
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
    const authPort = createGoogleDirectoryAuthPort({
      delegatedSubject: 'admin@jenfu.com.tw',
      serviceAccountEmail: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
      getSourceAccessToken: async () => 'runtime-adc-token',
      transport: async () => ({ status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED' } }) }),
    })
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'C012345', domain: 'jenfu.com.tw', auth: authPort, transport: directoryTransport })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, kind: 'permanent_error', code: 'DIRECTORY_DELEGATION_INVALID' })
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
