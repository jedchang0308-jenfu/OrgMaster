import { getDepartmentLabel } from './organization'
import type { Department, OrganizationLevel, PositionView } from './types'

export interface DepartmentLevelGroup<T> {
  key: string
  departmentId: string | null
  departmentLabel: string
  levelId: string | null
  levelLabel: string
  label: string
  items: T[]
}

export function groupByDepartmentAndLevel<T>(
  items: T[],
  departments: Department[],
  organizationLevels: OrganizationLevel[],
  getPosition: (item: T) => Pick<PositionView, 'departmentId' | 'organizationLevelId'>,
): DepartmentLevelGroup<T>[] {
  const departmentOrder = new Map(departments.map((department, index) => [department.id, index]))
  const levelOrder = new Map(
    [...organizationLevels]
      .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))
      .map((level, index) => [level.id, index]),
  )
  const departmentById = new Map(departments.map((department) => [department.id, department]))
  const levelById = new Map(organizationLevels.map((level) => [level.id, level]))
  const groups = new Map<string, DepartmentLevelGroup<T> & { departmentIndex: number; levelIndex: number }>()

  for (const item of items) {
    const position = getPosition(item)
    const departmentId = position.departmentId ?? null
    const levelId = position.organizationLevelId ?? null
    const key = `${departmentId ?? 'unassigned-department'}:${levelId ?? 'unassigned-level'}`
    const department = departmentId ? departmentById.get(departmentId) : undefined
    const level = levelId ? levelById.get(levelId) : undefined
    const departmentLabel = department ? getDepartmentLabel(departments, department.id) : '未設定部門'
    const levelLabel = level ? `L${level.order + 1} ${level.name}` : '未設定階級'
    const group = groups.get(key) ?? {
      key,
      departmentId,
      departmentLabel,
      levelId,
      levelLabel,
      label: `${departmentLabel} · ${levelLabel}`,
      items: [],
      departmentIndex: departmentId ? departmentOrder.get(departmentId) ?? departments.length : departments.length,
      levelIndex: levelId ? levelOrder.get(levelId) ?? organizationLevels.length : organizationLevels.length,
    }
    group.items.push(item)
    groups.set(key, group)
  }

  return [...groups.values()]
    .sort((first, second) => (
      first.departmentIndex - second.departmentIndex
      || first.levelIndex - second.levelIndex
      || first.key.localeCompare(second.key)
    ))
    .map(({ departmentIndex: _departmentIndex, levelIndex: _levelIndex, ...group }) => group)
}
