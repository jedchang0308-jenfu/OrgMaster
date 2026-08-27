import { DUTY_ANOMALIES_PATH, DUTY_MATRIX_PATH, DUTY_PLANNING_PATH, type DutyPlanningSurface } from './dutyPlanningRoute'
import type { OrgDirectoryState } from './types'

export const DUTY_CONFIGURATION_MODE = 'duty-config'
export type DutyConfigurationExactLane = 'primary-execute' | 'collaborate' | 'review' | 'countersign'

export interface DutyConfigurationLocation {
  active: boolean
  attentionOnly: boolean
  dutyId: string | null
  lane: DutyConfigurationExactLane | null
  focusPositionId: string | null
  sourceRelationId: string | null
  legacySurface: DutyPlanningSurface | null
}

const exactLanes = new Set<DutyConfigurationExactLane>(['primary-execute', 'collaborate', 'review', 'countersign'])

const legacyLaneAliases: Record<string, DutyConfigurationExactLane> = {
  'other-execute': 'collaborate',
}

function legacySurface(pathname: string): DutyPlanningSurface | null {
  if (pathname === DUTY_PLANNING_PATH) return 'workbench'
  if (pathname === DUTY_MATRIX_PATH) return 'matrix'
  if (pathname === DUTY_ANOMALIES_PATH) return 'anomalies'
  return null
}

export function readDutyConfigurationLocation(location: Pick<Location, 'pathname' | 'search'>): DutyConfigurationLocation {
  const legacy = legacySurface(location.pathname)
  const params = new URLSearchParams(location.search)
  const active = location.pathname === '/' && params.get('mode') === DUTY_CONFIGURATION_MODE
  if (!active) return { active: false, attentionOnly: false, dutyId: null, lane: null, focusPositionId: null, sourceRelationId: null, legacySurface: legacy }
  const rawLane = params.get('lane')
  const normalizedLane = rawLane ? legacyLaneAliases[rawLane] ?? rawLane : null
  return {
    active: true,
    attentionOnly: params.get('attention') === '1',
    dutyId: params.get('duty') || null,
    lane: normalizedLane && exactLanes.has(normalizedLane as DutyConfigurationExactLane) ? normalizedLane as DutyConfigurationExactLane : null,
    focusPositionId: params.get('position') || null,
    sourceRelationId: params.get('sourceRelation') || null,
    legacySurface: null,
  }
}

export function buildDutyConfigurationUrl(input: {
  attentionOnly?: boolean
  dutyId?: string | null
  lane?: DutyConfigurationExactLane | null
  focusPositionId?: string | null
  sourceRelationId?: string | null
} = {}): string {
  const params = new URLSearchParams({ mode: DUTY_CONFIGURATION_MODE })
  if (input.attentionOnly) params.set('attention', '1')
  if (input.dutyId) params.set('duty', input.dutyId)
  if (input.lane) params.set('lane', input.lane)
  if (input.focusPositionId) params.set('position', input.focusPositionId)
  if (input.sourceRelationId) params.set('sourceRelation', input.sourceRelationId)
  return `/?${params.toString()}`
}

export function normalizeDutyConfigurationLocation(location: DutyConfigurationLocation, state: OrgDirectoryState): { location: DutyConfigurationLocation; replaceUrl: string | null } {
  if (!location.active) return { location, replaceUrl: null }
  const dutyExists = location.dutyId ? state.duties.some((duty) => duty.id === location.dutyId) : false
  const source = location.sourceRelationId ? state.dutyPositionRelations.find((relation) => relation.id === location.sourceRelationId) : undefined
  const sourceValid = Boolean(source && source.target.kind === 'pending-reassignment' && (!location.dutyId || source.dutyId === location.dutyId))
  const next: DutyConfigurationLocation = {
    ...location,
    dutyId: dutyExists ? location.dutyId : null,
    lane: dutyExists && location.lane ? location.lane : null,
    focusPositionId: state.positions.some((position) => position.id === location.focusPositionId && position.status === 'active') ? location.focusPositionId : null,
    sourceRelationId: sourceValid ? location.sourceRelationId : null,
  }
  const replaceUrl = JSON.stringify(next) === JSON.stringify(location)
    ? null
    : buildDutyConfigurationUrl(next)
  return { location: next, replaceUrl }
}
