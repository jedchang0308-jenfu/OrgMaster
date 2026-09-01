import type { PromotionIntent, WorkspaceHydrationState, WorkspaceModuleId, WorkspaceSurfaceVisibility } from '../../workspace/types'
import type { WorkspaceController } from '../../workspace/useWorkspaceController'
import { getWorkspaceDefaultContext } from '../../workspace/moduleRegistry'
import { WorkspaceLayout } from './WorkspaceLayout'
import { GlobalOverlayHost } from './WorkspaceOverlayHosts'
import { WorkspaceQuickDrawer } from './WorkspaceQuickDrawer'
import { WorkspaceRecoveryGate } from './WorkspaceRecoveryGate'
import './workspace.css'

interface Props {
  controller: WorkspaceController
  hydration: WorkspaceHydrationState
  mobileSingleSurface: boolean
  header: React.ReactNode
  renderPanel: (moduleId: WorkspaceModuleId, visibility: WorkspaceSurfaceVisibility) => React.ReactNode
  renderDrawer: (moduleId: Exclude<WorkspaceModuleId, 'organization' | 'role-risks' | 'governance'>) => React.ReactNode
  drawerPromotionIntent?: PromotionIntent
  onRetry: () => void
  onDownloadRecoveryCopy?: () => void
  onSwitchToCurrent?: () => void
}

export function WorkspaceShell({ controller, hydration, mobileSingleSurface, header, renderPanel, renderDrawer, drawerPromotionIntent, onRetry, onDownloadRecoveryCopy, onSwitchToCurrent }: Props) {
  const drawer = controller.state.session.drawer
  const promotionIntent = drawerPromotionIntent ?? (drawer ? { moduleId: drawer, context: controller.state.session.panels[drawer]?.context ?? getWorkspaceDefaultContext(drawer), source: 'drawer' as const } as PromotionIntent : null)
  return (
    <div className={`composable-workspace${drawer ? ' has-quick-drawer' : ''}${mobileSingleSurface ? ' is-single-surface' : ''}`}>
      <header className="composable-workspace__chrome">{header}</header>
      <WorkspaceRecoveryGate state={hydration} onRetry={onRetry} onDownloadCopy={onDownloadRecoveryCopy} onSwitchToCurrent={onSwitchToCurrent}>
        <div className="composable-workspace__body">
          {drawer && promotionIntent && <WorkspaceQuickDrawer moduleId={drawer} renderDrawer={renderDrawer} promotionIntent={promotionIntent} onPromote={controller.promote} onClose={controller.closeDrawer} />}
          <WorkspaceLayout layout={controller.state.layout} session={controller.state.session} mobileSingleSurface={mobileSingleSurface} dispatch={controller.dispatch} requestClose={controller.requestWorkspacePanelClose} renderPanel={renderPanel} />
        </div>
      </WorkspaceRecoveryGate>
      <GlobalOverlayHost />
      <div className="workspace-live-region" aria-live="polite" aria-atomic="true">{controller.announcement}</div>
    </div>
  )
}
