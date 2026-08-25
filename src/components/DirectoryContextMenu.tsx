import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface DirectoryContextMenuItem {
  id: string
  label: string
  icon: ReactNode
  onSelect: () => void
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
}

interface DirectoryContextMenuProps {
  x: number
  y: number
  label: string
  items: DirectoryContextMenuItem[]
  onClose: () => void
}

export function DirectoryContextMenu({ x, y, label, items, onClose }: DirectoryContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
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
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (buttons.length === 0) return
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + buttons.length) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length
    buttons[nextIndex]?.focus()
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
        className="position-context-menu directory-context-menu"
        role="menu"
        aria-label={label}
        style={{ left: x, top: y }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore && <div className="position-context-menu__separator" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={item.danger ? 'is-danger' : ''}
              disabled={item.disabled}
              onClick={item.onSelect}
              aria-label={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
