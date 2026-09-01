import type { WorkspaceClientResult } from '../serverWorkspaceStorage'
import type { OrgDirectoryState } from '../types'
import { validateWorkspaceIndex, type OrgWorkspaceIndex, type WorkspaceDocumentResult } from '../versionWorkspace'
import { sanitizeEntityRef } from './route'
import type { EntityRef, WorkspaceHydrationState } from './types'

export function classifyIndexFailure(result: WorkspaceClientResult<OrgWorkspaceIndex>): WorkspaceHydrationState {
  if (result.status === 'failed') {
    if (result.statusCode === 400 && result.code?.startsWith('WORKSPACE_')) {
      return { kind: 'workspace-invalid', message: result.message }
    }
    return { kind: 'index-unavailable', message: result.message }
  }
  const validation = validateWorkspaceIndex(result.value)
  if (!validation.ok) return { kind: 'workspace-invalid', message: `版本工作區索引驗證失敗：${validation.code}` }
  const current = validation.value.versions.find((version) => version.id === validation.value.currentVersionId)
  if (current?.loadStatus === 'failed') {
    return { kind: 'version-invalid', versionId: current.id, isCurrent: true, message: current.failureCode ?? '目前版本無法載入' }
  }
  return { kind: 'ready' }
}

export function classifyVersionFailure(
  result: WorkspaceClientResult<WorkspaceDocumentResult>,
  versionId: string | null,
  isCurrent: boolean,
): WorkspaceHydrationState {
  if (result.status === 'loaded') return { kind: 'ready' }
  if (result.statusCode === 409) return { kind: 'conflict', message: result.message }
  return { kind: 'version-invalid', versionId, isCurrent, message: result.message }
}

export function isWorkspaceMutationBlocked(state: WorkspaceHydrationState) {
  return state.kind !== 'ready'
}

export function reconcileSelectionAfterVersionSwitch(ref: EntityRef | null, state: OrgDirectoryState) {
  return sanitizeEntityRef(ref, state)
}
