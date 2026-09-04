import type { DutyConfigurationExactLane } from '../dutyConfigurationRoute'
import type { DutyPlanningStatusFilter } from '../dutyPlanningRoute'
import type { OrgDirectoryState } from '../types'
import type {
  ModuleSurfaceDescriptor,
  WorkspaceModuleContextMap,
  WorkspaceModuleDescriptorMap,
  WorkspaceModuleId,
} from './types'

export const WORKSPACE_MODULE_ORDER = [
  'organization',
  'employees',
  'positions',
  'departments',
  'levels',
  'duties',
  'processes',
  'management-methods',
  'role-risks',
  'governance',
] as const satisfies readonly WorkspaceModuleId[]

const moduleIds = new Set<string>(WORKSPACE_MODULE_ORDER)
const dutyLanes = new Set<DutyConfigurationExactLane>(['primary-execute', 'collaborate', 'review', 'countersign'])
const dutyStatuses = ['no-executor', 'missing-primary-executor', 'pending-reassignment'] as const satisfies readonly DutyPlanningStatusFilter[]
const dutyStatusSet = new Set<string>(dutyStatuses)
const governanceSections = new Set<WorkspaceModuleContextMap['governance']['section']>([
  'identity',
  'catalog',
  'assignments',
  'delegation',
  'versions',
  'audit',
  'check',
])

function cleanId(value: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null
}

function cleanQuery(value: string | null) {
  return (value ?? '').trim().slice(0, 200)
}

function decodeHash(hash: string) {
  if (!hash || hash === '#') return null
  try {
    return decodeURIComponent(hash.slice(1)).trim().slice(0, 200) || null
  } catch {
    return null
  }
}

function setOptional(params: URLSearchParams, key: string, value: string | null) {
  if (value) params.set(key, value)
}

function moduleDescriptor<K extends WorkspaceModuleId>(descriptor: ModuleSurfaceDescriptor<K>) {
  return descriptor
}

const organization = moduleDescriptor({
  id: 'organization',
  label: '組織架構圖',
  supportsCollapsibleDetail: false,
  minWidth: 360,
  minHeight: 260,
  supportedSelectionKinds: ['employee', 'position', 'department', 'level', 'duty', 'role-risk-rule'],
  queryKeys: [],
  defaultContext: {},
  readRouteContext: () => ({}),
  writeRouteContext: () => null,
  sanitizeContext: () => ({}),
})

const employees = moduleDescriptor({
  id: 'employees',
  label: '員工',
  supportsCollapsibleDetail: true,
  minWidth: 260,
  minHeight: 220,
  supportedSelectionKinds: ['employee', 'position', 'department'],
  queryKeys: ['employee', 'employeeQ'],
  defaultContext: { employeeId: null, query: '' },
  readRouteContext: (params) => ({ employeeId: cleanId(params.get('employee')), query: cleanQuery(params.get('employeeQ')) }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'employee', context.employeeId)
    setOptional(params, 'employeeQ', context.query || null)
    return null
  },
  sanitizeContext: (context, state) => ({
    employeeId: state.employees.some((employee) => employee.id === context.employeeId) ? context.employeeId : null,
    query: cleanQuery(context.query),
  }),
})

const positions = moduleDescriptor({
  id: 'positions',
  label: '職位',
  supportsCollapsibleDetail: true,
  minWidth: 260,
  minHeight: 220,
  supportedSelectionKinds: ['employee', 'position', 'department', 'level', 'duty'],
  queryKeys: ['position', 'positionQ'],
  defaultContext: { positionId: null, query: '' },
  readRouteContext: (params) => ({ positionId: cleanId(params.get('position')), query: cleanQuery(params.get('positionQ')) }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'position', context.positionId)
    setOptional(params, 'positionQ', context.query || null)
    return null
  },
  sanitizeContext: (context, state) => ({
    positionId: state.positions.some((position) => position.id === context.positionId) ? context.positionId : null,
    query: cleanQuery(context.query),
  }),
})

const departments = moduleDescriptor({
  id: 'departments',
  label: '部門',
  supportsCollapsibleDetail: true,
  minWidth: 260,
  minHeight: 220,
  supportedSelectionKinds: ['department', 'employee', 'position'],
  queryKeys: ['department'],
  defaultContext: { departmentId: null },
  readRouteContext: (params) => ({ departmentId: cleanId(params.get('department')) }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'department', context.departmentId)
    return null
  },
  sanitizeContext: (context, state) => ({
    departmentId: state.departments.some((department) => department.id === context.departmentId) ? context.departmentId : null,
  }),
})

const levels = moduleDescriptor({
  id: 'levels',
  label: '層級',
  supportsCollapsibleDetail: false,
  minWidth: 260,
  minHeight: 220,
  supportedSelectionKinds: ['level', 'position'],
  queryKeys: ['level'],
  defaultContext: { levelId: null },
  readRouteContext: (params) => ({ levelId: cleanId(params.get('level')) }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'level', context.levelId)
    return null
  },
  sanitizeContext: (context, state) => ({
    levelId: state.organizationLevels.some((level) => level.id === context.levelId) ? context.levelId : null,
  }),
})

const duties = moduleDescriptor({
  id: 'duties',
  label: '工作職掌',
  supportsCollapsibleDetail: true,
  minWidth: 320,
  minHeight: 260,
  supportedSelectionKinds: ['duty', 'position', 'process-node'],
  queryKeys: ['duty', 'dutyLane', 'dutyView', 'dutyQ', 'dutyStatus', 'dutyPosition', 'dutySourceRelation', 'dutyAttention'],
  defaultContext: {
    dutyId: null,
    lane: null,
    view: 'configuration',
    query: '',
    statusFilters: [],
    focusPositionId: null,
    sourceRelationId: null,
    attentionOnly: false,
  },
  readRouteContext: (params) => {
    const lane = params.get('dutyLane')
    const view = params.get('dutyView')
    const statuses = params.getAll('dutyStatus').flatMap((value) => value.split(','))
    return {
      dutyId: cleanId(params.get('duty')),
      lane: lane && dutyLanes.has(lane as DutyConfigurationExactLane) ? lane as DutyConfigurationExactLane : null,
      view: view === 'audit' || view === 'distribution' ? view : 'configuration',
      query: cleanQuery(params.get('dutyQ')),
      statusFilters: dutyStatuses.filter((status) => statuses.includes(status)),
      focusPositionId: cleanId(params.get('dutyPosition')),
      sourceRelationId: cleanId(params.get('dutySourceRelation')),
      attentionOnly: params.get('dutyAttention') === '1',
    }
  },
  writeRouteContext: (context, params) => {
    setOptional(params, 'duty', context.dutyId)
    setOptional(params, 'dutyLane', context.lane)
    if (context.view !== 'configuration') params.set('dutyView', context.view)
    setOptional(params, 'dutyQ', context.query || null)
    for (const status of dutyStatuses) if (context.statusFilters.includes(status)) params.append('dutyStatus', status)
    setOptional(params, 'dutyPosition', context.focusPositionId)
    setOptional(params, 'dutySourceRelation', context.sourceRelationId)
    if (context.attentionOnly) params.set('dutyAttention', '1')
    return null
  },
  sanitizeContext: (context, state) => {
    const dutyId = state.duties.some((duty) => duty.id === context.dutyId) ? context.dutyId : null
    const source = state.dutyPositionRelations.find((relation) => relation.id === context.sourceRelationId)
    const sourceRelationId = source?.target.kind === 'pending-reassignment' && (!dutyId || source.dutyId === dutyId) ? source.id : null
    return {
      dutyId,
      lane: dutyId && context.lane && dutyLanes.has(context.lane) ? context.lane : null,
      view: context.view === 'audit' || context.view === 'distribution' ? context.view : 'configuration',
      query: cleanQuery(context.query),
      statusFilters: dutyStatuses.filter((status) => context.statusFilters.includes(status) && dutyStatusSet.has(status)),
      focusPositionId: state.positions.some((position) => position.id === context.focusPositionId && position.status === 'active') ? context.focusPositionId : null,
      sourceRelationId,
      attentionOnly: Boolean(context.attentionOnly),
    }
  },
})

const processes = moduleDescriptor({
  id: 'processes',
  label: '流程規劃',
  supportsCollapsibleDetail: false,
  minWidth: 480,
  minHeight: 280,
  supportedSelectionKinds: ['process', 'process-node', 'duty', 'position'],
  queryKeys: ['process', 'node', 'processDuty', 'processView'],
  defaultContext: { processId: null, processNodeId: null, dutyId: null, view: 'mindmap' },
  readRouteContext: (params) => ({
    processId: cleanId(params.get('process')),
    processNodeId: cleanId(params.get('node')),
    dutyId: cleanId(params.get('processDuty')),
    view: params.get('processView') === 'flow' ? 'flow' : 'mindmap',
  }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'process', context.processId)
    setOptional(params, 'node', context.processNodeId)
    setOptional(params, 'processDuty', context.dutyId)
    params.set('processView', context.view)
    return null
  },
  sanitizeContext: (context, state) => {
    const process = state.processes.find((candidate) => candidate.id === context.processId) ?? null
    const node = process ? state.processNodes.find((candidate) => candidate.id === context.processNodeId && candidate.processId === process.id) ?? null : null
    const link = node ? state.processNodeDutyLinks.find((candidate) => candidate.processNodeId === node.id && candidate.dutyId === context.dutyId) ?? null : null
    return {
      processId: process?.id ?? null,
      processNodeId: node?.id ?? null,
      dutyId: link?.dutyId ?? null,
      view: context.view === 'flow' ? 'flow' : 'mindmap',
    }
  },
})

const managementMethods = moduleDescriptor({
  id: 'management-methods',
  label: '管理辦法',
  supportsCollapsibleDetail: true,
  minWidth: 420,
  minHeight: 300,
  supportedSelectionKinds: ['management-method', 'duty'],
  queryKeys: ['method', 'methodView', 'methodQ'],
  defaultContext: { methodId: null, view: 'list', query: '', chapter: null },
  readRouteContext: (params, hash) => ({
    methodId: cleanId(params.get('method')),
    view: params.get('methodView') === 'readable' ? 'readable' : params.get('methodView') === 'draft' ? 'draft' : 'list',
    query: cleanQuery(params.get('methodQ')),
    chapter: decodeHash(hash),
  }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'method', context.methodId)
    if (context.view !== 'list') params.set('methodView', context.view)
    setOptional(params, 'methodQ', context.query || null)
    return context.chapter ? `#${encodeURIComponent(context.chapter)}` : null
  },
  sanitizeContext: (context) => ({
    methodId: cleanId(context.methodId),
    view: context.methodId ? context.view === 'readable' ? 'readable' : 'draft' : 'list',
    query: cleanQuery(context.query),
    chapter: cleanId(context.chapter),
  }),
})

const roleRisks = moduleDescriptor({
  id: 'role-risks',
  label: '兼任風險',
  supportsCollapsibleDetail: false,
  minWidth: 360,
  minHeight: 280,
  supportedSelectionKinds: ['role-risk-rule', 'employee', 'position'],
  queryKeys: ['riskRule', 'riskEmployee'],
  defaultContext: { ruleId: null, employeeId: null },
  readRouteContext: (params) => ({ ruleId: cleanId(params.get('riskRule')), employeeId: cleanId(params.get('riskEmployee')) }),
  writeRouteContext: (context, params) => {
    setOptional(params, 'riskRule', context.ruleId)
    setOptional(params, 'riskEmployee', context.employeeId)
    return null
  },
  sanitizeContext: (context, state) => ({
    ruleId: state.roleCombinationRiskRules.some((rule) => rule.id === context.ruleId) ? context.ruleId : null,
    employeeId: state.employees.some((employee) => employee.id === context.employeeId) ? context.employeeId : null,
  }),
})

const governance = moduleDescriptor({
  id: 'governance',
  label: '角色治理',
  supportsCollapsibleDetail: false,
  minWidth: 420,
  minHeight: 320,
  supportedSelectionKinds: ['employee', 'department'],
  queryKeys: ['governanceSection'],
  defaultContext: { section: 'identity' },
  readRouteContext: (params) => {
    const section = params.get('governanceSection')
    return { section: section && governanceSections.has(section as WorkspaceModuleContextMap['governance']['section']) ? section as WorkspaceModuleContextMap['governance']['section'] : 'identity' }
  },
  writeRouteContext: (context, params) => {
    if (context.section !== 'identity') params.set('governanceSection', context.section)
    return null
  },
  sanitizeContext: (context) => ({ section: governanceSections.has(context.section) ? context.section : 'identity' }),
})

export const WORKSPACE_MODULES = {
  organization,
  employees,
  positions,
  departments,
  levels,
  duties,
  processes,
  'management-methods': managementMethods,
  'role-risks': roleRisks,
  governance,
} satisfies WorkspaceModuleDescriptorMap

export function isWorkspaceModuleId(value: string): value is WorkspaceModuleId {
  return moduleIds.has(value)
}

export function getWorkspaceModule<K extends WorkspaceModuleId>(moduleId: K): ModuleSurfaceDescriptor<K> {
  return WORKSPACE_MODULES[moduleId] as ModuleSurfaceDescriptor<K>
}

export function getWorkspaceDefaultContext<K extends WorkspaceModuleId>(moduleId: K): WorkspaceModuleContextMap[K] {
  return structuredClone(getWorkspaceModule(moduleId).defaultContext)
}
