import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFinancialInitialAuthorityReceipt, loadGovernanceCommandResult, patchGovernanceDraft, previewFinancialInitialAuthority, previewPrivilegedAssignment, publishFinancialInitialAuthority, publishGovernancePolicy, publishPrivilegedAssignment, setActiveGovernanceVersion, type FinancialInitialAuthorityRequest } from './apiClient'
import type { PrivilegedAssignmentRequest } from './privilegedAssignments'

const request: PrivilegedAssignmentRequest = {
  operation: 'grant_system_admin', employeeId: 'employee-target', principalAdmissionId: 'admission-target',
  applicationId: 'ai-pdm', stableRoleId: 'role-system-admin', reason: '  contract test  ',
  expected: {
    catalogVersion: 'catalog-v1', catalogPayloadHash: 'a'.repeat(64),
    governanceRevision: 'governance-revision', organizationRevision: 'organization-revision',
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('DEV-058 dynamic assignment version/hash binding', () => {
  it('uses the same two-field producer binding for draft, publish and restore requests', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const expectedCatalog = { catalogVersion: 'ai-pdm.role-policy.00000000-0000-4000-8000-000000000001', catalogSha256: 'd'.repeat(64) }
    await patchGovernanceDraft('governance-r1', { type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'draft-command', reason: 'fixture', id: 'assignment-1' }, 'organization-r1', expectedCatalog)
    await publishGovernancePolicy('governance-r2', 'publish-command', 'fixture', 'current', 'organization-r1', expectedCatalog)
    await setActiveGovernanceVersion('governance-r3', 'restore-command', 'fixture', 'assignment-version-1', 'organization-r1', expectedCatalog)
    expect(bodies).toHaveLength(3)
    for (const body of bodies) {
      expect(body.expectedCatalog).toEqual(expectedCatalog)
      expect(Object.keys(body.expectedCatalog as Record<string, unknown>)).toEqual(['catalogVersion', 'catalogSha256'])
      expect(body.expectedOrganizationRevision).toBe('organization-r1')
    }
  })
})

describe('DEV-009 privileged assignment HTTP payloads', () => {
  it('keeps preview request fields separate from the preview response', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await previewPrivilegedAssignment(request)

    expect(body).toMatchObject({ phase: 'preview', operation: 'grant_system_admin', reason: 'contract test', payload: { employeeId: 'employee-target', principalAdmissionId: 'admission-target' } })
    expect(body).not.toHaveProperty('commandId')
    expect(body).not.toHaveProperty('requestHash')
    expect(body).not.toHaveProperty('preview')
  })

  it('publishes only the command identity, request hash and preview reference', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await publishPrivilegedAssignment(request, 'command-1', 'b'.repeat(64), 'c'.repeat(64))

    expect(body).toMatchObject({ phase: 'publish', commandId: 'command-1', requestHash: 'b'.repeat(64), preview: { previewHash: 'c'.repeat(64) } })
    expect(Object.keys(body.preview as Record<string, unknown>)).toEqual(['previewHash'])
  })
})

describe('DEV-058 command result query', () => {
  it('encodes the original command ID and returns the committed result DTO', async () => {
    let requestedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({
        status: 'committed', commandId: 'command/with space', commandHash: 'a'.repeat(64),
        auditReference: 'audit-1', entityType: 'roleAssignment', entityId: 'assignment-1',
        occurredAt: '2026-10-23T00:00:00.000Z', result: {
          operation: 'REVOKE_ROLE_ASSIGNMENT', outcome: 'applied', entityType: 'roleAssignment', entityId: 'assignment-1',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    const result = await loadGovernanceCommandResult('command/with space')

    expect(requestedUrl).toBe('/api/orgmaster/governance/commands/command%2Fwith%20space')
    expect(result.payload).toMatchObject({ status: 'committed', commandId: 'command/with space', result: { outcome: 'applied' } })
  })
})

describe('DEV-065 financial initial authority HTTP payloads', () => {
  const initial: FinancialInitialAuthorityRequest = {
    employeeId: 'employee-shijie', stableRoleIds: ['role-finance-manager', 'role-owner'],
    scope: { kind: 'workspace', value: 'company-jenfu' }, validFrom: '2026-10-26T00:00:00.000Z', validUntil: null,
    reason: '建立 JF-FMS 初始角色治理權限', release: { version: 'catalog-v1' },
    expectedGovernanceRevision: 'governance-r1', expectedOrganizationRevision: 'organization-r1',
  }

  it('keeps preview read-only and binds publish to the exact preview hashes', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await previewFinancialInitialAuthority(initial)
    await publishFinancialInitialAuthority(initial, 'command-1', 'a'.repeat(64), 'b'.repeat(64))

    expect(requests[0]).toMatchObject({ url: '/api/orgmaster/governance/applications/financial-management-system/initial-authority/preview', body: initial })
    expect(requests[0].body).not.toHaveProperty('commandId')
    expect(requests[1]).toMatchObject({ url: '/api/orgmaster/governance/applications/financial-management-system/initial-authority/publish', body: { ...initial, commandId: 'command-1', requestHash: 'a'.repeat(64), previewHash: 'b'.repeat(64) } })
  })

  it('encodes receipt command IDs', async () => {
    let requestedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await loadFinancialInitialAuthorityReceipt('command/with space')
    expect(requestedUrl).toBe('/api/orgmaster/governance/applications/financial-management-system/initial-authority/commands/command%2Fwith%20space')
  })

  it('surfaces the server code field instead of hiding a revision conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'GOVERNANCE_REVISION_CONFLICT' }), {
      status: 409, headers: { 'content-type': 'application/json' },
    })))

    await expect(previewFinancialInitialAuthority(initial)).rejects.toMatchObject({
      code: 'GOVERNANCE_REVISION_CONFLICT', status: 409,
    })
  })
})
