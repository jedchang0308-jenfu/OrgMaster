import { Pencil } from 'lucide-react'

export interface PanelEditButtonProps {
  label: string
  onEdit: () => void
  disabled?: boolean
}

export function PanelEditButton({ label, onEdit, disabled = false }: PanelEditButtonProps) {
  return (
    <button
      type="button"
      className="panel-edit-button"
      onClick={onEdit}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts="F2"
      title={label}
    >
      <Pencil size={15} aria-hidden="true" />
      <span className="panel-edit-button__text">編輯</span>
    </button>
  )
}
