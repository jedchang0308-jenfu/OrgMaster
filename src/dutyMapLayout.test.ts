import { describe, expect, it } from 'vitest'
import { buildDutyMapProjection, DEFAULT_DUTY_MAP_VIEW } from './dutyMap'
import { createDutyMapSeed } from './dutyMapSeed'
import { screenshotOrganizationState } from './screenshotData'
import { buildDutyMapLayout, dutyMapFindingRefs, filterDutyMap, getDutyMapMethods, intersectDutyMapRect, makeDutyMapRelationship, revealDutyMapFindings } from './dutyMapLayout'
import type { DutyMapReviewFinding, DutyMapViewState } from './dutyMap'

function fixture() {
  let id = 0
  const state = createDutyMapSeed({ ...screenshotOrganizationState, departments: [], duties: [], dutyPositionRelations: [], dutyMap: undefined }, () => `fixture-${++id}`)
  const projection = buildDutyMapProjection(state, { versionId: 'v1', versionName: '規劃一', versionKind: 'draft', revision: 'r1' }, [], true)
  return projection
}
const view = (patch: Partial<DutyMapViewState> = {}): DutyMapViewState => ({ ...DEFAULT_DUTY_MAP_VIEW, expandedGroupIds: [], ...patch })

describe('duty map filtering and layout', () => {
  it('renders zero-position duties once and uses the complete version rather than assignments', () => {
    const p = fixture(), layout = buildDutyMapLayout(p, view({ level: 'details' }))
    expect(layout.nodes.filter(n => n.ref.kind === 'department')).toHaveLength(6)
    expect(layout.nodes.filter(n => n.ref.kind === 'group')).toHaveLength(33)
    expect(layout.nodes.filter(n => n.ref.kind === 'duty')).toHaveLength(116)
    expect(new Set(layout.nodes.map(n => n.key)).size).toBe(155)
    expect(layout.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.width <= layout.width && n.y + n.height <= layout.height)).toBe(true)
  })
  it('intersects departments and explicit primary/collaborative chapter links', () => {
    const p = fixture(), finance = p.departments.find(d => d.name === '財務部')!
    const all = filterDutyMap(p, view({ chapterId: '04' }))
    expect(all.departments.map(d => d.name).sort()).toEqual(['生產部', '研發部', '管理部', '財務部'].sort())
    const financeOnly = filterDutyMap(p, view({ departmentId: finance.id, chapterId: '04' }))
    expect(financeOnly.departments.map(d => d.name)).toEqual(['財務部'])
    expect(financeOnly.groups.flatMap(g => g.memberships).map(m => p.duties.find(d => d.id === m.dutyId)?.title)).toEqual(['付款排程與支付對象核實'])
    expect(filterDutyMap(p, view({ departmentId: finance.id, chapterId: '03' })).departments).toHaveLength(0)
  })
  it('retains immediate flywheel neighbors, endpoint intersection, side and order and restores positions', () => {
    const p = fixture(), production = p.departments.find(d => d.name === '生產部')!
    const full = buildDutyMapLayout(p, view())
    const filtered = buildDutyMapLayout(p, view({ departmentId: production.id, flywheelId: 'flywheel-knowledge' }))
    expect(filtered.nodes.filter(n => n.ref.kind === 'department').map(n => n.title)).toEqual(['生產部', '研發部'])
    expect(filtered.relationships).toHaveLength(2)
    for (const node of filtered.nodes.filter(n => n.ref.kind === 'department')) expect(node.side).toBe(full.nodes.find(n => n.key === node.key)?.side)
    expect(filtered.height).toBeLessThan(full.height)
    expect(filtered.relationships[0].label).not.toEqual(filtered.relationships[1].label)
    for (const relationship of filtered.relationships) {
      const label = relationship.label, company = filtered.company
      expect(Math.abs(label.y - company.y - company.height / 2)).toBeGreaterThan(company.height / 2 + 30)
    }
    expect(new Set(filtered.relationships.map(r => r.relationship.id)).size).toBe(2)
    expect(buildDutyMapLayout(p, view())).toEqual(full)
    expect(filterDutyMap(p, view({ departmentId: production.id, chapterId: '05', flywheelId: 'flywheel-knowledge' })).relationships).toHaveLength(0)
  })
  it('expands multiple groups independently and hiding tags retains expanded duty membership', () => {
    const p = fixture(), ids = p.map!.groups.slice(0, 2).map(g => g.id)
    const expanded = buildDutyMapLayout(p, view({ expandedGroupIds: ids }))
    const withoutTags = buildDutyMapLayout(p, view({ expandedGroupIds: ids, showChapters: false }))
    expect(expanded.nodes.filter(n => n.ref.kind === 'duty').map(n => n.key)).toEqual(withoutTags.nodes.filter(n => n.ref.kind === 'duty').map(n => n.key))
    expect(expanded.nodes.filter(n => n.ref.kind === 'group' && n.expanded)).toHaveLength(2)
  })
  it('intersects directional curves with node borders and preserves manual control points', () => {
    const a = { x: 0, y: 0, width: 100, height: 60 }, b = { x: 200, y: 300, width: 100, height: 60 }
    expect(intersectDutyMapRect(a, { x: 500, y: 30 })).toEqual({ x: 100, y: 30 })
    const forward = makeDutyMapRelationship(a, b), reverse = makeDutyMapRelationship(b, a)
    expect(forward.label).not.toEqual(reverse.label)
    const onBoundary = (p: {x:number;y:number}, r: typeof a) => Math.abs(p.x - r.x) < .001 || Math.abs(p.x - r.x - r.width) < .001 || Math.abs(p.y - r.y) < .001 || Math.abs(p.y - r.y - r.height) < .001
    expect(onBoundary(forward.start, a)).toBe(true); expect(onBoundary(forward.end, b)).toBe(true)
    expect(makeDutyMapRelationship(a, b, 0, { controlPoints: [{ x: 120, y: 90 }, { x: 150, y: 180 }], labelPosition: { x: 130, y: 140 } }).label).toEqual({ x: 130, y: 140 })
  })
  it('resolves only readable methods and marks chapter-only findings without inventing links', () => {
    const p = fixture(), group = p.map!.groups[0], duty = p.map!.memberships.find(m => m.groupId === group.id)!
    p.methods = [{ id: 'readable', code: 'MP-0001', title: '共通辦法' }]
    p.map!.methodLinks.push({ id: 'link1', target: { kind: 'group', id: group.id }, methodId: 'readable' }, { id: 'link2', target: { kind: 'duty', id: duty.dutyId }, methodId: 'private' })
    expect(getDutyMapMethods(p, { kind: 'group', id: group.id }).map(m => m.title)).toEqual(['共通辦法'])
    expect(getDutyMapMethods(p, { kind: 'duty', id: duty.dutyId })).toEqual([])
    const finding: DutyMapReviewFinding = { id: 'f1', kind: 'chapter-collaboration-only', nodeRefs: [], chapterIds: ['04'], relationshipIds: [], summary: '核對', observed: '已有交接', suggestion: '請核對', reason: '依提供資料' }
    const before = structuredClone(p.map)
    expect(dutyMapFindingRefs(p, finding).length).toBeGreaterThan(0)
    expect(revealDutyMapFindings(p, [finding]).departmentId).toBeNull()
    expect(revealDutyMapFindings(p, [finding]).expandedGroupIds.length).toBeGreaterThan(0)
    p.map!.chapterLinks = p.map!.chapterLinks.filter(l => l.chapterId !== '04')
    expect(dutyMapFindingRefs(p, finding)).toEqual([])
    expect(before?.methodLinks).toHaveLength(2)
  })
})
