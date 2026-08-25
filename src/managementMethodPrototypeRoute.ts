import type { PrototypeResponsibilityType } from './managementMethodPrototype'

export const MANAGEMENT_METHOD_PROTOTYPE_PATH = '/management-methods'

export interface PrototypeResponsibilityContext {
  methodId: string
  stageId: string
  stepId: string
  workItemId: string
  relationType: PrototypeResponsibilityType
}

export interface ManagementMethodPrototypeLocation {
  isEditorPage: boolean
  focusStepId: string | null
  responsibilityContext: PrototypeResponsibilityContext | null
}

const responsibilityTypes = new Set<PrototypeResponsibilityType>([
  'primary-execute',
  'execute',
  'review',
  'collaborate',
  'countersign',
])

export function readManagementMethodPrototypeLocation(location: Pick<Location, 'pathname' | 'search'>): ManagementMethodPrototypeLocation {
  const params = new URLSearchParams(location.search)
  const isEditorPage = location.pathname === MANAGEMENT_METHOD_PROTOTYPE_PATH
  if (location.pathname !== '/' || params.get('mode') !== 'responsibility') {
    return { isEditorPage, focusStepId: isEditorPage ? params.get('step') : null, responsibilityContext: null }
  }

  const methodId = params.get('method')
  const stageId = params.get('stage')
  const stepId = params.get('step')
  const workItemId = params.get('workItem')
  const relationType = params.get('relation') as PrototypeResponsibilityType | null
  if (!methodId || !stageId || !stepId || !workItemId || !relationType || !responsibilityTypes.has(relationType)) {
    return { isEditorPage: false, focusStepId: null, responsibilityContext: null }
  }
  return {
    isEditorPage: false,
    focusStepId: null,
    responsibilityContext: { methodId, stageId, stepId, workItemId, relationType },
  }
}

export function buildManagementMethodPrototypeUrl(focusStepId?: string | null) {
  if (!focusStepId) return MANAGEMENT_METHOD_PROTOTYPE_PATH
  return `${MANAGEMENT_METHOD_PROTOTYPE_PATH}?${new URLSearchParams({ step: focusStepId }).toString()}`
}

export function buildPrototypeResponsibilityUrl(context: PrototypeResponsibilityContext) {
  return `/?${new URLSearchParams({
    mode: 'responsibility',
    method: context.methodId,
    stage: context.stageId,
    step: context.stepId,
    workItem: context.workItemId,
    relation: context.relationType,
  }).toString()}`
}
