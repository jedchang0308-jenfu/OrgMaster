import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import { describeGovernanceFailure, type GovernanceFailureView } from '../governance/governancePresentation'
import { linkCurrentGovernanceIdentity, loadGovernance, loadGovernanceSession, patchGovernanceDraft, type GovernanceApiSnapshot, type GovernanceSession } from '../governance/apiClient'
import type { GovernanceIdentityLinkViewV1 } from '../governance/governancePresentation'
import type { GovernanceCommandV2 } from '../governance/types'
import type { Employee } from '../types'

type Props = {
  employee: Employee
  mutationBoundaryAllowed: boolean
  refreshToken?: number
  onChanged?: () => void
}

type LoadState = 'loading' | 'ready'

const accountTypeLabel: Record<string, string> = {
  human_personal: '日常帳號',
  human_privileged: '特權帳號',
  legacy_shared: '共用帳號',
  service: '服務帳號',
}

export function EmployeeIdentitySection({ employee, mutationBoundaryAllowed, refreshToken = 0, onChanged }: Props) {
  const [snapshot, setSnapshot] = useState<GovernanceApiSnapshot | null>(null)
  const [session, setSession] = useState<GovernanceSession | null>(null)
  const [revision, setRevision] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [failure, setFailure] = useState<GovernanceFailureView | null>(null)
  const [busy, setBusy] = useState(false)
  const requestSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current
    setLoadState('loading')
    setFailure(null)
    try {
      const [loaded, currentSession] = await Promise.all([loadGovernance(), loadGovernanceSession()])
      if (sequence !== requestSequence.current) return false
      setSnapshot(loaded.payload)
      setRevision(loaded.revision || loaded.payload.revision)
      setSession(currentSession.payload)
      setLoadState('ready')
      return true
    } catch (error) {
      if (sequence !== requestSequence.current) return false
      setFailure(describeGovernanceFailure(error))
      setLoadState('ready')
      return false
    }
  }, [])

  useEffect(() => { void reload() }, [employee.id, refreshToken, reload])

  const links = useMemo(() => snapshot?.document.draft.identityLinks.filter((link) => link.employeeId === employee.id) ?? [], [employee.id, snapshot])
  const activeAdmissionIds = useMemo(() => new Set((snapshot?.document.draft.principalAdmissions ?? []).filter((admission) => admission.status === 'active' && admission.identityLinkId).map((admission) => admission.identityLinkId as string)), [snapshot])
  const actorLink = useMemo(() => snapshot?.document.draft.identityLinks.find((link) => link.principalId === session?.actor.principalId), [session?.actor.principalId, snapshot])
  const canMutate = mutationBoundaryAllowed && Boolean(session?.capabilities.manage) && employee.status === 'active'
  const actorIsLinkedElsewhere = Boolean(actorLink && actorLink.employeeId !== employee.id)

  const applyResult = useCallback((result: { payload: { document: GovernanceApiSnapshot['document']; status: string }; revision: string }) => {
    setSnapshot((current) => current ? { ...current, document: result.payload.document } : current)
    setRevision(result.revision || revision)
    onChanged?.()
  }, [onChanged, revision])

  const linkCurrent = useCallback(async () => {
    if (!canMutate) return
    setBusy(true)
    setFailure(null)
    try {
      const result = await linkCurrentGovernanceIdentity(revision, crypto.randomUUID(), employee.id)
      applyResult(result)
    } catch (error) {
      setFailure(describeGovernanceFailure(error))
    } finally {
      setBusy(false)
    }
  }, [applyResult, canMutate, employee.id, revision])

  const setLinkStatus = useCallback(async (link: GovernanceIdentityLinkViewV1, status: 'active' | 'inactive') => {
    if (!canMutate || activeAdmissionIds.has(link.id) || link.principalId === session?.actor.principalId) return
    setBusy(true)
    setFailure(null)
    const command: GovernanceCommandV2 = { type: 'SET_IDENTITY_LINK_STATUS', commandId: crypto.randomUUID(), reason: status === 'active' ? '重新啟用身分連結' : '停用身分連結', id: link.id, status }
    try {
      const result = await patchGovernanceDraft(revision, command)
      applyResult(result)
    } catch (error) {
      setFailure(describeGovernanceFailure(error))
    } finally {
      setBusy(false)
    }
  }, [activeAdmissionIds, applyResult, canMutate, revision, session?.actor.principalId])

  const currentLink = actorLink?.employeeId === employee.id ? actorLink : null
  const showLinkAction = canMutate && !actorLink
  const showReactivateAction = canMutate && currentLink?.status === 'inactive'

  return (
    <section className="inspector__section employee-identity-section" aria-labelledby={`employee-identity-heading-${employee.id}`}>
      <div className="section-heading">
        <span id={`employee-identity-heading-${employee.id}`}>登入身分</span>
        {loadState === 'ready' && <small>{links.length} 個連結</small>}
      </div>
      {loadState === 'loading' && !snapshot && <div className="directory-detail__identity-state" role="status">載入登入身分…</div>}
      {failure && <div className="directory-detail__identity-error" role="alert"><span>{failure.message}</span><button type="button" className="button button--quiet" onClick={() => void reload()}><RefreshCw size={13} aria-hidden="true" />重新載入</button></div>}
      {actorIsLinkedElsewhere && <div className="directory-detail__identity-note" role="status">目前登入身分已連結其他員工，不能在此改綁。</div>}
      {links.length > 0 ? (
        <div className="directory-detail__identity-list">
          {links.map((link) => {
            const admission = snapshot?.document.draft.principalAdmissions?.find((candidate) => candidate.identityLinkId === link.id && candidate.status === 'active')
            const isCurrent = link.principalId === session?.actor.principalId
            const isReadOnly = Boolean(admission) || isCurrent
            return (
              <div className="directory-detail__identity-row" key={link.id}>
                <div className="directory-detail__identity-copy">
                  <strong>{link.subjectHint}</strong>
                  <small>{link.issuer} · {accountTypeLabel[admission?.accountType ?? ''] ?? '未分類'}</small>
                </div>
                <span className={`directory-detail__identity-status is-${link.status}`}>{link.status === 'active' ? '有效' : '停用'}</span>
                {isReadOnly ? <small className="directory-detail__identity-readonly">{admission ? '已有帳號准入，請由准入流程管理' : '目前登入身分'}</small> : canMutate ? <button type="button" className="button button--quiet" disabled={busy} onClick={() => void setLinkStatus(link, link.status === 'active' ? 'inactive' : 'active')}>{link.status === 'active' ? '停用' : '重新啟用'}</button> : null}
              </div>
            )
          })}
        </div>
      ) : !failure && loadState === 'ready' ? <div className="directory-detail__identity-empty"><Link2 size={15} aria-hidden="true" /><span>尚未連結登入身分</span></div> : null}
      {(showLinkAction || showReactivateAction) && <button type="button" className="button button--primary directory-detail__identity-primary" disabled={busy} onClick={() => void linkCurrent()}><ShieldCheck size={14} aria-hidden="true" />{showReactivateAction ? '重新啟用目前登入身分' : '連結目前登入身分'}</button>}
      {!canMutate && !actorIsLinkedElsewhere && employee.status === 'inactive' && <div className="directory-detail__identity-note">停用員工不能連結登入身分。</div>}
    </section>
  )
}
