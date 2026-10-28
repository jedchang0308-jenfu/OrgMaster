import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { WORKSPACE_MODULE_ORDER, getWorkspaceModule } from '../../workspace/moduleRegistry'
import type { WorkspaceModuleId } from '../../workspace/types'
import { WORKSPACE_PANEL_DRAG_MIME } from './WorkspaceLayout'
import { useWorkspacePanelDrag } from './WorkspacePanelDragContext'

interface Props {
  openPanels: readonly WorkspaceModuleId[]
  onOpenModule: (moduleId: WorkspaceModuleId) => void
  closePendingModuleId?: WorkspaceModuleId | null
  disabled?: boolean
  moduleAllowed?: (moduleId: WorkspaceModuleId) => boolean
}

export function WorkspaceLauncher({ openPanels, onOpenModule, closePendingModuleId = null, disabled = false, moduleAllowed }: Props) {
  const [expanded, setExpanded] = useState(true)
  const panelDrag = useWorkspacePanelDrag()

  return (
    <aside id="workspace-launcher" className={`workspace-launcher${expanded ? ' is-expanded' : ' is-collapsed'}`} aria-label="功能導覽">
      <div className="workspace-launcher__header">
        <div className="workspace-launcher__heading">
          <LayoutGrid size={17} aria-hidden="true" />
          <span>功能</span>
        </div>
        <button
          id="workspace-launcher-toggle"
          type="button"
          className="workspace-launcher__toggle"
          aria-label={expanded ? '收闔功能導覽' : '展開功能導覽'}
          aria-controls="workspace-launcher-menu"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        </button>
      </div>
      <nav id="workspace-launcher-menu" className="workspace-launcher__menu" aria-label="功能清單" hidden={!expanded}>
        {WORKSPACE_MODULE_ORDER.map((moduleId) => {
          const descriptor = getWorkspaceModule(moduleId)
          const opened = openPanels.includes(moduleId)
          const itemDisabled = disabled || moduleAllowed?.(moduleId) === false || (opened && closePendingModuleId === moduleId)
          return (
            <button
              key={moduleId}
              type="button"
              className={`workspace-launcher__item${opened ? ' is-opened' : ''}`}
              aria-label={`${descriptor.label}${opened ? '，已開啟' : ''}`}
              aria-pressed={opened}
              disabled={itemDisabled}
              draggable={!itemDisabled}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData(WORKSPACE_PANEL_DRAG_MIME, JSON.stringify({ moduleId }))
                panelDrag?.beginDragging(moduleId)
              }}
              onDragEnd={() => panelDrag?.endDragging()}
              onClick={() => onOpenModule(moduleId)}
            >
              <span>{descriptor.label}</span>
              <span className="workspace-launcher__check" aria-hidden="true">{opened && <Check size={15} strokeWidth={2} />}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
