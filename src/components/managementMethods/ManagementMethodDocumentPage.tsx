import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Check, Edit3, History, ListTree, Users } from 'lucide-react'
import { managementMethodApi, ManagementMethodApiError } from '../../managementMethods/apiClient'
import { canMutateManagementMethods, observeManagementMethodCapability } from '../../managementMethods/clientCapability'
import { collectManagementMethodHeadings, hasUsefulManagementMethodChapterNavigation } from '../../managementMethods/headings'
import { deriveMethodStatus } from '../../managementMethods/status'
import type { ManagementMethodSessionV1, ManagementMethodV1, EditorDocumentV1 } from '../../managementMethods/types'
import type { UploadedManagementMethodImage } from '../../managementMethods/imageEditing'
import type { OrgDirectoryState } from '../../types'
import { ManagementMethodReader } from './ManagementMethodReader'
import { ManagementMethodEditor } from './ManagementMethodEditor'
import { ManagementMethodDutyDrawer } from './ManagementMethodDutyDrawer'
import { ManagementMethodChapterDrawer } from './ManagementMethodChapterDrawer'

interface Props { methodId: string; initialView: 'draft' | 'readable'; initialChapter?: string | null; state: OrgDirectoryState; onClose: () => void }
export function ManagementMethodDocumentPage({ methodId, initialView, initialChapter, state, onClose }: Props) {
  const [method, setMethod] = useState<ManagementMethodV1 | null>(null); const [session, setSession] = useState<ManagementMethodSessionV1 | null>(null); const [view, setView] = useState(initialView); const [editing, setEditing] = useState(false); const [allowed, setAllowed] = useState(() => canMutateManagementMethods()); const [pendingBody, setPendingBody] = useState<EditorDocumentV1 | null>(null); const [titleDraft, setTitleDraft] = useState(''); const [ownerDraft, setOwnerDraft] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [dutyOpen, setDutyOpen] = useState(false); const [chapterOpen, setChapterOpen] = useState(false)
  const chapterTriggerRef = useRef<HTMLButtonElement>(null)
  const load = async (nextView = view) => { setError(''); try { const [nextSession, result] = await Promise.all([managementMethodApi.session(), managementMethodApi.get(methodId, nextView)]); setSession(nextSession); setMethod(result.method); setView(nextView); setTitleDraft(result.method.title); setOwnerDraft(result.method.ownerEmployeeId ?? '') } catch (reason) { setError(reason instanceof ManagementMethodApiError ? `無法載入文件：${reason.failure.code}` : '無法載入文件') } }
  useEffect(() => { void load(initialView) }, [methodId])
  useEffect(() => observeManagementMethodCapability(setAllowed), [])
  useEffect(() => { if (!allowed && editing) { setEditing(false); setNotice('目前裝置僅提供唯讀閱讀；未保存內容不會自動丟棄。') } }, [allowed, editing])
  useEffect(() => {
    if (!method || editing || !initialChapter) return
    const frame = window.requestAnimationFrame(() => document.getElementById(initialChapter)?.scrollIntoView({ block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [editing, initialChapter, method, view])
  useEffect(() => {
    if (!editing || !method || !pendingBody || JSON.stringify(pendingBody) === JSON.stringify(method.workingDraft.body)) return
    const timer = window.setTimeout(() => {
      void managementMethodApi.saveDraft(method.id, method.workingDraft.revision, crypto.randomUUID(), pendingBody).then((result) => { setMethod(result.method); setPendingBody(null); setNotice('已自動保存草稿') }).catch((reason) => { setError(reason instanceof ManagementMethodApiError ? `草稿未保存：${reason.failure.code}` : '草稿未保存') })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [editing, method, pendingBody])
  const status = useMemo(() => method ? (view === 'readable' ? '可供公司閱讀' : deriveMethodStatus(method)) : '', [method, view]); const canEdit = Boolean(view === 'draft' && allowed && session?.capabilities.editDraft && session?.capabilities.manageMetadata); const canProvide = Boolean(view === 'draft' && allowed && session?.capabilities.manageReadable); const body = pendingBody ?? (view === 'draft' ? method?.workingDraft.body : null) ?? null; const readingBody = view === 'readable' ? method?.readableSnapshot?.body : method?.workingDraft.body; const headings = useMemo(() => readingBody ? collectManagementMethodHeadings(readingBody) : [], [readingBody]); const hasChapters = hasUsefulManagementMethodChapterNavigation(headings)
  const navigateToChapter = (headingId: string) => {
    setChapterOpen(false)
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#${encodeURIComponent(headingId)}`)
    window.requestAnimationFrame(() => {
      const heading = document.getElementById(headingId)
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      heading?.focus({ preventScroll: true })
    })
  }
  const closeChapters = () => { setChapterOpen(false); window.requestAnimationFrame(() => chapterTriggerRef.current?.focus()) }
  const save = async () => { if (!method || !pendingBody || !session?.capabilities.editDraft) return; try { const result = await managementMethodApi.saveDraft(method.id, method.workingDraft.revision, crypto.randomUUID(), pendingBody); setMethod(result.method); setPendingBody(null); setNotice('已保存草稿'); } catch (reason) { setError(reason instanceof ManagementMethodApiError ? `草稿未保存：${reason.failure.code}` : '草稿未保存') } }
  const metadata = async () => { if (!method) return; try { const result = await managementMethodApi.updateMetadata(method.id, method.methodRevision, crypto.randomUUID(), titleDraft, ownerDraft || null); setMethod(result.method); setNotice('已保存文件資訊') } catch (reason) { setError(reason instanceof ManagementMethodApiError ? `文件資訊未保存：${reason.failure.code}` : '文件資訊未保存') } }
  const provide = async () => { if (!method) return; try { const result = await managementMethodApi.provide(method.id, method.workingDraft.revision, method.methodRevision, crypto.randomUUID()); setMethod(result.method); setNotice('已提供公司閱讀'); setEditing(false) } catch (reason) { setError(reason instanceof ManagementMethodApiError ? `尚未提供公司閱讀：${reason.failure.code}` : '尚未提供公司閱讀') } }
  const stop = async () => { if (!method) return; try { const result = await managementMethodApi.stopReadable(method.id, method.methodRevision, crypto.randomUUID()); setMethod(result.method); setView('draft'); setNotice('已停止公司閱讀') } catch (reason) { setError(reason instanceof ManagementMethodApiError ? `無法停止公司閱讀：${reason.failure.code}` : '無法停止公司閱讀') } }
  const restore = async () => { if (!method) return; try { const result = await managementMethodApi.restore(method.id, method.workingDraft.revision, method.methodRevision, crypto.randomUUID()); setMethod(result.method); setPendingBody(null); setTitleDraft(result.method.title); setOwnerDraft(result.method.ownerEmployeeId ?? ''); setNotice('已還原目前閱讀版本至草稿') } catch (reason) { setError(reason instanceof ManagementMethodApiError ? `無法還原：${reason.failure.code}` : '無法還原') } }
  const uploadImages = async (files: File[]): Promise<UploadedManagementMethodImage[]> => {
    if (!method || !editing) return []
    const uploaded: UploadedManagementMethodImage[] = []
    for (const file of files.slice(0, 10)) {
      try {
        const result = await managementMethodApi.uploadMedia(method.id, file, file.name)
        uploaded.push({ mediaId: result.media.id, altText: result.media.altText || file.name, file })
        setNotice(`${file.name} 已加入文件`)
      } catch (reason) {
        setError(reason instanceof ManagementMethodApiError ? `圖片未加入：${reason.failure.code}` : '圖片未加入')
      }
    }
    return uploaded
  }
  if (!method) return <div className="management-method-document-page"><p>{error || '載入中…'}</p></div>
  return <div className="management-method-document-page"><header className="management-method-document-page__header"><button type="button" onClick={onClose}><ArrowLeft size={17} />管理辦法</button><div><BookOpen size={18} /><span>{method.code}</span></div><div className="management-method-document-page__actions">{!editing && canEdit && <button type="button" className="button-primary management-method-document-page__edit-action" onClick={() => { setEditing(true); setPendingBody(method.workingDraft.body); setChapterOpen(false) }}><Edit3 size={16} /><span>編輯文件</span></button>}{!editing && hasChapters && <button ref={chapterTriggerRef} type="button" className="button-secondary" aria-haspopup="dialog" onClick={() => setChapterOpen(true)}><ListTree size={16} /><span>章節</span></button>}{!editing && <button type="button" className="button-secondary" onClick={() => setDutyOpen(true)}><Users size={16} /><span>職掌對照</span></button>}</div></header><main className="management-method-document-page__main">{error && <div className="management-method-error" role="alert">{error}<button type="button" onClick={() => void load()}>重試</button></div>}<div className="management-method-document-page__identity"><span className="management-method-code">{method.code}</span><span>{status}</span>{view === 'readable' && <span>公司閱讀</span>}{!allowed && <span>唯讀</span>}</div>{editing ? <section className="management-method-edit-surface"><div className="management-method-edit-surface__meta"><label>標題<input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={120} /></label><label>負責人員 ID<input value={ownerDraft} onChange={(event) => setOwnerDraft(event.target.value)} placeholder="提供公司閱讀前填寫" /></label><button type="button" className="button-secondary" onClick={() => void metadata()}>保存資訊</button></div>{body && <ManagementMethodEditor methodId={method.id} body={body} onChange={setPendingBody} onFile={uploadImages} />}</section> : <><h1>{method.title}</h1><ManagementMethodReader method={method} view={view} /></>}<div className="management-method-document-page__footer">{notice && <span role="status"><Check size={14} />{notice}</span>}{editing && <div className="management-method-edit-actions"><button type="button" className="button-secondary" onClick={() => { setEditing(false); setPendingBody(null) }}>完成編輯</button><button type="button" className="button-primary" onClick={() => void save()}>保存草稿</button>{canProvide && <button type="button" className="button-primary" onClick={() => void provide()}>提供公司閱讀</button>}{method.readableSnapshot && canProvide && <button type="button" className="button-secondary" onClick={() => void restore()}><History size={15} />還原閱讀版本</button>}{method.readableSnapshot && canProvide && <button type="button" className="button-danger" onClick={() => void stop()}>停止閱讀</button>}</div>}</div></main>{chapterOpen && <ManagementMethodChapterDrawer headings={headings} onClose={closeChapters} onNavigate={navigateToChapter} />}{dutyOpen && <ManagementMethodDutyDrawer state={state} onClose={() => setDutyOpen(false)} />}</div>
}
