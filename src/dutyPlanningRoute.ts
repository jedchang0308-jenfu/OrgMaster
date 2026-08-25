export const DUTY_PLANNING_PATH = '/duty-planning'
export const DUTY_MATRIX_PATH = `${DUTY_PLANNING_PATH}/matrix`
export const DUTY_ANOMALIES_PATH = `${DUTY_PLANNING_PATH}/anomalies`

export type DutyPlanningSurface = 'workbench' | 'matrix' | 'anomalies'

export interface DutyPlanningLocation {
  isDutyPlanningPage: boolean
  surface: DutyPlanningSurface | null
  focusPositionId: string | null
}

const pathBySurface: Record<DutyPlanningSurface, string> = {
  workbench: DUTY_PLANNING_PATH,
  matrix: DUTY_MATRIX_PATH,
  anomalies: DUTY_ANOMALIES_PATH,
}

function surfaceForPath(pathname: string): DutyPlanningSurface | null {
  if (pathname === DUTY_PLANNING_PATH) return 'workbench'
  if (pathname === DUTY_MATRIX_PATH) return 'matrix'
  if (pathname === DUTY_ANOMALIES_PATH) return 'anomalies'
  return null
}

export function readDutyPlanningLocation(location: Pick<Location, 'pathname' | 'search'>): DutyPlanningLocation {
  const surface = surfaceForPath(location.pathname)
  if (!surface) return { isDutyPlanningPage: false, surface: null, focusPositionId: null }
  const focusPositionId = new URLSearchParams(location.search).get('position')
  return { isDutyPlanningPage: true, surface, focusPositionId: focusPositionId || null }
}

export function buildDutyPlanningUrl(input: { surface?: DutyPlanningSurface; focusPositionId?: string | null } = {}) {
  const path = pathBySurface[input.surface ?? 'workbench']
  if (!input.focusPositionId) return path
  const params = new URLSearchParams({ position: input.focusPositionId })
  return `${path}?${params.toString()}`
}
