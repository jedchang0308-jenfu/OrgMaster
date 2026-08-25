import { describe, expect, it } from 'vitest'
import { initialAssignments, initialDepartments, initialEmployees, initialMembers, initialOrganizationLevels, initialPositions, initialRoles } from './data'
import { findDropCandidate, getDropCandidateDistance } from './drag'
import { layoutOrganization, ORG_NODE_HEIGHT, ORG_NODE_WIDTH } from './layout'
import { buildHierarchyNodes } from './organizationHierarchy'
import type { HierarchyNode } from './types'

const hierarchy = buildHierarchyNodes({ employees: initialEmployees, departments: initialDepartments, roles: initialRoles, positions: initialPositions, assignments: initialAssignments, members: initialMembers, roleCombinationRiskRules: [], organizationLevels: initialOrganizationLevels, organizationLayout: { mode: 'tree', showLevelGuides: true }, duties: [], dutyPositionRelations: [] })

function nodesFromLayout(members = hierarchy) {
  const layout = layoutOrganization(members)
  return members
    .filter((member) => layout.visibleIds.has(member.id))
    .map((member) => ({ id: member.id, position: layout.positions[member.id] }))
}

describe('drop candidate slots', () => {
  it('uses the center zone for a child candidate', () => {
    const layout = layoutOrganization(hierarchy)
    const product = layout.positions.product
    const candidate = findDropCandidate(
      { x: product.x + ORG_NODE_WIDTH / 2, y: product.y + ORG_NODE_HEIGHT / 2 },
      'hr',
      nodesFromLayout(),
      hierarchy,
    )

    expect(candidate?.candidate).toEqual({ type: 'child', targetId: 'product' })
  })

  it('uses the gap between down siblings as an insertion slot', () => {
    const layout = layoutOrganization(hierarchy)
    const operations = layout.positions.operations
    const product = layout.positions.product
    const gapX = (operations.x + ORG_NODE_WIDTH + product.x) / 2
    const gapY = operations.y + ORG_NODE_HEIGHT / 2
    const candidate = findDropCandidate(
      { x: gapX, y: gapY },
      'hr',
      nodesFromLayout(),
      hierarchy,
    )

    expect(candidate?.candidate).toEqual({ type: 'sibling', parentId: 'ceo', insertIndex: 1 })
  })

  it('uses the gap between right-oriented siblings as an insertion slot', () => {
    const layout = layoutOrganization(hierarchy)
    const hr = layout.positions.hr
    const admin = layout.positions.admin
    const gapX = hr.x + ORG_NODE_WIDTH / 2
    const gapY = (hr.y + ORG_NODE_HEIGHT + admin.y) / 2
    const candidate = findDropCandidate(
      { x: gapX, y: gapY },
      'engineering',
      nodesFromLayout(),
      hierarchy,
    )

    expect(candidate?.candidate).toEqual({ type: 'sibling', parentId: 'operations', insertIndex: 1 })
  })

  it('keeps the sibling slot stable after the rendered node order changes for preview', () => {
    const members: HierarchyNode[] = [
      { id: 'parent', order: 0, childrenAxis: 'horizontal', parentId: null, organizationLevelId: null, departmentId: null, title: 'Parent' },
      { id: 'first', order: 0, childrenAxis: 'horizontal', parentId: 'parent', organizationLevelId: null, departmentId: 'department-a', title: 'First' },
      { id: 'middle', order: 1, childrenAxis: 'horizontal', parentId: 'parent', organizationLevelId: null, departmentId: 'department-c', title: 'Middle' },
      { id: 'third', order: 2, childrenAxis: 'horizontal', parentId: 'parent', organizationLevelId: null, departmentId: 'department-b', title: 'Third' },
    ]
    const nodes = [
      { id: 'parent', position: { x: 263, y: 0 } },
      { id: 'first', position: { x: 211, y: 120 } },
      { id: 'third', position: { x: 420, y: 120 } },
      { id: 'middle', position: { x: 574, y: 120 } },
    ]

    const point = { x: 368.5, y: 149.213 }
    const candidate = findDropCandidate(
      point,
      'middle',
      nodes,
      members,
    )

    expect(getDropCandidateDistance(point, { type: 'sibling', parentId: 'parent', insertIndex: 1 }, 'middle', nodes, members)).toBe(0)
    expect(candidate?.candidate).toEqual({ type: 'sibling', parentId: 'parent', insertIndex: 1 })
  })
})
