import { useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../auth/AuthGate'
import { activateFmsCatalog, loadFmsCatalogActivationReceipt, loadFmsCatalogActivationWorkspace, previewFmsCatalogActivation,
  type FmsCatalogActivationPreview, type FmsCatalogActivationPreviewRequest, type FmsCatalogActivationWorkspace as Workspace } from '../governance/fmsCatalogActivationApiClient'
import type { FmsCatalogReleaseInput } from '../../server/financialCatalogReleaseStore'
import './FmsRoleAssignmentWorkspace.css'

const PROTOCOL = 'jenfu.fms-catalog-handoff.v1'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
type Handoff = { nonce: string; release: FmsCatalogReleaseInput }
type Pending = { commandId: string; requestHash: string; previewHash: string; request: FmsCatalogActivationPreviewRequest }

/** Both applications retain their own verified session. postMessage carries data, never authority. */
export function FmsCatalogActivationWorkspace() {
  const auth = useAuthSession(), principal = auth?.session.user.principalId ?? ''
  const sessionIdentity = JSON.stringify([principal, auth?.session.user.employeeId, auth?.session.session?.expiresAt])
  const priorIdentity = useRef(sessionIdentity), generation = useRef(0)
  if (priorIdentity.current !== sessionIdentity) { priorIdentity.current = sessionIdentity; generation.current += 1 }
  const identity = useRef(''); identity.current = sessionIdentity + ':' + generation.current
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const handoffRef = useRef<Handoff | null>(null)
  const [reason, setReason] = useState('啟用 FMS 角色目錄')
  const [preview, setPreview] = useState<FmsCatalogActivationPreview | null>(null)
  const previewRequest = useRef<FmsCatalogActivationPreviewRequest | null>(null)
  const pending = useRef<Pending | null>(null)
  const awaitingIssue = useRef(false)
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false)
  const [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null)
  const send = (data: Record<string, unknown>) => {
    if (workspace?.fmsOrigin && window.opener && handoffRef.current)
      window.opener.postMessage({ protocol: PROTOCOL, nonce: handoffRef.current.nonce, ...data }, workspace.fmsOrigin)
  }
  useEffect(() => {
    let current = true
    const owner = identity.current
    handoffRef.current = null; pending.current = null; previewRequest.current = null; awaitingIssue.current = false
    setWorkspace(null); setHandoff(null); setPreview(null); setUnknown(false); setBusy(false); setMessage(null); setError(null)
    if (principal) void loadFmsCatalogActivationWorkspace().then(value => {
      if (!current || identity.current !== owner) return
      setWorkspace(value)
      if (value.fmsOrigin && window.opener) window.opener.postMessage({ protocol: PROTOCOL, type: 'ready' }, value.fmsOrigin)
    }).catch(() => { if (current) setError('目前無法讀取角色目錄，請稍後重試。') })
    return () => { current = false }
  }, [sessionIdentity])
  useEffect(() => {
    if (!workspace?.fmsOrigin || !window.opener) return
    const receive = (event: MessageEvent) => {
      if (event.origin !== workspace.fmsOrigin || event.source !== window.opener || !object(event.data) || event.data.protocol !== PROTOCOL) return
      const data = event.data
      if (data.type === 'init' && !handoffRef.current && typeof data.nonce === 'string' && /^[a-f0-9-]{36}$/u.test(data.nonce) && object(data.release)) {
        const next = { nonce: data.nonce, release: data.release as unknown as FmsCatalogReleaseInput }
        handoffRef.current = next; setHandoff(next); return
      }
      if (!handoffRef.current || data.nonce !== handoffRef.current.nonce || !pending.current) return
      if (data.type === 'issue-failed') {
        awaitingIssue.current = false
        setError('尚未取得啟用請求；請回 FMS 查詢原操作結果。'); setBusy(false); setUnknown(true); return
      }
      if (data.type !== 'issued' || !awaitingIssue.current || data.operationId !== pending.current.commandId || !object(data.checkpoint)) return
      const original = pending.current, owner = identity.current
      // Exactly one issuance response may trigger the already requested activation.
      pending.current = null; awaitingIssue.current = false
      void activateFmsCatalog({ ...original.request, commandId: original.commandId, requestHash: original.requestHash,
        previewHash: original.previewHash, fmsCheckpoint: data.checkpoint }).then(receipt => {
        if (identity.current !== owner) return
        setMessage(receipt.replayed ? '此版本已啟用。' : '角色目錄已啟用。'); setUnknown(false)
        send({ type: 'observe', operationId: original.commandId })
      }).catch(() => {
        if (identity.current !== owner) return
        pending.current = original; setUnknown(true); setError('啟用結果尚待確認，請查詢原操作。')
        send({ type: 'observe', operationId: original.commandId })
      }).finally(() => { if (identity.current === owner) setBusy(false) })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [workspace, sessionIdentity])
  const inspect = async () => {
    if (!handoff || busy || unknown) return
    const owner = identity.current; setBusy(true); setError(null); setMessage(null); setPreview(null)
    try {
      const current = await loadFmsCatalogActivationWorkspace()
      const request = { release: handoff.release, reason, expectedGovernanceRevision: current.governanceRevision,
        expectedOrganizationRevision: current.organizationRevision }
      const result = await previewFmsCatalogActivation(request)
      if (identity.current !== owner) return
      setWorkspace(current); previewRequest.current = request; setPreview(result)
    } catch { if (identity.current === owner) setError('無法預覽此版本；請確認發布者與目錄版本，或重新開啟。') }
    finally { if (identity.current === owner) setBusy(false) }
  }
  const activate = () => {
    if (!preview?.allowedOperations.activate || !previewRequest.current || busy || unknown || message) return
    const commandId = crypto.randomUUID()
    pending.current = { commandId, requestHash: preview.requestHash, previewHash: preview.previewHash, request: previewRequest.current }
    awaitingIssue.current = true
    setBusy(true); setError(null)
    send({ type: 'issue', selection: { operationId: commandId, version: handoff!.release.version, previewHash: preview.previewHash, expected: preview.expected } })
  }
  const observe = async () => {
    const original = pending.current, owner = identity.current
    if (!original || busy) return
    setBusy(true); setError(null)
    try {
      const receipt = await loadFmsCatalogActivationReceipt(original.commandId)
      if (identity.current !== owner) return
      if (receipt.requestHash !== original.requestHash || receipt.previewHash !== original.previewHash || receipt.receiptStatus !== 'applied') throw new Error('RECEIPT_MISMATCH')
      setMessage('角色目錄已啟用。'); setUnknown(false); pending.current = null
    } catch { if (identity.current === owner) setError('尚未查到已完成的啟用紀錄；請回 FMS 查詢原操作。') }
    finally { if (identity.current === owner) { send({ type: 'observe', operationId: original.commandId }); setBusy(false) } }
  }
  return <main className="fms-role-assignment">
    <header className="fms-role-assignment__header"><h1>啟用 FMS 角色目錄</h1></header>
    {!handoff ? <p role="status">{workspace ? '請從 FMS 的角色設定開啟此頁。' : '正在讀取角色目錄…'}</p> : <>
      <section><h2>{handoff.release.version}</h2><label htmlFor="catalog-reason">變更原因</label>
        <input id="catalog-reason" value={reason} maxLength={240} disabled={busy || unknown || !!message}
          onChange={event => { setReason(event.target.value); setPreview(null) }} />
        {!unknown && !message && <button disabled={busy || !reason.trim()} onClick={() => void inspect()}>預覽影響</button>}
      </section>
      {preview && <section><h2>角色變更</h2><p>新增 {preview.addedRoles.length} 個、移除 {preview.removedRoles.length} 個、修改 {preview.changedRoles.length} 個；影響 {preview.affectedAssignmentCount} 筆任用。</p>
        <ul>{preview.addedRoles.map(role => <li key={'add-' + role.stableRoleId}>新增：{role.displayName}</li>)}
          {preview.removedRoles.map(role => <li key={'remove-' + role.stableRoleId}>移除：{role.displayName}</li>)}
          {preview.changedRoles.map(role => <li key={role.stableRoleId}>{role.displayName}：新增能力 {role.addedCapabilities.length} 個、移除能力 {role.removedCapabilities.length} 個{role.renamed ? '，名稱變更' : ''}{role.assignmentPolicyChanged ? '，任用規則變更' : ''}</li>)}</ul>
        {!preview.compatible && <p role="alert">仍有任用使用將移除的角色，請先調整任用。</p>}
        {preview.alreadyActive && <p role="status">此版本已啟用。</p>}
        {!message && !unknown && <button disabled={busy || !preview.allowedOperations.activate} onClick={activate}>啟用此版本</button>}
      </section>}
      {unknown && <button disabled={busy} onClick={() => void observe()}>查詢原操作</button>}
    </>}
    {busy && <p role="status">處理中…</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </main>
}
