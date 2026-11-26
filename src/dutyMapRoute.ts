import { DEFAULT_DUTY_MAP_VIEW, DUTY_CHAPTERS, type DutyMapViewState } from './dutyMap'
import type { OrgDirectoryState } from './types'

export const DUTY_MAP_QUERY_KEYS = ['dutyDepartment', 'dutyChapter', 'dutyFlywheel', 'dutyExpanded', 'dutyMapLevel', 'dutyMapChapters', 'dutyMapNode']

export function readDutyMapView(params: URLSearchParams): DutyMapViewState {
  const selected = /^(department|group|duty):(.+)$/.exec(params.get('dutyMapNode') ?? '')
  const level = params.get('dutyMapLevel')
  return {
    ...DEFAULT_DUTY_MAP_VIEW,
    departmentId: params.get('dutyDepartment'),
    chapterId: params.get('dutyChapter'),
    flywheelId: params.get('dutyFlywheel'),
    expandedGroupIds: [...new Set(params.getAll('dutyExpanded'))],
    level: level === 'details' || level === 'departments' ? level : 'groups',
    showChapters: params.get('dutyMapChapters') !== '0',
    selectedNode: selected ? { kind: selected[1] as 'department' | 'group' | 'duty', id: selected[2] } : null,
  }
}

export function writeDutyMapView(value: DutyMapViewState, params: URLSearchParams) {
  if (value.departmentId) params.set('dutyDepartment', value.departmentId)
  if (value.chapterId) params.set('dutyChapter', value.chapterId)
  if (value.flywheelId) params.set('dutyFlywheel', value.flywheelId)
  for (const id of value.expandedGroupIds) params.append('dutyExpanded', id)
  if (value.level !== 'groups') params.set('dutyMapLevel', value.level)
  if (!value.showChapters) params.set('dutyMapChapters', '0')
  if (value.selectedNode) params.set('dutyMapNode', value.selectedNode.kind + ':' + value.selectedNode.id)
}

export function sanitizeDutyMapView(value: DutyMapViewState, state: OrgDirectoryState): DutyMapViewState {
  const groups = new Set(state.dutyMap?.groups.map(group => group.id) ?? [])
  const departments = new Set(state.departments.map(department => department.id))
  const duties = new Set(state.duties.map(duty => duty.id))
  const node = value.selectedNode
  const nodeExists = node && (node.kind === 'department' ? departments.has(node.id) : node.kind === 'group' ? groups.has(node.id) : duties.has(node.id))
  return {
    ...value,
    departmentId: value.departmentId && departments.has(value.departmentId) ? value.departmentId : null,
    chapterId: DUTY_CHAPTERS.some(chapter => chapter.chapterId === value.chapterId) ? value.chapterId : null,
    flywheelId: state.dutyMap?.flywheels.some(flywheel => flywheel.id === value.flywheelId) ? value.flywheelId : null,
    expandedGroupIds: [...new Set(value.expandedGroupIds)].filter(id => groups.has(id)),
    selectedNode: nodeExists ? node : null,
  }
}
