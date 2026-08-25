import { describe, expect, it } from 'vitest'
import { buildDutyReadRows } from './dutyReadAdapter'

describe('management method duty read adapter', () => {
  it('projects only existing position relations and never mutates source state', () => {
    const state = {
      duties: [{ id: 'd1', title: '採購審核', description: '確認授權' }],
      dutyPositionRelations: [{ dutyId: 'd1', relationType: 'review', target: { kind: 'position', positionId: 'p1' } }, { dutyId: 'missing', relationType: 'execute', target: { kind: 'position', positionId: 'p1' } }],
      positions: [{ id: 'p1', title: '管理部經理', departmentId: 'dep1' }],
      departments: [{ id: 'dep1', name: '管理部' }],
    } as any
    const before = JSON.stringify(state)
    expect(buildDutyReadRows(state)).toEqual([{ dutyId: 'd1', title: '採購審核', description: '確認授權', relationType: 'review', positionId: 'p1', positionTitle: '管理部經理', departmentName: '管理部' }])
    expect(JSON.stringify(state)).toBe(before)
  })
})
