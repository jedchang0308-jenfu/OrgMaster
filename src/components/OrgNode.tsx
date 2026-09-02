import { memo, useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronDown, GitBranch } from 'lucide-react'
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type { Assignment, Employee, Point, PositionView, RoleCombinationRiskLevel } from '../types'
import type { RegisteredDropTarget, WorkspaceEntityDragPayloadV1 } from '../workspace/entityDrag'
import type { RelationPlacementCandidate } from '../workspace/relationPlacement'
import type { RelationPlacementBegin, RelationPlacementCancel, RelationPlacementCommit, RelationPlacementOutcome, RelationPlacementPreview } from '../workspace/relationDragInteraction'
import { createRelationDropTargetProps, createRelationDragSourceProps } from './workspace/relationPlacementBindings'

export interface OrgNodeData extends Record<string, unknown> {
  member: PositionView
  employees: Employee[]
  childCount: number
  onToggle: (id: string) => void
  onSelectPosition: (id: string) => void
  onSelectEmployee: (id: string) => void
  onRelationBegin?: RelationPlacementBegin
  onRelationCommit?: RelationPlacementCommit
  onRelationCancel?: RelationPlacementCancel
  relationPlacementActive?: boolean
  relationPlacementCandidate?: RelationPlacementCandidate | null
  relationPlacementOutcome?: RelationPlacementOutcome | null
  dragOffset?: Point
  showDragPlaceholder?: boolean
  employeeHighlighted: boolean
  riskLevel?: RoleCombinationRiskLevel
  riskRelated: boolean
  onRiskInteraction: (positionId: string | null) => void
  editingEnabled: boolean
  onRelationPreview?: RelationPlacementPreview
}

export type OrgFlowNode = Node<OrgNodeData, 'org'>

function riskLevelLabel(level: RoleCombinationRiskLevel) {
  if (level === 'high') return '高'
  if (level === 'medium') return '中'
  return '低'
}

function assignmentLabel(assignment: Assignment | undefined, employee: Employee) {
  if (assignment?.assignmentType === 'acting') return '代'
  return assignment && employee.primaryAssignmentId === assignment.id ? '主' : '兼'
}

function OrgNodeComponent({ data, selected }: NodeProps<OrgFlowNode>) {
  const {
    member,
    employees,
    childCount,
    onToggle,
    onSelectPosition,
    onSelectEmployee,
    onRelationBegin,
    onRelationCommit,
    onRelationCancel,
    relationPlacementActive = false,
    relationPlacementCandidate,
    relationPlacementOutcome = null,
    dragOffset,
    showDragPlaceholder = false,
    employeeHighlighted,
    riskLevel,
    riskRelated,
    onRiskInteraction,
    editingEnabled,
    onRelationPreview,
  } = data
  const [relationDropHover, setRelationDropHover] = useState(false)
  const positionDropProps = useMemo(() => createRelationDropTargetProps({
    active: relationPlacementActive,
    // Relation placement is a cross-panel capability.  The canvas may be
    // read-only for ordinary position edits while a duty/employee source
    // remains writable in another panel, so do not gate the drop target on
    // the position editor's local `editingEnabled` flag.
    available: relationPlacementActive && Boolean(onRelationPreview && onRelationCommit),
    target: { kind: 'position', positionId: member.id },
    candidate: relationPlacementCandidate,
    outcome: relationPlacementOutcome,
    onPreview: onRelationPreview,
    onCommit: onRelationCommit,
    onEnter: () => setRelationDropHover(true),
    onLeave: () => setRelationDropHover(false),
  }), [editingEnabled, member.id, onRelationCommit, onRelationPreview, relationPlacementActive, relationPlacementCandidate, relationPlacementOutcome])
  const cardClassName = [
    'org-node',
    editingEnabled ? 'is-position-drag-enabled' : '',
    selected ? 'is-selected' : '',
    relationPlacementActive ? 'is-relation-placement-target' : '',
    relationPlacementActive && relationDropHover ? 'is-relation-placement-hover' : '',
    showDragPlaceholder ? 'is-drag-ghost' : '',
    employeeHighlighted ? 'is-employee-highlighted' : '',
    riskLevel ? 'has-role-risk' : '',
    riskLevel ? `role-risk--${riskLevel}` : '',
    riskRelated ? 'is-role-risk-related' : '',
    relationPlacementCandidate ? `relation-placement-${relationPlacementCandidate.effect}` : '',
  ].filter(Boolean).join(' ')
  const cardStyle = showDragPlaceholder && dragOffset
    ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }
    : undefined

  return (
    <>
      <Handle id="target-top" type="target" position={Position.Top} isConnectable={false} />
      <Handle id="target-left" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} isConnectable={false} />
      <Handle
        id="source-bottom-right"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ left: '10%' }}
      />

      {showDragPlaceholder && <div className="org-node__drag-placeholder" aria-hidden="true" />}

      <article
        className={cardClassName}
        style={cardStyle}
        aria-label={`${member.title}，${employees.length > 0 ? employees.map((employee) => employee.name).join('、') : '未指派'}${employeeHighlighted ? '，目前選取員工的任職格' : ''}${riskLevel ? `，${riskLevelLabel(riskLevel)}兼任風險` : ''}${relationPlacementActive && relationPlacementCandidate ? `，關聯落點${relationPlacementCandidate.effect === 'noop' ? '已存在' : relationPlacementCandidate.effect === 'rejected' ? '不可用' : '可用'}` : ''}`}
        data-position-id={member.id}
        {...positionDropProps}
        data-employee-highlighted={employeeHighlighted ? 'true' : undefined}
        data-role-risk-level={riskLevel}
        tabIndex={relationPlacementActive || riskLevel ? 0 : undefined}
        onClick={() => onSelectPosition(member.id)}
        onPointerEnter={() => {
          if (riskLevel) onRiskInteraction(member.id)
        }}
        onPointerLeave={(event) => {
          if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return
          if (riskLevel) onRiskInteraction(null)
        }}
        onFocusCapture={() => {
          if (riskLevel) onRiskInteraction(member.id)
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return
          if (riskLevel) onRiskInteraction(null)
        }}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (relationPlacementActive && onRelationCommit && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onRelationCommit({ kind: 'position', positionId: member.id })
          }
        }}
      >
        <div className="org-node__copy">
          <button
            type="button"
            className="org-node__title nodrag"
            tabIndex={undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onMouseDown={(event) => {
              event.stopPropagation()
              onSelectPosition(member.id)
            }}
            onClick={(event) => {
              event.stopPropagation()
              onSelectPosition(member.id)
            }}
            aria-label={`開啟 ${member.title || '未命名職位'} 職位明細`}
          >
            <strong>{member.title || '未命名職位'}</strong>
          </button>
          {employees.length > 0 ? employees.map((employee) => {
            const assignmentType = assignmentLabel(member.activeAssignments.find((assignment) => assignment.employeeId === employee.id), employee)
            return (
              <button
                  key={employee.id}
                  type="button"
                  className="org-node__employee-row org-node__employee nodrag"
                  tabIndex={undefined}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectEmployee(employee.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== ' ' || !editingEnabled || !onRelationBegin) return
                    event.preventDefault()
                    event.stopPropagation()
                    onRelationBegin({ version: 1, kind: 'employee', sourceModuleId: 'organization', employeeId: employee.id, sourcePositionId: member.id }, 'keyboard', event.currentTarget)
                  }}
                  title={`開啟 ${employee.name} 員工明細`}
                  aria-label={`${employee.name}，${assignmentType}職`}
                  {...(editingEnabled && onRelationBegin && onRelationCancel
                    ? createRelationDragSourceProps({
                      enabled: true,
                      payload: { version: 1, kind: 'employee', sourceModuleId: 'organization', employeeId: employee.id, sourcePositionId: member.id },
                      // React Flow owns the node's ancestor mouse gesture. Keep
                      // the employee row's native drag promotion from being
                      // cancelled before the browser emits dragstart.
                      stopMouseDownPropagation: true,
                      onBegin: onRelationBegin,
                      onCancel: onRelationCancel,
                    })
                    : {})}
                >
                  <span>
                    {employee.name}
                    <small className={`org-node__employee-type${assignmentType === '兼' ? ' org-node__employee-type--secondary' : ''}`}>
                      {assignmentType}
                    </small>
                  </span>
              </button>
            )
          }) : (
            <span className="org-node__unassigned">拖入員工</span>
          )}
        </div>

        {childCount > 0 && (
          <button
            type="button"
            className={[
              'nodrag',
              'org-node__collapse',
              member.childrenAxis === 'vertical' ? 'is-vertical' : 'is-horizontal',
            ].join(' ')}
            tabIndex={undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(member.id)
            }}
            aria-label={member.collapsed ? '展開下屬' : '收合下屬'}
            title={member.collapsed ? '展開分支' : '收合分支'}
          >
            {member.collapsed ? <GitBranch size={13} /> : <ChevronDown size={13} />}
          </button>
        )}

      </article>
    </>
  )
}

export const OrgNode = memo(OrgNodeComponent)
