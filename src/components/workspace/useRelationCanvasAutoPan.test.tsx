// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRelationCanvasAutoPan, type RelationCanvasAutoPanApi } from './useRelationCanvasAutoPan'

function Harness({ active, onReady, getViewport, setViewport }: { active: boolean; onReady: (api: RelationCanvasAutoPanApi) => void; getViewport: () => { x: number; y: number; zoom: number }; setViewport: (viewport: { x: number; y: number; zoom: number }, options?: { duration?: number }) => void }) {
  const api = useRelationCanvasAutoPan({ active, getViewport, setViewport })
  useEffect(() => onReady(api), [api, onReady])
  return null
}

describe('useRelationCanvasAutoPan', () => {
  it('coalesces edge dragovers into one viewport update per animation frame', async () => {
    let frame: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const setViewport = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let api: RelationCanvasAutoPanApi | null = null
    await act(async () => {
      root.render(<Harness active getViewport={() => ({ x: 100, y: 40, zoom: 1 })} setViewport={setViewport} onReady={(next) => { api = next }} />)
      await Promise.resolve()
    })
    const surface = document.createElement('div')
    Object.defineProperty(surface, 'isConnected', { value: true })
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 300, top: 0, bottom: 200, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) })
    const event = (clientX: number, clientY: number) => ({ currentTarget: surface, clientX, clientY }) as never
    act(() => {
      api?.onCanvasDragOver(event(4, 100))
      api?.onCanvasDragOver(event(5, 100))
    })
    expect(setViewport).not.toHaveBeenCalled()
    act(() => { frame?.(0) })
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(setViewport.mock.calls[0][0].zoom).toBe(1)
    expect(setViewport.mock.calls[0][1]).toEqual({ duration: 0 })
  })

  it('cancels a scheduled frame when placement becomes inactive', async () => {
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let api: RelationCanvasAutoPanApi | null = null
    const surface = document.createElement('div')
    Object.defineProperty(surface, 'isConnected', { value: true })
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 300, top: 0, bottom: 200, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) })
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 2)
    await act(async () => {
      root.render(<Harness active getViewport={() => ({ x: 0, y: 0, zoom: 1 })} setViewport={vi.fn()} onReady={(next) => { api = next }} />)
      await Promise.resolve()
    })
    act(() => { api?.onCanvasDragOver({ currentTarget: surface, clientX: 2, clientY: 2 } as never) })
    await act(async () => {
      root.render(<Harness active={false} getViewport={() => ({ x: 0, y: 0, zoom: 1 })} setViewport={vi.fn()} onReady={(next) => { api = next }} />)
      await Promise.resolve()
    })
    expect(raf).toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2)
  })
})
