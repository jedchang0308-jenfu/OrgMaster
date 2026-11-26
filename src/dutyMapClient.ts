import { orgMasterPermissionFetch } from './auth/permissionInvalidation'
import type { DutyMapMethodLinkResult, DutyMapProjection, DutyMapReviewResult } from './dutyMap'

export class DutyMapApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); this.name = 'DutyMapApiError' }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await orgMasterPermissionFetch('/api/orgmaster/duty-map' + path, { ...init, credentials: 'same-origin', cache: 'no-store' })
  // Provider error bodies may contain untrusted details; retain only a bounded machine code.
  let payload: unknown
  try { payload = await response.json() } catch { throw new DutyMapApiError(response.status, 'DUTY_MAP_INVALID_RESPONSE') }
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && /^[A-Z0-9_]{1,100}$/.test(payload.error) ? payload.error : 'DUTY_MAP_REQUEST_FAILED'
    throw new DutyMapApiError(response.status, code)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new DutyMapApiError(response.status, 'DUTY_MAP_INVALID_RESPONSE')
  return payload as T
}
export interface DutyMapReviewInput { versionId: string; expectedVersionRevision: string; chapterCatalogVersion: string; requestId: string }
export function validateDutyMapReview(result: DutyMapReviewResult, expected: DutyMapReviewInput, projection: DutyMapProjection) {
  const fail = () => { throw new DutyMapApiError(502, 'DUTY_MAP_INVALID_REVIEW') }
  if (result.requestId !== expected.requestId || result.versionId !== expected.versionId || result.revision !== expected.expectedVersionRevision || result.chapterCatalogVersion !== expected.chapterCatalogVersion || result.versionKind !== projection.versionKind || !Array.isArray(result.findings)) fail()
  const kinds = new Set(['duty-unmapped', 'chapter-collaboration-only', 'chapter-no-duty', 'handoff-gap', 'mapping-suggestion', 'needs-confirmation'])
  const departments = new Set(projection.departments.map(d => d.id)), groups = new Set(projection.map?.groups.map(g => g.id)), duties = new Set(projection.duties.map(d => d.id))
  const chapters = new Set(projection.chapters.map(c => c.chapterId)), relationships = new Set(projection.map?.relationships.map(r => r.id)), ids = new Set<string>()
  for (const finding of result.findings) {
    if (!finding || typeof finding !== 'object' || typeof finding.id !== 'string' || !finding.id || ids.has(finding.id) || !kinds.has(finding.kind) || !Array.isArray(finding.nodeRefs) || !Array.isArray(finding.chapterIds) || !Array.isArray(finding.relationshipIds)) fail()
    ids.add(finding.id)
    if (![finding.summary, finding.observed, finding.suggestion, finding.reason].every(v => typeof v === 'string') || !finding.nodeRefs.length && !finding.chapterIds.length && !finding.relationshipIds.length) fail()
    if (finding.nodeRefs.some(ref => !ref || !({ department: departments, group: groups, duty: duties }[ref.kind]?.has(ref.id))) || finding.chapterIds.some(id => !chapters.has(id)) || finding.relationshipIds.some(id => !relationships.has(id))) fail()
  }
  return result
}
export const dutyMapClient = {
  get: (versionId: string | null, signal?: AbortSignal) => request<DutyMapProjection>(versionId ? '?versionId=' + encodeURIComponent(versionId) : '', { signal }),
  methodLinks: (versionId: string, methodId: string, signal?: AbortSignal) => request<DutyMapMethodLinkResult>('/method-links?versionId=' + encodeURIComponent(versionId) + '&methodId=' + encodeURIComponent(methodId), { signal }),
  review: (input: DutyMapReviewInput, signal?: AbortSignal) => request<DutyMapReviewResult>('/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal }),
}
