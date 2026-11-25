import { useEffect, useRef, useState } from 'react'
import { PROJED_USERS_VERSION, type ProjedUserCommand, type ProjedUserRecord, type ProjedUsersSnapshot } from '../governance/projedUsers'

const path = '/api/orgmaster/projed-users/v1'
const identityLabels = { UNREGISTERED: '尚未首次登入', ACTIVE: '有效', INACTIVE: '已停用' }
const externalLabels = { NONE: '—', PENDING: '待核准', ACTIVE: '有效', INACTIVE: '已停用', REJECTED: '已拒絕', WITHDRAWN: '已撤回' }

class RequestFailure extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function request(command?: ProjedUserCommand): Promise<ProjedUsersSnapshot> {
  const response = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store',
    ...(command ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) } : {}),
  })
  if (!response.ok) {
    throw new RequestFailure(response.status === 401 ? '登入已失效，請重新登入。'
      : response.status === 403 ? '需要 OrgMaster 管理員權限。'
      : response.status === 409 ? '資料已更新，請重新載入後再操作。'
      : response.status < 500 ? '操作未完成，請重新載入後再試。'
      : command ? '目前無法確認操作結果。' : '目前無法讀取清單，請重新載入。', response.status)
  }
  const value = await response.json() as ProjedUsersSnapshot
  if (value.contractVersion !== PROJED_USERS_VERSION || !Array.isArray(value.users)) throw new Error('目前無法確認資料，請重新載入。')
  return value
}

function userLabel(row: ProjedUserRecord) { return row.displayName || row.email || row.principalId || row.googleSubject }
export { request as requestProjedUsers, RequestFailure as ProjedUsersRequestFailure }

export function GovernanceProjedUsers({ canManage, principalId }: { canManage: boolean; principalId: string }) {
  const [rows, setRows] = useState<ProjedUserRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<ProjedUserCommand | null>(null)
  const [confirmSubject, setConfirmSubject] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [enabled, setEnabled] = useState('all')
  const actor = useRef({ principalId, generation: 0 })
  if (actor.current.principalId !== principalId) actor.current = { principalId, generation: actor.current.generation + 1 }
  const allowed = useRef(canManage); allowed.current = canManage
  const inFlight = useRef(false)

  async function load() {
    const expectedActor = actor.current
    setBusy(true); setError('')
    try {
      const value = await request()
      if (actor.current !== expectedActor) return false
      setRows(value.users); setLoaded(true)
      return true
    } catch (failure) {
      if (actor.current === expectedActor) setError(failure instanceof RequestFailure ? failure.message : '目前無法讀取清單，請重新載入。')
      return false
    } finally { if (actor.current === expectedActor) setBusy(false) }
  }

  useEffect(() => {
    setRows([]); setLoaded(false); setPending(null); setConfirmSubject(null); setNotice(''); setError(''); inFlight.current = false
    void load()
    return () => { actor.current = { ...actor.current, generation: actor.current.generation + 1 } }
  }, [principalId])
  useEffect(() => { if (!canManage) setConfirmSubject(null) }, [canManage])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function decide(command: ProjedUserCommand, retry = false) {
    if (!allowed.current || inFlight.current) return
    const expectedActor = actor.current
    let sent = false
    inFlight.current = true
    setBusy(true); setError(''); setNotice(''); setConfirmSubject(null); setPending(command)
    try {
      if (retry) {
        const latest = await request()
        if (actor.current !== expectedActor || !allowed.current) return
        setRows(latest.users); setLoaded(true)
      }
      if (actor.current !== expectedActor || !allowed.current) return
      sent = true
      const value = await request(command)
      if (actor.current !== expectedActor) return
      setRows(value.users); setLoaded(true); setPending(null)
      if (command.action === 'restore') {
        const current = value.users.find(row => row.googleSubject === command.googleSubject)
        setNotice(current?.enabled ? '已恢復啟用；需重新登入 ProJED，舊登入不會恢復。'
          : current ? '原操作已確認；此帳號目前已停用。' : '原操作已確認；目前清單已無此帳號。')
      }
    } catch (failure) {
      if (actor.current !== expectedActor) return
      if (sent && failure instanceof RequestFailure && failure.status < 500) setPending(null)
      setError(failure instanceof RequestFailure ? failure.message : '連線中斷，目前無法確認操作結果。')
    } finally {
      if (actor.current === expectedActor) { inFlight.current = false; setBusy(false) }
    }
  }

  const query = search.trim().toLocaleLowerCase()
  const confirmRow = rows.find(row => row.googleSubject === confirmSubject)
  const filtered = rows.filter(row => (kind === 'all' || row.kind === kind)
    && (enabled === 'all' || row.enabled === (enabled === 'enabled'))
    && (!query || [row.email, row.displayName, row.principalId, !row.email && !row.displayName && !row.principalId ? row.googleSubject : null]
      .some(value => value?.toLocaleLowerCase().includes(query))))
  const start = (row: ProjedUserRecord, action: ProjedUserCommand['action']) => void decide({ commandId: crypto.randomUUID(), googleSubject: row.googleSubject, expectedRevision: row.revision, action })

  return <section className="governance-section" aria-label="ProJED 使用者" aria-busy={busy}>
    <div className="governance-section-heading"><h2>ProJED 使用者</h2><button className="button" disabled={busy} onClick={() => void load()}>重新載入</button></div>
    <div className="governance-inline-form">
      <label style={{ flex: 1 }}>搜尋<input style={{ minHeight: 36, minWidth: 0, width: '100%', border: '1px solid #d9dee7', borderRadius: 7, padding: '0 9px', font: 'inherit' }} type="search" placeholder="Email、顯示名稱或 Principal" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>帳號類型<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部類型</option><option value="personal">個人</option><option value="external">外部</option></select></label>
      <label>啟用狀態<select value={enabled} onChange={event => setEnabled(event.target.value)}><option value="all">全部狀態</option><option value="enabled">啟用</option><option value="disabled">停用</option></select></label>
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && !busy && <p role="status">操作結果尚未確認。{canManage && <button className="button" onClick={() => void decide(pending, true)}>查詢並重送原操作</button>}</p>}
    {canManage && confirmRow && <div role="group" aria-label="確認停用">
      <p style={{ overflowWrap: 'anywhere' }}>確認停用 {userLabel(confirmRow)} 的 ProJED 登入資格？</p>
      <button className="button" autoFocus disabled={busy || !!pending} onClick={() => start(confirmRow, 'disable')}>確認停用</button>
      <button className="button" disabled={busy} onClick={() => setConfirmSubject(null)}>取消</button>
    </div>}
    {!loaded && !error && <p role="status">載入中…</p>}
    {loaded && !filtered.length && <p>{rows.length ? '沒有符合條件的使用者。' : '尚無 ProJED 使用者。'}</p>}
    {filtered.length > 0 && <div className="governance-table-wrap"><table className="governance-table"><thead><tr>
      <th scope="col">使用者</th><th scope="col">類型</th><th scope="col">啟用狀態</th><th scope="col">身分狀態</th><th scope="col">登入資格</th><th scope="col">外部資格</th>{canManage && <th scope="col">操作</th>}
    </tr></thead><tbody>{filtered.map(row => <tr key={row.googleSubject}>
      <td><strong>{userLabel(row)}</strong>{row.email && row.email !== userLabel(row) && <small>{row.email}</small>}{row.principalId && row.principalId !== userLabel(row) && <small>{row.principalId}</small>}</td>
      <td>{row.kind === 'personal' ? '個人' : '外部'}</td><td>{row.enabled ? '啟用' : '停用'}</td><td>{identityLabels[row.identityStatus]}</td>
      <td>{row.loginEligible ? '具登入資格' : '不具登入資格'}</td><td>{externalLabels[row.externalStatus]}</td>
      {canManage && <td><button className="button" disabled={busy || !!pending} aria-label={`${row.enabled ? '停用' : '恢復'} ${userLabel(row)}`} onClick={() => row.enabled ? setConfirmSubject(row.googleSubject) : start(row, 'restore')}>{row.enabled ? '停用' : '恢復'}</button></td>}
    </tr>)}</tbody></table></div>}
  </section>
}
