import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeManagementMethodDraftGenerator } from './managementMethodAi'
import { ingestManagementMethodMedia, readManagementMethodMedia } from './managementMethodMediaStore'
import { createManagementMethod, ensureManagementMethodStore, readManagementMethodStore, withStoreMutation } from './managementMethodStore'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])

describe('ManagementMethodMediaStore', () => {
  it('validates magic bytes, keeps pending media private, then authorizes a committed reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev032-media-')); roots.push(root)
    await ensureManagementMethodStore(root)
    const creationRequestId = crypto.randomUUID()
    await expect(ingestManagementMethodMedia(root, { bytes: Buffer.from('not-png'), mimeType: 'image/png', altText: '圖', creationRequestId, principalId: 'test-principal' })).rejects.toMatchObject({ code: 'MEDIA_TYPE_INVALID' })
    const asset = await ingestManagementMethodMedia(root, { bytes: pngHeader, mimeType: 'image/png', altText: '測試圖片', creationRequestId, principalId: 'test-principal' })
    await withStoreMutation(root, async ({ store }) => ({ store: { ...store, mediaAssets: [...store.mediaAssets, asset] }, result: null }))
    const input = { creationRequestId, requestedTitle: '含圖片辦法', goalAndPurpose: '建立含圖片的測試文件', confirmedCurrentFacts: '', confirmedTargetRules: '', existingContent: null, selectedMedia: [{ mediaId: asset.id, altText: asset.altText, humanDescription: '測試圖片' }] }
    const generated = await new FakeManagementMethodDraftGenerator().generate(input)
    const created = await createManagementMethod(root, input, generated.title, generated.body, generated.meta, 'test-principal')
    const store = (await readManagementMethodStore(root)).store
    const readable = await readManagementMethodMedia(root, store, asset.id, created.method.id, 'draft')
    expect(readable.bytes.equals(pngHeader)).toBe(true)
    expect(store.mediaAssets.find((item) => item.id === asset.id)?.methodId).toBe(created.method.id)
  })
})
