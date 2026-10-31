/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FmsRoleAssignmentWorkspace } from './FmsRoleAssignmentWorkspace'

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly code: string, readonly status: number) { super(code) }
  }
  return {
    ApiError,
    loadWorkspace: vi.fn(),
    searchEmployees: vi.fn(),
    preview: vi.fn(),
    publish: vi.fn(),
    receipt: vi.fn(),
    principalId: 'principal-a',
  }
})

vi.mock('../auth/AuthGate', () => ({
  useAuthSession: () => ({ session: { user: { principalId: mocks.principalId } } }),
}))
vi.mock('../governance/fmsRoleAssignmentApiClient', () => ({
  FmsRoleAssignmentApiError: mocks.ApiError,
  loadFmsRoleAssignmentWorkspace: mocks.loadWorkspace,
  searchFmsEmployeeDirectory: mocks.searchEmployees,
  previewFmsRoleAssignment: mocks.preview,
  publishFmsRoleAssignment: mocks.publish,
  loadFmsRoleAssignmentReceipt: mocks.receipt,
}))

const employee = { employeeId: 'employee-1', displayName: '王小明', employeeNumber: null, active: true, assignable: true }
const ownerRole = { stableRoleId: 'role-owner', roleCode: 'owner', roleName: '系統管理員' }
const role = { stableRoleId: 'role-finance-staff', roleCode: 'finance_staff', roleName: '財務人員' }
const currentAssignment = {
  assignmentId: 'assignment-1', employeeId: employee.employeeId, stableRoleId: role.stableRoleId,
  roleCode: role.roleCode, roleName: role.roleName, scope: { kind: 'workspace', value: 'company-jenfu' },
  status: 'active', validFrom: '2026-10-01T00:00:00.000Z', validUntil: null,
}
const inactiveEmployeeLegacyAssignment = {
  assignmentId: 'assignment-legacy-1', employeeId: 'employee-inactive-1', employeeName: '林舊員工',
  stableRoleId: 'role-retired-finance', roleCode: 'retired_finance', roleName: '舊財務角色',
  scope: { kind: 'workspace', value: 'company-jenfu' }, status: 'active',
  validFrom: '2026-10-15T00:00:00.000Z', validUntil: '2026-12-31T00:00:00.000Z',
}
const initialWorkspace = {
  applicationId: 'financial-management-system', catalogBinding: { catalogVersion: 'fms-v7', catalogSha256: 'catalog-hash' },
  governanceRevision: 'gov-r1', organizationRevision: 'org-r1', assignmentVersionId: 'assignment-v1',
  roles: [role], allowedOperations: { preview: true, publish: true }, assignments: [currentAssignment],
}
const workspaceWithOwnerFirst = { ...initialWorkspace, roles: [ownerRole, role] }
const workspaceWithLegacyAssignment = { ...initialWorkspace, assignments: [inactiveEmployeeLegacyAssignment] }
const refreshedWorkspace = { ...initialWorkspace, governanceRevision: 'gov-r2', organizationRevision: 'org-r2', assignments: [currentAssignment, { ...currentAssignment, assignmentId: 'assignment-2' }] }
const refreshedWorkspaceWithOwnerOnly = { ...refreshedWorkspace, roles: [ownerRole] }
const preview = {
  applicationId: 'financial-management-system', catalogBinding: initialWorkspace.catalogBinding,
  beforeAssignments: [currentAssignment], afterAssignments: [{ ...currentAssignment, validFrom: '2026-11-01T00:00:00.000Z' }],
  candidateAssignmentVersionId: 'assignment-v1', incompatibleAssignmentIds: [], authorizationEffect: 'not_committed',
  organizationRevision: 'org-r1', requestHash: 'request-hash', previewHash: 'preview-hash',
}
const revokePreview = {
  ...preview,
  beforeAssignments: [inactiveEmployeeLegacyAssignment],
  afterAssignments: [{ ...inactiveEmployeeLegacyAssignment, status: 'revoked' }],
  requestHash: 'revoke-request-hash',
  previewHash: 'revoke-preview-hash',
}

function receipt(command: { commandId: string; requestHash: string; previewHash: string }, receiptStatus: string) {
  return {
    contractVersion: 'orgmaster.governance-command-receipt.v2', ...command,
    requestHash: receiptStatus === 'not_found' ? '' : command.requestHash,
    previewHash: receiptStatus === 'not_found' ? '' : command.previewHash,
    receiptStatus,
    acceptedAt: receiptStatus === 'applied' ? '2026-11-01T00:00:00.000Z' : null,
    terminalAt: receiptStatus === 'applied' ? '2026-11-01T00:00:01.000Z' : null,
    decisionCode: receiptStatus === 'applied' ? 'COMMAND_APPLIED' : 'COMMAND_NOT_FOUND',
    auditReference: null, securityAlertReference: null, sessionRefresh: 'pending', governanceRevision: 'gov-r2', replayed: false, attempt: 1,
  }
}

function directoryPage(governanceRevision = 'gov-r1', directoryRevision = 'org-r1') {
  return {
    contractVersion: 'orgmaster.fms-employee-directory.v1',
    applicationId: 'financial-management-system',
    directoryRevision,
    governanceRevision,
    readAt: '2026-11-01T00:00:00.000Z',
    items: [employee],
    cursor: null,
  }
}

let host: HTMLDivElement
let root: Root

async function mount() {
  await act(async () => {
    root.render(<FmsRoleAssignmentWorkspace />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function setValue(id: string, value: string) {
  const element = host.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  if (!element) throw new Error(`field not found: ${id}`)
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

async function change(id: string, value: string) {
  await act(async () => setValue(id, value))
}

async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)
  if (!button) throw new Error(`button not found: ${label}`)
  await act(async () => button.click())
}

async function preparePreview() {
  await change('fms-employee', employee.employeeId)
  await change('fms-role', role.stableRoleId)
  await change('fms-reason', '職務調整')
  await click('預覽變更')
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.principalId = 'principal-a'
  sessionStorage.clear()
  vi.stubGlobal('crypto', { randomUUID: () => 'command-generated' })
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  mocks.loadWorkspace.mockResolvedValue(initialWorkspace)
  mocks.searchEmployees.mockResolvedValue(directoryPage())
  mocks.preview.mockResolvedValue(preview)
  mocks.publish.mockResolvedValue(receipt({ commandId: 'command-generated', requestHash: preview.requestHash, previewHash: preview.previewHash }, 'applied'))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('FMS role assignment workspace', () => {
  it('shows validity dates as local date and time across UTC midnight without changing submitted values', async () => {
    vi.stubEnv('TZ', 'Etc/GMT-8')
    const boundaryAssignment = {
      ...currentAssignment,
      validFrom: '2026-10-31T19:31:00.000Z',
      validUntil: '2026-11-01T19:31:00.000Z',
    }
    const boundaryWorkspace = { ...initialWorkspace, assignments: [boundaryAssignment] }
    const boundaryRevokePreview = {
      ...revokePreview,
      beforeAssignments: [boundaryAssignment],
      afterAssignments: [{ ...boundaryAssignment, status: 'revoked' }],
    }
    mocks.loadWorkspace.mockResolvedValueOnce(boundaryWorkspace)
    mocks.preview.mockResolvedValueOnce(boundaryRevokePreview)

    await mount()
    await change('fms-current-assignment-employee', employee.employeeId)
    expect(host.textContent).toContain('2026-11-01 03:31 至 2026-11-02 03:31')

    await click('撤銷任用')
    expect(host.textContent).toContain('原任用期間：2026-11-01 03:31 至 2026-11-02 03:31')
    await change('fms-revoke-reason', '員工離職')
    await click('預覽撤銷')

    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({
      validFrom: boundaryAssignment.validFrom,
      validUntil: boundaryAssignment.validUntil,
    }))
    expect(host.textContent).toContain('2026-11-01 03:31 至 2026-11-02 03:31')
  })

  it('preserves invalid validity values in the current assignment list', async () => {
    const invalidAssignment = { ...currentAssignment, validFrom: 'invalid-date' }
    mocks.loadWorkspace.mockResolvedValueOnce({ ...initialWorkspace, assignments: [invalidAssignment] })

    await mount()
    await change('fms-current-assignment-employee', employee.employeeId)

    expect(host.textContent).toContain('invalid-date 至 未設定')
  })

  it('previews the canonical employee assignment, publishes once and refreshes the workspace', async () => {
    mocks.loadWorkspace.mockResolvedValueOnce(initialWorkspace).mockResolvedValueOnce(refreshedWorkspace)
    mocks.searchEmployees.mockResolvedValueOnce(directoryPage()).mockResolvedValueOnce(directoryPage('gov-r2', 'org-r2'))
    await mount()
    await preparePreview()

    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'upsert', employeeId: employee.employeeId, stableRoleId: role.stableRoleId,
      scope: { kind: 'workspace', value: 'company-jenfu' }, expectedCatalogVersion: 'fms-v7',
      expectedCatalogPayloadHash: 'catalog-hash', expectedGovernanceRevision: 'gov-r1', expectedOrganizationRevision: 'org-r1',
      reason: '職務調整',
    }))
    expect(host.textContent).toContain('變更前')
    expect(host.textContent).toContain('變更後')
    expect(host.textContent).toContain('財務人員')

    await click('確認並發布')
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish.mock.calls[0][1]).toEqual({ commandId: 'command-generated', requestHash: 'request-hash', previewHash: 'preview-hash' })
    expect(mocks.loadWorkspace).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('現行資料已更新')
    await change('fms-current-assignment-employee', employee.employeeId)
    expect(host.textContent).toContain('employee-1')
  })

  it('does not default to the first owner role and clears a selected role that disappears after refresh', async () => {
    mocks.loadWorkspace.mockResolvedValueOnce(workspaceWithOwnerFirst).mockResolvedValueOnce(refreshedWorkspaceWithOwnerOnly)
    mocks.searchEmployees.mockResolvedValueOnce(directoryPage()).mockResolvedValueOnce(directoryPage('gov-r2', 'org-r2'))
    await mount()

    const roleSelect = host.querySelector('#fms-role') as HTMLSelectElement
    expect(workspaceWithOwnerFirst.roles[0]).toEqual(ownerRole)
    expect(roleSelect.value).toBe('')
    expect(roleSelect.querySelector('option[value=""]')?.textContent).toBe('選擇角色')
    await change('fms-employee', employee.employeeId)
    await change('fms-reason', '職務調整')
    let previewButton = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === '預覽變更')
    expect(previewButton?.disabled).toBe(true)
    expect(mocks.preview).not.toHaveBeenCalled()

    await change('fms-role', role.stableRoleId)
    previewButton = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === '預覽變更')
    expect(previewButton?.disabled).toBe(false)
    await click('預覽變更')
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ stableRoleId: role.stableRoleId }))
    await click('確認並發布')

    expect((host.querySelector('#fms-role') as HTMLSelectElement).value).toBe('')
    expect(host.querySelector('#fms-role option[value=""]')?.textContent).toBe('選擇角色')
    previewButton = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === '預覽變更')
    expect(previewButton?.disabled).toBe(true)
  })

  it('previews and publishes a row-bound revoke for an inactive employee with a retired role', async () => {
    const command = { commandId: 'command-generated', requestHash: 'revoke-request-hash', previewHash: 'revoke-preview-hash' }
    mocks.loadWorkspace.mockResolvedValueOnce(workspaceWithLegacyAssignment).mockResolvedValueOnce(workspaceWithLegacyAssignment)
    mocks.preview.mockResolvedValueOnce(revokePreview)
    mocks.publish.mockResolvedValueOnce(receipt(command, 'applied'))
    await mount()

    expect([...host.querySelectorAll('#fms-employee option')].map((option) => (option as HTMLOptionElement).value))
      .not.toContain(inactiveEmployeeLegacyAssignment.employeeId)
    expect([...host.querySelectorAll('#fms-role option')].map((option) => (option as HTMLOptionElement).value))
      .not.toContain(inactiveEmployeeLegacyAssignment.stableRoleId)
    expect((host.querySelector('#fms-role') as HTMLSelectElement).value).toBe('')

    await change('fms-current-assignment-employee', inactiveEmployeeLegacyAssignment.employeeId)
    expect(host.textContent).toContain('林舊員工 · 舊財務角色')
    await click('撤銷任用')
    await change('fms-revoke-reason', '員工離職，撤銷既有任用')
    await click('預覽撤銷')

    expect(mocks.preview).toHaveBeenCalledWith({
      operation: 'revoke',
      assignmentId: inactiveEmployeeLegacyAssignment.assignmentId,
      employeeId: inactiveEmployeeLegacyAssignment.employeeId,
      stableRoleId: inactiveEmployeeLegacyAssignment.stableRoleId,
      scope: inactiveEmployeeLegacyAssignment.scope,
      validFrom: inactiveEmployeeLegacyAssignment.validFrom,
      validUntil: inactiveEmployeeLegacyAssignment.validUntil,
      reason: '員工離職，撤銷既有任用',
      expectedCatalogVersion: initialWorkspace.catalogBinding.catalogVersion,
      expectedCatalogPayloadHash: initialWorkspace.catalogBinding.catalogSha256,
      expectedGovernanceRevision: initialWorkspace.governanceRevision,
      expectedOrganizationRevision: initialWorkspace.organizationRevision,
    })
    expect(host.textContent).toContain('變更前')
    expect(host.textContent).toContain('變更後')
    expect(host.textContent).toContain('有效中')
    expect(host.textContent).toContain('已撤銷')
    expect(mocks.publish).not.toHaveBeenCalled()

    await click('確認並發布')
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish.mock.calls[0][0]).toMatchObject({
      operation: 'revoke',
      assignmentId: inactiveEmployeeLegacyAssignment.assignmentId,
      employeeId: inactiveEmployeeLegacyAssignment.employeeId,
      stableRoleId: inactiveEmployeeLegacyAssignment.stableRoleId,
      validFrom: inactiveEmployeeLegacyAssignment.validFrom,
      validUntil: inactiveEmployeeLegacyAssignment.validUntil,
    })
    expect(mocks.publish.mock.calls[0][1]).toEqual(command)
  })

  it('shows a business-readable publish permission denial and clears the known pre-commit command', async () => {
    mocks.publish.mockRejectedValueOnce(new mocks.ApiError('APP_PUBLISH_GRANT_REQUIRED', 403))
    await mount()
    await preparePreview()
    await click('確認並發布')

    expect(host.textContent).toContain('目前沒有發布 FMS 任用的權限。')
    expect(host.textContent).not.toContain('APP_PUBLISH_GRANT_REQUIRED')
    expect(host.querySelector('#fms-preview-title')).not.toBeNull()
    expect(host.textContent).not.toContain('查詢原操作收據')
    expect(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a')).toBeNull()
    const publishButton = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === '確認並發布')
    expect(publishButton?.disabled).toBe(true)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it('uses the workspace publish allowance to block publishing while leaving preview available', async () => {
    mocks.loadWorkspace.mockResolvedValueOnce({
      ...initialWorkspace,
      allowedOperations: { preview: true, publish: false },
    })
    await mount()
    await preparePreview()

    expect(host.textContent).toContain('目前沒有發布 FMS 任用的權限。')
    const publishButton = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === '確認並發布')
    expect(publishButton?.disabled).toBe(true)
    expect(mocks.preview).toHaveBeenCalledTimes(1)
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('does not dispatch publish when the pending command cannot be saved synchronously', async () => {
    await mount()
    await preparePreview()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('storage unavailable', 'QuotaExceededError')
    })

    await click('確認並發布')

    expect(mocks.publish).not.toHaveBeenCalled()
    expect(host.textContent).toContain('尚未送出任用命令')
    setItem.mockRestore()
  })

  it('keeps the original command pending, rechecks only its receipt, and never republishes after an unknown result', async () => {
    mocks.loadWorkspace.mockResolvedValueOnce(initialWorkspace).mockResolvedValueOnce(refreshedWorkspace)
    mocks.searchEmployees.mockResolvedValueOnce(directoryPage()).mockResolvedValueOnce(directoryPage('gov-r2', 'org-r2'))
    const command = { commandId: 'command-generated', requestHash: 'request-hash', previewHash: 'preview-hash' }
    mocks.publish.mockImplementationOnce(() => {
      expect(JSON.parse(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a') ?? 'null'))
        .toEqual({ version: 1, ...command })
      return Promise.reject(new TypeError('response lost'))
    })
    mocks.receipt.mockResolvedValueOnce(receipt(command, 'not_found')).mockResolvedValueOnce(receipt(command, 'applied'))
    await mount()
    await preparePreview()
    await click('確認並發布')

    expect(host.textContent).toContain('發布結果未知')
    expect(host.textContent).toContain('查詢原操作收據')
    const stored = JSON.parse(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a') ?? 'null')
    expect(stored).toEqual({ version: 1, ...command })
    expect(Object.keys(stored).sort()).toEqual(['commandId', 'previewHash', 'requestHash', 'version'])
    expect(JSON.stringify(stored)).not.toContain(employee.employeeId)
    expect(JSON.stringify(stored)).not.toContain('職務調整')

    await act(async () => root.unmount())
    root = createRoot(host)
    await mount()
    expect(host.querySelector('#fms-preview-title')).toBeNull()
    expect((host.querySelector('#fms-employee') as HTMLSelectElement).disabled).toBe(true)
    expect(host.textContent).toContain('查詢原操作收據')

    await click('查詢原操作收據')
    expect(mocks.receipt).toHaveBeenLastCalledWith(command.commandId)
    expect(host.textContent).toContain('尚未查到原操作收據')
    expect(host.textContent).toContain('查詢原操作收據')
    await click('查詢原操作收據')

    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish.mock.calls[0][1]).toEqual(command)
    expect(mocks.receipt.mock.calls).toEqual([[command.commandId], [command.commandId]])
    expect(mocks.loadWorkspace).toHaveBeenCalledTimes(3)
    expect(host.textContent).toContain('現行資料已更新')
    expect(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a')).toBeNull()
  })

  it.each([
    'COMMAND_NOT_OBSERVED',
    'COMMAND_STILL_PROCESSING',
    'COMMAND_ID_CONFLICT',
    'UNRECOGNIZED_CLIENT_CONFLICT',
  ])('keeps %s unknown after HTTP 409 and only checks the original receipt', async (code) => {
    const command = { commandId: 'command-generated', requestHash: 'request-hash', previewHash: 'preview-hash' }
    mocks.publish.mockRejectedValueOnce(new mocks.ApiError(code, 409))
    mocks.receipt.mockResolvedValueOnce(receipt(command, 'not_found'))
    await mount()
    await preparePreview()
    await click('確認並發布')

    expect(host.textContent).toContain('發布結果未知')
    expect(host.textContent).toContain('查詢原操作收據')
    expect(JSON.parse(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a') ?? 'null'))
      .toEqual({ version: 1, ...command })
    await click('查詢原操作收據')

    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.receipt).toHaveBeenCalledTimes(1)
    expect(mocks.receipt).toHaveBeenCalledWith(command.commandId)
    expect(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a')).not.toBeNull()
    expect(host.textContent).toContain('尚未查到原操作收據')
  })

  it('marks a revision conflict stale, reloads workspace and current directory query, then previews with fresh revisions', async () => {
    const latestPreview = {
      ...preview,
      catalogBinding: refreshedWorkspace.catalogBinding,
      organizationRevision: 'org-r2',
      requestHash: 'request-hash-r2',
      previewHash: 'preview-hash-r2',
    }
    mocks.loadWorkspace.mockResolvedValueOnce(initialWorkspace).mockResolvedValueOnce(refreshedWorkspace)
    mocks.searchEmployees
      .mockResolvedValueOnce(directoryPage())
      .mockResolvedValueOnce(directoryPage())
      .mockResolvedValueOnce(directoryPage('gov-r2', 'org-r2'))
    mocks.preview
      .mockRejectedValueOnce(new mocks.ApiError('GOVERNANCE_REVISION_CONFLICT', 409))
      .mockResolvedValueOnce(latestPreview)
    await mount()
    await change('fms-employee-search', '王')
    await click('搜尋')
    await change('fms-employee', employee.employeeId)
    await change('fms-role', role.stableRoleId)
    await change('fms-reason', '職務調整')
    await click('預覽變更')

    expect(host.textContent).toContain('任用資料已更新，請重新載入後預覽。')
    expect(host.querySelector('#fms-preview-title')).toBeNull()
    expect(host.querySelector('#fms-employee')?.hasAttribute('disabled')).toBe(true)
    await click('重新載入現行任用')

    expect(mocks.searchEmployees).toHaveBeenLastCalledWith('王')
    expect(host.textContent).toContain('任用資料已重新載入。')
    expect((host.querySelector('#fms-employee-search') as HTMLInputElement).value).toBe('王')
    await click('預覽變更')

    expect(mocks.preview).toHaveBeenCalledTimes(2)
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedGovernanceRevision: 'gov-r2',
      expectedOrganizationRevision: 'org-r2',
      expectedCatalogVersion: refreshedWorkspace.catalogBinding.catalogVersion,
      expectedCatalogPayloadHash: refreshedWorkspace.catalogBinding.catalogSha256,
    }))
    expect(host.querySelector('#fms-preview-title')).not.toBeNull()
  })

  it('clears pre-commit pending on native REVISION_CONFLICT, does not resend publish, and reloads before preview', async () => {
    const latestPreview = {
      ...preview,
      organizationRevision: 'org-r2',
      requestHash: 'request-hash-r2',
      previewHash: 'preview-hash-r2',
    }
    mocks.loadWorkspace.mockResolvedValueOnce(initialWorkspace).mockResolvedValueOnce(refreshedWorkspace)
    mocks.searchEmployees
      .mockResolvedValueOnce(directoryPage())
      .mockResolvedValueOnce(directoryPage())
      .mockResolvedValueOnce(directoryPage('gov-r2', 'org-r2'))
    mocks.preview.mockResolvedValueOnce(preview).mockResolvedValueOnce(latestPreview)
    mocks.publish.mockRejectedValueOnce(new mocks.ApiError('REVISION_CONFLICT', 409))
    await mount()
    await change('fms-employee-search', '小明')
    await click('搜尋')
    await change('fms-employee', employee.employeeId)
    await change('fms-role', role.stableRoleId)
    await change('fms-reason', '職務調整')
    await click('預覽變更')
    await click('確認並發布')

    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a')).toBeNull()
    expect(host.textContent).toContain('任用資料已更新，請重新載入後預覽。')
    expect(host.textContent).not.toContain('REVISION_CONFLICT')
    expect(host.textContent).not.toContain('查詢原操作收據')
    expect(host.textContent).toContain('重新載入現行任用')

    await click('重新載入現行任用')
    expect(mocks.searchEmployees).toHaveBeenLastCalledWith('小明')
    await click('預覽變更')

    expect(mocks.preview).toHaveBeenCalledTimes(2)
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedGovernanceRevision: 'gov-r2',
      expectedOrganizationRevision: 'org-r2',
    }))
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it('does not restore or query a different Principal’s pending command', async () => {
    mocks.publish.mockRejectedValueOnce(new TypeError('response lost'))
    await mount()
    await preparePreview()
    await click('確認並發布')
    expect(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a')).not.toBeNull()

    await act(async () => root.unmount())
    mocks.principalId = 'principal-b'
    root = createRoot(host)
    await mount()

    expect(host.textContent).not.toContain('查詢原操作收據')
    expect((host.querySelector('#fms-employee') as HTMLSelectElement).disabled).toBe(false)
    expect(mocks.receipt).not.toHaveBeenCalled()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('orgmaster:fms-role-assignment:pending:v1:principal-a')).not.toBeNull()
  })
})
