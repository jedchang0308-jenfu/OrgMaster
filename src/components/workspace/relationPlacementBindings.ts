import type { DragEvent, DragEventHandler, HTMLAttributes, MouseEventHandler, PointerEventHandler } from 'react'
import {
  readWorkspaceEntityDrag,
  WORKSPACE_ENTITY_DRAG_MIME,
  writeWorkspaceEntityDrag,
  type RegisteredDropTarget,
  type WorkspaceEntityDragPayloadV1,
} from '../../workspace/entityDrag'
import {
  isRelationDragInteractiveDescendant,
  relationEffectAllowedFor,
  projectRelationPlacementTarget,
  relationDropEffectFor,
  type RelationPlacementBegin,
  type RelationPlacementCancel,
  type RelationPlacementCommit,
  type RelationPlacementOutcome,
  type RelationPlacementPreview,
} from '../../workspace/relationDragInteraction'
import type { RelationPlacementCandidate } from '../../workspace/relationPlacement'

// Keep the gesture origin independent from a single render/factory closure.
// React Flow and directory surfaces may recreate props between pointerdown
// and the browser's later dragstart promotion; the source root remains the
// stable identity and the WeakMap does not retain detached roots.
const relationPointerOrigins = new WeakMap<HTMLElement, EventTarget | null>()

export type RelationPlacementSourceOptions = {
  enabled: boolean
  payload: WorkspaceEntityDragPayloadV1
  /**
   * React Flow owns the ancestor mousedown gesture. When a relation source is
   * rendered inside a React Flow node, the owner must not cancel the browser's
   * native drag promotion before dragstart. This remains an adapter option so
   * the domain components do not grow a second drag implementation.
   */
  stopMouseDownPropagation?: boolean
  onBegin: RelationPlacementBegin
  onCancel: RelationPlacementCancel
}

export type RelationPlacementSourceProps = Pick<
  HTMLAttributes<HTMLElement>,
  'draggable' | 'onDragStart' | 'onDragEnd' | 'onPointerDownCapture' | 'onPointerUpCapture' | 'onPointerCancelCapture' | 'onMouseDownCapture'
> & Record<`data-${string}`, string | undefined>

/**
 * All native relation sources use this adapter. Pointer origin is captured
 * before the browser emits dragstart so a nested control can never promote a
 * click into a drag, while the source root itself remains draggable.
 */
export function createRelationPlacementSourceProps({ enabled, payload, stopMouseDownPropagation = false, onBegin, onCancel }: RelationPlacementSourceOptions): RelationPlacementSourceProps {
  const onPointerDownCapture: PointerEventHandler<HTMLElement> = (event) => {
    relationPointerOrigins.set(event.currentTarget, event.target)
    if (stopMouseDownPropagation) event.stopPropagation()
  }
  const clearPointerOrigin: PointerEventHandler<HTMLElement> = (event) => {
    relationPointerOrigins.delete(event.currentTarget)
  }
  const onMouseDownCapture: MouseEventHandler<HTMLElement> = (event) => {
    if (stopMouseDownPropagation) event.stopPropagation()
  }
  const onDragStart: DragEventHandler<HTMLElement> = (event) => {
    const sourceRoot = event.currentTarget
    const pointerOrigin = relationPointerOrigins.get(sourceRoot)
    relationPointerOrigins.delete(sourceRoot)
    if (!enabled || isRelationDragInteractiveDescendant(pointerOrigin ?? null, sourceRoot)) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = relationEffectAllowedFor(payload)
    const written = writeWorkspaceEntityDrag(event.dataTransfer, payload)
    const started = written ? onBegin(payload, 'native-drag', sourceRoot) !== false : false
    if (!written || !started) {
      event.dataTransfer.clearData(WORKSPACE_ENTITY_DRAG_MIME)
      event.preventDefault()
    }
  }
  const onDragEnd: DragEventHandler<HTMLElement> = () => {
    onCancel()
  }
  return {
    draggable: enabled,
    'data-relation-placement-source-kind': enabled ? payload.kind : undefined,
    'data-employee-id': enabled && payload.kind === 'employee' ? payload.employeeId : undefined,
    'data-duty-id': enabled && payload.kind === 'duty' ? payload.dutyId : undefined,
    'data-duty-lane': enabled && payload.kind === 'duty' ? payload.lane ?? undefined : undefined,
    'data-process-node-id': enabled && payload.kind === 'process-node' ? payload.processNodeId : undefined,
    'data-source-position-id': enabled && payload.kind === 'employee' ? payload.sourcePositionId ?? undefined : undefined,
    onPointerDownCapture,
    onPointerUpCapture: clearPointerOrigin,
    onPointerCancelCapture: clearPointerOrigin,
    onMouseDownCapture,
    onDragStart,
    onDragEnd,
  }
}

export type RelationPlacementDropTargetOptions = {
  active: boolean
  available: boolean
  target: RegisteredDropTarget
  candidate?: RelationPlacementCandidate | null
  outcome?: RelationPlacementOutcome | null
  onPreview?: RelationPlacementPreview
  onCommit?: RelationPlacementCommit
  onEnter?: () => void
  onLeave?: () => void
}

export type RelationPlacementDropTargetProps = Pick<
  HTMLAttributes<HTMLElement>,
  'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'
> & Record<`data-${string}`, string | undefined>

function hasWorkspaceRelationPayload(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(WORKSPACE_ENTITY_DRAG_MIME)
}

/**
 * All registered drop targets use this adapter. It deliberately does not
 * stop dragover propagation: the owning canvas needs the same event for edge
 * auto-pan. Drop stops only after the strict MIME contract is recognized.
 */
export function createRelationPlacementDropTargetProps({ active, available, target, candidate = null, outcome = null, onPreview, onCommit, onEnter, onLeave }: RelationPlacementDropTargetOptions): RelationPlacementDropTargetProps {
  // `available` describes the surface's capability; `active` describes the
  // current placement session.  Both are required before a surface may
  // preview or commit.  Without this guard an inactive directory row could
  // preview itself during drag, replace the intended candidate, and trigger
  // the composition root's fail-closed surface teardown.
  const canAcceptDrop = active && available && typeof onPreview === 'function' && typeof onCommit === 'function'
  const presentation = projectRelationPlacementTarget({ active, available: canAcceptDrop, target, candidate, outcome })
  const preview = () => onPreview?.(target) ?? null
  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptDrop || !hasWorkspaceRelationPayload(event)) return
    onEnter?.()
    const nextCandidate = preview()
    event.preventDefault()
    event.dataTransfer.dropEffect = relationDropEffectFor(nextCandidate)
  }
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptDrop || !hasWorkspaceRelationPayload(event)) return
    const nextCandidate = preview()
    event.preventDefault()
    event.dataTransfer.dropEffect = relationDropEffectFor(nextCandidate)
  }
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    onLeave?.()
  }
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptDrop || !hasWorkspaceRelationPayload(event)) return
    event.preventDefault()
    event.stopPropagation()
    onCommit?.(target, event.dataTransfer)
  }
  return {
    'data-relation-placement-target': target.kind,
    'data-relation-placement-state': presentation.state,
    'data-relation-placement-feedback': presentation.message ?? undefined,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}

export function readRelationPayload(dataTransfer: DataTransfer) {
  return readWorkspaceEntityDrag(dataTransfer)
}

// Contract names used by DEV-041. The explicit placement-prefixed names stay
// available for local readability while every consumer can converge on the
// same public adapter vocabulary.
export const createRelationDragSourceProps = createRelationPlacementSourceProps
export const createRelationDropTargetProps = createRelationPlacementDropTargetProps
