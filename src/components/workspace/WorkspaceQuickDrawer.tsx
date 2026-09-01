import { useEffect, useRef } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { getWorkspaceModule } from '../../workspace/moduleRegistry'
import type { DrawerWorkspaceModuleId, PromotionIntent } from '../../workspace/types'

interface Props {
  moduleId: DrawerWorkspaceModuleId
  renderDrawer: (moduleId: DrawerWorkspaceModuleId) => React.ReactNode
  promotionIntent: PromotionIntent
  onPromote: (intent: PromotionIntent) => void
  onClose: () => void
}

export function WorkspaceQuickDrawer({ moduleId, renderDrawer, promotionIntent, onPromote, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [moduleId, onClose])
  const descriptor = getWorkspaceModule(moduleId)
  return (
    <aside id={`workspace-drawer-${moduleId}`} className="workspace-quick-drawer" aria-label={`${descriptor.label}快速清單`} tabIndex={-1}>
      <header>
        <strong>{descriptor.label}</strong>
        <button ref={closeRef} type="button" aria-label={`關閉${descriptor.label}清單`} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="workspace-quick-drawer__content">{renderDrawer(moduleId)}</div>
      <footer>
        <button type="button" className="workspace-quick-drawer__promote" onClick={() => onPromote(promotionIntent)}>
          <span>在工作台開啟</span><ArrowRight size={16} />
        </button>
      </footer>
    </aside>
  )
}
