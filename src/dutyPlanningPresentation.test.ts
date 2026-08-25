import { describe, expect, it } from 'vitest'
import { buildDutyAnomalyCategories, buildDutyExpandedPositionSections, buildDutyMasterPositionSummaries, buildDutyMasterResponsibilityGroups, buildDutyMatrixRows, getDutyPlanningViewportMode, resolveDutyMasterPositionId, sortDutyMatrixPositions } from './dutyPlanningPresentation'
import type { OrgDirectoryState } from './types'

const state: OrgDirectoryState = {
  employees: [], departments: [], roles: [], assignments: [], members: [], roleCombinationRiskRules: [], organizationLevels: [], organizationLayout: { mode: 'tree', showLevelGuides: true },
  positions: [{ id: 'pos-a', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: null, title: 'A', status: 'active', allowMultipleAssignees: false }],
  duties: [{ id: 'duty-a', title: '工作', description: null }], dutyPositionRelations: [],
}

describe('duty planning presentation', () => {
  it('sorts matrix positions by department order and then manager-subordinate preorder', () => {
    const departments = [
      { id: 'dept-executive', name: '總經理室', parentId: null },
      { id: 'dept-production', name: '生產部', parentId: null },
      { id: 'dept-sales', name: '營銷部', parentId: null },
    ]
    const positions = [
      { id: 'production-staff-b', roleId: 'role', departmentId: 'dept-production', parentPositionId: 'production-lead', organizationLevelId: 'level-staff', title: '生產人員乙', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'sales-manager', roleId: 'role', departmentId: 'dept-sales', parentPositionId: 'general-manager', organizationLevelId: 'level-manager', title: '營銷部經理', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'production-manager', roleId: 'role', departmentId: 'dept-production', parentPositionId: 'general-manager', organizationLevelId: 'level-manager', title: '生產部經理', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'general-manager', roleId: 'role', departmentId: 'dept-executive', parentPositionId: null, organizationLevelId: 'level-executive', title: '總經理', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'production-lead', roleId: 'role', departmentId: 'dept-production', parentPositionId: 'production-manager', organizationLevelId: 'level-lead', title: '生產主管', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'production-staff-a', roleId: 'role', departmentId: 'dept-production', parentPositionId: 'production-lead', organizationLevelId: 'level-staff', title: '生產人員甲', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'unassigned', roleId: 'role', departmentId: null, parentPositionId: null, organizationLevelId: 'level-staff', title: '未分部門', status: 'active' as const, allowMultipleAssignees: false },
      { id: 'inactive', roleId: 'role', departmentId: 'dept-executive', parentPositionId: null, organizationLevelId: 'level-executive', title: '停用職位', status: 'inactive' as const, allowMultipleAssignees: false },
    ]
    const members = positions.map((position) => ({
      id: position.id,
      order: position.id === 'production-staff-a' ? 0 : position.id === 'production-staff-b' ? 1 : 0,
      childrenAxis: 'horizontal' as const,
    }))
    const levels = [
      { id: 'level-executive', name: '最高主管', order: 0 },
      { id: 'level-manager', name: '部門主管', order: 1 },
      { id: 'level-lead', name: '單位主管', order: 2 },
      { id: 'level-staff', name: '執行人員', order: 3 },
    ]

    expect(sortDutyMatrixPositions(positions, departments, members, levels).map((position) => position.id)).toEqual([
      'general-manager',
      'production-manager',
      'production-lead',
      'production-staff-a',
      'production-staff-b',
      'sales-manager',
      'unassigned',
    ])
  })

  it('keeps nested department groups contiguous in department hierarchy order', () => {
    const departments = [
      { id: 'dept-parent', name: '母部門', parentId: null },
      { id: 'dept-other', name: '其他部門', parentId: null },
      { id: 'dept-child', name: '子部門', parentId: 'dept-parent' },
    ]
    const positions = departments.map((department) => ({
      id: `position-${department.id}`,
      roleId: 'role',
      departmentId: department.id,
      parentPositionId: null,
      organizationLevelId: null,
      title: department.name,
      status: 'active' as const,
      allowMultipleAssignees: false,
    }))
    expect(sortDutyMatrixPositions(positions, departments, [], []).map((position) => position.departmentId)).toEqual([
      'dept-parent',
      'dept-child',
      'dept-other',
    ])
  })

  it('uses the requested viewport boundary', () => {
    expect(getDutyPlanningViewportMode(1440)).toBe('wide')
    expect(getDutyPlanningViewportMode(1279)).toBe('medium')
    expect(getDutyPlanningViewportMode(1023)).toBe('narrow')
  })

  it('groups review and countersign into one visible review column while retaining the exact relation type', () => {
    const relationState: OrgDirectoryState = {
      ...state,
      dutyPositionRelations: [
        { id: 'rel-review', dutyId: 'duty-a', relationType: 'review', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
        { id: 'rel-countersign', dutyId: 'duty-a', relationType: 'countersign', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
      ],
    }
    const rows = buildDutyMatrixRows(relationState, relationState.positions)
    expect(rows.map((row) => [row.relationType, row.matrixColumn])).toEqual([
      ['review', 'review'],
      ['countersign', 'review'],
    ])
  })

  it('projects master-detail summaries and groups without losing exact lanes', () => {
    const relationState: OrgDirectoryState = {
      ...state,
      positions: [
        state.positions[0],
        { ...state.positions[0], id: 'pos-b', title: 'B' },
      ],
      duties: [
        { id: 'duty-a', title: '長執掌', description: '年度產能計畫' },
        { id: 'duty-b', title: '採購協作', description: '物料' },
      ],
      dutyPositionRelations: [
        { id: 'rel-primary', dutyId: 'duty-a', relationType: 'execute', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: true, order: 0 },
        { id: 'rel-review', dutyId: 'duty-a', relationType: 'review', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
        { id: 'rel-countersign', dutyId: 'duty-a', relationType: 'countersign', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
        { id: 'rel-collaborate', dutyId: 'duty-b', relationType: 'collaborate', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
      ],
    }
    const summaries = buildDutyMasterPositionSummaries(relationState, relationState.positions, { dutyQuery: '', positionQuery: '', departmentId: '' })
    expect(summaries.map((summary) => [summary.position.id, summary.counts, summary.total])).toEqual([
      ['pos-a', { execute: 1, review: 2, collaborate: 1 }, 4],
      ['pos-b', { execute: 0, review: 0, collaborate: 0 }, 0],
    ])
    expect(buildDutyMasterResponsibilityGroups(relationState, 'pos-a', '', 'all').map((group) => [group.id, group.rows.map((row) => row.relationType)])).toEqual([
      ['execute', ['execute']],
      ['review', ['review', 'countersign']],
      ['collaborate', ['collaborate']],
    ])
    expect(buildDutyMasterResponsibilityGroups(relationState, 'pos-a', '物料', 'all').map((group) => group.rows.length)).toEqual([0, 0, 1])
    expect(resolveDutyMasterPositionId(summaries, 'missing', 'pos-b')).toBe('pos-b')
    expect(resolveDutyMasterPositionId(summaries, 'pos-a', 'missing')).toBe('pos-a')
    expect(resolveDutyMasterPositionId([], 'pos-a', null)).toBeNull()
  })

  it('keeps every filtered position as a target while omitting empty responsibility groups', () => {
    const relationState: OrgDirectoryState = {
      ...state,
      departments: [{ id: 'dept-a', name: '部門A', parentId: null }],
      positions: [
        { ...state.positions[0], id: 'pos-a', title: '職位A', departmentId: 'dept-a' },
        { ...state.positions[0], id: 'pos-b', title: '職位B', departmentId: 'dept-a' },
      ],
      duties: [
        { id: 'duty-a', title: '年度計畫', description: '產能' },
        { id: 'duty-b', title: '物料協調', description: '採購' },
      ],
      dutyPositionRelations: [
        { id: 'rel-execute', dutyId: 'duty-a', relationType: 'execute', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: true, order: 0 },
        { id: 'rel-collaborate', dutyId: 'duty-b', relationType: 'collaborate', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
      ],
    }
    const positions = sortDutyMatrixPositions(relationState.positions, relationState.departments, [], [])
    const sections = buildDutyExpandedPositionSections(relationState, positions, { dutyQuery: '', positionQuery: '', departmentId: '' })
    expect(sections.map((section) => section.position.id)).toEqual(['pos-a', 'pos-b'])
    expect(sections[0].groups.map((group) => group.id)).toEqual(['execute', 'collaborate'])
    expect(sections[1].groups).toEqual([])
    expect(sections[1].hasAnyRelation).toBe(false)
    const filtered = buildDutyExpandedPositionSections(relationState, positions, { dutyQuery: '採購', positionQuery: '', departmentId: '' })
    expect(filtered.map((section) => [section.position.id, section.hasAnyRelation, section.hasVisibleRelation])).toEqual([
      ['pos-a', true, true],
      ['pos-b', false, false],
    ])
  })

  it('groups anomaly sources by category without repeating the category label in each item', () => {
    const anomalyState: OrgDirectoryState = {
      ...state,
      positions: [
        state.positions[0],
        { ...state.positions[0], id: 'pos-b', title: '職位B' },
      ],
      duties: [
        { id: 'duty-no-executor', title: '無執行職掌', description: null },
        { id: 'duty-missing-primary', title: '缺主執行職掌', description: null },
        { id: 'duty-pending', title: '待重新分配職掌', description: null },
      ],
      dutyPositionRelations: [
        { id: 'rel-missing', dutyId: 'duty-missing-primary', relationType: 'execute', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: false, order: 0 },
        { id: 'rel-pending-primary', dutyId: 'duty-pending', relationType: 'execute', target: { kind: 'position', positionId: 'pos-a' }, isPrimaryExecutor: true, order: 0 },
        { id: 'rel-pending', dutyId: 'duty-pending', relationType: 'review', target: { kind: 'pending-reassignment', formerPositionId: 'former', formerPositionTitle: '原職位', formerDepartmentId: null, formerDepartmentName: null }, isPrimaryExecutor: false, order: 0 },
      ],
    }
    const categories = buildDutyAnomalyCategories(anomalyState)
    expect(categories.map((category) => category.id)).toEqual(['no-executor', 'missing-primary-executor', 'pending-reassignment'])
    expect(categories.map((category) => category.items[0].duty.title)).toEqual(['無執行職掌', '缺主執行職掌', '待重新分配職掌'])
    expect(categories[2].items[0].context).toBe('原職位：原職位')
    expect(categories.every((category) => category.items.every((item) => !item.context?.includes(category.label)))).toBe(true)
  })

})
