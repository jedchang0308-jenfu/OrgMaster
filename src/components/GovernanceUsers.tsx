import { useEffect, useRef, useState } from 'react'
import { USERS_VERSION, USER_SYSTEMS, directoryUserLabel, userStatusLabel, userSystemName, type DirectoryUser, type UsersSnapshot, type UserSystemId } from '../governance/users'
import type { ProjedUserCommand, ProjedUsersSnapshot } from '../governance/projedUsers'
import { requestProjedUsers, ProjedUsersRequestFailure } from './GovernanceProjedUsers'
import './GovernanceUsers.css'

async function requestDirectory(): Promise<UsersSnapshot> {
  const response = await fetch('/api/orgmaster/users/v1', { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new Error(response.status === 401 ? '登入已失效，請重新登入。' : response.status === 403 ? '需要 OrgMaster 管理員權限。' : '目前無法讀取清單，請重新載入。')
  const value = await response.json() as UsersSnapshot
  if (value.contractVersion !== USERS_VERSION || !Array.isArray(value.users) || !Array.isArray(value.systems)
    || value.users.some(row => typeof row.id !== 'string' || !['employee', 'nonemployee'].includes(row.kind) || !Array.isArray(row.systems))) throw new Error('目前無法確認資料，請重新載入。')
  return value
}
const externalLabels = { NONE: '無', PENDING: '待核准', ACTIVE: '有效', INACTIVE: '已停用', REJECTED: '已拒絕', WITHDRAWN: '已撤回' }
const identityLabels = { UNREGISTERED: '尚未首次登入', ACTIVE: '有效', INACTIVE: '已停用' }
type Props = { canManage: boolean; principalId: string; initialSystem?: 'all' | UserSystemId; onExternal: () => void; onRoles: () => void }
export function GovernanceUsers({ canManage, principalId, initialSystem = 'all', onExternal, onRoles }: Props) {
  const [snapshot, setSnapshot] = useState<UsersSnapshot | null>(null)
  const [system, setSystem] = useState<'all' | UserSystemId>(initialSystem)
  const [search, setSearch] = useState(''), [kind, setKind] = useState('all'), [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string | null>(null), [confirm, setConfirm] = useState<ProjedUserCommand | null>(null)
  const [pending, setPending] = useState<ProjedUserCommand | null>(null), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), focusBefore = useRef<HTMLElement | null>(null)
  const actor = useRef({ principalId }), allowed = useRef(canManage), inFlight = useRef(false), loadGeneration = useRef(0)
  if (actor.current.principalId !== principalId) actor.current = { principalId }
  allowed.current = canManage
  async function load() {
    const expected = actor.current, generation = ++loadGeneration.current
    setError('')
    try {
      const value = await requestDirectory()
      if (actor.current === expected && generation === loadGeneration.current) setSnapshot(value)
    } catch (failure) {
      if (actor.current === expected && generation === loadGeneration.current) { setSnapshot(null); setError((failure as Error).message) }
    }
  }
  useEffect(() => {
    setSnapshot(null); setSelected(null); setPending(null); setConfirm(null); setNotice(''); setBusy(false); inFlight.current = false
    void load()
    return () => { actor.current = { ...actor.current }; ++loadGeneration.current }
  }, [principalId])
  useEffect(() => { if (!canManage) setConfirm(null) }, [canManage])
  useEffect(() => { if (notice) { const timer = window.setTimeout(() => setNotice(''), 4000); return () => window.clearTimeout(timer) } }, [notice])
  const current = snapshot?.users.find(row => row.id === selected)
  useEffect(() => {
    const node = dialog.current
    if (current && node && !node.open) node.showModal()
    else if (!current && node?.open) { node.close(); focusBefore.current?.focus() }
  }, [current])
  function applyProjed(value: ProjedUsersSnapshot) {
    const records = new Map(value.users.map(row => [row.googleSubject, row]))
    setSnapshot(previous => previous && { ...previous, users: previous.users.map(row => ({ ...row, systems: row.systems.flatMap(app => {
      if (app.applicationId !== 'projed' || !app.projed) return [app]
      const latest = records.get(app.projed.googleSubject)
      return latest ? [{ ...app, projed: latest, status: !latest.enabled ? 'DISABLED' as const : latest.loginEligible ? 'ELIGIBLE' as const : 'INELIGIBLE' as const }] : []
    }) })) })
  }
  async function decide(command: ProjedUserCommand, retry = false) {
    if (!allowed.current || inFlight.current) return
    const expected = actor.current
    inFlight.current = true; ++loadGeneration.current
    setBusy(true); setError(''); setNotice(''); setConfirm(null); setPending(command)
    let sent = false
    try {
      if (retry) {
        const readback = await requestProjedUsers()
        if (actor.current !== expected || !allowed.current) return
        applyProjed(readback)
      }
      if (actor.current !== expected || !allowed.current) return
      sent = true
      const value = await requestProjedUsers(command)
      if (actor.current !== expected) return
      applyProjed(value); setPending(null)
      const row = value.users.find(item => item.googleSubject === command.googleSubject)
      setNotice(row ? row.enabled ? 'ProJED 已啟用；需重新登入，原已撤銷的協作資格不會恢復。' : 'ProJED 已停用；其他子系統不受影響。' : '原操作已確認；目前清單已無此 ProJED 帳號。')
    } catch (failure) {
      if (actor.current !== expected) return
      if (sent && failure instanceof ProjedUsersRequestFailure && failure.status < 500) setPending(null)
      setError(failure instanceof ProjedUsersRequestFailure ? failure.message : '連線中斷，目前無法確認操作結果。')
    } finally { if (actor.current === expected) { inFlight.current = false; setBusy(false) } }
  }
  const unavailable = USER_SYSTEMS.filter(app => !snapshot?.systems.some(source => source.applicationId === app.id && source.state === 'READY'))
  const ready = (id: UserSystemId) => !unavailable.some(app => app.id === id)
  const query = search.trim().toLocaleLowerCase()
  const relevant = (row: DirectoryUser) => row.systems.filter(app => ready(app.applicationId) && (system === 'all' || system === app.applicationId))
  const rows = (snapshot?.users ?? []).filter(row => (kind === 'all' || row.kind === kind)
    && (system === 'all' || relevant(row).length > 0)
    && (status === 'all' || relevant(row).some(app => app.status === status))
    && (!query || [row.displayName, row.email, row.principalId, row.id].some(value => value?.toLocaleLowerCase().includes(query))))
  const tabs = [{ id: 'all' as const, name: '全部' }, ...USER_SYSTEMS]
  function open(row: DirectoryUser) { focusBefore.current = document.activeElement as HTMLElement; setSelected(row.id); setConfirm(null) }
  function close() { setSelected(null); setConfirm(null) }
  const feedback = <>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && <p role="status">ProJED 操作結果尚未確認。{canManage && <button className="button" onClick={() => void decide(pending, true)}>查詢並重送原操作</button>}</p>}</>
  return <section className="governance-section governance-users" aria-label="所有使用者" aria-busy={busy}>
    <div className="governance-section-heading"><h2>所有使用者</h2><button className="button" disabled={busy} onClick={() => void load()}>重新載入</button></div>
    <div className="users-tabs" role="tablist" aria-label="子系統">{tabs.map((tab, index) => <button key={tab.id} role="tab" aria-selected={system === tab.id} tabIndex={system === tab.id ? 0 : -1} onClick={() => setSystem(tab.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      setSystem(tabs[next].id); (event.currentTarget.parentElement?.children[next] as HTMLElement).focus()
    }}>{tab.name}</button>)}</div>
    <div className="governance-inline-form users-filters">
      <label>搜尋<input type="search" placeholder="姓名、Email 或 Principal" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>身分類型<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部類型</option><option value="employee">員工</option><option value="nonemployee">非員工</option></select></label>
      <label>登入資格<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部狀態</option><option value="ELIGIBLE">具登入資格</option><option value="INELIGIBLE">不具登入資格</option><option value="DISABLED">已停用</option></select></label>
    </div>
    {system === 'projed' && <button className="users-link users-review" onClick={onExternal}>外部協作資格審核 →</button>}
    {snapshot && unavailable.filter(app => system === 'all' || system === app.id).map(app => <p role="status" key={app.id}>{app.name}：無法取得資格資料。<button className="users-link" disabled={busy} onClick={() => void load()}>重新載入</button></p>)}
    {!current && feedback}
    {!snapshot && !error && <p role="status">載入中…</p>}
    {snapshot && !rows.length && <p>{snapshot.users.length ? '沒有符合條件的使用者。' : '尚無使用者。'}</p>}
    {!!rows.length && <div className="users-table"><table><thead><tr><th scope="col">使用者</th><th scope="col">身分類型</th><th scope="col">{system === 'all' ? '子系統資格' : '登入資格'}</th><th scope="col"><span className="users-sr-only">操作</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td><strong>{directoryUserLabel(row)}</strong>{row.email && row.email !== directoryUserLabel(row) && <small>{row.email}</small>}{!row.email && row.principalId && row.principalId !== directoryUserLabel(row) && <small>{row.principalId}</small>}</td>
      <td>{row.kind === 'employee' ? '員工' : '非員工'}</td>
      <td>{system === 'all' ? <div className="users-apps">{relevant(row).filter(app => app.status === 'ELIGIBLE' || app.applicationId === 'projed').map(app => <button className="users-link" key={app.applicationId} onClick={() => { setSystem(app.applicationId); setStatus('all') }}>{userSystemName(app.applicationId)}{app.status === 'DISABLED' ? '（已停用）' : app.status === 'INELIGIBLE' ? '（不具資格）' : ''}</button>)}{!relevant(row).some(app => app.status === 'ELIGIBLE' || app.applicationId === 'projed') && '無已確認資格'}</div> : relevant(row).map(app => <span key={app.applicationId}>{userStatusLabel(app.status)}</span>)}</td>
      <td><button className="users-link" aria-label={`查看 ${directoryUserLabel(row)}`} onClick={() => open(row)}>查看</button></td>
    </tr>)}</tbody></table></div>}
    <dialog ref={dialog} className="users-dialog" aria-labelledby="users-detail-title" onCancel={event => { event.preventDefault(); close() }}>
      {current && <><div className="users-detail-heading"><div><h2 id="users-detail-title">{directoryUserLabel(current)}</h2><small>{current.email}</small></div><button className="users-link" aria-label="關閉使用者明細" onClick={close}>關閉</button></div>
        <p>{current.kind === 'employee' ? '員工' : '非員工'}{current.principalId && <small>{current.principalId}</small>}</p>
        <h3>子系統登入資格</h3>
        {USER_SYSTEMS.map(app => {
          const entry = current.systems.find(item => item.applicationId === app.id), account = entry?.projed
          return <div className="users-app-detail" key={app.id}><div className="users-app-detail-heading"><strong>{app.name}</strong><span>{!ready(app.id) ? '無法取得' : entry ? userStatusLabel(entry.status) : '未登錄'}</span>
            {ready(app.id) && account && canManage && <button className="button" disabled={busy || !!pending} onClick={() => setConfirm({ commandId: crypto.randomUUID(), googleSubject: account.googleSubject, expectedRevision: account.revision, action: account.enabled ? 'disable' : 'restore' })}>{account.enabled ? '停用' : '恢復'}</button>}
            {ready(app.id) && entry && app.id !== 'projed' && <button className="users-link" onClick={() => { close(); onRoles() }}>查看角色</button>}</div>
            {ready(app.id) && account && <dl><div><dt>身分狀態</dt><dd>{identityLabels[account.identityStatus]}</dd></div><div><dt>外部協作資格</dt><dd>{externalLabels[account.externalStatus]}</dd></div></dl>}
          </div>
        })}
        {feedback}
        {confirm && canManage && <div className="users-confirm" role="group" aria-label="確認 ProJED 操作"><strong>{confirm.action === 'disable' ? '停用' : '恢復'} ProJED？</strong><p>{confirm.action === 'disable' ? '只停用此帳號的 ProJED 登入資格，既有 ProJED 登入將失效；其他子系統不受影響。' : '恢復後需重新登入 ProJED，原已撤銷的邀請與協作資格不會恢復。'}</p><button className="button" autoFocus disabled={busy || !!pending} onClick={() => void decide(confirm)}>確認{confirm.action === 'disable' ? '停用' : '恢復'}</button><button className="button" onClick={() => setConfirm(null)}>取消</button></div>}
      </>}
    </dialog>
  </section>
}
