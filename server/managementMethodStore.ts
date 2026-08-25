import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { collectMediaIds, validateEditorDocument, validateEditorSemantics } from '../src/managementMethods/schema'
import { canonicalJson, canonicalizeEditorDocument } from '../src/managementMethods/canonicalize'
import type { EditorDocumentV1, ManagementMethodCreateInputV1, ManagementMethodStoreV1, ManagementMethodV1, MethodCommandReceiptV1, MethodGenerationMetaV1, MethodReadableSnapshotV1 } from '../src/managementMethods/types'
import { deriveMethodStatus, toMethodSummary } from '../src/managementMethods/status'
import { fileExists, withOrgMasterRootLock, writeVerifiedAtomicFile } from './orgmasterFileStore'

export class ManagementMethodStoreError extends Error {
  constructor(public readonly code: string, message = code, public readonly issues?: unknown[]) { super(message); this.name = 'ManagementMethodStoreError' }
}

export function getManagementMethodPaths(root = process.cwd()) {
  const data = resolve(root, 'data')
  return { current: resolve(data, 'orgmaster-management-methods.v1.json'), previous: resolve(data, 'orgmaster-management-methods.v1.previous.json'), media: resolve(data, 'orgmaster-management-method-media'), lock: resolve(data, 'orgmaster-management-methods.v1.lock') }
}

function sha256(value: string) { return createHash('sha256').update(value).digest('hex') }
function now() { return new Date().toISOString() }
function emptyDocument(): EditorDocumentV1 { return { type: 'doc', content: [{ type: 'paragraph', content: [] }] } }
export function bodyHash(body: EditorDocumentV1) { return sha256(canonicalJson(canonicalizeEditorDocument(body))) }

function defaultStore(): ManagementMethodStoreV1 { return { app: 'OrgMasterManagementMethods', schemaVersion: 1, nextMethodNumber: 1, methods: [], mediaAssets: [], commandReceipts: [] } }

function validateStore(store: unknown): asserts store is ManagementMethodStoreV1 {
  if (!store || typeof store !== 'object') throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
  const value = store as Partial<ManagementMethodStoreV1>
  const nextMethodNumber = value.nextMethodNumber
  if (value.app !== 'OrgMasterManagementMethods' || value.schemaVersion !== 1 || !Number.isInteger(nextMethodNumber) || (nextMethodNumber ?? 0) < 1 || !Array.isArray(value.methods) || !Array.isArray(value.mediaAssets) || !Array.isArray(value.commandReceipts)) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
  const codes = new Set<string>()
  const assets = new Map((value.mediaAssets as Array<{ id: string; methodId: string | null }>).map((asset) => [asset.id, asset]))
  for (const asset of value.mediaAssets) {
    if (!asset || typeof asset !== 'object' || typeof asset.id !== 'string' || !asset.id || (Boolean(asset.methodId) === Boolean(asset.pendingCreationRequestId)) || typeof asset.storedFileRef !== 'string' || asset.storedFileRef.includes('\\') || asset.storedFileRef.includes('/') || asset.storedFileRef.includes('..')) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
  }
  for (const method of value.methods) {
    if (!method || typeof method !== 'object' || typeof method.id !== 'string' || !/^MP-\d{4,}$/.test(method.code) || codes.has(method.code)) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
    codes.add(method.code)
    const parsed = validateEditorDocument(method.workingDraft?.body)
    if (!parsed.ok || validateEditorSemantics(parsed.document).length || bodyHash(parsed.document) !== method.workingDraft.bodyHash || JSON.stringify(method.workingDraft.mediaIds) !== JSON.stringify(collectMediaIds(parsed.document))) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
    if (method.workingDraft.mediaIds.some((id) => assets.get(id)?.methodId !== method.id)) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
    if (method.readableSnapshot) {
      const snapshot = validateEditorDocument(method.readableSnapshot.body)
      if (!snapshot.ok || validateEditorSemantics(snapshot.document).length || bodyHash(snapshot.document) !== method.readableSnapshot.bodyHash || JSON.stringify(method.readableSnapshot.mediaIds) !== JSON.stringify(collectMediaIds(snapshot.document))) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
      if (method.readableSnapshot.mediaIds.some((id) => assets.get(id)?.methodId !== method.id)) throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID')
    }
  }
}

async function readRaw(root: string) {
  const path = getManagementMethodPaths(root).current
  try { const raw = await readFile(path, 'utf8'); const store = JSON.parse(raw); validateStore(store); return { raw, store } }
  catch (error) { if (error instanceof ManagementMethodStoreError) throw error; if ((error as { code?: string })?.code !== 'ENOENT') throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_INVALID'); throw new ManagementMethodStoreError('MANAGEMENT_METHOD_STORE_MISSING') }
}

export async function ensureManagementMethodStore(root = process.cwd()) {
  const paths = getManagementMethodPaths(root)
  await mkdir(resolve(root, 'data'), { recursive: true })
  if (!await fileExists(paths.current)) await writeVerifiedAtomicFile(paths.current, `${JSON.stringify(defaultStore(), null, 2)}\n`)
  return readRaw(root)
}

export async function readManagementMethodStore(root = process.cwd()) { try { return await readRaw(root) } catch (error) { if (error instanceof ManagementMethodStoreError && error.code === 'MANAGEMENT_METHOD_STORE_MISSING') return ensureManagementMethodStore(root); throw error } }

async function persist(root: string, current: { raw: string }, next: ManagementMethodStoreV1) {
  validateStore(next)
  const paths = getManagementMethodPaths(root)
  await writeVerifiedAtomicFile(paths.previous, current.raw)
  const raw = `${JSON.stringify(next, null, 2)}\n`
  await writeVerifiedAtomicFile(paths.current, raw)
  return { raw, store: next }
}

export async function withStoreMutation<T>(root: string, operation: (current: { raw: string; store: ManagementMethodStoreV1 }) => Promise<{ store: ManagementMethodStoreV1; result: T }>) {
  return withOrgMasterRootLock(root, async () => {
    const current = await readManagementMethodStore(root)
    const outcome = await operation(current)
    const saved = await persist(root, current, outcome.store)
    return { ...outcome, raw: saved.raw }
  })
}

function nextCode(number: number) { return `MP-${number.toString().padStart(4, '0')}` }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function findReceipt(store: ManagementMethodStoreV1, commandId: string) { return store.commandReceipts.find((receipt) => receipt.commandId === commandId) ?? null }
function receiptOrConflict(store: ManagementMethodStoreV1, commandId: string, payloadHash: string) {
  const existing = findReceipt(store, commandId)
  if (!existing) return null
  if (existing.payloadHash !== payloadHash) throw new ManagementMethodStoreError('COMMAND_ID_REUSED')
  return existing
}
function addReceipt(store: ManagementMethodStoreV1, receipt: MethodCommandReceiptV1) { return { ...store, commandReceipts: [...store.commandReceipts, receipt] } }
function updatedMethod(method: ManagementMethodV1, patch: Partial<ManagementMethodV1>, principalId: string) { const at = now(); return { ...method, ...patch, methodRevision: randomUUID(), updatedByPrincipalId: principalId, updatedAt: at } }

export async function createManagementMethod(root: string, input: ManagementMethodCreateInputV1, generatedTitle: string, body: EditorDocumentV1, generationMeta: MethodGenerationMetaV1, principalId: string) {
  const inputHash = sha256(canonicalJson(input))
  return withOrgMasterRootLock(root, async () => {
    const current = await readManagementMethodStore(root)
    const duplicate = current.store.methods.find((method) => method.creationRequestId === input.creationRequestId)
    if (duplicate) { if (duplicate.creationInputHash !== inputHash) throw new ManagementMethodStoreError('CREATION_REQUEST_REUSED'); return { method: duplicate, raw: current.raw, replayed: true } }
    const parsed = validateEditorDocument(body)
    const semanticIssues = parsed.ok ? validateEditorSemantics(parsed.document) : []
    if (!parsed.ok || semanticIssues.length) throw new ManagementMethodStoreError('AI_OUTPUT_INVALID', 'AI 草稿不符合文件格式', parsed.ok ? semanticIssues : parsed.issues)
    const mediaIds = collectMediaIds(parsed.document)
    const selectedMediaIds = (input.selectedMedia ?? []).map((media) => media.mediaId).sort()
    if (JSON.stringify(mediaIds) !== JSON.stringify(selectedMediaIds)) throw new ManagementMethodStoreError('AI_OUTPUT_INVALID', '圖片引用與建立來源不一致')
    const pendingMedia = current.store.mediaAssets.filter((asset) => asset.pendingCreationRequestId === input.creationRequestId)
    if (pendingMedia.some((asset) => asset.createdByPrincipalId !== principalId) || pendingMedia.some((asset) => !selectedMediaIds.includes(asset.id)) || selectedMediaIds.some((id) => !pendingMedia.some((asset) => asset.id === id))) throw new ManagementMethodStoreError('MEDIA_NOT_FOUND')
    const at = now()
    const draft = { bodyFormat: 'editor-json-v1' as const, body: copy(parsed.document), bodyHash: bodyHash(parsed.document), revision: randomUUID(), mediaIds: collectMediaIds(parsed.document), updatedByPrincipalId: principalId, updatedAt: at }
    const method: ManagementMethodV1 = { id: randomUUID(), code: nextCode(current.store.nextMethodNumber), creationRequestId: input.creationRequestId, creationInputHash: inputHash, title: (input.requestedTitle?.trim() || generatedTitle || '未命名管理辦法').slice(0, 120), ownerEmployeeId: null, methodRevision: randomUUID(), workingDraft: draft, readableSnapshot: null, generationMeta, createdByPrincipalId: principalId, createdAt: at, updatedByPrincipalId: principalId, updatedAt: at }
    const next = { ...current.store, nextMethodNumber: current.store.nextMethodNumber + 1, methods: [...current.store.methods, method], mediaAssets: current.store.mediaAssets.map((asset) => selectedMediaIds.includes(asset.id) ? { ...asset, methodId: method.id, pendingCreationRequestId: null } : asset) }
    const saved = await persist(root, current, next)
    return { method, raw: saved.raw, replayed: false }
  })
}

export async function saveDraft(root: string, methodId: string, expectedDraftRevision: string, commandId: string, body: EditorDocumentV1, principalId: string) {
  return withStoreMutation(root, async ({ store }) => {
    const method = store.methods.find((item) => item.id === methodId); if (!method) throw new ManagementMethodStoreError('METHOD_NOT_FOUND')
    const payloadHash = sha256(canonicalJson({ methodId, expectedDraftRevision, body }))
    const receipt = receiptOrConflict(store, commandId, payloadHash); if (receipt) return { store, result: { method, replayed: true } }
    if (method.workingDraft.revision !== expectedDraftRevision) throw new ManagementMethodStoreError('DRAFT_REVISION_CONFLICT')
    const parsed = validateEditorDocument(body); const issues = parsed.ok ? validateEditorSemantics(parsed.document) : parsed.issues
    if (!parsed.ok || issues.length) throw new ManagementMethodStoreError('VALIDATION_FAILED', '文件內容無法保存', issues)
    const mediaIds = collectMediaIds(parsed.document)
    if (mediaIds.some((id) => !store.mediaAssets.some((asset) => asset.id === id && asset.methodId === method.id))) throw new ManagementMethodStoreError('MEDIA_NOT_FOUND')
    const at = now(); const nextDraft = { ...method.workingDraft, body: copy(parsed.document), bodyHash: bodyHash(parsed.document), revision: randomUUID(), mediaIds, updatedByPrincipalId: principalId, updatedAt: at }
    const nextMethod = updatedMethod(method, { workingDraft: nextDraft }, principalId)
    const nextReceipt: MethodCommandReceiptV1 = { commandId, commandType: 'SAVE_DRAFT', methodId, payloadHash, resultingMethodRevision: nextMethod.methodRevision, resultingDraftRevision: nextDraft.revision, appliedByPrincipalId: principalId, appliedAt: at }
    const next = addReceipt({ ...store, methods: store.methods.map((item) => item.id === methodId ? nextMethod : item) }, nextReceipt)
    return { store: next, result: { method: nextMethod, replayed: false } }
  })
}

export async function updateMethodMetadata(root: string, methodId: string, expectedMethodRevision: string, commandId: string, title: string, ownerEmployeeId: string | null, principalId: string) {
  return withStoreMutation(root, async ({ store }) => {
    const method = store.methods.find((item) => item.id === methodId); if (!method) throw new ManagementMethodStoreError('METHOD_NOT_FOUND')
    const payloadHash = sha256(canonicalJson({ methodId, expectedMethodRevision, title, ownerEmployeeId })); const receipt = receiptOrConflict(store, commandId, payloadHash); if (receipt) return { store, result: { method, replayed: true } }
    if (method.methodRevision !== expectedMethodRevision) throw new ManagementMethodStoreError('METHOD_REVISION_CONFLICT')
    if (!title.trim() || title.trim().length > 120) throw new ManagementMethodStoreError('VALIDATION_FAILED')
    const nextMethod = updatedMethod(method, { title: title.trim(), ownerEmployeeId: ownerEmployeeId?.trim() || null }, principalId)
    const nextReceipt: MethodCommandReceiptV1 = { commandId, commandType: 'UPDATE_METADATA', methodId, payloadHash, resultingMethodRevision: nextMethod.methodRevision, resultingDraftRevision: nextMethod.workingDraft.revision, appliedByPrincipalId: principalId, appliedAt: now() }
    return { store: addReceipt({ ...store, methods: store.methods.map((item) => item.id === methodId ? nextMethod : item) }, nextReceipt), result: { method: nextMethod, replayed: false } }
  })
}

export async function provideReadable(root: string, methodId: string, expectedDraftRevision: string, expectedMethodRevision: string, commandId: string, principalId: string) {
  return withStoreMutation(root, async ({ store }) => {
    const method = store.methods.find((item) => item.id === methodId); if (!method) throw new ManagementMethodStoreError('METHOD_NOT_FOUND')
    const payloadHash = sha256(canonicalJson({ methodId, expectedDraftRevision, expectedMethodRevision })); const receipt = receiptOrConflict(store, commandId, payloadHash); if (receipt) return { store, result: { method, replayed: true } }
    if (method.workingDraft.revision !== expectedDraftRevision) throw new ManagementMethodStoreError('DRAFT_REVISION_CONFLICT')
    if (method.methodRevision !== expectedMethodRevision) throw new ManagementMethodStoreError('METHOD_REVISION_CONFLICT')
    if (!method.ownerEmployeeId) throw new ManagementMethodStoreError('OWNER_INVALID')
    const snapshot: MethodReadableSnapshotV1 = { title: method.title, ownerEmployeeId: method.ownerEmployeeId, bodyFormat: 'editor-json-v1', body: copy(method.workingDraft.body), bodyHash: method.workingDraft.bodyHash, sourceDraftRevision: method.workingDraft.revision, mediaIds: [...method.workingDraft.mediaIds], providedByPrincipalId: principalId, providedAt: now() }
    const nextMethod = updatedMethod(method, { readableSnapshot: snapshot }, principalId)
    const nextReceipt: MethodCommandReceiptV1 = { commandId, commandType: 'PROVIDE_READABLE', methodId, payloadHash, resultingMethodRevision: nextMethod.methodRevision, resultingDraftRevision: nextMethod.workingDraft.revision, appliedByPrincipalId: principalId, appliedAt: now() }
    return { store: addReceipt({ ...store, methods: store.methods.map((item) => item.id === methodId ? nextMethod : item) }, nextReceipt), result: { method: nextMethod, replayed: false } }
  })
}

export async function restoreDraft(root: string, methodId: string, expectedDraftRevision: string, expectedMethodRevision: string, commandId: string, principalId: string) {
  return withStoreMutation(root, async ({ store }) => {
    const method = store.methods.find((item) => item.id === methodId); if (!method) throw new ManagementMethodStoreError('METHOD_NOT_FOUND')
    if (!method.readableSnapshot) throw new ManagementMethodStoreError('SNAPSHOT_REQUIRED')
    const payloadHash = sha256(canonicalJson({ methodId, expectedDraftRevision, expectedMethodRevision })); const receipt = receiptOrConflict(store, commandId, payloadHash); if (receipt) return { store, result: { method, replayed: true } }
    if (method.workingDraft.revision !== expectedDraftRevision) throw new ManagementMethodStoreError('DRAFT_REVISION_CONFLICT')
    if (method.methodRevision !== expectedMethodRevision) throw new ManagementMethodStoreError('METHOD_REVISION_CONFLICT')
    const at = now(); const draft = { ...method.workingDraft, body: copy(method.readableSnapshot.body), bodyHash: method.readableSnapshot.bodyHash, revision: randomUUID(), mediaIds: [...method.readableSnapshot.mediaIds], updatedByPrincipalId: principalId, updatedAt: at }
    const nextMethod = updatedMethod(method, { workingDraft: draft, title: method.readableSnapshot.title, ownerEmployeeId: method.readableSnapshot.ownerEmployeeId }, principalId)
    const nextReceipt: MethodCommandReceiptV1 = { commandId, commandType: 'RESTORE_DRAFT', methodId, payloadHash, resultingMethodRevision: nextMethod.methodRevision, resultingDraftRevision: draft.revision, appliedByPrincipalId: principalId, appliedAt: at }
    return { store: addReceipt({ ...store, methods: store.methods.map((item) => item.id === methodId ? nextMethod : item) }, nextReceipt), result: { method: nextMethod, replayed: false } }
  })
}

export async function stopReadable(root: string, methodId: string, expectedMethodRevision: string, commandId: string, principalId: string) {
  return withStoreMutation(root, async ({ store }) => {
    const method = store.methods.find((item) => item.id === methodId); if (!method) throw new ManagementMethodStoreError('METHOD_NOT_FOUND')
    const payloadHash = sha256(canonicalJson({ methodId, expectedMethodRevision })); const receipt = receiptOrConflict(store, commandId, payloadHash); if (receipt) return { store, result: { method, replayed: true } }
    if (method.methodRevision !== expectedMethodRevision) throw new ManagementMethodStoreError('METHOD_REVISION_CONFLICT')
    const nextMethod = updatedMethod(method, { readableSnapshot: null }, principalId)
    const nextReceipt: MethodCommandReceiptV1 = { commandId, commandType: 'STOP_READABLE', methodId, payloadHash, resultingMethodRevision: nextMethod.methodRevision, resultingDraftRevision: method.workingDraft.revision, appliedByPrincipalId: principalId, appliedAt: now() }
    return { store: addReceipt({ ...store, methods: store.methods.map((item) => item.id === methodId ? nextMethod : item) }, nextReceipt), result: { method: nextMethod, replayed: false } }
  })
}

export function storeRevision(raw: string) { return sha256(raw) }
export function methodSummary(method: ManagementMethodV1) { return toMethodSummary(method) }
export function methodStatus(method: ManagementMethodV1) { return deriveMethodStatus(method) }
