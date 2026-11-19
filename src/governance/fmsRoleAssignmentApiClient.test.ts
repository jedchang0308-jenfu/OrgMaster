import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadFmsRoleAssignmentReceipt,
  loadFmsRoleAssignmentWorkspace,
  previewFmsRoleAssignment,
  publishFmsRoleAssignment,
  searchFmsEmployeeDirectory,
} from './fmsRoleAssignmentApiClient'

const state = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('../auth/permissionInvalidation', () => ({
  captureOrgMasterPermissionInvalidation: () => state.invalidate,
}))

const workspace = {
  applicationId: 'financial-management-system' as const,
  catalogBinding: { applicationId: 'financial-management-system' as const, catalogVersion: 'fms-v7', catalogSha256: 'catalog-hash' },
  governanceRevision: 'gov-r1', organizationRevision: 'org-r1', assignmentVersionId: 'assignment-v1',
  roles: [{ stableRoleId: 'role-finance-staff', roleCode: 'finance_staff', roleName: '財務人員' }],
  allowedOperations: { preview: true as const, publish: true }, assignments: [],
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => vi.unstubAllGlobals())

describe('FMS role assignment API client', () => {
  it('loads the native-session workspace and bounded canonical directory without fetching the full governance document', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(response(workspace))
      .mockResolvedValueOnce(response({ contractVersion: 'orgmaster.fms-employee-directory.v1', items: [], cursor: null }))
    await expect(loadFmsRoleAssignmentWorkspace()).resolves.toEqual(workspace)
    expect(workspace.roles).toEqual([{ stableRoleId: 'role-finance-staff', roleCode: 'finance_staff', roleName: '財務人員' }])
    await expect(searchFmsEmployeeDirectory('王 小明')).resolves.toMatchObject({ items: [], cursor: null })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/orgmaster/governance/applications/financial-management-system/role-assignments', expect.objectContaining({
      credentials: 'same-origin', cache: 'no-store',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/employees?q=%E7%8E%8B+%E5%B0%8F%E6%98%8E&limit=50'), expect.objectContaining({ credentials: 'same-origin' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.has('x-orgmaster-dev-issuer')).toBe(false)
      expect(headers.has('x-orgmaster-dev-subject')).toBe(false)
      expect(headers.has('x-financial-local-role')).toBe(false)
    }
  })

  it('keeps a permission denial explicit and invalidates the captured OrgMaster session listeners', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: 'APP_PUBLISH_GRANT_REQUIRED' }, 403))
    const input = {
      operation: 'upsert' as const, employeeId: 'employee-1', stableRoleId: 'role-finance-staff',
      scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-11-01T00:00:00.000Z', validUntil: null,
      reason: '職務調整', expectedCatalogVersion: 'fms-v7', expectedCatalogPayloadHash: 'catalog-hash',
      expectedGovernanceRevision: 'gov-r1', expectedOrganizationRevision: 'org-r1',
    }
    await expect(publishFmsRoleAssignment(input, { commandId: 'command-1', requestHash: 'request-hash', previewHash: 'preview-hash' }))
      .rejects.toMatchObject({ code: 'APP_PUBLISH_GRANT_REQUIRED', status: 403 })
    expect(state.invalidate).toHaveBeenCalledWith('forbidden')
  })

  it('invalidates the captured session on 401 without adding identity headers', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: 'IDENTITY_CONTEXT_REQUIRED' }, 401))
    await expect(loadFmsRoleAssignmentWorkspace()).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED', status: 401 })
    expect(state.invalidate).toHaveBeenCalledWith('unauthenticated')
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
    expect(headers.has('x-orgmaster-dev-issuer')).toBe(false)
    expect(headers.has('x-orgmaster-dev-subject')).toBe(false)
    expect(headers.has('x-financial-local-role')).toBe(false)
  })

  it('queries only the original receipt after an unknown publish response; it does not resend publish', async () => {
    const fetchMock = vi.mocked(fetch)
    const input = {
      operation: 'upsert' as const, employeeId: 'employee-1', stableRoleId: 'role-finance-staff',
      scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-11-01T00:00:00.000Z', validUntil: null,
      reason: '職務調整', expectedCatalogVersion: 'fms-v7', expectedCatalogPayloadHash: 'catalog-hash',
      expectedGovernanceRevision: 'gov-r1', expectedOrganizationRevision: 'org-r1',
    }
    const command = { commandId: 'command-1', requestHash: 'request-hash', previewHash: 'preview-hash' }
    fetchMock.mockRejectedValueOnce(new TypeError('connection closed'))
      .mockResolvedValueOnce(response({
        contractVersion: 'orgmaster.governance-command-receipt.v2', ...command, requestHash: '', previewHash: '',
        receiptStatus: 'not_found', acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND',
        auditReference: null, securityAlertReference: null, sessionRefresh: 'pending', governanceRevision: 'gov-r1', replayed: false, attempt: 0,
      }, 404))

    await expect(publishFmsRoleAssignment(input, command)).rejects.toThrow('connection closed')
    await expect(loadFmsRoleAssignmentReceipt(command.commandId)).resolves.toMatchObject({
      commandId: command.commandId, requestHash: '', previewHash: '', receiptStatus: 'not_found',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/orgmaster/governance/applications/financial-management-system/role-assignments/publish')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject(command)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/orgmaster/governance/applications/financial-management-system/role-assignments/commands/command-1')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET')
  })
})
