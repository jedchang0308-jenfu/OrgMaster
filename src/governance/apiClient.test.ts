import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewPrivilegedAssignment, publishPrivilegedAssignment } from './apiClient'
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
