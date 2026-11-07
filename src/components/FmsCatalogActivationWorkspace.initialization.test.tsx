/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FmsCatalogActivationWorkspace } from './FmsCatalogActivationWorkspace'
const api = vi.hoisted(() => ({ loadFmsCatalogActivationWorkspace: vi.fn(), previewFmsCatalogActivation: vi.fn(), activateFmsCatalog: vi.fn(), loadFmsCatalogActivationReceipt: vi.fn() }))
vi.mock('../auth/AuthGate', () => ({ useAuthSession: () => ({ session: { user: { principalId: 'root-only' } } }) }))
vi.mock('../governance/fmsCatalogActivationApiClient', () => api)
const origin = 'https://fms.example.test', protocol = 'jenfu.fms-catalog-handoff.v1', nonce = '10000000-0000-4000-8000-000000000001', operationId = '10000000-0000-4000-8000-000000000070'
const peer = { postMessage: vi.fn() }, release = { version: 'owned-init-release' }
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('opener', peer); vi.stubGlobal('crypto', { randomUUID: () => 'org-command-1' })
  api.loadFmsCatalogActivationWorkspace.mockResolvedValue({ fmsOrigin: origin, governanceRevision: 'gov-1', organizationRevision: 'org-1', initializationAdoption: { status: 'ready', fixedRoleId: 'role-system-admin' } })
  api.previewFmsCatalogActivation.mockResolvedValue({ requestHash: 'a'.repeat(64), previewHash: 'b'.repeat(64), addedRoles: [{ stableRoleId: 'role-system-admin', displayName: '系統管理員' }], removedRoles: [], changedRoles: [], affectedAssignmentCount: 0,
    compatible: true, alreadyActive: false, allowedOperations: { activate: true }, initializationAdoption: { kind: 'platform_root_catalog_initialization' } })
  api.activateFmsCatalog.mockResolvedValue({ replayed: false })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const click = async (label: string) => act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === label)!.click() })
async function prepare() {
  await act(async () => root.render(<FmsCatalogActivationWorkspace />))
  await act(async () => window.dispatchEvent(new MessageEvent('message', { origin, source: peer as never, data: { protocol, type: 'init', nonce, release, initializationOperationId: operationId } })))
  await click('預覽影響')
}
it('uses the exact initialization preview and normal activate endpoint without issuing import grants or an intent', async () => {
  await prepare(); expect(host.textContent).toContain('明示授予 FMS 管理資格')
  await click('採用此版本')
  expect(api.previewFmsCatalogActivation).toHaveBeenCalledWith(expect.objectContaining({ initializationOperationId: operationId }))
  expect(api.activateFmsCatalog).toHaveBeenCalledWith(expect.objectContaining({ initializationOperationId: operationId, commandId: 'org-command-1' }))
  expect(api.activateFmsCatalog.mock.calls[0][0]).not.toHaveProperty('fmsCheckpoint')
  expect(peer.postMessage.mock.calls.map(([value]) => value.type)).not.toContain('issue')
  expect(peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'initialization-adopted', initializationOperationId: operationId, orgCommandId: 'org-command-1' }), origin)
  expect(host.textContent).toContain('請回平台管理員頁授予 FMS 系統管理員')
})
it('recovers the original activation command after an unknown result without resending', async () => {
  api.activateFmsCatalog.mockRejectedValue(new TypeError('unknown write result'))
  api.loadFmsCatalogActivationReceipt.mockResolvedValue({ receiptStatus: 'applied', requestHash: 'a'.repeat(64), previewHash: 'b'.repeat(64) })
  await prepare(); await click('採用此版本'); expect(host.textContent).toContain('採用結果尚待確認')
  await click('查詢原操作')
  expect(api.loadFmsCatalogActivationReceipt).toHaveBeenCalledWith('org-command-1')
  expect(api.activateFmsCatalog).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('請回平台管理員頁授予 FMS 系統管理員')
})
