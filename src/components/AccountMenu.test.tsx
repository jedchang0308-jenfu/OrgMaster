/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountMenu } from './AccountMenu'
import type { AuthSessionContextValue } from '../auth/AuthGate'

const mocks = vi.hoisted(() => ({ auth: null as AuthSessionContextValue | null, check: vi.fn() }))
vi.mock('../auth/AuthGate', () => ({ useAuthSession: () => mocks.auth }))
vi.mock('../appUpdate', () => ({ checkAppUpdate: mocks.check }))
let container: HTMLDivElement
let root: Root
let blocked = false
const employees = [{ id: 'employee-1', name: 'Jed', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }]
async function render() { await act(async () => root.render(<AccountMenu employees={employees} reloadBlocked={blocked} />)) }
function button(text: string) { return [...container.querySelectorAll('button')].find((item) => item.textContent === text)! }
async function open() { await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="更多選項"]')!.click()) }
async function click(text: string) { await act(async () => button(text).click()) }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.auth = { session: { user: { principalId: 'principal-1', employeeId: 'employee-1', email: 'jed@example.test' }, session: { expiresAt: '2099-01-01' }, assuranceLevel: 'aal1', correlationId: 'test-account' }, managedIdentityEnabled: true, employeeNumberManagementEnabled: true, phase: 'active', logout: vi.fn(async () => {}) }
  mocks.check.mockReset().mockResolvedValue(false)
  blocked = false
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('AccountMenu', () => {
  it('shows actual identity and keeps account actions in the reference order', async () => {
    await render(); await open()
    expect(container.textContent).toContain('Jedjed@example.test登出')
    expect([...container.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(['立即檢查更新', '登出'])
    await click('登出'); expect(mocks.auth!.logout).toHaveBeenCalledOnce()
  })
  it('opens with keyboard, moves focus, and restores trigger focus on Escape', async () => {
    await render()
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="更多選項"]')!
    trigger.focus()
    await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(button('立即檢查更新'))
    await act(async () => button('立即檢查更新').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    expect(document.activeElement).toBe(button('登出'))
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('closes on outside pointer without running any action', async () => {
    await render(); await open()
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(mocks.auth!.logout).not.toHaveBeenCalled()
  })
  it('checks current version and supports retry after a failure', async () => {
    await render(); await open(); await click('立即檢查更新')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('目前已是最新版本')
    mocks.check.mockRejectedValueOnce(new Error('offline'))
    await click('立即檢查更新')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('無法檢查更新')
    await click('立即檢查更新')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
  it('prevents duplicate pending checks', async () => {
    let finish!: (result: boolean) => void
    mocks.check.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve }))
    await render(); await open(); await click('立即檢查更新'); await click('正在檢查更新…')
    expect(mocks.check).toHaveBeenCalledOnce()
    await act(async () => finish(false))
  })
  it('blocks update reload while unsaved and rechecks the current dirty state', async () => {
    blocked = true; mocks.check.mockResolvedValue(true)
    await render(); await open(); await click('立即檢查更新')
    expect(button('更新並重新載入').getAttribute('aria-disabled')).toBe('true')
    await click('更新並重新載入')
    expect(container.textContent).toContain('請先儲存變更')
    blocked = false; await render()
    expect(button('更新並重新載入').getAttribute('aria-disabled')).toBe('false')
  })
  it('retains failed logout for retry and blocks repeated processing logout', async () => {
    mocks.auth!.phase = 'failed'; await render(); await open(); await click('重試登出')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('登出失敗')
    expect(mocks.auth!.logout).toHaveBeenCalledOnce()
    mocks.auth!.phase = 'processing'; await render(); await click('登出中…')
    expect(mocks.auth!.logout).toHaveBeenCalledOnce()
  })
  it('does not invent an email and preserves development role switching', async () => {
    mocks.auth!.session.user.email = null
    await render(); await open(); expect(container.textContent).toContain('未提供信箱')
    mocks.auth!.session.developmentProfile = { id: 'employee', employeeId: 'employee-1', employeeName: '測試員工', roleCode: 'employee', roleName: '員工', description: 'test' }
    await render(); expect(container.textContent).toContain('測試員工員工切換角色')
  })
})
