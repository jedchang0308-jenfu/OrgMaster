import { useEffect, useRef, type KeyboardEvent } from 'react'
import {
  Copy,
  Pencil,
  Plus,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'

interface PositionContextMenuProps {
  x: number
  y: number
  title: string
  onAddChild: () => void
  onAddSibling: () => void
  onDuplicate: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export function PositionContextMenu({
  x,
  y,
  title,
  onAddChild,
  onAddSibling,
  onDuplicate,
  onEdit,
  onDelete,
  onClose,
}: PositionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length
    items[nextIndex]?.focus()
  }

  return (
    <div
      className="context-menu-layer"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        ref={menuRef}
        className="position-context-menu"
        role="menu"
        aria-label={`${title}操作選單`}
        style={{ left: x, top: y }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <button type="button" role="menuitem" onClick={onAddChild}>
          <UserRoundPlus size={15} /><span>新增下屬</span><kbd>Tab</kbd>
        </button>
        <button type="button" role="menuitem" onClick={onAddSibling}>
          <Plus size={15} /><span>新增同階</span><kbd>Enter</kbd>
        </button>
        <button type="button" role="menuitem" onClick={onDuplicate}>
          <Copy size={15} /><span>職位複製</span>
        </button>
        <button type="button" role="menuitem" onClick={onEdit}>
          <Pencil size={15} /><span>編輯職位</span><kbd>F2</kbd>
        </button>
        <div className="position-context-menu__separator" role="separator" />
        <button type="button" role="menuitem" className="is-danger" onClick={onDelete}>
          <Trash2 size={15} /><span>刪除職位</span>
        </button>
      </div>
    </div>
  )
}
