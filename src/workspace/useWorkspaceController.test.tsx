/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import { useWorkspaceController, type WorkspaceBrowserAdapter, type WorkspaceController } from './useWorkspaceController'

function createBrowser(initial = '/'): WorkspaceBrowserAdapter & { navigate(url: string): void; pop(): void; pushes: string[]; replaces: string[] } {
  let location = new URL(initial, 'http://localhost')
  const listeners = new Set<() => void>()
  const pushes: string[] = []
  const replaces: string[] = []
  return {
    location: () => ({ pathname: location.pathname, search: location.search, hash: location.hash }),
    push: (url) => { pushes.push(url); location = new URL(url, location) },
    replace: (url) => { replaces.push(url); location = new URL(url, location) },
    subscribePopState: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    focus: () => undefined,
    viewportWidth: () => 1440,
    navigate: (url) => { location = new URL(url, location) },
    pop: () => listeners.forEach((listener) => listener()),
    pushes,
    replaces,
  }
}

function Harness({ browser, capture }: { browser: WorkspaceBrowserAdapter; capture: (controller: WorkspaceController) => void }) {
  const controller = useWorkspaceController({ organizationState: screenshotOrganizationState, browser, initialLayout: null })
  capture(controller)
  return <div>{controller.state.route.openPanels.join(',')}</div>
}

function DeferredHarness({ browser, capture, enabled }: { browser: WorkspaceBrowserAdapter; capture: (controller: WorkspaceController) => void; enabled: boolean }) {
  const controller = useWorkspaceController({ organizationState: screenshotOrganizationState, browser, initialLayout: null, enabled })
  capture(controller)
  return <div>{controller.state.route.openPanels.join(',')}</div>
}

function InlineFailureHarness({ browser, capture, tick }: { browser: WorkspaceBrowserAdapter; capture: (controller: WorkspaceController) => void; tick: number }) {
  const controller = useWorkspaceController({
    organizationState: screenshotOrganizationState,
    browser,
    initialLayout: null,
    onLayoutPersistenceFailure: () => undefined,
  })
  capture(controller)
  return <div data-tick={tick}>{controller.state.route.openPanels.join(',')}</div>
}

describe('useWorkspaceController', () => {
  it('bootstraps organization only and opens a fitting second region once', async () => {
    const browser = createBrowser()
    let controller!: WorkspaceController
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<Harness browser={browser} capture={(value) => { controller = value }} />) })
    expect(controller.state.route.openPanels).toEqual(['organization'])
    expect(browser.replaces.at(-1)).toContain('panels=organization')
    await act(async () => controller.openOrFocus('role-risks'))
    expect(controller.state.route.openPanels).toEqual(['organization', 'role-risks'])
    expect(controller.state.layout.root?.kind).toBe('split')
    await act(async () => controller.openOrFocus('role-risks'))
    expect(controller.state.route.openPanels).toEqual(['organization', 'role-risks'])
    root.unmount()
  })

  it('runs close guard before commit and preserves state when rejected', async () => {
    const browser = createBrowser('/?panels=organization,management-methods&focus=management-methods')
    let controller!: WorkspaceController
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<Harness browser={browser} capture={(value) => { controller = value }} />) })
    const guard = vi.fn(async () => ({ kind: 'keep-open' as const, focusTarget: 'editor' }))
    controller.registerWorkspacePanelCloseGuard('management-methods', guard)
    await act(async () => { await controller.requestWorkspacePanelClose('management-methods') })
    expect(guard).toHaveBeenCalledTimes(1)
    expect(controller.state.route.openPanels).toContain('management-methods')
    controller.registerWorkspacePanelCloseGuard('management-methods', async () => ({ kind: 'allow' }))
    await act(async () => { await controller.requestWorkspacePanelClose('management-methods') })
    expect(controller.state.route.openPanels).not.toContain('management-methods')
    root.unmount()
  })

  it('preflights browser Back and restores the current URL when a guard rejects', async () => {
    const browser = createBrowser('/?panels=organization,management-methods&focus=management-methods')
    let controller!: WorkspaceController
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<Harness browser={browser} capture={(value) => { controller = value }} />) })
    controller.registerWorkspacePanelCloseGuard('management-methods', async () => ({ kind: 'keep-open' }))
    browser.navigate('/?panels=organization&focus=organization')
    await act(async () => { browser.pop(); await Promise.resolve(); await Promise.resolve() })
    expect(controller.state.route.openPanels).toContain('management-methods')
    expect(browser.replaces.at(-1)).toContain('management-methods')
    expect(controller.announcement).toBe('尚有未完成編輯')
    root.unmount()
  })

  it('does not canonicalize a legacy route until hydration enables the controller', async () => {
    const browser = createBrowser('/process-planning?process=missing')
    let controller!: WorkspaceController
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<DeferredHarness browser={browser} enabled={false} capture={(value) => { controller = value }} />) })
    expect(browser.replaces).toEqual([])
    await act(async () => { root.render(<DeferredHarness browser={browser} enabled capture={(value) => { controller = value }} />) })
    expect(browser.replaces.length).toBeGreaterThan(0)
    expect(controller.state.route.openPanels).toContain('processes')
    root.unmount()
  })

  it('does not restart workspace bootstrap when a callback prop changes identity', async () => {
    const browser = createBrowser()
    let controller!: WorkspaceController
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<InlineFailureHarness browser={browser} tick={0} capture={(value) => { controller = value }} />) })
    const bootstrapReplaceCount = browser.replaces.length
    await act(async () => { root.render(<InlineFailureHarness browser={browser} tick={1} capture={(value) => { controller = value }} />) })
    expect(controller.state.route.openPanels).toEqual(['organization'])
    expect(browser.replaces).toHaveLength(bootstrapReplaceCount)
    root.unmount()
  })
})
