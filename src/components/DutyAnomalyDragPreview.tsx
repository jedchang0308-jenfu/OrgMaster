import { WorkspacePortal } from './workspace/WorkspaceOverlayHosts'

interface DutyAnomalyDragPreviewProps {
  title: string
  anomalyLabel: string
  severity: 'high' | 'medium' | 'reminder'
  point: { x: number; y: number }
  hasCandidate: boolean
}

export function DutyAnomalyDragPreview({ title, anomalyLabel, severity, point, hasCandidate }: DutyAnomalyDragPreviewProps) {
  return <WorkspacePortal scope="global">
    <div
      className={`duty-anomaly-drag-preview${hasCandidate ? ' is-candidate' : ''}`}
      aria-hidden="true"
      style={{ left: point.x + 14, top: point.y + 14 }}
    >
      <strong>{title}</strong>
      <span className={`duty-anomaly duty-anomaly--${severity}`}>{anomalyLabel}</span>
    </div>
  </WorkspacePortal>
}
