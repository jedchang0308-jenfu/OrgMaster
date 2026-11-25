/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { GovernanceProjedUsers } from './GovernanceProjedUsers'
import { PROJED_USERS_VERSION, type ProjedUserRecord } from '../governance/projedUsers'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const personal: ProjedUserRecord = { googleSubject: 'synthetic-subject-personal', accountId: 'account-local', principalId: 'principal-local', email: 'personal@example.invalid', displayName: '個人測試', kind: 'personal', enabled: true, revision: '3:7', identityStatus: 'ACTIVE', loginEligible: true, externalStatus: 'NONE' }
const external: ProjedUserRecord = { ...personal, googleSubject: 'synthetic-subject-external', accountId: null, principalId: null, email: 'guest@example.invalid', displayName: null, kind: 'external', enabled: false, revision: '0:2', identityStatus: 'UNREGISTERED', loginEligible: false, externalStatus: 'PENDING' }
const snapshot = (users: ProjedUserRecord[] = [personal, external]) => ({ contractVersion: PROJED_USERS_VERSION, users })
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLElement
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.unstubAllGlobals() })

async function render(canManage = true, principalId = 'admin-local') {
  if (!root) { host = document.createElement('div'); document.body.append(host); root = createRoot(host) }
  await act(async () => root!.render(<GovernanceProjedUsers canManage={canManage} principalId={principalId} />))
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === label)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}
async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
  await act(async () => element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })))
}

afterEach(() => { root = undefined })

it('shows personal and external login eligibility without private workspace data or Google subject columns', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(snapshot()))
  vi.stubGlobal('fetch', fetch); await render(false)
  expect(fetch).toHaveBeenCalledWith('/api/orgmaster/projed-users/v1', { credentials: 'same-origin', cache: 'no-store' })
  expect(host.textContent).toContain('個人測試')
  expect(host.textContent).toContain('principal-local')
  expect(host.textContent).toContain('尚未首次登入')
  expect(host.textContent).toContain('不具登入資格')
  expect(host.textContent).toContain('待核准')
  expect(host.textContent).not.toContain('synthetic-subject')
  expect([...host.querySelectorAll('button')].map(item => item.textContent)).toEqual(['重新載入'])
  expect(host.querySelectorAll('th')).toHaveLength(6)
})

it('searches names, email and Principal and combines type and enabled filters', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(snapshot())))
  await render()
  const search = host.querySelector('input')!
  for (const query of ['個人測試', 'PERSONAL@example', 'principal-local']) {
    await setValue(search, query)
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody')!.textContent).toContain('個人測試')
  }
  await setValue(search, '')
  const selects = host.querySelectorAll('select')
  await setValue(selects[0], 'external'); await setValue(selects[1], 'disabled')
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
  expect(host.querySelector('tbody')!.textContent).toContain('guest@example.invalid')
  await setValue(selects[1], 'enabled')
  expect(host.textContent).toContain('沒有符合條件的使用者。')
})

it('requires disable confirmation and sends the opaque revision with a UUID then consumes the full latest list', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot()))
    .mockResolvedValueOnce(Response.json(snapshot([{ ...personal, enabled: false, loginEligible: false, revision: '4:8' }])))
  vi.stubGlobal('fetch', fetch); await render()
  await click('停用'); expect(fetch).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('確認停用 個人測試 的 ProJED 登入資格？')
  await click('取消'); expect(fetch).toHaveBeenCalledTimes(1)
  await click('停用'); await click('確認停用')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ commandId: expect.stringMatching(/^[0-9a-f-]{36}$/), googleSubject: personal.googleSubject, expectedRevision: '3:7', action: 'disable' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
  expect(host.querySelector('tbody')!.textContent).toContain('不具登入資格')
})

it('restores without claiming an old Session was restored', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot([external])))
    .mockResolvedValueOnce(Response.json(snapshot([{ ...external, enabled: true }])))
  vi.stubGlobal('fetch', fetch); await render(); await click('恢復')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ action: 'restore', expectedRevision: '0:2' })
  expect(host.textContent).toContain('舊登入不會恢復')
  expect(host.textContent).toContain('尚未首次登入')
  expect(host.textContent).toContain('不具登入資格')
})

it('confirms the original restore without claiming current activation when a later command has disabled the account', async () => {
  const latest = { ...external, enabled: false, revision: '4:2' }
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot([external])))
    .mockRejectedValueOnce(new Error('response lost after restore committed'))
    .mockResolvedValueOnce(Response.json(snapshot([latest])))
    .mockResolvedValueOnce(Response.json(snapshot([latest])))
  vi.stubGlobal('fetch', fetch); await render(); await click('恢復')
  await click('查詢並重送原操作')
  expect(fetch.mock.calls[3][1].body).toBe(fetch.mock.calls[1][1].body)
  expect(host.textContent).toContain('原操作已確認；此帳號目前已停用。')
  expect(host.textContent).not.toContain('已恢復啟用')
  expect(host.textContent).not.toContain('操作結果尚未確認')
  expect(host.querySelector('tbody')!.textContent).toContain('不具登入資格')
  const restore = host.querySelector('tbody button') as HTMLButtonElement
  expect(restore.textContent).toBe('恢復')
  expect(restore.disabled).toBe(false)
})

it.each(['network', '503', 'invalid-response'])('keeps an unknown %s result fenced and reads back before replaying the same command', async failure => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot([external])))
  if (failure === 'network') fetch.mockRejectedValueOnce(new Error('network'))
  else if (failure === '503') fetch.mockResolvedValueOnce(Response.json({ code: 'UNAVAILABLE' }, { status: 503 }))
  else fetch.mockResolvedValueOnce(Response.json({ users: [] }))
  fetch.mockResolvedValueOnce(Response.json(snapshot([external])))
    .mockResolvedValueOnce(Response.json(snapshot([{ ...external, enabled: true }])))
  vi.stubGlobal('fetch', fetch); await render(); await click('恢復')
  expect(host.textContent).toContain('操作結果尚未確認')
  expect([...host.querySelectorAll('tbody button')].every(button => (button as HTMLButtonElement).disabled)).toBe(true)
  await click('查詢並重送原操作')
  expect(fetch.mock.calls[2][1].method).toBeUndefined()
  expect(fetch.mock.calls[3][1].body).toBe(fetch.mock.calls[1][1].body)
  expect(host.textContent).not.toContain('操作結果尚未確認')
})

it.each([403, 409])('shows a known %s denial without offering an unknown-command replay', async status => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot([external])))
    .mockResolvedValueOnce(Response.json({ code: 'DENIED' }, { status }))
  vi.stubGlobal('fetch', fetch); await render(); await click('恢復')
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(status === 403 ? '管理員權限' : '資料已更新')
  expect(host.textContent).not.toContain('操作結果尚未確認')
})

it('retains an unknown command when its readback fails and never replays after management permission is removed', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot([external])))
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce(Response.json({ code: 'DENIED' }, { status: 403 }))
  vi.stubGlobal('fetch', fetch); await render(); await click('恢復'); await click('查詢並重送原操作')
  expect(host.textContent).toContain('操作結果尚未確認')
  expect(fetch).toHaveBeenCalledTimes(3)
  await render(false)
  expect(host.textContent).not.toContain('查詢並重送原操作')
  expect(host.querySelectorAll('tbody button')).toHaveLength(0)
})

it('ignores a previous actor response and clears their pending operation on actor change', async () => {
  let complete: (value: Response) => void = () => {}
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(snapshot([external])))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    .mockResolvedValueOnce(Response.json(snapshot([personal])))
  vi.stubGlobal('fetch', fetch); await render(); await click('恢復')
  await render(true, 'another-admin')
  await act(async () => complete(Response.json(snapshot([external]))))
  expect(host.textContent).toContain('個人測試')
  expect(host.textContent).not.toContain('guest@example.invalid')
  expect(host.textContent).not.toContain('操作結果尚未確認')
})

it('handles an empty list and load failure explicitly', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(Response.json(snapshot([])))
  vi.stubGlobal('fetch', fetch); await render()
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('無法讀取清單')
  await click('重新載入')
  expect(host.textContent).toContain('尚無 ProJED 使用者。')
})
