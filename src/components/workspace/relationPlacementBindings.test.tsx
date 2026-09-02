// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createRelationPlacementDropTargetProps, createRelationPlacementSourceProps } from './relationPlacementBindings'
import { WORKSPACE_ENTITY_DRAG_MIME } from '../../workspace/entityDrag'

function transfer() {
  const values = new Map<string, string>()
  return {
    types: [WORKSPACE_ENTITY_DRAG_MIME],
    effectAllowed: 'uninitialized' as DataTransfer['effectAllowed'],
    dropEffect: 'none' as DataTransfer['dropEffect'],
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
    clearData: (type?: string) => { if (type) values.delete(type); else values.clear() },
  } as unknown as DataTransfer
}

const employeePayload = { version: 1, kind: 'employee', sourceModuleId: 'employees', employeeId: 'employee-1', sourcePositionId: null } as const

describe('relation placement bindings', () => {
  it('allows the source root but rejects a nested interactive origin', () => {
    const root = document.createElement('article')
    const nested = document.createElement('button')
    root.append(nested)
    const begin = vi.fn(() => true)
    const props = createRelationPlacementSourceProps({ enabled: true, payload: employeePayload, onBegin: begin, onCancel: vi.fn() })
    const dragStart = props.onDragStart!
    const event = (target: EventTarget) => ({ currentTarget: root, target, dataTransfer: transfer(), preventDefault: vi.fn() }) as any
    props.onPointerDownCapture!({ currentTarget: root, target: nested } as never)
    const nestedEvent = event(nested)
    dragStart(nestedEvent)
    expect(begin).not.toHaveBeenCalled()
    expect(nestedEvent.dataTransfer.getData(WORKSPACE_ENTITY_DRAG_MIME)).toBe('')

    props.onPointerDownCapture!({ currentTarget: root, target: root } as never)
    const rootEvent = event(root)
    dragStart(rootEvent)
    expect(begin).toHaveBeenCalledWith(employeePayload, 'native-drag', root)
    expect(rootEvent.dataTransfer.effectAllowed).toBe('copyMove')
  })

  it('keeps the pointer origin when the source props are recreated before dragstart', () => {
    const root = document.createElement('article')
    const nested = document.createElement('span')
    root.append(nested)
    const begin = vi.fn(() => true)
    const firstProps = createRelationPlacementSourceProps({ enabled: true, payload: employeePayload, onBegin: begin, onCancel: vi.fn() })
    firstProps.onPointerDownCapture!({ currentTarget: root, target: root } as never)

    // A React render may recreate the adapter closures before native dragstart.
    const nextProps = createRelationPlacementSourceProps({ enabled: true, payload: employeePayload, onBegin: begin, onCancel: vi.fn() })
    const event = { currentTarget: root, target: nested, dataTransfer: transfer(), preventDefault: vi.fn() } as any
    nextProps.onDragStart!(event)

    expect(begin).toHaveBeenCalledWith(employeePayload, 'native-drag', root)
  })

  it('always invokes the terminal cancel callback on dragend', () => {
    const cancel = vi.fn()
    const props = createRelationPlacementSourceProps({ enabled: true, payload: employeePayload, onBegin: vi.fn(() => true), onCancel: cancel })
    props.onDragEnd!({} as never)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('can isolate a source root from an owning canvas mousedown gesture', () => {
    const root = document.createElement('div')
    const begin = vi.fn(() => true)
    const props = createRelationPlacementSourceProps({
      enabled: true,
      payload: employeePayload,
      onBegin: begin,
      onCancel: vi.fn(),
      stopMouseDownPropagation: true,
    })
    const event = { currentTarget: root, target: root, stopPropagation: vi.fn() } as any
    props.onPointerDownCapture?.(event)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    props.onMouseDownCapture?.(event)
    expect(event.stopPropagation).toHaveBeenCalledTimes(2)

    const nonIsolated = createRelationPlacementSourceProps({ enabled: true, payload: employeePayload, onBegin: begin, onCancel: vi.fn() })
    const untouched = { currentTarget: root, target: root, stopPropagation: vi.fn() } as any
    nonIsolated.onMouseDownCapture?.(untouched)
    expect(untouched.stopPropagation).not.toHaveBeenCalled()
    root.remove()
  })

  it('derives native effect admission from the payload kind', () => {
    const payloads = [
      [employeePayload, 'copyMove'],
      [{ version: 1, kind: 'duty', sourceModuleId: 'duties', dutyId: 'duty-1', lane: 'primary-execute', sourceRelationId: null } as const, 'all'],
      [{ version: 1, kind: 'process-node', sourceModuleId: 'processes', processNodeId: 'node-1' } as const, 'link'],
    ] as const

    for (const [payload, expectedEffect] of payloads) {
      const root = document.createElement('article')
      const props = createRelationPlacementSourceProps({ enabled: true, payload, onBegin: vi.fn(() => true), onCancel: vi.fn() })
      props.onPointerDownCapture!({ currentTarget: root, target: root } as never)
      const dataTransfer = transfer()
      props.onDragStart!({ currentTarget: root, target: root, dataTransfer, preventDefault: vi.fn() } as never)
      expect(dataTransfer.effectAllowed).toBe(expectedEffect)
    }
  })

  it('previews on dragover without stopping propagation and commits on drop', () => {
    const preview = vi.fn(() => ({ target: { kind: 'position', positionId: 'position-1' }, status: 'intent', effect: 'assign', code: null } as const))
    const commit = vi.fn(() => true)
    const props = createRelationPlacementDropTargetProps({
      active: true,
      available: true,
      target: { kind: 'position', positionId: 'position-1' },
      onPreview: preview,
      onCommit: commit,
    })
    const dataTransfer = transfer()
    const over = { currentTarget: document.createElement('article'), dataTransfer, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any
    props.onDragOver!(over)
    expect(preview).toHaveBeenCalledTimes(1)
    expect(over.preventDefault).toHaveBeenCalled()
    expect(over.stopPropagation).not.toHaveBeenCalled()
    expect(dataTransfer.dropEffect).toBe('copy')
    const drop = { currentTarget: over.currentTarget, dataTransfer, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any
    props.onDrop!(drop)
    expect(commit).toHaveBeenCalledWith({ kind: 'position', positionId: 'position-1' }, dataTransfer)
    expect(drop.stopPropagation).toHaveBeenCalled()
  })

  it('fails closed when an available target has no owner callbacks', () => {
    const props = createRelationPlacementDropTargetProps({
      active: true,
      available: true,
      target: { kind: 'position', positionId: 'position-1' },
    })
    const dataTransfer = transfer()
    const over = { currentTarget: document.createElement('article'), dataTransfer, preventDefault: vi.fn() } as any
    props.onDragOver!(over)
    expect(over.preventDefault).not.toHaveBeenCalled()
    expect(dataTransfer.dropEffect).toBe('none')
  })

  it('does not preview an inactive target even when its surface is writable', () => {
    const preview = vi.fn(() => ({ target: { kind: 'position', positionId: 'position-1' }, status: 'intent', effect: 'assign', code: null } as const))
    const props = createRelationPlacementDropTargetProps({
      active: false,
      available: true,
      target: { kind: 'position', positionId: 'position-1' },
      onPreview: preview,
      onCommit: vi.fn(() => true),
    })
    const dataTransfer = transfer()
    const over = { currentTarget: document.createElement('article'), dataTransfer, preventDefault: vi.fn() } as any
    props.onDragOver!(over)
    expect(preview).not.toHaveBeenCalled()
    expect(over.preventDefault).not.toHaveBeenCalled()
    expect(dataTransfer.dropEffect).toBe('none')
  })
})
