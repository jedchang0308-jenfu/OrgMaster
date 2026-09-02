/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'
import { AuthApiError } from './authApiClient'

const api = vi.hoisted(() => ({
  getCurrentSession: vi.fn(), getAuthMode: vi.fn(), exchangeFirebaseToken: vi.fn(), logoutCurrentSession: vi.fn(), installDevelopmentApiIdentityHeaders: vi.fn(),
}))
vi.mock('./authApiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./authApiClient')>()), ...api }))
vi.mock('./firebaseClient', () => ({ getFirebaseIdToken: vi.fn(), clearFirebaseClientSession: vi.fn() }))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('AuthGate', () => {
  it('does not mount protected content before session verification completes', async () => {
    api.getCurrentSession.mockReturnValue(new Promise(() => undefined))
    await act(async () => root.render(<AuthGate><div>protected organization data</div></AuthGate>))
    expect(container.textContent).toContain('正在確認登入狀態')
    expect(container.textContent).not.toContain('protected organization data')
  })

  it('mounts protected content only after a verified session', async () => {
    api.getCurrentSession.mockResolvedValue({ user: { principalId: 'p1', employeeId: 'e1' }, session: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, assuranceLevel: 'aal1', correlationId: 'correlation-1' })
    await act(async () => {
      root.render(<AuthGate><div>protected organization data</div></AuthGate>)
      await Promise.resolve()
    })
    expect(container.textContent).toContain('protected organization data')
    expect(container.textContent).toContain('員工 e1')
  })

  it('shows a fail-closed unavailable state without protected content', async () => {
    api.getCurrentSession.mockRejectedValue(new AuthApiError(503, 'auth_server_not_configured', 'correlation-2'))
    await act(async () => {
      root.render(<AuthGate><div>protected organization data</div></AuthGate>)
      await Promise.resolve()
    })
    expect(container.textContent).toContain('登入服務暫時無法使用')
    expect(container.textContent).toContain('correlation-2')
    expect(container.textContent).not.toContain('protected organization data')
  })
})
