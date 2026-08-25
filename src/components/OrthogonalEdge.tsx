import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import type { ChildrenAxis } from '../types'

interface OrthogonalEdgeData extends Record<string, unknown> {
  childrenAxis: ChildrenAxis
  horizontalBranchOffset?: number
}

export type OrgFlowEdge = Edge<OrthogonalEdgeData, 'orthogonal'>

const EDGE_CORNER_RADIUS = 10 / 3
const EDGE_AXIS_EPSILON = 0.5
const EDGE_HORIZONTAL_BRANCH_OFFSET = 12

export function getHorizontalBranchOffset(sourceY: number, targetY: number) {
  return Math.min(EDGE_HORIZONTAL_BRANCH_OFFSET, Math.abs(targetY - sourceY) * 0.42)
}

export function getSharedHorizontalBranchOffset(parentY: number, parentHeight: number, childYs: number[]) {
  if (childYs.length === 0) return undefined
  const sourceY = parentY + parentHeight
  const nearestChildY = childYs.reduce((nearest, childY) => (
    Math.abs(childY - sourceY) < Math.abs(nearest - sourceY) ? childY : nearest
  ))
  return getHorizontalBranchOffset(sourceY, nearestChildY)
}

function roundedHorizontalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  horizontalBranchOffset?: number,
) {
  const deltaX = targetX - sourceX
  const deltaY = targetY - sourceY
  // Every horizontal edge from one parent receives the same parent-derived
  // branch offset. Moving one direct report to another organization level must
  // therefore extend the existing parent trunk instead of creating a new lane.
  const bendDistance = Math.min(
    horizontalBranchOffset ?? getHorizontalBranchOffset(sourceY, targetY),
    // A half-gap clamp is only a transient-preview safety guard. It does not
    // reintroduce target-specific routing for valid level layouts.
    Math.abs(deltaY) * 0.5,
  )
  const bendY = sourceY + Math.sign(deltaY) * bendDistance

  if (Math.abs(deltaX) < EDGE_AXIS_EPSILON || Math.abs(deltaY) < EDGE_AXIS_EPSILON) {
    return `M ${sourceX} ${sourceY} V ${bendY} H ${targetX} V ${targetY}`
  }

  const horizontalDirection = Math.sign(deltaX)
  const verticalDirection = Math.sign(deltaY)
  const firstVerticalLength = Math.abs(bendY - sourceY)
  const secondVerticalLength = Math.abs(targetY - bendY)
  const radius = Math.min(
    EDGE_CORNER_RADIUS,
    Math.abs(deltaX) / 2,
    firstVerticalLength,
    secondVerticalLength,
  )

  return [
    `M ${sourceX} ${sourceY}`,
    `V ${bendY - verticalDirection * radius}`,
    `Q ${sourceX} ${bendY} ${sourceX + horizontalDirection * radius} ${bendY}`,
    `H ${targetX - horizontalDirection * radius}`,
    `Q ${targetX} ${bendY} ${targetX} ${bendY + verticalDirection * radius}`,
    `V ${targetY}`,
  ].join(' ')
}

function roundedVerticalPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const deltaX = targetX - sourceX
  const deltaY = targetY - sourceY

  if (Math.abs(deltaX) < EDGE_AXIS_EPSILON || Math.abs(deltaY) < EDGE_AXIS_EPSILON) {
    return `M ${sourceX} ${sourceY} V ${targetY} H ${targetX}`
  }

  const horizontalDirection = Math.sign(deltaX)
  const verticalDirection = Math.sign(deltaY)
  const radius = Math.min(EDGE_CORNER_RADIUS, Math.abs(deltaX), Math.abs(deltaY))

  return [
    `M ${sourceX} ${sourceY}`,
    `V ${targetY - verticalDirection * radius}`,
    `Q ${sourceX} ${targetY} ${sourceX + horizontalDirection * radius} ${targetY}`,
    `H ${targetX}`,
  ].join(' ')
}

export function getOrthogonalEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  childrenAxis: ChildrenAxis,
  horizontalBranchOffset?: number,
) {
  return childrenAxis === 'vertical'
    ? roundedVerticalPath(sourceX, sourceY, targetX, targetY)
    : roundedHorizontalPath(sourceX, sourceY, targetX, targetY, horizontalBranchOffset)
}

export function OrthogonalEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
}: EdgeProps<OrgFlowEdge>) {
  const childrenAxis = data?.childrenAxis ?? 'horizontal'
  const isVertical = childrenAxis === 'vertical'
  const path = getOrthogonalEdgePath(sourceX, sourceY, targetX, targetY, childrenAxis, data?.horizontalBranchOffset)
  const edgeClassName = `org-edge__path ${isVertical ? 'is-vertical' : 'is-horizontal'}`

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={style}
      className={edgeClassName}
    />
  )
}
