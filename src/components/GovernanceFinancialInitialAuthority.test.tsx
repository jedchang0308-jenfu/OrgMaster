/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GovernanceFinancialInitialAuthority } from './GovernanceFinancialInitialAuthority'

const api = vi.hoisted(() => ({
  previewFinancialInitialAuthority: vi.fn(),
  publishFinancialInitialAuthority: vi.fn(),
  loadFinancialInitialAuthorityReceipt: vi.fn(),
}))
vi.mock('../governance/apiClient', async original => ({ ...await original<typeof import('../governance/apiClient')>(), ...api }))

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const preview = {
  applicationId: 'financial-management-system', catalogBinding: { catalogVersion: 'catalog-v1', catalogSha256: 'a'.repeat(64) },
  beforeAssignments: [], afterAssignments: [
    { employeeId: 'employee-shijie', roleId: 'role-finance-manager', roleNameSnapshot: '財務主管' },
    { employeeId: 'employee-shijie', roleId: 'role-owner', roleNameSnapshot: '負責人' },
  ], beforeGrants: [], afterGrants: [
    { employeeId: 'employee-shijie', principalId: 'principal-shijie', capability: 'financial-management-system.role_assignment.manage' },
    { employeeId: 'employee-shijie', principalId: 'principal-shijie', capability: 'financial-management-system.role_assignment.publish' },
  ], authorizationEffect: 'not_committed', organizationRevision: 'organization-r1', requestHash: 'b'.repeat(64), previewHash: 'c'.repeat(64),
}

const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent === text) as HTMLButtonElement
const setTextarea = async (value: string) => {
  const input = host.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
  api.previewFinancialInitialAuthority.mockResolvedValue({ payload: preview })
  api.publishFinancialInitialAuthority.mockResolvedValue({ payload: { receiptStatus: 'applied' } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

it('previews the fixed employee, roles and scope before publishing the exact hashes', async () => {
  const onChanged = vi.fn()
  await act(async () => root.render(<GovernanceFinancialInitialAuthority employeeId="employee-shijie" employeeName="世傑" governanceRevision="governance-r1" organizationRevision="organization-r1" onChanged={onChanged} />))
  await setTextarea(JSON.stringify({ release: { version: 'catalog-v1' } }))
  await act(async () => button('預覽初始權限').click())

  expect(api.previewFinancialInitialAuthority).toHaveBeenCalledWith(expect.objectContaining({
    employeeId: 'employee-shijie', stableRoleIds: ['role-finance-manager', 'role-owner'],
    scope: { kind: 'workspace', value: 'company-jenfu' }, release: { version: 'catalog-v1' },
    expectedGovernanceRevision: 'governance-r1', expectedOrganizationRevision: 'organization-r1',
  }))
  expect(host.textContent).toContain('Preview 已完成，尚未發布')
  expect(host.textContent).toContain('財務主管、負責人')
  expect(api.publishFinancialInitialAuthority).not.toHaveBeenCalled()

  await act(async () => button('正式發布').click())
  expect(api.publishFinancialInitialAuthority).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'employee-shijie' }), '00000000-0000-4000-8000-000000000001', preview.requestHash, preview.previewHash)
  expect(onChanged).toHaveBeenCalledTimes(1)
})

it('does not send malformed release JSON', async () => {
  await act(async () => root.render(<GovernanceFinancialInitialAuthority employeeId="employee-shijie" employeeName="世傑" governanceRevision="governance-r1" organizationRevision="organization-r1" />))
  await setTextarea('{')
  await act(async () => button('預覽初始權限').click())
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('無法解析')
  expect(api.previewFinancialInitialAuthority).not.toHaveBeenCalled()
})
