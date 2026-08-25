import { describe, expect, it } from 'vitest'
import { buildDepartmentGroups } from './departmentGroups'
import { DEPARTMENT_FRAME_GAP, layoutOrganization } from './layout'
import type { Department, HierarchyNode } from './types'

const departments: Department[] = [
  { id: 'dept-a', name: 'A 部門', parentId: null },
  { id: 'dept-b', name: 'B 部門', parentId: null },
]

function expectFramesSeparated(groups: ReturnType<typeof buildDepartmentGroups>) {
  for (let firstIndex = 0; firstIndex < groups.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1) {
      const first = groups[firstIndex].bounds
      const second = groups[secondIndex].bounds
      const separated = first.x + first.width + DEPARTMENT_FRAME_GAP <= second.x
        || second.x + second.width + DEPARTMENT_FRAME_GAP <= first.x
        || first.y + first.height + DEPARTMENT_FRAME_GAP <= second.y
        || second.y + second.height + DEPARTMENT_FRAME_GAP <= first.y
      expect(separated, `${groups[firstIndex].departmentId} overlaps ${groups[secondIndex].departmentId}`).toBe(true)
    }
  }
}

const nodes: HierarchyNode[] = [
  { id: 'a-root', parentId: null, organizationLevelId: null, departmentId: 'dept-a', title: 'A 根', order: 0, childrenAxis: 'horizontal' },
  { id: 'a-child', parentId: 'a-root', organizationLevelId: null, departmentId: 'dept-a', title: 'A 子', order: 0, childrenAxis: 'horizontal' },
  { id: 'b-root', parentId: null, organizationLevelId: null, departmentId: 'dept-b', title: 'B 根', order: 1, childrenAxis: 'horizontal' },
]

describe('department group derivation', () => {
  it('creates one stable frame per visible non-empty department with an anchor', () => {
    const layout = layoutOrganization(nodes)
    const groups = buildDepartmentGroups({ nodes, layout, departments })
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      departmentId: 'dept-a', label: 'A 部門', anchorPositionId: 'a-root', paletteIndex: 3,
    })
    expect(groups[0].visiblePositionIds).toEqual(['a-root', 'a-child'])
    expect(groups[0].bounds.width).toBeGreaterThan(0)
    expectFramesSeparated(groups)
  })

  it('excludes unassigned departments and follows collapse visibility', () => {
    const collapsed = nodes.map((node) => node.id === 'a-root' ? { ...node, collapsed: true } : node)
    const groups = buildDepartmentGroups({ nodes: collapsed, layout: layoutOrganization(collapsed), departments })
    expect(groups.find((group) => group.departmentId === 'dept-a')?.visiblePositionIds).toEqual(['a-root'])
  })

  it('keeps one full, separated frame for every department in a dense mixed tree', () => {
    const denseDepartments: Department[] = Array.from({ length: 8 }, (_, index) => ({
      id: `dept-${index}`,
      name: `部門 ${index}`,
      parentId: null,
    }))
    const crowded: HierarchyNode[] = [
      { id: 'ceo', parentId: null, organizationLevelId: null, departmentId: 'dept-0', title: '總經理', order: 0, childrenAxis: 'horizontal' },
      { id: 'production', parentId: 'ceo', organizationLevelId: null, departmentId: 'dept-1', title: '生產部經理', order: 0, childrenAxis: 'vertical' },
      { id: 'sales', parentId: 'ceo', organizationLevelId: null, departmentId: 'dept-2', title: '營銷部經理', order: 1, childrenAxis: 'horizontal' },
      { id: 'operations', parentId: 'ceo', organizationLevelId: null, departmentId: 'dept-3', title: '管理部經理', order: 2, childrenAxis: 'vertical' },
      { id: 'rd', parentId: 'ceo', organizationLevelId: null, departmentId: 'dept-4', title: '研發部經理', order: 3, childrenAxis: 'horizontal' },
      { id: 'finance', parentId: 'ceo', organizationLevelId: null, departmentId: 'dept-5', title: '財務部經理', order: 4, childrenAxis: 'horizontal' },
      { id: 'hr', parentId: 'operations', organizationLevelId: null, departmentId: 'dept-6', title: '人資經理', order: 0, childrenAxis: 'horizontal' },
      { id: 'admin', parentId: 'operations', organizationLevelId: null, departmentId: 'dept-7', title: '行政經理', order: 1, childrenAxis: 'horizontal' },
    ]
    const groups = buildDepartmentGroups({ nodes: crowded, layout: layoutOrganization(crowded), departments: denseDepartments })
    expect(groups).toHaveLength(denseDepartments.length)
    expectFramesSeparated(groups)
    expect(groups.every((group) => group.bounds.width > 0 && group.bounds.height > 0)).toBe(true)
  })

  it('returns stable order and palette for identical inputs', () => {
    const layout = layoutOrganization(nodes)
    const first = buildDepartmentGroups({ nodes, layout, departments })
    const second = buildDepartmentGroups({ nodes, layout, departments })
    expect(second).toEqual(first)
  })
})
