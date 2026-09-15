import { useEffect, useRef, useState } from 'react'
import type { Employee } from '../types'
import { assignManagedEmployeeNumber, ManagedIdentityApiError } from '../managedIdentity/apiClient'
import { deriveManagedUsername, parseEmployeeNumber } from '../managedIdentity/employeeNumber'
import type { ManagedIdentityReadModelV1 } from '../managedIdentity/types'
import { WorkspacePortal } from './workspace/WorkspaceOverlayHosts'

export function EmployeeNumberDialog({ employee, view, open, onClose, onSuccess }: { employee: Employee; view: ManagedIdentityReadModelV1; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [value, setValue] = useState(view.employeeNumber.value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) { previousFocusRef.current?.focus(); previousFocusRef.current = null; return }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setValue(view.employeeNumber.value ?? ''); setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, view.employeeNumber.value])
  if (!open) return null
  const parsed = parseEmployeeNumber(value)
  const preview = parsed.ok ? deriveManagedUsername(parsed.value) : null
  const submit = async () => {
    if (!parsed.ok || busy || !view.capabilities.manageNumber) { setError('請輸入有效的 JFS 員工編號。'); return }
    setBusy(true); setError('')
    try {
      await assignManagedEmployeeNumber(employee.id, { commandId: crypto.randomUUID(), expectedRegistryRevision: view.registryRevision, expectedWorkspaceRevision: view.workspaceRevision, employeeNumber: parsed.value })
      onSuccess(); onClose()
    } catch (caught) {
      const code = caught instanceof ManagedIdentityApiError ? caught.code : ''
      setError(code === 'EMPLOYEE_NUMBER_CONFLICT' ? '此員工編號已分配給其他員工。' : code === 'EMPLOYEE_NUMBER_RETIRED' ? '此員工編號已退休，不能再次使用。' : code === 'REVISION_CONFLICT' ? '資料已被其他管理者更新，請重新載入後再試。' : '目前無法完成設定，請稍後再試。')
    } finally { setBusy(false) }
  }
  return <WorkspacePortal scope="global"><div className="employee-account-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><form className="employee-account-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-number-dialog-title" onSubmit={(event) => { event.preventDefault(); void submit() }}>
    <header><h2 id="employee-number-dialog-title">設定員工編號</h2><p>{employee.name}</p></header>
    <label className="dialog-field"><span>JFS 員工編號</span><input ref={inputRef} value={value} onChange={(event) => { setValue(event.target.value); setError('') }} placeholder="JFS0001" autoComplete="off" /></label>
    <p className={error ? 'dialog-field__help is-error' : 'dialog-field__help'} role={error ? 'alert' : undefined}>{error || (preview ? '預計登入名稱：' + preview : '格式為 JFS 加 4 位數字；舊編號永久保留，不能重複使用。')}</p>
    <footer><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button button--primary" disabled={busy || !parsed.ok}>{busy ? '儲存中…' : '儲存編號'}</button></footer>
  </form></div></WorkspacePortal>
}
