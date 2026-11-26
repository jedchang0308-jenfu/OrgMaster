import { DEFAULT_DUTY_MAP_VIEW, dutyMapTargetKey } from './dutyMap'
import type { DutyMapData, DutyMapNodeRef, DutyMapPoint, DutyMapProjection, DutyMapReviewFinding, DutyMapTarget, DutyMapViewState } from './dutyMap'

export const DUTY_MAP_COLORS = { blue: '#286eb5', orange: '#ac570e', green: '#26804c', purple: '#8151a0', teal: '#147b76' }
const chapterShortNames = ['策略治理', '客戶商務', '產品工程', '採購付款', '生產庫存', '品質管理', '安裝售後', '人力薪工', '設施環安', '資訊知識', '會計財務', '稽核改善']
export const dutyChapterShortName = (id: string, fallback: string) => chapterShortNames[Number(id) - 1] ?? fallback

export function dutyMapChapterLinks(projection: DutyMapProjection, target: DutyMapTarget, aggregate = false) {
  const map = projection.map
  const targets = new Set([dutyMapTargetKey(target)])
  if (aggregate && target.kind === 'group') map?.memberships.filter(m => m.groupId === target.id).forEach(m => targets.add('duty:' + m.dutyId))
  return map?.chapterLinks.filter(link => targets.has(dutyMapTargetKey(link.target))) ?? []
}

export function getDutyMapMethods(projection: DutyMapProjection, target: DutyMapTarget) {
  // Resolve only the server's readable summaries; absent documents never expose IDs or names.
  const ids = new Set(projection.map?.methodLinks.filter(link => link.target.kind === target.kind && link.target.id === target.id).map(link => link.methodId))
  return projection.methods.filter(method => ids.has(method.id))
}

export function filterDutyMap(projection: DutyMapProjection, view: DutyMapViewState) {
  const map = projection.map
  const selectedRelationships = map?.relationships.filter(r => r.flywheelId === view.flywheelId) ?? []
  const departmentIds = new Set(view.departmentId ? [view.departmentId] : projection.departments.map(d => d.id))
  if (view.departmentId && view.flywheelId) selectedRelationships.forEach(r => {
    if (r.fromDepartmentId === view.departmentId) departmentIds.add(r.toDepartmentId)
    if (r.toDepartmentId === view.departmentId) departmentIds.add(r.fromDepartmentId)
  })
  const groups = (map?.groups ?? []).filter(group => departmentIds.has(group.departmentId)).flatMap(group => {
    const groupMatches = !view.chapterId || dutyMapChapterLinks(projection, { kind: 'group', id: group.id }).some(l => l.chapterId === view.chapterId)
    const memberships = (map?.memberships ?? []).filter(m => m.groupId === group.id)
      .filter(m => groupMatches || dutyMapChapterLinks(projection, { kind: 'duty', id: m.dutyId }).some(l => l.chapterId === view.chapterId))
      .sort((a, b) => a.order - b.order)
    return groupMatches || memberships.length ? [{ ...group, memberships }] : []
  }).sort((a, b) => a.order - b.order)
  const departments = projection.departments.filter(d => departmentIds.has(d.id) && (!view.chapterId || groups.some(g => g.departmentId === d.id)))
  const visibleIds = new Set(departments.map(d => d.id))
  return { departments, groups, relationships: selectedRelationships.filter(r => visibleIds.has(r.fromDepartmentId) && visibleIds.has(r.toDepartmentId)) }
}

/** Explicit model references and registered chapter links only; no inferred gaps. */
export function dutyMapFindingRefs(projection: DutyMapProjection, finding: DutyMapReviewFinding) {
  const refs = new Map(finding.nodeRefs.map(ref => [dutyMapTargetKey(ref), ref]))
  projection.map?.relationships.filter(r => finding.relationshipIds.includes(r.id)).forEach(r => {
    refs.set('department:' + r.fromDepartmentId, { kind: 'department', id: r.fromDepartmentId })
    refs.set('department:' + r.toDepartmentId, { kind: 'department', id: r.toDepartmentId })
  })
  if (!finding.nodeRefs.length) projection.map?.chapterLinks.filter(l => finding.chapterIds.includes(l.chapterId)).forEach(l => refs.set(dutyMapTargetKey(l.target), l.target))
  return [...refs.values()]
}

export function revealDutyMapFindings(projection: DutyMapProjection, findings: DutyMapReviewFinding[]): DutyMapViewState {
  const refs = findings.flatMap(f => dutyMapFindingRefs(projection, f))
  const groups = new Set(refs.filter(r => r.kind === 'group').map(r => r.id))
  const duties = new Set(refs.filter(r => r.kind === 'duty').map(r => r.id))
  projection.map?.memberships.filter(m => duties.has(m.dutyId)).forEach(m => groups.add(m.groupId))
  return { ...DEFAULT_DUTY_MAP_VIEW, expandedGroupIds: [...groups], selectedNode: null }
}

export interface DutyMapRect { x: number; y: number; width: number; height: number }
export interface DutyMapLayoutNode extends DutyMapRect { key: string; ref: DutyMapNodeRef; title: string; side: 'left' | 'right'; parentKey: string; expanded?: boolean }
export interface DutyMapLayout { width: number; height: number; company: DutyMapRect; nodes: DutyMapLayoutNode[]; branches: string[]; relationships: Array<{ relationship: DutyMapData['relationships'][number]; d: string; label: DutyMapPoint; start: DutyMapPoint; end: DutyMapPoint }> }
const center = (r: DutyMapRect): DutyMapPoint => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })

export function intersectDutyMapRect(rect: DutyMapRect, toward: DutyMapPoint): DutyMapPoint {
  const c = center(rect), dx = toward.x - c.x, dy = toward.y - c.y
  const factor = Math.min(dx ? rect.width / 2 / Math.abs(dx) : Infinity, dy ? rect.height / 2 / Math.abs(dy) : Infinity)
  return Number.isFinite(factor) ? { x: c.x + dx * factor, y: c.y + dy * factor } : { x: c.x + rect.width / 2, y: c.y }
}

// Pure cubic path/point and horizontal branch math adapted from ProJED
// C:/Users/user/.codex/worktrees/projed-independent-dev/ProJED/src/components/MindMap/mindMapGeometry.ts
// (createLocalConnectorPath/getCubicPoint). No board state, deduplication or storage is reused.
function cubicPath(a: DutyMapPoint, c1: DutyMapPoint, c2: DutyMapPoint, b: DutyMapPoint) {
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}
function cubicMiddle(a: DutyMapPoint, c1: DutyMapPoint, c2: DutyMapPoint, b: DutyMapPoint) {
  return { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
}
function branchPath(from: DutyMapRect, to: DutyMapRect, side: 'left' | 'right') {
  const right = side === 'right'
  const a = { x: from.x + (right ? from.width : 0), y: center(from).y }
  const b = { x: to.x + (right ? 0 : to.width), y: center(to).y }
  const delta = Math.max(Math.abs(b.x - a.x) * .45, 24) * (right ? 1 : -1)
  return cubicPath(a, { x: a.x + delta, y: a.y }, { x: b.x - delta, y: b.y }, b)
}
export function makeDutyMapRelationship(from: DutyMapRect, to: DutyMapRect, lane = 0, geometry?: DutyMapData['relationships'][number]['geometry']) {
  const a = center(from), b = center(to), distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  // Reversed endpoints reverse the normal too: opposite arrows retain separate lanes.
  const offset = 110 + lane * 72
  const normal = { x: -(b.y - a.y) / distance * offset, y: (b.x - a.x) / distance * offset }
  const c1 = geometry?.controlPoints?.[0] ?? { x: a.x + (b.x - a.x) / 3 + normal.x, y: a.y + (b.y - a.y) / 3 + normal.y }
  const c2 = geometry?.controlPoints?.[1] ?? { x: a.x + (b.x - a.x) * 2 / 3 + normal.x, y: a.y + (b.y - a.y) * 2 / 3 + normal.y }
  const start = intersectDutyMapRect(from, geometry?.startAnchor ?? c1)
  const end = intersectDutyMapRect(to, geometry?.endAnchor ?? c2)
  return { d: cubicPath(start, c1, c2, end), label: geometry?.labelPosition ?? cubicMiddle(start, c1, c2, end), start, end }
}

function textHeight(text: string, width: number, extra = 0) {
  // Conservative CJK wrapping reserves space before render; CSS never clips overflow.
  return Math.max(40, Math.ceil([...text].length / Math.max(1, Math.floor((width - 28) / 15))) * 23 + 18 + extra)
}

export function buildDutyMapLayout(projection: DutyMapProjection, view: DutyMapViewState): DutyMapLayout {
  const filtered = filterDutyMap(projection, view), map = projection.map
  const nodes: DutyMapLayoutNode[] = [], branches: string[] = []
  const width = 1960, hub: DutyMapRect = { x: 885, y: 0, width: 190, height: textHeight(map?.companyName ?? '', 190) + 14 }
  const sides = new Map(projection.departments.map((d, index) => [d.id, map?.departmentLayout.find(l => l.departmentId === d.id) ?? { departmentId: d.id, side: index % 2 ? 'right' as const : 'left' as const, order: index }]))
  const departmentHeights = new Map<string, number>()
  const groupSizes = new Map<string, { height: number; headerHeight: number; duties: Array<{ id: string; title: string; height: number }> }>()
  for (const group of filtered.groups) {
    const expanded = view.level === 'details' || view.expandedGroupIds.includes(group.id)
    const duties = expanded ? group.memberships.flatMap(m => {
      const duty = projection.duties.find(d => d.id === m.dutyId)
      return duty ? [{ id: duty.id, title: duty.title, height: textHeight(duty.title, 290, view.showChapters ? dutyMapChapterLinks(projection, { kind: 'duty', id: duty.id }).length * 24 : 0) }] : []
    }) : []
    const headerHeight = textHeight(group.title, 270, view.showChapters ? Math.ceil(new Set(dutyMapChapterLinks(projection, { kind: 'group', id: group.id }, true).map(l => l.chapterId + l.kind)).size / 3) * 24 : 0)
    groupSizes.set(group.id, { headerHeight, duties, height: Math.max(headerHeight, duties.reduce((sum, d) => sum + d.height + 12, 0) - (duties.length ? 12 : 0)) })
  }
  for (const dept of filtered.departments) {
    const content = view.level === 'departments' ? 0 : filtered.groups.filter(g => g.departmentId === dept.id).reduce((sum, g) => sum + groupSizes.get(g.id)!.height + 16, 0)
    const cycle = map?.flywheels.find(f => f.id === view.flywheelId && f.presentation === 'department-cycle' && f.departmentId === dept.id)
    departmentHeights.set(dept.id, Math.max(90, content) + (cycle ? textHeight(cycle.steps.join(' → '), 270) + 70 : 0))
  }
  const totals = (['left', 'right'] as const).map(side => filtered.departments.filter(d => sides.get(d.id)!.side === side).reduce((sum, d) => sum + departmentHeights.get(d.id)! + 42, 0))
  const height = Math.max(420, ...totals.map(t => t + 120))
  hub.y = height / 2 - hub.height / 2
  for (const side of ['left', 'right'] as const) {
    const departments = filtered.departments.filter(d => sides.get(d.id)!.side === side).sort((a, b) => sides.get(a.id)!.order - sides.get(b.id)!.order)
    let y = (height - totals[side === 'left' ? 0 : 1]) / 2
    for (const dept of departments) {
      const size = departmentHeights.get(dept.id)!, deptHeight = textHeight(dept.name, 140)
      const deptNode: DutyMapLayoutNode = { key: 'department:' + dept.id, ref: { kind: 'department', id: dept.id }, parentKey: 'company', title: dept.name, side, x: side === 'left' ? 695 : 1125, y: y + size / 2 - deptHeight / 2, width: 140, height: deptHeight }
      nodes.push(deptNode); branches.push(branchPath(hub, deptNode, side))
      let groupY = y
      if (view.level !== 'departments') for (const group of filtered.groups.filter(g => g.departmentId === dept.id)) {
        const groupSize = groupSizes.get(group.id)!
        const groupNode: DutyMapLayoutNode = { key: 'group:' + group.id, ref: { kind: 'group', id: group.id }, parentKey: deptNode.key, title: group.title, side, x: side === 'left' ? 385 : 1305, y: groupY + groupSize.height / 2 - groupSize.headerHeight / 2, width: 270, height: groupSize.headerHeight, expanded: view.level === 'details' || view.expandedGroupIds.includes(group.id) }
        nodes.push(groupNode); branches.push(branchPath(deptNode, groupNode, side))
        let dutyY = groupY
        for (const duty of groupSize.duties) {
          const node: DutyMapLayoutNode = { key: 'duty:' + duty.id, ref: { kind: 'duty', id: duty.id }, parentKey: groupNode.key, title: duty.title, side, x: side === 'left' ? 55 : 1615, y: dutyY, width: 290, height: duty.height }
          nodes.push(node); branches.push(branchPath(groupNode, node, side)); dutyY += duty.height + 12
        }
        groupY += groupSize.height + 16
      }
      y += size + 42
    }
  }
  const labelRects: DutyMapRect[] = []
  const overlaps = (a: DutyMapRect, b: DutyMapRect) => a.x < b.x + b.width + 10 && a.x + a.width + 10 > b.x && a.y < b.y + b.height + 10 && a.y + a.height + 10 > b.y
  const baselineNodes = (view.departmentId || view.chapterId) && filtered.relationships.some(r => r.geometry)
    ? buildDutyMapLayout(projection, { ...view, departmentId: null, chapterId: null, flywheelId: null }).nodes : nodes
  const relationships = filtered.relationships.flatMap((relationship, index) => {
    const from = nodes.find(n => n.key === 'department:' + relationship.fromDepartmentId), to = nodes.find(n => n.key === 'department:' + relationship.toDepartmentId)
    if (!from || !to) return []
    let geometry = relationship.geometry
    if (geometry && baselineNodes !== nodes) {
      const originalFrom = baselineNodes.find(n => n.key === from.key) ?? from, originalTo = baselineNodes.find(n => n.key === to.key) ?? to
      const deltaA = { x: from.x - originalFrom.x, y: center(from).y - center(originalFrom).y }, deltaB = { x: to.x - originalTo.x, y: center(to).y - center(originalTo).y }
      const moved = (point: DutyMapPoint, delta: DutyMapPoint) => ({ x: point.x + delta.x, y: point.y + delta.y })
      geometry = { ...geometry,
        startAnchor: geometry.startAnchor && moved(geometry.startAnchor, deltaA), endAnchor: geometry.endAnchor && moved(geometry.endAnchor, deltaB),
        controlPoints: geometry.controlPoints && [moved(geometry.controlPoints[0], deltaA), moved(geometry.controlPoints[1], deltaB)],
        labelPosition: geometry.labelPosition && moved(geometry.labelPosition, { x: (deltaA.x + deltaB.x) / 2, y: (deltaA.y + deltaB.y) / 2 }),
      }
    }
    if (!geometry?.labelPosition && !geometry?.controlPoints) {
      const a = center(from), b = center(to), labelHeight = textHeight(relationship.delivery + from.title + to.title, 224, 20)
      const preferredY = (a.y + b.y) / 2
      const obstacles = [hub, ...nodes, ...labelRects]
      // The central corridor is free of branches; give each directed handoff a readable lane.
      let label: DutyMapPoint = { x: center(hub).x, y: preferredY }
      for (let attempt = 0; attempt < 40; attempt++) {
        const delta = Math.ceil(attempt / 2) * (labelHeight + 18) * (attempt % 2 ? -1 : 1)
        const candidate = { x: center(hub).x, y: Math.max(labelHeight / 2 + 20, Math.min(height - labelHeight / 2 - 20, preferredY + delta)) }
        const rect = { x: candidate.x - 112, y: candidate.y - labelHeight / 2, width: 224, height: labelHeight }
        if (!obstacles.some(o => overlaps(rect, o))) { label = candidate; break }
      }
      labelRects.push({ x: label.x - 112, y: label.y - labelHeight / 2, width: 224, height: labelHeight })
      const dx = (label.x - (a.x + b.x) / 2) / .75, dy = (label.y - (a.y + b.y) / 2) / .75
      geometry = { ...geometry, labelPosition: label, controlPoints: [{ x: a.x + (b.x - a.x) / 3 + dx, y: a.y + (b.y - a.y) / 3 + dy }, { x: a.x + (b.x - a.x) * 2 / 3 + dx, y: a.y + (b.y - a.y) * 2 / 3 + dy }] }
    }
    return [{ relationship, ...makeDutyMapRelationship(from, to, Math.floor(index / 2), geometry) }]
  })
  return { width, height, company: hub, nodes, branches, relationships }
}
