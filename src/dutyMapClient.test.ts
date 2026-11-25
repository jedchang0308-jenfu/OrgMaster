import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeOrgMasterPermissionInvalidation } from './auth/permissionInvalidation'
import { DUTY_CHAPTER_CATALOG_VERSION } from './dutyMap'
import { dutyMapClient, validateDutyMapReview } from './dutyMapClient'
import type { DutyMapProjection, DutyMapReviewResult } from './dutyMap'

afterEach(() => vi.unstubAllGlobals())
const input = { versionId: 'draft /一', expectedVersionRevision: 'r1', chapterCatalogVersion: DUTY_CHAPTER_CATALOG_VERSION, requestId: 'request1' }
describe('duty map API client', () => {
  it('uses no-store, encoded version, same-session wrapper, and cancellable exact review body', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    await dutyMapClient.get(input.versionId, controller.signal)
    expect(fetcher).toHaveBeenLastCalledWith('/api/orgmaster/duty-map?versionId=draft%20%2F%E4%B8%80', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: controller.signal }))
    await dutyMapClient.review(input, controller.signal)
    const [url, init] = fetcher.mock.lastCall!
    expect(url).toBe('/api/orgmaster/duty-map/reviews')
    expect(JSON.parse(init.body)).toEqual(input)
    expect(init.method).toBe('POST'); expect(init.signal).toBe(controller.signal)
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })
  it('notifies existing permission invalidation without exposing provider error bodies', async () => {
    const notify = vi.fn(), unsubscribe = subscribeOrgMasterPermissionInvalidation(notify)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'private provider detail secret-value' }), { status: 403 })))
    await expect(dutyMapClient.get('v1')).rejects.toMatchObject({ code: 'DUTY_MAP_REQUEST_FAILED', status: 403 })
    expect(notify).toHaveBeenCalledWith('forbidden'); unsubscribe()
  })
  it('rejects malformed JSON and result provenance or unknown references', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>internal</html>', { status: 502 })))
    await expect(dutyMapClient.get('v1')).rejects.toMatchObject({ code: 'DUTY_MAP_INVALID_RESPONSE' })
    const projection = { versionKind: 'draft', departments: [], duties: [], map: null, chapters: [] } as unknown as DutyMapProjection
    const result = { ...input, revision: 'r1', versionName: '草稿', versionKind: 'draft', generatedAt: '', findings: [] } as unknown as DutyMapReviewResult
    expect(validateDutyMapReview(result, input, projection)).toBe(result)
    expect(() => validateDutyMapReview({ ...result, requestId: 'other' }, input, projection)).toThrow('DUTY_MAP_INVALID_REVIEW')
    expect(() => validateDutyMapReview({ ...result, findings: [{ id: 'f1', kind: 'chapter-no-duty', chapterIds: ['99'], nodeRefs: [], relationshipIds: [], summary: '', observed: '', reason: '', suggestion: '' }] }, input, projection)).toThrow('DUTY_MAP_INVALID_REVIEW')
  })
})
