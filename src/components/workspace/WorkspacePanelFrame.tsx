import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { WorkspaceModuleId, WorkspaceSurfaceVisibility } from '../../workspace/types'
import { PanelOverlayHost, WorkspacePanelOverlayScope } from './WorkspaceOverlayHosts'

interface Props {
  moduleId: WorkspaceModuleId
  visibility: WorkspaceSurfaceVisibility
  children: ReactNode
}

interface State { failed: boolean }

export class WorkspacePanelFrame extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Workspace panel ${this.props.moduleId} failed`, error, info)
  }

  componentDidUpdate(previous: Props) {
    if (previous.moduleId !== this.props.moduleId && this.state.failed) this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) {
      return <div className="workspace-panel-frame" data-module={this.props.moduleId} data-visibility={this.props.visibility}><div className="workspace-panel-error" role="alert"><strong>此功能暫時無法顯示</strong><span>其他工作台內容不受影響，請關閉後重新開啟。</span></div></div>
    }
    return (
      <div className="workspace-panel-frame" data-module={this.props.moduleId} data-visibility={this.props.visibility}>
        <WorkspacePanelOverlayScope moduleId={this.props.moduleId}>
          <div className="workspace-panel-content" data-workspace-panel-content="true">
            {this.props.children}
            <PanelOverlayHost />
          </div>
        </WorkspacePanelOverlayScope>
      </div>
    )
  }
}
