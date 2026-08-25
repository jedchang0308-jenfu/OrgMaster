import type { OrganizationLevel, OrgDirectoryState } from './types'

export const DEFAULT_ORGANIZATION_LEVELS: readonly OrganizationLevel[] = [
  { id: 'level-executive', name: '經營決策層', order: 0 },
  { id: 'level-department', name: '部門主管層', order: 1 },
  { id: 'level-team', name: '單位／組級主管層', order: 2 },
  { id: 'level-execution', name: '執行／專業層', order: 3 },
]

export function createDefaultOrganizationLevels(minimumCount = 4): OrganizationLevel[] {
  const count = Math.max(4, Math.floor(minimumCount))
  return Array.from({ length: count }, (_, index) => {
    const defaultLevel = DEFAULT_ORGANIZATION_LEVELS[index]
    return defaultLevel
      ? { ...defaultLevel }
      : { id: `level-depth-${index + 1}`, name: `第 ${index + 1} 層`, order: index }
  })
}

export function sortOrganizationLevels(levels: OrganizationLevel[]) {
  return [...levels].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))
}

export function getNextOrganizationLevelId(levels: OrganizationLevel[], levelId: string | null) {
  if (!levelId) return null
  const sorted = sortOrganizationLevels(levels)
  const index = sorted.findIndex((level) => level.id === levelId)
  return index >= 0 ? sorted[index + 1]?.id ?? null : null
}

export function getOrganizationLevelProgress(state: Pick<OrgDirectoryState, 'positions'>) {
  const active = state.positions.filter((position) => position.status === 'active')
  const assigned = active.filter((position) => position.organizationLevelId !== null)
  return { assigned: assigned.length, total: active.length, complete: active.length === assigned.length }
}

