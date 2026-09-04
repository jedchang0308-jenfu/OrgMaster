import { ChevronDown, GitBranch } from 'lucide-react'
import type { OrgWorkspaceVersionSummary, WorkspaceMode } from '../versionWorkspace'

const MODE_STATUS: Record<WorkspaceMode, { key: string; label: string; description: string }> = {
  'current-view': {
    key: 'read-only',
    label: '唯讀',
    description: '目前只能查看；選擇草稿或進入現行版維護後可編輯',
  },
  'current-maintenance': {
    key: 'maintenance',
    label: '維護中',
    description: '目前可編輯；變更會直接寫入現行版',
  },
  'draft-edit': {
    key: 'editable',
    label: '可編輯',
    description: '目前可編輯；草稿變更會自動儲存',
  },
}

interface VersionSwitcherProps {
  versions: OrgWorkspaceVersionSummary[]
  activeVersionId: string | null
  mode: WorkspaceMode
  onSelect: (versionId: string) => void
  onOpenWorkspace: () => void
  onToggleCurrentMaintenance: () => void
  mutationAllowed?: boolean
}

export function VersionSwitcher({ versions, activeVersionId, mode, onSelect, onOpenWorkspace, onToggleCurrentMaintenance, mutationAllowed = true }: VersionSwitcherProps) {
  const active = versions.find((version) => version.id === activeVersionId) ?? versions[0]
  const status = MODE_STATUS[mode]
  const canToggleCurrentMaintenance = mutationAllowed && active?.kind === 'current' && (mode === 'current-view' || mode === 'current-maintenance')
  const isCurrentMaintenance = mode === 'current-maintenance'
  const toggleLabel = isCurrentMaintenance ? '編輯中' : '唯讀'
  const toggleDescription = isCurrentMaintenance ? '現在可編輯' : '現在不可編輯'
  return (
    <>
      <div className="version-switcher" data-workspace-mode={mode}>
        <button type="button" className="version-switcher__button" onClick={onOpenWorkspace} aria-label="開啟版本工作區">
          <GitBranch size={15} aria-hidden="true" />
          <span className="version-switcher__copy">
            <strong>{active?.name ?? '版本工作區'}</strong>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <select
          className="version-switcher__select"
          aria-label="切換組織版本"
          value={active?.id ?? ''}
          onChange={(event) => event.target.value && onSelect(event.target.value)}
        >
          {versions.filter((version) => version.loadStatus !== 'failed').map((version) => (
            <option key={version.id} value={version.id}>
              {version.kind === 'current' ? '現行版' : '草稿'}：{version.name}
            </option>
          ))}
        </select>
      </div>
      {canToggleCurrentMaintenance ? <button
        type="button"
        className={`workspace-mode-toggle workspace-mode-toggle--${status.key}`}
        onClick={onToggleCurrentMaintenance}
        aria-pressed={isCurrentMaintenance}
        aria-label={`${toggleLabel}${active?.name ? `：${active.name}` : ''}`}
        title={toggleDescription}
      >
        <span className="workspace-mode-toggle__mark" aria-hidden="true" />
        <span>{toggleLabel}</span>
      </button> : <div
        className={`workspace-mode-status workspace-mode-status--${status.key}`}
        role="status"
        aria-label={`目前模式：${status.label}。${status.description}`}
        title={status.description}
      >
        <span className="workspace-mode-status__mark" aria-hidden="true" />
        <span>{status.label}</span>
      </div>}
    </>
  )
}
