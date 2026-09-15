import { useEffect, useRef, useState } from 'react'
import type { Employee } from '../types'
import { confirmManagedIdentityLink, findManagedIdentityCandidate, ManagedIdentityApiError } from '../managedIdentity/apiClient'
import type { ManagedIdentityCandidateResponseV1, ManagedIdentityReadModelV1 } from '../managedIdentity/types'
import { WorkspacePortal } from './workspace/WorkspaceOverlayHosts'

export function ManagedIdentityLinkDialog({ employee, view, open, onClose, onSuccess }: { employee: Employee; view: ManagedIdentityReadModelV1; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [candidate, setCandidate] = useState<ManagedIdentityCandidateResponseV1 | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLElement | null>(null)
  useEffect(() => { if (!open) { closeRef.current?.focus(); closeRef.current = null; setCandidate(null); setError(''); return }; closeRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setCandidate(null); setError('') }, [open])
  if (!open) return null
  const describeError = (caught: unknown) => {
    const code = caught instanceof ManagedIdentityApiError ? caught.code : ''
    if (code === 'DIRECTORY_CANDIDATE_NOT_FOUND') return '找不到完全相符的 Cloud Identity，請先由 Workspace 管理員建立該帳號。'
    if (code === 'DIRECTORY_CANDIDATE_MISMATCH') return 'Google Directory 的主要 Email 或客戶不符合，未建立任何連結。'
    if (code === 'REVISION_CONFLICT') return '員工資料已更新，請重新載入後再試。'
    if (code === 'DIRECTORY_READ_UNAVAILABLE') return '目前無法讀取 Google Directory，請稍後再試。'
    if (code === 'DIRECTORY_IDENTITY_CONFLICT') return '此 Cloud Identity 已連結其他員工，未變更任何資料。'
    return '目前無法完成身分連結，未變更任何資料。'
  }
  const lookup = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { setCandidate(await findManagedIdentityCandidate(employee.id, { expectedWorkspaceRevision: view.workspaceRevision ?? null, expectedRegistryRevision: view.registryRevision })) } catch (caught) { setError(describeError(caught)) } finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!candidate || busy) return
    setBusy(true); setError('')
    try { await confirmManagedIdentityLink(employee.id, { commandId: crypto.randomUUID(), candidateToken: candidate.candidateToken, expectedWorkspaceRevision: candidate.workspaceRevision, expectedRegistryRevision: candidate.registryRevision }); onSuccess(); onClose() } catch (caught) { setError(describeError(caught)) } finally { setBusy(false) }
  }
  return <WorkspacePortal scope="global"><div className="employee-account-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="employee-account-dialog" role="dialog" aria-modal="true" aria-labelledby="managed-identity-link-title" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button')).filter((element) => !element.hasAttribute('disabled'))
    if (!focusable.length) return
    const first = focusable[0]; const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}>
    <header><h2 id="managed-identity-link-title">連結 Cloud Identity</h2><p>{employee.name}</p></header>
    {!candidate ? <><p className="dialog-field__help">OrgMaster 會以目前員工編號推導的完整 Email，讀取 Google Directory 進行精確比對。此步驟不會寫入 Google。</p><div className="managed-identity-preview"><strong>{view.employeeNumber.derivedUsername}</strong><small>只接受主要 Email 完全相符、同一 Workspace customer 且帳號可用的結果</small></div><button type="button" className="button button--primary" disabled={busy || view.employeeNumber.status !== 'assigned'} onClick={() => { void lookup() }}>{busy ? '查詢中…' : '查詢可連結帳號'}</button></> : <><div className="managed-identity-preview"><strong>{candidate.directory.primaryEmail}</strong><small>Directory user：{candidate.directory.userId}</small></div><p className="dialog-field__help">確認後只建立 OrgMaster 的待首次登入連結，不會替 Google 帳號設定密碼或發送邀請。</p><button type="button" className="button button--primary" disabled={busy} onClick={() => { void confirm() }}>{busy ? '確認中…' : '確認連結'}</button></>}
    {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}<footer><button type="button" className="button button--quiet" disabled={busy} onClick={onClose}>取消</button></footer>
  </section></div></WorkspacePortal>
}
