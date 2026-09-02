import { getWorkspaceModule, WORKSPACE_MODULE_ORDER } from '../../workspace/moduleRegistry'
import type { WorkspaceModuleId, WorkspaceSurfaceVisibility } from '../../workspace/types'

export interface WorkspaceModuleAdapter {
  moduleId: WorkspaceModuleId
}

export const WORKSPACE_MODULE_ADAPTERS = Object.fromEntries(
  WORKSPACE_MODULE_ORDER.map((moduleId) => [moduleId, { moduleId }]),
) as Record<WorkspaceModuleId, WorkspaceModuleAdapter>

export type WorkspacePanelRenderer = (visibility: WorkspaceSurfaceVisibility) => React.ReactNode

export function renderWorkspacePanel(
  moduleId: WorkspaceModuleId,
  visibility: WorkspaceSurfaceVisibility,
  renderers: Partial<Record<WorkspaceModuleId, WorkspacePanelRenderer>>,
) {
  const renderer = renderers[moduleId]
  if (renderer) return renderer(visibility)
  return <div className="workspace-module-placeholder"><strong>{getWorkspaceModule(moduleId).label}</strong><span>此功能正在接入共用工作台。</span></div>
}
