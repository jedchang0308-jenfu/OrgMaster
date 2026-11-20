import { useEffect, useRef, useState } from 'react'
import type { ProjedExternalDecision, ProjedExternalRecord } from '../governance/projedExternal'

const path = '/api/orgmaster/projed-external-requests/v1'
const labels = { PENDING: '待核准', ACTIVE: '有效', INACTIVE: '停用', REJECTED: '拒絕', WITHDRAWN: '已撤回' }
class RequestFailure extends Error { constructor(message: string, readonly status: number) { super(message) } }
async function request(body?: unknown) {
  const result = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const payload = await result.json()
  if (!result.ok) throw new RequestFailure(payload.code === 'EXTERNAL_ADMIN_REQUIRED' ? '需要 OrgMaster 管理員權限。' : result.status === 409 ? '資料已更新，請重新載入。' : '目前無法確認資料，請重新載入。', result.status)
  return payload
}
export function GovernanceProjedExternal({ canManage, principalId }: { canManage: boolean; principalId: string }) {
  const [rows, setRows] = useState<ProjedExternalRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState<ProjedExternalDecision | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const actor = useRef(principalId); actor.current = principalId
  async function load() {
    const expectedActor = principalId
    setBusy(true); setError('')
    try { const value = await request(); if (actor.current === expectedActor) { setRows(value.requests); setLoaded(true) } }
    catch (failure) { if (actor.current === expectedActor) setError((failure as Error).message) }
    finally { if (actor.current === expectedActor) setBusy(false) }
  }
  useEffect(() => { setRows([]); setLoaded(false); setPending(null); void load() }, [principalId])
  async function decide(command: ProjedExternalDecision) {
    const expectedActor = principalId
    setBusy(true); setError(''); setPending(command)
    try {
      await request(command)
      if (actor.current !== expectedActor) return
      setPending(null); await load()
    } catch (failure) { if (actor.current === expectedActor) { if (failure instanceof RequestFailure && failure.status < 500) setPending(null); setError((failure as Error).message) } }
    finally { if (actor.current === expectedActor) setBusy(false) }
  }
  return <section className="governance-section" aria-label="ProJED 外部人員">
    <h2>ProJED 外部人員</h2>
    <button className="button" disabled={busy} onClick={() => void load()}>重新載入</button>
    {error && <p role="alert">{error}</p>}
    {pending && <p role="status">操作結果尚未確認。<button className="button" disabled={busy} onClick={() => void decide(pending)}>查詢並重送原操作</button></p>}
    {!loaded && !error && <p role="status">載入中…</p>}
    {loaded && rows.length === 0 && <p>尚無外部人員申請。</p>}
    {rows.length > 0 && <div className="governance-table-wrap"><table className="governance-table"><thead><tr>
      <th>登入識別／聯絡方式</th><th>邀請人／來源</th><th>狀態</th><th>核准人／時間</th><th>最近登入</th><th>公司／備註</th><th>操作</th>
    </tr></thead><tbody>{rows.map(row => <tr key={row.requestId}>
      <td>{row.principalId ?? '尚未驗證身分'}<br />{row.googleSubject ?? ''}<br />{row.contactEmail}</td>
      <td>{row.inviterPrincipalId}<br />ProJED · {row.boardId}<br />{row.role}</td>
      <td>{row.decision === 'APPROVED' && row.status === 'PENDING' ? '已核准，等待身分驗證' : labels[row.status]}</td>
      <td>{row.approvedBy ?? '—'}<br />{row.approvedAt ? new Date(row.approvedAt).toLocaleString('zh-TW') : ''}</td>
      <td>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString('zh-TW') : '—'}</td>
      <td>{row.company}<br />{canManage ? <input aria-label={`備註 ${row.contactEmail}`} maxLength={2000} value={notes[row.requestId] ?? row.note} onChange={event => setNotes({ ...notes, [row.requestId]: event.target.value })} /> : row.note}</td>
      <td>{canManage && (row.decision === 'PENDING' && row.status === 'PENDING' ? ['approve', 'reject'] as const : row.status === 'ACTIVE' ? ['disable'] as const : row.status === 'INACTIVE' ? ['restore'] as const : []).map(action =>
        <button className="button" key={action} disabled={busy || !!pending} onClick={() => void decide({ commandId: crypto.randomUUID(), requestId: row.requestId, expectedRevision: row.revision, action, note: (notes[row.requestId] ?? row.note).trim() })}>{({ approve: '核准', reject: '拒絕', disable: '停用', restore: '恢復' })[action]}</button>)}</td>
    </tr>)}</tbody></table></div>}
  </section>
}
