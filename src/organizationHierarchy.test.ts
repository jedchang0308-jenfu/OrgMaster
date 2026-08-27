import { describe, expect, it } from 'vitest'
import { buildHierarchyNodes, getHierarchyDepth, isHierarchyDescendant, validateOrganizationState } from './organizationHierarchy'
import type { OrgDirectoryState } from './types'
import { createDefaultOrganizationLevels } from './organizationLevels'

const state: OrgDirectoryState = {
  employees: [],
  departments: [
    { id: 'dept-a', name: 'A 部門', parentId: null },
    { id: 'dept-b', name: 'B 部門', parentId: null },
  ],
  roles: [],
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
    { id: 'root-a', order: 0, childrenAxis: 'horizontal' },
    { id: 'child-a', order: 0, childrenAxis: 'horizontal' },
    { id: 'root-b', order: 1, childrenAxis: 'horizontal' },
  ],
}

describe('organization hierarchy adapter and invariants', () => {
  it('derives parentId from Position and exposes depth/descendant helpers', () => {
    const nodes = buildHierarchyNodes(state)
    expect(nodes.find((node) => node.id === 'child-a')?.parentId).toBe('root-a')
    expect(getHierarchyDepth(nodes, 'child-a')).toBe(2)
    expect(isHierarchyDescendant(nodes, 'child-a', 'root-a')).toBe(true)
    expect(isHierarchyDescendant(nodes, 'root-a', 'child-a')).toBe(false)
  })

  it('rejects a department that is split by leaving and re-entering the position tree', () => {
    const proposed: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => position.id === 'child-a'
        ? { ...position, parentPositionId: 'root-b' }
        : position),
    }
    expect(validateOrganizationState(proposed)).toMatchObject({
      ok: false,
      code: 'DEPARTMENT_DISCONNECTED',
      departmentIds: ['dept-a'],
    })
  })

  it('allows multiple roots and unassigned positions', () => {
    const proposed: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => position.id === 'child-a'
        ? { ...position, departmentId: null, parentPositionId: null }
        : position),
      members: [...state.members, { id: 'extra', order: 2, childrenAxis: 'horizontal' }],
      // The extra layout is intentionally removed below; this branch verifies no false cycle assertion.
    }
    proposed.members = proposed.members.filter((member) => member.id !== 'extra')
    expect(validateOrganizationState(proposed)).toEqual({ ok: true })
  })

  it.each([
    ['self parent', (current: OrgDirectoryState) => ({ ...current, positions: current.positions.map((position) => position.id === 'root-a' ? { ...position, parentPositionId: 'root-a' } : position) }), 'SELF_PARENT'],
    ['missing parent', (current: OrgDirectoryState) => ({ ...current, positions: current.positions.map((position) => position.id === 'child-a' ? { ...position, parentPositionId: 'missing' } : position) }), 'MISSING_PARENT'],
    ['unknown department', (current: OrgDirectoryState) => ({ ...current, positions: current.positions.map((position) => position.id === 'root-a' ? { ...position, departmentId: 'missing' } : position) }), 'UNKNOWN_DEPARTMENT'],
  ])('returns a typed invariant code for %s', (_label, makeState, expected) => {
    expect(validateOrganizationState(makeState(state))).toMatchObject({ ok: false, code: expected })
  })

  it('detects a multi-node cycle after parent existence checks', () => {
    const proposed: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => (
        position.id === 'root-a' ? { ...position, parentPositionId: 'child-a' }
          : position.id === 'child-a' ? { ...position, parentPositionId: 'root-a' }
            : position
      )),
    }
    expect(validateOrganizationState(proposed)).toMatchObject({ ok: false, code: 'HIERARCHY_CYCLE' })
  })

  it('detects missing and orphan layout records before rendering', () => {
    expect(validateOrganizationState({ ...state, members: state.members.filter((member) => member.id !== 'child-a') })).toMatchObject({ ok: false, code: 'MISSING_LAYOUT' })
    expect(validateOrganizationState({ ...state, members: [...state.members, { id: 'orphan', order: 0, childrenAxis: 'horizontal' }] })).toMatchObject({ ok: false, code: 'ORPHAN_LAYOUT' })
  })

  it('detects duplicate domain and layout IDs', () => {
    expect(validateOrganizationState({ ...state, positions: [...state.positions, state.positions[0]] })).toMatchObject({ ok: false, code: 'DUPLICATE_POSITION_ID' })
    expect(validateOrganizationState({ ...state, members: [...state.members, state.members[0]] })).toMatchObject({ ok: false, code: 'DUPLICATE_LAYOUT_ID' })
  })

  it('rejects two same-department siblings under a different department', () => {
    const proposed: OrgDirectoryState = {
      ...state,
      positions: [
        ...state.positions,
        { id: 'sibling-a', roleId: 'role', departmentId: 'dept-a', parentPositionId: 'root-b', organizationLevelId: null, title: 'A 另一職位', status: 'active', allowMultipleAssignees: false },
      ],
      members: [...state.members, { id: 'sibling-a', order: 1, childrenAxis: 'horizontal' }],
    }
    expect(validateOrganizationState(proposed)).toMatchObject({ ok: false, code: 'DEPARTMENT_DISCONNECTED', departmentIds: ['dept-a'] })
  })

  it('rejects same-level and reversed parent-child assignments while allowing skipped levels', () => {
    const assigned = {
      ...state,
      positions: state.positions.map((position) => position.id === 'root-a'
        ? { ...position, organizationLevelId: 'level-executive' }
        : position.id === 'child-a'
          ? { ...position, organizationLevelId: 'level-execution' }
          : position),
    }
    expect(validateOrganizationState(assigned)).toEqual({ ok: true })
    expect(validateOrganizationState({
      ...assigned,
      positions: assigned.positions.map((position) => position.id === 'child-a'
        ? { ...position, organizationLevelId: 'level-executive' }
        : position),
    })).toMatchObject({ ok: false, code: 'INVALID_PARENT_LEVEL_ORDER', positionIds: ['root-a', 'child-a'] })
    expect(validateOrganizationState({
      ...assigned,
      positions: assigned.positions.map((position) => position.id === 'root-a'
        ? { ...position, organizationLevelId: 'level-execution' }
        : position.id === 'child-a'
          ? { ...position, organizationLevelId: 'level-department' }
          : position),
    })).toMatchObject({ ok: false, code: 'INVALID_PARENT_LEVEL_ORDER' })
  })

  it('requires every active position to be assigned before level layout is enabled', () => {
    expect(validateOrganizationState({
      ...state,
      organizationLayout: { ...state.organizationLayout, mode: 'levels' },
    })).toMatchObject({ ok: false, code: 'INCOMPLETE_LEVEL_ASSIGNMENT' })
  })

  it('validates level catalog identity, names, and contiguous order', () => {
    expect(validateOrganizationState({
      ...state,
      organizationLevels: [...state.organizationLevels, { ...state.organizationLevels[0] }],
    })).toMatchObject({ ok: false, code: 'DUPLICATE_LEVEL_ID' })
    expect(validateOrganizationState({
      ...state,
      organizationLevels: state.organizationLevels.map((level) => level.order === 3 ? { ...level, order: 9 } : level),
    })).toMatchObject({ ok: false, code: 'INVALID_LEVEL_ORDER' })
    expect(validateOrganizationState({
      ...state,
      organizationLevels: state.organizationLevels.map((level) => level.order === 1 ? { ...level, name: state.organizationLevels[0].name } : level),
    })).toMatchObject({ ok: false, code: 'DUPLICATE_LEVEL_NAME' })
  })
})
