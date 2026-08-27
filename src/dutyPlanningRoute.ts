export const DUTY_PLANNING_PATH = '/duty-planning'
export const DUTY_MATRIX_PATH = `${DUTY_PLANNING_PATH}/matrix`
export const DUTY_ANOMALIES_PATH = `${DUTY_PLANNING_PATH}/anomalies`

/** Legacy surface names remain exported so DEV-034 configuration aliases keep compiling. */
export type DutyPlanningSurface = 'workbench' | 'matrix' | 'anomalies'
export type DutyPlanningView = 'audit' | 'distribution'
export type DutyPlanningStatusFilter = 'no-executor' | 'missing-primary-executor' | 'pending-reassignment'

export interface DutyPlanningLocation {
  isDutyPlanningPage: boolean
  view: DutyPlanningView | null
  query: string
  anomalyTypes: DutyPlanningStatusFilter[]
}

const statusOrder: DutyPlanningStatusFilter[] = ['no-executor', 'missing-primary-executor', 'pending-reassignment']
const statusSet = new Set<DutyPlanningStatusFilter>(statusOrder)

function viewForPath(pathname: string): DutyPlanningView | null {
  if (pathname === DUTY_ANOMALIES_PATH) return 'audit'
  if (pathname === DUTY_MATRIX_PATH) return 'distribution'
  if (pathname === DUTY_PLANNING_PATH) return 'audit'
  return null
}

function canonicalStatuses(values: string[]): DutyPlanningStatusFilter[] {
  const normalized = values.flatMap((value) => value.split(',')).map((item) => item.trim()).filter((item): item is DutyPlanningStatusFilter => statusSet.has(item as DutyPlanningStatusFilter))
  return statusOrder.filter((status) => normalized.includes(status))
}

export function readDutyPlanningLocation(location: Pick<Location, 'pathname' | 'search'>): DutyPlanningLocation {
  const pathView = viewForPath(location.pathname)
  if (!pathView) return { isDutyPlanningPage: false, view: null, query: '', anomalyTypes: [] }
  const params = new URLSearchParams(location.search)
  const view = location.pathname === DUTY_PLANNING_PATH
    ? params.get('view') === 'distribution' ? 'distribution' : 'audit'
    : pathView
  return {
    isDutyPlanningPage: true,
    view,
    query: params.get('q')?.trim() ?? '',
    anomalyTypes: view === 'audit' ? canonicalStatuses(params.getAll('status')) : [],
  }
}

export function buildDutyPlanningUrl(input: {
  view?: DutyPlanningView
  query?: string
  anomalyTypes?: DutyPlanningStatusFilter[]
  /** Deprecated compatibility input for callers that still use the old surfaces. */
  surface?: DutyPlanningSurface
  focusPositionId?: string | null
} = {}) {
  const view = input.surface === 'matrix' ? 'distribution' : input.surface === 'anomalies' ? 'audit' : input.view ?? 'audit'
  const params = new URLSearchParams()
  params.set('view', view)
  const query = input.query?.trim()
  if (query) params.set('q', query)
  const statuses = statusOrder.filter((status) => input.anomalyTypes?.includes(status))
  if (view === 'audit' && statuses.length > 0) params.set('status', statuses.join(','))
  return `${DUTY_PLANNING_PATH}?${params.toString()}`
}

export function canonicalDutyPlanningLocation(location: DutyPlanningLocation) {
  if (!location.isDutyPlanningPage) return null
  return buildDutyPlanningUrl({ view: location.view ?? 'audit', query: location.query, anomalyTypes: location.anomalyTypes })
}
