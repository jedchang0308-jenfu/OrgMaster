import { memo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ChevronDown, GitBranch } from 'lucide-react'
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type { Assignment, Employee, Point, PositionView, RoleCombinationRiskLevel } from '../types'
import { WORKSPACE_ENTITY_DRAG_MIME, writeWorkspaceEntityDrag, type RegisteredDropTarget, type WorkspaceEntityDragPayloadV1 } from '../workspace/entityDrag'
import type { RelationPlacementCandidate, RelationPlacementInputMode } from '../workspace/relationPlacement'

export interface OrgNodeData extends Record<string, unknown> {
  member: PositionView
  employees: Employee[]
  childCount: number
  onToggle: (id: string) => void
  onSelectPosition: (id: string) => void
  onSelectEmployee: (id: string) => void
  onRelationBegin?: (payload: WorkspaceEntityDragPayloadV1, inputMode: RelationPlacementInputMode, source?: HTMLElement | null) => void
  onRelationCommit?: (target: RegisteredDropTarget, dataTransfer?: DataTransfer) => void
  onRelationCancel?: () => void
  relationPlacementActive?: boolean
  relationPlacementCandidate?: RelationPlacementCandidate | null
  dragOffset?: Point
  showDragPlaceholder?: boolean
  employeeHighlighted: boolean
  riskLevel?: RoleCombinationRiskLevel
  riskRelated: boolean
  onRiskInteraction: (positionId: string | null) => void
  editingEnabled: boolean
  onRelationPreview?: (target: RegisteredDropTarget, event?: DragEvent<HTMLElement>) => void
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
        data-relation-placement-target="position"
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
        onDragEnter={(event) => {
          if (onRelationPreview && Array.from(event.dataTransfer.types).includes(WORKSPACE_ENTITY_DRAG_MIME)) {
            event.preventDefault()
            setRelationDropHover(true)
            onRelationPreview?.({ kind: 'position', positionId: member.id }, event)
            return
          }
          if (!relationPlacementActive) return
        }}
        onDragOver={(event) => {
          if (onRelationPreview && Array.from(event.dataTransfer.types).includes(WORKSPACE_ENTITY_DRAG_MIME)) {
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = relationPlacementCandidate?.effect === 'link' ? 'link' : 'move'
            onRelationPreview?.({ kind: 'position', positionId: member.id }, event)
            return
          }
          if (!relationPlacementActive) return
        }}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return
          setRelationDropHover(false)
        }}
        onDrop={(event) => {
          if (onRelationCommit && Array.from(event.dataTransfer.types).includes(WORKSPACE_ENTITY_DRAG_MIME)) {
            event.preventDefault()
            event.stopPropagation()
            setRelationDropHover(false)
            onRelationCommit({ kind: 'position', positionId: member.id }, event.dataTransfer)
            return
          }
          if (!relationPlacementActive) return
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
              <div className="org-node__employee-row" key={employee.id}>
                <button
                  type="button"
                  className="org-node__employee nodrag"
                  tabIndex={undefined}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectEmployee(employee.id)
                  }}
                  title={`開啟 ${employee.name} 員工明細`}
                  aria-label={`${employee.name}，${assignmentType}職`}
                >
                  <span>
                    {employee.name}
                    <small className={`org-node__employee-type${assignmentType === '兼' ? ' org-node__employee-type--secondary' : ''}`}>
                      {assignmentType}
                    </small>
                  </span>
                </button>
                {editingEnabled && onRelationBegin && <button
                  type="button"
                  className="org-node__relation-placement-handle nodrag"
                  draggable
                  tabIndex={0}
                  aria-label={`拖曳${employee.name}至其他職位`}
                  title="拖曳以移動任職"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation()
                    const payload: WorkspaceEntityDragPayloadV1 = {
                      version: 1,
                      kind: 'employee',
                      sourceModuleId: 'organization',
                      employeeId: employee.id,
                      sourcePositionId: member.id,
                    }
                    writeWorkspaceEntityDrag(event.dataTransfer, payload)
                    onRelationBegin(payload, 'native-drag', event.currentTarget)
                  }}
                  onDragEnd={onRelationCancel}
                >⇢</button>}
              </div>
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
