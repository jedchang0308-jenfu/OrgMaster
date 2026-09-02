import type {
  RegisteredDropEffect,
  RegisteredDropTarget,
  WorkspaceEntityDragPayloadV1,
} from './entityDrag'
import type {
  RelationPlacementCandidate,
  RelationPlacementInputMode,
} from './relationPlacement'

/**
 * Relation placement owns a small, shared pointer policy.  The root itself
 * may be a button (for example a duty lane); only an interactive descendant
 * is excluded from native drag promotion.
 */
export const RELATION_INTERACTIVE_DESCENDANT_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'a',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[data-no-relation-drag="true"]',
].join(',')

/** Explicit relation handles are interactive controls that intentionally start a drag. */
export const RELATION_DRAG_HANDLE_SELECTOR = '[data-relation-drag-handle="true"]'

export type RelationPlacementVisualState = 'idle' | 'available' | 'valid' | 'noop' | 'rejected'

export type RelationPlacementFeedbackIcon = 'idle' | 'available' | 'valid' | 'noop' | 'rejected'

export type RelationPlacementTargetPresentation = {
  state: RelationPlacementVisualState
  message: string | null
  icon: RelationPlacementFeedbackIcon
  dropEffect: DataTransfer['dropEffect']
}

export type RelationPlacementOutcome = {
  target: RegisteredDropTarget
  state: Exclude<RelationPlacementVisualState, 'idle' | 'available'>
  message: string
  token: number
}

export type RelationPlacementBegin = (
  payload: WorkspaceEntityDragPayloadV1,
  inputMode: RelationPlacementInputMode,
  source?: HTMLElement | null,
) => boolean

export type RelationPlacementPreview = (
  target: RegisteredDropTarget,
) => RelationPlacementCandidate | null

export type RelationPlacementCommit = (
  target: RegisteredDropTarget,
  dataTransfer?: DataTransfer,
) => boolean

export type RelationPlacementCancel = () => void

/**
 * Native drag admission is derived from the payload, not selected by each
 * component. A source can be dropped on more than one target type, so this
 * value describes the union of effects the shared resolver may produce.
 * The target adapter still narrows `dropEffect` to the actual candidate.
 */
export function relationEffectAllowedFor(payload: WorkspaceEntityDragPayloadV1): DataTransfer['effectAllowed'] {
  switch (payload.kind) {
    case 'employee': return 'copyMove'
    case 'duty': return 'all'
    case 'process-node': return 'link'
  }
}

export function isRelationDragInteractiveDescendant(target: EventTarget | null, sourceRoot: HTMLElement) {
  if (!(target instanceof Element) || target === sourceRoot || !sourceRoot.contains(target)) return false
  if (target.closest(RELATION_DRAG_HANDLE_SELECTOR)) return false
  const interactive = target.closest(RELATION_INTERACTIVE_DESCENDANT_SELECTOR)
  return Boolean(interactive && interactive !== sourceRoot)
}

export function sameRelationPlacementTarget(left: RegisteredDropTarget | null, right: RegisteredDropTarget | null) {
  if (!left || !right || left.kind !== right.kind) return false
  if (left.kind === 'position' && right.kind === 'position') return left.positionId === right.positionId
  if (left.kind === 'process-node' && right.kind === 'process-node') return left.processNodeId === right.processNodeId
  if (left.kind === 'duty' && right.kind === 'duty') return left.dutyId === right.dutyId
  return left.kind === 'employee-unassign' && right.kind === 'employee-unassign'
}

function effectMessage(effect: RegisteredDropEffect) {
  switch (effect) {
    case 'assign': return '可建立任職'
    case 'assign-additional': return '可新增任職'
    case 'move': return '可移動任職'
    case 'unassign': return '可解除任職'
    case 'replace': return '可替換任職'
    case 'configure': return '可配置職掌'
    case 'transfer-primary': return '可轉為主執行'
    case 'link': return '可建立流程關聯'
    case 'noop': return '關係已存在，無需變更'
    case 'rejected': return '此資料無法放到該落點'
    default: return null
  }
}

function issueMessage(code: RelationPlacementCandidate['code']) {
  switch (code) {
    case 'SAME_TARGET': return '已在此落點，無需變更'
    case 'DUPLICATE_RELATION': return '關係已存在，未重複建立'
    case 'DUPLICATE_ASSIGNMENT': return '此任職已存在，未重複建立'
    case 'READ_ONLY': return '目前為唯讀，無法建立關係'
    case 'PAYLOAD_INVALID': return '拖曳資料無效'
    case 'DROP_PAIR_UNSUPPORTED': return '此資料不能放到該類型落點'
    case 'EMPLOYEE_NOT_FOUND': return '找不到員工資料'
    case 'POSITION_NOT_FOUND': return '找不到職位資料'
    case 'SOURCE_ASSIGNMENT_NOT_FOUND': return '找不到原任職資料'
    case 'DUTY_NOT_FOUND': return '找不到職掌資料'
    case 'PROCESS_NODE_NOT_FOUND': return '找不到流程節點資料'
    case 'DUTY_LANE_REQUIRED': return '請先選擇責任類型'
    default: return null
  }
}

export function describeRelationPlacementFeedback(candidate: RelationPlacementCandidate | null): string | null {
  if (!candidate) return null
  return candidate.status === 'intent'
    ? effectMessage(candidate.effect)
    : issueMessage(candidate.code) ?? effectMessage(candidate.effect)
}

export function relationDropEffectFor(candidate: RelationPlacementCandidate | null): DataTransfer['dropEffect'] {
  if (!candidate || candidate.status !== 'intent') return 'none'
  return candidate.effect === 'link' ? 'link' : candidate.effect === 'assign' || candidate.effect === 'assign-additional' ? 'copy' : 'move'
}

type ProjectRelationPlacementTargetOptions = {
  active: boolean
  available: boolean
  target: RegisteredDropTarget
  candidate?: RelationPlacementCandidate | null
  outcome?: RelationPlacementOutcome | null
}

export function projectRelationPlacementTarget({ active, available, target, candidate = null, outcome = null }: ProjectRelationPlacementTargetOptions): RelationPlacementTargetPresentation {
  if (outcome && sameRelationPlacementTarget(outcome.target, target)) {
    return { state: outcome.state, message: outcome.message, icon: outcome.state, dropEffect: 'none' }
  }
  if (active && candidate && sameRelationPlacementTarget(candidate.target, target)) {
    const state: Exclude<RelationPlacementVisualState, 'idle' | 'available'> = candidate.status === 'intent'
      ? 'valid'
      : candidate.status
    return { state, message: describeRelationPlacementFeedback(candidate), icon: state, dropEffect: relationDropEffectFor(candidate) }
  }
  if (active && available) return { state: 'available', message: '可放置', icon: 'available', dropEffect: 'none' }
  return { state: 'idle', message: null, icon: 'idle', dropEffect: 'none' }
}
