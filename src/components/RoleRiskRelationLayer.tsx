import { ORG_NODE_WIDTH } from '../layout'
import type { Point, RoleRiskVisualRelation } from '../types'

interface RoleRiskRelationLayerProps {
  relations: RoleRiskVisualRelation[]
  positions: Record<string, Point>
  nodeHeights: Record<string, number>
}

export function RoleRiskRelationLayer({ relations, positions, nodeHeights }: RoleRiskRelationLayerProps) {
  if (relations.length === 0) return null
  return (
    <svg className="role-risk-relation-layer" aria-hidden="true">
      {relations.map((relation) => {
        const [firstId, secondId] = relation.positionIds
        const first = positions[firstId]
        const second = positions[secondId]
        if (!first || !second) return null
        const x1 = first.x + ORG_NODE_WIDTH / 2
        const y1 = first.y + (nodeHeights[firstId] ?? 60) / 2
        const x2 = second.x + ORG_NODE_WIDTH / 2
        const y2 = second.y + (nodeHeights[secondId] ?? 60) / 2
        return (
          <g key={relation.id} className={`role-risk-relation role-risk-relation--${relation.level}`}>
            {relation.level === 'high' && <line className="role-risk-relation__underlay" x1={x1} y1={y1} x2={x2} y2={y2} />}
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
          </g>
        )
      })}
    </svg>
  )
}
