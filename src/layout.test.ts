import { describe, expect, it } from 'vitest'
import { initialAssignments, initialDepartments, initialEmployees, initialMembers, initialOrganizationLevels, initialPositions, initialRoles } from './data'
import { buildHierarchyNodes } from './organizationHierarchy'
import { createDefaultOrganizationLevels } from './organizationLevels'
import type { HierarchyNode } from './types'
import {
  layoutOrganization,
  DEPARTMENT_VERTICAL_GAP,
  LEVEL_GAP,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  ORGANIZATION_LEVEL_BAND_GAP,
  ORGANIZATION_LEVEL_NODE_GAP,
  SIBLING_GAP,
  VERTICAL_CHILD_OFFSET,
} from './layout'

describe('layoutOrganization', () => {
  const hierarchy = buildHierarchyNodes({ employees: initialEmployees, departments: initialDepartments, roles: initialRoles, positions: initialPositions, assignments: initialAssignments, members: initialMembers, roleCombinationRiskRules: [], organizationLevels: initialOrganizationLevels, organizationLayout: { mode: 'tree', showLevelGuides: true }, duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [] })

  it('uses the requested cross-level and same-level Y spacing', () => {
    expect(ORGANIZATION_LEVEL_BAND_GAP).toBe(30)
    expect(ORGANIZATION_LEVEL_NODE_GAP).toBe(10)
  })

  it('lays out every visible member without overlapping cards', () => {
    const result = layoutOrganization(hierarchy)
    const points = Object.entries(result.positions)

    expect(points).toHaveLength(hierarchy.length)

    for (let i = 0; i < points.length; i += 1) {
      const [firstId, first] = points[i]
      for (let j = i + 1; j < points.length; j += 1) {
        const [secondId, second] = points[j]
        const overlaps = !(
          first.x + ORG_NODE_WIDTH <= second.x
          || second.x + ORG_NODE_WIDTH <= first.x
          || first.y + ORG_NODE_HEIGHT <= second.y
          || second.y + ORG_NODE_HEIGHT <= first.y
        )

        expect(overlaps, `${firstId} overlaps ${secondId}`).toBe(false)
      }
    }
  })

  it('keeps horizontal children below and vertical children in a compact stack', () => {
    const result = layoutOrganization(hierarchy)
    const ceo = result.positions.ceo
    const product = result.positions.product
    const operations = result.positions.operations
    const hr = result.positions.hr

    expect(product.y).toBeGreaterThan(ceo.y + ORG_NODE_HEIGHT)
    expect(hr.x).toBe(operations.x + VERTICAL_CHILD_OFFSET)
    expect(hr.x).toBeLessThan(operations.x + ORG_NODE_WIDTH)
    expect(hr.y).toBe(operations.y + ORG_NODE_HEIGHT + DEPARTMENT_VERTICAL_GAP)
  })

  it('keeps unassigned vertical children at the compact spacing', () => {
    const unassignedChildren = hierarchy.map((member) => (
      member.id === 'hr' || member.id === 'admin'
        ? { ...member, departmentId: null }
        : member
    ))
    const result = layoutOrganization(unassignedChildren)
    const operations = result.positions.operations
    const hr = result.positions.hr
    const admin = result.positions.admin

    expect(hr.y).toBe(operations.y + ORG_NODE_HEIGHT + LEVEL_GAP)
    expect(admin.y).toBe(hr.y + ORG_NODE_HEIGHT + SIBLING_GAP)
  })

  it('hides descendants of collapsed members', () => {
    const members = hierarchy.map((member) => (
      member.id === 'product' ? { ...member, collapsed: true } : member
    ))
    const result = layoutOrganization(members)

    expect(result.visibleIds.has('product')).toBe(true)
    expect(result.visibleIds.has('design')).toBe(false)
    expect(result.visibleIds.has('engineering')).toBe(false)
  })

  it('keeps every lower organization band entirely below the higher band', () => {
    const members: HierarchyNode[] = [
      { id: 'executive', parentId: null, organizationLevelId: 'level-executive', departmentId: null, title: '負責人', order: 0, childrenAxis: 'horizontal' },
      { id: 'manager', parentId: 'executive', organizationLevelId: 'level-department', departmentId: null, title: '部門經理', order: 0, childrenAxis: 'horizontal' },
      { id: 'team-lead', parentId: 'manager', organizationLevelId: 'level-team', departmentId: null, title: '組級主管', order: 0, childrenAxis: 'horizontal' },
      { id: 'direct-staff', parentId: 'manager', organizationLevelId: 'level-execution', departmentId: null, title: '直接向經理報告的基層', order: 1, childrenAxis: 'horizontal' },
    ]
    const result = layoutOrganization(members, {}, { mode: 'levels', levels: createDefaultOrganizationLevels() })
    expect(result.levelBands).toHaveLength(4)
    expect(result.positions['direct-staff'].y).toBeGreaterThan(result.positions['team-lead'].y + ORG_NODE_HEIGHT)
    for (let index = 1; index < result.levelBands!.length; index += 1) {
      const previous = result.levelBands![index - 1]
      const current = result.levelBands![index]
      expect(current.y).toBe(previous.y + previous.height + ORGANIZATION_LEVEL_BAND_GAP)
    }
  })

  it('uses compact lanes when same-level nodes overlap on the x axis', () => {
    const members: HierarchyNode[] = [
      { id: 'root', parentId: null, organizationLevelId: 'level-executive', departmentId: null, title: '根', order: 0, childrenAxis: 'vertical' },
      { id: 'first', parentId: 'root', organizationLevelId: 'level-department', departmentId: null, title: '第一', order: 0, childrenAxis: 'horizontal' },
      { id: 'second', parentId: 'root', organizationLevelId: 'level-department', departmentId: null, title: '第二', order: 1, childrenAxis: 'horizontal' },
    ]
    const result = layoutOrganization(members, {}, { mode: 'levels', levels: createDefaultOrganizationLevels() })
    expect(result.positions.first.x).toBe(result.positions.second.x)
    expect(result.positions.second.y).toBeGreaterThanOrEqual(result.positions.first.y + ORG_NODE_HEIGHT + ORGANIZATION_LEVEL_NODE_GAP)
  })

  it('uses the level guide as the shared baseline for same-level branches', () => {
    const members: HierarchyNode[] = [
      { id: 'left-staff', parentId: null, organizationLevelId: 'level-team', departmentId: null, title: '左職員', order: 0, childrenAxis: 'horizontal' },
      { id: 'right-staff', parentId: null, organizationLevelId: 'level-team', departmentId: null, title: '右職員', order: 1, childrenAxis: 'horizontal' },
    ]
    const result = layoutOrganization(members, {}, { mode: 'levels', levels: createDefaultOrganizationLevels() })

    const teamBand = result.levelBands?.find((band) => band.levelId === 'level-team')
    expect(teamBand).toBeDefined()
    expect(result.positions['left-staff'].y).toBe(teamBand!.y)
    expect(result.positions['right-staff'].y).toBe(teamBand!.y)
  })

  it('applies fixed tree Y positions without changing the generated X position', () => {
    const members: HierarchyNode[] = [
      { id: 'fixed', parentId: null, organizationLevelId: null, departmentId: null, title: '固定', order: 0, childrenAxis: 'horizontal' },
    ]
    const result = layoutOrganization(members, {}, { mode: 'tree', positionYOverrides: { fixed: 144 } })
    expect(result.positions.fixed).toEqual({ x: 0, y: 144 })
  })

  it('keeps the full levels layout free of card overlap', () => {
    const result = layoutOrganization(hierarchy, {}, { mode: 'levels', levels: createDefaultOrganizationLevels() })
    const points = Object.entries(result.positions)

    for (let i = 0; i < points.length; i += 1) {
      const [firstId, first] = points[i]
      for (let j = i + 1; j < points.length; j += 1) {
        const [secondId, second] = points[j]
        const overlaps = !(
          first.x + ORG_NODE_WIDTH <= second.x
          || second.x + ORG_NODE_WIDTH <= first.x
          || first.y + ORG_NODE_HEIGHT <= second.y
          || second.y + ORG_NODE_HEIGHT <= first.y
        )

        expect(overlaps, `${firstId} overlaps ${secondId} in levels mode`).toBe(false)
      }
    }
  })
})
