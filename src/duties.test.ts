import { describe, expect, it } from 'vitest'
import {
  deriveDutyAnomalies,
  filterAndSortDutyRows,
  invalidateDutyRelationsForPositions,
  normalizeDutyRelationOrders,
  validateDutyState,
} from './duties'
import type { OrgDirectoryState } from './types'

const baseState: OrgDirectoryState = {
  employees: [],
  departments: [{ id: 'dept-a', name: '製造部', parentId: null }],
  roles: [],
  positions: [
    { id: 'pos-a', roleId: 'role', departmentId: 'dept-a', parentPositionId: null, organizationLevelId: null, title: '執行職位', status: 'active', allowMultipleAssignees: false },
    { id: 'pos-inactive', roleId: 'role', departmentId: 'dept-a', parentPositionId: null, organizationLevelId: null, title: '已失效', status: 'inactive', allowMultipleAssignees: false },
  ],
  assignments: [],
  members: [],
  roleCombinationRiskRules: [],
  organizationLevels: [],
  organizationLayout: { mode: 'tree', showLevelGuides: true },
  duties: [{ id: 'duty-a', title: '每日檢查', description: null }],
  dutyPositionRelations: [],
}

describe('duty domain', () => {
  it('derives separate no-executor and missing-primary anomalies', () => {
    expect(deriveDutyAnomalies(baseState)).toEqual([{ id: 'duty:duty-a:no-executor', type: 'no-executor', severity: 'high', dutyId: 'duty-a' }])
    const withExecutor = { ...baseState, dutyPositionRelations: [{ id: 'rel-a', dutyId: 'duty-a', relationType: 'execute' as const, target: { kind: 'position' as const, positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 }] }
    expect(deriveDutyAnomalies(withExecutor)).toEqual([{ id: 'duty:duty-a:missing-primary', type: 'missing-primary-executor', severity: 'medium', dutyId: 'duty-a' }])
  })

  it('preserves one row while filtering by any matching anomaly', () => {
    const state = { ...baseState, dutyPositionRelations: [{ id: 'rel-a', dutyId: 'duty-a', relationType: 'execute' as const, target: { kind: 'pending-reassignment' as const, formerPositionId: 'gone', formerPositionTitle: '舊職位', formerDepartmentId: 'dept-a', formerDepartmentName: '製造部' }, isPrimaryExecutor: true, order: 4 }] }
    const anomalies = deriveDutyAnomalies(state)
    expect(anomalies.map((item) => item.id)).toEqual(['relation:rel-a', 'duty:duty-a:no-executor'])
    const rows = filterAndSortDutyRows(state, anomalies, 'pending-reassignment')
    expect(rows).toHaveLength(1)
    expect(rows[0].anomalies).toHaveLength(2)
    expect(rows[0].matchedAnomalies).toHaveLength(1)
  })

  it('turns deleted position relations into frozen pending snapshots', () => {
    const state = { ...baseState, dutyPositionRelations: [{ id: 'rel-a', dutyId: 'duty-a', relationType: 'review' as const, target: { kind: 'position' as const, positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 }] }
    const next = invalidateDutyRelationsForPositions(state, ['pos-a'])
    expect(next.dutyPositionRelations[0].target).toEqual({ kind: 'pending-reassignment', formerPositionId: 'pos-a', formerPositionTitle: '執行職位', formerDepartmentId: 'dept-a', formerDepartmentName: '製造部' })
  })

  it('rejects duplicate active primary and normalizes dense groups', () => {
    const duplicate = { ...baseState, dutyPositionRelations: [
      { id: 'rel-a', dutyId: 'duty-a', relationType: 'execute' as const, target: { kind: 'position' as const, positionId: 'pos-a' }, isPrimaryExecutor: true, order: 0 },
      { id: 'rel-b', dutyId: 'duty-a', relationType: 'review' as const, target: { kind: 'position' as const, positionId: 'pos-a' }, isPrimaryExecutor: false, order: 4 },
    ] }
    expect(validateDutyState(duplicate).ok).toBe(false)
    const normalized = { ...duplicate, dutyPositionRelations: normalizeDutyRelationOrders(duplicate.dutyPositionRelations) }
    expect(normalized.dutyPositionRelations[1].order).toBe(0)
    expect(validateDutyState(normalized)).toEqual({ ok: true })
    expect(validateDutyState({ ...duplicate, dutyPositionRelations: [...duplicate.dutyPositionRelations, { ...duplicate.dutyPositionRelations[0], id: 'rel-c' }] }).ok).toBe(false)
  })
})
