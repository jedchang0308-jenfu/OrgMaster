/** @vitest-environment jsdom */
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceListDetailSurface, WorkspaceListOnlySurface } from './WorkspaceSurfacePrimitives'
import { MasterDataModuleAdapter } from './adapters/MasterDataModuleAdapter'
import { DutyModuleAdapter } from './adapters/DutyModuleAdapter'
import { ProcessModuleAdapter } from './adapters/ProcessModuleAdapter'
import { ManagementMethodModuleAdapter } from './adapters/ManagementMethodModuleAdapter'
import { RoleRiskModuleAdapter } from './adapters/RoleRiskModuleAdapter'
import { WORKBENCH_WIDTH_POLICIES, workbenchDualPaneMinWidth, type WorkbenchModuleId } from '../../workspace/workbenchWidthPolicy'

describe('shared responsive workbench width behavior', () => {
  let currentWidth = 900
  let observed: Element | null = null
  let notifyResize: ResizeObserverCallback
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    currentWidth = 900
    observed = null
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { notifyResize = callback }
      observe(target: Element) { observed = target }
      disconnect() { observed = null }
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: currentWidth, height: 600, top: 0, left: 0, right: currentWidth, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function resize(width: number) {
    currentWidth = width
    await act(async () => {
      if (observed) notifyResize([{ target: observed, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
    })
  }

  function Fixture({ moduleId, transitions, visibility = 'active', commit = vi.fn() }: {
    moduleId: WorkbenchModuleId
    transitions: (visible: boolean) => boolean | Promise<boolean>
    visibility?: 'active' | 'hidden'
    commit?: (width: number) => void
  }) {
    const [detailVisible, setDetailVisible] = useState(true)
    const props = {
      visibility,
      detailVisible,
      listWidthPx: 400,
      list: <button data-workbench-row-id="selected" className="is-selected">選取列</button>,
      detail: <input aria-label="明細編輯" defaultValue="保留內容" />,
      onListWidthCommit: commit,
      onDetailWidthTransition: async (visible: boolean) => {
        const allowed = await transitions(visible)
        if (allowed) setDetailVisible(visible)
        return allowed
      },
    }
    const adapter = moduleId === 'duties' ? <DutyModuleAdapter {...props} mode="configuration" />
      : moduleId === 'processes' ? <ProcessModuleAdapter {...props} />
        : moduleId === 'management-methods' ? <ManagementMethodModuleAdapter {...props} mode="list" />
          : moduleId === 'role-risks' ? <RoleRiskModuleAdapter {...props} />
            : <MasterDataModuleAdapter {...props} moduleId={moduleId} />
    return <><button onClick={() => setDetailVisible(false)}>手動關閉</button>{adapter}</>
  }

  it.each(Object.keys(WORKBENCH_WIDTH_POLICIES) as WorkbenchModuleId[])('%s closes and restores at its own threshold without saving the clamped width', async (moduleId) => {
    const transitions = vi.fn(() => true)
    const commit = vi.fn()
    const minimum = workbenchDualPaneMinWidth(WORKBENCH_WIDTH_POLICIES[moduleId])
    await act(async () => root.render(<Fixture moduleId={moduleId} transitions={transitions} commit={commit} />))
    expect(host.querySelector('[data-width-mode="dual"]')).not.toBeNull()
    await resize(minimum - 0.5)
    expect(host.querySelector('[data-width-mode="list-only"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="明細編輯"]')).toBeNull()
    await resize(minimum)
    expect(host.querySelector('[data-width-mode="dual"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="明細編輯"]')).not.toBeNull()
    expect(transitions.mock.calls).toEqual([[false], [true]])
    expect(commit).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLElement>('[data-workspace-surface]')?.style.getPropertyValue('--workspace-list-width')).toBe('400px')
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    await resize(minimum - 1)
    await resize(900)
    expect(host.querySelector('[data-detail-state="closed"]')).not.toBeNull()
    expect(transitions).toHaveBeenCalledTimes(2)
  })

  it('preserves the editor when the existing close guard refuses a narrow transition', async () => {
    const transitions = vi.fn(() => false)
    await act(async () => root.render(<Fixture moduleId="management-methods" transitions={transitions} />))
    const editor = host.querySelector<HTMLInputElement>('[aria-label="明細編輯"]')!
    editor.value = '未儲存修改'
    await resize(260)
    expect(host.querySelector('[data-width-mode="detail-only"]')).not.toBeNull()
    expect(host.querySelector<HTMLInputElement>('[aria-label="明細編輯"]')?.value).toBe('未儲存修改')
    await resize(270)
    expect(transitions).toHaveBeenCalledTimes(1)
    await resize(900)
    expect(host.querySelector('[data-width-mode="dual"]')).not.toBeNull()
    expect(host.querySelector<HTMLInputElement>('[aria-label="明細編輯"]')?.value).toBe('未儲存修改')
  })

  it('restores after a pending close completes even if the width has already grown', async () => {
    let finishClose!: (allowed: boolean) => void
    const transitions = vi.fn((visible: boolean) => visible ? true : new Promise<boolean>((resolve) => { finishClose = resolve }))
    await act(async () => root.render(<Fixture moduleId="positions" transitions={transitions} />))
    await resize(260)
    await resize(900)
    await act(async () => finishClose(true))
    expect(transitions.mock.calls).toEqual([[false], [true]])
    expect(host.querySelector('[data-detail-state="open"]')).not.toBeNull()
  })

  it('waits for a hidden panel to become active before applying its width policy', async () => {
    currentWidth = 240
    const transitions = vi.fn(() => true)
    await act(async () => root.render(<Fixture moduleId="employees" transitions={transitions} visibility="hidden" />))
    expect(transitions).not.toHaveBeenCalled()
    await act(async () => root.render(<Fixture moduleId="employees" transitions={transitions} />))
    expect(transitions.mock.calls).toEqual([[false]])
    await resize(400)
    expect(transitions.mock.calls).toEqual([[false], [true]])
  })
})

describe('WorkspaceSurfacePrimitives', () => {
  it('renders one adjacent list/detail surface with an empty detail slot', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceListDetailSurface listLabel="清單" detailLabel="明細" list={<span>list</span>} detail={null} emptyDetail={<span data-workspace-focus-fallback tabIndex={-1}>empty</span>} />))
    expect(host.querySelector('[data-workspace-surface="list-detail"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-workspace-slot="list"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-workspace-slot="detail"]')).toHaveLength(1)
    expect(host.textContent).toContain('empty')
    root.unmount()
  })

  it('does not manufacture a detail slot for list-only modules', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceListOnlySurface label="層級" dataVisibility="hidden"><span>levels</span></WorkspaceListOnlySurface>))
    expect(host.querySelector('[data-workspace-surface="list-only"]')).not.toBeNull()
    expect(host.querySelector('[data-workspace-slot="detail"]')).toBeNull()
    expect(host.querySelector('[data-visibility="hidden"]')).not.toBeNull()
    root.unmount()
  })

  it('routes arrow navigation through the shared list-detail surface', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onListRowNavigate = vi.fn(() => ({ kind: 'allow' as const }))
    await act(async () => root.render(<WorkspaceListDetailSurface onListRowNavigate={onListRowNavigate} detailVisible={false} listLabel="清單" detailLabel="明細" list={<div><button type="button" data-workbench-row-id="one">一</button><button type="button" data-workbench-row-id="two">二</button></div>} detail={null} />))
    const rows = host.querySelectorAll<HTMLButtonElement>('[data-workbench-row-id]')
    rows[0].focus()
    await act(async () => rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(onListRowNavigate).toHaveBeenCalledWith('two', 'down')
    expect(document.activeElement).toBe(rows[1])
    root.unmount()
  })
})
