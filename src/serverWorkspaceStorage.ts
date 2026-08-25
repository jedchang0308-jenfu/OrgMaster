import { parseOrgDocument, type OrgDocumentFile } from './documentStorage'
import type {
  OrgWorkspaceIndex,
  OrgWorkspaceVersionSummary,
  WorkspaceDocumentResult,
} from './versionWorkspace'

export const SERVER_WORKSPACE_API = '/api/orgmaster/workspace'

export type WorkspaceClientResult<T> =
  | { status: 'loaded'; value: T }
  | { status: 'failed'; message: string; statusCode?: number; code?: string }

async function readJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function failure(response: Response, payload: Record<string, unknown>, fallback: string): WorkspaceClientResult<never> {
  const code = typeof payload.error === 'string' ? payload.error : fallback
  return { status: 'failed', message: `版本工作區無法完成操作：${code}`, statusCode: response.status, code }
}

export async function loadWorkspaceIndex(): Promise<WorkspaceClientResult<OrgWorkspaceIndex>> {
  try {
    const response = await fetch(SERVER_WORKSPACE_API, { cache: 'no-store' })
    const payload = await readJson(response)
    if (!response.ok) return failure(response, payload, 'WORKSPACE_READ_FAILED')
    return { status: 'loaded', value: payload as unknown as OrgWorkspaceIndex }
  } catch {
    return { status: 'failed', message: '無法連線到本機版本工作區' }
  }
}

export async function loadWorkspaceVersion(versionId: string): Promise<WorkspaceClientResult<WorkspaceDocumentResult>> {
  try {
    const response = await fetch(`${SERVER_WORKSPACE_API}/versions/${encodeURIComponent(versionId)}`, { cache: 'no-store' })
    const payload = await readJson(response)
    if (!response.ok) return failure(response, payload, 'VERSION_READ_FAILED')
    const documentResult = parseOrgDocument(payload.document)
    if (!documentResult.ok) return { status: 'failed', message: `版本文件驗證失敗：${documentResult.code}`, code: documentResult.code }
    return { status: 'loaded', value: { version: payload.version as OrgWorkspaceVersionSummary, document: documentResult.document } }
  } catch {
    return { status: 'failed', message: '無法載入選取的組織版本' }
  }
}

export async function createWorkspaceDraft(
  sourceVersionId: string,
  name: string,
  expectedManifestRevision: string,
): Promise<WorkspaceClientResult<{ workspace: OrgWorkspaceIndex; createdVersionId: string }>> {
  try {
    const response = await fetch(`${SERVER_WORKSPACE_API}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OrgMaster-Manifest-Revision': expectedManifestRevision },
      body: JSON.stringify({ sourceVersionId, name, expectedManifestRevision }),
    })
    const payload = await readJson(response)
    if (!response.ok) return failure(response, payload, 'DRAFT_CREATE_FAILED')
    return { status: 'loaded', value: payload as unknown as { workspace: OrgWorkspaceIndex; createdVersionId: string } }
  } catch {
    return { status: 'failed', message: '無法建立組織草稿' }
  }
}

export async function saveWorkspaceDocument(
  versionId: string,
  document: OrgDocumentFile,
  expectedVersionRevision: string,
  mode: 'draft-edit' | 'current-maintenance',
): Promise<WorkspaceClientResult<WorkspaceDocumentResult>> {
  try {
    const response = await fetch(`${SERVER_WORKSPACE_API}/versions/${encodeURIComponent(versionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-OrgMaster-Revision': expectedVersionRevision },
      body: JSON.stringify({ document, expectedVersionRevision, mode }),
    })
    const payload = await readJson(response)
    if (!response.ok) return failure(response, payload, 'VERSION_SAVE_FAILED')
    const parsed = parseOrgDocument(payload.document)
    if (!parsed.ok) return { status: 'failed', message: `保存後版本驗證失敗：${parsed.code}`, code: parsed.code }
    return { status: 'loaded', value: { version: payload.version as OrgWorkspaceVersionSummary, document: parsed.document } }
  } catch {
    return { status: 'failed', message: '無法保存組織版本' }
  }
}

export async function updateWorkspaceEntryClient(
  versionId: string,
  action: 'rename' | 'archive' | 'restore',
  expectedManifestRevision: string,
  name?: string,
): Promise<WorkspaceClientResult<OrgWorkspaceIndex>> {
  try {
    const response = await fetch(`${SERVER_WORKSPACE_API}/versions/${encodeURIComponent(versionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-OrgMaster-Manifest-Revision': expectedManifestRevision },
      body: JSON.stringify({ action, name, expectedManifestRevision }),
    })
    const payload = await readJson(response)
    if (!response.ok) return failure(response, payload, 'VERSION_ACTION_FAILED')
    return { status: 'loaded', value: payload as unknown as OrgWorkspaceIndex }
  } catch {
    return { status: 'failed', message: '無法更新組織版本清單' }
  }
}
