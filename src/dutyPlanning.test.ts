import { describe, expect, it } from 'vitest'
import { projectDutyPlan, type DutyRelationPlacementIntent } from './dutyPlanning'
import type { OrgDirectoryState } from './types'

const state: OrgDirectoryState = {
  employees: [],
  departments: [],
  roles: [],
  positions: [
    { id: 'pos-a', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: null, title: 'A', status: 'active', allowMultipleAssignees: false },
    { id: 'pos-b', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: null, title: 'B', status: 'active', allowMultipleAssignees: false },
  ],
  assignments: [],
  members: [],
  roleCombinationRiskRules: [],
  organizationLevels: [],
  organizationLayout: { mode: 'tree', showLevelGuides: true },
  duties: [{ id: 'duty-a', title: '工作', description: null }],
  dutyPositionRelations: [{ id: 'rel-a', dutyId: 'duty-a', relationType: 'execute', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 }],
  processes: [],
  processNodes: [],
  processEdges: [],
  processNodeDutyLinks: [],
}

describe('duty plan projector', () => {
  it('sets an existing executor as primary without creating a duplicate', () => {
    const result = projectDutyPlan(state, [{ anomalyId: 'duty:duty-a:missing-primary', kind: 'missing-primary-executor', dutyId: 'duty-a', resolution: { kind: 'set-primary', targetPositionId: 'pos-a', newRelationId: 'new-id' } }])
    expect(result.issues).toEqual([])
    expect(result.state.dutyPositionRelations).toHaveLength(1)
    expect(result.state.dutyPositionRelations[0].isPrimaryExecutor).toBe(true)
  })

  it('creates a single execute relation for no-executor and is order independent', () => {
    const noExecutor = { ...state, dutyPositionRelations: [] }
    const intent = { anomalyId: 'duty:duty-a:no-executor' as const, kind: 'no-executor' as const, dutyId: 'duty-a', resolution: { kind: 'set-primary' as const, targetPositionId: 'pos-b', newRelationId: 'rel-new' } }
    const first = projectDutyPlan(noExecutor, [intent])
    const second = projectDutyPlan(noExecutor, [intent])
    expect(first.issues).toEqual([])
    expect(first.state).toEqual(second.state)
    expect(first.state.dutyPositionRelations).toHaveLength(1)
    expect(first.state.dutyPositionRelations[0].target).toEqual({ kind: 'position', positionId: 'pos-b' })
  })

  it('keeps incomplete plans visible as blockers without changing state', () => {
    const result = projectDutyPlan(state, [{ anomalyId: 'duty:duty-a:missing-primary', kind: 'missing-primary-executor', dutyId: 'duty-a', resolution: null }])
    expect(result.issues[0].code).toBe('INCOMPLETE')
    expect(result.state).toEqual(state)
  })

  it('moves a primary executor by removing the source relation', () => {
    const primaryState = { ...state, dutyPositionRelations: [{ ...state.dutyPositionRelations[0], id: 'rel-primary', isPrimaryExecutor: true }] }
    const intent: DutyRelationPlacementIntent = {
      planItemId: 'plan-primary',
      kind: 'place-relation',
      dutyId: 'duty-a',
      sourceRelationId: 'rel-primary',
      sourcePositionId: 'pos-a',
      relationType: 'execute',
      sourceIsPrimaryExecutor: true,
      resolution: { mode: 'move', targetPositionId: 'pos-b', newRelationId: 'rel-primary-new' },
    }
    const result = projectDutyPlan(primaryState, [intent])
    expect(result.issues).toEqual([])
    expect(result.state.dutyPositionRelations).toEqual([
      { id: 'rel-primary-new', dutyId: 'duty-a', relationType: 'execute', target: { kind: 'position', positionId: 'pos-b' }, isPrimaryExecutor: true, order: 0 },
    ])
  })

  it('reuses an existing other executor when moving primary', () => {
    const primaryState = { ...state, dutyPositionRelations: [
      { ...state.dutyPositionRelations[0], id: 'rel-primary', isPrimaryExecutor: true },
      { ...state.dutyPositionRelations[0], id: 'rel-other', target: { kind: 'position' as const, positionId: 'pos-b' }, isPrimaryExecutor: false },
    ] }
    const intent: DutyRelationPlacementIntent = {
      planItemId: 'plan-primary', kind: 'place-relation', dutyId: 'duty-a', sourceRelationId: 'rel-primary', sourcePositionId: 'pos-a', relationType: 'execute', sourceIsPrimaryExecutor: true,
      resolution: { mode: 'move', targetPositionId: 'pos-b', newRelationId: 'rel-unused' },
    }
    const result = projectDutyPlan(primaryState, [intent])
    expect(result.issues).toEqual([])
    expect(result.state.dutyPositionRelations).toHaveLength(1)
    expect(result.state.dutyPositionRelations[0]).toMatchObject({ id: 'rel-other', isPrimaryExecutor: true, target: { kind: 'position', positionId: 'pos-b' } })
  })

  it('moves and copies a non-primary relation without changing its responsibility type', () => {
    const move: DutyRelationPlacementIntent = {
      planItemId: 'plan-move', kind: 'place-relation', dutyId: 'duty-a', sourceRelationId: 'rel-a', sourcePositionId: 'pos-a', relationType: 'execute', sourceIsPrimaryExecutor: false,
      resolution: { mode: 'move', targetPositionId: 'pos-b', newRelationId: null },
    }
    const moved = projectDutyPlan(state, [move])
    expect(moved.issues).toEqual([])
    expect(moved.state.dutyPositionRelations[0]).toMatchObject({ id: 'rel-a', relationType: 'execute', isPrimaryExecutor: false, target: { kind: 'position', positionId: 'pos-b' } })
    const copy: DutyRelationPlacementIntent = { ...move, planItemId: 'plan-copy', resolution: { mode: 'copy', targetPositionId: 'pos-b', newRelationId: 'rel-copy' } }
    const copied = projectDutyPlan(state, [copy])
    expect(copied.issues).toEqual([])
    expect(copied.state.dutyPositionRelations).toHaveLength(2)
    expect(copied.state.dutyPositionRelations.find((relation) => relation.id === 'rel-a')?.target).toEqual({ kind: 'position', positionId: 'pos-a' })
    expect(copied.state.dutyPositionRelations.find((relation) => relation.id === 'rel-copy')).toMatchObject({ relationType: 'execute', isPrimaryExecutor: false, target: { kind: 'position', positionId: 'pos-b' } })
  })

  it('rejects a duplicated source placement before apply', () => {
    const first: DutyRelationPlacementIntent = { planItemId: 'plan-first', kind: 'place-relation', dutyId: 'duty-a', sourceRelationId: 'rel-a', sourcePositionId: 'pos-a', relationType: 'execute', sourceIsPrimaryExecutor: false, resolution: { mode: 'move', targetPositionId: 'pos-b', newRelationId: null } }
    const second: DutyRelationPlacementIntent = { ...first, planItemId: 'plan-second', resolution: { mode: 'copy', targetPositionId: 'pos-b', newRelationId: 'rel-copy' } }
    const result = projectDutyPlan(state, [first, second])
    expect(result.issues.some((issue) => issue.code === 'PLACEMENT_CONFLICT')).toBe(true)
  })
})
