import { describe, expect, it, beforeEach } from 'vitest'
import { createUuidV7, isUuidV7, resetUuidV7MonotonicStateForTest } from './employeeIdentity'

describe('employee UUIDv7 contract', () => {
  beforeEach(() => resetUuidV7MonotonicStateForTest())
  it('creates canonical UUIDv7 and validates it', () => {
    const id = createUuidV7(1700000000000, () => new Uint8Array(10).fill(1))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
    expect(isUuidV7(id)).toBe(true)
  })
  it('is monotonic for same-millisecond calls', () => {
    const first = createUuidV7(10, () => new Uint8Array(10).fill(0))
    const second = createUuidV7(10, () => new Uint8Array(10).fill(0))
    expect(second > first).toBe(true)
  })
  it('does not accept v4 or semantic ids', () => {
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
    expect(isUuidV7('employee-alice')).toBe(false)
  })
})
