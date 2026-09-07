import { useEffect, useRef } from 'react'

interface Props {
  value: number | null
  min?: number
  max?: number
  onChange: (value: number) => void
  onCommit?: (value: number) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function WorkbenchListSeparator({ value, min = 160, max = 800, onChange, onCommit }: Props) {
  const draggingRef = useRef(false)
  const startRef = useRef({ x: 0, width: value ?? 240 })
  const lastWidthRef = useRef(value ?? 240)

  const widthAt = (clientX: number) => clamp(startRef.current.width + clientX - startRef.current.x, min, max)
  const stopDragging = (separator: HTMLDivElement, pointerId?: number) => {
    if (pointerId !== undefined && separator.hasPointerCapture(pointerId)) separator.releasePointerCapture(pointerId)
    draggingRef.current = false
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
  }

  useEffect(() => () => {
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
  }, [])

  return (
    <div
      className="workspace-list-detail-surface__separator"
      data-workbench-separator
      role="separator"
      aria-orientation="vertical"
      aria-label="調整清單寬度"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        draggingRef.current = true
        startRef.current = { x: event.clientX, width: value ?? (event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-workspace-slot="list"]')?.getBoundingClientRect().width ?? 240) }
        lastWidthRef.current = startRef.current.width
        event.currentTarget.setPointerCapture(event.pointerId)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        const next = widthAt(event.clientX)
        if (next === lastWidthRef.current) return
        lastWidthRef.current = next
        onChange(next)
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        const next = widthAt(event.clientX)
        if (next !== lastWidthRef.current) onChange(next)
        onCommit?.(next)
        stopDragging(event.currentTarget, event.pointerId)
      }}
      onPointerCancel={(event) => {
        if (!draggingRef.current) return
        stopDragging(event.currentTarget, event.pointerId)
      }}
      onKeyDown={(event) => {
        const current = value ?? 240
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          const next = clamp(current + (event.key === 'ArrowRight' ? 8 : -8), min, max)
          onChange(next)
          onCommit?.(next)
        }
      }}
    />
  )
}
