/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GovernanceCenter } from './GovernanceCenter'
import { createSeedDocumentV2 } from '../governance/migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from '../governance/aiPdmCatalog'
import type { GovernanceApiSnapshot } from '../governance/apiClient'
import type { GovernanceCommandV2 } from '../governance/types'

const mocks = vi.hoisted(() => ({ loadGovernance: vi.fn(), loadGovernanceSession: vi.fn(), patchGovernanceDraft: vi.fn() }))
vi.mock('../governance/apiClient', async original => ({ ...await original<typeof import('../governance/apiClient')>(), ...mocks }))
let host: HTMLDivElement, root: Root
const employee = { id: 'employee-1', name: '王小明', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }
function fixture(count = 1): GovernanceApiSnapshot {
  const document = createSeedDocumentV2()
  document.draft.roleAssignments = Array.from({ length: count }, (_, i) => ({ id: 'revoked-' + i, employeeId: employee.id, applicationId: 'orgmaster', roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null, scope: { kind: 'global' }, status: 'revoked', validFrom: '2026-01-01T00:00:00Z', validTo: null, effectState: 'orgmaster-enforced' }))
  return { document: { ...document, draft: { ...document.draft, identityLinks: [] }, publishedVersions: [] }, revision: 'r1', activeVersionId: null, versions: [], catalogs: [readAiPdmRoleCatalog()] }
}
async function render(snapshot = fixture(), manage = true, mobile = false) {
  mocks.loadGovernance.mockResolvedValue({ payload: snapshot, revision: 'r1' })
  mocks.loadGovernanceSession.mockResolvedValue({ payload: { runtimeMode: 'verified-session', actor: { principalId: 'operator', employeeId: employee.id }, capabilities: { manage, publish: manage, simulate: manage } } })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  mocks.patchGovernanceDraft.mockImplementation(async (_revision, command: GovernanceCommandV2) => {
    const document = structuredClone(snapshot.document)
    if (command.type === 'RESTORE_ROLE_ASSIGNMENT') document.draft.roleAssignments = document.draft.roleAssignments.map(v => v.id === command.id ? { ...v, status: 'active' } : v)
    if (command.type === 'REMOVE_ROLE_ASSIGNMENT') document.draft.roleAssignments = document.draft.roleAssignments.filter(v => v.id !== command.id)
    return { revision: 'r2', payload: { document, revision: 'r2', status: 'applied' } }
  })
  await act(async () => root.render(<GovernanceCenter employees={[employee]} departments={[]} roles={[]} currentOrganizationVersionId="org-current" initialSection="assignments" />))
}
const textButton = (text: string) => [...host.querySelectorAll('button')].find(v => v.textContent === text)!
const click = async (button: HTMLButtonElement) => { await act(async () => button.click()) }
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

it('restores the exact revoked row with a status-only ID command', async () => {
  await render()
  await click(textButton('啟用'))
  expect(mocks.patchGovernanceDraft).toHaveBeenCalledWith('r1', expect.objectContaining({ type: 'RESTORE_ROLE_ASSIGNMENT', id: 'revoked-0' }))
  expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('有效')
  expect(host.textContent).toContain('尚未發布')
})
it('requires confirmation, supports cancellation, then removes exactly one row', async () => {
  await render()
  await click(textButton('刪除'))
  expect(host.querySelector('dialog')?.textContent).toContain('發布歷史與稽核紀錄仍會保留')
  expect(mocks.patchGovernanceDraft).not.toHaveBeenCalled()
  await click(textButton('取消刪除'))
  expect(mocks.patchGovernanceDraft).not.toHaveBeenCalled()
  await click([...host.querySelectorAll('dialog button')].find(v => v.textContent === '刪除')! as HTMLButtonElement)
  await click(textButton('刪除此筆指派'))
  expect(mocks.patchGovernanceDraft).toHaveBeenCalledWith('r1', expect.objectContaining({ type: 'REMOVE_ROLE_ASSIGNMENT', id: 'revoked-0' }))
  expect(host.querySelector('.governance-matrix__person')).toBeNull()
})
it('opens per-assignment details for multiple records and never sends a bulk restore', async () => {
  await render(fixture(2))
  await click(textButton('啟用'))
  expect(host.querySelectorAll('.governance-assignment-details__item')).toHaveLength(2)
  expect(mocks.patchGovernanceDraft).not.toHaveBeenCalled()
  await click(textButton('啟用此筆指派'))
  expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
  expect(mocks.patchGovernanceDraft.mock.calls[0][1].id).toBe('revoked-0')
})
it.each([[false, false], [true, true]])('keeps actions absent when manage=%s mobile=%s', async (manage, mobile) => {
  await render(fixture(), manage, mobile)
  expect([...host.querySelectorAll('button')].some(v => ['啟用', '刪除'].includes(v.textContent ?? ''))).toBe(false)
})
it('disables expired restore while allowing confirmed deletion', async () => {
  const snapshot = fixture(); snapshot.document.draft.roleAssignments[0].validTo = '2026-02-01T00:00:00Z'
  await render(snapshot)
  expect(textButton('啟用').disabled).toBe(true)
  expect(textButton('刪除').disabled).toBe(false)
})
it('retains the revoked record after a failure and allows retry', async () => {
  await render()
  mocks.patchGovernanceDraft.mockRejectedValueOnce({ code: 'REVISION_CONFLICT' })
  await click(textButton('啟用'))
  expect(host.querySelector('[role=alert]')?.textContent).toContain('重新載入')
  expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('已撤銷')
  await click(textButton('啟用'))
  expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(2)
  expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('有效')
})
it('serializes duplicate clicks while the mutation is pending', async () => {
  await render()
  let resolve!: (value: unknown) => void
  mocks.patchGovernanceDraft.mockImplementation(() => new Promise(r => { resolve = r }))
  await act(async () => { textButton('啟用').click(); textButton('啟用').click() })
  expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
  expect(textButton('刪除').disabled).toBe(true)
  await act(async () => resolve({ revision: 'r2', payload: { document: fixture().document, status: 'noop' } }))
})
