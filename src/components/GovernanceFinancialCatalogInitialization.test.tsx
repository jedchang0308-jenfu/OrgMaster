/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GovernanceFinancialCatalogInitialization } from './GovernanceFinancialCatalogInitialization'
const api = vi.hoisted(() => ({ loadFmsCatalogActivationWorkspace: vi.fn() }))
vi.mock('../governance/fmsCatalogActivationApiClient', () => api)
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks() })
it('shows the normal root first-install next step without financial Owner controls', async () => {
  api.loadFmsCatalogActivationWorkspace.mockResolvedValue({ fmsOrigin: 'https://fms.example.test', initializationAdoption: { status: 'ready', fixedRoleId: 'role-system-admin' } })
  await act(async () => root.render(<GovernanceFinancialCatalogInitialization />))
  expect(host.querySelector('a')?.href).toBe('https://fms.example.test/administration/catalog-initialization')
  expect(host.textContent).toContain('授予 FMS 系統管理員')
  expect(host.textContent).toContain('五項目錄操作權限')
  expect(host.textContent).not.toContain('負責人')
})
it('keeps unavailable owner readback explicit and hides the completed first-install step', async () => {
  api.loadFmsCatalogActivationWorkspace.mockResolvedValue({ fmsOrigin: null, initializationAdoption: { status: 'owner_readback_unavailable', fixedRoleId: 'role-system-admin' } })
  await act(async () => root.render(<GovernanceFinancialCatalogInitialization />))
  expect(host.textContent).toContain('來源驗證連線尚未就緒')
  act(() => root.unmount()); root = createRoot(host)
  api.loadFmsCatalogActivationWorkspace.mockResolvedValue({ fmsOrigin: null, initializationAdoption: null })
  await act(async () => root.render(<GovernanceFinancialCatalogInitialization />))
  expect(host.textContent).toBe('')
})
