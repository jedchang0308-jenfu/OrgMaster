import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWorkspaceVersion } from './serverWorkspaceStorage'

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
