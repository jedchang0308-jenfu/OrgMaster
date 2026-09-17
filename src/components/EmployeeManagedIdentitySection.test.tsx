/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeManagedIdentitySection } from './EmployeeManagedIdentitySection'

vi.mock('./workspace/WorkspaceOverlayHosts', () => ({ WorkspacePortal: ({ children }: { children: React.ReactNode }) => children }))

const api = vi.hoisted(() => ({ loadManagedIdentity: vi.fn(), loadManagedEmployeeNumbers: vi.fn(), assignManagedEmployeeNumber: vi.fn(), findManagedIdentityCandidate: vi.fn(), confirmManagedIdentityLink: vi.fn(), enqueueManagedIdentityRefresh: vi.fn() }))
vi.mock('../managedIdentity/apiClient', () => ({
  ...api,
  ManagedIdentityApiError: class ManagedIdentityApiError extends Error {
    constructor(public readonly code: string, public readonly status: number) { super(code); this.name = 'ManagedIdentityApiError' }
  },
}))

const employee = { id: 'employee-1', name: '王小明', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }
const base = {
  contractVersion: 'orgmaster.managed-identity.v1' as const,
  managedDomain: 'jenfu.com.tw',
  employee: { id: employee.id, status: 'active' as const },
  employeeNumber: { status: 'unassigned' as const, value: null, revision: null },
  identity: { state: 'not_linked' as const, provider: 'google.com' as const, note: 'Google Admin 建立後由 OrgMaster 連結' as const },
  capabilities: { view: true as const, manageNumber: true },
  registryRevision: null,
}

function render(props: Partial<React.ComponentProps<typeof EmployeeManagedIdentitySection>> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<EmployeeManagedIdentitySection employee={employee} mutationAllowed {...props} />))
  return { host, root }
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('EmployeeManagedIdentitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.loadManagedIdentity.mockResolvedValue({ ...base })
    api.loadManagedEmployeeNumbers.mockResolvedValue({ contractVersion: 'orgmaster.managed-identity-numbers.v1', registryRevision: 'revision-1', items: [
      { employeeId: 'employee-1', employeeName: '王小明', employeeNumber: 'JFS0001', status: 'active' },
      { employeeId: 'employee-2', employeeName: '張祐豪', employeeNumber: 'JFS0002', status: 'active' },
      { employeeId: 'employee-3', employeeName: '陳怡君', employeeNumber: 'JFS0003', status: 'retired' },
    ] })
    api.assignManagedEmployeeNumber.mockResolvedValue({ ...base, employeeNumber: { status: 'assigned', value: 'JFS0001', revision: 1 }, registryRevision: '1' })
    api.findManagedIdentityCandidate.mockResolvedValue({ candidateToken: 'opaque-token', expiresAt: '2026-09-17T01:05:00.000Z', employee: { id: 'employee-1', employeeNumber: 'JFS0001' }, directory: { primaryEmail: 'person@jenfu.com.tw' }, workspaceRevision: 'workspace-1', registryRevision: '1' })
    api.confirmManagedIdentityLink.mockResolvedValue({ ...base })
  })
  afterEach(() => document.body.replaceChildren())

  it('shows a single employee-number setup action for an unassigned employee', async () => {
    const { host, root } = render()
    await flush()
    expect(host.textContent).toContain('員工編號與登入身分')
    expect(host.textContent).toContain('尚未設定')
    expect(host.textContent).toContain('設定員工編號')
    expect(host.textContent).not.toContain('邀請')
    act(() => root.unmount())
  })

  it('opens the setup dialog and writes a normalized JFS number', async () => {
    const { host, root } = render()
    await flush()
    act(() => host.querySelector<HTMLButtonElement>('button')?.click())
    expect(host.textContent).toContain('設定員工編號')
    await flush()
    expect(api.loadManagedEmployeeNumbers).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('已存在編號')
    expect(host.textContent).toContain('JFS0002')
    expect(host.textContent).toContain('JFS0003')
    expect(host.textContent).toContain('張祐豪')
    expect(host.textContent).toContain('陳怡君')
    expect(host.textContent).toContain('歷史保留')
    const input = host.querySelector<HTMLInputElement>('input')
    expect(input?.classList.contains('is-invalid')).toBe(true)
    expect(input?.getAttribute('aria-invalid')).toBe('true')
    expect(Array.from(host.querySelectorAll<HTMLLIElement>('#employee-number-existing-list li')).map((row) => row.textContent?.trim())).toEqual([
      'JFS0003陳怡君歷史保留',
      'JFS0002張祐豪使用中',
      'JFS0001王小明目前編號',
    ])
    expect(input).not.toBeNull()
    act(() => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'jfs0001')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    expect(input?.classList.contains('is-valid')).toBe(true)
    expect(input?.getAttribute('aria-invalid')).toBe('false')
    const submit = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('儲存編號'))
    expect(submit?.disabled).toBe(false)
    act(() => submit?.click())
    await flush()
    expect(api.assignManagedEmployeeNumber).toHaveBeenCalledWith('employee-1', expect.objectContaining({ employeeNumber: 'JFS0001', expectedRegistryRevision: null }))
    act(() => root.unmount())
  })

  it('marks duplicate employee numbers as invalid before submit', async () => {
    const { host, root } = render()
    await flush()
    act(() => host.querySelector<HTMLButtonElement>('button')?.click())
    await flush()
    const input = host.querySelector<HTMLInputElement>('input')
    act(() => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'jfs0002')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    expect(input?.classList.contains('is-invalid')).toBe(true)
    expect(input?.getAttribute('aria-invalid')).toBe('true')
    const submit = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('儲存編號'))
    act(() => submit?.click())
    await flush()
    expect(api.assignManagedEmployeeNumber).not.toHaveBeenCalled()
    expect(host.textContent).toContain('此員工編號已存在')
    act(() => root.unmount())
  })

  it('keeps the number controls read-only when the environment is not mutation-enabled', async () => {
    const { host, root } = render({ mutationAllowed: false })
    await flush()
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect(host.textContent).toContain('請聯絡具員工身分管理權限的管理者')
    act(() => root.unmount())
  })

  it('requires an impact confirmation before changing an assigned employee number', async () => {
    api.loadManagedIdentity.mockResolvedValue({
      ...base,
      employeeNumber: { status: 'assigned', value: 'JFS0001', revision: 1 },
      registryRevision: '1',
    })
    const { host, root } = render()
    await flush()
    const changeButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === '變更編號')
    act(() => changeButton?.click())
    const input = host.querySelector<HTMLInputElement>('input')
    act(() => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'jfs0004')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    const continueButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === '繼續')
    act(() => continueButton?.click())
    await flush()
    expect(api.assignManagedEmployeeNumber).not.toHaveBeenCalled()
    expect(host.textContent).toContain('JFS0001 → JFS0004')
    expect(host.textContent).toContain('舊編號將永久保留且不得重用')
    const confirmButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === '確認變更')
    act(() => confirmButton?.click())
    await flush()
    expect(api.assignManagedEmployeeNumber).toHaveBeenCalledWith('employee-1', expect.objectContaining({ employeeNumber: 'JFS0004', expectedRegistryRevision: '1' }))
    act(() => root.unmount())
  })

  it('links an explicit Google primary email without exposing provider identifiers', async () => {
    api.loadManagedIdentity.mockResolvedValue({ ...base, workspaceRevision: 'workspace-1', employeeNumber: { status: 'assigned', value: 'JFS0001', revision: 1 }, registryRevision: '1', capabilities: { ...base.capabilities, manageLink: true } })
    const { host, root } = render()
    await flush()
    const link = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === '連結 Google 主帳號')
    act(() => link?.click())
    const input = host.querySelector<HTMLInputElement>('input[inputmode="email"]')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'person@jenfu.com.tw')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    const lookup = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === '查詢帳號')
    act(() => lookup?.click())
    await flush()
    expect(api.findManagedIdentityCandidate).toHaveBeenCalledWith('employee-1', { expectedWorkspaceRevision: 'workspace-1', expectedRegistryRevision: '1', primaryEmail: 'person@jenfu.com.tw' })
    expect(host.textContent).toContain('person@jenfu.com.tw')
    expect(host.textContent).not.toContain('user-1')
    expect(host.textContent).not.toContain('customer-1')
    act(() => root.unmount())
  })
})
