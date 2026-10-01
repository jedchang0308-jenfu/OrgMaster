import { describe, expect, it, vi } from 'vitest'
import { assertIdentityLinkStatusMutationAllowed, createOrgmasterGovernanceMiddleware, currentIdentityLinkValue, governanceErrorStatus, orgmasterGovernanceApiPlugin } from './orgmasterGovernanceApi'
import { DEV_ISSUER, DEV_SUBJECT, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { GovernanceStoreError } from './orgmasterGovernanceStore'
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
