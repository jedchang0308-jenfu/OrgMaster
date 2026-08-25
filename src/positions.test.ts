import { describe, expect, it } from 'vitest'
import { duplicatePosition } from './positions'
import type { OrgMember, Position } from './types'

const members: OrgMember[] = [
  { id: 'root', order: 0, childrenAxis: 'horizontal' },
  { id: 'first', order: 0, childrenAxis: 'vertical', collapsed: true },
  { id: 'second', order: 1, childrenAxis: 'horizontal' },
  { id: 'child', order: 0, childrenAxis: 'horizontal' },
]

const parentById: Record<string, string | null> = { root: null, first: 'root', second: 'root', child: 'first' }
const positions: Position[] = members.map((member) => ({
  id: member.id,
  roleId: `role-${member.id}`,
  departmentId: 'department-design',
  parentPositionId: parentById[member.id],
  organizationLevelId: null,
  title: `職位 ${member.id}`,
  status: 'active',
  allowMultipleAssignees: false,
}))

describe('duplicatePosition', () => {
  it('creates an unassigned single-position copy directly after the source', () => {
    const result = duplicatePosition(members, positions, 'first', 'copy')
    const copy = result.members.find((member) => member.id === 'copy')

    expect(copy).toEqual({
      ...members[1],
      id: 'copy',
      order: 1,
      collapsed: false,
    })
    expect(result.members.find((member) => member.id === 'second')?.order).toBe(2)
    expect(result.positions.filter((position) => position.parentPositionId === 'copy')).toHaveLength(0)
    expect(result.positions.find((position) => position.id === 'copy')).toMatchObject({
      title: '職位 first',
      departmentId: 'department-design',
      status: 'active',
    })
  })

  it('does not modify data when the source is missing or the new id already exists', () => {
    expect(duplicatePosition(members, positions, 'missing', 'copy')).toEqual({ members, positions })
    expect(duplicatePosition(members, positions, 'first', 'second')).toEqual({ members, positions })
  })
})
