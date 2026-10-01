import { useEffect, useMemo, useState } from 'react'
import {
  loadPrivilegedAssignmentWorkspace,
  previewPrivilegedAssignment,
  publishPrivilegedAssignment,
  type PrivilegedAssignmentOperationResponse,
  type PrivilegedAssignmentWorkspace,
} from '../governance/apiClient'
import type { PrivilegedAssignmentRequest } from '../governance/privilegedAssignments'
import { describeGovernanceFailure, type GovernanceFailureView } from '../governance/governancePresentation'
import type { Employee } from '../types'

type Props = {
  employees: Employee[]
  workspaceMutationAllowed: boolean
  onChanged?: () => void | Promise<void>
}

type PendingOperation = {
  request: PrivilegedAssignmentRequest
  label: '授予' | '撤銷'
}

const BLOCKER_LABELS: Record<string, string> = {
  DEVICE_READ_ONLY: '目前裝置僅供閱讀。',
  PRIVILEGED_MUTATION_REQUIRED: '需要既有的 cross-app override 授權。',
  NO_ELIGIBLE_PRINCIPAL: '目前沒有可授予的 human_privileged 身分。',
}

function employeeName(employees: Employee[], employeeId: string) {
  return employees.find((employee) => employee.id === employeeId)?.name ?? '已移除員工'
}

function blockerLabel(code: string) {
  return BLOCKER_LABELS[code] ?? describeGovernanceFailure({ code }).message
}

function requestBase(workspace: PrivilegedAssignmentWorkspace, reason: string) {
  return {
    applicationId: 'ai-pdm' as const,
    stableRoleId: 'role-system-admin' as const,
    expected: {
      catalogVersion: workspace.catalogVersion,
      catalogPayloadHash: workspace.catalogPayloadHash,
      governanceRevision: workspace.governanceRevision,
      organizationRevision: workspace.organizationRevision,
    },
    reason: reason.trim(),
  }
}

function statusLabel(status: string) {
  if (status === 'applied') return '已套用'
  if (status === 'replayed') return '已重播既有收據'
  if (status === 'processing') return '處理中'
  if (status === 'rejected') return '已拒絕'
  return status
}

export function GovernancePrivilegedAssignments({ employees, workspaceMutationAllowed, onChanged }: Props) {
  const [workspace, setWorkspace] = useState<PrivilegedAssignmentWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<GovernanceFailureView | null>(null)
  const [notice, setNotice] = useState('')
  const [selectedAdmissionId, setSelectedAdmissionId] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<PendingOperation | null>(null)
  const [previewResponse, setPreviewResponse] = useState<PrivilegedAssignmentOperationResponse | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setWorkspace(null)
    setError(null)
    setPending(null)
    setPreviewResponse(null)
    void loadPrivilegedAssignmentWorkspace()
      .then((result) => {
        if (!alive) return
        setWorkspace(result.payload)
        setSelectedAdmissionId('')
      })
      .catch((failure) => {
        if (alive) setError(describeGovernanceFailure(failure))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [reloadToken])

  const blockers = useMemo(() => {
    if (!workspace) return []
    const values = [...workspace.blockers]
    if (!workspaceMutationAllowed) values.push('DEVICE_READ_ONLY')
    return [...new Set(values)]
  }, [workspace, workspaceMutationAllowed])
  const mutationAllowed = Boolean(workspace?.mutationAllowed && workspaceMutationAllowed && blockers.length === 0)
  const selectedPrincipal = workspace?.eligiblePrincipals.find((candidate) => candidate.principalAdmissionId === selectedAdmissionId)

  useEffect(() => {
    if (!mutationAllowed) {
      setPending(null)
      setPreviewResponse(null)
    }
  }, [mutationAllowed])

  function setLocalFailure(code: string, message: string) {
    setError({ code, message, canReload: false })
  }

  async function createPreview(operation: PendingOperation) {
    if (!mutationAllowed) return
    if (!operation.request.reason.trim()) {
      setLocalFailure('INVALID_COMMAND', '請填寫本次特權操作原因。')
      return
    }
    setBusy(true)
    setError(null)
    setNotice('')
    setPending(operation)
    setPreviewResponse(null)
    try {
      const result = await previewPrivilegedAssignment(operation.request)
      setPreviewResponse(result.payload)
    } catch (failure) {
      setPending(null)
      setError(describeGovernanceFailure(failure))
    } finally {
      setBusy(false)
    }
  }

  function previewGrant() {
    if (!workspace || !selectedPrincipal) return
    const request: PrivilegedAssignmentRequest = {
      ...requestBase(workspace, reason),
      operation: 'grant_system_admin',
      employeeId: selectedPrincipal.employeeId,
      principalAdmissionId: selectedPrincipal.principalAdmissionId,
    }
    void createPreview({ request, label: '授予' })
  }

  function previewRevoke(assignment: PrivilegedAssignmentWorkspace['assignments'][number]) {
    if (!workspace) return
    const request: PrivilegedAssignmentRequest = {
      ...requestBase(workspace, reason),
      operation: 'revoke_system_admin',
      assignmentId: assignment.assignmentId,
    }
    void createPreview({ request, label: '撤銷' })
  }

  async function publish() {
    if (!mutationAllowed || !pending || !previewResponse) return
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      const result = await publishPrivilegedAssignment(pending.request, crypto.randomUUID(), previewResponse.requestHash, previewResponse.preview.previewHash)
      const receipt = result.payload
      if (receipt.receiptStatus === 'rejected') {
        setError(describeGovernanceFailure({ code: receipt.decisionCode ?? 'GOVERNANCE_WRITE_FAILED' }))
        return
      }
      setNotice(`特權設定${pending.label}${statusLabel(receipt.receiptStatus)}；安全告警與 session refresh 已進入收據流程。`)
      setPending(null)
      setPreviewResponse(null)
      setReason('')
      setSelectedAdmissionId('')
      setReloadToken((value) => value + 1)
      void onChanged?.()
    } catch (failure) {
      setError(describeGovernanceFailure(failure))
    } finally {
      setBusy(false)
    }
  }

  return <section className="governance-privileged" aria-labelledby="governance-privileged-title">
    <header className="governance-privileged__header">
      <div><small>AI-PDM · cross-app override</small><h3 id="governance-privileged-title">特權設定</h3></div>
      <span className="governance-privileged__risk">高風險 · global</span>
    </header>
    <p className="governance-muted">system_admin 只能透過既有的特權身分 admission 管理；每次變更都會留下可追溯收據。</p>
    {loading && <p className="governance-privileged__empty" role="status">載入特權工作區…</p>}
    {error && <div className="governance-privileged__error" role="alert"><span>{error.message}</span>{error.canReload && <button type="button" className="button" onClick={() => setReloadToken((value) => value + 1)}>重新載入</button>}</div>}
    {notice && <div className="governance-privileged__notice" role="status">{notice}</div>}
    {workspace && <>
      <div className={`governance-privileged__state${mutationAllowed ? ' is-enabled' : ''}`} role="status">
        <strong>{mutationAllowed ? '可操作' : '目前為唯讀'}</strong>
        {blockers.length > 0 && <ul>{blockers.map((blocker) => <li key={blocker}>{blockerLabel(blocker)}</li>)}</ul>}
      </div>
      {mutationAllowed && <fieldset className="governance-privileged__grant" disabled={busy}>
        <legend>授予新的 system_admin</legend>
        {workspace.eligiblePrincipals.length === 0
          ? <p className="governance-privileged__empty">尚無可用的 human_privileged 身分。</p>
          : <label>特權身分<select aria-label="特權身分" value={selectedAdmissionId} onChange={(event) => { setSelectedAdmissionId(event.target.value); setPending(null); setPreviewResponse(null) }}><option value="">選擇已核准身分</option>{workspace.eligiblePrincipals.map((candidate) => <option key={candidate.principalAdmissionId} value={candidate.principalAdmissionId}>{employeeName(employees, candidate.employeeId)} · {candidate.principalHint}</option>)}</select></label>}
        <label>操作原因<textarea aria-label="操作原因" value={reason} maxLength={240} onChange={(event) => { setReason(event.target.value); setPending(null); setPreviewResponse(null) }} placeholder="說明授予或撤銷的必要性" /></label>
        {workspace.eligiblePrincipals.length > 0 && <button type="button" className="button button--primary" disabled={busy || !selectedPrincipal || !reason.trim()} onClick={previewGrant}>預覽授予</button>}
      </fieldset>}
      <section className="governance-privileged__assignments" aria-labelledby="governance-privileged-assignments-title">
        <div className="governance-privileged__subheading"><h4 id="governance-privileged-assignments-title">目前持有者</h4><span>{workspace.assignments.length} 筆</span></div>
        {workspace.assignments.length === 0 ? <p className="governance-privileged__empty">尚無 system_admin 持有者。</p> : <div className="governance-table-wrap"><table className="governance-table governance-privileged__table"><thead><tr><th>員工</th><th>特權身分</th><th>期間</th><th>狀態</th><th>操作</th></tr></thead><tbody>{workspace.assignments.map((assignment) => <tr key={assignment.assignmentId}><td>{employeeName(employees, assignment.employeeId)}</td><td>{assignment.principalHint}<small>admission 已核准</small></td><td>{assignment.validFrom.slice(0, 10)} ～ {assignment.validTo?.slice(0, 10) ?? '未設定'}</td><td>{assignment.status === 'active' ? '有效' : '已撤銷'}</td><td><button type="button" className="button button--quiet" disabled={!mutationAllowed || busy || assignment.status !== 'active'} onClick={() => previewRevoke(assignment)}>{assignment.status === 'active' ? '預覽撤銷' : '已撤銷'}</button></td></tr>)}</tbody></table></div>}
      </section>
      {pending && previewResponse && <section className="governance-privileged__preview" aria-live="polite" aria-labelledby="governance-privileged-preview-title"><div className="governance-privileged__subheading"><h4 id="governance-privileged-preview-title">操作預覽：{pending.label}</h4><span>尚未寫入</span></div><dl><div><dt>目標提示</dt><dd>{previewResponse.preview.targetHint}</dd></div><div><dt>持有者</dt><dd>{previewResponse.preview.beforeHolderCount} → {previewResponse.preview.afterHolderCount}</dd></div><div><dt>受影響 session</dt><dd>{previewResponse.preview.affectedSessionCount}</dd></div><div><dt>安全告警</dt><dd>{previewResponse.preview.securityAlertRequired ? '需要' : '不需要'}</dd></div></dl><div className="governance-privileged__actions"><button type="button" className="button button--primary" disabled={busy || !mutationAllowed} onClick={() => void publish()}>確認{pending.label}</button><button type="button" className="button button--quiet" disabled={busy} onClick={() => { setPending(null); setPreviewResponse(null) }}>取消</button></div></section>}
    </>}
  </section>
}
