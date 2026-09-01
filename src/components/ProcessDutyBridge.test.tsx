/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import type { OrgDirectoryState } from '../types'
import { WORKSPACE_ENTITY_DRAG_MIME } from '../workspace/entityDrag'
import { ProcessDutyBridge } from './ProcessDutyBridge'

const state: OrgDirectoryState = {
  ...screenshotOrganizationState,
  duties: [
    { id: 'duty-linked', title: '確認訂單', description: null },
    { id: 'duty-open', title: '安排出貨', description: null },
  ],
  processes: [{ id: 'process-1', title: '出貨流程', description: null, order: 0 }],
  processNodes: [{ id: 'node-1', processId: 'process-1', title: '準備出貨', parentNodeId: null, order: 0 }],
  processEdges: [],
  processNodeDutyLinks: [{ id: 'link-1', processNodeId: 'node-1', dutyId: 'duty-linked', order: 0 }],
}

function renderBridge(editingEnabled = true) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const onCommand = vi.fn()
  const onSelectDuty = vi.fn()
  const onRelationBegin = vi.fn()
  const onRelationPreview = vi.fn()
  const onRelationCommit = vi.fn()
  const render = (nextState = state, selectedDutyId: string | null = 'duty-linked') => act(() => {
    root.render(<ProcessDutyBridge
      state={nextState}
      processNodeId="node-1"
      selectedDutyId={selectedDutyId}
      selectedPositionId={null}
      editingEnabled={editingEnabled}
      onSelectDuty={onSelectDuty}
      onSelectPosition={() => undefined}
      onCommand={onCommand}
      workspaceEntityDragSource={editingEnabled ? 'processes' : undefined}
      onRelationBegin={onRelationBegin}
      onRelationPreview={onRelationPreview}
      onRelationCommit={onRelationCommit}
    />)
  })
  render()
  return { host, root, onCommand, onSelectDuty, onRelationBegin, onRelationPreview, onRelationCommit, render }
}

describe('ProcessDutyBridge', () => {
  it('links an existing duty through the canonical organization command', () => {
    const view = renderBridge()
    const linkButton = Array.from(view.host.querySelectorAll('button')).find((button) => button.textContent?.includes('安排出貨'))
    linkButton?.focus()
    act(() => linkButton?.click())
    expect(view.onCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: 'LINK_PROCESS_NODE_DUTY',
      link: expect.objectContaining({ processNodeId: 'node-1', dutyId: 'duty-open', order: 1 }),
    }))
    expect(view.onSelectDuty).toHaveBeenCalledWith('duty-open')
    view.render({
      ...state,
      processNodeDutyLinks: [...state.processNodeDutyLinks, { id: 'link-2', processNodeId: 'node-1', dutyId: 'duty-open', order: 1 }],
    }, 'duty-open')
    expect(document.activeElement?.textContent).toBe('安排出貨')
    view.root.unmount()
    view.host.remove()
  })

  it('unlinks without deleting the duty and moves selection to the remaining link', () => {
    const view = renderBridge()
    const unlinkButton = view.host.querySelector<HTMLButtonElement>('[aria-label="解除 確認訂單 與目前流程節點的連結"]')
    unlinkButton?.focus()
    act(() => unlinkButton?.click())
    expect(view.onCommand).toHaveBeenCalledWith({ type: 'UNLINK_PROCESS_NODE_DUTY', linkId: 'link-1' })
    expect(view.onSelectDuty).toHaveBeenCalledWith(null)
    view.render({ ...state, processNodeDutyLinks: [] }, null)
    expect(document.activeElement?.textContent).toBe('＋ 確認訂單')
    view.root.unmount()
    view.host.remove()
  })

  it('routes a ProcessNode native payload to the registered Duty target', () => {
    const view = renderBridge()
    const target = view.host.querySelector<HTMLButtonElement>('[data-relation-placement-target="duty"][data-duty-id="duty-open"]')
    expect(target).not.toBeNull()
    expect(target?.tabIndex).toBe(0)
    const dataTransfer = { types: [WORKSPACE_ENTITY_DRAG_MIME], dropEffect: 'none' }
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOver, 'dataTransfer', { value: dataTransfer })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    act(() => {
      target?.dispatchEvent(dragOver)
      target?.dispatchEvent(drop)
    })
    expect(view.onRelationPreview).toHaveBeenCalledWith({ kind: 'duty', dutyId: 'duty-open' }, expect.anything())
    expect(view.onRelationCommit).toHaveBeenCalledWith({ kind: 'duty', dutyId: 'duty-open' }, dataTransfer)
    view.root.unmount()
    view.host.remove()
  })

  it('declares link as the native effect for Duty to ProcessNode relations', () => {
    const view = renderBridge()
    const source = view.host.querySelector<HTMLButtonElement>('[data-relation-placement-source-kind="duty"][data-duty-lane="primary-execute"]')
    expect(source).not.toBeNull()
    const dataTransfer = {
      types: [] as string[],
      effectAllowed: 'uninitialized',
      setData: vi.fn(),
    }
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer })
    act(() => source?.dispatchEvent(dragStart))
    expect(dataTransfer.effectAllowed).toBe('link')
    expect(view.onRelationBegin).toHaveBeenCalledWith(expect.objectContaining({ kind: 'duty', dutyId: 'duty-linked', lane: 'primary-execute' }), 'native-drag', source)
    view.root.unmount()
    view.host.remove()
  })

  it('[E2-INVALID] ignores a drop that does not carry the registered MIME', () => {
    const view = renderBridge()
    const target = view.host.querySelector<HTMLButtonElement>('[data-relation-placement-target="duty"][data-duty-id="duty-open"]')
    expect(target).not.toBeNull()
    const dataTransfer = { types: ['text/plain'], dropEffect: 'none' }
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOver, 'dataTransfer', { value: dataTransfer })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })

    act(() => {
      target?.dispatchEvent(dragOver)
      target?.dispatchEvent(drop)
    })

    expect(view.onRelationPreview).not.toHaveBeenCalled()
    expect(view.onRelationCommit).not.toHaveBeenCalled()
    expect(dragOver.defaultPrevented).toBe(false)
    expect(drop.defaultPrevented).toBe(false)
    view.root.unmount()
    view.host.remove()
  })

  it('keeps link mutation controls disabled in read-only mode', () => {
    const view = renderBridge(false)
    const unlinkButton = view.host.querySelector<HTMLButtonElement>('[aria-label="解除 確認訂單 與目前流程節點的連結"]')
    const linkButton = Array.from(view.host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('安排出貨'))
    expect(unlinkButton?.disabled).toBe(true)
    expect(linkButton?.disabled).toBe(true)
    expect(view.host.querySelectorAll('[data-relation-placement-target="duty"]')).toHaveLength(0)
    view.root.unmount()
    view.host.remove()
  })
})
