import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterAuthMiddleware, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import type { OrgmasterAuthConfig } from './orgmasterAuthConfig'
import { hashSessionToken } from './orgmasterAuthCookies'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const openServers: Array<ReturnType<typeof createServer>> = []
afterEach(async () => { await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

function configuredRuntime(overrides: Partial<OrgmasterAuthRuntime> = {}) {
  const config: OrgmasterAuthConfig = {
    publicBaseUrl: new URL('http://127.0.0.1'), postgresUrl: 'postgres://test', sessionHashPepper: 'test-pepper',
    firebaseProjectId: 'jenfu-test', identityIssuer: 'https://securetoken.google.com/jenfu-test', identityAudience: 'jenfu-test',
    firebasePublicConfig: { apiKey: 'public-key', authDomain: 'jenfu-test.firebaseapp.com', projectId: 'jenfu-test', appId: 'app-id' }, secureCookie: false,
  }
  const sessions = new Map<string, OrgmasterSession>()
  const runtime: OrgmasterAuthRuntime = {
    configResult: { configured: true, config },
    firebase: { verifyIdToken: vi.fn(async () => ({ issuer: config.identityIssuer, subject: 'uid-1', assuranceLevel: 'aal1' as const, authenticatedAt: new Date().toISOString() })) },
    principals: { resolveActivePrincipal: vi.fn(async () => ({ principalId: 'principal-1', employeeId: 'employee-1', mappingVersion: 1, publishedAt: new Date().toISOString() })) },
    epochs: { read: vi.fn(async () => 0) },
    sessions: {
      create: vi.fn(async (input) => {
        const session: OrgmasterSession = { id: 'session-row-1', identityIssuer: input.identityIssuer, identitySubject: input.identitySubject, principalId: input.principalId, employeeId: input.employeeId, authEpoch: input.authEpoch, issuedAt: input.issuedAt, authenticatedAt: input.authenticatedAt, expiresAt: input.expiresAt, revokedAt: null, assuranceLevel: input.assuranceLevel }
        sessions.set(input.sessionIdHash, session)
        return session
      }),
      findByHash: vi.fn(async (hash) => sessions.get(hash) ?? null),
      revokeByHash: vi.fn(async (hash) => { const session = sessions.get(hash); if (session) sessions.set(hash, { ...session, revokedAt: new Date().toISOString() }) }),
    },
    ...overrides,
  }
  return { runtime, config, sessions }
}

async function listen(runtime: OrgmasterAuthRuntime, businessRead: () => void = () => undefined, devEnabled = false) {
  const auth = createOrgmasterAuthMiddleware(() => runtime, devEnabled)
  const server = createServer((request, response) => auth(request, response, () => { businessRead(); response.statusCode = 200; response.end('protected') }))
  openServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing test address')
  return `http://127.0.0.1:${address.port}`
}

describe('OrgMaster auth middleware', () => {
  it('denies an unauthenticated request before any business read', async () => {
    const { runtime } = configuredRuntime()
    let reads = 0
    const base = await listen(runtime, () => { reads += 1 })
    const response = await fetch(`${base}/api/orgmaster/document`)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'auth_session_invalid' })
    expect(response.headers.get('x-correlation-id')).toBeTruthy()
    expect(reads).toBe(0)
  })

  it('exchanges a verified Firebase token for an opaque host cookie without returning a token', async () => {
    const { runtime, config } = configuredRuntime()
    const authenticatedAt = '2026-09-02T01:02:03.000Z'
    vi.mocked(runtime.firebase!.verifyIdToken).mockResolvedValueOnce({
      issuer: config.identityIssuer,
      subject: 'uid-1',
      assuranceLevel: 'aal2',
      authenticatedAt,
    })
    const base = await listen(runtime)
    config.publicBaseUrl = new URL(base)
    const response = await fetch(`${base}/api/auth/firebase/session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ idToken: 'firebase-id-token' }),
    })
    const body = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/^orgmaster_session=[^;]+; Max-Age=28800; Path=\/; HttpOnly; SameSite=Lax$/)
    expect(JSON.stringify(body)).not.toContain('firebase-id-token')
    expect(body).not.toHaveProperty('token')
    expect(runtime.sessions!.create).toHaveBeenCalledWith(expect.objectContaining({
      assuranceLevel: 'aal2',
      authenticatedAt,
    }))
  })

  it('rechecks active principal and epoch on every protected request and rejects a stale epoch', async () => {
    const { runtime, config, sessions } = configuredRuntime()
    const token = 'opaque-test-token-with-at-least-32-random-looking-bytes'
    sessions.set(hashSessionToken(config.sessionHashPepper, token), {
      id: 'session-row-1', identityIssuer: config.identityIssuer, identitySubject: 'uid-1', principalId: 'principal-1', employeeId: 'employee-1',
      authEpoch: 0, issuedAt: new Date().toISOString(), authenticatedAt: null, expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1',
    })
    const base = await listen(runtime)
    const first = await fetch(`${base}/api/protected`, { headers: { cookie: `orgmaster_session=${token}` } })
    expect(first.status).toBe(200)
    expect(runtime.principals!.resolveActivePrincipal).toHaveBeenCalledTimes(1)
    expect(runtime.epochs!.read).toHaveBeenCalledTimes(1)
    vi.mocked(runtime.epochs!.read).mockResolvedValueOnce(1)
    const second = await fetch(`${base}/api/protected`, { headers: { cookie: `orgmaster_session=${token}` } })
    expect(second.status).toBe(401)
    expect(await second.json()).toMatchObject({ code: 'auth_epoch_stale' })
    expect(runtime.principals!.resolveActivePrincipal).toHaveBeenCalledTimes(2)
    expect(runtime.epochs!.read).toHaveBeenCalledTimes(2)
  })

  it('allows the development identity only for exact headers on loopback', async () => {
    const runtime: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'test' } }
    const base = await listen(runtime, () => undefined, true)
    const incomplete = await fetch(`${base}/api/protected`, { headers: { 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev' } })
    expect(incomplete.status).toBe(401)
    const exact = await fetch(`${base}/api/protected`, { headers: { 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin' } })
    expect(exact.status).toBe(200)
  })

  it('creates an allowlisted one-click development session and logs out without configured production dependencies', async () => {
    const runtime: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'test' } }
    const base = await listen(runtime, () => undefined, true)
    const profilesResponse = await fetch(`${base}/api/auth/development/profiles`)
    const profilesBody = await profilesResponse.json() as { profiles: Array<Record<string, unknown>> }
    expect(profilesResponse.status).toBe(200)
    expect(profilesBody.profiles).toHaveLength(4)
    expect(profilesBody).toMatchObject({ session: null })
    expect(profilesBody.profiles.map((profile) => profile.roleName)).toEqual(['OrgMaster 管理者', '人員治理者', '管理辦法維護者', '一般員工'])
    expect(JSON.stringify(profilesBody)).not.toContain('subject')
    expect(JSON.stringify(profilesBody)).not.toContain('principal')

    const loginResponse = await fetch(`${base}/api/auth/development/session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ profileId: 'governance-manager' }),
    })
    const loginBody = await loginResponse.json() as Record<string, any>
    expect(loginResponse.status).toBe(200)
    expect(loginBody).toMatchObject({
      user: { principalId: 'dev-principal-governance-manager', employeeId: 'employee-youhao' },
      developmentProfile: { id: 'governance-manager', roleCode: 'orgmaster_governance_manager', employeeName: '張祐豪' },
    })
    expect(loginResponse.headers.get('set-cookie')).toMatch(/^orgmaster_dev_profile=governance-manager; Max-Age=28800; Path=\/; HttpOnly; SameSite=Strict$/)
    const cookie = loginResponse.headers.get('set-cookie')!.split(';')[0]

    const meResponse = await fetch(`${base}/api/auth/me`, { headers: { cookie } })
    expect(meResponse.status).toBe(200)
    expect(await meResponse.json()).toMatchObject({ developmentProfile: { id: 'governance-manager' } })
    const selectedProfilesResponse = await fetch(`${base}/api/auth/development/profiles`, { headers: { cookie } })
    expect(await selectedProfilesResponse.json()).toMatchObject({ session: { developmentProfile: { id: 'governance-manager' } } })
    const protectedResponse = await fetch(`${base}/api/protected`, { headers: { cookie } })
    expect(protectedResponse.status).toBe(200)

    const logoutResponse = await fetch(`${base}/api/auth/logout`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie }, body: '{}',
    })
    expect(logoutResponse.status).toBe(200)
    expect(logoutResponse.headers.get('set-cookie')).toContain('orgmaster_dev_profile=; Max-Age=0')
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401)
  })

  it('keeps development profile login same-origin and unavailable outside development mode', async () => {
    const runtime: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'test' } }
    const developmentBase = await listen(runtime, () => undefined, true)
    const wrongOrigin = await fetch(`${developmentBase}/api/auth/development/session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://example.test' }, body: JSON.stringify({ profileId: 'administrator' }),
    })
    expect(wrongOrigin.status).toBe(403)
    expect(await wrongOrigin.json()).toMatchObject({ code: 'auth_origin_invalid' })

    const productionBase = await listen(runtime)
    const hidden = await fetch(`${productionBase}/api/auth/development/profiles`)
    expect(hidden.status).toBe(404)
    const rejected = await fetch(`${productionBase}/api/auth/development/session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: productionBase }, body: JSON.stringify({ profileId: 'administrator' }),
    })
    expect(rejected.status).toBe(404)
  })

  it('treats a malformed cookie as an invalid session instead of a server outage', async () => {
    const { runtime } = configuredRuntime()
    const base = await listen(runtime)
    const response = await fetch(`${base}/api/protected`, { headers: { cookie: 'orgmaster_session=%E0%A4%A' } })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'auth_session_invalid' })
  })

  it('returns a stable 413 response for an oversized authentication body', async () => {
    const { runtime, config } = configuredRuntime()
    const base = await listen(runtime)
    config.publicBaseUrl = new URL(base)
    const response = await fetch(`${base}/api/auth/firebase/session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ idToken: 'x'.repeat(33 * 1024) }),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'auth_request_too_large' })
  })
})
