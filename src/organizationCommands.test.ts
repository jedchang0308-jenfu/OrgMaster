import { describe, expect, it } from 'vitest'
import { executeOrganizationCommand } from './organizationCommands'
import type { OrgDirectoryState } from './types'
import { createDefaultOrganizationLevels } from './organizationLevels'

const state: OrgDirectoryState = {
  employees: [],
  departments: [
    { id: 'dept-a', name: 'A 部門', parentId: null },
    { id: 'dept-b', name: 'B 部門', parentId: null },
    { id: 'dept-c', name: 'C 部門', parentId: null },
  ],
  roles: [{ id: 'role', name: '一般職位' }],
  positions: [
    { id: 'root-a', roleId: 'role', departmentId: 'dept-a', parentPositionId: null, organizationLevelId: null, title: 'A 根', status: 'active', allowMultipleAssignees: false },
    { id: 'child-a', roleId: 'role', departmentId: 'dept-a', parentPositionId: 'root-a', organizationLevelId: null, title: 'A 子', status: 'active', allowMultipleAssignees: false },
    { id: 'root-b', roleId: 'role', departmentId: 'dept-b', parentPositionId: null, organizationLevelId: null, title: 'B 根', status: 'active', allowMultipleAssignees: false },
  ],
  assignments: [],
  roleCombinationRiskRules: [],
  organizationLevels: createDefaultOrganizationLevels(),
  organizationLayout: { mode: 'tree', showLevelGuides: true },
  duties: [],
  dutyPositionRelations: [],
  processes: [],
  processNodes: [],
  processEdges: [],
  processNodeDutyLinks: [],
  members: [
    { id: 'root-a', order: 0, childrenAxis: 'horizontal', collapsed: true },
    { id: 'child-a', order: 0, childrenAxis: 'horizontal' },
    { id: 'root-b', order: 1, childrenAxis: 'horizontal' },
  ],
}

describe('organization commands', () => {
  it('applies a child move atomically and expands the target', () => {
    const result = executeOrganizationCommand(state, {
      type: 'MOVE_POSITION', positionId: 'root-b', parentPositionId: 'root-a', insertIndex: 1,
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.positions.find((position) => position.id === 'root-b')?.parentPositionId).toBe('root-a')
    expect(result.state.members.find((member) => member.id === 'root-a')?.collapsed).toBe(false)
    expect(state.positions.find((position) => position.id === 'root-b')?.parentPositionId).toBeNull()
  })

  it('rejects a move that would split a department without changing the original snapshot', () => {
    const result = executeOrganizationCommand(state, {
      type: 'MOVE_POSITION', positionId: 'child-a', parentPositionId: 'root-b', insertIndex: 0,
    })
    expect(result).toMatchObject({ status: 'rejected', issue: { code: 'DEPARTMENT_DISCONNECTED' } })
    expect(result.state).toBe(state)
    expect(state.positions.find((position) => position.id === 'child-a')?.parentPositionId).toBe('root-a')
  })

  it('adds a position with domain parent and presentation layout in one commit', () => {
    const result = executeOrganizationCommand(state, {
      type: 'ADD_POSITION',
      position: { id: 'new', roleId: 'role', departmentId: 'dept-b', parentPositionId: 'root-b', organizationLevelId: null, title: '新職位' },
      order: 0,
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.positions.find((position) => position.id === 'new')?.parentPositionId).toBe('root-b')
    expect(result.state.members.find((member) => member.id === 'new')).toMatchObject({ order: 0, childrenAxis: 'horizontal' })
  })

  it('adds a new Role atomically when a new position has a new Role definition', () => {
    const result = executeOrganizationCommand(state, {
      type: 'ADD_POSITION',
      position: { id: 'new-role-position', roleId: 'role-new', departmentId: 'dept-b', parentPositionId: 'root-b', organizationLevelId: null, title: '新職務' },
      role: { id: 'role-new', name: '新職務' },
      order: 0,
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.roles).toContainEqual({ id: 'role-new', name: '新職務' })
    expect(result.state.positions.find((position) => position.id === 'new-role-position')?.roleId).toBe('role-new')
  })

  it('keeps parent and department fields independent', () => {
    const result = executeOrganizationCommand(state, { type: 'CHANGE_POSITION_DEPARTMENT', positionId: 'child-a', departmentId: 'dept-c' })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    const position = result.state.positions.find((item) => item.id === 'child-a')!
    expect(position).toMatchObject({ departmentId: 'dept-c', parentPositionId: 'root-a' })
  })

  it('patches layout preference and domain fields through one atomic command', () => {
    const result = executeOrganizationCommand(state, {
      type: 'PATCH_POSITION', positionId: 'child-a', childrenAxis: 'vertical', title: 'A 子新版',
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.members.find((member) => member.id === 'child-a')?.childrenAxis).toBe('vertical')
    expect(result.state.positions.find((position) => position.id === 'child-a')?.title).toBe('A 子新版')
  })

  it('patches a position Role without changing its existing assignments', () => {
    const result = executeOrganizationCommand(state, {
      type: 'PATCH_POSITION', positionId: 'child-a', roleId: 'role-new', role: { id: 'role-new', name: '新職務' },
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.positions.find((position) => position.id === 'child-a')?.roleId).toBe('role-new')
    expect(result.state.assignments).toEqual(state.assignments)
  })

  it('rejects a department replacement that points into its own subtree', () => {
    const nested: OrgDirectoryState = {
      ...state,
      departments: [
        ...state.departments,
        { id: 'dept-a-child', name: 'A 子部門', parentId: 'dept-a' },
      ],
    }
    const result = executeOrganizationCommand(nested, {
      type: 'DELETE_DEPARTMENT', departmentId: 'dept-a', replacementDepartmentId: 'dept-a-child',
    })
    expect(result).toMatchObject({ status: 'rejected', issue: { code: 'INVALID_DEPARTMENT_REPLACEMENT' } })
    expect(result.state).toBe(nested)
  })

  it('keeps position parents unchanged during department delete and allows an explicit remap', () => {
    const cleared = executeOrganizationCommand(state, { type: 'DELETE_DEPARTMENT', departmentId: 'dept-a' })
    expect(cleared.status).toBe('applied')
    if (cleared.status === 'applied') {
      expect(cleared.state.positions.find((position) => position.id === 'child-a')).toMatchObject({ departmentId: null, parentPositionId: 'root-a' })
    }
    const remap = executeOrganizationCommand(state, { type: 'DELETE_DEPARTMENT', departmentId: 'dept-a', replacementDepartmentId: 'dept-b' })
    expect(remap.status).toBe('applied')
    if (remap.status === 'applied') {
      expect(remap.state.positions.find((position) => position.id === 'child-a')).toMatchObject({ departmentId: 'dept-b', parentPositionId: 'root-a' })
      expect(remap.state.departments.some((department) => department.id === 'dept-a')).toBe(false)
    }
  })

  it('reorders siblings and keeps the boundary operation a no-op', () => {
    const result = executeOrganizationCommand(state, { type: 'REORDER_POSITION', positionId: 'child-a', delta: 1 })
    expect(result.status).toBe('noop')
    const first = executeOrganizationCommand(state, { type: 'REORDER_POSITION', positionId: 'root-a', delta: 1 })
    expect(first.status).toBe('applied')
    if (first.status !== 'applied') return
    expect(first.state.members.find((member) => member.id === 'root-a')?.order).toBe(1)
    expect(first.state.members.find((member) => member.id === 'root-b')?.order).toBe(0)
  })

  it('duplicates only the selected position and does not copy assignments or children', () => {
    const withAssignment: OrgDirectoryState = {
      ...state,
      assignments: [{ id: 'assignment-child', employeeId: 'employee-a', positionId: 'child-a', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null }],
    }
    const result = executeOrganizationCommand(withAssignment, { type: 'DUPLICATE_POSITION', sourcePositionId: 'child-a', newPositionId: 'copy' })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.positions.find((position) => position.id === 'copy')).toMatchObject({ parentPositionId: 'root-a', title: 'A 子' })
    expect(result.state.members.find((member) => member.id === 'copy')).toMatchObject({ collapsed: false })
    expect(result.state.assignments).toEqual(withAssignment.assignments)
  })

  it('deletes a branch, removes layout records, closes assignments, and preserves order', () => {
    const withAssignment: OrgDirectoryState = {
      ...state,
      organizationLayout: { ...state.organizationLayout, positionYOverrides: { 'root-a': 144, 'child-a': 288, 'root-b': 432 } },
      assignments: [{ id: 'assignment-child', employeeId: 'employee-a', positionId: 'child-a', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null }],
    }
    const result = executeOrganizationCommand(withAssignment, { type: 'DELETE_POSITION', positionId: 'root-a', mode: 'branch', asOf: '2026-08-12' })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.positions.filter((position) => position.status === 'active').map((position) => position.id)).toEqual(['root-b'])
    expect(result.state.members.map((member) => member.id)).toEqual(['root-b'])
    expect(result.state.assignments[0]?.validTo).toBe('2026-08-12')
    expect(result.state.organizationLayout.positionYOverrides).toEqual({ 'root-b': 432 })
  })

  it('promotes children when legal and rejects a department-disconnecting promotion', () => {
    const legal = executeOrganizationCommand(state, { type: 'DELETE_POSITION', positionId: 'root-a', mode: 'promote', asOf: '2026-08-12' })
    expect(legal.status).toBe('applied')
    if (legal.status === 'applied') expect(legal.state.positions.find((position) => position.id === 'child-a')).toMatchObject({ status: 'active', parentPositionId: null })

    const splitState: OrgDirectoryState = {
      ...state,
      positions: [
        ...state.positions,
        { id: 'a-sibling-child', roleId: 'role', departmentId: 'dept-a', parentPositionId: 'root-a', organizationLevelId: null, title: 'A 另一子', status: 'active', allowMultipleAssignees: false },
      ],
      members: [...state.members, { id: 'a-sibling-child', order: 1, childrenAxis: 'horizontal' }],
    }
    splitState.positions = splitState.positions.map((position) => position.id === 'root-a' ? { ...position, parentPositionId: 'root-b' } : position)
    const split = executeOrganizationCommand(splitState, { type: 'DELETE_POSITION', positionId: 'root-a', mode: 'promote', asOf: '2026-08-12' })
    expect(split.status).toBe('rejected')
    expect(split).toMatchObject({ issue: { code: 'DEPARTMENT_DISCONNECTED' } })
  })

  it('manages the level catalog atomically and blocks deleting a used level', () => {
    const added = executeOrganizationCommand(state, { type: 'ADD_ORGANIZATION_LEVEL', level: { id: 'level-extra', name: '  實習層  ' } })
    expect(added.status).toBe('applied')
    if (added.status !== 'applied') return
    expect(added.state.organizationLevels.at(-1)).toMatchObject({ id: 'level-extra', name: '實習層', order: 4 })
    const renamed = executeOrganizationCommand(added.state, { type: 'RENAME_ORGANIZATION_LEVEL', levelId: 'level-extra', name: '見習層' })
    expect(renamed.status).toBe('applied')
    if (renamed.status !== 'applied') return
    const assigned = {
      ...renamed.state,
      positions: renamed.state.positions.map((position) => position.id === 'root-b' ? { ...position, organizationLevelId: 'level-extra' } : position),
    }
    const rejected = executeOrganizationCommand(assigned, { type: 'DELETE_ORGANIZATION_LEVEL', levelId: 'level-extra' })
    expect(rejected).toMatchObject({ status: 'rejected', issue: { code: 'ORGANIZATION_LEVEL_IN_USE', positionIds: ['root-b'] } })
    expect(rejected.state).toBe(assigned)
  })

  it('previews a complete reorder contract and rejects a sequence that reverses parent levels', () => {
    const assigned = {
      ...state,
      positions: state.positions.map((position) => position.id === 'root-a'
        ? { ...position, organizationLevelId: 'level-executive' }
        : position.id === 'child-a'
          ? { ...position, organizationLevelId: 'level-department' }
          : position),
    }
    const result = executeOrganizationCommand(assigned, {
      type: 'REORDER_ORGANIZATION_LEVELS',
      levelIds: ['level-department', 'level-executive', 'level-team', 'level-execution'],
    })
    expect(result).toMatchObject({ status: 'rejected', issue: { code: 'INVALID_PARENT_LEVEL_ORDER' } })
    expect(result.state).toBe(assigned)
  })

  it('enables level layout only after every active position is assigned', () => {
    expect(executeOrganizationCommand(state, { type: 'SET_ORGANIZATION_LAYOUT', mode: 'levels' }))
      .toMatchObject({ status: 'rejected', issue: { code: 'INCOMPLETE_LEVEL_ASSIGNMENT' } })
    const assigned = {
      ...state,
      positions: state.positions.map((position) => ({
        ...position,
        organizationLevelId: position.parentPositionId ? 'level-department' : 'level-executive',
      })),
    }
    expect(executeOrganizationCommand(assigned, { type: 'SET_ORGANIZATION_LAYOUT', mode: 'levels' }))
      .toMatchObject({ status: 'applied', state: { organizationLayout: { mode: 'levels', showLevelGuides: true } } })
  })

  it('persists and clears a fixed tree Y position without changing hierarchy data', () => {
    const result = executeOrganizationCommand(state, { type: 'SET_POSITION_Y_OVERRIDE', positionId: 'root-a', y: 144 })
    expect(result).toMatchObject({ status: 'applied', state: { organizationLayout: { positionYOverrides: { 'root-a': 144 } } } })
    if (result.status !== 'applied') return
    expect(result.state.positions).toEqual(state.positions)
    expect(result.state.members).toEqual(state.members)

    const cleared = executeOrganizationCommand(result.state, { type: 'SET_POSITION_Y_OVERRIDE', positionId: 'root-a', y: null })
    expect(cleared).toMatchObject({ status: 'applied', state: { organizationLayout: { positionYOverrides: {} } } })
    expect(executeOrganizationCommand(state, { type: 'SET_POSITION_Y_OVERRIDE', positionId: 'root-a', y: -1 }))
      .toMatchObject({ status: 'rejected', issue: { code: 'INVALID_POSITION_Y' } })
  })

  it('preserves a duplicated position level and blocks adding below the lowest level', () => {
    const assigned = {
      ...state,
      positions: state.positions.map((position) => position.id === 'child-a'
        ? { ...position, organizationLevelId: 'level-execution' }
        : position),
    }
    const duplicated = executeOrganizationCommand(assigned, { type: 'DUPLICATE_POSITION', sourcePositionId: 'child-a', newPositionId: 'copy-level' })
    expect(duplicated).toMatchObject({ status: 'applied' })
    if (duplicated.status !== 'applied') return
    expect(duplicated.state.positions.find((position) => position.id === 'copy-level')?.organizationLevelId).toBe('level-execution')
    expect(executeOrganizationCommand(assigned, {
      type: 'ADD_POSITION',
      position: { id: 'below-lowest', roleId: 'role', departmentId: 'dept-a', parentPositionId: 'child-a', organizationLevelId: null, title: '不可新增' },
      order: 0,
    })).toMatchObject({ status: 'rejected', issue: { code: 'NO_LOWER_ORGANIZATION_LEVEL' } })
  })
})
