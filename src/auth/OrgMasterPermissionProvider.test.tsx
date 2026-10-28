// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORGMASTER_PERMISSIONS } from '../governance/aiPdmCatalog'
const identity = vi.hoisted(() => ({ principalId: 'principal-a', phase: 'active' }))
vi.mock('./AuthGate', () => ({ useAuthSession: () => ({ phase: identity.phase, session: { user: { principalId: identity.principalId, employeeId: 'employee-a' } } }) }))
import { OrgMasterPermissionProvider, useOrgMasterPermissions } from './OrgMasterPermissionProvider'
import { invalidateOrgMasterPermissions, orgMasterPermissionFetch } from './permissionInvalidation'
import { publishGovernancePolicy, setActiveGovernanceVersion } from '../governance/apiClient'

const projection = (principalId = identity.principalId, allow = true) => ({
  contractVersion: 'orgmaster.frontend-permission-projection.v1', applicationId: 'orgmaster',
  principalId, generatedAt: new Date().toISOString(), governanceRevision: 'revision-1',
  permissions: Object.fromEntries(ORGMASTER_PERMISSIONS.map(({ code }) => [code, allow])),
  management: { crossAppOverride: false }
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let root: Root, container: HTMLDivElement
beforeEach(() => {
  identity.principalId = 'principal-a'
  identity.phase = 'active'
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers() })
function Probe({ page }: { page: string }) {
  const { state, allows } = useOrgMasterPermissions()
  return <button data-state={state.kind} disabled={!allows('orgmaster.governance.manage')}>{page}</button>
}
async function render(page = 'governance') {
  await act(async () => root.render(<StrictMode><OrgMasterPermissionProvider><Probe page={page} /><Probe page="action" /></OrgMasterPermissionProvider></StrictMode>))
}
describe('OrgMaster app permission shell', () => {
  it('fetches once across concurrent consumers, StrictMode, and three module switches', async () => {
    const fetcher = vi.fn(async () => json(projection())); vi.stubGlobal('fetch', fetcher)
    await render(); await render('employees'); await render('management-methods')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('button:disabled')).toHaveLength(0)
  })
  it.each([401, 503])('keeps HTTP %i distinct from a normal denied projection', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, status))); await render()
    expect(container.querySelector('button')?.dataset.state).toBeUndefined()
    expect(container.textContent).toContain(status === 401 ? '登入已失效' : '無法確認操作權限')
    if (status === 401) expect(container.querySelector('button[data-state]')).toBeNull()
    else expect(container.querySelector('button[data-state]')?.getAttribute('data-state')).toBe('unavailable')
  })
  it('allows 200 false without showing a dependency failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(projection(identity.principalId, false)))); await render()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector('button')?.getAttribute('data-state')).toBe('ready')
  })
  it('clears A on principal switch and ignores A late response', async () => {
    let finish!: (response: Response) => void
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
      .mockImplementationOnce(async () => json(projection('principal-b', false)))
    vi.stubGlobal('fetch', fetcher); await render()
    identity.principalId = 'principal-b'; await render()
    await act(async () => finish(json(projection('principal-a', true))))
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector('button')?.getAttribute('data-state')).toBe('ready')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('refreshes once after a permission mutation or forbidden operation', async () => {
    const fetcher = vi.fn(async () => json(projection())); vi.stubGlobal('fetch', fetcher); await render()
    await act(async () => { invalidateOrgMasterPermissions('forbidden'); invalidateOrgMasterPermissions('forbidden') })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => invalidateOrgMasterPermissions('permissions-changed'))
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('rejects a projection from a different principal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(projection('other-principal')))); await render()
    expect(container.textContent).toContain('無法確認操作權限')
  })
  it('times out, ignores the late response, and supports explicit retry', async () => {
    vi.useFakeTimers()
    let finish!: (response: Response) => void
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
      .mockImplementationOnce(async () => json(projection()))
    vi.stubGlobal('fetch', fetcher); await render()
    expect(container.textContent).toContain('正在確認操作權限')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(container.textContent).toContain('無法確認操作權限')
    await act(async () => finish(json(projection())))
    expect(container.textContent).toContain('無法確認操作權限')
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click())
    expect(container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('ready')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('discards a ready projection as soon as logout starts and reloads if logout fails', async () => {
    const fetcher = vi.fn(async () => json(projection())); vi.stubGlobal('fetch', fetcher); await render()
    identity.phase = 'processing'; await render()
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('loading')
    identity.phase = 'active'; await render()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('aborts its request on unmount and cannot reuse a late projection in a new shell', async () => {
    let finish!: (response: Response) => void
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
      .mockImplementationOnce(async () => json(projection(identity.principalId, false)))
    vi.stubGlobal('fetch', fetcher); await render()
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal
    await act(async () => root.render(null))
    expect(signal.aborted).toBe(true)
    await render()
    await act(async () => finish(json(projection())))
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('rejects an additional capability owned by another application', async () => {
    const body = projection(); body.permissions['ai-pdm.admin'] = true
    vi.stubGlobal('fetch', vi.fn(async () => json(body))); await render()
    expect(container.textContent).toContain('無法確認操作權限')
  })
  it('invalidates once for publish/activation, fetches the new revision, and never replays a denied resource write', async () => {
    let revision = 'revision-1'
    let allowed = true
    const fetcher = vi.fn(async (url: string) => url.endsWith('/session')
      ? json({ ...projection(identity.principalId, allowed), governanceRevision: revision })
      : url.includes('/employees/') ? json({ code: 'FORBIDDEN' }, 403) : json({}))
    vi.stubGlobal('fetch', fetcher); await render()
    revision = 'revision-2'
    await act(async () => { await publishGovernancePolicy('revision-1', 'publish-1', 'fixture', 'workspace-1') })
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(2)
    await act(async () => { await setActiveGovernanceVersion('revision-2', 'activate-1', 'fixture', 'version-2') })
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(3)
    allowed = false
    await act(async () => { await orgMasterPermissionFetch('/api/orgmaster/employees/employee-a/identity', { method: 'POST', body: '{}' }) })
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/employees/'))).toHaveLength(1)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(4)
    expect(container.textContent).toContain('操作權限可能已變更')
    expect(container.querySelector<HTMLButtonElement>('button[data-state]')?.disabled).toBe(true)
  })
})
