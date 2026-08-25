import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { FakeManagementMethodDraftGenerator } from './managementMethodAi'
import { createManagementMethod, provideReadable, readManagementMethodStore, restoreDraft, saveDraft, stopReadable, updateMethodMetadata } from './managementMethodStore'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('ManagementMethodStoreV1', () => {
  it('allocates permanent code once and keeps readable snapshot isolated', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev032-')); roots.push(root)
    const input = { creationRequestId: crypto.randomUUID(), requestedTitle: '測試辦法', goalAndPurpose: '建立測試原則', confirmedCurrentFacts: '', confirmedTargetRules: '', existingContent: null, selectedMedia: [] }
    const generated = await new FakeManagementMethodDraftGenerator().generate(input)
    const created = await createManagementMethod(root, input, generated.title, generated.body, generated.meta, 'test-principal')
    const replay = await createManagementMethod(root, input, generated.title, generated.body, generated.meta, 'test-principal')
    expect(created.method.code).toBe('MP-0001'); expect(replay.replayed).toBe(true); expect(replay.method.id).toBe(created.method.id)
    const meta = await updateMethodMetadata(root, created.method.id, created.method.methodRevision, crypto.randomUUID(), '測試辦法', 'employee-1', 'test-principal')
    const provided = await provideReadable(root, created.method.id, meta.result.method.workingDraft.revision, meta.result.method.methodRevision, crypto.randomUUID(), 'test-principal')
    expect(provided.result.method.readableSnapshot?.bodyHash).toBe(provided.result.method.workingDraft.bodyHash)
    const changedBody = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: '草稿更新' }] }] }
    const saved = await saveDraft(root, created.method.id, provided.result.method.workingDraft.revision, crypto.randomUUID(), changedBody, 'test-principal')
    expect(saved.result.method.readableSnapshot?.bodyHash).not.toBe(saved.result.method.workingDraft.bodyHash)
    const restored = await restoreDraft(root, created.method.id, saved.result.method.workingDraft.revision, saved.result.method.methodRevision, crypto.randomUUID(), 'test-principal')
    expect(restored.result.method.workingDraft.bodyHash).toBe(restored.result.method.readableSnapshot?.bodyHash)
    const stopped = await stopReadable(root, created.method.id, restored.result.method.methodRevision, crypto.randomUUID(), 'test-principal')
    expect(stopped.result.method.readableSnapshot).toBeNull()
    expect((await readManagementMethodStore(root)).store.nextMethodNumber).toBe(2)
  })
})
