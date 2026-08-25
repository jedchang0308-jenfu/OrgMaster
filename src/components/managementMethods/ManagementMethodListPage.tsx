import { useEffect, useState } from 'react'
import { BookOpen, Plus, Search } from 'lucide-react'
import { managementMethodApi, ManagementMethodApiError } from '../../managementMethods/apiClient'
import { canMutateManagementMethods, observeManagementMethodCapability } from '../../managementMethods/clientCapability'
import type { ManagementMethodSessionV1, ManagementMethodSummaryV1 } from '../../managementMethods/types'
import { buildManagementMethodDocumentUrl } from '../../managementMethods/route'
import { ManagementMethodCreateDialog } from './ManagementMethodCreateDialog'

interface Props { onClose: () => void; onOpen: (methodId: string, view?: 'draft' | 'readable') => void }
export function ManagementMethodListPage({ onClose, onOpen }: Props) {
  const [session, setSession] = useState<ManagementMethodSessionV1 | null>(null)
  const [summaries, setSummaries] = useState<ManagementMethodSummaryV1[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [allowed, setAllowed] = useState(() => canMutateManagementMethods())
  const load = async () => { setBusy(true); setError(''); try { const nextSession = await managementMethodApi.session(); const view = nextSession.capabilities?.readDraft ? 'draft' : 'readable'; const result = await managementMethodApi.list(query, view); setSession(nextSession); setSummaries(result.summaries) } catch (error) { setError(error instanceof ManagementMethodApiError ? `無法載入管理辦法：${error.failure.code}` : '無法載入管理辦法') } finally { setBusy(false) } }
  useEffect(() => { void load() }, [query])
  useEffect(() => observeManagementMethodCapability(setAllowed), [])
  useEffect(() => { if (!allowed && createOpen) setCreateOpen(false) }, [allowed, createOpen])
  return <div className="management-methods-page" data-management-methods-page>
    <header className="management-methods-page__header"><button type="button" className="management-methods-page__back" onClick={onClose}>組織架構</button><div><BookOpen size={18} /><strong>管理辦法</strong></div>{allowed && session?.capabilities?.create && <button type="button" className="button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} />新增</button>}</header>
    <main className="management-methods-page__main"><div className="management-methods-page__tools"><label className="management-methods-search"><Search size={16} /><span className="sr-only">搜尋管理辦法</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋代碼或標題" /></label></div>{error && <div className="management-method-error" role="alert">{error}<button type="button" onClick={() => void load()}>重試</button></div>}{busy ? <p className="management-methods-empty">載入中…</p> : summaries.length === 0 ? <p className="management-methods-empty">尚無可閱讀的管理辦法</p> : <div className="management-method-list">{summaries.map((summary) => <button type="button" className="management-method-list__row" key={summary.id} onClick={() => onOpen(summary.id, session?.capabilities?.readDraft ? 'draft' : 'readable')}><span className="management-method-list__code">{summary.code}</span><span className="management-method-list__title">{summary.title}</span><span className="management-method-list__status">{summary.status}</span></button>)}</div>}</main>{createOpen && <ManagementMethodCreateDialog onClose={() => setCreateOpen(false)} onCreated={(method) => { setCreateOpen(false); onOpen(method.id, 'draft') }} />}</div>
}

export const managementMethodListRoute = buildManagementMethodDocumentUrl
