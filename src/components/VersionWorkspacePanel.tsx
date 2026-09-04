import { Archive, Check, CopyPlus, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OrgWorkspaceVersionSummary } from '../versionWorkspace'

interface VersionWorkspacePanelProps {
  versions: OrgWorkspaceVersionSummary[]
  activeVersionId: string | null
  onSelect: (versionId: string) => void
  onCreate: (sourceVersionId: string, name: string) => void
  onRename: (versionId: string, name: string) => void
  onArchive: (versionId: string) => void
  onRestore: (versionId: string) => void
  onEnterCurrentMaintenance: () => void
  onClose: () => void
  busy?: boolean
  mutationAllowed?: boolean
}

export function VersionWorkspacePanel({
  versions,
  activeVersionId,
  onSelect,
  onCreate,
  onRename,
  onArchive,
  onRestore,
  onEnterCurrentMaintenance,
  onClose,
  busy = false,
  mutationAllowed = true,
}: VersionWorkspacePanelProps) {
  const [draftName, setDraftName] = useState('')
  const [sourceVersionId, setSourceVersionId] = useState(activeVersionId ?? versions[0]?.id ?? '')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const activeVersions = useMemo(() => versions.filter((version) => version.status === 'active'), [versions])
  const archivedVersions = useMemo(() => versions.filter((version) => version.status === 'archived'), [versions])

  const submitCreate = () => {
    if (!draftName.trim() || !sourceVersionId) return
    onCreate(sourceVersionId, draftName)
    setDraftName('')
  }

  return (
    <div className="workspace-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="workspace-drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="workspace-drawer__header">
          <div><span>版本工作區</span><h2 id="workspace-drawer-title">組織方案</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉版本工作區"><X size={17} /></button>
        </header>

        {!mutationAllowed && <div className="workspace-mode-status" role="status">目前裝置僅提供唯讀；可切換版本查看內容</div>}
        {mutationAllowed && <section className="workspace-drawer__create">
          <label>
            <span>從版本建立草稿</span>
            <select value={sourceVersionId} onChange={(event) => setSourceVersionId(event.target.value)}>
              {activeVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}
            </select>
          </label>
          <div className="workspace-drawer__create-row">
            <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="例如：管理部整併方案" maxLength={60} aria-label="草稿名稱" />
            <button type="button" className="button-primary" onClick={submitCreate} disabled={busy || !draftName.trim()}><CopyPlus size={15} />建立</button>
          </div>
        </section>}

        <div className="workspace-drawer__body">
          <div className="workspace-drawer__section-label">目前版本</div>
          <div className="workspace-version-list" role="list">
            {activeVersions.map((version) => {
              const selected = version.id === activeVersionId
              const isCurrent = version.kind === 'current'
              return (
                <div key={version.id} role="listitem" className={`workspace-version-row${selected ? ' is-active' : ''}${version.loadStatus === 'failed' ? ' is-failed' : ''}`}>
                  <button type="button" className="workspace-version-row__main" onClick={() => onSelect(version.id)} disabled={version.loadStatus === 'failed'}>
                    <span className="workspace-version-row__badge">{isCurrent ? '現行' : '草稿'}</span>
                    <span><strong>{version.name}</strong><small>{version.loadStatus === 'failed' ? '目前無法載入' : `更新 ${new Date(version.updatedAt).toLocaleString('zh-Hant')}`}</small></span>
                    {selected && <Check size={15} aria-label="目前選取" />}
                  </button>
                  <div className="workspace-version-row__actions">
                    {isCurrent && selected && mutationAllowed && <button type="button" className="button-secondary workspace-version-row__maintain" onClick={onEnterCurrentMaintenance}>維護</button>}
                    {!isCurrent && mutationAllowed && <>
                      <button type="button" className="icon-button" onClick={() => { setRenameId(version.id); setRenameName(version.name) }} aria-label={`重新命名 ${version.name}`} title="重新命名">⋯</button>
                      <button type="button" className="icon-button" onClick={() => onArchive(version.id)} aria-label={`封存 ${version.name}`} title="封存"><Archive size={14} /></button>
                    </>}
                  </div>
                </div>
              )
            })}
          </div>

          {archivedVersions.length > 0 && <>
            <div className="workspace-drawer__section-label">已封存</div>
            <div className="workspace-version-list" role="list">
              {archivedVersions.map((version) => (
                <div key={version.id} role="listitem" className="workspace-version-row is-archived">
                  <button type="button" className="workspace-version-row__main" onClick={() => onSelect(version.id)} disabled={version.loadStatus === 'failed'}>
                    <span className="workspace-version-row__badge">封存</span><span><strong>{version.name}</strong><small>可還原</small></span>
                  </button>
                  {mutationAllowed && <button type="button" className="icon-button" onClick={() => onRestore(version.id)} aria-label={`還原 ${version.name}`} title="還原"><RotateCcw size={14} /></button>}
                </div>
              ))}
            </div>
          </>}
        </div>

        {mutationAllowed && renameId && <div className="workspace-inline-dialog" role="dialog" aria-label="重新命名草稿">
          <input autoFocus value={renameName} onChange={(event) => setRenameName(event.target.value)} maxLength={60} />
          <button type="button" className="button-secondary" onClick={() => setRenameId(null)}>取消</button>
          <button type="button" className="button-primary" onClick={() => { onRename(renameId, renameName); setRenameId(null) }}>儲存</button>
        </div>}
      </aside>
    </div>
  )
}
