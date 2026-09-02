import { useCallback, useEffect, useRef, type DragEventHandler } from 'react'
import type { Viewport } from '@xyflow/react'
import { getRelationPlacementAutoPanDelta } from '../../workspace/relationPlacement'

export type RelationCanvasAutoPanOptions = {
  active: boolean
  getViewport: () => Viewport
  setViewport: (viewport: Viewport, options?: { duration?: number }) => void
  threshold?: number
  maxStep?: number
}

export type RelationCanvasAutoPanApi = {
  onCanvasDragOver: DragEventHandler<HTMLElement>
  cancel: () => void
}

/**
 * One owner canvas gets one rAF loop. Target nodes only preview/commit; this
 * hook owns viewport movement and therefore cannot accidentally pan twice when
 * a dragover bubbles through nested nodes.
 */
export function useRelationCanvasAutoPan({ active, getViewport, setViewport, threshold = 48, maxStep = 14 }: RelationCanvasAutoPanOptions): RelationCanvasAutoPanApi {
  const frameRef = useRef<number | null>(null)
  const pointRef = useRef<{ x: number; y: number } | null>(null)
  const surfaceRef = useRef<HTMLElement | null>(null)
  const activeRef = useRef(active)
  const getViewportRef = useRef(getViewport)
  const setViewportRef = useRef(setViewport)
  const optionsRef = useRef({ threshold, maxStep })
  activeRef.current = active
  getViewportRef.current = getViewport
  setViewportRef.current = setViewport
  optionsRef.current = { threshold, maxStep }

  const cancel = useCallback(() => {
    if (frameRef.current !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(frameRef.current)
    }
    frameRef.current = null
    pointRef.current = null
    surfaceRef.current = null
  }, [])

  const run = useCallback(() => {
    frameRef.current = null
    const point = pointRef.current
    const surface = surfaceRef.current
    if (!activeRef.current || !point || !surface || !surface.isConnected) return
    const delta = getRelationPlacementAutoPanDelta(point, surface.getBoundingClientRect(), optionsRef.current)
    if (delta.x === 0 && delta.y === 0) return
    const viewport = getViewportRef.current()
    setViewportRef.current({ ...viewport, x: viewport.x - delta.x, y: viewport.y - delta.y }, { duration: 0 })
  }, [])

  const onCanvasDragOver = useCallback<DragEventHandler<HTMLElement>>((event) => {
    if (!activeRef.current) return
    const surface = event.currentTarget
    const rect = surface.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
    pointRef.current = { x: event.clientX, y: event.clientY }
    surfaceRef.current = surface
    if (frameRef.current === null && typeof window.requestAnimationFrame === 'function') {
      frameRef.current = window.requestAnimationFrame(run)
    } else if (frameRef.current === null) {
      run()
    }
  }, [run])

  useEffect(() => {
    if (!active) cancel()
    return cancel
  }, [active, cancel])

  return { onCanvasDragOver, cancel }
}
