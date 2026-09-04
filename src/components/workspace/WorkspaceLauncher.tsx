import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, LayoutGrid, LogOut } from 'lucide-react'
import { useAuthSession } from '../../auth/AuthGate'
import { WORKSPACE_MODULE_ORDER, getWorkspaceModule } from '../../workspace/moduleRegistry'
import type { WorkspaceModuleId } from '../../workspace/types'
import { WORKSPACE_PANEL_DRAG_MIME } from './WorkspaceLayout'
import { useWorkspacePanelDrag } from './WorkspacePanelDragContext'

interface Props {
  openPanels: readonly WorkspaceModuleId[]
  onOpenModule: (moduleId: WorkspaceModuleId) => void
  disabled?: boolean
}

export function WorkspaceLauncher({ openPanels, onOpenModule, disabled = false }: Props) {
  const [expanded, setExpanded] = useState(true)
  const panelDrag = useWorkspacePanelDrag()
  const authSession = useAuthSession()
  const developmentProfile = authSession?.session.developmentProfile
  const sessionAction = authSession?.phase === 'processing'
    ? developmentProfile ? '切換中…' : '登出處理中…'
    : authSession?.phase === 'failed'
      ? developmentProfile ? '重試切換' : '重試登出'
      : developmentProfile ? '切換角色' : '登出'

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
          return (
            <button
              key={moduleId}
              type="button"
              className={`workspace-launcher__item${opened ? ' is-opened' : ''}`}
              aria-label={`${descriptor.label}${opened ? '，已開啟' : ''}`}
              disabled={disabled}
              draggable={!disabled}
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
      {authSession && (
        <div className="workspace-launcher__session" aria-label="登入狀態">
          <span className="workspace-launcher__session-user">{developmentProfile ? developmentProfile.employeeName : `員工 ${authSession.session.user.employeeId}`}</span>
          {developmentProfile && <span className="workspace-launcher__session-role">{developmentProfile.roleName}</span>}
          {authSession.phase === 'failed' && <span className="workspace-launcher__session-alert" role="alert">{developmentProfile ? '切換失敗，工作階段仍有效。' : '登出失敗，工作階段仍有效。'}</span>}
          <button
            type="button"
            className="workspace-launcher__session-logout"
            onClick={() => { void authSession.logout() }}
            disabled={authSession.phase === 'processing'}
            aria-label={sessionAction.replace('…', '')}
          >
            <LogOut size={15} aria-hidden="true" />
            <span>{sessionAction}</span>
          </button>
        </div>
      )}
    </aside>
  )
}
