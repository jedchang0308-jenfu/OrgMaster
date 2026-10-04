/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrgDocumentFile, orgStateSignature } from '../documentStorage'
import { loadWorkspaceIndex, loadWorkspaceVersion } from '../serverWorkspaceStorage'
import { screenshotOrganizationState } from '../screenshotData'
import type { OrgWorkspaceIndex, WorkspaceDocumentResult } from '../versionWorkspace'
import { startWorkspaceSynchronization } from './serverSynchronization'

vi.mock('../serverWorkspaceStorage', () => ({ loadWorkspaceIndex: vi.fn(), loadWorkspaceVersion: vi.fn() }))
const loadIndex = vi.mocked(loadWorkspaceIndex)
const loadVersion = vi.mocked(loadWorkspaceVersion)
const index: OrgWorkspaceIndex = {
  app: 'OrgMaster', workspaceVersion: 1, currentVersionId: 'current-1', manifestRevision: 'manifest-1',
  versions: [{ id: 'current-1', name: '現行版', kind: 'current', status: 'active', basedOnVersionId: null,
    createdAt: '2026-08-01T00:00:00Z', archivedAt: null, updatedAt: '2026-08-01T00:00:00Z', revision: 'new-revision', loadStatus: 'ready' }],
}
const incoming: WorkspaceDocumentResult = {
  version: index.versions[0], document: createOrgDocumentFile(screenshotOrganizationState, 'copy'),
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}
let visibility = 'visible'
let stop: (() => void) | undefined
function changeVisibility(value: string) {
  visibility = value
  document.dispatchEvent(new Event('visibilitychange'))
}
function start() {
  const state = { versionId: 'current-1', revision: 'old-revision', signature: 'old-state', savedSignature: 'old-state' }
  const callbacks = { current: () => state, onIndex: vi.fn(), onIncoming: vi.fn(), onConflict: vi.fn() }
  stop = startWorkspaceSynchronization(callbacks)
  return { state, ...callbacks }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState)
  loadIndex.mockResolvedValue({ status: 'loaded', value: index })
  loadVersion.mockResolvedValue({ status: 'loaded', value: incoming })
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('workspace server synchronization', () => {
  it('keeps the entire slow index/version cycle single-flight and waits after completion', async () => {
    const firstIndex = deferred<Awaited<ReturnType<typeof loadWorkspaceIndex>>>()
    const firstVersion = deferred<Awaited<ReturnType<typeof loadWorkspaceVersion>>>()
    loadIndex.mockReturnValueOnce(firstIndex.promise)
    loadVersion.mockReturnValueOnce(firstVersion.promise)
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(19500)
    expect(loadIndex).toHaveBeenCalledTimes(1)
    expect(loadVersion).not.toHaveBeenCalled()
    firstIndex.resolve({ status: 'loaded', value: index })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(18000)
    expect(loadIndex).toHaveBeenCalledTimes(1)
    expect(loadVersion).toHaveBeenCalledTimes(1)
    firstVersion.resolve({ status: 'loaded', value: incoming })
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.onIncoming).toHaveBeenCalledWith(incoming, orgStateSignature(incoming.document.state), true)
    await vi.advanceTimersByTimeAsync(1499)
    expect(loadIndex).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(loadIndex).toHaveBeenCalledTimes(2)
  })

  it('starts hidden without reads and resumes once despite repeated visible events', async () => {
    visibility = 'hidden'
    start()
    await vi.advanceTimersByTimeAsync(60000)
    expect(loadIndex).not.toHaveBeenCalled()
    changeVisibility('visible')
    changeVisibility('visible')
    changeVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(loadIndex).toHaveBeenCalledTimes(1)
    changeVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(loadIndex).toHaveBeenCalledTimes(1)
  })

  it('aborts hidden reads and waits for an ignored cancellation before resuming without overlap', async () => {
    const pending = deferred<Awaited<ReturnType<typeof loadWorkspaceIndex>>>()
    loadIndex.mockReturnValueOnce(pending.promise)
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(1500)
    const signal = loadIndex.mock.calls[0][0]!
    changeVisibility('hidden')
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(18000)
    changeVisibility('visible')
    changeVisibility('visible')
    await vi.advanceTimersByTimeAsync(18000)
    expect(loadIndex).toHaveBeenCalledTimes(1)
    pending.resolve({ status: 'loaded', value: index })
    await vi.advanceTimersByTimeAsync(0)
    expect(loadIndex).toHaveBeenCalledTimes(2)
    expect(callbacks.onIndex).toHaveBeenCalledTimes(1)
    expect(callbacks.onIncoming).toHaveBeenCalledTimes(1)
  })

  it('cleanup aborts a pending version read and rejects all late state/timer work', async () => {
    const pending = deferred<Awaited<ReturnType<typeof loadWorkspaceVersion>>>()
    loadVersion.mockReturnValueOnce(pending.promise)
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(1500)
    const signal = loadVersion.mock.calls[0][1]!
    stop!()
    expect(signal.aborted).toBe(true)
    pending.resolve({ status: 'loaded', value: incoming })
    changeVisibility('visible')
    await vi.advanceTimersByTimeAsync(60000)
    expect(callbacks.onIncoming).not.toHaveBeenCalled()
    expect(callbacks.onConflict).not.toHaveBeenCalled()
    expect(loadIndex).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('backs off failed/throwing reads up to 30 seconds and resets after a successful read', async () => {
    loadIndex.mockResolvedValueOnce({ status: 'failed', message: 'Rate exceeded.', statusCode: 429 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'failed', message: 'offline' })
      .mockResolvedValueOnce({ status: 'failed', message: 'offline' })
      .mockResolvedValueOnce({ status: 'failed', message: 'offline' })
      .mockResolvedValueOnce({ status: 'failed', message: 'offline' })
    start()
    await vi.advanceTimersByTimeAsync(1500)
    let count = 1
    for (const delay of [3000, 6000, 12000, 24000, 30000, 30000, 1500]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(loadIndex).toHaveBeenCalledTimes(count)
      await vi.advanceTimersByTimeAsync(1)
      count += 1
      expect(loadIndex).toHaveBeenCalledTimes(count)
    }
    expect(loadVersion).toHaveBeenCalledTimes(2)
  })

  it('does not fetch an unchanged version and still schedules the next index read', async () => {
    const callbacks = start()
    callbacks.state.revision = 'new-revision'
    await vi.advanceTimersByTimeAsync(3000)
    expect(loadIndex).toHaveBeenCalledTimes(2)
    expect(loadVersion).not.toHaveBeenCalled()
    expect(callbacks.onIncoming).not.toHaveBeenCalled()
  })

  it('refreshes metadata for matching state without replacing the local document', async () => {
    const callbacks = start()
    callbacks.state.signature = orgStateSignature(incoming.document.state)
    await vi.advanceTimersByTimeAsync(1500)
    expect(callbacks.onIncoming).toHaveBeenCalledWith(incoming, callbacks.state.signature, false)
    expect(callbacks.onConflict).not.toHaveBeenCalled()
  })

  it('preserves an unsaved local draft and reports the existing conflict', async () => {
    const callbacks = start()
    callbacks.state.signature = 'unsaved-local-draft'
    await vi.advanceTimersByTimeAsync(1500)
    expect(callbacks.onIncoming).not.toHaveBeenCalled()
    expect(callbacks.onConflict).toHaveBeenCalledTimes(1)
    expect(callbacks.state.signature).toBe('unsaved-local-draft')
  })

  it.each(['versionId', 'revision'] as const)('ignores a response after the selected %s changes during its read', async (field) => {
    const pending = deferred<Awaited<ReturnType<typeof loadWorkspaceVersion>>>()
    loadVersion.mockReturnValueOnce(pending.promise)
    const callbacks = start()
    await vi.advanceTimersByTimeAsync(1500)
    callbacks.state[field] = 'changed-by-user-or-autosave'
    pending.resolve({ status: 'loaded', value: incoming })
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.onIncoming).not.toHaveBeenCalled()
    expect(callbacks.onConflict).not.toHaveBeenCalled()
  })
})
