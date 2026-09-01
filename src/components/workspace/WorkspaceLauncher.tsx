import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LayoutGrid } from 'lucide-react'
import { isDrawerWorkspaceModuleId, WORKSPACE_MODULE_ORDER, getWorkspaceModule } from '../../workspace/moduleRegistry'
import type { DrawerWorkspaceModuleId, WorkspaceModuleId } from '../../workspace/types'

interface Props {
  openPanels: readonly WorkspaceModuleId[]
  onOpenDrawer: (moduleId: DrawerWorkspaceModuleId) => void
  onOpenPanel: (moduleId: WorkspaceModuleId) => void
  disabled?: boolean
}

export function WorkspaceLauncher({ openPanels, onOpenDrawer, onOpenPanel, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  return (
    <div className="workspace-launcher">
      <button
        id="workspace-launcher"
        ref={buttonRef}
        type="button"
        className="workspace-launcher__button"
        aria-label="功能"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? '版本工作區完成載入後才可開啟功能' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <LayoutGrid size={17} aria-hidden="true" />
        <span>功能</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div ref={popoverRef} className="workspace-launcher__menu" role="menu" aria-label="功能">
          {WORKSPACE_MODULE_ORDER.map((moduleId) => {
            const descriptor = getWorkspaceModule(moduleId)
            const opened = openPanels.includes(moduleId)
            return (
              <button
                key={moduleId}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  if (isDrawerWorkspaceModuleId(moduleId)) onOpenDrawer(moduleId)
                  else onOpenPanel(moduleId)
                }}
              >
                <span>{descriptor.label}</span>
                {opened && <small>已開啟</small>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
