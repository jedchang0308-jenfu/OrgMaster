/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { defaultWorkspaceLayout, emptyWorkspaceLayout, insertWorkspacePanel, resizeWorkspaceSplit } from '../../workspace/layout'
import { createWorkspaceSessionState } from '../../workspace/state'
import { WorkspaceLayout } from './WorkspaceLayout'
import { WorkspaceOverlayProvider } from './WorkspaceOverlayHosts'

function renderWorkspace(root: ReturnType<typeof createRoot>, node: ReactNode) {
  root.render(<WorkspaceOverlayProvider>{node}</WorkspaceOverlayProvider>)
}

describe('WorkspaceLayout', () => {
  it('renders a true empty state', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={emptyWorkspaceLayout()} session={createWorkspaceSessionState({ openPanels: [], focusedPanel: null, selection: null, contexts: {} })} mobileSingleSurface={false} dispatch={() => undefined} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />))
    expect(host.textContent).toContain('工作台目前沒有開啟功能')
    root.unmount()
  })

  it('keeps inactive desktop panels mounted but hidden and exposes keyboard separator', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'edge', stackPath: [], edge: 'right' })
    const route = { openPanels: ['organization', 'duties'] as const, focusedPanel: 'organization' as const, selection: null, contexts: {} }
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
    const route = { openPanels: ['organization', 'employees'] as const, focusedPanel: 'organization' as const, selection: null, contexts: {} }
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

  it('offers a keyboard menu that can split a tab out of its current stack', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'stack', stackPath: [] })
    const session = createWorkspaceSessionState({ openPanels: ['organization', 'duties'], focusedPanel: 'duties', selection: null, contexts: {} })
    const dispatch = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => renderWorkspace(root, <WorkspaceLayout layout={layout} session={session} mobileSingleSurface={false} dispatch={dispatch} requestClose={async () => ({ kind: 'allow' })} renderPanel={() => null} />))
    const arrange = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === '排列工作職掌')!
    await act(async () => arrange.click())
    const splitRight = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent === '向右分割')!
    expect(splitRight.disabled).toBe(false)
    await act(async () => splitRight.click())
    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_PANEL', moduleId: 'duties', target: { kind: 'edge', stackPath: [], edge: 'right' } })
    root.unmount()
  })

  it('removes composition controls and inactive surfaces in single-surface mode', async () => {
    const layout = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'edge', stackPath: [], edge: 'right' })
    const session = createWorkspaceSessionState({ openPanels: ['organization', 'duties'], focusedPanel: 'duties', selection: null, contexts: {} })
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
