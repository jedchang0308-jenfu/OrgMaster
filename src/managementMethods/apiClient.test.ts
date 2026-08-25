import { afterEach, describe, expect, it, vi } from 'vitest'
import { managementMethodApi } from './apiClient'

describe('managementMethodApi media', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the same development identity context when reading protected media', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['png-bytes'], { type: 'image/png' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await managementMethodApi.media('method 1', 'media/1', 'draft')

    expect(result.type).toBe('image/png')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orgmaster/management-methods/media/media%2F1?methodId=method%201&view=draft',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'X-OrgMaster-Dev-Issuer': 'urn:orgmaster:dev',
          'X-OrgMaster-Dev-Subject': 'local-admin',
        }),
      }),
    )
  })

  it('maps protected media failures to the typed API error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'MEDIA_NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } })))

    await expect(managementMethodApi.media('method-1', 'media-1', 'readable')).rejects.toMatchObject({
      failure: { code: 'MEDIA_NOT_FOUND', status: 404 },
    })
  })
})
