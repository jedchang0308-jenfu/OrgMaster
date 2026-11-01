import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterAuthMiddleware, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import type { OrgmasterAuthConfig } from './orgmasterAuthConfig'
import { parseHandoff, type OrgmasterSsoHandoffDependencies } from './orgmasterSsoHandoff'
import v2Vectors from '../contracts/jenfu-sso-handoff/v2/conformance-vectors.json'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const googleAuthMocks = vi.hoisted(() => ({
  GoogleAuth: vi.fn(),
  Impersonated: vi.fn(),
  getClient: vi.fn(),
  getIdTokenClient: vi.fn(),
  legacyFetchIdToken: vi.fn(),
  impersonatedFetchIdToken: vi.fn(),
}))
vi.mock('google-auth-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('google-auth-library')>()),
  GoogleAuth: googleAuthMocks.GoogleAuth,
  Impersonated: googleAuthMocks.Impersonated,
}))

const openServers: Array<ReturnType<typeof createServer>> = []
afterEach(async () => { await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

const now = Date.parse('2026-09-17T03:00:00.000Z')
const publicOrigin = 'https://orgmaster-stg-123456789.asia-east1.run.app'
const brokerOrigin = 'https://jenfu-platform-stg-123456789.asia-east1.run.app'

beforeEach(() => {
  vi.clearAllMocks()
  googleAuthMocks.GoogleAuth.mockImplementation(function () { return { getClient: googleAuthMocks.getClient, getIdTokenClient: googleAuthMocks.getIdTokenClient } })
  googleAuthMocks.Impersonated.mockImplementation(function () { return { fetchIdToken: googleAuthMocks.impersonatedFetchIdToken } })
  googleAuthMocks.getClient.mockResolvedValue({ sourceClient: true })
  googleAuthMocks.getIdTokenClient.mockResolvedValue({ idTokenProvider: { fetchIdToken: googleAuthMocks.legacyFetchIdToken } })
  googleAuthMocks.legacyFetchIdToken.mockResolvedValue('legacy-service-token')
  googleAuthMocks.impersonatedFetchIdToken.mockResolvedValue('google-signed-service-token')
})

function runtime() {
  const config: OrgmasterAuthConfig = {
    publicBaseUrl: new URL(publicOrigin), postgresUrl: 'postgres://test', sessionHashPepper: 'p'.repeat(32), firebaseProjectId: 'jenfu-platform-nonprod',
    identityIssuer: 'https://securetoken.google.com/jenfu-platform-nonprod', identityAudience: 'jenfu-platform-nonprod',
    firebasePublicConfig: { apiKey: 'public-api-key', authDomain: 'jenfu-platform-nonprod.firebaseapp.com', projectId: 'jenfu-platform-nonprod', appId: '1:2:web:abc' }, secureCookie: true,
  }
  const value: OrgmasterAuthRuntime = {
    configResult: { configured: true, config }, ssoHandoffEnabled: true,
    principals: { resolveActivePrincipal: vi.fn(async () => ({ principalId: 'principal-1', employeeId: 'employee-1', mappingVersion: 1, publishedAt: new Date(now).toISOString() })) },
    epochs: { read: vi.fn(async () => 7), readState: vi.fn(async () => ({ authEpoch: 7, revokedBefore: null })), readPrincipalState: vi.fn(async () => ({ authEpoch: 7, revokedBefore: null })) },
    sessions: { create: vi.fn(async (input) => ({ id: 'session-1', ...input, revokedAt: null })), findByHash: vi.fn(async () => null), revokeByHash: vi.fn(async () => undefined) },
  }
  return value
}

function handoff() {
  return {
    contractVersion: 'jenfu.sso-handoff.v2', issuer: `${brokerOrigin}/api/sso`, audience: 'orgmaster',
    identity: { identityIssuer: 'https://securetoken.google.com/jenfu-platform-nonprod', identitySubject: 'uid-1', principalId: 'principal-1', employeeId: 'employee-1' },
    authentication: { authenticatedAt: '2026-09-17T02:55:00.000Z', email: 'fixture@example.invalid', emailVerified: true, signInProvider: 'password', secondFactor: null, assuranceLevel: 'aal1' },
    authState: { authEpoch: 7, revokedBefore: null }, sourceSessionExpiresAt: '2026-09-17T04:00:00.000Z', issuedAt: '2026-09-17T02:59:30.000Z', expiresAt: '2026-09-17T03:00:30.000Z',
  }
}

async function listen(value: OrgmasterAuthRuntime, dependencies: OrgmasterSsoHandoffDependencies) {
  const middleware = createOrgmasterAuthMiddleware(() => value, false, dependencies)
  const server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 404; response.end() }))
  openServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing test address')
  return `http://127.0.0.1:${address.port}`
}

function dependencies(mode: 'off' | 'on', exchange = handoff()): OrgmasterSsoHandoffDependencies {
  return {
    environment: { NODE_ENV: 'production', ORGMASTER_JENFU_SSO_HANDOFF_MODE: mode, ORGMASTER_JENFU_SSO_BROKER_ORIGIN: brokerOrigin },
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, size),
    serviceToken: vi.fn(async () => 'google-signed-service-token'),
    fetch: vi.fn(async (_input, init) => {
      expect(init?.redirect).toBe('error')
      expect(new Headers(init?.headers).get('x-jenfu-service-identity')).toBe('Bearer google-signed-service-token')
      return new Response(JSON.stringify(exchange), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  }
}

describe('DEV-013 OrgMaster startup, health, direct start and callback', () => {
  it.each([1010, 12010])('completes local v2 handoff, app-local read and logout for A/B at localhost:%i', async port => {
    const value = runtime()
    if (!value.configResult.configured) throw new Error('fixture config missing')
    const origin = `http://localhost:${port}`
    value.configResult.config.publicBaseUrl = new URL(origin)
    value.configResult.config.secureCookie = false
    value.firebase = {} as NonNullable<OrgmasterAuthRuntime['firebase']>
    const localBroker = `http://localhost:${port === 1010 ? 1000 : 12000}`
    const clock = Date.now()
    let proof = handoff()
    const sessions = new Map<string, OrgmasterSession>()
    value.principals!.resolveActivePrincipal = vi.fn(async () => ({ ...proof.identity, mappingVersion: 1, publishedAt: new Date(clock).toISOString() }))
    value.sessions!.create = vi.fn(async input => {
      const session = { ...input, id: 'fixture-session-' + sessions.size, revokedAt: null }
      sessions.set(input.sessionIdHash, session)
      return session
    })
    value.sessions!.findByHash = vi.fn(async hash => sessions.get(hash) ?? null)
    value.sessions!.revokeByHash = vi.fn(async hash => { const session = sessions.get(hash); if (session) session.revokedAt = new Date(clock).toISOString() })
    const deps: OrgmasterSsoHandoffDependencies = {
      environment: { NODE_ENV: 'development', ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on', ORGMASTER_JENFU_SSO_BROKER_ORIGIN: localBroker },
      now: () => clock,
      serviceToken: vi.fn(async () => 'injected-service-proof'),
      fetch: vi.fn(async (_url, init) => {
        const request = new URLSearchParams(String(init?.body))
        expect(request.get('redirect_uri')).toBe(`${origin}/api/auth/jenfu-sso/callback`)
        expect(request.get('code_verifier')).toBeTruthy()
        return new Response(JSON.stringify(proof), { status: 200 })
      }),
    }
    const base = await listen(value, deps)
    for (const id of ['a', 'b']) {
      proof = { ...handoff(), issuer: `${localBroker}/api/sso`, identity: { ...handoff().identity, principalId: `principal-${id}`, employeeId: `employee-${id}`, identitySubject: `uid-${id}` },
        authentication: { ...handoff().authentication, authenticatedAt: new Date(clock - 1000).toISOString() },
        sourceSessionExpiresAt: new Date(clock + 3600000).toISOString(), issuedAt: new Date(clock - 1000).toISOString(), expiresAt: new Date(clock + 30000).toISOString() }
      const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
      const authorize = new URL(start.headers.get('location')!)
      expect(authorize.origin).toBe(localBroker)
      expect(authorize.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/jenfu-sso/callback`)
      const callback = new URL('/api/auth/jenfu-sso/callback', base)
      callback.search = new URLSearchParams({ code: `fixture-code-${id}`, state: authorize.searchParams.get('state')!, iss: `${localBroker}/api/sso` }).toString()
      const accepted = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
      expect(accepted.status).toBe(303)
      const localCookie = accepted.headers.getSetCookie().find(cookie => cookie.startsWith('orgmaster_session='))!
      expect(localCookie).toContain('HttpOnly')
      const cookie = localCookie.split(';')[0]
      const exchangeCount = vi.mocked(deps.fetch!).mock.calls.length
      const current = await fetch(`${base}/api/auth/me`, { headers: { cookie } })
      expect(current.status).toBe(200)
      expect(await current.json()).toMatchObject({ user: { principalId: `principal-${id}`, employeeId: `employee-${id}` } })
      expect(vi.mocked(deps.fetch!).mock.calls.length).toBe(exchangeCount)
      const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' })
      expect(logout.status).toBe(200)
      expect((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status).toBe(401)
    }
  })
  it('checks the locked v2 wire vector and rejects extra authority or expired proof', () => {
    const vector = { ...v2Vectors.valid, audience: 'orgmaster' }
    const clock = Date.parse(v2Vectors.clock)
    expect(parseHandoff(vector, vector.issuer, clock)).toMatchObject({
      contractVersion: 'jenfu.sso-handoff.v2', identity: { principalId: 'principal-one' },
    })
    expect(() => parseHandoff({ ...vector, authorization: { applicationId: 'orgmaster', assignmentVersion: 1 } }, vector.issuer, clock)).toThrow('handoff invalid')
    expect(() => parseHandoff({ ...vector, contractVersion: 'jenfu.sso-handoff.v1', authorization: { applicationId: 'orgmaster', assignmentVersion: 1 } }, vector.issuer, clock)).toThrow('handoff invalid')
    expect(() => parseHandoff({ ...vector, expiresAt: '2026-09-24T11:59:59.000Z' }, vector.issuer, clock)).toThrow('handoff expired')
    expect(() => parseHandoff({ ...vector, authState: { authEpoch: -1, revokedBefore: null } }, vector.issuer, clock)).toThrow('handoff invalid')
    expect(() => parseHandoff({ ...vector, audience: 'ai-pdm' }, vector.issuer, clock)).toThrow('handoff invalid')
  })
  it.each(['state', 'audience', 'service-proof', 'account-conflict'])('fails closed for %s without creating a local session', async failure => {
    const value = runtime()
    const proof = handoff()
    if (failure === 'audience') proof.audience = 'ai-pdm'
    const deps = dependencies('on', proof)
    if (failure === 'service-proof') deps.serviceToken = vi.fn(async () => { throw new Error('injected credential unavailable') })
    if (failure === 'account-conflict') vi.mocked(value.sessions!.findByHash).mockResolvedValue({ id: 'existing-session', identityIssuer: 'issuer', identitySubject: 'subject', principalId: 'different-principal', employeeId: 'employee-2', authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 7, issuedAt: new Date(now).toISOString(), authenticatedAt: new Date(now).toISOString(), expiresAt: '2099-01-01T00:00:00Z', revokedAt: null, assuranceLevel: 'aal1' })
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const authorize = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.search = new URLSearchParams({ code: 'fixture-code', state: failure === 'state' ? 'incorrect-state' : authorize.searchParams.get('state')!, iss: `${brokerOrigin}/api/sso` }).toString()
    const cookie = start.headers.get('set-cookie')!.split(';')[0] + (failure === 'account-conflict' ? '; orgmaster_session=existing-fixture' : '')
    const denied = await fetch(callback, { redirect: 'manual', headers: { cookie } })
    expect(denied.status).toBe(failure === 'account-conflict' ? 409 : failure === 'service-proof' ? 502 : 400)
    expect(value.sessions!.create).not.toHaveBeenCalled()
    if (failure === 'state' || failure === 'service-proof') expect(deps.fetch).not.toHaveBeenCalled()
  })
  it('keeps health available and direct start fail-closed while mode is off', async () => {
    const value = runtime()
    value.ssoHandoffEnabled = false
    const base = await listen(value, dependencies('off'))
    const health = await fetch(`${base}/api/auth/mode`)
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ authMode: 'jenfu_firebase_bff', ssoHandoffEnabled: false })
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    expect(start.status).toBe(404)
    expect(await start.json()).toMatchObject({ code: 'sso_request_invalid' })
  })

  it('starts with exact callback and completes callback using auth-state v2 and original auth time', async () => {
    const value = runtime()
    const deps = dependencies('on')
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start?returnTo=%2F`, { redirect: 'manual' })
    expect(start.status).toBe(303)
    const location = new URL(start.headers.get('location')!)
    expect(location.origin).toBe(brokerOrigin)
    expect(location.pathname).toBe('/api/sso/authorize')
    expect(location.searchParams.get('redirect_uri')).toBe(`${publicOrigin}/api/auth/jenfu-sso/callback`)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    const transactionCookie = start.headers.get('set-cookie')!.split(';')[0]
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const accepted = await fetch(callback, { redirect: 'manual', headers: { cookie: transactionCookie } })
    expect(accepted.status).toBe(303)
    expect(accepted.headers.get('location')).toBe(`${publicOrigin}/`)
    expect(accepted.headers.get('set-cookie')).toContain('orgmaster_session=')
    expect(value.epochs!.readPrincipalState).toHaveBeenCalledWith('principal-1')
    expect(value.sessions!.create).toHaveBeenCalledWith(expect.objectContaining({
      authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 7,
      authenticatedAt: '2026-09-17T02:55:00.000Z',
      expiresAt: '2026-09-17T04:00:00.000Z',
    }))
    expect(accepted.headers.get('set-cookie')).toContain('Max-Age=3600')
  })

  it('keeps the existing getIdTokenClient path when impersonation is unset', async () => {
    const value = runtime()
    const deps = dependencies('on')
    delete deps.serviceToken
    googleAuthMocks.legacyFetchIdToken.mockResolvedValue('google-signed-service-token')
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const accepted = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(accepted.status).toBe(303)
    expect(googleAuthMocks.getIdTokenClient).toHaveBeenCalledWith(brokerOrigin)
    expect(googleAuthMocks.getClient).not.toHaveBeenCalled()
    expect(googleAuthMocks.Impersonated).not.toHaveBeenCalled()
  })

  it.each(['http://127.0.0.1:4317', 'https://localhost:4317'])('uses development loopback impersonation for %s', async (localBrokerOrigin) => {
    const value = runtime()
    const deps = dependencies('on', { ...handoff(), issuer: `${localBrokerOrigin}/api/sso` })
    delete deps.serviceToken
    deps.environment = {
      NODE_ENV: 'development',
      ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on',
      ORGMASTER_JENFU_SSO_BROKER_ORIGIN: localBrokerOrigin,
      JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: 'owner-nonprod@project.iam.gserviceaccount.com',
      CLOUDSDK_CONFIG: process.cwd(),
    }
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${localBrokerOrigin}/api/sso`)
    const accepted = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(accepted.status).toBe(303)
    expect(googleAuthMocks.getClient).toHaveBeenCalledOnce()
    expect(googleAuthMocks.getIdTokenClient).not.toHaveBeenCalled()
    expect(googleAuthMocks.GoogleAuth).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFilename: path.join(process.cwd(), 'application_default_credentials.json'),
    })
    expect(googleAuthMocks.Impersonated).toHaveBeenCalledWith({ sourceClient: { sourceClient: true }, targetPrincipal: 'owner-nonprod@project.iam.gserviceaccount.com', targetScopes: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: 300 })
    expect(googleAuthMocks.impersonatedFetchIdToken).toHaveBeenCalledWith(localBrokerOrigin)
  })

  it('rejects production impersonation configuration before broker exchange', async () => {
    const value = runtime()
    const deps = dependencies('on')
    delete deps.serviceToken
    deps.environment = { ...deps.environment, JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: 'owner-nonprod@project.iam.gserviceaccount.com' }
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const rejected = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(rejected.status).toBe(502)
    expect(await rejected.json()).toMatchObject({ code: 'sso_dependency_unavailable' })
    expect(googleAuthMocks.getClient).not.toHaveBeenCalled()
    expect(googleAuthMocks.getIdTokenClient).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'sso_reauthentication_required'],
    [403, 'sso_access_denied'],
    [403, 'sso_principal_stale'],
    [400, 'sso_code_invalid'],
    [400, 'sso_code_expired'],
    [400, 'sso_code_consumed'],
    [400, 'sso_pkce_invalid'],
  ])('preserves the safe broker failure %i %s', async (status, code) => {
    const value = runtime()
    const deps = dependencies('on')
    deps.fetch = vi.fn(async () => new Response(JSON.stringify({ code }), { status, headers: { 'content-type': 'application/json' } }))
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const rejected = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(rejected.status).toBe(status)
    expect(await rejected.json()).toMatchObject({ code })
    expect(value.sessions!.create).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown code', 400, JSON.stringify({ code: 'internal_failure' })],
    ['status mismatch', 503, JSON.stringify({ code: 'sso_reauthentication_required' })],
    ['malformed JSON', 400, '{'],
    ['oversized body', 400, JSON.stringify({ code: 'sso_code_invalid', padding: 'x'.repeat(4097) })],
  ])('keeps %s broker failures generic', async (_case, status, body) => {
    const value = runtime()
    const deps = dependencies('on')
    deps.fetch = vi.fn(async () => new Response(body, { status }))
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const rejected = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(rejected.status).toBe(502)
    expect(await rejected.json()).toMatchObject({ code: 'sso_dependency_unavailable' })
    expect(value.sessions!.create).not.toHaveBeenCalled()
  })

  it.each([
    ['empty target', { JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: '' }, 'JENFU_SSO_IMPERSONATION_TARGET_INVALID'],
    ['Cloud Run', { K_SERVICE: 'run-service', JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: 'owner-nonprod@project.iam.gserviceaccount.com' }, 'JENFU_SSO_IMPERSONATION_CLOUD_RUN_FORBIDDEN'],
    ['relative ADC config', { CLOUDSDK_CONFIG: 'relative/gcloud' }, 'JENFU_SSO_ADC_CONFIG_INVALID'],
  ])('rejects %s local impersonation configuration before broker exchange', async (_label, extra, _errorCode) => {
    const value = runtime()
    const localBrokerOrigin = 'http://127.0.0.1:4317'
    const deps = dependencies('on', { ...handoff(), issuer: `${localBrokerOrigin}/api/sso` })
    delete deps.serviceToken
    deps.environment = {
      NODE_ENV: 'development',
      ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on',
      ORGMASTER_JENFU_SSO_BROKER_ORIGIN: localBrokerOrigin,
      JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: 'owner-nonprod@project.iam.gserviceaccount.com',
      ...extra,
    }
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${localBrokerOrigin}/api/sso`)
    const rejected = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(rejected.status).toBe(502)
    expect(await rejected.json()).toMatchObject({ code: 'sso_dependency_unavailable' })
    expect(googleAuthMocks.getClient).not.toHaveBeenCalled()
    expect(googleAuthMocks.getIdTokenClient).not.toHaveBeenCalled()
    expect(googleAuthMocks.Impersonated).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('does not fall back when local source credential acquisition fails', async () => {
    const value = runtime()
    const localBrokerOrigin = 'http://127.0.0.1:4317'
    const deps = dependencies('on', { ...handoff(), issuer: `${localBrokerOrigin}/api/sso` })
    delete deps.serviceToken
    deps.environment = {
      NODE_ENV: 'development',
      ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on',
      ORGMASTER_JENFU_SSO_BROKER_ORIGIN: localBrokerOrigin,
      JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: 'owner-nonprod@project.iam.gserviceaccount.com',
    }
    googleAuthMocks.getClient.mockRejectedValue(new Error('source credential unavailable'))
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${localBrokerOrigin}/api/sso`)
    const rejected = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(rejected.status).toBe(502)
    expect(await rejected.json()).toMatchObject({ code: 'sso_dependency_unavailable' })
    expect(googleAuthMocks.getIdTokenClient).not.toHaveBeenCalled()
    expect(googleAuthMocks.Impersonated).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('uses and clears only the local transaction cookie for loopback HTTP development', async () => {
    const value=runtime()
    if (!value.configResult.configured) throw new Error('missing fixture config')
    value.configResult.config.publicBaseUrl=new URL('http://127.0.0.1:5000')
    value.configResult.config.secureCookie=false
    const deps=dependencies('on')
    deps.environment={...deps.environment,NODE_ENV:'test'}
    const base=await listen(value,deps)
    const start=await fetch(`${base}/api/auth/jenfu-sso/start`,{redirect:'manual'})
    const cookie=start.headers.get('set-cookie')!
    expect(cookie).toMatch(/^orgmaster_sso_tx=/u)
    expect(cookie).toContain('Path=/; HttpOnly; SameSite=Lax')
    expect(cookie).not.toContain('Secure')
    expect(cookie).not.toContain('__Host-')
    const location=new URL(start.headers.get('location')!)
    const callback=new URL('/api/auth/jenfu-sso/callback',base)
    callback.search=new URLSearchParams({code:'opaque-code',state:location.searchParams.get('state')!,iss:`${brokerOrigin}/api/sso`}).toString()
    const accepted=await fetch(callback,{redirect:'manual',headers:{cookie:cookie.split(';')[0]}})
    expect(accepted.status).toBe(303)
    expect(accepted.headers.get('set-cookie')).toContain('orgmaster_sso_tx=; Max-Age=0')
    expect(value.sessions!.create).toHaveBeenCalledOnce()
  })

  it('does not accept the local cookie name on the HTTPS handoff lane',async()=>{
    const value=runtime(),deps=dependencies('on'),base=await listen(value,deps)
    const start=await fetch(`${base}/api/auth/jenfu-sso/start`,{redirect:'manual'})
    const cookie=start.headers.get('set-cookie')!
    expect(cookie).toMatch(/^__Host-jenfu_sso_tx=/u)
    expect(cookie).toContain('; Secure')
    expect(cookie).not.toContain('Domain=')
    const location=new URL(start.headers.get('location')!)
    const callback=new URL('/api/auth/jenfu-sso/callback',base)
    callback.search=new URLSearchParams({code:'opaque-code',state:location.searchParams.get('state')!,iss:`${brokerOrigin}/api/sso`}).toString()
    const rejected=await fetch(callback,{redirect:'manual',headers:{cookie:cookie.split(';')[0].replace('__Host-jenfu_sso_tx=','orgmaster_sso_tx=')}})
    expect(rejected.status).toBe(400)
    expect(deps.serviceToken).not.toHaveBeenCalled()
    expect(value.sessions!.create).not.toHaveBeenCalled()
  })

  it('rejects callback when original authentication time is at or before revokedBefore', async () => {
    const value = runtime()
    vi.mocked(value.epochs!.readPrincipalState).mockResolvedValue({ authEpoch: 7, revokedBefore: '2026-09-17T02:56:00.000Z' })
    const base = await listen(value, dependencies('on'))
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const denied = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ code: 'sso_principal_stale' })
    expect(value.sessions!.create).not.toHaveBeenCalled()
  })

  it('issues a principal-bound v2 session and rejects a v1 authorization field on v2', async () => {
    const v2 = { ...handoff(), contractVersion: 'jenfu.sso-handoff.v2' }
    delete (v2 as Partial<typeof v2>).authorization
    const value = runtime()
    const base = await listen(value, dependencies('on', v2 as ReturnType<typeof handoff>))
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const location = new URL(start.headers.get('location')!)
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'opaque-code')
    callback.searchParams.set('state', location.searchParams.get('state')!)
    callback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const accepted = await fetch(callback, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    expect(accepted.status).toBe(303)
    expect(value.epochs!.readPrincipalState).toHaveBeenCalledWith('principal-1')
    expect(value.epochs!.readState).not.toHaveBeenCalled()
    expect(value.sessions!.create).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'principal-1', authEpoch: 0, sessionSchemaVersion: 2,
      epochKind: 'principal', principalAuthEpoch: 7,
    }))

    const malformed = { ...v2, authorization: { applicationId: 'orgmaster', assignmentVersion: 1 } }
    const deniedValue = runtime()
    const deniedBase = await listen(deniedValue, dependencies('on', malformed as ReturnType<typeof handoff>))
    const deniedStart = await fetch(`${deniedBase}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    const deniedLocation = new URL(deniedStart.headers.get('location')!)
    const deniedCallback = new URL('/api/auth/jenfu-sso/callback', deniedBase)
    deniedCallback.searchParams.set('code', 'opaque-code')
    deniedCallback.searchParams.set('state', deniedLocation.searchParams.get('state')!)
    deniedCallback.searchParams.set('iss', `${brokerOrigin}/api/sso`)
    const denied = await fetch(deniedCallback, { redirect: 'manual', headers: { cookie: deniedStart.headers.get('set-cookie')!.split(';')[0] } })
    expect(denied.status).toBe(400)
    expect(deniedValue.sessions!.create).not.toHaveBeenCalled()
  })
})

const producerProofPath = process.env.DEV015_HANDOFF_PROOF_INPUT
if (producerProofPath) {
  it('accepts the Platform producer proof through the OrgMaster HTTP callback', async () => {
    const proof = (JSON.parse(readFileSync(producerProofPath, 'utf8')) as { orgmaster: ReturnType<typeof handoff> }).orgmaster
    const issuedAt = Date.parse(proof.issuedAt)
    expect(parseHandoff(proof, proof.issuer, issuedAt + 1_000)).toMatchObject({
      audience: 'orgmaster', identity: { principalId: proof.identity.principalId },
    })
    const value = runtime()
    if (!value.configResult.configured) throw new Error('missing test config')
    value.configResult.config.publicBaseUrl = new URL('https://orgmaster.example.test')
    vi.mocked(value.epochs!.readPrincipalState).mockResolvedValue({ authEpoch: proof.authState.authEpoch, revokedBefore: null })
    const deps = dependencies('on', proof)
    deps.now = () => issuedAt + 1_000
    deps.environment = { NODE_ENV: 'test', ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on',
      ORGMASTER_JENFU_SSO_BROKER_ORIGIN: new URL(proof.issuer).origin }
    const base = await listen(value, deps)
    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    expect(start.status).toBe(303)
    const authorize = new URL(start.headers.get('location')!)
    expect(authorize.searchParams.get('redirect_uri')).toBe('https://orgmaster.example.test/api/auth/jenfu-sso/callback')
    const callback = new URL('/api/auth/jenfu-sso/callback', base)
    callback.searchParams.set('code', 'producer-issued-code')
    callback.searchParams.set('state', authorize.searchParams.get('state')!)
    callback.searchParams.set('iss', proof.issuer)
    const accepted = await fetch(callback, { redirect: 'manual', headers: {
      cookie: start.headers.get('set-cookie')!.split(';')[0],
    } })
    expect(accepted.status).toBe(303)
    expect(accepted.headers.get('set-cookie')).toContain('orgmaster_session=')
    expect(value.sessions!.create).toHaveBeenCalledWith(expect.objectContaining({
      principalId: proof.identity.principalId, employeeId: proof.identity.employeeId,
      principalAuthEpoch: proof.authState.authEpoch, epochKind: 'principal', sessionSchemaVersion: 2,
    }))
    const exchangeBody = new URLSearchParams(vi.mocked(deps.fetch!).mock.calls[0][1]?.body as string)
    expect(exchangeBody.get('redirect_uri')).toBe('https://orgmaster.example.test/api/auth/jenfu-sso/callback')
  })
}
