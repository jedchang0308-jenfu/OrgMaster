import type { ManagementMethodCreateInputV1, ManagementMethodSessionV1, ManagementMethodSummaryV1, ManagementMethodV1, EditorDocumentV1, MethodMediaAssetV1 } from './types'

const BASE = '/api/orgmaster/management-methods'
export interface ApiFailure { code: string; status: number; issues?: unknown[] }
export class ManagementMethodApiError extends Error { constructor(public readonly failure: ApiFailure) { super(failure.code); this.name = 'ManagementMethodApiError' } }

async function json(response: Response) { try { return await response.json() as Record<string, unknown> } catch { return {} } }
const devHeaders = { 'X-OrgMaster-Dev-Issuer': 'urn:orgmaster:dev', 'X-OrgMaster-Dev-Subject': 'local-admin', 'X-OrgMaster-Dev-Fake-AI': '1' }
async function request<T>(path: string, init?: RequestInit) {
  const headers = { ...devHeaders, ...(init?.headers ?? {}) }
  const response = await fetch(`${BASE}${path}`, { cache: 'no-store', ...init, headers })
  const payload = await json(response)
  if (!response.ok) throw new ManagementMethodApiError({ code: typeof payload.error === 'string' ? payload.error : 'MANAGEMENT_METHOD_REQUEST_FAILED', status: response.status, issues: Array.isArray(payload.issues) ? payload.issues : undefined })
  return payload as unknown as T
}
export const managementMethodApi = {
  session: () => request<ManagementMethodSessionV1>('/session'),
  list: (query = '', view: 'draft' | 'readable' = 'draft') => request<{ summaries: ManagementMethodSummaryV1[]; revision: string }>(`/?view=${view}&q=${encodeURIComponent(query)}`),
  get: (methodId: string, view: 'draft' | 'readable' = 'draft') => request<{ method: ManagementMethodV1; view: string }>(`/${encodeURIComponent(methodId)}?view=${view}`),
  media: async (methodId: string, mediaId: string, view: 'draft' | 'readable', signal?: AbortSignal) => {
    const response = await fetch(`${BASE}/media/${encodeURIComponent(mediaId)}?methodId=${encodeURIComponent(methodId)}&view=${view}`, { cache: 'no-store', headers: devHeaders, signal })
    if (!response.ok) {
      const payload = await json(response)
      throw new ManagementMethodApiError({ code: typeof payload.error === 'string' ? payload.error : 'MANAGEMENT_METHOD_REQUEST_FAILED', status: response.status, issues: Array.isArray(payload.issues) ? payload.issues : undefined })
    }
    return response.blob()
  },
  create: (input: ManagementMethodCreateInputV1, signal?: AbortSignal) => request<{ method: ManagementMethodV1 }>('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal }),
  saveDraft: (methodId: string, expectedDraftRevision: string, commandId: string, body: EditorDocumentV1) => request<{ method: ManagementMethodV1 }>(`/${encodeURIComponent(methodId)}/draft`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedDraftRevision, commandId, body }) }),
  updateMetadata: (methodId: string, expectedMethodRevision: string, commandId: string, title: string, ownerEmployeeId: string | null) => request<{ method: ManagementMethodV1 }>(`/${encodeURIComponent(methodId)}/metadata`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedMethodRevision, commandId, title, ownerEmployeeId }) }),
  provide: (methodId: string, expectedDraftRevision: string, expectedMethodRevision: string, commandId: string, confirmation = true) => request<{ method: ManagementMethodV1 }>(`/${encodeURIComponent(methodId)}/readable`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedDraftRevision, expectedMethodRevision, commandId, confirmation }) }),
  restore: (methodId: string, expectedDraftRevision: string, expectedMethodRevision: string, commandId: string) => request<{ method: ManagementMethodV1 }>(`/${encodeURIComponent(methodId)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedDraftRevision, expectedMethodRevision, commandId }) }),
  stopReadable: (methodId: string, expectedMethodRevision: string, commandId: string) => request<{ method: ManagementMethodV1 }>(`/${encodeURIComponent(methodId)}/readable`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedMethodRevision, commandId, confirmation: true }) }),
  uploadMedia: async (methodId: string, file: File, altText = '') => {
    const response = await fetch(`${BASE}/media?methodId=${encodeURIComponent(methodId)}`, { method: 'POST', cache: 'no-store', headers: { ...devHeaders, 'Content-Type': file.type, 'X-OrgMaster-Media-Alt': encodeURIComponent(altText) }, body: file })
    const payload = await json(response)
    if (!response.ok) throw new ManagementMethodApiError({ code: typeof payload.error === 'string' ? payload.error : 'MANAGEMENT_METHOD_REQUEST_FAILED', status: response.status, issues: Array.isArray(payload.issues) ? payload.issues : undefined })
    return payload as unknown as { media: MethodMediaAssetV1 }
  },
}
