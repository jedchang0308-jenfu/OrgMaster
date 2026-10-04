import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWorkspaceIndex, loadWorkspaceVersion, saveWorkspaceDocument } from './serverWorkspaceStorage'
import { createOrgDocumentFile } from './documentStorage'
import { screenshotOrganizationState } from './screenshotData'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('workspace client recovery messages', () => {
  it('surfaces the server validation reason for an invalid V7 document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'VERSION_INVALID',
      reason: 'PROCESS_NODE_CYCLE',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })))

    const result = await loadWorkspaceVersion('draft-1')

    expect(result).toEqual({
      status: 'failed',
      message: '版本工作區無法完成操作：PROCESS_NODE_CYCLE',
      statusCode: 422,
      code: 'VERSION_INVALID',
    })
  })
})

describe('workspace read cancellation', () => {
  it('forwards the same AbortSignal only to the index/version GET readers', async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await loadWorkspaceIndex(controller.signal)
    await loadWorkspaceVersion('draft/1', controller.signal)
    await saveWorkspaceDocument('draft/1', createOrgDocumentFile(screenshotOrganizationState, 'copy'), 'rev-1', 'draft-edit')
    expect(fetchMock.mock.calls[0]).toEqual(['/api/orgmaster/workspace', { cache: 'no-store', signal: controller.signal }])
    expect(fetchMock.mock.calls[1]).toEqual(['/api/orgmaster/workspace/versions/draft%2F1', { cache: 'no-store', signal: controller.signal }])
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[2][1]).not.toHaveProperty('signal')
  })

  it('settles a cancelled read without changing it into a business request', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const reading = loadWorkspaceIndex(controller.signal)
    controller.abort()
    expect(await reading).toMatchObject({ status: 'failed' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('method')
  })
})
