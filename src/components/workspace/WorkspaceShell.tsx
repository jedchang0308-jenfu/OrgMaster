import type { WorkspaceHydrationState, WorkspaceModuleId, WorkspaceSurfaceVisibility } from '../../workspace/types'
import type { WorkspaceController } from '../../workspace/useWorkspaceController'
import { WorkspaceLayout } from './WorkspaceLayout'
import { GlobalOverlayHost } from './WorkspaceOverlayHosts'
import { WorkspaceRecoveryGate } from './WorkspaceRecoveryGate'
import './workspace.css'

interface Props {
  controller: WorkspaceController
  hydration: WorkspaceHydrationState
  mobileSingleSurface: boolean
  header: React.ReactNode
  renderPanel: (moduleId: WorkspaceModuleId, visibility: WorkspaceSurfaceVisibility) => React.ReactNode
  onRetry: () => void
  onDownloadRecoveryCopy?: () => void
  onSwitchToCurrent?: () => void
}

export function WorkspaceShell({ controller, hydration, mobileSingleSurface, header, renderPanel, onRetry, onDownloadRecoveryCopy, onSwitchToCurrent }: Props) {
  return (
    <div className={`composable-workspace${mobileSingleSurface ? ' is-single-surface' : ''}`}>
      <header className="composable-workspace__chrome">{header}</header>
      <WorkspaceRecoveryGate state={hydration} onRetry={onRetry} onDownloadCopy={onDownloadRecoveryCopy} onSwitchToCurrent={onSwitchToCurrent}>
        <div className="composable-workspace__body">
          <WorkspaceLayout layout={controller.state.layout} session={controller.state.session} mobileSingleSurface={mobileSingleSurface} dispatch={controller.dispatch} requestClose={controller.requestWorkspacePanelClose} renderPanel={renderPanel} />
        </div>
      </WorkspaceRecoveryGate>
      <GlobalOverlayHost />
      <div className="workspace-live-region" aria-live="polite" aria-atomic="true">{controller.announcement}</div>
    </div>
  )
}
