import { describe, expect, it } from 'vitest'
import { groupByDepartmentAndLevel } from './positionGrouping'
import type { Department, OrganizationLevel, PositionView } from './types'

const departments: Department[] = [
  { id: 'marketing', name: '營銷部', parentId: null },
  { id: 'production', name: '生產部', parentId: null },
]

const organizationLevels: OrganizationLevel[] = [
  { id: 'team', name: '單位／組級主管層', order: 2 },
  { id: 'department', name: '部門主管層', order: 1 },
]

const position = (id: string, departmentId: string | null, organizationLevelId: string | null): Pick<PositionView, 'departmentId' | 'organizationLevelId'> & { id: string } => ({
  id,
  departmentId,
  organizationLevelId,
})

describe('groupByDepartmentAndLevel', () => {
  it('sorts position items by department and then organization level while preserving item order', () => {
    const items = [
      position('production-team', 'production', 'team'),
      position('marketing-department', 'marketing', 'department'),
      position('marketing-team', 'marketing', 'team'),
    ]

    const groups = groupByDepartmentAndLevel(items, departments, organizationLevels, (item) => item)

    expect(groups.map((group) => group.label)).toEqual([
      '營銷部 · L2 部門主管層',
      '營銷部 · L3 單位／組級主管層',
      '生產部 · L3 單位／組級主管層',
    ])
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['marketing-department'],
      ['marketing-team'],
      ['production-team'],
    ])
  })

  it('puts missing department and level after configured groups', () => {
    const items = [
      position('missing', null, null),
      position('configured', 'marketing', 'department'),
    ]

    const groups = groupByDepartmentAndLevel(items, departments, organizationLevels, (item) => item)

    expect(groups.map((group) => group.label)).toEqual([
      '營銷部 · L2 部門主管層',
      '未設定部門 · 未設定階級',
    ])
  })
})
