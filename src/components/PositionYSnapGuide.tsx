import { ORG_NODE_WIDTH } from '../layout'
import type { Point } from '../types'

interface PositionYSnapGuideProps {
  movingPosition: Point
  targetPosition: Point
}

const GUIDE_PADDING = 14

export function PositionYSnapGuide({ movingPosition, targetPosition }: PositionYSnapGuideProps) {
  const left = Math.min(movingPosition.x, targetPosition.x) - GUIDE_PADDING
  const right = Math.max(movingPosition.x, targetPosition.x) + ORG_NODE_WIDTH + GUIDE_PADDING

  return (
    <div className="position-y-snap-guide-layer" aria-hidden="true">
      <div
        className="position-y-snap-guide"
        style={{
          left,
          top: targetPosition.y,
          width: Math.max(ORG_NODE_WIDTH + GUIDE_PADDING * 2, right - left),
        }}
      />
    </div>
  )
}
