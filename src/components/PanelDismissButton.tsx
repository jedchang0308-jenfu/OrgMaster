import { PanelLeftClose, PanelRightClose } from 'lucide-react'

export interface PanelDismissButtonProps {
  edge: 'left' | 'right'
  label: string
  onDismiss: () => void
  className?: string
}

export function PanelDismissButton({ edge, label, onDismiss, className }: PanelDismissButtonProps) {
  const Icon = edge === 'left' ? PanelLeftClose : PanelRightClose

  return (
    <button
      type="button"
      className={['panel-dismiss-button', className].filter(Boolean).join(' ')}
      onClick={onDismiss}
      aria-label={label}
      aria-keyshortcuts="Escape"
      title={`${label}（Esc）`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  )
}
