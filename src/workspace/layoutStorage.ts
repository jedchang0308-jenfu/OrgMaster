import { parseWorkspaceLayout } from './layout'
import type { WorkspaceLayoutV1 } from './types'

export const WORKSPACE_LAYOUT_KEY = 'orgmaster.composable-workspace.layout.v1'

type LayoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface PendingSave {
  layout: WorkspaceLayoutV1
  storage: LayoutStorage
  onFailure?: () => void
}

let pending: PendingSave | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let failureReported = false

function defaultStorage(): LayoutStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function reportFailure(onFailure?: () => void) {
  if (failureReported) return
  failureReported = true
  onFailure?.()
}

export function loadWorkspaceLayout(storage: LayoutStorage | null = defaultStorage()): WorkspaceLayoutV1 | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(WORKSPACE_LAYOUT_KEY)
    if (!raw) return null
    const parsed = parseWorkspaceLayout(JSON.parse(raw))
    if (parsed) return parsed
    storage.removeItem(WORKSPACE_LAYOUT_KEY)
    return null
  } catch {
    try {
      storage.removeItem(WORKSPACE_LAYOUT_KEY)
    } catch {
      // A broken browser storage must not block the product workspace.
    }
    return null
  }
}

export function scheduleWorkspaceLayoutSave(
  layout: WorkspaceLayoutV1,
  options: { storage?: LayoutStorage | null; onFailure?: () => void; delayMs?: number } = {},
) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  if (!storage) {
    reportFailure(options.onFailure)
    return
  }
  pending = { layout, storage, onFailure: options.onFailure }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => flushWorkspaceLayoutSave(), options.delayMs ?? 250)
}

export function flushWorkspaceLayoutSave() {
  if (timer) clearTimeout(timer)
  timer = null
  const current = pending
  pending = null
  if (!current) return true
  try {
    current.storage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(current.layout))
    return true
  } catch {
    reportFailure(current.onFailure)
    return false
  }
}

export function clearWorkspaceLayout(storage: LayoutStorage | null = defaultStorage()) {
  if (timer) clearTimeout(timer)
  timer = null
  pending = null
  if (!storage) return
  try {
    storage.removeItem(WORKSPACE_LAYOUT_KEY)
  } catch {
    // Layout persistence is best-effort and never a domain error.
  }
}

export function resetWorkspaceLayoutStorageFailureForTests() {
  failureReported = false
}
