/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import type { OrgDirectoryState } from '../types'
import { WORKSPACE_ENTITY_DRAG_MIME } from '../workspace/entityDrag'
import { ProcessPlanningWorkbench } from './ProcessPlanningWorkbench'

function planningState(): OrgDirectoryState {
  return {
    ...screenshotOrganizationState,
    duties: [{ id: 'd1', title: '確認訂單', description: null }],
    processes: [{ id: 'p1', title: '出貨流程', description: null, order: 0 }],
    processNodes: [{ id: 'n1', processId: 'p1', title: '確認訂單', parentNodeId: null, order: 0 }],
    processEdges: [],
    processNodeDutyLinks: [],
  }
}

function emptyPlanningState(): OrgDirectoryState {
  return {
    ...planningState(),
    processes: [],
    processNodes: [],
    processEdges: [],
    processNodeDutyLinks: [],
  }
}

describe('ProcessPlanningWorkbench component harness', () => {
  it('renders both planning views and the duty bridge for the shared organization workspace', async () => {
    if (!('ResizeObserver' in window)) {
      Object.defineProperty(window, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ProcessPlanningWorkbench
        state={planningState()}
        location={{ active: true, view: 'mindmap', processId: 'p1', processNodeId: 'n1', dutyId: null }}
        editingEnabled={false}
        serverReady
        recoveryOpen={false}
        mobileReadOnly
        onCommand={() => undefined}
        onNavigate={() => undefined}
      />)
      await Promise.resolve()
    })
    expect(host.querySelector('[aria-label="流程與職掌規劃工作台"]')).not.toBeNull()
    expect(host.textContent).toContain('責任心智圖')
    expect(host.textContent).toContain('流程圖')
    expect(host.textContent).toContain('確認訂單')
    expect(host.textContent).toContain('指定組織責任')
    expect(host.textContent).not.toContain('組織責任視角')
    expect(host.querySelectorAll('.process-canvas-node__relation-handle')).toHaveLength(0)
    expect(host.querySelectorAll('[data-relation-placement-target="duty"]')).toHaveLength(0)
    root.unmount()
    host.remove()
  })

  it('routes a process-node source and target through the shared relation callbacks', async () => {
    if (!('ResizeObserver' in window)) {
      Object.defineProperty(window, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onRelationBegin = vi.fn()
    const onRelationPreview = vi.fn()
    const onRelationCommit = vi.fn()
    await act(async () => {
      root.render(<ProcessPlanningWorkbench
        state={planningState()}
        location={{ active: true, view: 'mindmap', processId: 'p1', processNodeId: 'n1', dutyId: null }}
        editingEnabled
        serverReady
        recoveryOpen={false}
        mobileReadOnly={false}
        onCommand={() => undefined}
        onNavigate={() => undefined}
        onRelationBegin={onRelationBegin}
        onRelationPreview={onRelationPreview}
        onRelationCommit={onRelationCommit}
      />)
      await Promise.resolve()
    })
    const relationHandle = host.querySelector<HTMLButtonElement>('.process-canvas-node__relation-handle')
    const processNode = host.querySelector<HTMLElement>('.process-canvas-node')
    const reactFlowPane = host.querySelector<HTMLElement>('.react-flow__pane')
    expect(relationHandle).not.toBeNull()
    expect(processNode).not.toBeNull()
    const paneMouseDown = vi.fn()
    reactFlowPane?.addEventListener('mousedown', paneMouseDown)
    await act(async () => {
      relationHandle?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(paneMouseDown).not.toHaveBeenCalled()
    await act(async () => {
      relationHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(onRelationBegin).toHaveBeenCalledWith(expect.objectContaining({ kind: 'process-node', processNodeId: 'n1' }), 'keyboard', relationHandle)

    const dataTransfer = { types: [WORKSPACE_ENTITY_DRAG_MIME] }
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOver, 'dataTransfer', { value: dataTransfer })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    await act(async () => {
      processNode?.dispatchEvent(dragOver)
      processNode?.dispatchEvent(drop)
      await Promise.resolve()
    })
    expect(onRelationPreview).toHaveBeenCalledWith({ kind: 'process-node', processNodeId: 'n1' }, expect.anything())
    expect(onRelationCommit).toHaveBeenCalledWith({ kind: 'process-node', processNodeId: 'n1' }, dataTransfer)
    const dutyTarget = host.querySelector<HTMLElement>('[data-relation-placement-target="duty"]')
    expect(dutyTarget).not.toBeNull()
    const dutyDragOver = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dutyDragOver, 'dataTransfer', { value: dataTransfer })
    const dutyDrop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dutyDrop, 'dataTransfer', { value: dataTransfer })
    await act(async () => {
      dutyTarget?.dispatchEvent(dutyDragOver)
      dutyTarget?.dispatchEvent(dutyDrop)
      await Promise.resolve()
    })
    expect(onRelationPreview).toHaveBeenCalledWith(expect.objectContaining({ kind: 'duty' }), expect.anything())
    expect(onRelationCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'duty' }), dataTransfer)
    root.unmount()
    host.remove()
  })

  it('keeps the resolved process id when a node is selected from an implicit first process', async () => {
    if (!('ResizeObserver' in window)) {
      Object.defineProperty(window, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onNavigate = vi.fn()
    await act(async () => {
      root.render(<ProcessPlanningWorkbench
        state={planningState()}
        location={{ active: true, view: 'mindmap', processId: null, processNodeId: null, dutyId: null }}
        editingEnabled
        serverReady
        recoveryOpen={false}
        mobileReadOnly={false}
        onCommand={() => undefined}
        onNavigate={onNavigate}
      />)
      await Promise.resolve()
    })
    const node = host.querySelector<HTMLElement>('.process-canvas-node[role="button"]')
    expect(node).not.toBeNull()
    await act(async () => node?.click())
    expect(onNavigate).toHaveBeenLastCalledWith('/process-planning?view=mindmap&process=p1&node=n1')
    root.unmount()
    host.remove()
  })

  it('shows the create entry in an editable empty process list', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ProcessPlanningWorkbench
        state={emptyPlanningState()}
        location={{ active: true, view: 'mindmap', processId: null, processNodeId: null, dutyId: null }}
        editingEnabled
        serverReady
        recoveryOpen={false}
        mobileReadOnly={false}
        onCommand={() => undefined}
        onNavigate={() => undefined}
      />)
      await Promise.resolve()
    })
    expect(host.querySelector('.process-empty-state__add')?.textContent).toContain('新增流程')
    root.unmount()
    host.remove()
  })

  it('explains why the create entry is unavailable in a read-only empty list', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ProcessPlanningWorkbench
        state={emptyPlanningState()}
        location={{ active: true, view: 'mindmap', processId: null, processNodeId: null, dutyId: null }}
        editingEnabled={false}
        serverReady
        recoveryOpen={false}
        mobileReadOnly
        onCommand={() => undefined}
        onNavigate={() => undefined}
      />)
      await Promise.resolve()
    })
    expect(host.querySelector('.process-empty-state__add')).toBeNull()
    expect(host.textContent).toContain('目前版本為唯讀，請先切換可編輯草稿。')
    root.unmount()
    host.remove()
  })
})
