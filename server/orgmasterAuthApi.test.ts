import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterAuthMiddleware, createOrgmasterAuthRuntime, isAllowedOrgmasterRequestOrigin, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import type { OrgmasterAuthConfig } from './orgmasterAuthConfig'
import { hashSessionToken } from './orgmasterAuthCookies'
import type { OrgmasterSession } from './orgmasterSessionRepository'
import { PrincipalAdmissionError } from './orgmasterPrincipalAdmissionRepository'

const openServers: Array<ReturnType<typeof createServer>> = []
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

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
    epochs: { read: vi.fn(async () => 0), readState: vi.fn(async () => ({ authEpoch: 0, revokedBefore: null })), readPrincipalState: vi.fn(async () => ({ authEpoch: 0, revokedBefore: null })) },
    sessions: {
      create: vi.fn(async (input) => {
        const session: OrgmasterSession = { id: 'session-row-1', identityIssuer: input.identityIssuer, identitySubject: input.identitySubject, principalId: input.principalId, employeeId: input.employeeId, authEpoch: input.authEpoch, sessionSchemaVersion: input.sessionSchemaVersion ?? 1, epochKind: input.epochKind ?? 'provider_pair', principalAuthEpoch: input.principalAuthEpoch ?? null, issuedAt: input.issuedAt, authenticatedAt: input.authenticatedAt, expiresAt: input.expiresAt, revokedAt: null, assuranceLevel: input.assuranceLevel }
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
  it('keeps local principal sandbox requests on native session middleware and hides synthetic development profiles', async () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    const session: OrgmasterSession = {
      id: 'local-session-row', identityIssuer: 'urn:jenfu:local-principal-sandbox', identitySubject: 'local-scenario',
      principalId: 'local-principal', employeeId: 'employee-local-principal', authEpoch: 3,
      sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 3,
      issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1',
    }
    const localSandbox = {
      enabledCandidate: true,
      mode: vi.fn(async (correlationId: string) => ({ authMode: 'local_principal_sandbox' as const, localSandboxEnabled: true as const, correlationId })),
      start: vi.fn(async () => ({ location: 'http://127.0.0.1:8000/api/local-sandbox/authorize?clientId=orgmaster&redirectUri=http%3A%2F%2F127.0.0.1%3A5173%2Fapi%2Fauth%2Flocal-sandbox%2Fcallback', cookie: 'orgmaster_local_tx_test=transaction; Path=/api/auth/local-sandbox/callback' })),
      callback: vi.fn(async () => ({ location: '/', cookie: 'orgmaster_local_session_test=token; Path=/', clearTransactionCookie: 'orgmaster_local_tx_test=; Max-Age=0' })),
      verify: vi.fn(async () => ({ session, profile: {} as never, persistenceTargetUrl: 'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_auth_test' })),
      logout: vi.fn(async () => ({ cookies: ['orgmaster_local_session_test=; Max-Age=0'] })),
      clearSessionCookie: vi.fn(async () => 'orgmaster_local_session_test=; Max-Age=0'),
      close: vi.fn(async () => undefined),
    }
    const runtime: OrgmasterAuthRuntime = {
      configResult: { configured: false, missing: [], reason: 'local test mode' },
      localSandbox: localSandbox as unknown as NonNullable<OrgmasterAuthRuntime['localSandbox']>,
    }
    const base = await listen(runtime, () => undefined, true)
    const mode = await fetch(`${base}/api/auth/mode`)
    expect(mode.status).toBe(200)
    expect(await mode.json()).toMatchObject({ authMode: 'local_principal_sandbox', localSandboxEnabled: true })
    expect((await fetch(`${base}/api/auth/development/profiles`)).status).toBe(404)
    expect((await fetch(`${base}/api/auth/firebase/session`, { method: 'POST' })).status).toBe(410)

    const start = await fetch(`${base}/api/auth/jenfu-sso/start`, { redirect: 'manual' })
    expect(start.status).toBe(302)
    expect(start.headers.get('location')).toContain('%2Fapi%2Fauth%2Flocal-sandbox%2Fcallback')
    expect(start.headers.get('set-cookie')).toContain('orgmaster_local_tx_test')

    expect((await fetch(`${base}/api/protected`)).status).toBe(200)
    expect((await fetch(`${base}/api/protected`)).status).toBe(200)
    expect(localSandbox.verify).toHaveBeenCalledTimes(2)
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{}',
    })
    expect(logout.status).toBe(200)
    expect(localSandbox.logout).toHaveBeenCalledTimes(1)
    expect(runtime.firebase).toBeUndefined()
  })

  it('selects local-only runtime before reading formal Firebase or Google configuration', () => {
    const environment = { NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1' } as NodeJS.ProcessEnv
    const runtime = createOrgmasterAuthRuntime(environment)
    expect(runtime.localSandbox?.enabledCandidate).toBe(true)
    expect(runtime.firebase).toBeUndefined()
    expect(runtime.principals).toBeUndefined()
    expect(runtime.sessions).toBeUndefined()
    return runtime.localSandbox?.close()
  })

  it.each(['runtime', 'environment'] as const)('disables dev profiles, cookies and headers when SSO is enabled by %s', async authority => {
    if (authority === 'environment') vi.stubEnv('ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'on')
    const { runtime } = configuredRuntime({ ssoHandoffEnabled: authority === 'runtime' })
    let reads = 0
    const base = await listen(runtime, () => { reads++ }, true)
    expect((await fetch(`${base}/api/auth/development/profiles`)).status).toBe(404)
    const login = await fetch(`${base}/api/auth/development/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ profileId: 'administrator' }) })
    expect(login.status).toBe(404)
    expect(login.headers.get('set-cookie')).toBeNull()
    for (const headers of [
      { cookie: 'orgmaster_dev_profile=administrator' },
      { 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin' },
    ]) {
      expect((await fetch(`${base}/api/auth/me`, { headers })).status).toBe(401)
      expect((await fetch(`${base}/api/protected`, { headers })).status).toBe(401)
    }
    expect(reads).toBe(0)
    expect(runtime.sessions!.create).not.toHaveBeenCalled()
  })

  it('keeps the real SSO Principal authoritative over stale dev cookies/headers and revokes its session on logout', async () => {
    const { runtime, config, sessions } = configuredRuntime({ ssoHandoffEnabled: true })
    sessions.set(hashSessionToken(config.sessionHashPepper, 'real-local-session'), {
      id: 'real-session', identityIssuer: config.identityIssuer, identitySubject: 'uid-1', principalId: 'principal-1', employeeId: 'employee-1', authEpoch: 0,
      sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0, issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00Z', revokedAt: null, assuranceLevel: 'aal1',
    })
    const base = await listen(runtime, () => undefined, true)
    config.publicBaseUrl = new URL(base)
    const headers = { cookie: 'orgmaster_session=real-local-session; orgmaster_dev_profile=administrator', 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin' }
    const response = await fetch(`${base}/api/auth/me`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ user: { principalId: 'principal-1', employeeId: 'employee-1' } })
    expect(body).not.toHaveProperty('developmentProfile')
    expect(runtime.epochs!.readPrincipalState).toHaveBeenCalledWith('principal-1')
    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body: '{}' })
    expect(logout.status).toBe(200)
    expect(runtime.sessions!.revokeByHash).toHaveBeenCalledExactlyOnceWith(hashSessionToken(config.sessionHashPepper, 'real-local-session'), 'local_logout')
    expect((await fetch(`${base}/api/auth/me`, { headers })).status).toBe(401)
  })
  it('returns only the verified session employee email, ignoring caller target IDs', async () => {
    const readSessionEmail = vi.fn(async () => 'jed@example.test')
    const { runtime, config, sessions } = configuredRuntime({ readSessionEmail })
    sessions.set(hashSessionToken(config.sessionHashPepper, 'valid-session'), {
      id: 'session-1', identityIssuer: config.identityIssuer, identitySubject: 'uid-1', principalId: 'principal-1', employeeId: 'employee-1', authEpoch: 0,
      sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0, issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00Z', revokedAt: null, assuranceLevel: 'aal1',
    })
    const base = await listen(runtime)
    const response = await fetch(base + '/api/auth/me?employeeId=another-employee', { headers: { cookie: 'orgmaster_session=valid-session' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ user: { employeeId: 'employee-1', principalId: 'principal-1', email: 'jed@example.test' } })
    expect(readSessionEmail).toHaveBeenCalledExactlyOnceWith('employee-1')
    readSessionEmail.mockRejectedValueOnce(new Error('directory unavailable'))
    const fallback = await fetch(base + '/api/auth/me', { headers: { cookie: 'orgmaster_session=valid-session' } })
    expect(fallback.status).toBe(200)
    expect(await fallback.json()).toMatchObject({ user: { employeeId: 'employee-1', email: null } })
    const calls = readSessionEmail.mock.calls.length
    runtime.epochs!.readPrincipalState = vi.fn(async () => ({ authEpoch: 1, revokedBefore: null }))
    expect((await fetch(base + '/api/auth/me', { headers: { cookie: 'orgmaster_session=valid-session' } })).status).toBe(401)
    expect((await fetch(base + '/api/auth/me')).status).toBe(401)
    expect(readSessionEmail).toHaveBeenCalledTimes(calls)
  })

  it('reports employee-number management independently from DWD-backed managed login', async () => {
    const { runtime } = configuredRuntime()
    Object.assign(runtime, {
      managedLoginEnabled: false,
      employeeNumberManagementEnabled: true,
      managedIdentity: {},
    })
    const base = await listen(runtime)

    const response = await fetch(base + '/api/auth/mode')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      managedLoginEnabled: false,
      employeeNumberManagementEnabled: true,
    })
    runtime.managedIdentity = undefined
    const withoutService = await fetch(base + '/api/auth/mode')
    expect(await withoutService.json()).toMatchObject({
      managedLoginEnabled: false,
      employeeNumberManagementEnabled: false,
    })
  })

  it('allows only the canonical and one exact V3 candidate origin', () => {
    const { config } = configuredRuntime()
    config.publicBaseUrl = new URL('https://orgmaster-prod-9536592944.asia-east1.run.app')
    const environment = { ORGMASTER_RELEASE_CANDIDATE_ORIGIN: 'https://candidate-0123456789ab---orgmaster-prod-9536592944.asia-east1.run.app' }
    expect(isAllowedOrgmasterRequestOrigin(config.publicBaseUrl.origin, config, environment)).toBe(true)
    expect(isAllowedOrgmasterRequestOrigin(environment.ORGMASTER_RELEASE_CANDIDATE_ORIGIN, config, environment)).toBe(true)
    for (const origin of [
      'https://candidate-ffffffffffff---orgmaster-prod-9536592944.asia-east1.run.app',
      'https://candidate-0123456789ab---ai-pdm-prod-9536592944.asia-east1.run.app',
      'https://candidate-01234567-9---orgmaster-prod-legacy.a.run.app',
      'https://candidate-0123456789ab---orgmaster-prod-9536592944.us-central1.run.app',
      'https://candidate-0123456789ab---orgmaster-prod-9536592944.asia-east1.run.app/path',
    ]) expect(isAllowedOrgmasterRequestOrigin(origin, config, environment)).toBe(false)
  })

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

  it('retires direct Firebase session creation before token verification', async () => {
    const { runtime, config } = configuredRuntime()
    const base = await listen(runtime)
    config.publicBaseUrl = new URL(base)
    const response = await fetch(base + '/api/auth/firebase/session', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ idToken: 'firebase-id-token', managedIdentifier: 'JFS0001' }),
    })
    expect(response.status).toBe(410)
    expect(await response.json()).toMatchObject({ code: 'auth_route_retired' })
    expect(runtime.firebase!.verifyIdToken).not.toHaveBeenCalled()
    expect(runtime.sessions!.create).not.toHaveBeenCalled()
  })

  it('rejects retained provider-pair sessions before protected reads', async () => {
    const { runtime, config, sessions } = configuredRuntime()
    const token = 'opaque-test-token-with-at-least-32-random-looking-bytes'
    sessions.set(hashSessionToken(config.sessionHashPepper, token), {
      id: 'session-row-1', identityIssuer: config.identityIssuer, identitySubject: 'uid-1',
      principalId: 'principal-1', employeeId: 'employee-1',
      authEpoch: 0, sessionSchemaVersion: 1, epochKind: 'provider_pair', principalAuthEpoch: null,
      issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1',
    })
    let reads = 0
    const base = await listen(runtime, () => { reads += 1 })
    const response = await fetch(base + '/api/protected', { headers: { cookie: 'orgmaster_session=' + token } })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'auth_session_invalid' })
    expect(runtime.principals!.resolveActivePrincipal).not.toHaveBeenCalled()
    expect(runtime.epochs!.readState).not.toHaveBeenCalled()
    expect(reads).toBe(0)
  })

  it('checks v2 principal epoch without consulting the retained pair epoch', async () => {
    const { runtime, config, sessions } = configuredRuntime()
    const token = 'principal-session-token-with-at-least-32-random-looking-bytes'
    sessions.set(hashSessionToken(config.sessionHashPepper, token), {
      id: 'session-row-2', identityIssuer: config.identityIssuer, identitySubject: 'uid-1', principalId: 'principal-1', employeeId: 'employee-1',
      authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0,
      issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1',
    })
    const base = await listen(runtime)
    const first = await fetch(`${base}/api/protected`, { headers: { cookie: `orgmaster_session=${token}` } })
    expect(first.status).toBe(200)
    expect(runtime.epochs!.readPrincipalState).toHaveBeenCalledWith('principal-1')
    expect(runtime.epochs!.readState).not.toHaveBeenCalled()
    vi.mocked(runtime.epochs!.readPrincipalState).mockResolvedValueOnce({ authEpoch: 1, revokedBefore: null })
    const second = await fetch(`${base}/api/protected`, { headers: { cookie: `orgmaster_session=${token}` } })
    expect(second.status).toBe(401)
    expect(await second.json()).toMatchObject({ code: 'auth_epoch_stale' })
  })

  it('emits local-only sanitized diagnostics for the failing session auth stage', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { runtime } = configuredRuntime()
    const token = 'diagnostic-session-token-that-must-not-be-logged'
    const secretMessage = `private-error ${token} sentinel`
    const lookupError = Object.assign(new Error(secretMessage), { code: '08006' })
    runtime.sessions!.findByHash = vi.fn(async () => { throw lookupError })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const base = await listen(runtime)

    const response = await fetch(`${base}/api/protected`, {
      headers: { cookie: `orgmaster_session=${token}`, 'x-correlation-id': 'local-auth-diag-001' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auth_server_not_configured' })
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('ORGMASTER_AUTH_DIAGNOSTIC')
    const diagnostic = JSON.parse(String(log.mock.calls[0]?.[1])) as Record<string, unknown>
    expect(diagnostic).toMatchObject({
      event: 'orgmaster_auth_failure',
      correlationId: 'local-auth-diag-001',
      stage: 'session_lookup',
      errorName: 'Error',
      errorCode: '08006',
    })
    expect(Array.isArray(diagnostic.stackFrames)).toBe(true)
    expect((diagnostic.stackFrames as string[]).length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(diagnostic)).not.toContain(secretMessage)
    expect(JSON.stringify(diagnostic)).not.toContain(token)
  })

  it('identifies principal resolution and principal state failures without exposing error messages', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const token = 'diagnostic-principal-stage-token-that-must-not-be-logged'
    const cases = [
      { stage: 'principal_resolution', fail: (runtime: OrgmasterAuthRuntime) => {
        runtime.principals!.resolveActivePrincipal = vi.fn(async () => { throw new PrincipalAdmissionError('principal_directory_unavailable') })
      } },
      { stage: 'principal_state', fail: (runtime: OrgmasterAuthRuntime) => {
        runtime.epochs!.readPrincipalState = vi.fn(async () => { throw new Error(`private-state-message ${token}`) })
      } },
    ] as const

    for (const [index, testCase] of cases.entries()) {
      const { runtime, config, sessions } = configuredRuntime()
      sessions.set(hashSessionToken(config.sessionHashPepper, token), {
        id: `diagnostic-session-${index}`, identityIssuer: config.identityIssuer, identitySubject: 'uid-1',
        principalId: 'principal-1', employeeId: 'employee-1', authEpoch: 0,
        sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0,
        issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1',
      })
      testCase.fail(runtime)
      const base = await listen(runtime)
      const response = await fetch(`${base}/api/protected`, { headers: { cookie: `orgmaster_session=${token}` } })

      expect(response.status).toBe(503)
      const entries = log.mock.calls.map((call) => JSON.parse(String(call[1])) as Record<string, unknown>)
      expect(entries.at(-1)).toMatchObject({ stage: testCase.stage })
      expect(JSON.stringify(entries.at(-1))).not.toContain(token)
      expect((entries.at(-1)?.stackFrames as string[]).length).toBeLessThanOrEqual(3)
    }
  })

  it('does not emit auth diagnostics for production mode or a nonlocal runtime URL', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { runtime: productionRuntime } = configuredRuntime()
    productionRuntime.sessions!.findByHash = vi.fn(async () => { throw new Error('private failure') })
    vi.stubEnv('NODE_ENV', 'production')
    const productionBase = await listen(productionRuntime)
    const productionResponse = await fetch(`${productionBase}/api/protected`, { headers: { cookie: 'orgmaster_session=opaque-token-value' } })
    expect(productionResponse.status).toBe(503)
    expect(log).not.toHaveBeenCalled()

    vi.stubEnv('NODE_ENV', 'development')
    const { runtime: remoteRuntime } = configuredRuntime()
    if (remoteRuntime.configResult.configured) remoteRuntime.configResult.config.publicBaseUrl = new URL('https://orgmaster.example.test')
    remoteRuntime.sessions!.findByHash = vi.fn(async () => { throw new Error('private failure') })
    const remoteBase = await listen(remoteRuntime)
    const remoteResponse = await fetch(`${remoteBase}/api/protected`, { headers: { cookie: 'orgmaster_session=another-opaque-token' } })
    expect(remoteResponse.status).toBe(503)
    expect(log).not.toHaveBeenCalled()
  })

  it('diagnoses missing runtime dependencies on local development requests', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ORGMASTER_PUBLIC_BASE_URL', 'http://127.0.0.1:5173')
    const runtime: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'test' } }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const base = await listen(runtime)

    const response = await fetch(`${base}/api/protected`)

    expect(response.status).toBe(503)
    expect(log).toHaveBeenCalledOnce()
    const diagnostic = JSON.parse(String(log.mock.calls[0]?.[1])) as Record<string, unknown>
    expect(diagnostic).toMatchObject({ stage: 'runtime_dependencies', errorCode: 'auth_server_not_configured' })
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

  it('does not parse oversized legacy login payloads on the retired route', async () => {
    const { runtime, config } = configuredRuntime()
    const base = await listen(runtime)
    config.publicBaseUrl = new URL(base)
    const response = await fetch(base + '/api/auth/firebase/session', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ idToken: 'x'.repeat(33 * 1024) }),
    })
    expect(response.status).toBe(410)
    expect(runtime.firebase!.verifyIdToken).not.toHaveBeenCalled()
  })

})
