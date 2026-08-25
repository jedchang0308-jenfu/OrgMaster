import { describe, expect, it } from 'vitest'
import { getOrthogonalEdgePath, getSharedHorizontalBranchOffset } from './OrthogonalEdge'

describe('getOrthogonalEdgePath', () => {
  it('uses visible rounded corners for horizontal children', () => {
    const path = getOrthogonalEdgePath(100, 0, 200, 100, 'horizontal')

    expect(path).toContain('Q 100 12 103.33333333333333 12')
    expect(path).toContain('Q 200 12 200 15.333333333333334')
  })

  it('uses a visible rounded corner for vertical children', () => {
    const path = getOrthogonalEdgePath(100, 0, 150, 100, 'vertical')

    expect(path).toContain('Q 100 100 103.33333333333333 100')
    expect(path).not.toBe('M 100 0 V 100 H 150')
  })

  it('shrinks the radius for short branches', () => {
    const path = getOrthogonalEdgePath(100, 0, 102, 30, 'vertical')

    expect(path).toContain('Q 100 30 102 30')
  })

  it('keeps direct reports on one parent-derived branch after one is demoted', () => {
    const sharedOffset = getSharedHorizontalBranchOffset(0, 60, [80, 300])

    expect(sharedOffset).toBeCloseTo(8.4)
    expect(getOrthogonalEdgePath(100, 60, 40, 80, 'horizontal', sharedOffset)).toContain('Q 100 68.4')
    expect(getOrthogonalEdgePath(100, 60, 260, 300, 'horizontal', sharedOffset)).toContain('Q 100 68.4')
  })
})
