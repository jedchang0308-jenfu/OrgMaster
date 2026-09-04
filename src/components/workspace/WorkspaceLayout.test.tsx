/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { defaultWorkspaceLayout, emptyWorkspaceLayout, insertWorkspacePanel, resizeWorkspaceSplit } from '../../workspace/layout'
import { createWorkspaceSessionState } from '../../workspace/state'
import { WorkspaceLauncher } from './WorkspaceLauncher'
import { WORKSPACE_PANEL_DRAG_MIME, WorkspaceLayout } from './WorkspaceLayout'
import { WorkspaceOverlayProvider } from './WorkspaceOverlayHosts'
import { WorkspacePanelDragProvider } from './WorkspacePanelDragContext'

function renderWorkspace(root: ReturnType<typeof createRoot>, node: ReactNode) {
  root.render(<WorkspaceOverlayProvider><WorkspacePanelDragProvider>{node}</WorkspacePanelDragProvider></WorkspaceOverlayProvider>)
}

describe('WorkspaceLayout', () => {
  it('renders a true empty state', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={emptyWorkspaceLayout()} session={createWorkspaceSessionState({ openPanels: [], focusedPanel: null, selection: null, openDetails: [], contexts: {} })} mobileSingleSurface={false} dispatch={() => undefined} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />))
    expect(host.textContent).toContain('工作台目前沒有開啟功能')
    root.unmount()
  })

  it('keeps inactive desktop panels mounted but hidden and exposes keyboard separator', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'edge', stackPath: [], edge: 'right' })
    const route = { openPanels: ['organization', 'duties'] as const, focusedPanel: 'organization' as const, selection: null, openDetails: [], contexts: {} }
    const session = createWorkspaceSessionState({ ...route, openPanels: [...route.openPanels] })
    const dispatch = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={layout} session={session} mobileSingleSurface={false} dispatch={dispatch} requestClose={async () => ({ kind: 'allow' })} renderPanel={(moduleId, visibility) => <button data-panel={moduleId}>{visibility}</button>} />))
    expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(2)
    const separator = host.querySelector('[role="separator"]') as HTMLElement
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESIZE_SPLIT', ratio: 0.6 }))
    root.unmount()
  })

  it('keeps pointer resizing after the first layout rerender', async () => {
    const initialLayout = insertWorkspacePanel(defaultWorkspaceLayout(), 'employees', { kind: 'edge', stackPath: [], edge: 'right' })
    const route = { openPanels: ['organization', 'employees'] as const, focusedPanel: 'organization' as const, selection: null, openDetails: [], contexts: {} }
    const session = createWorkspaceSessionState({ ...route, openPanels: [...route.openPanels] })
    const host = document.createElement('div')
    const root = createRoot(host)

    function Harness() {
      const [layout, setLayout] = useState(initialLayout)
      return <WorkspaceOverlayProvider><WorkspaceLayout layout={layout} session={session} mobileSingleSurface={false} dispatch={(action) => {
        if (action.type === 'RESIZE_SPLIT') setLayout((current) => resizeWorkspaceSplit(current, action.splitPath, action.ratio))
      }} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} /></WorkspaceOverlayProvider>
    }

    await act(async () => root.render(<Harness />))
    const split = host.querySelector('.workspace-split') as HTMLDivElement
    const separator = host.querySelector('[role="separator"]') as HTMLDivElement
    split.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 600, width: 1200, height: 600, toJSON: () => ({}) })
    let capturedPointer: number | null = null
    separator.setPointerCapture = (pointerId) => { capturedPointer = pointerId }
    separator.hasPointerCapture = (pointerId) => capturedPointer === pointerId
    separator.releasePointerCapture = (pointerId) => { if (capturedPointer === pointerId) capturedPointer = null }
    const pointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        pointerId: { value: 7 },
        button: { value: 0 },
        clientX: { value: clientX },
        clientY: { value: 0 },
      })
      return event
    }

    await act(async () => separator.dispatchEvent(pointer('pointerdown', 600)))
    await act(async () => separator.dispatchEvent(pointer('pointermove', 720)))
    expect(split.style.gridTemplateColumns).toBe('0.6fr auto 0.4fr')
    await act(async () => separator.dispatchEvent(pointer('pointermove', 780)))
    expect(split.style.gridTemplateColumns).toBe('0.65fr auto 0.35fr')
    await act(async () => separator.dispatchEvent(pointer('pointerup', 780)))
    expect(capturedPointer).toBeNull()
    root.unmount()
  })

  it('removes the panel arrangement control while keeping drag layout controls', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'stack', stackPath: [] })
    const session = createWorkspaceSessionState({ openPanels: ['organization', 'duties'], focusedPanel: 'duties', selection: null, openDetails: [], contexts: {} })
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={layout} session={session} mobileSingleSurface={false} dispatch={() => undefined} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />))
    expect(host.querySelector('.workspace-region__arrange')).toBeNull()
    expect(host.querySelector('.workspace-region__arrange-menu')).toBeNull()
    expect(host.querySelector('#workspace-tab-duties')?.getAttribute('draggable')).toBe('true')
    root.unmount()
  })

  it('moves a draggable desktop tab through the panel-layout MIME drop zone', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'employees', { kind: 'stack', stackPath: [] })
    const session = createWorkspaceSessionState({ openPanels: ['organization', 'employees'], focusedPanel: 'employees', selection: null, openDetails: [], contexts: {} })
    const dispatch = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    const values = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
      getData: vi.fn((type: string) => values.get(type) ?? ''),
    }
    const dragEvent = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      return event
    }

    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={layout} session={session} mobileSingleSurface={false} dispatch={dispatch} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />))
    const employeeTab = host.querySelector('#workspace-tab-employees') as HTMLButtonElement
    expect(employeeTab.draggable).toBe(true)
    await act(async () => employeeTab.dispatchEvent(dragEvent('dragstart')))
    expect(dataTransfer.setData).toHaveBeenCalledWith(WORKSPACE_PANEL_DRAG_MIME, JSON.stringify({ moduleId: 'employees' }))
    const rightDropZone = host.querySelector('.workspace-region__drop-zones .is-right') as HTMLDivElement
    expect(rightDropZone).not.toBeNull()
    await act(async () => rightDropZone.dispatchEvent(dragEvent('dragover')))
    expect(rightDropZone.className).toContain('is-preview')
    await act(async () => rightDropZone.dispatchEvent(dragEvent('drop')))
    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_PANEL', moduleId: 'employees', target: { kind: 'edge', stackPath: [], edge: 'right' } })
    root.unmount()
  })

  it('opens an unopened launcher module when dropped into a panel edge', async () => {
    const session = createWorkspaceSessionState({ openPanels: ['organization'], focusedPanel: 'organization', selection: null, openDetails: [], contexts: {} })
    const dispatch = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    const values = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
      getData: vi.fn((type: string) => values.get(type) ?? ''),
    }
    const dragEvent = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      return event
    }

    await act(async () => renderWorkspace(root, <>
      <WorkspaceLauncher openPanels={['organization']} onOpenModule={() => undefined} />
      <WorkspaceLayout layout={defaultWorkspaceLayout()} session={session} mobileSingleSurface={false} dispatch={dispatch} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />
    </>))
    const employees = [...host.querySelectorAll<HTMLButtonElement>('.workspace-launcher__item')].find((button) => button.textContent?.includes('員工'))!
    await act(async () => employees.dispatchEvent(dragEvent('dragstart')))
    expect(dataTransfer.setData).toHaveBeenCalledWith(WORKSPACE_PANEL_DRAG_MIME, JSON.stringify({ moduleId: 'employees' }))
    const rightDropZone = host.querySelector('.workspace-region__drop-zones .is-right') as HTMLDivElement
    expect(rightDropZone).not.toBeNull()
    await act(async () => rightDropZone.dispatchEvent(dragEvent('dragover')))
    expect(rightDropZone.className).toContain('is-preview')
    await act(async () => rightDropZone.dispatchEvent(dragEvent('drop')))
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_OR_FOCUS', intent: { moduleId: 'employees', source: 'launcher' }, target: { kind: 'edge', stackPath: [], edge: 'right' } })
    root.unmount()
  })

  it('keeps vertical drop targets visible but unavailable when the region is too short', async () => {
    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 1200, height: 500 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    try {
      const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'employees', { kind: 'edge', stackPath: [], edge: 'right' })
      const session = createWorkspaceSessionState({ openPanels: ['organization', 'employees'], focusedPanel: 'employees', selection: null, openDetails: [], contexts: {} })
      const host = document.createElement('div')
      const root = createRoot(host)
      const values = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: 'none',
        dropEffect: 'none',
        setData: vi.fn((type: string, value: string) => values.set(type, value)),
        getData: vi.fn((type: string) => values.get(type) ?? ''),
      }
      const dragStart = new Event('dragstart', { bubbles: true, cancelable: true })
      Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer })

      await act(async () => renderWorkspace(root, <>
        <WorkspaceLauncher openPanels={['organization', 'employees']} onOpenModule={() => undefined} />
        <WorkspaceLayout layout={layout} session={session} mobileSingleSurface={false} dispatch={() => undefined} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />
      </>))
      const processes = [...host.querySelectorAll<HTMLButtonElement>('.workspace-launcher__item')].find((button) => button.textContent?.includes('流程規劃'))!
      await act(async () => processes.dispatchEvent(dragStart))
      expect(host.querySelectorAll('.workspace-region__drop-zones')).toHaveLength(2)
      expect(host.querySelector('.workspace-region__drop-zones .is-top')?.className).toContain('is-unavailable')
      expect(host.querySelector('.workspace-region__drop-zones .is-bottom')?.className).toContain('is-unavailable')
      expect(host.querySelector('.workspace-region__drop-zones .is-left')?.className).not.toContain('is-unavailable')
      expect(host.querySelector('.workspace-region__drop-zones .is-right')?.className).not.toContain('is-unavailable')
      root.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('removes composition controls and inactive surfaces in single-surface mode', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'edge', stackPath: [], edge: 'right' })
    const session = createWorkspaceSessionState({ openPanels: ['organization', 'duties'], focusedPanel: 'duties', selection: null, openDetails: [], contexts: {} })
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={layout} session={session} mobileSingleSurface dispatch={() => undefined} requestClose={async () => ({ kind: 'allow' })} renderPanel={(moduleId) => <div data-panel={moduleId}>{moduleId}</div>} />))
    expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(1)
    expect(host.querySelector('[data-panel="duties"]')).not.toBeNull()
    expect(host.querySelector('[data-panel="organization"]')).toBeNull()
    expect(host.querySelector('[role="separator"]')).toBeNull()
    expect(host.querySelector('[draggable="true"]')).toBeNull()
    expect([...host.querySelectorAll('button')].some((button) => /固定|排列/.test(button.getAttribute('aria-label') ?? ''))).toBe(false)
    root.unmount()
  })
})
