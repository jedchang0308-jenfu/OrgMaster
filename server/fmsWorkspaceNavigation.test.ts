import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { financialWorkspaceReturnUrl } from './fmsWorkspaceNavigation'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'

afterEach(() => vi.unstubAllEnvs())

const real = { NODE_ENV: 'production', ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on',
  ORGMASTER_JENFU_SSO_BROKER_ORIGIN: 'https://platform.example.test' }

describe('FMS owner workspace return navigation', () => {
  it('uses only the configured Platform entry and does not copy a path, query or credential', () => {
    expect(financialWorkspaceReturnUrl(real)).toBe('https://platform.example.test/api/apps/financial-management-system/launch')
    expect(financialWorkspaceReturnUrl({ ...real, NODE_ENV: 'development', ORGMASTER_JENFU_SSO_BROKER_ORIGIN: 'http://localhost:1000' }))
      .toBe('http://localhost:1000/api/apps/financial-management-system/launch')
  })

  it.each(['http://remote.example.test', 'https://user:pass@platform.example.test', 'https://platform.example.test/path',
    'https://platform.example.test?returnTo=https://evil.example', 'https://platform.example.test/#fragment', 'not-a-url'])(
    'rejects a malformed or untrusted broker configuration %s', origin => {
      expect(financialWorkspaceReturnUrl({ ...real, ORGMASTER_JENFU_SSO_BROKER_ORIGIN: origin })).toBeNull()
    })

  it('requires enabled SSO and allows a local sandbox origin only in its local runtime', () => {
    expect(financialWorkspaceReturnUrl({ ...real, ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'off' })).toBeNull()
    const sandbox = { NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1', JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://localhost:12000' }
    expect(financialWorkspaceReturnUrl(sandbox)).toBe('http://localhost:12000/api/apps/financial-management-system/launch')
    expect(financialWorkspaceReturnUrl({ ...sandbox, NODE_ENV: 'production' })).toBeNull()
    expect(financialWorkspaceReturnUrl({ ...sandbox, K_SERVICE: 'unexpected-cloud-runtime' })).toBeNull()
    expect(financialWorkspaceReturnUrl({ ...sandbox, JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'https://external.example.test' })).toBeNull()
  })

  it('returns via the native verified OrgMaster session and ignores request-supplied destinations', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'on')
    vi.stubEnv('ORGMASTER_JENFU_SSO_BROKER_ORIGIN', 'https://platform.example.test')
    vi.stubEnv('JENFU_LOCAL_SANDBOX_ENABLED', '')
    const session: OrgmasterSession = { id: 'b3eb9c31-51ad-40ec-982b-85a0c3cb1200',
      principalId: 'principal-native-owner', employeeId: 'employee-native-owner', identityIssuer: 'test-issuer', identitySubject: 'test-subject',
      authEpoch: 1, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 1,
      issuedAt: '2026-11-01T00:00:00.000Z', authenticatedAt: '2026-11-01T00:00:00.000Z', expiresAt: '2050-01-01T00:00:00.000Z',
      revokedAt: null, assuranceLevel: 'aal1' }
    const request = { method: 'GET', url: '/api/orgmaster/governance/applications/financial-management-system/return?returnTo=https://evil.example',
      headers: {} } as IncomingMessage
    setVerifiedRequestIdentity(request, session)
    const headers = new Map<string, string>()
    let status = 0
    await new Promise<void>(resolve => {
      const response = { get statusCode() { return status }, set statusCode(value) { status = value },
        setHeader(name: string, value: string) { headers.set(name, value) }, end() { resolve() } } as ServerResponse
      createOrgmasterGovernanceMiddleware('unused-return-root', false)(request, response, () => { throw new Error('unexpected next') })
    })
    expect(status).toBe(303)
    expect(headers.get('Location')).toBe('https://platform.example.test/api/apps/financial-management-system/launch')
    expect(headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('does not redirect an unverified request', async () => {
    vi.stubEnv('ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'on')
    vi.stubEnv('ORGMASTER_JENFU_SSO_BROKER_ORIGIN', 'https://platform.example.test')
    const request = { method: 'GET', url: '/api/orgmaster/governance/applications/financial-management-system/return', headers: {} } as IncomingMessage
    let status = 0
    const headers = new Map<string, string>()
    await new Promise<void>(resolve => {
      const response = { get statusCode() { return status }, set statusCode(value) { status = value },
        setHeader(name: string, value: string) { headers.set(name, value) }, end() { resolve() } } as ServerResponse
      createOrgmasterGovernanceMiddleware('unused-return-root', false)(request, response, () => { throw new Error('unexpected next') })
    })
    expect(status).toBeGreaterThanOrEqual(400)
    expect(headers.has('Location')).toBe(false)
  })
})
