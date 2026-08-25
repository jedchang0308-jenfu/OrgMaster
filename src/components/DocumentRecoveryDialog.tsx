interface DocumentRecoveryDialogProps {
  reason: string
  hasRaw: boolean
  onDownload: () => void
  onCreateNew: () => void
}

export function DocumentRecoveryDialog({ reason, hasRaw, onDownload, onCreateNew }: DocumentRecoveryDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-backdrop__surface">
        <section className="dialog document-recovery" role="alertdialog" aria-modal="true" aria-labelledby="document-recovery-title">
          <div className="dialog__icon dialog__icon--danger">!</div>
          <div className="dialog__content">
          <h2 id="document-recovery-title">無法載入本機組織文件</h2>
          <p>{reason}</p>
          <p className="dialog-field__help is-warning">原始內容未被覆寫。請先下載備份，或明確建立一份新的空白文件。</p>
          </div>
          <div className="dialog__actions">
            {hasRaw && <button type="button" className="button-primary" onClick={onDownload}>下載原始備份</button>}
            <button type="button" className="button-secondary" onClick={onCreateNew}>建立新文件</button>
          </div>
        </section>
      </div>
    </div>
  )
}
