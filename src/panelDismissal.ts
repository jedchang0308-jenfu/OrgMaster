export type WorkspacePanelId = 'directory' | 'inspector' | 'role-risk'

export type EscapeDismissAction =
  | 'none'
  | 'close-delete-dialog'
  | 'close-directory-dialog'
  | 'dismiss-role-risk'
  | 'close-inspector'
  | 'close-directory'

export interface EscapeDismissContext {
  recoveryOpen: boolean
  deleteOpen: boolean
  directoryDialogOpen: boolean
  roleRiskOpen: boolean
  editorBoundaryActive: boolean
  focusedPanel: WorkspacePanelId | null
  lastInteractedPanel: WorkspacePanelId | null
  inspectorOpen: boolean
  directoryOpen: boolean
}

/**
 * Resolve exactly one Escape action. The resolver is deliberately pure so the
 * global handler cannot accidentally clear several independent UI surfaces.
 */
export function resolveEscapeDismissAction(context: EscapeDismissContext): EscapeDismissAction {
  if (context.recoveryOpen || context.editorBoundaryActive) return 'none'
  if (context.deleteOpen) return 'close-delete-dialog'
  if (context.directoryDialogOpen) return 'close-directory-dialog'
  if (context.roleRiskOpen) return 'dismiss-role-risk'
  if (context.focusedPanel === 'directory' && context.directoryOpen) return 'close-directory'
  if (context.focusedPanel === 'inspector' && context.inspectorOpen) return 'close-inspector'

  if (context.inspectorOpen && context.directoryOpen) {
    if (context.lastInteractedPanel === 'inspector') return 'close-inspector'
    return 'close-directory'
  }
  if (context.inspectorOpen) return 'close-inspector'
  if (context.directoryOpen) return 'close-directory'
  return 'none'
}
