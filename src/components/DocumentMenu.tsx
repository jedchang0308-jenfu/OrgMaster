import { useEffect, useRef, useState } from 'react'
import { Archive, Copy, Save } from 'lucide-react'
import type { OrgDocumentKind } from '../documentStorage'

interface DocumentMenuProps {
  isDirty: boolean
  savedAt: string | null
  persistenceKind: OrgDocumentKind | null
  autoSavePending: boolean
  autoSaveError: boolean
  onSave: () => void
  onSaveCopy: () => void
  onBackup: () => void
}

function formatSavedAt(savedAt: string | null) {
  if (!savedAt) return '尚未儲存到這台電腦'
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return '已有本機儲存版本'
  return `最後儲存 ${date.toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
}

export function DocumentMenu({
  isDirty,
  savedAt,
  persistenceKind,
  autoSavePending,
  autoSaveError,
  onSave,
  onSaveCopy,
  onBackup,
}: DocumentMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const run = (action: () => void) => {
    action()
    setOpen(false)
  }

  return (
    <div ref={menuRef} className="document-menu">
      <button
        type="button"
        className={isDirty ? 'icon-button document-menu__trigger is-dirty' : 'icon-button document-menu__trigger'}
        aria-label="儲存與備份"
        aria-expanded={open}
        aria-haspopup="menu"
        title={isDirty ? '儲存與備份（有未儲存變更）' : '儲存與備份'}
        onClick={() => setOpen((current) => !current)}
      >
        <Save size={17} />
      </button>

      {open && (
        <div className="document-menu__panel position-context-menu" role="menu" aria-label="文件操作">
          <div className={isDirty ? 'document-menu__status is-dirty' : 'document-menu__status'} role="status">
            <strong>
              {autoSaveError
                ? '自動保存失敗'
                : autoSavePending
                  ? '自動保存中…'
                  : isDirty
                    ? '有未儲存變更'
                    : persistenceKind === 'draft'
                      ? '已自動保存到電腦'
                      : '目前版本已儲存到電腦'}
            </strong>
            <span>{formatSavedAt(savedAt)}</span>
          </div>
          <div className="position-context-menu__separator" role="separator" />
          <button type="button" role="menuitem" onClick={() => run(onSave)}>
            <Save size={15} /><span>儲存</span><kbd>Ctrl+S</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => run(onSaveCopy)}>
            <Copy size={15} /><span>存副本</span>
          </button>
          <button type="button" role="menuitem" onClick={() => run(onBackup)}>
            <Archive size={15} /><span>備份下載</span>
          </button>
        </div>
      )}
    </div>
  )
}
