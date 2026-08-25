import { createPortal } from 'react-dom'

interface DutyCardDragPreviewProps {
  title: string
  label: string
  point: { x: number; y: number }
  hasCandidate: boolean
}

export function DutyCardDragPreview({ title, label, point, hasCandidate }: DutyCardDragPreviewProps) {
  return createPortal(
    <div
      className={`duty-anomaly-drag-preview${hasCandidate ? ' is-candidate' : ''}`}
      aria-hidden="true"
      style={{ left: point.x + 14, top: point.y + 14 }}
    >
      <strong>{title}</strong>
      <span className="duty-anomaly duty-anomaly--reminder">{label}</span>
    </div>,
    document.body,
  )
}
