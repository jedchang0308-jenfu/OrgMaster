/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate, useAuthSession } from './AuthGate'
import { AuthApiError } from './authApiClient'

const api = vi.hoisted(() => ({
  getCurrentSession: vi.fn(), getAuthMode: vi.fn(), getDevelopmentAuthMode: vi.fn(), loginDevelopmentProfile: vi.fn(), exchangeFirebaseToken: vi.fn(), logoutCurrentSession: vi.fn(),
}))
vi.mock('./authApiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./authApiClient')>()), ...api }))
vi.mock('./firebaseClient', () => ({ getFirebaseIdToken: vi.fn(), clearFirebaseClientSession: vi.fn() }))

function SessionProbe() {
  const authSession = useAuthSession()
  return <>{authSession ? <><span>{`員工 ${authSession.session.user.employeeId}`}</span><button type="button" onClick={() => { void authSession.logout() }}>session logout</button></> : <span>尚未登入</span>}</>
}

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  api.getDevelopmentAuthMode.mockRejectedValue(new AuthApiError(404, 'auth_request_invalid'))
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
      root.render(<AuthGate><><div>protected organization data</div><SessionProbe /></></AuthGate>)
      await Promise.resolve()
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
      await Promise.resolve()
    })
    expect(container.textContent).toContain('登入服務暫時無法使用')
    expect(container.textContent).toContain('correlation-2')
    expect(container.textContent).not.toContain('protected organization data')
  })

  it('offers server-defined development profiles and enters with one click', async () => {
    const profile = { id: 'governance-manager', roleCode: 'orgmaster_governance_manager', roleName: '人員治理者', employeeId: 'employee-youhao', employeeName: '張祐豪', description: '管理身分與角色；不可發布治理政策' }
    api.getDevelopmentAuthMode.mockResolvedValue({ authMode: 'local_development', profiles: [profile], session: null, correlationId: 'correlation-dev-mode' })
    api.loginDevelopmentProfile.mockResolvedValue({ user: { principalId: 'dev-principal-governance-manager', employeeId: profile.employeeId }, session: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, assuranceLevel: 'aal1', developmentProfile: profile, correlationId: 'correlation-dev-session' })
    await act(async () => {
      root.render(<AuthGate><><div>protected organization data</div><SessionProbe /></></AuthGate>)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('選擇測試角色')
    expect(container.textContent).toContain('人員治理者')
    expect(container.textContent).toContain('張祐豪')
    expect(container.textContent).not.toContain('protected organization data')
    const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('人員治理者')) as HTMLButtonElement
    await act(async () => {
      button.click()
      await Promise.resolve()
    })
    expect(api.loginDevelopmentProfile).toHaveBeenCalledWith('governance-manager')
    expect(container.textContent).toContain('protected organization data')
    expect(container.textContent).toContain('員工 employee-youhao')
  })

  it('returns a development session directly to the role chooser after logout', async () => {
    const profile = { id: 'employee', roleCode: 'orgmaster_employee', roleName: '一般員工', employeeId: 'employee-1', employeeName: '一般員工', description: '僅閱讀' }
    api.getCurrentSession.mockResolvedValue({ user: { principalId: 'dev-principal-employee', employeeId: profile.employeeId }, session: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, assuranceLevel: 'aal1', developmentProfile: profile, correlationId: 'correlation-dev-session' })
    api.logoutCurrentSession.mockResolvedValue({ status: 'completed', correlationId: 'correlation-logout' })
    api.getDevelopmentAuthMode.mockResolvedValueOnce({ authMode: 'local_development', profiles: [profile], session: { user: { principalId: 'dev-principal-employee', employeeId: profile.employeeId }, session: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, assuranceLevel: 'aal1', developmentProfile: profile, correlationId: 'correlation-dev-session' }, correlationId: 'correlation-dev-mode' })
      .mockResolvedValueOnce({ authMode: 'local_development', profiles: [profile], session: null, correlationId: 'correlation-dev-mode' })
    await act(async () => {
      root.render(<AuthGate><SessionProbe /></AuthGate>)
      await Promise.resolve()
    })
    const logout = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === 'session logout') as HTMLButtonElement
    await act(async () => {
      logout.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.logoutCurrentSession).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('選擇測試角色')
    expect(container.textContent).not.toContain('已安全登出')
  })
})
