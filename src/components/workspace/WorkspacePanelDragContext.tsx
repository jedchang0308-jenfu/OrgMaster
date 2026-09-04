import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { WorkspaceModuleId } from '../../workspace/types'

interface WorkspacePanelDragContextValue {
  draggingModuleId: WorkspaceModuleId | null
  beginDragging: (moduleId: WorkspaceModuleId) => void
  endDragging: () => void
}

const WorkspacePanelDragContext = createContext<WorkspacePanelDragContextValue | null>(null)

export function WorkspacePanelDragProvider({ children }: { children: ReactNode }) {
  const [draggingModuleId, setDraggingModuleId] = useState<WorkspaceModuleId | null>(null)
  const beginDragging = useCallback((moduleId: WorkspaceModuleId) => setDraggingModuleId(moduleId), [])
  const endDragging = useCallback(() => setDraggingModuleId(null), [])
  const value = useMemo(() => ({ draggingModuleId, beginDragging, endDragging }), [beginDragging, draggingModuleId, endDragging])

  return <WorkspacePanelDragContext.Provider value={value}>{children}</WorkspacePanelDragContext.Provider>
}

export function useWorkspacePanelDrag() {
  return useContext(WorkspacePanelDragContext)
}
