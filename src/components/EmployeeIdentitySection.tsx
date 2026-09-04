import { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Employee } from '../types'
import { AccountEnrollmentApiError, cancelInvitation, loadEmployeeAccountAccess, resendInvitation, setEmployeeIdentityLinkStatus } from '../accountEnrollment/apiClient'
import type { EmployeeAccountAccessViewV1 } from '../accountEnrollment/types'
import { EmployeeAccountSetupDialog } from './EmployeeAccountSetupDialog'

type Props = {
  employee: Employee
  accountMutationEnvironmentAllowed?: boolean
  mutationBoundaryAllowed?: boolean
  refreshToken?: number
  onChanged?: () => void
  onOpenEmployee?: (employeeId: string) => void
}

const accountTypeLabel: Record<string, string> = { human_personal: '日常帳號', human_privileged: '特權帳號', unclassified: '未分類' }
function visibleError(error: AccountEnrollmentApiError) { if (error.code === 'IDENTITY_VIEW_REQUIRED') return null; if (error.code === 'GOVERNANCE_READ_FAILED') return '目前無法讀取登入帳號，請重新載入。'; return '目前無法完成操作，請稍後再試。' }

export function EmployeeIdentitySection({ employee, accountMutationEnvironmentAllowed = true, mutationBoundaryAllowed, refreshToken = 0, onChanged }: Props) {
  const [view, setView] = useState<EmployeeAccountAccessViewV1 | null>(null)
  const [error, setError] = useState<AccountEnrollmentApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const sequence = useRef(0)
  const environmentAllowed = mutationBoundaryAllowed ?? accountMutationEnvironmentAllowed
  const reload = useCallback(async () => {
    const current = ++sequence.current; setError(null)
    try { const next = await loadEmployeeAccountAccess(employee.id); if (current !== sequence.current) return; setView(next) }
    catch (value) { if (current !== sequence.current) return; if (value instanceof AccountEnrollmentApiError && value.code === 'IDENTITY_VIEW_REQUIRED') { setView(null); setError(value); return } setError(value instanceof AccountEnrollmentApiError ? value : new AccountEnrollmentApiError('GOVERNANCE_READ_FAILED', 500)); setView(null) }
  }, [employee.id])
  useEffect(() => { void reload() }, [reload, refreshToken])
  if (error?.code === 'IDENTITY_VIEW_REQUIRED') return null
  const canSetup = Boolean(view && environmentAllowed && employee.status === 'active' && (view.capabilities.invite || view.capabilities.link))
  const run = async (action: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(null); try { await action(); await reload(); onChanged?.() } catch (value) { setError(value instanceof AccountEnrollmentApiError ? value : new AccountEnrollmentApiError('GOVERNANCE_READ_FAILED', 500)) } finally { setBusy(false) } }
  return <>
    <section className="inspector__section employee-identity-section" aria-labelledby={`employee-identity-heading-${employee.id}`}>
      <div className="section-heading"><span id={`employee-identity-heading-${employee.id}`}>登入帳號</span>{view && canSetup && view.accounts.length + view.enrollments.length > 0 && <button type="button" className="button button--quiet" disabled={busy} onClick={() => setDialogOpen(true)}>新增登入帳號</button>}</div>
      {!view && !error && <div className="directory-detail__identity-state" role="status">載入登入帳號…</div>}
      {error && <div className="directory-detail__identity-error" role="alert"><span>{visibleError(error)}</span><button type="button" className="button button--quiet" onClick={() => void reload()}><RefreshCw size={13} aria-hidden="true" />重新載入</button></div>}
      {view && view.accounts.length === 0 && view.enrollments.length === 0 && <div className="directory-detail__identity-empty"><Link2 size={15} aria-hidden="true" /><span>尚未設定登入帳號</span></div>}
      {view && (view.accounts.length > 0 || view.enrollments.length > 0) && <div className="directory-detail__identity-list">
        {view.accounts.map((account) => <div className="directory-detail__identity-row" key={account.identityLinkId}><div className="directory-detail__identity-copy"><strong>{account.accountHint}</strong><small>{account.providerLabel} · {accountTypeLabel[account.accountType] ?? '未分類'}</small></div><span className={`directory-detail__identity-status is-${account.status}`}>{account.status === 'active' ? '已啟用' : '已停用'}</span>{environmentAllowed && account.linkStatusMutable && <button type="button" className="button button--quiet" disabled={busy} onClick={() => void run(() => setEmployeeIdentityLinkStatus(account.identityLinkId, { commandId: crypto.randomUUID(), employeeId: employee.id, status: account.status === 'active' ? 'inactive' : 'active', expectedGovernanceRevision: view.governanceRevision }))}>{account.status === 'active' ? '停用' : '重新啟用'}</button>}</div>)}
        {view.enrollments.map((enrollment) => <div className="directory-detail__identity-row" key={enrollment.id}><div className="directory-detail__identity-copy"><strong>{enrollment.emailHint}</strong><small>{enrollment.kind === 'invite_new' ? '新帳號邀請' : '既有帳號連結'}</small></div><span className={`directory-detail__identity-status is-${enrollment.status}`}>{enrollment.status === 'pending_acceptance' ? '等待接受' : enrollment.status === 'outcome_unknown' ? '正在確認結果' : enrollment.status === 'failed' || enrollment.status === 'conflict' ? '需要處理' : enrollment.status}</span>{enrollment.expiresAt && <small>到期 {new Date(enrollment.expiresAt).toLocaleDateString('zh-TW')}</small>}{environmentAllowed && enrollment.actions.includes('resend') && <button type="button" className="button button--quiet" disabled={busy} onClick={() => void run(() => resendInvitation(enrollment.id, { commandId: crypto.randomUUID(), expectedEnrollmentRevision: enrollment.revision }))}>重送</button>}{environmentAllowed && enrollment.actions.includes('cancel') && <button type="button" className="button button--quiet" disabled={busy} onClick={() => void run(() => cancelInvitation(enrollment.id, { commandId: crypto.randomUUID(), expectedEnrollmentRevision: enrollment.revision }))}>取消</button>}</div>)}
      </div>}
      {view && canSetup && view.accounts.length === 0 && view.enrollments.length === 0 && <button type="button" className="button button--primary directory-detail__identity-primary" disabled={busy} onClick={() => setDialogOpen(true)}><ShieldCheck size={14} aria-hidden="true" />設定登入帳號</button>}
      {view && employee.status === 'inactive' && <div className="directory-detail__identity-note">停用員工不能設定登入帳號。</div>}
    </section>
    {view && <EmployeeAccountSetupDialog employee={employee} view={view} open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={() => { void reload(); onChanged?.() }} />}
  </>
}
