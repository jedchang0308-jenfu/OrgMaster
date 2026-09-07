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

  useEffect(() => {
    if (!draggingRef.current) return
    const move = (event: PointerEvent) => onChange(clamp(startRef.current.width + event.clientX - startRef.current.x, min, max))
    const cancel = () => {
      draggingRef.current = false
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
    const up = (event: PointerEvent) => {
      draggingRef.current = false
      const next = clamp(startRef.current.width + event.clientX - startRef.current.x, min, max)
      onCommit?.(next)
      cancel()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cancel()
    }
  }, [max, min, onChange, onCommit])

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
        event.preventDefault()
        draggingRef.current = true
        startRef.current = { x: event.clientX, width: value ?? (event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-workspace-slot="list"]')?.getBoundingClientRect().width ?? 240) }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
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
