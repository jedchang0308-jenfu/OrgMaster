import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'

interface DutyMoveCopyPopoverProps {
  anchor: HTMLElement
  returnFocus?: HTMLElement | null
  onSelect: (decision: 'move' | 'copy') => void
  onCancel: () => void
}

function focusableElements(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
}

export function DutyMoveCopyPopover({ anchor, returnFocus = null, onSelect, onCancel }: DutyMoveCopyPopoverProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const rect = anchor.getBoundingClientRect()
  const style = useMemo(() => ({ left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 220)), top: Math.max(12, Math.min(rect.top, window.innerHeight - 180)) }), [rect.right, rect.top])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current ? focusableElements(dialogRef.current)[0] : null
      first?.focus()
    })
    const closeOutside = (event: PointerEvent) => {
      if (dialogRef.current && event.target instanceof Node && !dialogRef.current.contains(event.target)) onCancel()
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside, true)
    }
  }, [onCancel])
  useEffect(() => () => {
    const preferred = returnFocus ?? anchor
    if (preferred.isConnected) {
      preferred.focus()
      return
    }
    const fallback = document.querySelector<HTMLElement>('.duty-expanded-position-editor, .duty-anomaly-panel')
    fallback?.focus()
  }, [anchor, returnFocus])
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const items = focusableElements(dialogRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  return createPortal(<div ref={dialogRef} className="duty-move-copy-popover" role="dialog" aria-modal="false" aria-label="選擇關係移動方式" style={style} onKeyDown={handleKeyDown}>
    <strong>要如何處理這筆關係？</strong>
    <button type="button" onClick={() => onSelect('move')}>移動</button>
    <button type="button" onClick={() => onSelect('copy')}>複製</button>
    <button type="button" className="duty-move-copy-popover__cancel" onClick={onCancel}>取消</button>
  </div>, document.body)
}
