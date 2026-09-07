import { readDutyConfigurationLocation } from '../dutyConfigurationRoute'
import { readDutyPlanningLocation } from '../dutyPlanningRoute'
import { readManagementMethodLocation } from '../managementMethods/route'
import { readProcessPlanningLocation } from '../processPlanningRoute'
import type { OrgDirectoryState } from '../types'
import { reconcileWorkspaceLayout } from './layout'
import {
  getWorkspaceModule,
  isWorkspaceModuleId,
  WORKSPACE_MODULE_ORDER,
} from './moduleRegistry'
import type {
  EntityRef,
  WorkspaceLayoutV1,
  WorkspaceModuleId,
  WorkspaceModuleContextMap,
  WorkspaceOpenIntent,
  WorkspaceRouteContexts,
  WorkspaceRouteSnapshot,
  WorkspaceRouteState,
} from './types'

interface LocationLike {
  pathname: string
  search: string
  hash?: string
}

const entityKinds = new Set<EntityRef['kind']>([
  'employee',
  'position',
  'department',
  'level',
  'duty',
  'process',
  'process-node',
  'management-method',
  'role-risk-rule',
])

function parsePanels(value: string | null): WorkspaceModuleId[] {
  if (value === 'none') return []
  if (!value) return []
  const requested = new Set(value.split(',').filter(isWorkspaceModuleId))
  return WORKSPACE_MODULE_ORDER.filter((moduleId) => requested.has(moduleId))
}

function parseSelection(value: string | null): EntityRef | null {
  if (!value) return null
  const separator = value.indexOf(':')
  if (separator < 1) return null
  const kind = value.slice(0, separator) as EntityRef['kind']
  const id = value.slice(separator + 1).trim()
  return entityKinds.has(kind) && id.length > 0 && id.length <= 200 ? { kind, id } : null
}

function routeContextHasDetail(moduleId: WorkspaceModuleId, context: WorkspaceRouteContexts[WorkspaceModuleId]) {
  if (!getWorkspaceModule(moduleId).supportsCollapsibleDetail || !context) return false
  if (moduleId === 'employees') return Boolean((context as WorkspaceModuleContextMap['employees']).employeeId)
  if (moduleId === 'positions') return Boolean((context as WorkspaceModuleContextMap['positions']).positionId)
  if (moduleId === 'departments') return Boolean((context as WorkspaceModuleContextMap['departments']).departmentId)
  if (moduleId === 'duties') return Boolean((context as WorkspaceModuleContextMap['duties']).dutyId)
  if (moduleId === 'levels') return Boolean((context as WorkspaceModuleContextMap['levels']).levelId)
  if (moduleId === 'processes') return Boolean((context as WorkspaceModuleContextMap['processes']).processId || (context as WorkspaceModuleContextMap['processes']).processNodeId || (context as WorkspaceModuleContextMap['processes']).dutyId)
  if (moduleId === 'management-methods') return Boolean((context as WorkspaceModuleContextMap['management-methods']).methodId)
  if (moduleId === 'role-risks') return Boolean((context as WorkspaceModuleContextMap['role-risks']).ruleId || (context as WorkspaceModuleContextMap['role-risks']).employeeId)
  return false
}

function parseDetails(value: string | null, openPanels: WorkspaceModuleId[], contexts: WorkspaceRouteContexts): WorkspaceModuleId[] {
  if (value === 'none') return []
  if (value === null) {
    return WORKSPACE_MODULE_ORDER.filter((moduleId) => {
      if (!openPanels.includes(moduleId) || !getWorkspaceModule(moduleId).supportsCollapsibleDetail) return false
      return routeContextHasDetail(moduleId, contexts[moduleId])
    })
  }
  const requested = new Set(value.split(',').filter(isWorkspaceModuleId))
  return WORKSPACE_MODULE_ORDER.filter((moduleId) => (
    requested.has(moduleId)
      && openPanels.includes(moduleId)
      && getWorkspaceModule(moduleId).supportsCollapsibleDetail
  ))
}

export function sanitizeEntityRef(ref: EntityRef | null, state: OrgDirectoryState): EntityRef | null {
  if (!ref) return null
  const exists = ref.kind === 'employee' ? state.employees.some((item) => item.id === ref.id)
    : ref.kind === 'position' ? state.positions.some((item) => item.id === ref.id)
      : ref.kind === 'department' ? state.departments.some((item) => item.id === ref.id)
        : ref.kind === 'level' ? state.organizationLevels.some((item) => item.id === ref.id)
          : ref.kind === 'duty' ? state.duties.some((item) => item.id === ref.id)
            : ref.kind === 'process' ? state.processes.some((item) => item.id === ref.id)
              : ref.kind === 'process-node' ? state.processNodes.some((item) => item.id === ref.id)
                : ref.kind === 'role-risk-rule' ? state.roleCombinationRiskRules.some((item) => item.id === ref.id)
                  : true
  return exists ? ref : null
}

export function readWorkspaceRoute(location: LocationLike, state?: OrgDirectoryState): WorkspaceRouteSnapshot {
  const params = new URLSearchParams(location.search)
  const explicitPanels = location.pathname === '/' && params.has('panels')
  const openPanels = explicitPanels ? parsePanels(params.get('panels')) : []
  const focus = params.get('focus')
  const focusedPanel = focus && isWorkspaceModuleId(focus) && openPanels.includes(focus) ? focus : null
  const contexts: WorkspaceRouteContexts = {}
  for (const moduleId of openPanels) {
    const descriptor = getWorkspaceModule(moduleId)
    const context = descriptor.readRouteContext(params, location.hash ?? '')
    ;(contexts as Partial<Record<WorkspaceModuleId, unknown>>)[moduleId] = state
      ? descriptor.sanitizeContext(context, state)
      : context
  }
  const rawSelection = parseSelection(params.get('select'))
  return {
    explicitPanels,
    route: {
      openPanels,
      focusedPanel,
      selection: state ? sanitizeEntityRef(rawSelection, state) : rawSelection,
      openDetails: parseDetails(params.get('details'), openPanels, contexts),
      contexts,
    },
  }
}

export function writeWorkspaceRoute(route: WorkspaceRouteState) {
  const params = new URLSearchParams()
  const openPanels = WORKSPACE_MODULE_ORDER.filter((moduleId) => route.openPanels.includes(moduleId))
  params.set('panels', openPanels.length > 0 ? openPanels.join(',') : 'none')
  if (route.focusedPanel && openPanels.includes(route.focusedPanel)) params.set('focus', route.focusedPanel)
  if (route.selection) params.set('select', `${route.selection.kind}:${route.selection.id}`)
  const openDetails = WORKSPACE_MODULE_ORDER.filter((moduleId) => route.openDetails.includes(moduleId) && openPanels.includes(moduleId) && getWorkspaceModule(moduleId).supportsCollapsibleDetail)
  params.set('details', openDetails.length > 0 ? openDetails.join(',') : 'none')
  let hash = ''
  for (const moduleId of openPanels) {
    const descriptor = getWorkspaceModule(moduleId)
    const context = route.contexts[moduleId] ?? descriptor.defaultContext
    const moduleHash = descriptor.writeRouteContext(context as never, params)
    if (moduleHash) hash = moduleHash
  }
  return `/?${params.toString()}${hash}`
}

export function readLegacyWorkspaceIntent(location: LocationLike, state: OrgDirectoryState): WorkspaceOpenIntent | null {
  const dutyConfiguration = readDutyConfigurationLocation(location as Pick<Location, 'pathname' | 'search'>)
  if (dutyConfiguration.active) {
    return {
      moduleId: 'duties',
      source: 'legacy-route',
      context: getWorkspaceModule('duties').sanitizeContext({
        dutyId: dutyConfiguration.dutyId,
        lane: dutyConfiguration.lane,
        view: 'configuration',
        query: '',
        statusFilters: [],
        focusPositionId: dutyConfiguration.focusPositionId,
        sourceRelationId: dutyConfiguration.sourceRelationId,
        attentionOnly: dutyConfiguration.attentionOnly,
      }, state),
    }
  }

  const dutyPlanning = readDutyPlanningLocation(location as Pick<Location, 'pathname' | 'search'>)
  if (dutyPlanning.isDutyPlanningPage) {
    return {
      moduleId: 'duties',
      source: 'legacy-route',
      context: {
        ...getWorkspaceModule('duties').defaultContext,
        view: dutyPlanning.view ?? 'audit',
        query: dutyPlanning.query,
        statusFilters: dutyPlanning.anomalyTypes,
      },
    }
  }

  const process = readProcessPlanningLocation(location as Pick<Location, 'pathname' | 'search'>)
  if (process.active) {
    return {
      moduleId: 'processes',
      source: 'legacy-route',
      context: getWorkspaceModule('processes').sanitizeContext({
        processId: process.processId,
        processNodeId: process.processNodeId,
        dutyId: process.dutyId,
        view: process.view,
      }, state),
    }
  }

  const management = readManagementMethodLocation(location as Location)
  if (management.isListPage || management.isDocumentPage) {
    return {
      moduleId: 'management-methods',
      source: 'legacy-route',
      context: {
        methodId: management.methodId,
        view: management.isDocumentPage ? management.view : 'list',
        query: '',
        chapter: management.chapter,
      },
    }
  }
  return null
}

export function routeFromWorkspaceIntent(intent: WorkspaceOpenIntent): WorkspaceRouteState {
  return {
    openPanels: [intent.moduleId],
    focusedPanel: intent.moduleId,
    selection: null,
    openDetails: routeContextHasDetail(intent.moduleId, intent.context as never) ? [intent.moduleId] : [],
    contexts: { [intent.moduleId]: intent.context },
  }
}

export function reconcileRouteWithLayout(route: WorkspaceRouteState, layout: WorkspaceLayoutV1) {
  return reconcileWorkspaceLayout(layout, route.openPanels, route.focusedPanel)
}
