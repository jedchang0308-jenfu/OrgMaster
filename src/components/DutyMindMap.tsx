import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { subscribeOrgMasterPermissionInvalidation } from '../auth/permissionInvalidation'
import { DEFAULT_DUTY_MAP_VIEW, dutyMapTargetKey } from '../dutyMap'
import type { DutyMapFindingKind, DutyMapNodeRef, DutyMapProjection, DutyMapReviewFinding, DutyMapReviewResult, DutyMapTarget, DutyMapViewState } from '../dutyMap'
import { dutyMapClient, validateDutyMapReview } from '../dutyMapClient'
import { DutyMapSeedConflict } from '../dutyMapSeed'
import { buildDutyMapLayout, DUTY_MAP_COLORS, dutyChapterShortName, dutyMapChapterLinks, dutyMapFindingRefs, getDutyMapMethods, revealDutyMapFindings } from '../dutyMapLayout'
import './DutyMindMap.css'

export interface DutyMindMapProps {
  versionId: string | null
  revision?: string | null
  context: DutyMapViewState
  onContextChange: (state: DutyMapViewState) => void
  onOpenMethod: (methodId: string) => void
  onCreateDraft?: () => Promise<void>
}
const findingNames: Record<DutyMapFindingKind, string> = {
  'duty-unmapped': '待歸章', 'chapter-collaboration-only': '僅有跨章協作', 'chapter-no-duty': '尚無對應職掌',
  'handoff-gap': '交接待核對', 'mapping-suggestion': '歸章建議', 'needs-confirmation': '待確認',
}
const rectStyle = (rect: { x: number; y: number; width: number; height: number }): CSSProperties => ({ left: rect.x, top: rect.y, width: rect.width, minHeight: rect.height })
function nodeTitle(projection: DutyMapProjection, ref: DutyMapNodeRef) {
  return ref.kind === 'department' ? projection.departments.find(d => d.id === ref.id)?.name : ref.kind === 'group' ? projection.map?.groups.find(g => g.id === ref.id)?.title : projection.duties.find(d => d.id === ref.id)?.title
}
function nodePath(projection: DutyMapProjection, ref: DutyMapNodeRef) {
  const group = projection.map?.groups.find(g => ref.kind === 'group' ? g.id === ref.id : projection.map?.memberships.some(m => m.dutyId === ref.id && m.groupId === g.id))
  const dept = projection.departments.find(d => d.id === (ref.kind === 'department' ? ref.id : group?.departmentId))
  return [dept?.name, ref.kind === 'duty' ? group?.title : null, ref.kind !== 'department' ? nodeTitle(projection, ref) : null].filter(Boolean).join(' › ')
}

export function DutyMindMap({ versionId, revision, context, onContextChange, onOpenMethod, onCreateDraft }: DutyMindMapProps) {
  const [loaded, setLoaded] = useState<{ requested: string | null; requestedRevision: string | null | undefined; projection: DutyMapProjection } | null>(null)
  const [loadError, setLoadError] = useState(false), [retry, setRetry] = useState(0)
  const [result, setResult] = useState<DutyMapReviewResult | null>(null)
  const [reviewing, setReviewing] = useState(false), [reviewError, setReviewError] = useState(false)
  const [findingFilter, setFindingFilter] = useState<DutyMapFindingKind | ''>('')
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  const [creating, setCreating] = useState(false), [createError, setCreateError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [compact, setCompact] = useState(false), [filtersOpen, setFiltersOpen] = useState(false)
  const [viewReset, setViewReset] = useState(0)
  const rootElement = useRef<HTMLElement>(null)
  const currentScale = useRef(scale); currentScale.current = scale
  const viewport = useRef<HTMLDivElement>(null)
  const reviewController = useRef<AbortController | null>(null)
  const generation = useRef(0), requestLock = useRef(false)
  const latest = useRef({ versionId, revision, context, onContextChange }); latest.current = { versionId, revision, context, onContextChange }
  const restore = useRef<{ versionId: string; context: DutyMapViewState; scale: number; left: number; top: number } | null>(null)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const namespace = useId().replace(/:/g, '')
  const projection = loaded?.requested === versionId && loaded.requestedRevision === revision ? loaded.projection : null
  const activeResult = result && result.versionId === projection?.versionId && result.revision === projection.revision ? result : null
  const findings = activeResult?.findings.filter(f => !findingFilter || f.kind === findingFilter) ?? []
  const layout = useMemo(() => projection ? buildDutyMapLayout(projection, context) : null, [projection, context])
  const currentLayout = useRef(layout); currentLayout.current = layout

  useLayoutEffect(() => {
    const element = rootElement.current
    if (!element) return
    const measure = () => { if (element.clientWidth > 0) setCompact(element.clientWidth < 720) }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const element = viewport.current
    if (!projection || !element) return
    let previous: { width: number; height: number; stageOffset: number; scale: number } | null = null, frame = 0
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight, graph = currentLayout.current
      if (!width || !height || !graph) { previous = null; return }
      const stageOffset = (element.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0
      if (!previous) {
        // A hidden workspace panel has no usable viewport. Center only after it is measurable.
        element.scrollLeft = Math.max(0, stageOffset + (graph.company.x + graph.company.width / 2) * currentScale.current - width / 2)
        element.scrollTop = Math.max(0, (graph.company.y + graph.company.height / 2) * currentScale.current - height / 2)
      } else if (previous.scale === currentScale.current) {
        // Keep the same readable world center when filters or split widths change.
        element.scrollLeft += (previous.width - width) / 2 + stageOffset - previous.stageOffset
        element.scrollTop += (previous.height - height) / 2
      }
      previous = { width, height, stageOffset, scale: currentScale.current }
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    measure(); schedule()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(element)
    if (element.firstElementChild) observer?.observe(element.firstElementChild)
    if (!observer) window.addEventListener('resize', schedule)
    return () => { observer?.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame) }
  // Structural filters change the hub's world position. Local disclosure/selection keeps its viewport.
  }, [projection?.versionId, projection?.revision, context.departmentId, context.chapterId, context.flywheelId, context.level, viewReset])

  useEffect(() => {
    const controller = new AbortController(), current = ++generation.current
    reviewController.current?.abort(); requestLock.current = false; restore.current = null
    setLoaded(null); setLoadError(false); setResult(null); setReviewing(false); setReviewError(false); setSelectedFinding(null); setFindingFilter(''); setScale(1); setCreateError(null)
    dutyMapClient.get(versionId, controller.signal).then(value => {
      if (controller.signal.aborted || current !== generation.current) return
      if (versionId !== null && value.versionId !== versionId) { setLoadError(true); return }
      setLoaded({ requested: versionId, requestedRevision: revision, projection: value })
    }).catch(() => { if (!controller.signal.aborted && current === generation.current) setLoadError(true) })
    return () => { controller.abort(); reviewController.current?.abort(); generation.current++ }
  }, [versionId, revision, retry])

  useEffect(() => subscribeOrgMasterPermissionInvalidation(() => {
    generation.current++; reviewController.current?.abort(); requestLock.current = false
    setLoaded(null); setResult(null); setReviewing(false); setLoadError(true); restore.current = null
  }), [])

  const change = (patch: Partial<DutyMapViewState>) => onContextChange({ ...context, ...patch })
  const clear = () => { setViewReset(value => value + 1); onContextChange({ ...DEFAULT_DUTY_MAP_VIEW, expandedGroupIds: [] }) }
  const showFinding = (finding: DutyMapReviewFinding, selectedNode = context.selectedNode) => {
    if (!projection) return
    setSelectedFinding(finding.id)
    change({ departmentId: null, chapterId: null, level: 'groups', selectedNode,
      expandedGroupIds: [...new Set([...context.expandedGroupIds, ...revealDutyMapFindings(projection, [finding]).expandedGroupIds])],
    })
  }
  const focusNode = (ref: DutyMapNodeRef) => {
    const marked = nodeFindings.get(dutyMapTargetKey(ref))
    if (marked?.length) {
      if (ref.kind !== 'group') { showFinding(marked[0], ref); return }
      setSelectedFinding(marked[0].id)
    }
    if (ref.kind === 'group' && projection) {
      const expanded = context.level === 'details' ? projection.map?.groups.map(g => g.id) ?? [] : context.expandedGroupIds
      change({ selectedNode: ref, level: 'groups', expandedGroupIds: expanded.includes(ref.id) ? expanded.filter(id => id !== ref.id) : [...expanded, ref.id] })
    } else change({ selectedNode: ref })
  }
  const closeReview = () => {
    reviewController.current?.abort(); reviewController.current = null; requestLock.current = false
    setReviewing(false); setResult(null); setReviewError(false); setSelectedFinding(null); setFindingFilter('')
    const snapshot = restore.current; restore.current = null
    if (snapshot && snapshot.versionId === projection?.versionId) {
      onContextChange(snapshot.context); setScale(snapshot.scale)
      requestAnimationFrame(() => { if (viewport.current) { viewport.current.scrollLeft = snapshot.left; viewport.current.scrollTop = snapshot.top } })
    }
  }
  const runReview = async () => {
    if (!projection?.canReview || !projection.map || requestLock.current) return
    requestLock.current = true
    const controller = new AbortController(); reviewController.current = controller
    const started = generation.current
    const input = { versionId: projection.versionId, expectedVersionRevision: projection.revision, chapterCatalogVersion: projection.chapterCatalogVersion, requestId: crypto.randomUUID() }
    setReviewing(true); setReviewError(false)
    const timeout = setTimeout(() => { controller.abort(); if (started === generation.current && reviewController.current === controller) { setReviewing(false); setReviewError(true); requestLock.current = false } }, 60_000)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true })
    try {
      const response = await dutyMapClient.review(input, controller.signal)
      if (controller.signal.aborted || started !== generation.current || latest.current.versionId !== versionId || latest.current.revision !== revision || reviewController.current !== controller) return
      validateDutyMapReview(response, input, projection)
      const before = latest.current.context
      restore.current = { versionId: projection.versionId, context: { ...before, expandedGroupIds: [...before.expandedGroupIds] }, scale: currentScale.current, left: viewport.current?.scrollLeft ?? 0, top: viewport.current?.scrollTop ?? 0 }
      setResult(response); setSelectedFinding(response.findings[0]?.id ?? null); setFindingFilter('')
      latest.current.onContextChange(revealDutyMapFindings(projection, response.findings))
    } catch {
      if (!controller.signal.aborted && started === generation.current) setReviewError(true)
    } finally {
      clearTimeout(timeout)
      if (started === generation.current && reviewController.current === controller) { setReviewing(false); requestLock.current = false }
    }
  }

  const nodeFindings = new Map<string, typeof findings>()
  for (const finding of findings) for (const ref of projection ? dutyMapFindingRefs(projection, finding) : []) {
    const keys = new Set([dutyMapTargetKey(ref)])
    const group = projection?.map?.groups.find(g => ref.kind === 'group' ? g.id === ref.id : ref.kind === 'duty' && projection.map?.memberships.some(m => m.groupId === g.id && m.dutyId === ref.id))
    if (group) { keys.add('group:' + group.id); keys.add('department:' + group.departmentId) }
    for (const key of keys) { const existing = nodeFindings.get(key) ?? []; if (!existing.some(f => f.id === finding.id)) nodeFindings.set(key, [...existing, finding]) }
  }
  const selected = context.selectedNode
  const selectedTitle = projection && selected ? nodeTitle(projection, selected) : null
  const selectedDuty = selected?.kind === 'duty' ? projection?.duties.find(d => d.id === selected.id) : null
  const membership = selectedDuty ? projection?.map?.memberships.find(m => m.dutyId === selectedDuty.id) : null
  const shownFinding = findings.find(f => f.id === selectedFinding)
  const currentFlywheel = projection?.map?.flywheels.find(f => f.id === context.flywheelId)
  const fit = () => { if (layout && viewport.current) { setScale(Math.max(.04, Math.min(1, (viewport.current.clientWidth - 20) / layout.width, (viewport.current.clientHeight - 20) / layout.height))); viewport.current.scrollLeft = 0; viewport.current.scrollTop = 0 } }
  const zoom = (next: number) => {
    const view = viewport.current
    const value = Math.max(.04, Math.min(2, next))
    const anchorX = view ? (view.scrollLeft + view.clientWidth / 2 - ((view.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0)) / scale : 0, anchorY = view ? (view.scrollTop + view.clientHeight / 2) / scale : 0
    setScale(value)
    requestAnimationFrame(() => { if (view) { view.scrollLeft = ((view.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0) + anchorX * value - view.clientWidth / 2; view.scrollTop = anchorY * value - view.clientHeight / 2 } })
  }
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button,a,input,select')) return
    pan.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const tags = (target: DutyMapTarget) => {
    if (!projection || !context.showChapters) return null
    const links = dutyMapChapterLinks(projection, target, target.kind === 'group')
    const unique = links.filter((link, index) => links.findIndex(l => l.chapterId === link.chapterId && l.kind === link.kind) === index)
    return <div className="duty-mind-map__tags">{unique.map(link => {
      const chapter = projection.chapters.find(c => c.chapterId === link.chapterId)
      return chapter ? <button type="button" key={link.chapterId + link.kind} className="duty-mind-map__tag" aria-label={`${link.kind === 'collaboration' ? '跨章交接：' : '主要歸章：'}${chapter.displayName}`} title={chapter.displayName + (link.explanation ? ' · ' + link.explanation : '')} aria-pressed={context.chapterId === chapter.chapterId} onClick={() => change({ chapterId: context.chapterId === chapter.chapterId ? null : chapter.chapterId })}>{link.kind === 'collaboration' ? '↗ ' : ''}{dutyChapterShortName(chapter.chapterId, chapter.displayName)}</button> : null
    })}</div>
  }
  const methods = (target: DutyMapTarget, label: string) => {
    if (!projection) return null
    const readable = getDutyMapMethods(projection, target)
    return <section className="duty-mind-map__methods" aria-label={label}><h4>{label}</h4>{readable.length ? <ul>{readable.map(method => <li key={method.id}><button type="button" onClick={() => onOpenMethod(method.id)}>{method.code ? `${method.code} · ` : ''}{method.title}</button></li>)}</ul> : <p>目前沒有可供閱讀的明確對應辦法</p>}</section>
  }

  return <section ref={rootElement} className={`duty-mind-map${compact ? ' is-compact' : ''}`} aria-label="部門職掌與管理辦法心智圖">
    <header className="duty-mind-map__header"><h2>部門職掌關係圖</h2>{projection && <span className="duty-mind-map__version">{projection.versionKind === 'draft' ? '草稿' : '現行版'} · {projection.versionName}</span>}
      {projection?.canReview && projection.map && !activeResult && <button type="button" className="duty-mind-map__review" disabled={reviewing} onClick={runReview}>{reviewing ? 'AI 盤點中…' : '請 AI 盤點'}</button>}
      {(activeResult || reviewing) && <button type="button" onClick={closeReview}>{reviewing ? '取消盤點' : '關閉 AI 結果'}</button>}
    </header>
    {loadError ? <div role="alert" className="duty-mind-map__empty">職掌關係圖讀取失敗<button type="button" onClick={() => setRetry(n => n + 1)}>重新載入</button></div> : !projection ? <p role="status">正在載入職掌關係圖…</p> : !projection.map ? <div className="duty-mind-map__empty"><p>此版本尚未建立部門職掌對應</p>{onCreateDraft && <button type="button" disabled={creating} onClick={async () => { setCreating(true); setCreateError(null); try { await onCreateDraft() } catch (error) { setCreateError(error instanceof DutyMapSeedConflict ? error.message : '草稿尚未建立，請稍後重試') } finally { setCreating(false) } }}>{creating ? '建立中…' : '建立職掌規劃草稿'}</button>}{createError && <p role="alert">{createError}</p>}</div> : <>
      <details className="duty-mind-map__filters" open={!compact || filtersOpen} onToggle={event => { if (compact) setFiltersOpen(event.currentTarget.open) }}>
        <summary>篩選與顯示{context.chapterId && <span> · {projection.chapters.find(c => c.chapterId === context.chapterId)?.displayName}</span>}</summary>
        <div className="duty-mind-map__filter-content">
      <div className="duty-mind-map__tools" aria-label="關係圖篩選">
        <label>部門<select aria-label="篩選部門" value={context.departmentId ?? ''} onChange={e => change({ departmentId: e.target.value || null })}><option value="">全部部門</option>{projection.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>職掌<select aria-label="職掌顯示層級" value={context.level} onChange={e => change({ level: e.target.value as DutyMapViewState['level'], expandedGroupIds: [] })}><option value="departments">收合職掌</option><option value="groups">職掌大項</option><option value="details">全部細項</option></select></label>
        <label>飛輪<select aria-label="篩選成長飛輪" value={context.flywheelId ?? ''} onChange={e => change({ flywheelId: e.target.value || null })}><option value="">隱藏飛輪</option>{projection.map.flywheels.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
        <label><input type="checkbox" checked={context.showChapters} onChange={e => change({ showChapters: e.target.checked })} />章節標記</label>
        <button type="button" onClick={clear}>清除篩選</button>
      </div>
      <nav className="duty-mind-map__chapters" aria-label="四部十二章篩選">{[...new Set(projection.chapters.map(c => c.groupId))].map(groupId => <section key={groupId} aria-label={projection.chapters.find(c => c.groupId === groupId)!.groupName}><h3>{projection.chapters.find(c => c.groupId === groupId)!.groupName}</h3>{projection.chapters.filter(c => c.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder).map(chapter => {
        const marked = findings.filter(f => f.chapterIds.includes(chapter.chapterId))
        return <div key={chapter.chapterId} className="duty-mind-map__chapter-row"><button type="button" aria-pressed={context.chapterId === chapter.chapterId} onClick={() => change({ chapterId: context.chapterId === chapter.chapterId ? null : chapter.chapterId })}>{chapter.displayName}</button>{!!marked.length && <button type="button" className="duty-mind-map__ai-mark" aria-label={`AI 盤點：${chapter.displayName}`} onClick={() => showFinding(marked[0])}>AI {marked.length}</button>}</div>
      })}</section>)}</nav>
        </div>
      </details>
      {reviewError && <p role="alert" className="duty-mind-map__error">本次 AI 盤點未完成</p>}
      {reviewing && <p role="status" className="duty-mind-map__status">正在盤點此版本的全公司職掌</p>}
      {activeResult && <section className="duty-mind-map__results" aria-label="本次 AI 盤點"><strong>AI 盤點 · 全公司 · {activeResult.versionKind === 'draft' ? '草稿' : '現行版'} · {activeResult.versionName}</strong>{activeResult.findings.length ? <><label>本次發現<select aria-label="篩選 AI 盤點結果" value={findingFilter} onChange={e => { setFindingFilter(e.target.value as DutyMapFindingKind | ''); setSelectedFinding(null) }}><option value="">全部發現</option>{Object.entries(findingNames).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label><div className="duty-mind-map__findings">{findings.map(f => <button type="button" key={f.id} aria-pressed={f.id === selectedFinding} onClick={() => showFinding(f)}>{findingNames[f.kind]} · {f.summary}</button>)}</div>{!findings.length && <p>本次沒有此類發現</p>}</> : <p>本次 AI 未提出發現</p>}</section>}
      {layout && !layout.nodes.length ? <div className="duty-mind-map__empty" role="status"><p>沒有符合{context.departmentId ? `「${projection.departments.find(d => d.id === context.departmentId)?.name ?? '所選部門'}」` : ''}{context.chapterId ? `與「${projection.chapters.find(c => c.chapterId === context.chapterId)?.displayName ?? '所選章節'}」` : ''}的職掌</p><button type="button" onClick={clear}>清除條件</button></div> : layout && <div className="duty-mind-map__reading">
        <div className="duty-mind-map__canvas-column">
          <div className="duty-mind-map__zoom" aria-label="畫布控制"><button type="button" onClick={fit}>全圖</button><button type="button" onClick={() => zoom(1)}>100%</button><button type="button" aria-label="縮小關係圖" onClick={() => zoom(scale / 1.25)}>−</button><output aria-label="縮放比例">{Math.round(scale * 100)}%</output><button type="button" aria-label="放大關係圖" onClick={() => zoom(scale * 1.25)}>＋</button></div>
          <div ref={viewport} className="duty-mind-map__viewport" tabIndex={0} role="region" aria-label="職掌圖畫布，可捲動或拖曳平移" onPointerDown={startPan} onPointerMove={e => { const start = pan.current; if (start) { e.currentTarget.scrollLeft = start.left - e.clientX + start.x; e.currentTarget.scrollTop = start.top - e.clientY + start.y } }} onPointerUp={() => { pan.current = null }} onPointerCancel={() => { pan.current = null }} onKeyDown={e => {
            if (e.target !== e.currentTarget) return
            const delta: Record<string, [number, number]> = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] }
            if (delta[e.key]) { e.preventDefault(); e.currentTarget.scrollLeft += delta[e.key][0]; e.currentTarget.scrollTop += delta[e.key][1] }
            else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(scale * 1.25) } else if (e.key === '-') { e.preventDefault(); zoom(scale / 1.25) }
          }}>
            <div className="duty-mind-map__stage" style={{ width: layout.width * scale, height: layout.height * scale }}><div className="duty-mind-map__scene" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
              <svg width={layout.width} height={layout.height} className="duty-mind-map__lines" aria-hidden="true"><defs>{Object.entries(DUTY_MAP_COLORS).map(([name, color]) => <marker key={name} id={`${namespace}-${name}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={color} /></marker>)}</defs>{layout.branches.map((d, i) => <path key={i} d={d} className="duty-mind-map__branch-line" />)}{layout.relationships.map(r => <path key={r.relationship.id} d={r.d} stroke={DUTY_MAP_COLORS[currentFlywheel?.colorKey ?? 'blue']} strokeWidth="2.5" fill="none" markerEnd={`url(#${namespace}-${currentFlywheel?.colorKey ?? 'blue'})`} />)}</svg>
              <strong className="duty-mind-map__company" style={rectStyle(layout.company)}>{projection.map.companyName}</strong>
              {layout.nodes.map(node => {
                const marked = nodeFindings.get(node.key) ?? [], selected = context.selectedNode && dutyMapTargetKey(context.selectedNode) === node.key
                const emphasized = shownFinding && marked.some(f => f.id === shownFinding.id)
                return <div key={node.key} data-duty-map-node={node.key} className={`duty-mind-map__node duty-mind-map__node--${node.ref.kind}${selected ? ' is-selected' : ''}${emphasized ? ' is-finding' : ''}`} style={rectStyle(node)}><button type="button" className="duty-mind-map__node-title" aria-expanded={node.ref.kind === 'group' ? node.expanded : undefined} aria-pressed={selected || false} onClick={() => focusNode(node.ref)}>{node.ref.kind === 'group' && <span aria-hidden="true">{node.expanded ? '−' : '+'} </span>}{node.title}</button>{node.ref.kind !== 'department' && tags(node.ref as DutyMapTarget)}{!!marked.length && <button type="button" className="duty-mind-map__ai-mark" aria-label={`AI 盤點：${node.title}`} onClick={() => showFinding(marked[0], node.ref)}>AI {marked.length}</button>}</div>
              })}
              {layout.relationships.map(r => <div key={r.relationship.id} className="duty-mind-map__delivery" style={{ left: r.label.x, top: r.label.y, color: DUTY_MAP_COLORS[currentFlywheel?.colorKey ?? 'blue'] }}><span>{projection.departments.find(d => d.id === r.relationship.fromDepartmentId)?.name} → {projection.departments.find(d => d.id === r.relationship.toDepartmentId)?.name}</span><strong>{r.relationship.delivery}</strong></div>)}
              {currentFlywheel?.presentation === 'department-cycle' && (() => {
                const dept = layout.nodes.find(n => n.ref.kind === 'department' && n.ref.id === currentFlywheel.departmentId)
                const descendants = layout.nodes.filter(n => n.parentKey === dept?.key || layout.nodes.some(g => g.parentKey === dept?.key && n.parentKey === g.key))
                return dept ? <div className="duty-mind-map__cycle" style={{ left: dept.side === 'left' ? 385 : 1305, top: Math.max(dept.y + dept.height, ...descendants.map(n => n.y + n.height)) + 18, color: DUTY_MAP_COLORS[currentFlywheel.colorKey] }}><strong>{currentFlywheel.title}</strong><p>{currentFlywheel.steps.join(' → ')} → {currentFlywheel.steps[0]}</p></div> : null
              })()}
            </div></div>
          </div>
          {currentFlywheel && <section className="duty-mind-map__handoffs" aria-label={currentFlywheel.title} style={{ borderColor: DUTY_MAP_COLORS[currentFlywheel.colorKey] }}><h3>{currentFlywheel.title}</h3>{currentFlywheel.presentation === 'cross-department' ? <ul>{layout.relationships.map(r => <li key={r.relationship.id}>{projection.departments.find(d => d.id === r.relationship.fromDepartmentId)?.name} → {projection.departments.find(d => d.id === r.relationship.toDepartmentId)?.name}：{r.relationship.delivery}</li>)}</ul> : <p>{currentFlywheel.steps.join(' → ')} → {currentFlywheel.steps[0]}</p>}</section>}
        </div>
        {(selectedTitle || shownFinding) && <aside className="duty-mind-map__detail" aria-label="職掌與盤點明細">
          {shownFinding && <section aria-label="AI 盤點理由"><h3>AI 盤點 · {findingNames[shownFinding.kind]}</h3><strong>{shownFinding.summary}</strong><ul>{dutyMapFindingRefs(projection, shownFinding).map(ref => <li key={dutyMapTargetKey(ref)}>{nodePath(projection, ref)}{ref.kind !== 'department' && <ul aria-label="已登錄章節對應">{dutyMapChapterLinks(projection, ref as DutyMapTarget, ref.kind === 'group').map(link => <li key={link.id}>{link.kind === 'collaboration' ? '跨章交接' : '主要歸章'}：{projection.chapters.find(c => c.chapterId === link.chapterId)?.displayName}{link.explanation ? ` · ${link.explanation}` : ''}</li>)}</ul>}</li>)}{shownFinding.chapterIds.map(id => <li key={id}>{projection.chapters.find(c => c.chapterId === id)?.displayName}</li>)}</ul><dl><dt>已登錄事實</dt><dd>{shownFinding.observed}</dd><dt>建議</dt><dd>{shownFinding.suggestion}</dd><dt>理由</dt><dd>{shownFinding.reason}</dd></dl></section>}
          {selected && selectedTitle && <section aria-label="選定職掌明細"><header><h3>{selectedTitle}</h3><button type="button" aria-label="關閉職掌明細" onClick={() => change({ selectedNode: null })}>×</button></header><p className="duty-mind-map__path">{nodePath(projection, selected)}</p>{membership?.planningStage === 'long-term' && <p className="duty-mind-map__planning">中長期規劃</p>}{selectedDuty && <p className="duty-mind-map__description">{selectedDuty.description || '尚未提供職掌說明'}</p>}{selected.kind !== 'department' && <><dl>{dutyMapChapterLinks(projection, selected as DutyMapTarget).map(link => <div key={link.id}><dt>{link.kind === 'collaboration' ? '↗ 跨章交接' : '主要歸章'} · {projection.chapters.find(c => c.chapterId === link.chapterId)?.displayName}</dt>{link.explanation && <dd>{link.explanation}</dd>}</div>)}</dl>{methods(selected as DutyMapTarget, selected.kind === 'duty' ? '本細項辦法' : '本大項共通辦法')}{selected.kind === 'duty' && membership && methods({ kind: 'group', id: membership.groupId }, '所屬大項共通辦法')}</>}</section>}
        </aside>}
      </div>}
    </>}
  </section>
}
