/** @vitest-environment jsdom */
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessEdge, ProcessNode } from '../types'
import { ProcessPlanningCanvas } from './ProcessPlanningCanvas'

const fitView = vi.fn()
const observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []
const frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 1

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  ReactFlow: ({ children }: { children?: ReactNode }) => <div className="react-flow">{children}</div>,
  useNodesInitialized: () => true,
  useReactFlow: () => ({ fitView }),
}))

function renderCanvas(hidden = false) {
  const wrapper = document.createElement('div')
  wrapper.hidden = hidden
  const host = document.createElement('div')
  wrapper.appendChild(host)
  document.body.appendChild(wrapper)
  const root = createRoot(host)
  return { host, root, wrapper }
}

const nodes: ProcessNode[] = [{ id: 'n1', processId: 'p1', title: '節點一', parentNodeId: null, order: 0 }]
const edges: ProcessEdge[] = []

beforeEach(() => {
  fitView.mockReset()
  observers.length = 0
  frames.clear()
  nextFrameId = 1
  class TestResizeObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor() {
      observers.push(this)
    }
  }
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: TestResizeObserver })
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++
      frames.set(id, callback)
      return id
    }),
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn((id: number) => frames.delete(id)),
  })
})

function flushFrame(id: number) {
  const callback = frames.get(id)
  if (!callback) return
  frames.delete(id)
  callback(0)
}

describe('ProcessPlanningCanvas lifecycle ownership', () => {
  it('fits once after the two-frame measurement settle and disconnects on unmount', async () => {
    const { host, root, wrapper } = renderCanvas()
    await act(async () => {
      root.render(<ProcessPlanningCanvas nodes={nodes} edges={edges} mode="flow" selectedNodeId="n1" onSelectNode={() => undefined} />)
      await Promise.resolve()
    })
    const canvas = host.querySelector<HTMLElement>('.process-planning-canvas')
    expect(canvas).not.toBeNull()
    Object.defineProperty(canvas, 'getBoundingClientRect', { configurable: true, value: () => ({ width: 320, height: 200, top: 0, left: 0, right: 320, bottom: 200 }) })
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(canvas)
    expect(frames.size).toBe(1)

    const firstFrame = [...frames.keys()][0]
    await act(async () => flushFrame(firstFrame))
    expect(frames.size).toBe(1)
    const secondFrame = [...frames.keys()][0]
    await act(async () => flushFrame(secondFrame))
    expect(fitView).toHaveBeenCalledTimes(1)
    expect(fitView).toHaveBeenCalledWith({ duration: 0, padding: 0.18, maxZoom: 1.1 })

    await act(async () => root.unmount())
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    wrapper.remove()
  })

  it('does not fit a hidden surface and cancels its pending frame on unmount', async () => {
    const { host, root, wrapper } = renderCanvas(true)
    await act(async () => {
      root.render(<ProcessPlanningCanvas nodes={nodes} edges={edges} mode="mindmap" selectedNodeId={null} onSelectNode={() => undefined} />)
      await Promise.resolve()
    })
    expect(frames.size).toBe(1)
    const pendingFrame = [...frames.keys()][0]
    await act(async () => root.unmount())
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(pendingFrame)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    await act(async () => flushFrame(pendingFrame))
    expect(fitView).not.toHaveBeenCalled()
    expect(host.querySelector('.process-planning-canvas')).toBeNull()
    wrapper.remove()
  })
})
