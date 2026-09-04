/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { PrivilegedAssignmentOperationResponse, PrivilegedAssignmentWorkspace } from '../governance/apiClient'
import type { Employee } from '../types'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  loadPrivilegedAssignmentWorkspace: vi.fn(),
  previewPrivilegedAssignment: vi.fn(),
  publishPrivilegedAssignment: vi.fn(),
}))

vi.mock('../governance/apiClient', () => mocks)

import { GovernancePrivilegedAssignments } from './GovernancePrivilegedAssignments'

const employees = [{ id: 'employee-2', name: '王小明' }] as Employee[]
const baseWorkspace: PrivilegedAssignmentWorkspace = {
  contractVersion: 'orgmaster.privileged-assignment-workspace.v1',
  applicationId: 'ai-pdm',
  stableRoleId: 'role-system-admin',
  catalogVersion: 'catalog-v1',
  catalogPayloadHash: 'a'.repeat(64),
  governanceRevision: 'governance-revision-1',
  organizationVersionId: 'organization-v1',
  organizationRevision: 'organization-revision-1',
  sourceDataAt: '2026-09-02T00:00:00.000Z',
  mutationAllowed: true,
  blockers: [],
  role: {
    stableRoleId: 'role-system-admin',
    roleCode: 'system_admin',
    displayName: 'System Admin',
    status: 'active',
    assignable: true,
    riskLevel: 'critical',
    subjectKind: 'principal',
    assignmentTier: 'cross_app_override',
    recommendationAllowed: false,
    delegationAllowed: false,
    allowedScopeKinds: ['global'],
  },
  eligiblePrincipals: [{ employeeId: 'employee-2', principalAdmissionId: 'admission-2', principalHint: 'privileged•••tion2', accountType: 'human_privileged', status: 'active' }],
  assignments: [{ assignmentId: 'assignment-1', employeeId: 'employee-2', principalAdmissionId: 'admission-2', principalHint: 'privileged•••tion2', status: 'active', validFrom: '2026-09-01T00:00:00.000Z', validTo: null, auditReference: 'audit-1' }],
}

const previewResponse: PrivilegedAssignmentOperationResponse = {
  contractVersion: 'orgmaster.privileged-assignment-operation.v1',
  phase: 'preview',
  operation: 'grant_system_admin',
  applicationId: 'ai-pdm',
  stableRoleId: 'role-system-admin',
  payload: { employeeId: 'employee-2', principalAdmissionId: 'admission-2' },
  expected: {
    catalogVersion: 'catalog-v1',
    catalogPayloadHash: 'a'.repeat(64),
    governanceRevision: 'governance-revision-1',
    organizationRevision: 'organization-revision-1',
  },
  reason: '升任治理管理者',
  requestHash: 'request-hash',
  preview: { previewHash: 'preview-hash', beforeHolderCount: 1, afterHolderCount: 2, targetHint: 'privileged•••tion2', affectedSessionCount: 1, securityAlertRequired: true },
}

function setFieldValue(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set
  setter?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function renderCenter(workspace: PrivilegedAssignmentWorkspace, workspaceMutationAllowed = true) {
  mocks.loadPrivilegedAssignmentWorkspace.mockResolvedValue({ payload: workspace })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<GovernancePrivilegedAssignments employees={employees} workspaceMutationAllowed={workspaceMutationAllowed} />))
  return { host, root }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

describe('GovernancePrivilegedAssignments', () => {
  it('renders only redacted principal hints and requires preview before publish', async () => {
    mocks.loadPrivilegedAssignmentWorkspace.mockReset()
    mocks.previewPrivilegedAssignment.mockReset().mockResolvedValue({ payload: previewResponse })
    mocks.publishPrivilegedAssignment.mockReset().mockResolvedValue({ payload: { receiptStatus: 'applied', decisionCode: null } })
    const { host, root } = renderCenter(baseWorkspace)
    await settle()

    expect(host.textContent).toContain('特權設定')
    expect(host.textContent).toContain('privileged•••tion2')
    expect(host.textContent).not.toContain('principalId')
    const select = host.querySelector('select[aria-label="特權身分"]') as HTMLSelectElement
    const reason = host.querySelector('textarea[aria-label="操作原因"]') as HTMLTextAreaElement
    act(() => {
      setFieldValue(select, 'admission-2')
      setFieldValue(reason, '升任治理管理者')
    })
    const previewButton = [...host.querySelectorAll('button')].find((button) => button.textContent === '預覽授予')
    expect(previewButton).not.toBeUndefined()
    act(() => previewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await settle()
    expect(mocks.previewPrivilegedAssignment).toHaveBeenCalledWith(expect.objectContaining({ operation: 'grant_system_admin', employeeId: 'employee-2', principalAdmissionId: 'admission-2', reason: '升任治理管理者' }))
    expect(host.textContent).toContain('操作預覽：授予')

    const publishButton = [...host.querySelectorAll('button')].find((button) => button.textContent === '確認授予')
    act(() => publishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await settle()
    expect(mocks.publishPrivilegedAssignment).toHaveBeenCalledWith(expect.objectContaining({ operation: 'grant_system_admin' }), expect.any(String), 'request-hash', 'preview-hash')
    expect(host.textContent).toContain('特權設定授予已套用')
    act(() => root.unmount())
    host.remove()
  })

  it('fails closed for denied or narrow-device mutation contexts', async () => {
    mocks.loadPrivilegedAssignmentWorkspace.mockReset()
    const denied = { ...baseWorkspace, mutationAllowed: false, blockers: ['PRIVILEGED_MUTATION_REQUIRED'] }
    const { host, root } = renderCenter(denied, false)
    await settle()
    expect(host.textContent).toContain('目前為唯讀')
    expect(host.textContent).toContain('cross-app override')
    expect(host.textContent).toContain('目前裝置僅供閱讀')
    expect(host.querySelector('button:not([disabled])')).toBeNull()
    expect(host.textContent).not.toContain('預覽授予')
    act(() => root.unmount())
    host.remove()
  })

  it('states the empty-holder and no-eligible-principal conditions explicitly', async () => {
    mocks.loadPrivilegedAssignmentWorkspace.mockReset()
    const empty = { ...baseWorkspace, mutationAllowed: false, blockers: ['NO_ELIGIBLE_PRINCIPAL'], eligiblePrincipals: [], assignments: [] }
    const { host, root } = renderCenter(empty)
    await settle()
    expect(host.textContent).toContain('目前沒有可授予的 human_privileged 身分')
    expect(host.textContent).toContain('尚無 system_admin 持有者')
    expect(host.textContent).not.toContain('預覽授予')
    act(() => root.unmount())
    host.remove()
  })

  it('exposes a reload path when a preview becomes stale', async () => {
    mocks.loadPrivilegedAssignmentWorkspace.mockReset()
    mocks.previewPrivilegedAssignment.mockReset().mockRejectedValue({ code: 'REVISION_CONFLICT' })
    const { host, root } = renderCenter(baseWorkspace)
    await settle()
    const select = host.querySelector('select[aria-label="特權身分"]') as HTMLSelectElement
    const reason = host.querySelector('textarea[aria-label="操作原因"]') as HTMLTextAreaElement
    act(() => {
      setFieldValue(select, 'admission-2')
      setFieldValue(reason, '重新確認治理責任')
    })
    const previewButton = [...host.querySelectorAll('button')].find((button) => button.textContent === '預覽授予')
    act(() => previewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await settle()
    expect(host.textContent).toContain('治理資料已在其他操作中更新')
    expect([...host.querySelectorAll('button')].some((button) => button.textContent === '重新載入')).toBe(true)
    act(() => root.unmount())
    host.remove()
  })
})
