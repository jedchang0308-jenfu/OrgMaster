import { useEffect, useMemo, useRef, useState } from 'react'
import type { Employee } from '../types'
import { confirmManagedIdentityLink, findManagedIdentityCandidate, ManagedIdentityApiError } from '../managedIdentity/apiClient'
import { parseManagedPrimaryEmail } from '../managedIdentity/primaryEmail'
import type { ManagedIdentityCandidateResponseV1, ManagedIdentityReadModelV1 } from '../managedIdentity/types'
import { WorkspacePortal } from './workspace/WorkspaceOverlayHosts'

function describeError(error: unknown) {
  const code = error instanceof ManagedIdentityApiError ? error.code : ''
  if (code === 'MANAGED_PRIMARY_EMAIL_INVALID') return '請輸入完整的公司 Google 主帳號。'
  if (code === 'MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED') return '只能連結公司管理網域的 Google 主帳號。'
  if (code === 'DIRECTORY_CANDIDATE_NOT_FOUND') return '找不到這個 Google 主帳號，請確認 Email。'
  if (code === 'DIRECTORY_CANDIDATE_MISMATCH') return 'Google 主帳號資料已變更，請重新查詢。'
  if (code === 'DIRECTORY_USER_INELIGIBLE') return '此 Google 主帳號目前無法使用，請由 Workspace 管理員檢查帳號狀態。'
  if (code === 'REVISION_CONFLICT') return '員工資料已更新，請重新載入後再試。'
  if (code === 'DIRECTORY_READ_UNAVAILABLE') return '目前無法讀取 Google Directory，請稍後重試。'
  if (code === 'IDEMPOTENCY_CONFLICT') return '這次確認資料不一致，請返回重新查詢。'
  if (code === 'CANDIDATE_INVALID') return '查詢結果已失效，請重新查詢。'
  if (code === 'DIRECTORY_IDENTITY_CONFLICT') return '此 Google 主帳號已連結，未變更任何資料。'
  return '目前無法完成身分連結，未變更任何資料。'
}

export function ManagedIdentityLinkDialog({ employee, view, open, onClose, onSuccess }: { employee: Employee; view: ManagedIdentityReadModelV1; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [primaryEmail, setPrimaryEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [candidate, setCandidate] = useState<ManagedIdentityCandidateResponseV1 | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const commandIdRef = useRef('')
  const parsed = useMemo(() => parseManagedPrimaryEmail(primaryEmail, view.managedDomain ?? 'jenfu.com.tw'), [primaryEmail, view.managedDomain])

  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
      return
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPrimaryEmail('')
    setTouched(false)
    setCandidate(null)
    setBusy(false)
    setError('')
    commandIdRef.current = ''
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => { if (candidate) window.requestAnimationFrame(() => confirmRef.current?.focus()) }, [candidate])

  if (!open) return null

  const lookup = async () => {
    setTouched(true)
    if (busy || !parsed.ok || view.employeeNumber.status !== 'assigned') return
    setBusy(true)
    setError('')
    try {
      const next = await findManagedIdentityCandidate(employee.id, { expectedWorkspaceRevision: view.workspaceRevision ?? null, expectedRegistryRevision: view.registryRevision ?? '0', primaryEmail: parsed.value })
      commandIdRef.current = crypto.randomUUID()
      setCandidate(next)
    } catch (caught) { setError(describeError(caught)) }
    finally { setBusy(false) }
  }

  const confirm = async () => {
    if (!candidate || busy) return
    setBusy(true)
    setError('')
    try {
      await confirmManagedIdentityLink(employee.id, { commandId: commandIdRef.current, candidateToken: candidate.candidateToken, expectedWorkspaceRevision: candidate.workspaceRevision, expectedRegistryRevision: candidate.registryRevision })
      onSuccess()
      onClose()
    } catch (caught) {
      const retryable = caught instanceof ManagedIdentityApiError && (caught.status >= 500 || caught.code === 'DIRECTORY_READ_UNAVAILABLE')
      setError(describeError(caught))
      if (!retryable) {
        setCandidate(null)
        commandIdRef.current = ''
        window.requestAnimationFrame(() => inputRef.current?.focus())
      }
    } finally { setBusy(false) }
  }

  const back = () => {
    if (busy) return
    setCandidate(null)
    commandIdRef.current = ''
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const validationClass = !touched || !primaryEmail ? '' : parsed.ok ? 'is-valid' : 'is-invalid'
  const helper = error || (!touched || !primaryEmail ? `請輸入 @${view.managedDomain ?? 'jenfu.com.tw'} 的主要 Email。` : parsed.ok ? '帳號格式與公司網域符合。' : parsed.code === 'MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED' ? 'Email 必須使用公司管理網域。' : '請輸入完整且有效的 Email。')

  return <WorkspacePortal scope="global">
    <div className="employee-account-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="employee-account-dialog" role="dialog" aria-modal="true" aria-labelledby="managed-identity-link-title" onSubmit={(event) => { event.preventDefault(); void (candidate ? confirm() : lookup()) }} onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); return }
        if (event.key !== 'Tab') return
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input')).filter((element) => !element.hasAttribute('disabled'))
        if (!focusable.length) return
        const first = focusable[0]; const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
        <header><h2 id="managed-identity-link-title">連結 Google 主帳號</h2><p>{employee.name}</p></header>
        {!candidate ? <>
          <label className="dialog-field"><span>Google 主帳號</span><input ref={inputRef} className={validationClass} value={primaryEmail} onChange={(event) => { setPrimaryEmail(event.target.value); setTouched(true); setError('') }} onBlur={() => setTouched(true)} placeholder={`name@${view.managedDomain ?? 'jenfu.com.tw'}`} autoComplete="off" inputMode="email" aria-invalid={touched && !parsed.ok} aria-describedby="managed-primary-email-help" /></label>
          <p id="managed-primary-email-help" className={error || touched && !parsed.ok ? 'dialog-field__help is-error' : 'dialog-field__help'} role={error || touched && !parsed.ok ? 'alert' : undefined}>{parsed.ok && !error ? <span className="sr-only">{helper}</span> : helper}</p>
          <footer><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button button--primary" disabled={busy || !parsed.ok || view.employeeNumber.status !== 'assigned'}>{busy ? '查詢中…' : '查詢帳號'}</button></footer>
        </> : <>
          <div className="managed-identity-confirmation"><span>員工</span><strong>{employee.name}</strong><span>OrgMaster 登入編號</span><strong>{candidate.employee.employeeNumber}</strong><span>Google 主帳號</span><strong>{candidate.directory.primaryEmail}</strong></div>
          {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}
          <footer><button type="button" className="button button--quiet" disabled={busy} onClick={back}>返回修改</button><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button><button ref={confirmRef} type="submit" className="button button--primary" disabled={busy}>{busy ? '確認中…' : '確認連結'}</button></footer>
        </>}
      </form>
    </div>
  </WorkspacePortal>
}
