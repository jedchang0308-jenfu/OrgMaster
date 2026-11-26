/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DutyMapMethodLinkResult } from '../../dutyMap'
import { screenshotOrganizationState } from '../../screenshotData'
import { PanelOverlayHost, WorkspaceOverlayProvider, WorkspacePanelOverlayScope } from '../workspace/WorkspaceOverlayHosts'
import { ManagementMethodDutyDrawer } from './ManagementMethodDutyDrawer'

const state = { ...screenshotOrganizationState, duties: [], dutyPositionRelations: [], positions: [], assignments: [] }
const mounts: Array<{ root: Root; host: HTMLDivElement }> = []
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(() => { for (const { root, host } of mounts.splice(0)) { act(() => root.unmount()); host.remove() }; vi.unstubAllGlobals() })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
function response(versionId = 'draft-1', methodId = 'method-1'): DutyMapMethodLinkResult {
  return { versionId, methodId, revision: 'r1', links: [
    { target: { kind: 'group', id: 'group-quality' }, title: '品質策劃、檢驗與放行', departmentId: 'rd', departmentName: '研發部', groupId: 'group-quality', groupTitle: '品質策劃、檢驗與放行' },
    { target: { kind: 'duty', id: 'duty-purchase' }, title: '委外加工與外部服務交付管理', departmentId: 'production', departmentName: '生產部', groupId: 'group-purchase', groupTitle: '生產採購、委外與供應商管理' },
  ] }
}
async function mount() {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); mounts.push({ root, host })
  const close = vi.fn()
  const render = async (version = 'draft-1', method = 'method-1') => { await act(async () => root.render(<WorkspaceOverlayProvider><WorkspacePanelOverlayScope moduleId="management-methods"><PanelOverlayHost /><ManagementMethodDutyDrawer state={state} methodId={method} organizationVersionId={version} onClose={close} /></WorkspacePanelOverlayScope></WorkspaceOverlayProvider>)); await flush() }
  await render(); return { host, render, close }
}

describe('DEV071 gap: explicit method reverse lookup drawer', () => {
  it('reads the selected organization version and lists zero-position paths once at their real level', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(response())))
    vi.stubGlobal('fetch', fetcher)
    const { host } = await mount()
    expect(fetcher).toHaveBeenCalledWith('/api/orgmaster/duty-map/method-links?versionId=draft-1&methodId=method-1', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    const rows = host.querySelectorAll('.management-method-duty-drawer__rows > div')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('研發部 · 職掌大項')
    expect(rows[1].textContent).toContain('生產部 · 細部職掌')
    expect(rows[1].textContent).toContain('生產採購、委外與供應商管理')
    expect(host.textContent).not.toContain('duty-purchase')
    expect(host.textContent).not.toContain('group-quality')
  })
  it('shows the exact empty-version message when only an unauthorized or removed branch remains', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ...response(), links: [] }))))
    const { host } = await mount()
    expect(host.textContent).toContain('此版本目前沒有可顯示的對應職掌')
    expect(host.querySelectorAll('.management-method-duty-drawer__rows > div')).toHaveLength(0)
  })
  it('cancels switched-version requests and ignores a late old response', async () => {
    let finish!: (response: Response) => void
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ ...response('draft-2'), links: [] })))
    vi.stubGlobal('fetch', fetcher)
    const { host, render } = await mount()
    const oldSignal = fetcher.mock.calls[0][1].signal as AbortSignal
    await render('draft-2')
    expect(oldSignal.aborted).toBe(true)
    await act(async () => finish(new Response(JSON.stringify(response())))); await flush()
    expect(host.textContent).not.toContain('委外加工與外部服務交付管理')
    expect(host.textContent).toContain('此版本目前沒有可顯示的對應職掌')
  })
  it.each([
    ['different version', 'draft-other', 'method-1'],
    ['different method', 'draft-1', 'method-other'],
  ])('rejects a response belonging to a %s', async (_case, versionId, methodId) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(response(versionId, methodId)))))
    const { host } = await mount()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).not.toContain('委外加工與外部服務交付管理')
  })
  it('does not expose an unreadable method response and can retry the same version', async () => {
    const fetcher = vi.fn().mockImplementationOnce(async () => new Response(JSON.stringify({ secretDocumentTitle: '不應顯示的辦法' }), { status: 403 }))
      .mockImplementationOnce(async () => new Response(JSON.stringify(response())))
    vi.stubGlobal('fetch', fetcher)
    const { host } = await mount()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('無法載入本辦法的職掌對應')
    expect(host.textContent).not.toContain('不應顯示的辦法')
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '重試')!.click()); await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('委外加工與外部服務交付管理')
  })
})
