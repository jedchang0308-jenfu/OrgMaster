// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate, useAuthSession } from './AuthGate'
import { OrgMasterPermissionProvider, useOrgMasterPermissions } from './OrgMasterPermissionProvider'
import { AuthApiError } from './authApiClient'
import { ORGMASTER_PERMISSIONS } from '../governance/aiPdmCatalog'

const api = vi.hoisted(() => ({ getCurrentSession: vi.fn(), getAuthMode: vi.fn(), getDevelopmentAuthMode: vi.fn(), logoutCurrentSession: vi.fn() }))
vi.mock('./authApiClient', async original => ({ ...await original<typeof import('./authApiClient')>(), ...api }))
const session = { user: { principalId: 'principal-a', employeeId: 'employee-a' }, session: { expiresAt: '2099-01-01T00:00:00Z' }, assuranceLevel: 'aal1' as const, correlationId: 'fixture' }
let root: Root, host: HTMLDivElement, fetcher: ReturnType<typeof vi.fn>
function Probe() {
  const auth = useAuthSession()!
  const { state, allows } = useOrgMasterPermissions()
  return <><button data-phase={auth.phase} onClick={() => { void auth.logout() }}>logout</button><button data-state={state.kind} disabled={!allows('orgmaster.governance.manage')}>action</button></>
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  api.getDevelopmentAuthMode.mockRejectedValue(new AuthApiError(404, 'auth_request_invalid'))
  api.getAuthMode.mockResolvedValue({ ssoHandoffEnabled: true })
  api.logoutCurrentSession.mockRejectedValue(new AuthApiError(503, 'auth_server_not_configured'))
  fetcher = vi.fn(async () => new Response(JSON.stringify({ contractVersion: 'orgmaster.frontend-permission-projection.v1', applicationId: 'orgmaster', principalId: 'principal-a', generatedAt: new Date().toISOString(), governanceRevision: 'revision-a', management: { crossAppOverride: false }, permissions: Object.fromEntries(ORGMASTER_PERMISSIONS.map(({ code }) => [code, true])) })))
  vi.stubGlobal('fetch', fetcher)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function mount() { await act(async () => root.render(<AuthGate><OrgMasterPermissionProvider><Probe /></OrgMasterPermissionProvider></AuthGate>)) }
async function logout() { await act(async () => host.querySelector<HTMLButtonElement>('[data-phase]')!.click()) }
describe('real AuthGate logout failure permission recovery', () => {
  it('rechecks the authoritative session and permission after logout 503', async () => {
    let finish!: (value: typeof session) => void
    api.getCurrentSession.mockResolvedValueOnce(session).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await mount(); await logout()
    expect(api.getCurrentSession).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('failed')
    expect(host.querySelector('[data-state]')?.getAttribute('data-state')).toBe('unavailable')
    expect(host.querySelector<HTMLButtonElement>('[data-state]')?.disabled).toBe(true)
    await act(async () => finish(session))
    expect(host.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('active')
    expect(host.querySelector('[data-state]')?.getAttribute('data-state')).toBe('ready')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('offers session recovery retry after dependency failure without replaying logout', async () => {
    api.getCurrentSession.mockResolvedValueOnce(session).mockRejectedValueOnce(new AuthApiError(503, 'auth_server_not_configured')).mockResolvedValueOnce(session)
    await mount(); await logout()
    expect(host.querySelector('[data-state]')?.getAttribute('data-state')).toBe('unavailable')
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '重試權限')!.click())
    expect(api.getCurrentSession).toHaveBeenCalledTimes(3)
    expect(api.logoutCurrentSession).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-state]')?.getAttribute('data-state')).toBe('ready')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('fails closed when the authoritative session is 401 after a failed logout', async () => {
    api.getCurrentSession.mockResolvedValueOnce(session).mockRejectedValueOnce(new AuthApiError(401, 'auth_session_invalid'))
    await mount(); await logout()
    expect(host.querySelector('[data-state]')).toBeNull()
    expect(host.textContent).toContain('使用平台登入')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
