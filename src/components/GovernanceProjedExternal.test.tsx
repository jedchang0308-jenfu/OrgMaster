/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { GovernanceProjedExternal } from './GovernanceProjedExternal'
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const row = { requestId: '11111111-1111-4111-8111-111111111111', invitationId: 'invite', boardId: 'board', role: 'member', inviterPrincipalId: 'owner', contactEmail: 'guest@example.invalid', principalId: null, googleSubject: null, company: 'company', note: '', status: 'PENDING', decision: 'PENDING', revision: '7', approvedBy: null, approvedAt: null, lastLoginAt: null }
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLElement
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.unstubAllGlobals() })
async function render(canManage = true) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root?.render(<GovernanceProjedExternal canManage={canManage} principalId="admin" />) })
}
it('approves from the real management entry with CAS and command identity', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ requests: [row] })).mockResolvedValueOnce(Response.json({ ...row, decision: 'APPROVED' })).mockResolvedValueOnce(Response.json({ requests: [{ ...row, decision: 'APPROVED' }] }))
  vi.stubGlobal('fetch', fetch); await render()
  expect(host.textContent).toContain('尚未驗證身分')
  const approve = [...host.querySelectorAll('button')].find(button => button.textContent === '核准')!
  await act(async () => approve.click())
  expect(fetch.mock.calls[1][0]).toBe('/api/orgmaster/projed-external-requests/v1')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ requestId: row.requestId, expectedRevision: '7', action: 'approve' })
  expect(host.textContent).toContain('已核准，等待身分驗證')
})
it('retains the same command after an unknown outcome', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ requests: [row] })).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(Response.json(row)).mockResolvedValueOnce(Response.json({ requests: [row] }))
  vi.stubGlobal('fetch', fetch); await render()
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '核准')!.click())
  expect(host.textContent).toContain('操作結果尚未確認')
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '查詢並重送原操作')!.click())
  expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[1][1].body)
})
it('shows current state without mutation controls for a read-only surface', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ requests: [{ ...row, status: 'REJECTED', decision: 'REJECTED' }] })))
  await render(false)
  expect(host.textContent).toContain('拒絕')
  expect([...host.querySelectorAll('button')].map(button => button.textContent)).toEqual(['重新載入'])
})
