import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { assertIdentityLinkStatusMutationAllowed, createOrgmasterGovernanceMiddleware, currentIdentityLinkValue, governanceErrorStatus, orgmasterGovernanceApiPlugin } from './orgmasterGovernanceApi'
import { DEV_ISSUER, DEV_SUBJECT, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { GovernanceStoreError } from './orgmasterGovernanceStore'
import { ensureGovernanceStore, getGovernancePaths, readGovernanceStore } from './orgmasterGovernanceStore'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'
describe('governance API boundary', () => { it('registers the plugin and accepts only the fixed loopback dev identity', () => { expect(orgmasterGovernanceApiPlugin().name).toBe('orgmaster-local-governance-api'); const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-orgmaster-dev-issuer': DEV_ISSUER, 'x-orgmaster-dev-subject': DEV_SUBJECT } } as any; expect(resolveDevelopmentIdentity(request, true)?.principalId).toBe('dev-principal-local-admin'); expect(resolveDevelopmentIdentity(request, false)).toBeNull() }) })

describe('governance API failure mapping', () => {
  it.each([
    ['PUBLISHER_NOT_LINKED', 422],
    ['GOVERNANCE_ADMIN_CONTINUITY_REQUIRED', 422],
    ['ORGANIZATION_VERSION_INVALID', 409],
    ['GOVERNANCE_PUBLISH_REQUIRED', 403],
    ['IDENTITY_LINK_CONFLICT', 409],
    ['EMPLOYEE_NOT_ACTIVE', 422],
    ['SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN', 422],
    ['STEP_UP_REQUIRED', 403],
    ['ENTITLEMENT_AUTHORITY_VERSION_CONFLICT', 409],
    ['ENTITLEMENT_AUTHORITY_SWITCH_FAILED', 503],
  ])('maps %s to a recoverable HTTP status', (code, status) => expect(governanceErrorStatus(code)).toBe(status))
})

describe('current verified identity link resolution', () => {
  const at = '2026-09-03T00:00:00.000Z'
  const actor = { principalId: 'principal-current', issuer: 'issuer-current', subject: 'subject-current', employeeId: null, bootstrap: true }
  const seed = () => migrateGovernanceV2ToV3(createSeedDocumentV2(at), 'fixture-revision', readAiPdmRoleCatalog(), at)

  it('creates, reactivates and preserves the original link identity without accepting browser identity fields', () => {
    const created = currentIdentityLinkValue(seed(), actor, 'employee-1', at)
    expect(created).toMatchObject({ principalId: actor.principalId, issuer: actor.issuer, subject: actor.subject, employeeId: 'employee-1', status: 'active', validFrom: at, validTo: null })
    const inactive = { ...created, id: 'identity-existing', status: 'inactive' as const, validFrom: '2026-08-01T00:00:00.000Z', validTo: '2026-08-31T00:00:00.000Z' }
    const document = seed(); document.draft.identityLinks = [inactive]
    expect(currentIdentityLinkValue(document, actor, 'employee-1', at)).toEqual({ ...inactive, status: 'active', validTo: null })
    document.draft.identityLinks = [{ ...created, id: 'identity-active', validFrom: '2026-07-01T00:00:00.000Z' }]
    expect(currentIdentityLinkValue(document, actor, 'employee-1', at)).toEqual({ ...created, id: 'identity-active', validFrom: '2026-07-01T00:00:00.000Z' })
  })

  it('fails closed when either verified identity key belongs to another employee or different links', () => {
    const document = seed()
    document.draft.identityLinks = [{ id: 'identity-other', principalId: actor.principalId, issuer: actor.issuer, subject: actor.subject, employeeId: 'employee-2', status: 'active', validFrom: at, validTo: null }]
    expect(() => currentIdentityLinkValue(document, actor, 'employee-1', at)).toThrowError(GovernanceStoreError)
    document.draft.identityLinks = [
      { ...document.draft.identityLinks[0], employeeId: 'employee-1', issuer: 'issuer-other', subject: 'subject-other' },
      { ...document.draft.identityLinks[0], id: 'identity-subject', principalId: 'principal-other', employeeId: 'employee-1' },
    ]
    expect(() => currentIdentityLinkValue(document, actor, 'employee-1', at)).toThrowError(GovernanceStoreError)
  })

  it('rejects self-deactivation while allowing reactivation and unrelated links', () => {
    const document = seed()
    const own = currentIdentityLinkValue(document, actor, 'employee-1', at)
    document.draft.identityLinks = [own, { ...own, id: 'identity-other', principalId: 'principal-other', issuer: 'issuer-other', subject: 'subject-other', employeeId: 'employee-2' }]
    expect(() => assertIdentityLinkStatusMutationAllowed(document, actor, own.id, 'inactive')).toThrowError('SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN')
    expect(() => assertIdentityLinkStatusMutationAllowed(document, actor, own.id, 'active')).not.toThrow()
    expect(() => assertIdentityLinkStatusMutationAllowed(document, actor, 'identity-other', 'inactive')).not.toThrow()
  })
})


describe('Principal-only retired authority API', () => {
  it.each(['POST', 'GET', 'PATCH'])('returns 410 for %s without identity, body or database access', async (method) => {
    let body = ''
    const response = { statusCode: 0, setHeader: vi.fn(), end: (value: string) => { body = value } }
    const next = vi.fn()
    createOrgmasterGovernanceMiddleware('nonexistent-retirement-fixture', false)({ url: '/api/orgmaster/governance/employee-authority-switch', method } as never, response as never, next)
    await Promise.resolve()
    expect(response.statusCode).toBe(410)
    expect(JSON.parse(body)).toEqual({ error: 'LEGACY_AUTHORITY_SWITCH_RETIRED' })
    expect(next).not.toHaveBeenCalled()
  })
})

describe('QA058-07 mounted actor boundary', () => {
  const providerPairSession: OrgmasterSession = {
    id: 'qa07-provider-pair-session', identityIssuer: 'urn:qa07:workload', identitySubject: 'provider-pair-workload',
    principalId: 'qa07-workload-principal', employeeId: 'qa07-workload-employee', authEpoch: 0,
    sessionSchemaVersion: 2, epochKind: 'provider_pair', principalAuthEpoch: 0,
    issuedAt: '2026-10-23T00:00:00.000Z', authenticatedAt: '2026-10-23T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null, assuranceLevel: 'aal1',
  }

  async function call(root: string, session: OrgmasterSession | null, body: Record<string, unknown>, devIdentity = false) {
    const middleware = createOrgmasterGovernanceMiddleware(root, true)
    const server = createServer((request, response) => {
      if (session) setVerifiedRequestIdentity(request, session)
      middleware(request, response, () => { response.statusCode = 404; response.end() })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('QA07_TEST_SERVER_ADDRESS_MISSING')
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/orgmaster/governance/draft`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(devIdentity ? { 'x-orgmaster-dev-issuer': DEV_ISSUER, 'x-orgmaster-dev-subject': DEV_SUBJECT } : {}),
        },
        body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.json() as Record<string, unknown> }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }

  it('accepts the fixed manager fixture, then rejects forged body actor and provider_pair caller without mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-qa07-mounted-'))
    try {
      const initial = await ensureGovernanceStore(root)
      const managerCommand = {
        type: 'SET_PERMISSION_STATUS', commandId: 'qa07-manager-positive', reason: 'QA058-07 mounted manager fixture',
        id: 'permission-orgmaster-governance-manage', status: 'active',
      }
      const managerResponse = await call(root, null, { expectedRevision: initial.revision, command: managerCommand }, true)
      expect(managerResponse.status).toBe(200)
      expect(managerResponse.body).toMatchObject({ status: 'noop' })
      const beforeDeniedRaw = await readFile(getGovernancePaths(root).current, 'utf8')
      const beforeDenied = JSON.parse(beforeDeniedRaw) as { auditEvents: Array<{ commandId: string }> }

      const forgedBody = {
        expectedRevision: (await readGovernanceStore(root)).revision,
        principalId: 'dev-principal-local-admin',
        actor: { principalId: 'dev-principal-local-admin', issuer: DEV_ISSUER, subject: DEV_SUBJECT, employeeId: null },
        command: {
          type: 'SET_PERMISSION_STATUS', commandId: 'qa07-forged-body-actor', reason: 'QA058-07 forged body actor',
          id: 'permission-orgmaster-governance-manage', status: 'active',
        },
      }
      for (const session of [
        { ...providerPairSession, id: 'qa07-ordinary-session', principalId: 'qa07-ordinary-principal', employeeId: 'qa07-ordinary-employee', epochKind: 'principal' as const },
        providerPairSession,
      ]) {
        const denied = await call(root, session, forgedBody)
        expect(denied.status, session.epochKind).toBe(403)
        expect(denied.body).toEqual({ error: 'GOVERNANCE_ADMIN_REQUIRED' })
      }

      const afterDeniedRaw = await readFile(getGovernancePaths(root).current, 'utf8')
      const afterDenied = JSON.parse(afterDeniedRaw) as { auditEvents: Array<{ commandId: string }> }
      expect(afterDeniedRaw).toBe(beforeDeniedRaw)
      expect(afterDenied.auditEvents).toHaveLength(beforeDenied.auditEvents.length)
      expect(afterDenied.auditEvents.some(event => event.commandId === 'qa07-forged-body-actor')).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
