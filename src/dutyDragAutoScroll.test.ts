import { describe, expect, it } from 'vitest'
import { getDutyDragAutoScrollDelta, resolveDutyDragScrollOwner } from './dutyDragAutoScroll'

describe('duty drag auto-scroll', () => {
  const rect = { top: 100, bottom: 500 } as DOMRect

  it('accelerates toward the nearest edge and stays bounded', () => {
    expect(getDutyDragAutoScrollDelta(100, rect)).toBe(-14)
    expect(getDutyDragAutoScrollDelta(124, rect)).toBe(-7)
    expect(getDutyDragAutoScrollDelta(500, rect)).toBe(14)
    expect(getDutyDragAutoScrollDelta(476, rect)).toBe(7)
    expect(getDutyDragAutoScrollDelta(300, rect)).toBe(0)
  })

  it('returns zero for invalid options', () => {
    expect(getDutyDragAutoScrollDelta(100, rect, { threshold: 0 })).toBe(0)
    expect(getDutyDragAutoScrollDelta(100, rect, { maxStep: 0 })).toBe(0)
  })

  it('does not invent a scroll owner when hit-testing has no element', () => {
    expect(resolveDutyDragScrollOwner(null)).toBeNull()
  })
})
