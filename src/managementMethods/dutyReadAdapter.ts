import type { Duty, DutyPositionRelation, OrgDirectoryState, PositionView } from '../types'

export interface DutyReadRow { dutyId: string; title: string; description: string; relationType: string; positionId: string; positionTitle: string; departmentName: string }
export function buildDutyReadRows(state: Pick<OrgDirectoryState, 'duties' | 'dutyPositionRelations' | 'positions' | 'departments'>, query = ''): DutyReadRow[] {
  const normalized = query.trim().toLocaleLowerCase()
  const positionMap = new Map(state.positions.map((position) => [position.id, position]))
  const departmentMap = new Map(state.departments.map((department) => [department.id, department.name]))
  return state.dutyPositionRelations.flatMap((relation: DutyPositionRelation) => {
    if (relation.target.kind !== 'position') return []
    const duty = state.duties.find((item: Duty) => item.id === relation.dutyId)
    const position = positionMap.get(relation.target.positionId)
    if (!duty || !position) return []
    const row = { dutyId: duty.id, title: duty.title, description: duty.description ?? '', relationType: relation.relationType, positionId: position.id, positionTitle: position.title, departmentName: position.departmentId ? departmentMap.get(position.departmentId) ?? '' : '' }
    const haystack = `${row.title} ${row.description} ${row.positionTitle} ${row.departmentName}`.toLocaleLowerCase()
    return !normalized || haystack.includes(normalized) ? [row] : []
  })
}
