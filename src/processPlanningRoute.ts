import type { OrgDirectoryState } from './types'

export const PROCESS_PLANNING_PATH = '/process-planning'
export type ProcessPlanningView = 'mindmap' | 'flow'

export interface ProcessPlanningLocation {
  active: boolean
  view: ProcessPlanningView
  processId: string | null
  processNodeId: string | null
  dutyId: string | null
}

function validView(value: string | null): ProcessPlanningView {
  return value === 'flow' ? 'flow' : 'mindmap'
}

function firstProcess(state: OrgDirectoryState) {
  return [...state.processes].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))[0] ?? null
}

export function readProcessPlanningLocation(location: Pick<Location, 'pathname' | 'search'>): ProcessPlanningLocation {
  if (location.pathname !== PROCESS_PLANNING_PATH) return { active: false, view: 'mindmap', processId: null, processNodeId: null, dutyId: null }
  const params = new URLSearchParams(location.search)
  return {
    active: true,
    view: validView(params.get('view')),
    processId: params.get('process')?.trim() || null,
    processNodeId: params.get('node')?.trim() || null,
    dutyId: params.get('duty')?.trim() || null,
  }
}

export function normalizeProcessPlanningLocation(location: ProcessPlanningLocation, state: OrgDirectoryState): ProcessPlanningLocation {
  if (!location.active) return location
  const process = state.processes.find((candidate) => candidate.id === location.processId) ?? firstProcess(state)
  if (!process) return { active: true, view: location.view, processId: null, processNodeId: null, dutyId: null }
  const node = state.processNodes.find((candidate) => candidate.id === location.processNodeId && candidate.processId === process.id) ?? null
  const link = node && state.processNodeDutyLinks.find((candidate) => candidate.processNodeId === node.id && candidate.dutyId === location.dutyId)
  return {
    active: true,
    view: location.view,
    processId: process.id,
    processNodeId: node?.id ?? null,
    dutyId: link?.dutyId ?? null,
  }
}

export function buildProcessPlanningUrl(location: Omit<ProcessPlanningLocation, 'active'>): string {
  const params = new URLSearchParams()
  params.set('view', location.view)
  if (location.processId) params.set('process', location.processId)
  if (location.processNodeId) params.set('node', location.processNodeId)
  if (location.dutyId) params.set('duty', location.dutyId)
  return `${PROCESS_PLANNING_PATH}?${params.toString()}`
}

export function canonicalProcessPlanningUrl(location: ProcessPlanningLocation, state: OrgDirectoryState): string | null {
  if (!location.active) return null
  return buildProcessPlanningUrl(normalizeProcessPlanningLocation(location, state))
}

