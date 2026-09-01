import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultWorkspaceLayout } from './layout'
import {
  clearWorkspaceLayout,
  flushWorkspaceLayoutSave,
  loadWorkspaceLayout,
  resetWorkspaceLayoutStorageFailureForTests,
  scheduleWorkspaceLayoutSave,
  WORKSPACE_LAYOUT_KEY,
} from './layoutStorage'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

afterEach(() => {
  clearWorkspaceLayout(null)
  resetWorkspaceLayoutStorageFailureForTests()
  vi.useRealTimers()
})

describe('workspace layout storage', () => {
  it('uses a trailing save and flushes the latest layout', () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const first = defaultWorkspaceLayout()
    const second = { ...first, visualState: { organization: { scrollTop: 20 } } }
    scheduleWorkspaceLayoutSave(first, { storage, delayMs: 250 })
    scheduleWorkspaceLayoutSave(second, { storage, delayMs: 250 })
    expect(storage.getItem(WORKSPACE_LAYOUT_KEY)).toBeNull()
    vi.advanceTimersByTime(249)
    expect(storage.getItem(WORKSPACE_LAYOUT_KEY)).toBeNull()
    vi.advanceTimersByTime(1)
    expect(loadWorkspaceLayout(storage)).toEqual(second)
  })

  it('removes corrupt data and reports write failure only once', () => {
    const storage = new MemoryStorage()
    storage.setItem(WORKSPACE_LAYOUT_KEY, '{bad json')
    expect(loadWorkspaceLayout(storage)).toBeNull()
    expect(storage.getItem(WORKSPACE_LAYOUT_KEY)).toBeNull()
    const onFailure = vi.fn()
    const broken = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new Error('quota') } }
    scheduleWorkspaceLayoutSave(defaultWorkspaceLayout(), { storage: broken, onFailure, delayMs: 1000 })
    expect(flushWorkspaceLayoutSave()).toBe(false)
    scheduleWorkspaceLayoutSave(defaultWorkspaceLayout(), { storage: broken, onFailure, delayMs: 1000 })
    expect(flushWorkspaceLayoutSave()).toBe(false)
    expect(onFailure).toHaveBeenCalledTimes(1)
  })
})
