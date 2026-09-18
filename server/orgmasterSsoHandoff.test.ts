import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterAuthMiddleware, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import type { OrgmasterAuthConfig } from './orgmasterAuthConfig'
import type { OrgmasterSsoHandoffDependencies } from './orgmasterSsoHandoff'

const openServers: Array<ReturnType<typeof createServer>> = []
afterEach(async () => { await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

const now = Date.parse('2026-09-17T03:00:00.000Z')
const publicOrigin = 'https://orgmaster-stg-123456789.asia-east1.run.app'
const brokerOrigin = 'https://jenfu-platform-stg-123456789.asia-east1.run.app'

function runtime() {
  const config: OrgmasterAuthConfig = {
    publicBaseUrl: new URL(publicOrigin), postgresUrl: 'postgres://test', sessionHashPepper: 'p'.repeat(32), firebaseProjectId: 'jenfu-platform-nonprod',
    identityIssuer: 'https://securetoken.google.com/jenfu-platform-nonprod', identityAudience: 'jenfu-platform-nonprod',
    firebasePublicConfig: { apiKey: 'public-api-key', authDomain: 'jenfu-platform-nonprod.firebaseapp.com', projectId: 'jenfu-platform-nonprod', appId: '1:2:web:abc' }, secureCookie: true,
  }
  const value: OrgmasterAuthRuntime = {
    configResult: { configured: true, config }, ssoHandoffEnabled: true,
    principals: { resolveActivePrincipal: vi.fn(async () => ({ principalId: 'principal-1', employeeId: 'employee-1', mappingVersion: 1, publishedAt: new Date(now).toISOString() })) },
    epochs: { read: vi.fn(async () => 7), readState: vi.fn(async () => ({ authEpoch: 7, revokedBefore: null })) },
    sessions: { create: vi.fn(async (input) => ({ id: 'session-1', ...input, revokedAt: null })), findByHash: vi.fn(async () => null), revokeByHash: vi.fn(async () => undefined) },
  }
  return value
}

function handoff() {
  return {
    contractVersion: 'jenfu.sso-handoff.v1', issuer: `${brokerOrigin}/api/sso`, audience: 'orgmaster',
    identity: { identityIssuer: 'https://securetoken.google.com/jenfu-platform-nonprod', identitySubject: 'uid-1', principalId: 'principal-1', employeeId: 'employee-1' },
    authorization: { applicationId: 'orgmaster', assignmentVersion: 1 },
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
    expect(value.epochs!.readState).toHaveBeenCalledWith('https://securetoken.google.com/jenfu-platform-nonprod', 'uid-1')
    expect(value.sessions!.create).toHaveBeenCalledWith(expect.objectContaining({
      authEpoch: 7,
      authenticatedAt: '2026-09-17T02:55:00.000Z',
      expiresAt: '2026-09-17T04:00:00.000Z',
    }))
    expect(accepted.headers.get('set-cookie')).toContain('Max-Age=3600')
  })

  it('rejects callback when original authentication time is at or before revokedBefore', async () => {
    const value = runtime()
    vi.mocked(value.epochs!.readState).mockResolvedValue({ authEpoch: 7, revokedBefore: '2026-09-17T02:56:00.000Z' })
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
})
