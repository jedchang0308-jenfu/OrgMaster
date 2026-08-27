import { Background, BackgroundVariant, Controls, Handle, Position as FlowPosition, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { useMemo, type DragEvent, type KeyboardEvent } from 'react'
import { buildPositionViews, getDepartmentName, TODAY } from '../organization'
import { layoutOrganization, getOrgNodeHeight } from '../layout'
import { buildHierarchyNodes } from '../organizationHierarchy'
import type { OrgDirectoryState, PositionView } from '../types'
import { DUTY_CONFIGURATION_DRAG_MIME } from '../dutyConfigurationDrag'

export interface ProcessOrganizationCanvasProps {
  state: OrgDirectoryState
  selectedPositionId: string | null
  relatedPositionIds: ReadonlySet<string>
  editingEnabled: boolean
  keyboardDropPositionId: string | null
  onSelectPosition: (positionId: string) => void
  onDutyDrop: (positionId: string, event: DragEvent<HTMLElement>) => void
  onDutyDragOver: (positionId: string, event: DragEvent<HTMLElement>) => void
  onKeyboardDrop: (positionId: string) => void
  onKeyboardFocus?: (positionId: string) => void
}

type OrganizationProjectionNode = Node<{
  member: PositionView
  department: string
  dutyCount: number
  selected: boolean
  related: boolean
  keyboardGrabbed: boolean
  onSelect: () => void
  onDutyDrop: (event: DragEvent<HTMLElement>) => void
  onDutyDragOver: (event: DragEvent<HTMLElement>) => void
  onKeyboardDrop: () => void
  onKeyboardFocus: () => void
}, 'organization-projection'>

function OrganizationProjectionNode({ data }: NodeProps<OrganizationProjectionNode>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!data.keyboardGrabbed || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    data.onKeyboardDrop()
  }
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(DUTY_CONFIGURATION_DRAG_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    data.onDutyDragOver(event)
  }
  return <>
    <Handle type="target" position={FlowPosition.Top} isConnectable={false} />
    <Handle type="source" position={FlowPosition.Bottom} isConnectable={false} />
    <article
      className={`process-org-canvas-node${data.selected ? ' is-selected' : ''}${data.related ? ' is-related' : ''}${data.keyboardGrabbed ? ' is-keyboard-target' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${data.member.title}，${data.department}，${data.dutyCount} 項職掌${data.keyboardGrabbed ? '，按 Enter 放置責任' : ''}`}
      onClick={data.onSelect}
      onKeyDown={handleKeyDown}
      onFocus={data.onKeyboardFocus}
      onDragOver={handleDragOver}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(DUTY_CONFIGURATION_DRAG_MIME)) return
        event.preventDefault()
        event.stopPropagation()
        data.onDutyDrop(event)
      }}
    >
      <strong>{data.member.title}</strong>
      <span>{data.department}</span>
      <small>{data.dutyCount} 項職掌</small>
    </article>
  </>
}

const nodeTypes = { 'organization-projection': OrganizationProjectionNode }

export function ProcessOrganizationCanvas({ state, selectedPositionId, relatedPositionIds, editingEnabled, keyboardDropPositionId, onSelectPosition, onDutyDrop, onDutyDragOver, onKeyboardDrop, onKeyboardFocus }: ProcessOrganizationCanvasProps) {
  const members = useMemo(() => buildPositionViews(state.members, state.positions, state.assignments, TODAY), [state.assignments, state.members, state.positions])
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const hierarchy = useMemo(() => buildHierarchyNodes(state), [state])
  const heights = useMemo(() => Object.fromEntries(members.map((member) => [member.id, getOrgNodeHeight(member.activeAssignments.length)])), [members])
  const layout = useMemo(() => layoutOrganization(hierarchy, heights, { mode: 'tree' }), [heights, hierarchy])
  const dutyCountByPositionId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const relation of state.dutyPositionRelations) {
      if (relation.target.kind !== 'position') continue
      counts.set(relation.target.positionId, (counts.get(relation.target.positionId) ?? 0) + 1)
    }
    return counts
  }, [state.dutyPositionRelations])
  const flowNodes = useMemo<OrganizationProjectionNode[]>(() => members
    .filter((member) => layout.visibleIds.has(member.id))
    .map((member) => ({
      id: member.id,
      type: 'organization-projection',
      position: layout.positions[member.id] ?? { x: 0, y: 0 },
      data: {
        member,
        department: getDepartmentName(state.departments, member.departmentId),
        dutyCount: dutyCountByPositionId.get(member.id) ?? 0,
        selected: member.id === selectedPositionId,
        related: relatedPositionIds.has(member.id),
        keyboardGrabbed: keyboardDropPositionId === member.id,
        onSelect: () => onSelectPosition(member.id),
        onDutyDrop: (event) => onDutyDrop(member.id, event),
        onDutyDragOver: (event) => onDutyDragOver(member.id, event),
        onKeyboardDrop: () => onKeyboardDrop(member.id),
        onKeyboardFocus: () => onKeyboardFocus?.(member.id),
      },
      draggable: false,
      selectable: true,
    })), [dutyCountByPositionId, keyboardDropPositionId, layout.positions, layout.visibleIds, members, onDutyDragOver, onDutyDrop, onKeyboardDrop, onKeyboardFocus, onSelectPosition, relatedPositionIds, selectedPositionId, state.departments])
  const flowEdges = useMemo<Edge[]>(() => hierarchy
    .filter((member) => member.parentId && memberById.has(member.parentId))
    .map((member) => ({ id: `org-parent-${member.id}`, source: member.parentId!, target: member.id, type: 'smoothstep', style: { stroke: '#b8c4d6' } })), [hierarchy, memberById])
  return <div className="process-org-canvas" aria-label="組織架構圖責任投放區">
    <ReactFlow<OrganizationProjectionNode, Edge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) => onSelectPosition(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.14, maxZoom: 1.15 }}
      minZoom={0.25}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d8dee8" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
    <div className="process-org-canvas__meta">{editingEnabled ? '拖曳責任到職位，或用鍵盤 Enter 放置' : '唯讀組織架構'} · {flowNodes.length} 職位</div>
  </div>
}
