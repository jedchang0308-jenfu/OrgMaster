import { orgStateSignature } from '../documentStorage'
import { loadWorkspaceIndex, loadWorkspaceVersion } from '../serverWorkspaceStorage'
import type { OrgWorkspaceIndex, WorkspaceDocumentResult } from '../versionWorkspace'

interface WorkspaceSynchronizationState {
  versionId: string | null
  revision: string | null
  signature: string
  savedSignature: string | null
}

interface WorkspaceSynchronizationOptions {
  current: () => WorkspaceSynchronizationState
  onIndex: (index: OrgWorkspaceIndex) => void
  onIncoming: (incoming: WorkspaceDocumentResult, signature: string, replace: boolean) => void
  onConflict: () => void
}

const POLL_DELAY_MS = 1500
const MAX_FAILURE_DELAY_MS = 30000

async function synchronize(options: WorkspaceSynchronizationOptions, signal: AbortSignal) {
  const indexResult = await loadWorkspaceIndex(signal)
  if (signal.aborted) return false
  if (indexResult.status !== 'loaded') return false
  options.onIndex(indexResult.value)
  const requested = { ...options.current() }
  const version = indexResult.value.versions.find((candidate) => candidate.id === requested.versionId)
  if (!version || version.revision === requested.revision) return true
  const incoming = await loadWorkspaceVersion(version.id, signal)
  if (signal.aborted) return false
  if (incoming.status !== 'loaded') return false
  const current = options.current()
  // A version switch or completed autosave makes this read obsolete.
  if (current.versionId !== requested.versionId || current.revision !== requested.revision) return true
  if (incoming.value.version.id !== requested.versionId) return false
  const signature = orgStateSignature(incoming.value.document.state)
  if (signature === current.signature) {
    options.onIncoming(incoming.value, signature, false)
  } else if (current.signature !== current.savedSignature) {
    options.onConflict()
  } else {
    options.onIncoming(incoming.value, signature, true)
  }
  return true
}

export function startWorkspaceSynchronization(options: WorkspaceSynchronizationOptions) {
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: AbortController | undefined
  let nextDelay = POLL_DELAY_MS
  const visible = () => document.visibilityState !== 'hidden'
  let wasVisible = visible()
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const schedule = (delay: number) => {
    if (!active || !visible() || inFlight) return
    clearTimer()
    timer = setTimeout(() => { timer = undefined; void run() }, delay)
  }
  const run = async () => {
    if (!active || !visible() || inFlight) return
    const controller = new AbortController()
    inFlight = controller
    let succeeded = false
    try {
      succeeded = await synchronize(options, controller.signal)
    } catch {
      // Reader failures use the same bounded delay as typed failed responses.
    } finally {
      inFlight = undefined
      if (active) {
        if (controller.signal.aborted) {
          // A visibility resume may occur before the cancelled fetch settles.
          schedule(0)
        } else {
          nextDelay = succeeded ? POLL_DELAY_MS : Math.min(nextDelay * 2, MAX_FAILURE_DELAY_MS)
          schedule(nextDelay)
        }
      }
    }
  }
  const visibilityChanged = () => {
    const nowVisible = visible()
    if (nowVisible === wasVisible) return
    wasVisible = nowVisible
    clearTimer()
    if (!visible()) inFlight?.abort()
    else schedule(0)
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  schedule(POLL_DELAY_MS)
  return () => {
    active = false
    clearTimer()
    document.removeEventListener('visibilitychange', visibilityChanged)
    inFlight?.abort()
  }
}
