import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getManagementMethodPaths } from './managementMethodStore'
import { fileExists, withOrgMasterRootLock, writeVerifiedAtomicFile } from './orgmasterFileStore'
import type { ManagementMethodStoreV1, MethodMediaAssetV1 } from '../src/managementMethods/types'

const MAX_MEDIA_BYTES = 8 * 1024 * 1024
const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
export class ManagementMethodMediaError extends Error { constructor(public readonly code: string, message = code) { super(message); this.name = 'ManagementMethodMediaError' } }

function magic(buffer: Buffer, mime: string) {
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mime === 'image/jpeg') return buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

export async function ingestManagementMethodMedia(root: string, input: { bytes: Buffer; mimeType: string; altText: string; methodId?: string | null; creationRequestId?: string | null; principalId: string }) {
  if (!allowed.has(input.mimeType)) throw new ManagementMethodMediaError('MEDIA_TYPE_INVALID')
  if (input.bytes.byteLength > MAX_MEDIA_BYTES) throw new ManagementMethodMediaError('MEDIA_TOO_LARGE')
  if (!magic(input.bytes, input.mimeType)) throw new ManagementMethodMediaError('MEDIA_TYPE_INVALID')
  if (Boolean(input.methodId) === Boolean(input.creationRequestId)) throw new ManagementMethodMediaError('MEDIA_CONTEXT_REQUIRED')
  const contentHash = createHash('sha256').update(input.bytes).digest('hex')
  return withOrgMasterRootLock(root, async () => {
    const paths = getManagementMethodPaths(root); await mkdir(paths.media, { recursive: true })
    const id = `media-${randomUUID()}`; const storedFileRef = `${id}.${input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg'}`
    await writeVerifiedAtomicFile(resolve(paths.media, storedFileRef), input.bytes.toString('base64'))
    const asset: MethodMediaAssetV1 = { id, contentHash, mimeType: input.mimeType as MethodMediaAssetV1['mimeType'], byteSize: input.bytes.byteLength, width: null, height: null, altText: input.altText.trim().slice(0, 300), storedFileRef, methodId: input.methodId ?? null, pendingCreationRequestId: input.creationRequestId ?? null, createdByPrincipalId: input.principalId, createdAt: new Date().toISOString(), unreferencedSince: null }
    return asset
  })
}

export async function readManagementMethodMedia(root: string, store: ManagementMethodStoreV1, mediaId: string, methodId: string, view: 'draft' | 'readable') {
  const asset = store.mediaAssets.find((item) => item.id === mediaId)
  const method = store.methods.find((item) => item.id === methodId)
  if (!asset || !method) throw new ManagementMethodMediaError('MEDIA_NOT_FOUND')
  const body = view === 'readable' ? method.readableSnapshot?.body : method.workingDraft.body
  const ids = view === 'readable' ? method.readableSnapshot?.mediaIds ?? [] : method.workingDraft.mediaIds
  if (!body || !ids.includes(mediaId) || asset.methodId !== methodId) throw new ManagementMethodMediaError('MEDIA_NOT_FOUND')
  const raw = await readFile(resolve(getManagementMethodPaths(root).media, asset.storedFileRef), 'utf8')
  return { asset, bytes: Buffer.from(raw, 'base64') }
}

export async function removeMediaFileIfExists(root: string, storedFileRef: string) {
  const path = resolve(getManagementMethodPaths(root).media, storedFileRef)
  if (await fileExists(path)) await unlink(path)
}
