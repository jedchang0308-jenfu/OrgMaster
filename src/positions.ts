import type { OrgMember, Position } from './types'

export function duplicatePosition(
  members: OrgMember[],
  positions: Position[],
  sourceId: string,
  newId: string,
) {
  const sourceMember = members.find((member) => member.id === sourceId)
  const sourcePosition = positions.find((position) => position.id === sourceId)
  if (!sourceMember || !sourcePosition || sourcePosition.status !== 'active') return { members, positions }
  if (members.some((member) => member.id === newId) || positions.some((position) => position.id === newId)) {
    return { members, positions }
  }

  const positionById = new Map(positions.map((position) => [position.id, position]))
  const shifted = members.map((member) => (
    member.order > sourceMember.order
      && member.id !== sourceId
      && positionById.get(member.id)?.parentPositionId === sourcePosition.parentPositionId
      ? { ...member, order: member.order + 1 }
      : member
  ))

  return {
    members: [
      ...shifted,
      {
        ...sourceMember,
        id: newId,
        order: sourceMember.order + 1,
        collapsed: false,
      },
    ],
    positions: [
      ...positions,
      { ...sourcePosition, id: newId },
    ],
  }
}
