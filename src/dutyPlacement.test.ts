import { describe, expect, it } from 'vitest'
import { createDutyDropIntent, dutyColumnForRelation, dutyMatrixColumnForResponsibilityColumn, dutyPlacementTargetForMatrixCell, dutyResponsibilityColumnForSource, evaluateDutyDrop } from './dutyPlacement'
import type { OrgDirectoryState } from './types'

const state: OrgDirectoryState = {
  employees: [], departments: [], roles: [], assignments: [], members: [], roleCombinationRiskRules: [], organizationLevels: [], organizationLayout: { mode: 'tree', showLevelGuides: true },
  positions: [
    { id: 'pos-a', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: null, title: 'A', status: 'active', allowMultipleAssignees: false },
    { id: 'pos-b', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: null, title: 'B', status: 'active', allowMultipleAssignees: false },
    { id: 'pos-off', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: null, title: 'Off', status: 'inactive', allowMultipleAssignees: false },
  ],
  duties: [{ id: 'duty-a', title: '工作', description: null }],
  dutyPositionRelations: [
    { id: 'rel-primary', dutyId: 'duty-a', relationType: 'execute', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: true, order: 0 },
    { id: 'rel-review', dutyId: 'duty-a', relationType: 'review', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
  ],
  processes: [],
  processNodes: [],
  processEdges: [],
  processNodeDutyLinks: [],
}

describe('duty placement validator', () => {
  it('splits execute relations into primary and collaboration columns', () => {
    expect(dutyColumnForRelation({ relationType: 'execute', isPrimaryExecutor: true })).toBe('primary-execute')
    expect(dutyColumnForRelation({ relationType: 'execute', isPrimaryExecutor: false })).toBe('collaborate')
  })

  it('groups exact responsibility columns into a concise matrix without losing source semantics', () => {
    expect(dutyMatrixColumnForResponsibilityColumn('primary-execute')).toBe('execute')
    expect(dutyMatrixColumnForResponsibilityColumn('collaborate')).toBe('execute')
    expect(dutyMatrixColumnForResponsibilityColumn('review')).toBe('review')
    expect(dutyMatrixColumnForResponsibilityColumn('countersign')).toBe('review')
    expect(dutyResponsibilityColumnForSource(state, { kind: 'relation', relationId: 'rel-primary' })).toBe('primary-execute')
    expect(dutyResponsibilityColumnForSource(state, { kind: 'relation', relationId: 'rel-review' })).toBe('review')
    expect(dutyPlacementTargetForMatrixCell(state, { kind: 'relation', relationId: 'rel-primary' }, 'pos-b', 'execute')).toEqual({ positionId: 'pos-b', column: 'primary-execute' })
    expect(dutyPlacementTargetForMatrixCell(state, { kind: 'relation', relationId: 'rel-review' }, 'pos-b', 'review')).toEqual({ positionId: 'pos-b', column: 'review' })
    expect(dutyPlacementTargetForMatrixCell(state, { kind: 'relation', relationId: 'rel-review' }, 'pos-b', 'execute')).toBeNull()
  })

  it('requires same responsibility column and active targets', () => {
    expect(evaluateDutyDrop(state, [], { kind: 'relation', relationId: 'rel-review' }, { positionId: 'pos-b', column: 'review' }).kind).toBe('choose-move-copy')
    expect(evaluateDutyDrop(state, [], { kind: 'relation', relationId: 'rel-review' }, { positionId: 'pos-b', column: 'collaborate' })).toMatchObject({ kind: 'reject', code: 'RELATION_TYPE_MISMATCH' })
    expect(evaluateDutyDrop(state, [], { kind: 'relation', relationId: 'rel-review' }, { positionId: 'pos-off', column: 'review' })).toMatchObject({ kind: 'reject', code: 'TARGET_INVALID' })
  })

  it('offers move/copy only for non-primary relations and creates an explicit intent', () => {
    const evaluation = evaluateDutyDrop(state, [], { kind: 'relation', relationId: 'rel-review' }, { positionId: 'pos-b', column: 'review' })
    expect(evaluation.kind).toBe('choose-move-copy')
    const intent = createDutyDropIntent(state, { kind: 'relation', relationId: 'rel-review' }, { positionId: 'pos-b', column: 'review' }, { planItemId: 'plan-review', newRelationId: 'rel-review-copy' }, 'copy')
    expect(intent).toMatchObject({ kind: 'place-relation', resolution: { mode: 'copy', targetPositionId: 'pos-b', newRelationId: 'rel-review-copy' } })
  })

  it('stages anomaly repairs only into the matching column', () => {
    const stateWithoutPrimary = { ...state, dutyPositionRelations: state.dutyPositionRelations.filter((relation) => !relation.isPrimaryExecutor) }
    const anomaly = evaluateDutyDrop(stateWithoutPrimary, [], { kind: 'anomaly', anomalyId: 'duty:duty-a:no-executor' }, { positionId: 'pos-b', column: 'primary-execute' })
    expect(anomaly.kind).toBe('stage')
    expect(createDutyDropIntent(stateWithoutPrimary, { kind: 'anomaly', anomalyId: 'duty:duty-a:no-executor' }, { positionId: 'pos-b', column: 'primary-execute' }, { planItemId: 'plan-anomaly', newRelationId: 'rel-new' })).toMatchObject({ kind: 'no-executor', resolution: { kind: 'set-primary', targetPositionId: 'pos-b' } })
    expect(evaluateDutyDrop(stateWithoutPrimary, [], { kind: 'anomaly', anomalyId: 'duty:duty-a:no-executor' }, { positionId: 'pos-b', column: 'review' })).toMatchObject({ kind: 'reject', code: 'RELATION_TYPE_MISMATCH' })
  })
})
