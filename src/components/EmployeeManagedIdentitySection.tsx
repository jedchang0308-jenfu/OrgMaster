import { useCallback, useEffect, useRef, useState } from 'react'
import { Hash, ShieldCheck } from 'lucide-react'
import type { Employee } from '../types'
import { assignManagedEmployeeNumber, enqueueManagedIdentityRefresh, loadManagedEmployeeNumbers, loadManagedIdentity, ManagedIdentityApiError } from '../managedIdentity/apiClient'
import { parseEmployeeNumber } from '../managedIdentity/employeeNumber'
import type { ManagedEmployeeNumberListItemV1, ManagedIdentityReadModelV1 } from '../managedIdentity/types'
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
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [existingNumbers, setExistingNumbers] = useState<ManagedEmployeeNumberListItemV1[] | null>(null)
  const [existingNumbersLoading, setExistingNumbersLoading] = useState(false)
  const [existingNumbersError, setExistingNumbersError] = useState(false)
  const existingNumbersRequest = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) {
      existingNumbersRequest.current += 1
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
      return
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setValue(view.employeeNumber.value ?? '')
    setError('')
    setConfirmation(null)
    setExistingNumbers(null)
    setExistingNumbersError(false)
    window.requestAnimationFrame(() => inputRef.current?.focus())
    void loadExistingNumbers()
  }, [open, view.employeeNumber.value])
  useEffect(() => {
    if (confirmation) window.requestAnimationFrame(() => confirmRef.current?.focus())
  }, [confirmation])
  if (!open) return null
  const parsed = parseEmployeeNumber(value)
  const currentNumber = view.employeeNumber.value
  const changingNumber = Boolean(currentNumber && parsed.ok && parsed.value !== currentNumber)
  const unchanged = Boolean(currentNumber && parsed.ok && parsed.value === currentNumber)
  const sortedExistingNumbers = existingNumbers ? [...existingNumbers].sort((first, second) => second.employeeNumber.localeCompare(first.employeeNumber)) : null
  const numberConflict = parsed.ok && Boolean(existingNumbers?.some((item) => item.employeeNumber === parsed.value && item.employeeId !== employee.id))
  const inputValidationState = parsed.ok && !numberConflict ? 'is-valid' : 'is-invalid'
  const submit = async () => {
    if (!parsed.ok || busy || !view.capabilities.manageNumber) {
      setError('請輸入有效的 JFS 員工編號。')
      return
    }
    if (numberConflict) {
      setError('此員工編號已存在，請改用其他編號。')
      return
    }
    if (changingNumber && confirmation !== parsed.value) {
      setConfirmation(parsed.value)
      setError('')
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
  const loadExistingNumbers = async () => {
    if (existingNumbersLoading) return
    const requestId = ++existingNumbersRequest.current
    setExistingNumbersLoading(true)
    setExistingNumbersError(false)
    try {
      const result = await loadManagedEmployeeNumbers()
      if (requestId === existingNumbersRequest.current) setExistingNumbers(result.items)
    } catch {
      if (requestId === existingNumbersRequest.current) setExistingNumbersError(true)
    } finally {
      if (requestId === existingNumbersRequest.current) setExistingNumbersLoading(false)
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
        <header><h2 id="employee-number-dialog-title">{confirmation ? '確認變更員工編號' : currentNumber ? '變更員工編號' : '設定員工編號'}</h2><p>{employee.name}</p></header>
        {confirmation ? <>
          <div className="employee-account-dialog__candidate" role="status" aria-describedby="employee-number-change-impact">
            <strong>{currentNumber} → {confirmation}</strong>
          </div>
          <p id="employee-number-change-impact" className="dialog-field__help is-warning">儲存後舊編號將永久保留且不得重用；已連結的 Google 帳號可能需由 Google Admin 同步改名。</p>
          <footer><button type="button" className="button button--quiet" disabled={busy} onClick={() => { setConfirmation(null); window.requestAnimationFrame(() => inputRef.current?.focus()) }}>返回修改</button><button ref={confirmRef} type="submit" className="button button--primary" disabled={busy}>{busy ? '儲存中…' : '確認變更'}</button></footer>
        </> : <>
          <label className="dialog-field"><span>JFS 員工編號</span><input ref={inputRef} value={value} className={inputValidationState} onChange={(event) => { setValue(event.target.value); setError(''); setConfirmation(null) }} placeholder="JFS0001" autoComplete="off" inputMode="text" aria-describedby="employee-number-help" aria-invalid={inputValidationState === 'is-invalid'} /></label>
          <p id="employee-number-help" className={error ? 'dialog-field__help is-error' : 'dialog-field__help'} role={error ? 'alert' : undefined}>{error || '格式為 JFS 加 4 位數字；舊編號永久保留，不能重複使用。'}</p>
          <div className="employee-number-dialog__existing-label">已存在編號</div>
          <div id="employee-number-existing-list" className="employee-number-dialog__existing-popover" role="region" aria-label="已存在編號清單">
            {existingNumbersLoading && <div role="status">讀取中…</div>}
            {!existingNumbersLoading && existingNumbersError && <div className="employee-number-dialog__existing-error" role="alert"><span>目前無法讀取已存在編號。</span><button type="button" className="button button--quiet" onClick={() => void loadExistingNumbers()}>重試</button></div>}
            {!existingNumbersLoading && !existingNumbersError && existingNumbers?.length === 0 && <div className="employee-number-dialog__existing-empty">目前沒有已存在的員工編號。</div>}
            {!existingNumbersLoading && !existingNumbersError && sortedExistingNumbers && sortedExistingNumbers.length > 0 && <ul>
              {sortedExistingNumbers.map((item) => <li key={`${item.employeeId}-${item.employeeNumber}`}><div className="employee-number-dialog__existing-main"><strong>{item.employeeNumber}</strong><span>{item.employeeName}</span></div><small>{item.status === 'retired' ? '歷史保留' : item.employeeId === employee.id ? '目前編號' : '使用中'}</small></li>)}
            </ul>}
          </div>
          <footer><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button button--primary" disabled={busy || !parsed.ok || unchanged}>{busy ? '儲存中…' : changingNumber ? '繼續' : '儲存編號'}</button></footer>
        </>}
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
  const [desktopMutationSurface, setDesktopMutationSurface] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches)
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
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(min-width: 1024px) and (pointer: fine)')
    const update = () => setDesktopMutationSurface(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  if (error?.code === 'IDENTITY_VIEW_REQUIRED') return null
  if (!view && !error) return <section className="inspector__section employee-identity-section" aria-label="員工編號與登入身分"><div className="section-heading"><span>員工編號與登入身分</span></div><div className="directory-detail__identity-state">載入員工身分…</div></section>
  if (!view) return <section className="inspector__section employee-identity-section" aria-label="員工編號與登入身分"><div className="section-heading"><span>員工編號與登入身分</span></div><div className="directory-detail__identity-error" role="alert"><span>{error ? errorMessage(error) : '目前無法讀取公司身分設定。'}</span><button type="button" className="button button--quiet" onClick={() => void reload()}>重新載入</button></div></section>
  const canManage = mutationAllowed && desktopMutationSurface && view.capabilities.manageNumber
  const assigned = view.employeeNumber.status === 'assigned'
  const linked = view.identity.state === 'active'
  const canLink = mutationAllowed && desktopMutationSurface && Boolean(view.capabilities.manageLink) && assigned && view.identity.state !== 'active'
  const canRefresh = mutationAllowed && desktopMutationSurface && Boolean(view.capabilities.refresh) && assigned
  const refresh = async () => {
    if (refreshBusy) return
    setRefreshBusy(true)
    try { await enqueueManagedIdentityRefresh(employee.id, { commandId: crypto.randomUUID(), trigger: 'manual' }); await reload(); onChanged?.() }
    catch { setError(new ManagedIdentityApiError('MANAGED_IDENTITY_REFRESH_FAILED', 503)) }
    finally { setRefreshBusy(false) }
  }
  return <><section className="inspector__section employee-identity-section" aria-labelledby={'managed-identity-heading-' + employee.id}>
    <div className="section-heading"><span id={'managed-identity-heading-' + employee.id}>員工編號與登入身分</span>{assigned && <span className={'directory-detail__identity-status ' + (linked ? 'is-active' : 'is-pending_acceptance')}>{linked ? '已啟用' : '待連結'}</span>}</div>
    <div className="directory-detail__identity-row managed-identity-row">
      <Hash size={15} aria-hidden="true" />
      <div className="directory-detail__identity-copy"><small>OrgMaster 登入編號</small><strong>{view.employeeNumber.value ?? '尚未設定'}</strong></div>
      {canManage && <button type="button" className="button button--quiet" onClick={() => setDialogOpen(true)}>{assigned ? '變更編號' : '設定員工編號'}</button>}
    </div>
    <div className="directory-detail__identity-row managed-identity-row">
      <ShieldCheck size={15} aria-hidden="true" />
      <div className="directory-detail__identity-copy"><small>Google 主帳號</small><strong>{view.identity.primaryEmail ?? '尚未連結'}</strong></div>
      {canLink && <button type="button" className="button button--quiet" onClick={() => setLinkDialogOpen(true)}>連結 Google 主帳號</button>}
      {canRefresh && <button type="button" className="button button--quiet" disabled={refreshBusy} onClick={() => { void refresh() }}>{refreshBusy ? '排程中…' : '重新整理狀態'}</button>}
    </div>
    {assigned && <div className="directory-detail__identity-note">{linked ? 'Google 主帳號已啟用。' : view.identity.state === 'directory_linked_pending_auth' ? '等待員工首次使用 Google 登入。' : '尚未連結 Google 主帳號。'}</div>}
    {!assigned && !canManage && <div className="directory-detail__identity-note">尚未設定員工編號，請聯絡具員工身分管理權限的管理者。</div>}
  </section><NumberDialog employee={employee} view={view} open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={() => { void reload(); onChanged?.() }} /><ManagedIdentityLinkDialog employee={employee} view={view} open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} onSuccess={() => { void reload(); onChanged?.() }} /></>
}
