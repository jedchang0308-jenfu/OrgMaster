import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { DUTY_CHAPTER_CATALOG_VERSION } from '../src/dutyMap'
import { createDutyMapSeed } from '../src/dutyMapSeed'
import { screenshotOrganizationState } from '../src/screenshotData'
import { createOrgmasterAuthMiddleware, OrgmasterAuthError, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { hashSessionToken } from './orgmasterAuthCookies'
import { createOrgmasterDutyMapMiddleware } from './dutyMapApi'
import { PrincipalAdmissionError } from './orgmasterPrincipalAdmissionRepository'
import { readVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  vi.unstubAllEnvs()
})
type Change = 'none' | 'revoked' | 'epoch-changed' | 'principal-disabled' | 'authority-unavailable' | 'session-replaced' | 'target-changed'
async function fixture(adapter: 'production' | 'local-sandbox' | 'development') {
  vi.stubEnv('ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'off')
  vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
  vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
  let change: Change = 'none'
  const now = new Date().toISOString()
  const session: OrgmasterSession = { id: '00000000-0000-4000-8000-000000000071', principalId: 'principal-1', employeeId: 'employee-1',
    identityIssuer: 'https://securetoken.google.com/isolated', identitySubject: 'native-subject', authEpoch: 0, principalAuthEpoch: 0,
    sessionSchemaVersion: 2, epochKind: 'principal', issuedAt: now, authenticatedAt: now, expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1' }
  const config = { publicBaseUrl: new URL('http://127.0.0.1'), postgresUrl: 'postgres://unused', sessionHashPepper: 'isolated-pepper', firebaseProjectId: 'isolated',
    identityIssuer: session.identityIssuer, identityAudience: 'isolated', secureCookie: false,
    firebasePublicConfig: { apiKey: 'public-fixture', authDomain: 'fixture.invalid', projectId: 'isolated', appId: 'fixture' } }
  const sessions = {
    create: async () => { throw new Error('not used') },
    findByHash: vi.fn(async (hash: string) => {
      if (hash !== hashSessionToken(config.sessionHashPepper, 'original-token')) return null
      return { ...session, revokedAt: change === 'revoked' ? now : null,
        id: change === 'session-replaced' ? '00000000-0000-4000-8000-000000000072' : session.id }
    }),
    revokeByHash: vi.fn(async () => { change = 'revoked' }),
  }
  const runtime: OrgmasterAuthRuntime = { configResult: { configured: true, config },
    firebase: { verifyIdToken: async () => { throw new Error('not used') } }, sessions,
    principals: { resolveActivePrincipal: vi.fn(async () => {
      if (change === 'principal-disabled') throw new PrincipalAdmissionError('principal_not_active')
      if (change === 'authority-unavailable') throw new PrincipalAdmissionError('principal_directory_unavailable')
      return { principalId: session.principalId, employeeId: session.employeeId, mappingVersion: 1, publishedAt: now }
    }) },
    epochs: { read: async () => 0, readState: async () => ({ authEpoch: 0, revokedBefore: null }),
      readPrincipalState: vi.fn(async () => ({ authEpoch: change === 'epoch-changed' ? 1 : 0, revokedBefore: null })) },
  }
  const sandboxVerify = vi.fn(async () => {
    if (change === 'revoked' || change === 'principal-disabled') throw new OrgmasterAuthError(401, 'auth_session_invalid')
    if (change === 'authority-unavailable') throw new OrgmasterAuthError(503, 'auth_server_not_configured')
    return { session: { ...session, principalAuthEpoch: change === 'epoch-changed' ? 1 : 0,
      id: change === 'session-replaced' ? '00000000-0000-4000-8000-000000000072' : session.id },
      profile: {} as never, persistenceTargetUrl: 'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_' + (change === 'target-changed' ? 'other' : 'test') }
  })
  if (adapter === 'local-sandbox') runtime.localSandbox = { enabledCandidate: true, verify: sandboxVerify } as unknown as NonNullable<OrgmasterAuthRuntime['localSandbox']>
  let sequence = 0
  const state = createDutyMapSeed({ ...structuredClone(screenshotOrganizationState), departments: [], duties: [], dutyMap: undefined,
    employees: [], positions: [], members: [], assignments: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
  }, () => `node-${++sequence}`)
  const organization = { document: createOrgDocumentFile(state, 'draft', now), version: { id: 'draft-1', name: '不變的草稿', kind: 'draft' as const,
    status: 'active' as const, revision: 'unchanged-revision', basedOnVersionId: null, createdAt: now, archivedAt: null, updatedAt: now, loadStatus: 'ready' as const } }
  const before = JSON.stringify(organization)
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  let finish!: () => void
  const released = new Promise<void>(resolve => { finish = resolve })
  const canReview = vi.fn(async () => true)
  const generate = vi.fn(async () => { entered(); await released; return { findings: [] } })
  const api = createOrgmasterDutyMapMiddleware('/isolated', async request => readVerifiedRequestIdentity(request)?.principalId,
    { readVersion: async () => structuredClone(organization), canReview, review: { generate } })
  const auth = createOrgmasterAuthMiddleware(() => runtime, adapter === 'development')
  const server = createServer((request, response) => auth(request, response, () => api(request, response, () => { response.statusCode = 404; response.end() })))
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing loopback address')
  const base = `http://127.0.0.1:${address.port}`
  config.publicBaseUrl = new URL(base)
  let cookie = 'orgmaster_session=original-token'
  if (adapter === 'development') {
    const login = await fetch(base + '/api/auth/development/session', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'administrator' }) })
    expect(login.status).toBe(200)
    cookie = login.headers.get('set-cookie')!.split(';')[0]
    await login.arrayBuffer()
  }
  const pending = fetch(base + '/api/orgmaster/duty-map/reviews', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ versionId: 'draft-1', expectedVersionRevision: 'unchanged-revision', chapterCatalogVersion: DUTY_CHAPTER_CATALOG_VERSION, requestId: 'delayed-request' }) })
  await started
  return { runtime, sessions, sandboxVerify, canReview, generate, finish, pending, setChange: (value: Change) => { change = value },
    logout: () => fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: '{}' }),
    assertSourceUnchanged: () => expect(JSON.stringify(organization)).toBe(before) }
}

describe('review request-bound trusted identity revalidation over real HTTP', () => {
  it.each(['production', 'local-sandbox', 'development'] as const)('permits a delayed valid review through the existing %s adapter', async adapter => {
    const f = await fixture(adapter)
    if (adapter === 'production') expect(f.sessions.findByHash).toHaveBeenCalledTimes(2)
    if (adapter === 'local-sandbox') expect(f.sandboxVerify).toHaveBeenCalledTimes(2)
    f.finish()
    const response = await f.pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ requestId: 'delayed-request', revision: 'unchanged-revision', findings: [] })
    if (adapter === 'production') expect(f.sessions.findByHash).toHaveBeenCalledTimes(3)
    if (adapter === 'local-sandbox') expect(f.sandboxVerify).toHaveBeenCalledTimes(3)
    expect(f.generate).toHaveBeenCalledTimes(1)
    expect(f.canReview).toHaveBeenCalledTimes(2)
    f.assertSourceUnchanged()
  })
  for (const adapter of ['production', 'local-sandbox'] as const) {
    it.each(['revoked', 'epoch-changed', 'principal-disabled', 'authority-unavailable', 'session-replaced'] as const)(`denies %s during the model wait with unchanged role policy (${adapter})`, async change => {
      const f = await fixture(adapter)
      f.setChange(change)
      f.finish()
      const response = await f.pending
      expect(response.status).toBe(change === 'authority-unavailable' ? 503 : 401)
      expect(await response.json()).not.toHaveProperty('findings')
      expect(f.canReview).toHaveBeenCalledTimes(2)
      expect(f.generate).toHaveBeenCalledTimes(1)
      f.assertSourceUnchanged()
    })
  }
  it('denies a native session logged out through the existing HTTP logout endpoint while AI is waiting', async () => {
    const f = await fixture('production')
    const logout = await f.logout()
    expect(logout.status).toBe(200)
    await logout.arrayBuffer()
    expect(f.sessions.revokeByHash).toHaveBeenCalledTimes(1)
    f.finish()
    const response = await f.pending
    expect(response.status).toBe(401)
    expect(await response.json()).not.toHaveProperty('findings')
    f.assertSourceUnchanged()
  })
  it('refuses switching the local-sandbox persistence target on the same in-flight request', async () => {
    const f = await fixture('local-sandbox')
    f.setChange('target-changed'); f.finish()
    const response = await f.pending
    expect(response.status).toBe(401)
    expect(await response.json()).not.toHaveProperty('findings')
  })
})
