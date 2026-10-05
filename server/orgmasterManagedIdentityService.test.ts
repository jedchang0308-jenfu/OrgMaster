import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createOrgmasterManagedIdentityMiddleware } from './orgmasterManagedIdentityApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'
import type { ManagedIdentityRepositoryV1 } from './orgmasterManagedIdentityRepository'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'
import type { ManagedLoginIdentity } from './orgmasterManagedLoginContract'
import { createManagedIdentityService } from './orgmasterManagedIdentityService'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { readExistingGovernanceStore } from './orgmasterGovernanceStore'

const governance = {
  document: {
    activePolicyVersionId: 'policy-1',
    publishedVersions: [{ id: 'policy-1', kind: 'assignment-governance-v3', externalRoleCatalogs: [], policy: {
      applications: [{ id: 'orgmaster', status: 'active' }],
      applicationRoles: [{ id: 'role-1', applicationId: 'orgmaster', status: 'active' }],
      roleAssignments: [{ employeeId: 'employee-1', applicationId: 'orgmaster', roleId: 'role-1', scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }],
    } }],
  },
}

vi.mock('./orgmasterGovernanceStore', () => ({
  loadOrganizationSource: vi.fn(async () => ({ workspaceVersionId: 'workspace-1', workspaceRevision: 'workspace-revision', sourceDataAt: '2026-09-17T00:00:00.000Z', state: { employees: [{ id: 'employee-1', status: 'active', name: '測試員工' }, { id: 'employee-inactive', status: 'inactive', name: '待啟用員工' }], departments: [], roles: [], positions: [], assignments: [] } })),
  readExistingGovernanceStore: vi.fn(async () => governance),
}))

const pending: ManagedLoginIdentity = {
  employeeId: 'employee-1', principalId: 'principal-1', employeeNumber: 'JFS0001', directoryCustomerId: 'customer-1', directoryUserId: 'google-1', identityRecordId: '00000000-0000-4000-8000-000000000001', identityRevision: '1', registryRevision: '2', linkState: 'directory_linked_pending_auth', pair: null,
}
const active: ManagedLoginIdentity = { ...pending, identityRevision: '2', linkState: 'active', pair: { issuer: 'issuer', subject: 'subject' } }

function directory(): ManagedDirectoryPortV1 {
  return { mode: 'local-deterministic', writeOperations: 0, findExactCandidate: vi.fn(), readByDirectoryKey: vi.fn(async () => ({ ok: true as const, user: { customerId: 'customer-1', userId: 'google-1', primaryEmail: 'person@jenfu.com.tw', directoryState: 'present' as const, sourceEtag: 'etag-1' }, observedAt: '2026-09-17T00:00:00.000Z' })) }
}

function token() {
  return { issuer: 'issuer', subject: 'subject', assuranceLevel: 'aal1' as const, authenticatedAt: '2026-09-17T00:00:00.000Z', signInProvider: 'google.com', email: 'person@jenfu.com.tw', emailVerified: true, googleUserId: 'google-1' }
}

function service(repository: Partial<ManagedIdentityRepositoryV1>) {
  return createManagedIdentityService({ root: 'fixture', devEnabled: false, managedDomain: 'jenfu.com.tw', directoryCustomerId: 'customer-1', directory: directory(), repository: repository as ManagedIdentityRepositoryV1 })
}

describe('managed identifier verifier', () => {
  it('requires the same token, live Directory and stored primary Email', async () => {
    const verify = vi.fn(async () => ({ identity: { ...active }, mappingVersion: '7' }))
    const repository = { mode: 'local-json', reserveDirectoryRead: vi.fn(), readManagedLoginSnapshot: vi.fn()
      .mockResolvedValueOnce({ identity: pending, primaryEmail: 'person@jenfu.com.tw' })
      .mockResolvedValueOnce({ identity: active, primaryEmail: 'person@jenfu.com.tw' }), verifyManagedLoginIdentity: verify }
    const result = await service(repository).verifyManagedLoginIdentifier({ requestId: 'request-1', managedIdentifier: 'JFS0001', identity: token() })
    expect(result).toEqual({ principalId: 'principal-1', employeeId: 'employee-1', mappingVersion: '7' })
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-1', current: pending, issuer: 'issuer', subject: 'subject' }))
  })

  it('rejects a stale stored Email even when token and live Directory agree', async () => {
    const verify = vi.fn()
    const repository = { mode: 'local-json', reserveDirectoryRead: vi.fn(), readManagedLoginSnapshot: vi.fn(async () => ({ identity: pending, primaryEmail: 'old@jenfu.com.tw' })), verifyManagedLoginIdentity: verify }
    await expect(service(repository).verifyManagedLoginIdentifier({ requestId: 'request-2', managedIdentifier: 'person@jenfu.com.tw', identity: token() })).rejects.toMatchObject({ code: 'LOGIN_NOT_AVAILABLE' })
    expect(verify).not.toHaveBeenCalled()
  })

  it('retries one exact pending-to-active revision conflict with the original request hash', async () => {
    const verify = vi.fn()
      .mockRejectedValueOnce(new Error('MANAGED_IDENTITY_REVISION_CONFLICT'))
      .mockResolvedValueOnce({ identity: { ...active }, mappingVersion: '8' })
    const read = vi.fn()
      .mockResolvedValueOnce({ identity: pending, primaryEmail: 'person@jenfu.com.tw' })
      .mockResolvedValueOnce({ identity: active, primaryEmail: 'person@jenfu.com.tw' })
      .mockResolvedValueOnce({ identity: active, primaryEmail: 'person@jenfu.com.tw' })
    const repository = { mode: 'local-json', reserveDirectoryRead: vi.fn(), readManagedLoginSnapshot: read, verifyManagedLoginIdentity: verify }
    const result = await service(repository).verifyManagedLoginIdentifier({ requestId: 'request-3', managedIdentifier: 'JFS0001', identity: token() })
    expect(result.mappingVersion).toBe('8')
    expect(verify).toHaveBeenCalledTimes(2)
    expect(verify.mock.calls[0][0].requestHash).toBe(verify.mock.calls[1][0].requestHash)
  })

  it('allows an AI-PDM-assigned employee to establish the bootstrap bridge without an OrgMaster role', async () => {
    const aiPdmGovernance = {
      document: {
        activePolicyVersionId: 'policy-ai-pdm',
        publishedVersions: [{ id: 'policy-ai-pdm', kind: 'assignment-governance-v3',
          externalRoleCatalogs: [readAiPdmRoleCatalog()], policy: {
          applications: [{ id: 'ai-pdm', status: 'active' }],
          applicationRoles: [],
          roleAssignments: [{
            employeeId: 'employee-1', applicationId: 'ai-pdm', roleId: 'role-rd',
            catalogVersion: readAiPdmRoleCatalog().catalogVersion, subjectKind: 'employee', targetPrincipalId: null,
            scope: { kind: 'workspace', value: 'current' }, status: 'active',
            validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
          }],
        } }],
      },
    }
    vi.mocked(readExistingGovernanceStore).mockResolvedValueOnce(aiPdmGovernance as never)
    const verify = vi.fn(async () => ({ identity: { ...active }, mappingVersion: '9' }))
    const repository = { mode: 'local-json', reserveDirectoryRead: vi.fn(), readManagedLoginSnapshot: vi.fn()
      .mockResolvedValueOnce({ identity: pending, primaryEmail: 'person@jenfu.com.tw' })
      .mockResolvedValueOnce({ identity: active, primaryEmail: 'person@jenfu.com.tw' }), verifyManagedLoginIdentity: verify }
    const result = await service(repository).verifyManagedLoginIdentifier({ requestId: 'request-ai-pdm', managedIdentifier: 'JFS0001', identity: token() })
    expect(result).toEqual({ principalId: 'principal-1', employeeId: 'employee-1', mappingVersion: '9' })
  })
  it('does not use an AI-PDM role targeted at another principal to admit managed login', async () => {
    const catalog = readAiPdmRoleCatalog()
    const document = {
      activePolicyVersionId: 'policy-ai-pdm',
      publishedVersions: [{ id: 'policy-ai-pdm', kind: 'assignment-governance-v3',
        externalRoleCatalogs: [catalog], policy: {
          applications: [{ id: 'ai-pdm', status: 'active' }],
          applicationRoles: [],
          roleAssignments: [{
            employeeId: 'employee-1', applicationId: 'ai-pdm', roleId: 'role-rd',
            catalogVersion: catalog.catalogVersion, subjectKind: 'principal', targetPrincipalId: 'principal-other',
            scope: { kind: 'workspace', value: 'current' }, status: 'active',
            validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
          }],
        } }],
    }
    vi.mocked(readExistingGovernanceStore).mockResolvedValueOnce({ document } as never)
    const verify = vi.fn()
    const repository = { mode: 'local-json', reserveDirectoryRead: vi.fn(),
      readManagedLoginSnapshot: vi.fn(async () => ({ identity: pending, primaryEmail: 'person@jenfu.com.tw' })),
      verifyManagedLoginIdentity: verify }
    await expect(service(repository).verifyManagedLoginIdentifier({
      requestId: 'request-other-principal', managedIdentifier: 'JFS0001', identity: token()
    })).rejects.toMatchObject({ code: 'LOGIN_NOT_AVAILABLE' })
    expect(verify).not.toHaveBeenCalled()
  })

})

describe('managed employee activation gate', () => {
  it('delegates an inactive employee transition to the PostgreSQL assignment fence', async () => {
    const assertEmployeeActivation = vi.fn(async () => ({ allowed: true, correctionRequired: false }))
    const result = await service({ mode: 'postgresql', assertEmployeeActivation }).activationCheck('employee-inactive', 'workspace-revision')

    expect(result).toEqual({ allowed: true, correctionRequired: false })
    expect(assertEmployeeActivation).toHaveBeenCalledWith('employee-inactive', 'workspace-revision')
  })

  it('keeps an inactive employee blocked when the PostgreSQL assignment fence rejects it', async () => {
    const assertEmployeeActivation = vi.fn(async () => ({ allowed: false, correctionRequired: true }))
    const result = await service({ mode: 'postgresql', assertEmployeeActivation }).activationCheck('employee-inactive', 'workspace-revision')

    expect(result).toEqual({ allowed: false, correctionRequired: true })
  })
})


describe('published privileged managed-identity gate', () => {
  const actor = {
    principalId: 'principal-1', employeeId: 'employee-1',
    issuer: 'issuer', subject: 'subject', bootstrap: false,
  }
  const link = {
    id: 'link-1', principalId: 'principal-1', employeeId: 'employee-1',
    issuer: 'issuer', subject: 'subject', status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
  }
  const admission = { identityLinkId: 'link-1', accountType: 'human_privileged', status: 'active' }
  function document(publishedPrivileged: boolean, draftPrivileged: boolean) {
    const policy = {
      applications: [{ id: 'orgmaster', status: 'active' }],
      identityLinks: [link],
      principalAdmissions: publishedPrivileged ? [admission] : [],
      applicationRoles: [{ id: 'role-1', applicationId: 'orgmaster', status: 'active' }],
      permissions: [{ id: 'permission-link', applicationId: 'orgmaster', code: 'orgmaster.identity.link', status: 'active' }],
      roleAssignments: [{
        employeeId: 'employee-1', applicationId: 'orgmaster', roleId: 'role-1',
        scope: { kind: 'global' }, status: 'active',
        validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
      }],
      rolePermissionGrants: [{ roleId: 'role-1', permissionId: 'permission-link', effect: 'allow' }],
    }
    return {
      schemaVersion: 3, activePolicyVersionId: 'policy-privileged',
      publishedVersions: [{ id: 'policy-privileged', kind: 'assignment-governance-v3', policy, organizationSnapshot: { workspaceVersionId: 'workspace-1', workspaceRevision: 'workspace-revision' } }],
      draft: { ...policy, principalAdmissions: draftPrivileged ? [admission] : [] },
    }
  }
  const request = { primaryEmail: 'person@jenfu.com.tw' } as never
  function repository() {
    return {
      mode: 'local-json',
      readExisting: vi.fn(async () => ({ document: { registry: { assignments: [] }, managedDailyIdentities: [] } })),
    }
  }
  it('does not let an unpublished draft admission authorize a managed link', async () => {
    vi.mocked(readExistingGovernanceStore).mockResolvedValueOnce({ document: document(false, true) } as never)
    const store = repository()
    await expect(service(store).findCandidate('employee-1', actor, request))
      .rejects.toMatchObject({ code: 'HUMAN_PRIVILEGED_REQUIRED' })
    expect(store.readExisting).not.toHaveBeenCalled()
  })
  it('keeps the published admission effective when only the draft removes it', async () => {
    vi.mocked(readExistingGovernanceStore).mockResolvedValueOnce({ document: document(true, false) } as never)
    const store = repository()
    await expect(service(store).findCandidate('employee-1', actor, request))
      .rejects.toMatchObject({ code: 'EMPLOYEE_NUMBER_REQUIRED' })
    expect(store.readExisting).toHaveBeenCalledOnce()
  })
})


describe('Directory link state and candidate conflicts', () => {
  const actor = { principalId: 'dev-principal-local-admin', employeeId: 'employee-1', issuer: 'urn:orgmaster:dev', subject: 'local-admin', bootstrap: true }
  const request = { primaryEmail: 'person@jenfu.com.tw', expectedWorkspaceRevision: 'workspace-revision', expectedRegistryRevision: '1' }
  function fixture(state: 'not_linked' | 'directory_linked_pending_auth' | 'active' | 'conflict' = 'not_linked') {
    const model = { contractVersion: 'orgmaster.managed-identity.v1', employee: { id: 'employee-1', status: 'active' }, employeeNumber: { status: 'assigned', value: 'JFS0001', revision: 1 }, identity: { state, provider: 'google.com', note: '', primaryEmail: state === 'not_linked' ? null : 'person@jenfu.com.tw' }, capabilities: { view: true, manageNumber: false }, registryRevision: '1' }
    const repository = { mode: 'postgresql', readEmployeeManagedIdentity: vi.fn(async () => model), createCandidate: vi.fn(async () => ({ token: 'candidate-1', expiresAt: '2026-10-06T00:00:00.000Z', workspaceRevision: 'workspace-revision', registryRevision: '1' })) }
    const port = directory()
    vi.mocked(port.findExactCandidate).mockResolvedValue({ ok: true, user: { customerId: 'customer-1', userId: 'google-1', primaryEmail: 'person@jenfu.com.tw', directoryState: 'present', sourceEtag: 'etag-1' }, observedAt: '2026-10-05T00:00:00.000Z' })
    const service = createManagedIdentityService({ root: 'fixture', devEnabled: true, managedDomain: 'jenfu.com.tw', directoryCustomerId: 'customer-1', directory: port, repository: repository as unknown as ManagedIdentityRepositoryV1 })
    return { service, repository, port }
  }
  it.each(['directory_linked_pending_auth', 'active', 'conflict'] as const)('does not offer or retry an already stored %s link', async (state) => {
    const { service, repository, port } = fixture(state)
    expect((await service.read('employee-1', actor)).capabilities.manageLink).toBe(false)
    await expect(service.findCandidate('employee-1', actor, request)).rejects.toMatchObject({ code: 'DIRECTORY_IDENTITY_CONFLICT' })
    expect(port.findExactCandidate).not.toHaveBeenCalled()
    expect(repository.createCandidate).not.toHaveBeenCalled()
  })
  it('retains initial linking for an unlinked employee', async () => {
    const { service, repository } = fixture()
    expect((await service.read('employee-1', actor)).capabilities.manageLink).toBe(true)
    expect((await service.findCandidate('employee-1', actor, request)).candidateToken).toBe('candidate-1')
    expect(repository.createCandidate).toHaveBeenCalledOnce()
  })
  it.each([
    ['MANAGED_IDENTITY_IDENTITY_CONFLICT', 'DIRECTORY_IDENTITY_CONFLICT'],
    ['MANAGED_IDENTITY_REVISION_CONFLICT', 'REVISION_CONFLICT'],
    ['MANAGED_IDENTITY_ADMISSION_DISABLED', 'DB_ADMISSION_DISABLED'],
  ])('preserves PostgreSQL candidate error %s as %s after a concurrent change', async (rawCode, expectedCode) => {
    const { service, repository } = fixture()
    repository.createCandidate.mockRejectedValueOnce(new Error(rawCode))
    await expect(service.findCandidate('employee-1', actor, request)).rejects.toMatchObject({ code: expectedCode })
  })
  it('keeps linking denied for an actor without identity permission', async () => {
    const { service, repository, port } = fixture()
    await expect(service.findCandidate('employee-1', { ...actor, principalId: 'dev-principal-employee', subject: 'local-employee', bootstrap: false }, request)).rejects.toMatchObject({ code: 'IDENTITY_LINK_REQUIRED' })
    expect(repository.readEmployeeManagedIdentity).not.toHaveBeenCalled()
    expect(port.findExactCandidate).not.toHaveBeenCalled()
  })

  async function candidateHttp(service: ReturnType<typeof fixture>['service']) {
    const req = Readable.from([JSON.stringify(request)]) as IncomingMessage
    req.method = 'POST'
    req.url = '/api/orgmaster/employees/employee-1/managed-identity/candidate'
    req.headers = { origin: 'https://orgmaster.test', host: 'orgmaster.test' }
    setVerifiedRequestIdentity(req, { ...actor, identityIssuer: actor.issuer, identitySubject: actor.subject, assuranceLevel: 'aal1' } as OrgmasterSession)
    return await new Promise<{ status: number; body: unknown }>((resolve) => {
      const res = { statusCode: 0, setHeader: vi.fn(), end(body: string) { resolve({ status: this.statusCode, body: JSON.parse(body) }) } }
      createOrgmasterManagedIdentityMiddleware('fixture', true, service)(req, res as unknown as ServerResponse, () => { throw new Error('Unexpected next') })
    })
  }
  it('returns HTTP 409 for a stored link instead of a server failure', async () => {
    const { service, repository } = fixture('directory_linked_pending_auth')
    expect(await candidateHttp(service)).toEqual({ status: 409, body: { error: 'DIRECTORY_IDENTITY_CONFLICT' } })
    expect(repository.createCandidate).not.toHaveBeenCalled()
  })
  it('logs only a safe action and error code for genuine candidate store failures', async () => {
    const { service, repository } = fixture()
    repository.createCandidate.mockRejectedValueOnce(new Error('private SQL and personal details'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await candidateHttp(service)).toEqual({ status: 503, body: { error: 'MANAGED_IDENTITY_WRITE_FAILED' } })
      expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'orgmaster_managed_identity_request_failed', action: 'managed-identity/candidate', code: 'MANAGED_IDENTITY_WRITE_FAILED' }))
    } finally { log.mockRestore() }
  })
})
