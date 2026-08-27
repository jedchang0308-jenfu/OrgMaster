import { useEffect, useState } from 'react'

export type GovernanceDialogSummaryItem = { label: string; value: string | number }

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  reasonRequired?: boolean
  blockers?: string[]
  summary?: GovernanceDialogSummaryItem[]
  busy?: boolean
  error?: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function GovernanceConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '確認',
  reasonRequired = false,
  blockers = [],
  summary = [],
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open, title])
  if (!open) return null
  const blocked = blockers.length > 0 || reasonRequired && !reason.trim()
  return (
    <div className="governance-modal-backdrop" role="presentation">
      <form
        className="governance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="governance-dialog-title"
        aria-describedby="governance-dialog-message"
        onSubmit={(event) => { event.preventDefault(); if (!blocked && !busy) onConfirm(reason.trim()) }}
      >
        <h2 id="governance-dialog-title">{title}</h2>
        <p id="governance-dialog-message">{message}</p>
        {summary.length > 0 && <dl className="governance-dialog-summary">{summary.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
        {blockers.length > 0 && <div className="governance-dialog-blockers" role="alert"><strong>發布前需完成</strong><ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
        {reasonRequired && <label className="governance-dialog-reason">變更原因<input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} /></label>}
        {error && <div className="governance-dialog-error" role="alert">{error}</div>}
        <div className="governance-modal__actions">
          <button type="button" className="button button--quiet" onClick={onCancel} disabled={busy}>取消</button>
          <button type="submit" className="button button--primary" disabled={blocked || busy}>{busy ? '處理中…' : confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}
