/** @vitest-environment jsdom */
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDutyMapProjection, DEFAULT_DUTY_MAP_VIEW } from '../dutyMap'
import type { DutyMapProjection, DutyMapReviewResult, DutyMapViewState } from '../dutyMap'
import { dutyMapClient } from '../dutyMapClient'
import { createDutyMapSeed, DutyMapSeedConflict } from '../dutyMapSeed'
import { screenshotOrganizationState } from '../screenshotData'
import { DutyMindMap } from './DutyMindMap'
import { renderWorkspacePanel } from './workspace/WorkspaceModuleSurfaces'

const mounts: Array<{ root: Root; host: HTMLDivElement }> = []
afterEach(() => { for (const { root, host } of mounts.splice(0)) { act(() => root.unmount()); host.remove() }; vi.restoreAllMocks(); vi.unstubAllGlobals() })
function fixture() {
  let id = 0
  const state = createDutyMapSeed({ ...screenshotOrganizationState, departments: [], duties: [], dutyPositionRelations: [], dutyMap: undefined }, () => 'fixture-' + ++id)
  return buildDutyMapProjection(state, { versionId: 'v1', versionName: '完整規劃', versionKind: 'draft', revision: 'r1' }, [], true)
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
async function mount(projection: DutyMapProjection, initial: DutyMapViewState = { ...DEFAULT_DUTY_MAP_VIEW }, create?: () => Promise<void>) {
  vi.spyOn(dutyMapClient, 'get').mockResolvedValue(projection)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); mounts.push({ root, host })
  let current = initial
  const open = vi.fn()
  function Harness({ version = 'v1', revision }: {version?: string; revision?: string | null}) {
    const [context, setContext] = useState(initial); current = context
    return <DutyMindMap versionId={version} revision={revision} context={context} onContextChange={setContext} onOpenMethod={open} onCreateDraft={create} />
  }
  await act(async () => root.render(<Harness />)); await flush()
  return { host, root, open, current: () => current,
    switchVersion: async (version: string) => { await act(async () => root.render(<Harness version={version} />)); await flush() },
    switchRevision: async (revision: string) => { await act(async () => root.render(<Harness revision={revision} />)); await flush() },
  }
}
function button(host: HTMLElement, text: string) { const found = [...host.querySelectorAll('button')].find(b => b.textContent === text); if (!found) throw Error('Button absent: ' + text); return found }
function click(element: Element) { act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))) }
function select(host: HTMLElement, label: string, value: string) { const element = host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement; act(() => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })) }) }
function reviewResult(p: DutyMapProjection, requestId: string): DutyMapReviewResult {
  const first = p.duties.find(d => d.title === '現場維修、保養與改造執行')!, second = p.duties.find(d => d.title === '產品操作、安裝與維護技術文件')!
  return { requestId, versionId: p.versionId, versionName: p.versionName, versionKind: p.versionKind, revision: p.revision, chapterCatalogVersion: p.chapterCatalogVersion, generatedAt: '2026-11-25T00:00:00Z', findings: [{ id: 'finding1', kind: 'handoff-gap', nodeRefs: [{ kind: 'duty', id: first.id }, { kind: 'duty', id: second.id }], chapterIds: ['03'], relationshipIds: [], summary: '修復經驗交接', observed: '已登錄兩端職掌', suggestion: '核對組裝指引', reason: '維修經驗需要技術文件承接' }] }
}

describe('DutyMindMap RD UI checks', () => {
  it('shows four sections and twelve named chapters, six departments and 33 groups without auto review', async () => {
    const p = fixture(), review = vi.spyOn(dutyMapClient, 'review'), { host } = await mount(p)
    expect(host.querySelectorAll('.duty-mind-map__chapters > section')).toHaveLength(4)
    expect(host.querySelectorAll('.duty-mind-map__chapter-row')).toHaveLength(12)
    expect(host.querySelectorAll('[data-duty-map-node^="department:"]')).toHaveLength(6)
    expect(host.querySelectorAll('[data-duty-map-node^="group:"]')).toHaveLength(33)
    expect(host.textContent).toContain('草稿 · 完整規劃')
    click(host.querySelector('.duty-mind-map__node--group button')!)
    expect(host.querySelectorAll('[data-duty-map-node^="duty:"]').length).toBeGreaterThan(0)
    select(host, '篩選部門', p.departments.find(d => d.name === '財務部')!.id)
    click(button(host, '供應商、採購與付款管理'))
    expect(host.querySelectorAll('[data-duty-map-node^="department:"]')).toHaveLength(1)
    expect(review).not.toHaveBeenCalled()
  })
  it('shows descriptions, long-term marker only in detail, direct and parent readable method groups', async () => {
    const p = fixture(), duty = p.duties.find(d => d.title === '進料與委外品質驗收')!, membership = p.map!.memberships.find(m => m.dutyId === duty.id)!
    duty.description = '依原始規格逐項驗收\n保存查驗紀錄'; membership.planningStage = 'long-term'
    p.methods = [{ id: 'direct', code: 'MP-0002', title: '委外驗收說明' }, { id: 'common', code: 'MP-0001', title: '品質共通辦法' }]
    p.map!.methodLinks.push({ id: 'l1', target: { kind: 'duty', id: duty.id }, methodId: 'direct' }, { id: 'l2', target: { kind: 'group', id: membership.groupId }, methodId: 'common' }, { id: 'l3', target: { kind: 'duty', id: duty.id }, methodId: 'hidden-secret-id' })
    const { host, open } = await mount(p, { ...DEFAULT_DUTY_MAP_VIEW, expandedGroupIds: [membership.groupId] })
    expect(host.textContent).not.toContain('中長期規劃')
    click(host.querySelector(`[data-duty-map-node="duty:${duty.id}"] button`)!)
    expect(host.querySelector('.duty-mind-map__detail')?.textContent).toContain(duty.description)
    expect(host.querySelector('.duty-mind-map__detail')?.textContent).toContain('中長期規劃')
    expect(host.querySelector('[aria-label="本細項辦法"]')?.textContent).toContain('委外驗收說明')
    expect(host.querySelector('[aria-label="所屬大項共通辦法"]')?.textContent).toContain('品質共通辦法')
    click(button(host, 'MP-0001 · 品質共通辦法')); expect(open).toHaveBeenCalledWith('common')
    expect(host.textContent).not.toContain('hidden-secret-id'); expect(host.textContent).not.toContain(duty.id)
  })
  it('keeps multiple disclosures when selecting another duty, department or chapter and toggling tags', async () => {
    const p = fixture(), ids = p.map!.groups.slice(0, 2).map(g => g.id)
    const initial = { ...DEFAULT_DUTY_MAP_VIEW, expandedGroupIds: ids }
    const { host, current } = await mount(p, initial)
    const detail = host.querySelector('.duty-mind-map__node--duty button')!
    click(detail); expect(current().expandedGroupIds).toEqual(ids)
    click(host.querySelector('.duty-mind-map__node--department button')!); expect(current().expandedGroupIds).toEqual(ids)
    click(host.querySelector('input[type="checkbox"]')!); expect(current().expandedGroupIds).toEqual(ids)
    click(button(host, '策略、治理、風險與法遵管理')); expect(current().expandedGroupIds).toEqual(ids)
    expect(host.querySelectorAll('.duty-mind-map__node--group button[aria-expanded="true"]')).toHaveLength(2)
  })
  it('reveals cross-department original branches only on success and restores exact current context on close', async () => {
    const p = fixture(), finance = p.departments.find(d => d.name === '財務部')!, group = p.map!.groups.find(g => g.departmentId === finance.id)!
    let finish!: (result: DutyMapReviewResult) => void, requestId = ''
    const review = vi.spyOn(dutyMapClient, 'review').mockImplementation(input => { requestId = input.requestId; return new Promise(resolve => { finish = resolve }) })
    const initial = { ...DEFAULT_DUTY_MAP_VIEW, departmentId: finance.id, expandedGroupIds: [group.id], showChapters: false }
    const { host, current } = await mount(p, initial)
    click(button(host, '請 AI 盤點')); expect(review).toHaveBeenCalledTimes(1)
    expect(host.querySelectorAll('[data-duty-map-node^="department:"]')).toHaveLength(1)
    expect(current()).toEqual(initial)
    await act(async () => finish(reviewResult(p, requestId))); await flush()
    expect(host.querySelectorAll('[data-duty-map-node^="department:"]')).toHaveLength(6)
    expect(host.querySelectorAll('.duty-mind-map__node--duty .duty-mind-map__ai-mark')).toHaveLength(2)
    expect(host.querySelector('[aria-label="AI 盤點理由"]')?.textContent).toContain('維修經驗需要技術文件承接')
    expect(host.querySelector('[aria-label="AI 盤點理由"]')?.textContent).toContain('生產部')
    expect(host.querySelector('[aria-label="AI 盤點理由"]')?.textContent).toContain('研發部')
    click(button(host, '關閉 AI 結果'))
    expect(current()).toEqual(initial); expect(host.querySelectorAll('.duty-mind-map__ai-mark')).toHaveLength(0)
  })
  it('cancels version changes and unmount; late responses cannot mark another version', async () => {
    const p = fixture(); let finish!: (result: DutyMapReviewResult) => void; let requestId = ''; let signal: AbortSignal | undefined
    vi.spyOn(dutyMapClient, 'review').mockImplementation((input, received) => { requestId = input.requestId; signal = received; return new Promise(resolve => { finish = resolve }) })
    const { host, switchVersion, root } = await mount(p)
    click(button(host, '請 AI 盤點'))
    vi.mocked(dutyMapClient.get).mockResolvedValue({ ...p, versionId: 'v2', versionName: '下一版本' })
    await switchVersion('v2'); expect(signal?.aborted).toBe(true)
    await act(async () => finish(reviewResult(p, requestId))); await flush()
    expect(host.textContent).toContain('下一版本'); expect(host.querySelectorAll('.duty-mind-map__ai-mark')).toHaveLength(0)
    click(button(host, '請 AI 盤點')); act(() => root.unmount()); expect(signal?.aborted).toBe(true)
    mounts.splice(mounts.findIndex(m => m.root === root), 1); host.remove()
  })
  it('preserves the original graph on failure and has no review action for ordinary readers', async () => {
    const p = fixture(); vi.spyOn(dutyMapClient, 'review').mockRejectedValue(new Error('private provider error'))
    const initial = { ...DEFAULT_DUTY_MAP_VIEW, departmentId: p.departments[0].id }
    const { host, current } = await mount(p, initial)
    click(button(host, '請 AI 盤點')); await flush()
    expect(host.textContent).toContain('本次 AI 盤點未完成'); expect(host.textContent).not.toContain('private provider error'); expect(current()).toEqual(initial)
    const reader = await mount({ ...p, canReview: false })
    expect([...reader.host.querySelectorAll('button')].some(b => b.textContent === '請 AI 盤點')).toBe(false)
  })
  it('marks chapter-only empty findings, supports AI filters, and does not add formal relations', async () => {
    const p = fixture(); p.map!.chapterLinks = p.map!.chapterLinks.filter(l => l.chapterId !== '04')
    const before = structuredClone(p.map)
    vi.spyOn(dutyMapClient, 'review').mockImplementation(async input => ({ ...reviewResult(p, input.requestId), findings: [{ id: 'chapter-only', kind: 'chapter-no-duty', nodeRefs: [], chapterIds: ['04'], relationshipIds: [], summary: '採購範圍待確認', observed: '提供資料未列出對應', suggestion: '請主管核對', reason: '僅依本版本資料' }] }))
    const { host } = await mount(p); click(button(host, '請 AI 盤點')); await flush()
    const chapterMark = host.querySelector('button[aria-label="AI 盤點：供應商、採購與付款管理"]')
    expect(chapterMark).not.toBeNull(); click(chapterMark!)
    expect(host.querySelector('[aria-label="AI 盤點理由"]')?.textContent).toContain('僅依本版本資料')
    select(host, '篩選 AI 盤點結果', 'duty-unmapped'); expect(host.textContent).toContain('本次沒有此類發現')
    expect(p.map).toEqual(before)
  })
  it('separates legacy empty maps and load failure, and only supplied creation action is rendered', async () => {
    const p = fixture(), create = vi.fn().mockResolvedValue(undefined)
    const empty = await mount({ ...p, map: null })
    expect(empty.host.textContent).toContain('此版本尚未建立部門職掌對應')
    expect(empty.host.textContent).not.toContain('建立職掌規劃草稿')
    const supplied = await mount({ ...p, map: null }, { ...DEFAULT_DUTY_MAP_VIEW }, create)
    click(button(supplied.host, '建立職掌規劃草稿')); await flush(); expect(create).toHaveBeenCalledTimes(1)
  })
  it('DEV071 gap: selecting a marked duty switches to its finding and pairs actual mapping with the suggestion', async () => {
    const p = fixture(), duty = p.duties.find(d => d.title === '付款排程與支付對象核實')!
    p.map!.chapterLinks = p.map!.chapterLinks.filter(l => l.target.id !== duty.id || l.kind === 'primary')
    vi.spyOn(dutyMapClient, 'review').mockImplementation(async input => ({ ...reviewResult(p, input.requestId), findings: [...reviewResult(p, input.requestId).findings, {
      id: 'finance-finding', kind: 'mapping-suggestion', nodeRefs: [{ kind: 'duty', id: duty.id }], chapterIds: ['04'], relationshipIds: [],
      summary: '付款交接待核對', observed: '依提供的職掌資料', suggestion: '建議補上採購付款的跨章交接', reason: '核對支付依據的來源',
    }] }))
    const { host } = await mount(p); click(button(host, '請 AI 盤點')); await flush()
    expect(host.querySelector('[aria-label="AI 盤點理由"]')?.textContent).toContain('修復經驗交接')
    click(host.querySelector(`[data-duty-map-node="duty:${duty.id}"] .duty-mind-map__node-title`)!)
    const reason = host.querySelector('[aria-label="AI 盤點理由"]')!
    expect(reason.textContent).toContain('付款交接待核對')
    expect(reason.querySelector('[aria-label="已登錄章節對應"]')?.textContent).toContain('主要歸章：會計、財務與稅務管理')
    expect(reason.textContent).toContain('建議補上採購付款的跨章交接')
    expect(reason.querySelector('[aria-label="已登錄章節對應"]')?.textContent).not.toContain('供應商、採購與付款管理')
  })
  it('DEV071 gap: selecting a result after filtering reveals both original endpoints and closing restores the pre-result context', async () => {
    const p = fixture(), finance = p.departments.find(d => d.name === '財務部')!
    const first = p.duties.find(d => d.title === '現場維修、保養與改造執行')!, second = p.duties.find(d => d.title === '產品操作、安裝與維護技術文件')!
    const initial: DutyMapViewState = { ...DEFAULT_DUTY_MAP_VIEW, departmentId: finance.id, chapterId: '11', flywheelId: 'flywheel-cost', level: 'details', showChapters: false, expandedGroupIds: [p.map!.groups[0].id], selectedNode: { kind: 'department', id: finance.id } }
    vi.spyOn(dutyMapClient, 'review').mockImplementation(async input => reviewResult(p, input.requestId))
    const { host, current } = await mount(p, initial); click(button(host, '請 AI 盤點')); await flush()
    select(host, '篩選部門', finance.id)
    expect(host.querySelector(`[data-duty-map-node="duty:${first.id}"]`)).toBeNull()
    click(button(host, '交接待核對 · 修復經驗交接'))
    expect(host.querySelector(`[data-duty-map-node="duty:${first.id}"]`)).not.toBeNull()
    expect(host.querySelector(`[data-duty-map-node="duty:${second.id}"]`)).not.toBeNull()
    expect(current().departmentId).toBeNull(); expect(current().chapterId).toBeNull()
    click(button(host, '關閉 AI 結果')); expect(current()).toEqual(initial)
  })
  it('DEV071 stability: fresh workspace context and inline callbacks retain the map DOM, read request and pending review', async () => {
    const p = fixture(), get = vi.spyOn(dutyMapClient, 'get').mockResolvedValue(p)
    let reviewSignal: AbortSignal | undefined
    const review = vi.spyOn(dutyMapClient, 'review').mockImplementation((_input, signal) => { reviewSignal = signal; return new Promise(() => undefined) })
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host); mounts.push({ root, host })
    function WorkspaceHarness() {
      const [context, setContext] = useState<DutyMapViewState>({ ...DEFAULT_DUTY_MAP_VIEW })
      // Match App's renderer invocation, fresh context and inline callback identities.
      return renderWorkspacePanel('duties', 'active', { duties: () => <section><nav /><DutyMindMap
        versionId="v1" context={{ ...context, expandedGroupIds: [...context.expandedGroupIds] }}
        onContextChange={next => setContext({ ...next })} onOpenMethod={() => undefined}
      /></section> })
    }
    await act(async () => root.render(<WorkspaceHarness />)); await flush()
    const company = host.querySelector('.duty-mind-map__company')
    const viewport = host.querySelector('.duty-mind-map__viewport')
    expect(get).toHaveBeenCalledTimes(1)
    click(button(host, '請 AI 盤點'))
    click(button(host, '供應商、採購與付款管理')); await flush()
    expect(host.querySelectorAll('.duty-mind-map__node--department')).toHaveLength(4)
    expect(host.querySelector('.duty-mind-map__company')).toBe(company)
    expect(host.querySelector('.duty-mind-map__viewport')).toBe(viewport)
    click(button(host, '清除篩選')); await flush()
    expect(host.querySelectorAll('.duty-mind-map__node--department')).toHaveLength(6)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][1]?.aborted).toBe(false)
    expect(review).toHaveBeenCalledTimes(1)
    expect(reviewSignal?.aborted).toBe(false)
    expect(button(host, '取消盤點')).toBeDefined()
  })
  it('DEV071 viewport: compact filters stay keyboard-expandable while wide panels keep all four sections open', async () => {
    let width = 188
    const observers = new Set<() => void>()
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: () => void) { observers.add(callback) } observe() {} disconnect() { observers.delete(this.callback) } })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
    const { host } = await mount(fixture())
    const filters = host.querySelector('details')!
    expect(host.querySelector('.duty-mind-map.is-compact')).not.toBeNull()
    expect(filters.open).toBe(false)
    expect(filters.querySelector('summary')?.textContent).toContain('篩選與顯示')
    act(() => { filters.open = true; filters.dispatchEvent(new Event('toggle')) })
    expect(filters.open).toBe(true)
    click(button(host, '供應商、採購與付款管理'))
    expect(host.querySelectorAll('.duty-mind-map__node--department')).toHaveLength(4)
    expect(filters.open).toBe(true)
    width = 1200
    act(() => observers.forEach(notify => notify()))
    expect(host.querySelector('.duty-mind-map.is-compact')).toBeNull()
    expect(filters.open).toBe(true)
    expect(host.querySelectorAll('.duty-mind-map__chapters > section')).toHaveLength(4)
    expect(host.querySelectorAll('.duty-mind-map__chapter-row')).toHaveLength(12)
    expect(dutyMapClient.get).toHaveBeenCalledTimes(1)
  })
  it('DEV071 viewport: a hidden panel centers the hub when measurable and preserves its center across split resizing', async () => {
    let width = 0, height = 0
    const observers = new Set<() => void>()
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: () => void) { observers.add(callback) } observe() {} disconnect() { observers.delete(this.callback) } })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function(this: HTMLElement) { return this.classList.contains('duty-mind-map__viewport') ? width : 600 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height)
    const { host } = await mount(fixture())
    const viewport = host.querySelector('.duty-mind-map__viewport') as HTMLElement
    const company = host.querySelector('.duty-mind-map__company') as HTMLElement
    const companyX = parseFloat(company.style.left) + parseFloat(company.style.width) / 2
    const companyY = parseFloat(company.style.top) + parseFloat(company.style.minHeight) / 2
    expect(viewport.scrollTop).toBe(0)
    width = 600; height = 360
    act(() => observers.forEach(notify => notify()))
    expect(viewport.scrollLeft + width / 2).toBe(companyX)
    expect(viewport.scrollTop + height / 2).toBe(companyY)
    width = 188; height = 260
    act(() => observers.forEach(notify => notify()))
    expect(viewport.scrollLeft + width / 2).toBe(companyX)
    expect(viewport.scrollTop + height / 2).toBe(companyY)
    width = 0; height = 0
    act(() => observers.forEach(notify => notify()))
    viewport.scrollLeft = 0; viewport.scrollTop = 0
    width = 600; height = 400
    act(() => observers.forEach(notify => notify()))
    expect(viewport.scrollLeft + width / 2).toBe(companyX)
    expect(viewport.scrollTop + height / 2).toBe(companyY)
    expect(dutyMapClient.get).toHaveBeenCalledTimes(1)
  })
  it('DEV071 revision: same-version changes reload the projection, cancel old AI and reject late results without clearing view filters', async () => {
    const p = fixture(), finance = p.departments.find(d => d.name === '財務部')!
    const initial = { ...DEFAULT_DUTY_MAP_VIEW, departmentId: finance.id }
    let finish!: (result: DutyMapReviewResult) => void, oldRequestId = '', signal: AbortSignal | undefined
    const review = vi.spyOn(dutyMapClient, 'review').mockImplementation((input, received) => {
      oldRequestId = input.requestId; signal = received
      return new Promise(resolve => { finish = resolve })
    })
    const { host, current, switchRevision } = await mount(p, initial)
    click(button(host, '請 AI 盤點'))
    const oldId = oldRequestId
    vi.mocked(dutyMapClient.get).mockResolvedValue({ ...p, revision: 'r2', departments: p.departments.map(d => d.id === finance.id ? { ...d, name: '財務與經營分析部' } : d) })
    await switchRevision('r2')
    expect(signal?.aborted).toBe(true)
    expect(dutyMapClient.get).toHaveBeenCalledTimes(2)
    expect(dutyMapClient.get).toHaveBeenLastCalledWith('v1', expect.any(AbortSignal))
    expect(host.textContent).toContain('財務與經營分析部')
    expect(current()).toEqual(initial)
    await act(async () => finish(reviewResult(p, oldId))); await flush()
    expect(host.querySelectorAll('.duty-mind-map__ai-mark')).toHaveLength(0)
    click(button(host, '請 AI 盤點'))
    expect(review).toHaveBeenLastCalledWith(expect.objectContaining({ versionId: 'v1', expectedVersionRevision: 'r2' }), expect.any(AbortSignal))
  })
  it('DEV071 creation: seed conflicts retain source path and reason while unknown rejection details stay private', async () => {
    const p = fixture(), sourcePath = '鉦富機械／研發部／品質策劃、檢驗與放行／進料與委外品質驗收'
    const create = vi.fn().mockRejectedValueOnce(new DutyMapSeedConflict(sourcePath, '找到同名節點，請先核對實際 ID'))
      .mockRejectedValueOnce(new Error('private-provider-credential-detail'))
    const { host } = await mount({ ...p, map: null }, { ...DEFAULT_DUTY_MAP_VIEW }, create)
    click(button(host, '建立職掌規劃草稿')); await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(sourcePath)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('找到同名節點，請先核對實際 ID')
    click(button(host, '建立職掌規劃草稿')); await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('草稿尚未建立，請稍後重試')
    expect(host.textContent).not.toContain('private-provider-credential-detail')
  })
  it('DEV071 structural: finance to clear and flywheel changes center the new hub while local disclosure preserves pan', async () => {
    const observers = new Set<() => void>()
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: () => void) { observers.add(callback) } observe() {} disconnect() { observers.delete(this.callback) } })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 188)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 400)
    const p = fixture(), { host } = await mount(p)
    const viewport = host.querySelector('.duty-mind-map__viewport') as HTMLElement
    const centered = () => {
      const company = host.querySelector('.duty-mind-map__company') as HTMLElement
      expect(viewport.scrollLeft + 94).toBe(parseFloat(company.style.left) + parseFloat(company.style.width) / 2)
      expect(viewport.scrollTop + 200).toBe(parseFloat(company.style.top) + parseFloat(company.style.minHeight) / 2)
    }
    const filters = host.querySelector('details')!
    act(() => { filters.open = true; filters.dispatchEvent(new Event('toggle')) })
    select(host, '篩選部門', p.departments.find(d => d.name === '財務部')!.id)
    viewport.scrollTop = 0 // Native scrolling clamps to zero when the filtered scene becomes short.
    click(button(host, '清除篩選'))
    act(() => { filters.open = false; filters.dispatchEvent(new Event('toggle')); observers.forEach(notify => notify()) })
    centered()
    for (const flywheel of ['flywheel-customer', 'flywheel-knowledge', 'flywheel-cost']) {
      select(host, '篩選成長飛輪', flywheel)
      centered()
    }
    click(button(host, '清除篩選'))
    viewport.scrollLeft = 444; viewport.scrollTop = 111
    click(host.querySelector('.duty-mind-map__node--group .duty-mind-map__node-title')!)
    act(() => observers.forEach(notify => notify()))
    expect(viewport.scrollLeft).toBe(444); expect(viewport.scrollTop).toBe(111)
    click(button(host, '清除篩選')) // Also resets a disclosure when structural filters were already default.
    centered()
    expect(dutyMapClient.get).toHaveBeenCalledTimes(1)
  })
})
