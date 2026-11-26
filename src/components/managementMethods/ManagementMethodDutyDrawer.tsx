import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { OrgDirectoryState } from '../../types'
import type { DutyMapMethodLinkResult } from '../../dutyMap'
import { orgMasterPermissionFetch } from '../../auth/permissionInvalidation'
import { buildDutyReadRows } from '../../managementMethods/dutyReadAdapter'
import { WorkspacePortal } from '../workspace/WorkspaceOverlayHosts'

export function ManagementMethodDutyDrawer({ state, onClose, methodId, organizationVersionId }: { state: OrgDirectoryState; onClose: () => void; methodId?: string; organizationVersionId?: string | null }) {
  const [query, setQuery] = useState('')
  const [linkedResult, setLinkedResult] = useState<DutyMapMethodLinkResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const rows = useMemo(() => buildDutyReadRows(state, query), [query, state])
  const explicitMode = Boolean(methodId && organizationVersionId)
  useEffect(() => {
    setLinkedResult(null)
    setError('')
    if (!methodId || !organizationVersionId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ versionId: organizationVersionId, methodId })
    void orgMasterPermissionFetch('/api/orgmaster/duty-map/method-links?' + params, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('無法載入本辦法的職掌對應')
        const result = await response.json() as DutyMapMethodLinkResult
        if (controller.signal.aborted) return
        if (!result || result.versionId !== organizationVersionId || result.methodId !== methodId
          || typeof result.revision !== 'string' || !result.revision || !Array.isArray(result.links)
          || result.links.some(row => !row || !row.target || !['group', 'duty'].includes(row.target.kind)
            || ![row.target.id, row.title, row.departmentId, row.departmentName, row.groupId, row.groupTitle].every(value => typeof value === 'string' && value.length > 0))) {
          throw new Error('無法載入本辦法的職掌對應')
        }
        setLinkedResult(result)
      })
      .catch(() => { if (!controller.signal.aborted) setError('無法載入本辦法的職掌對應') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [methodId, organizationVersionId, reload])
  const linked = linkedResult && linkedResult.versionId === organizationVersionId && linkedResult.methodId === methodId ? linkedResult.links : []
  const linkedRows = linked.filter(value => (value.departmentName + value.title + value.groupTitle).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const previousFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('keydown', closeOnEscape, true)
      const previous = previousFocusRef.current
      if (previous?.isConnected) window.requestAnimationFrame(() => previous.focus())
    }
  }, [onClose])
  return <WorkspacePortal scope="panel">
    <aside className="management-method-duty-drawer" aria-label="職掌對照">
      <header><strong>職掌對照</strong><button type="button" aria-label="關閉職掌對照" onClick={onClose}><X size={16} /></button></header>
      <input aria-label="搜尋職掌或職位" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋職掌或職位" />
      {explicitMode && <>
        {loading && <p role="status">載入對應職掌中</p>}
        {error && <p role="alert">{error}<button type="button" onClick={() => setReload(value => value + 1)}>重試</button></p>}
        {!loading && !error && (linkedRows.length ? <div className="management-method-duty-drawer__rows">
          {linkedRows.map(row => <div key={row.target.kind + ':' + row.target.id}>
            <strong>{row.title}</strong>
            <span>{row.departmentName} · {row.target.kind === 'group' ? '職掌大項' : '細部職掌'}</span>
            {row.target.kind === 'duty' && <p>{row.groupTitle}</p>}
          </div>)}
        </div> : <p>此版本目前沒有可顯示的對應職掌</p>)}
      </>}
      {(!explicitMode || query.trim()) && <>
        {explicitMode && <h3>搜尋結果</h3>}
        {rows.length ? <div className="management-method-duty-drawer__rows">
          {rows.map(row => <div key={row.dutyId + '-' + row.positionId}>
            <strong>{row.title}</strong><span>{row.relationType} · {row.positionTitle}</span><p>{row.description || '未提供說明'}</p>
          </div>)}
        </div> : <p>目前沒有符合的職掌對照。</p>}
      </>}
    </aside>
  </WorkspacePortal>
}
