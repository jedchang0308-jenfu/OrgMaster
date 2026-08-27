import { memo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ChevronDown, GitBranch } from 'lucide-react'
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type { Assignment, Employee, EmployeeDragPayload, Point, PositionView, RoleCombinationRiskLevel } from '../types'
import type { DutyConfigurationDropCandidate } from '../dutyConfigurationDrag'

export interface OrgNodeData extends Record<string, unknown> {
  member: PositionView
  employees: Employee[]
  childCount: number
  onToggle: (id: string) => void
  onSelectPosition: (id: string) => void
  onSelectEmployee: (id: string) => void
  onEmployeeDragStart: (event: DragEvent<HTMLElement>, payload: EmployeeDragPayload) => void
  onEmployeeDragEnd: () => void
  onEmployeeDrop: (event: DragEvent<HTMLElement>, targetPositionId: string) => void
  employeeDragging: boolean
  dragOffset?: Point
  showDragPlaceholder?: boolean
  employeeHighlighted: boolean
  riskLevel?: RoleCombinationRiskLevel
  riskRelated: boolean
  onRiskInteraction: (positionId: string | null) => void
  editingEnabled: boolean
  dutyConfigurationActive?: boolean
  dutyDropCandidate?: DutyConfigurationDropCandidate
  dutyKeyboardGrabbed?: boolean
  dutyKeyboardLaneLabel?: string
  onDutyDropPosition?: (positionId: string) => void
  onDutyDragOver?: (positionId: string, event?: DragEvent<HTMLElement>) => void
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
    onEmployeeDragStart,
    onEmployeeDragEnd,
    onEmployeeDrop,
    employeeDragging,
    dragOffset,
    showDragPlaceholder = false,
    employeeHighlighted,
    riskLevel,
    riskRelated,
    onRiskInteraction,
    editingEnabled,
    dutyConfigurationActive = false,
    dutyDropCandidate,
    dutyKeyboardGrabbed = false,
    dutyKeyboardLaneLabel,
    onDutyDropPosition,
    onDutyDragOver,
  } = data
  const [employeeDropHover, setEmployeeDropHover] = useState(false)
  const cardClassName = [
    'org-node',
    editingEnabled ? 'is-position-drag-enabled' : '',
    selected ? 'is-selected' : '',
    employeeDragging ? 'is-employee-drop-target' : '',
    employeeDragging && employeeDropHover ? 'is-employee-drop-hover' : '',
    showDragPlaceholder ? 'is-drag-ghost' : '',
    employeeHighlighted ? 'is-employee-highlighted' : '',
    riskLevel ? 'has-role-risk' : '',
    riskLevel ? `role-risk--${riskLevel}` : '',
    riskRelated ? 'is-role-risk-related' : '',
    dutyConfigurationActive ? 'is-duty-drop-target' : '',
    dutyKeyboardGrabbed ? 'is-duty-keyboard-grabbed' : '',
    dutyDropCandidate ? `duty-drop-${dutyDropCandidate}` : '',
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
        aria-label={`${member.title}，${employees.length > 0 ? employees.map((employee) => employee.name).join('、') : '未指派'}${employeeHighlighted ? '，目前選取員工的任職格' : ''}${riskLevel ? `，${riskLevelLabel(riskLevel)}兼任風險` : ''}${dutyKeyboardGrabbed ? `，按 Enter 放置${dutyKeyboardLaneLabel ?? '工作執掌'}` : ''}${dutyConfigurationActive && dutyDropCandidate ? `，工作執掌落點${dutyDropCandidate === 'command' ? '可配置' : dutyDropCandidate === 'noop' ? '已存在' : '不可用'}` : ''}`}
        data-position-id={member.id}
        data-employee-highlighted={employeeHighlighted ? 'true' : undefined}
        data-role-risk-level={riskLevel}
        tabIndex={dutyConfigurationActive || riskLevel ? 0 : undefined}
        onClick={() => {
          if (dutyConfigurationActive) return
        }}
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
          if (dutyConfigurationActive && onDutyDragOver) {
            event.preventDefault()
            onDutyDragOver(member.id, event)
            return
          }
          if (!editingEnabled || !employeeDragging) return
          event.preventDefault()
          setEmployeeDropHover(true)
        }}
        onDragOver={(event) => {
          if (dutyConfigurationActive && onDutyDragOver) {
            event.preventDefault()
            event.stopPropagation()
            onDutyDragOver(member.id, event)
            return
          }
          if (!editingEnabled || !employeeDragging) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return
          setEmployeeDropHover(false)
        }}
        onDrop={(event) => {
          if (dutyConfigurationActive && onDutyDropPosition) {
            event.preventDefault()
            event.stopPropagation()
            onDutyDropPosition(member.id)
            return
          }
          if (!editingEnabled || !employeeDragging) return
          event.preventDefault()
          event.stopPropagation()
          setEmployeeDropHover(false)
          onEmployeeDrop(event, member.id)
        }}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (!dutyConfigurationActive || !onDutyDropPosition || event.target !== event.currentTarget) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onDutyDropPosition(member.id)
        }}
      >
        <div className="org-node__copy">
          <button
            type="button"
            className="org-node__title nodrag"
            tabIndex={dutyConfigurationActive ? -1 : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onMouseDown={(event) => {
              event.stopPropagation()
              if (!dutyConfigurationActive) onSelectPosition(member.id)
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (!dutyConfigurationActive) onSelectPosition(member.id)
            }}
            aria-label={`開啟 ${member.title || '未命名職位'} 職位明細`}
          >
            <strong>{member.title || '未命名職位'}</strong>
          </button>
          {employees.length > 0 ? employees.map((employee) => {
            const assignmentType = assignmentLabel(member.activeAssignments.find((assignment) => assignment.employeeId === employee.id), employee)
            return (
              <button
                type="button"
                key={employee.id}
                className="org-node__employee nodrag"
                tabIndex={dutyConfigurationActive ? -1 : undefined}
                draggable={editingEnabled}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectEmployee(employee.id)
                }}
                onDragStart={(event) => onEmployeeDragStart(event, {
                  employeeId: employee.id,
                  sourcePositionId: member.id,
                })}
                onDragEnd={onEmployeeDragEnd}
                title={`開啟 ${employee.name} 員工明細；拖曳以移動職位`}
                aria-label={`${employee.name}，${assignmentType}職`}
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
            tabIndex={dutyConfigurationActive ? -1 : undefined}
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
