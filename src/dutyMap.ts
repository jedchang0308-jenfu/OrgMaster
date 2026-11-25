import type { Department, Duty, OrgDirectoryState } from './types'
import { z } from 'zod'

export type DutyMapTarget = { kind: 'group' | 'duty'; id: string }
export type DutyMapNodeRef = { kind: 'department' | 'group' | 'duty'; id: string }
export interface DutyMapPoint { x: number; y: number }
export interface DutyMapData {
  schemaVersion: 1
  companyName: string
  groups: Array<{ id: string; departmentId: string; title: string; order: number }>
  memberships: Array<{ dutyId: string; groupId: string; order: number; planningStage: 'long-term' | null }>
  chapterLinks: Array<{ id: string; target: DutyMapTarget; chapterId: string; kind: 'primary' | 'collaboration'; explanation: string }>
  methodLinks: Array<{ id: string; target: DutyMapTarget; methodId: string }>
  flywheels: Array<{ id: string; title: string; colorKey: 'blue' | 'orange' | 'green' | 'purple' | 'teal'; presentation: 'cross-department' | 'department-cycle'; departmentId: string | null; steps: string[] }>
  relationships: Array<{ id: string; flywheelId: string; fromDepartmentId: string; toDepartmentId: string; delivery: string; geometry?: { startAnchor?: DutyMapPoint; endAnchor?: DutyMapPoint; controlPoints?: [DutyMapPoint, DutyMapPoint]; labelPosition?: DutyMapPoint } }>
  departmentLayout: Array<{ departmentId: string; side: 'left' | 'right'; order: number }>
  sourceBindings: Array<{ sourceKey: string; target: DutyMapNodeRef }>
}
export interface DutyChapter { chapterId: string; displayName: string; groupId: string; groupName: string; sortOrder: number }
export interface DutyMethodSummary { id: string; code: string; title: string }
export interface DutyMapProjection {
  versionId: string
  versionName: string
  versionKind: 'current' | 'draft'
  revision: string
  chapterCatalogVersion: string
  canReview: boolean
  departments: Department[]
  duties: Duty[]
  map: DutyMapData | null
  chapters: DutyChapter[]
  methods: DutyMethodSummary[]
}
export interface DutyMapViewState {
  departmentId: string | null
  chapterId: string | null
  flywheelId: string | null
  expandedGroupIds: string[]
  showChapters: boolean
  level: 'departments' | 'groups' | 'details'
  selectedNode: DutyMapNodeRef | null
}
export const DEFAULT_DUTY_MAP_VIEW: DutyMapViewState = {
  departmentId: null, chapterId: null, flywheelId: null,
  expandedGroupIds: [], showChapters: true, level: 'groups', selectedNode: null,
}
export type DutyMapFindingKind = 'duty-unmapped' | 'chapter-collaboration-only' | 'chapter-no-duty' | 'handoff-gap' | 'mapping-suggestion' | 'needs-confirmation'
export interface DutyMapReviewFinding {
  id: string
  kind: DutyMapFindingKind
  nodeRefs: DutyMapNodeRef[]
  chapterIds: string[]
  relationshipIds: string[]
  summary: string
  observed: string
  suggestion: string
  reason: string
}
export interface DutyMapReviewResult {
  requestId: string
  versionId: string
  versionName: string
  versionKind: 'current' | 'draft'
  revision: string
  chapterCatalogVersion: string
  generatedAt: string
  findings: DutyMapReviewFinding[]
}
export interface DutyMapMethodLinkResult {
  versionId: string
  revision: string
  methodId: string
  links: Array<{ target: DutyMapTarget; title: string; departmentId: string; departmentName: string; groupId: string; groupTitle: string }>
}

export type DutyMapValidationResult = { ok: true } | { ok: false; code: 'DUTY_MAP_INVALID'; message: string }

export function dutyMapTargetKey(target: DutyMapNodeRef) {
  return target.kind + ':' + target.id
}

/** Platform jenfu.platform-map.v1 chapter names, frozen with the DEV-071 baseline. */
export const DUTY_CHAPTER_CATALOG_VERSION = 'jenfu.platform-map.v1.2026-11-25'
const chapterGroups = [
  { id: 'governance-direction', name: '治理方向', chapters: ['策略、治理、風險與法遵管理'] },
  { id: 'value-creation', name: '價值創造', chapters: ['客戶、商務與專案管理', '產品研發與工程管理', '供應商、採購與付款管理', '生產、庫存與追溯管理', '品質策劃、檢驗與不符合管理', '出貨、安裝與售後管理'] },
  { id: 'resource-control', name: '資源與控制', chapters: ['人力、職能與薪工管理', '資產、設施與環安管理', '資訊、文件與知識管理', '會計、財務與稅務管理'] },
  { id: 'audit-improvement', name: '查核與改善', chapters: ['績效、稽核、矯正與改善管理'] },
]
let chapterNumber = 0
export const DUTY_CHAPTERS: DutyChapter[] = chapterGroups.flatMap(group => group.chapters.map(displayName => {
  chapterNumber += 1
  return { chapterId: String(chapterNumber).padStart(2, '0'), displayName, groupId: group.id, groupName: group.name, sortOrder: chapterNumber * 10 }
}))

const identifier = z.string().trim().min(1).max(256)
const nodeRefSchema = z.object({ kind: z.enum(['department', 'group', 'duty']), id: identifier }).strict()
const targetSchema = z.object({ kind: z.enum(['group', 'duty']), id: identifier }).strict()
const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
export const dutyMapDataSchema = z.object({
  schemaVersion: z.literal(1),
  companyName: z.string().trim().min(1).max(300),
  groups: z.array(z.object({ id: identifier, departmentId: identifier, title: z.string().trim().min(1).max(500), order: z.number().int().nonnegative() }).strict()),
  memberships: z.array(z.object({ dutyId: identifier, groupId: identifier, order: z.number().int().nonnegative(), planningStage: z.enum(['long-term']).nullable() }).strict()),
  chapterLinks: z.array(z.object({ id: identifier, target: targetSchema, chapterId: z.string().regex(/^\d{2}$/), kind: z.enum(['primary', 'collaboration']), explanation: z.string().max(10000) }).strict()),
  methodLinks: z.array(z.object({ id: identifier, target: targetSchema, methodId: identifier }).strict()),
  flywheels: z.array(z.object({ id: identifier, title: z.string().trim().min(1).max(500), colorKey: z.enum(['blue', 'orange', 'green', 'purple', 'teal']), presentation: z.enum(['cross-department', 'department-cycle']), departmentId: identifier.nullable(), steps: z.array(z.string().trim().min(1).max(2000)) }).strict()),
  relationships: z.array(z.object({ id: identifier, flywheelId: identifier, fromDepartmentId: identifier, toDepartmentId: identifier, delivery: z.string().trim().min(1).max(3000), geometry: z.object({ startAnchor: pointSchema.optional(), endAnchor: pointSchema.optional(), controlPoints: z.tuple([pointSchema, pointSchema]).optional(), labelPosition: pointSchema.optional() }).strict().optional() }).strict()),
  departmentLayout: z.array(z.object({ departmentId: identifier, side: z.enum(['left', 'right']), order: z.number().int().nonnegative() }).strict()),
  sourceBindings: z.array(z.object({ sourceKey: z.string().trim().min(1).max(2048), target: nodeRefSchema }).strict()),
}).strict()

function unique(values: string[]) {
  return new Set(values).size === values.length
}

export function validateDutyMap(state: Pick<OrgDirectoryState, 'dutyMap' | 'departments' | 'duties'>): DutyMapValidationResult {
  if (state.dutyMap === undefined) return { ok: true }
  const parsed = dutyMapDataSchema.safeParse(state.dutyMap)
  const invalid = (message: string): DutyMapValidationResult => ({ ok: false, code: 'DUTY_MAP_INVALID', message })
  if (!parsed.success) return invalid('職掌圖資料格式不正確')
  const map = parsed.data
  const departments = new Set(state.departments.map(value => value.id))
  const groups = new Set(map.groups.map(value => value.id))
  const duties = new Set(state.duties.map(value => value.id))
  const chapters = new Set(DUTY_CHAPTERS.map(value => value.chapterId))
  const flywheels = new Map(map.flywheels.map(value => [value.id, value]))
  const targetExists = (target: DutyMapNodeRef) => target.kind === 'department' ? departments.has(target.id) : target.kind === 'group' ? groups.has(target.id) : duties.has(target.id)
  const idCollections = [map.groups, map.chapterLinks, map.methodLinks, map.flywheels, map.relationships]
  if (idCollections.some(values => !unique(values.map(value => value.id)))) return invalid('職掌圖有重複識別碼')
  if (map.groups.some(value => !departments.has(value.departmentId))) return invalid('職掌大項的部門不存在')
  if (!unique(map.memberships.map(value => value.dutyId)) || map.memberships.some(value => !groups.has(value.groupId) || !duties.has(value.dutyId))) return invalid('細部職掌隸屬無效或重複')
  if (map.chapterLinks.some(value => !targetExists(value.target) || !chapters.has(value.chapterId))) return invalid('章節連結的端點或章號不存在')
  if (!unique(map.chapterLinks.map(value => dutyMapTargetKey(value.target) + ':' + value.chapterId + ':' + value.kind))) return invalid('章節連結重複')
  if (!unique(map.chapterLinks.filter(value => value.kind === 'primary').map(value => dutyMapTargetKey(value.target)))) return invalid('同一職掌有多個主要歸章')
  if (map.methodLinks.some(value => !targetExists(value.target)) || !unique(map.methodLinks.map(value => dutyMapTargetKey(value.target) + ':' + value.methodId))) return invalid('辦法對應無效或重複')
  if (map.flywheels.some(value => value.presentation === 'department-cycle' ? !value.departmentId || !departments.has(value.departmentId) || value.steps.length === 0 : value.departmentId !== null)) return invalid('飛輪所屬部門或步驟不正確')
  if (map.relationships.some(value => !departments.has(value.fromDepartmentId) || !departments.has(value.toDepartmentId) || flywheels.get(value.flywheelId)?.presentation !== 'cross-department')) return invalid('飛輪交接的部門或飛輪不存在')
  if (!unique(map.departmentLayout.map(value => value.departmentId)) || map.departmentLayout.some(value => !departments.has(value.departmentId))) return invalid('部門排版參照無效或重複')
  if (!unique(map.sourceBindings.map(value => value.sourceKey)) || map.sourceBindings.some(value => !targetExists(value.target))) return invalid('來源對照無效或重複')
  return { ok: true }
}

/** Only prunes links to objects deliberately deleted by an organization command. */
export function reconcileDutyMap(previous: OrgDirectoryState, next: OrgDirectoryState): OrgDirectoryState {
  if (!next.dutyMap) return next
  const removedDepartments = new Set(previous.departments.filter(value => !next.departments.some(current => current.id === value.id)).map(value => value.id))
  const removedDuties = new Set(previous.duties.filter(value => !next.duties.some(current => current.id === value.id)).map(value => value.id))
  if (!removedDepartments.size && !removedDuties.size) return next
  const map = next.dutyMap
  const removedGroups = new Set(map.groups.filter(value => removedDepartments.has(value.departmentId)).map(value => value.id))
  const retainedTarget = (target: DutyMapNodeRef) => !(
    target.kind === 'department' && removedDepartments.has(target.id)
    || target.kind === 'group' && removedGroups.has(target.id)
    || target.kind === 'duty' && removedDuties.has(target.id)
  )
  const removedFlywheels = new Set(map.flywheels.filter(value => value.departmentId && removedDepartments.has(value.departmentId)).map(value => value.id))
  return { ...next, dutyMap: {
    ...map,
    groups: map.groups.filter(value => !removedGroups.has(value.id)),
    memberships: map.memberships.filter(value => !removedDuties.has(value.dutyId) && !removedGroups.has(value.groupId)),
    chapterLinks: map.chapterLinks.filter(value => retainedTarget(value.target)),
    methodLinks: map.methodLinks.filter(value => retainedTarget(value.target)),
    flywheels: map.flywheels.filter(value => !removedFlywheels.has(value.id)),
    relationships: map.relationships.filter(value => !removedFlywheels.has(value.flywheelId) && !removedDepartments.has(value.fromDepartmentId) && !removedDepartments.has(value.toDepartmentId)),
    departmentLayout: map.departmentLayout.filter(value => !removedDepartments.has(value.departmentId)),
    sourceBindings: map.sourceBindings.filter(value => retainedTarget(value.target)),
  } }
}

export function buildDutyMapProjection(
  state: OrgDirectoryState,
  meta: Pick<DutyMapProjection, 'versionId' | 'versionName' | 'versionKind' | 'revision'>,
  methods: DutyMethodSummary[],
  canReview: boolean,
): DutyMapProjection {
  const validation = validateDutyMap(state)
  if (!validation.ok) throw new Error(validation.message)
  return {
    ...meta, canReview, chapterCatalogVersion: DUTY_CHAPTER_CATALOG_VERSION,
    departments: state.departments.map(value => ({ ...value })),
    duties: state.duties.map(value => ({ ...value })),
    map: state.dutyMap ? structuredClone(state.dutyMap) : null,
    chapters: DUTY_CHAPTERS.map(value => ({ ...value })),
    methods: methods.map(value => ({ ...value })),
  }
}
