import { useCallback, useEffect, useRef, useState } from 'react'
import { Hash, ShieldCheck } from 'lucide-react'
import type { Employee } from '../types'
import { assignManagedEmployeeNumber, enqueueManagedIdentityRefresh, loadManagedIdentity, ManagedIdentityApiError } from '../managedIdentity/apiClient'
import { deriveManagedUsername, parseEmployeeNumber } from '../managedIdentity/employeeNumber'
import type { ManagedIdentityReadModelV1 } from '../managedIdentity/types'
import { WorkspacePortal } from './workspace/WorkspaceOverlayHosts'
import { ManagedIdentityLinkDialog } from './ManagedIdentityLinkDialog'

type Props = {
  employee: Employee
  mutationAllowed?: boolean
  refreshToken?: number
  onChanged?: () => void
}

function errorMessage(error: ManagedIdentityApiError) {
  if (error.code === 'IDENTITY_VIEW_REQUIRED') return null
  if (error.code === 'EMPLOYEE_NUMBER_CONFLICT') return '此員工編號已分配給其他員工。'
  if (error.code === 'EMPLOYEE_NUMBER_RETIRED') return '此員工編號已退休，不能再次使用。'
  if (error.code === 'EMPLOYEE_NUMBER_INVALID') return '請輸入 JFS 加 4 位數字，例如 JFS0001。'
  if (error.code === 'REVISION_CONFLICT') return '資料已被其他管理者更新，請重新載入後再試。'
  return '目前無法讀取公司身分設定，請稍後再試。'
}

function NumberDialog({ employee, view, open, onClose, onSuccess }: {
  employee: Employee
  view: ManagedIdentityReadModelV1
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [value, setValue] = useState(view.employeeNumber.value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
      return
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setValue(view.employeeNumber.value ?? '')
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, view.employeeNumber.value])
  if (!open) return null
  const parsed = parseEmployeeNumber(value)
  const preview = parsed.ok ? deriveManagedUsername(parsed.value) : null
  const submit = async () => {
    if (!parsed.ok || busy || !view.capabilities.manageNumber) {
      setError('請輸入有效的 JFS 員工編號。')
      return
    }
    setBusy(true)
    setError('')
    try {
      await assignManagedEmployeeNumber(employee.id, {
        commandId: crypto.randomUUID(),
        expectedRegistryRevision: view.registryRevision,
        expectedWorkspaceRevision: view.workspaceRevision,
        employeeNumber: parsed.value,
      })
      onSuccess()
      onClose()
    } catch (caught) {
      const apiError = caught instanceof ManagedIdentityApiError ? caught : new ManagedIdentityApiError('MANAGED_IDENTITY_WRITE_FAILED', 503)
      setError(errorMessage(apiError) ?? '目前無法完成設定，請稍後再試。')
    } finally {
      setBusy(false)
    }
  }
  return <WorkspacePortal scope="global">
    <div className="employee-account-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="employee-account-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-number-dialog-title" onSubmit={(event) => { event.preventDefault(); void submit() }} onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); return }
        if (event.key !== 'Tab') return
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input')).filter((element) => !element.hasAttribute('disabled'))
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
        <header><h2 id="employee-number-dialog-title">設定員工編號</h2><p>{employee.name}</p></header>
        <label className="dialog-field"><span>JFS 員工編號</span><input ref={inputRef} value={value} onChange={(event) => { setValue(event.target.value); setError('') }} placeholder="JFS0001" autoComplete="off" inputMode="text" aria-describedby="employee-number-help" /></label>
        <p id="employee-number-help" className={error ? 'dialog-field__help is-error' : 'dialog-field__help'} role={error ? 'alert' : undefined}>{error || (preview ? '預計登入名稱：' + preview : '格式為 JFS 加 4 位數字；舊編號永久保留，不能重複使用。')}</p>
        <footer><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button button--primary" disabled={busy || !parsed.ok}>{busy ? '儲存中…' : '儲存編號'}</button></footer>
      </form>
    </div>
  </WorkspacePortal>
}

export function EmployeeManagedIdentitySection({ employee, mutationAllowed = false, refreshToken = 0, onChanged }: Props) {
  const [view, setView] = useState<ManagedIdentityReadModelV1 | null>(null)
  const [error, setError] = useState<ManagedIdentityApiError | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const current = ++sequence.current
    setError(null)
    try {
      const next = await loadManagedIdentity(employee.id)
      if (current === sequence.current) setView(next)
    } catch (caught) {
      if (current !== sequence.current) return
      const nextError = caught instanceof ManagedIdentityApiError ? caught : new ManagedIdentityApiError('MANAGED_IDENTITY_READ_FAILED', 503)
      setError(nextError)
      setView(null)
    }
  }, [employee.id])
  useEffect(() => { void reload() }, [reload, refreshToken])
  if (error?.code === 'IDENTITY_VIEW_REQUIRED') return null
  if (!view && !error) return <section className="inspector__section employee-identity-section" aria-label="公司登入身分"><div className="section-heading"><span>公司登入身分</span></div><div className="directory-detail__identity-state">載入公司身分…</div></section>
  if (!view) return <section className="inspector__section employee-identity-section" aria-label="公司登入身分"><div className="section-heading"><span>公司登入身分</span></div><div className="directory-detail__identity-error" role="alert"><span>{error ? errorMessage(error) : '目前無法讀取公司身分設定。'}</span><button type="button" className="button button--quiet" onClick={() => void reload()}>重新載入</button></div></section>
  const canManage = mutationAllowed && view.capabilities.manageNumber
  const assigned = view.employeeNumber.status === 'assigned'
  const linked = view.identity.state === 'active'
  const canLink = mutationAllowed && Boolean(view.capabilities.manageLink) && assigned && view.identity.state !== 'active'
  const canRefresh = mutationAllowed && Boolean(view.capabilities.refresh) && assigned
  const refresh = async () => {
    if (refreshBusy) return
    setRefreshBusy(true)
    try { await enqueueManagedIdentityRefresh(employee.id, { commandId: crypto.randomUUID(), trigger: 'manual' }); await reload(); onChanged?.() }
    catch { setError(new ManagedIdentityApiError('MANAGED_IDENTITY_REFRESH_FAILED', 503)) }
    finally { setRefreshBusy(false) }
  }
  return <><section className="inspector__section employee-identity-section" aria-labelledby={'managed-identity-heading-' + employee.id}>
    <div className="section-heading"><span id={'managed-identity-heading-' + employee.id}>公司登入身分</span>{assigned && <span className={'directory-detail__identity-status ' + (linked ? 'is-active' : 'is-pending_acceptance')}>{linked ? '已啟用' : '待連結'}</span>}</div>
    <div className="directory-detail__identity-row managed-identity-row">
      <Hash size={15} aria-hidden="true" />
      <div className="directory-detail__identity-copy"><strong>{view.employeeNumber.value ?? '尚未設定員工編號'}</strong><small>{assigned ? '預期登入名稱：' + view.employeeNumber.derivedUsername : 'Google Admin 建立帳號後，由 OrgMaster 設定唯一員工編號'}</small></div>
      {canManage && <button type="button" className="button button--quiet" onClick={() => setDialogOpen(true)}>{assigned ? '變更編號' : '設定編號'}</button>}
      {canLink && <button type="button" className="button button--quiet" onClick={() => setLinkDialogOpen(true)}>連結 Cloud Identity</button>}
      {canRefresh && <button type="button" className="button button--quiet" disabled={refreshBusy} onClick={() => { void refresh() }}>{refreshBusy ? '排程中…' : '重新整理狀態'}</button>}
    </div>
    {assigned && <div className="directory-detail__identity-note"><ShieldCheck size={14} aria-hidden="true" />{linked ? '已連結 Google Cloud Identity；登入帳號由公司員工編號永久對應。' : '目前尚未連結 Google 帳號；請先由 Google Admin 建立 Cloud Identity，再由管理者完成公司帳號連結。'}</div>}
    {!assigned && !canManage && <div className="directory-detail__identity-note">尚未設定員工編號，請聯絡具員工身分管理權限的管理者。</div>}
  </section><NumberDialog employee={employee} view={view} open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={() => { void reload(); onChanged?.() }} /><ManagedIdentityLinkDialog employee={employee} view={view} open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} onSuccess={() => { void reload(); onChanged?.() }} /></>
}
