import { useEffect, useRef, useState } from 'react'
import type { Employee } from '../types'
import { WorkspacePortal } from './workspace/WorkspaceOverlayHosts'
import { AccountEnrollmentApiError, findExistingAccount, inviteEmployeeAccount, linkExistingAccount } from '../accountEnrollment/apiClient'
import type { EmployeeAccountAccessViewV1, ExistingAccountCandidateViewV1 } from '../accountEnrollment/types'

export interface EmployeeAccountSetupDialogProps {
  employee: Employee
  view: EmployeeAccountAccessViewV1
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function EmployeeAccountSetupDialog({ employee, view, open, onClose, onSuccess }: EmployeeAccountSetupDialogProps) {
  const [mode, setMode] = useState<'invite' | 'existing'>(view.capabilities.invite ? 'invite' : 'existing')
  const [email, setEmail] = useState('')
  const [candidate, setCandidate] = useState<ExistingAccountCandidateViewV1 | null>(null)
  const [error, setError] = useState<AccountEnrollmentApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setMode(view.capabilities.invite ? 'invite' : 'existing'); setEmail(''); setCandidate(null); setError(null)
      window.requestAnimationFrame(() => emailRef.current?.focus())
    } else {
      previousFocusRef.current?.focus(); previousFocusRef.current = null
    }
  }, [open, view.capabilities.invite])
  if (!open) return null
  const submit = async () => {
    if (!email.trim() || busy) return
    setBusy(true); setError(null)
    try {
      if (mode === 'invite') await inviteEmployeeAccount({ commandId: crypto.randomUUID(), employeeId: employee.id, email })
      else if (!candidate) { setCandidate(await findExistingAccount({ employeeId: employee.id, email })); setBusy(false); return }
      else await linkExistingAccount({ commandId: crypto.randomUUID(), employeeId: employee.id, candidateToken: candidate.candidateToken, expectedGovernanceRevision: view.governanceRevision })
      onSuccess(); onClose()
    } catch (value) { setError(value instanceof AccountEnrollmentApiError ? value : new AccountEnrollmentApiError('GOVERNANCE_READ_FAILED', 500)) } finally { setBusy(false) }
  }
  return <WorkspacePortal scope="global">
    <div className="employee-account-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="employee-account-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-account-dialog-title" onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); return }
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !busy) { event.preventDefault(); void submit(); return }
        if (event.key !== 'Tab') return
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
        if (focusable.length === 0) return
        const first = focusable[0]; const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
        <header><h2 id="employee-account-dialog-title">設定登入帳號</h2><p>{employee.name}</p></header>
        {view.capabilities.invite && view.capabilities.link && <div className="employee-account-dialog__modes" role="radiogroup" aria-label="帳號設定方式">
          <label><input type="radio" checked={mode === 'invite'} onChange={() => { setMode('invite'); setCandidate(null) }} />邀請新帳號</label>
          <label><input type="radio" checked={mode === 'existing'} onChange={() => { setMode('existing'); setCandidate(null) }} />連結既有帳號</label>
        </div>}
        <label className="inspector-field"><span>公司 Email</span><input ref={emailRef} value={email} onChange={(event) => { setEmail(event.target.value); setCandidate(null) }} autoComplete="off" inputMode="email" aria-invalid={error?.field === 'email' ? 'true' : undefined} /></label>
        {mode === 'existing' && candidate && <div className="employee-account-dialog__candidate" role="status"><strong>{candidate.candidate.emailHint}</strong><small>{candidate.candidate.providerLabel} · 可連結</small></div>}
        {error && <div className="directory-detail__identity-error" role="alert">{error.code === 'WORK_EMAIL_INVALID' ? '請輸入有效公司 Email。' : error.code === 'WORK_EMAIL_DOMAIN_NOT_ALLOWED' ? '請使用公司管理的 Email 網域。' : error.code === 'ACCOUNT_ALREADY_EXISTS' ? '此 Email 已有帳號，請改用連結既有帳號。' : error.code === 'ACCOUNT_CANDIDATE_NOT_FOUND' ? '找不到可連結的帳號。' : '目前無法完成設定，請稍後再試。'}</div>}
        {view.deliveryMode === 'simulated' && <small className="employee-account-dialog__hint">地端模擬，不會寄出 Email</small>}
        <footer><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button><button type="button" className="button button--primary" disabled={busy || !email.trim()} onClick={() => void submit()}>{busy ? '處理中…' : mode === 'existing' && !candidate ? '搜尋帳號' : mode === 'existing' ? '連結帳號' : '送出邀請'}</button></footer>
      </section>
    </div>
  </WorkspacePortal>
}
