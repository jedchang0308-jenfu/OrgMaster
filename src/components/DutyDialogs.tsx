import { useState } from 'react'

export function DutyDeleteDialog({ dutyTitle, relationCount, onCancel, onConfirm }: { dutyTitle: string; relationCount: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="duty-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="duty-dialog" role="dialog" aria-modal="true" aria-labelledby="duty-delete-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="duty-delete-title">刪除工作執掌？</h2>
        <p>「{dutyTitle}」及其 {relationCount} 筆職位關係會一起移除，未套用的規劃草稿不受影響。</p>
        <div className="duty-dialog__actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="danger-button" onClick={onConfirm}>確認刪除</button></div>
      </div>
    </div>
  )
}

export function DutyTransferDialog({ sourceTitle, targetTitle, onCancel, onConfirm }: { sourceTitle: string; targetTitle: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="duty-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="duty-dialog" role="dialog" aria-modal="true" aria-labelledby="duty-transfer-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="duty-transfer-title">永久移轉主執行？</h2>
        <p>將「{sourceTitle}」的主執行責任移轉給「{targetTitle}」。審核、協作與會簽關係不會改變。</p>
        <div className="duty-dialog__actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="primary-button" onClick={onConfirm}>確認移轉</button></div>
      </div>
    </div>
  )
}

export function DutyEditDialog({ initialTitle, initialDescription, onCancel, onSave }: { initialTitle?: string; initialDescription?: string | null; onCancel: () => void; onSave: (title: string, description: string | null) => void }) {
  const [title, setTitle] = useState(initialTitle ?? '')
  const [description, setDescription] = useState(initialDescription ?? '')
  const valid = title.trim().length > 0
  return (
    <div className="duty-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="duty-dialog duty-dialog--form" role="dialog" aria-modal="true" aria-labelledby="duty-edit-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="duty-edit-title">{initialTitle ? '編輯工作執掌' : '新增工作執掌'}</h2>
        <label>執掌名稱<input autoFocus value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>說明（選填）<textarea value={description} maxLength={2000} rows={4} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="duty-dialog__actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="primary-button" disabled={!valid} onClick={() => onSave(title.trim(), description.trim() || null)}>儲存</button></div>
      </div>
    </div>
  )
}

