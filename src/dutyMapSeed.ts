import type { Department, Duty, OrgDirectoryState } from './types'
import { validateDutyMap, dutyMapTargetKey, type DutyMapData, type DutyMapNodeRef } from './dutyMap'
import baseline from './dutyMapBaseline.json'

export class DutyMapSeedConflict extends Error {
  constructor(readonly sourcePath: string, reason: string) {
    super(sourcePath + '。' + reason)
    this.name = 'DutyMapSeedConflict'
  }
}

const crossDepartmentFlywheels = [
  { id: 'flywheel-customer', title: '客戶洞察與產品成長', colorKey: 'blue' as const },
  { id: 'flywheel-knowledge', title: '關鍵作業知識與交付可靠度', colorKey: 'orange' as const },
  { id: 'flywheel-cost', title: '成本改善', colorKey: 'green' as const },
]
const deliveries = [
  ['customer-marketing-rd', 'flywheel-customer', '營銷部', '研發部', '客戶需求、工況與使用回饋'],
  ['customer-rd-production', 'flywheel-customer', '研發部', '生產部', '改良／新品方案與驗證要求'],
  ['customer-production-rd', 'flywheel-customer', '生產部', '研發部', '試作、現場驗證與使用回饋'],
  ['customer-rd-marketing', 'flywheel-customer', '研發部', '營銷部', '驗證成果與產品應用方案'],
  ['knowledge-production-rd', 'flywheel-knowledge', '生產部', '研發部', '組裝經驗、異常與採用回饋'],
  ['knowledge-rd-production', 'flywheel-knowledge', '研發部', '生產部', '核定組裝圖示與檢查依據'],
  ['cost-marketing-finance', 'flywheel-cost', '營銷部', '財務部', '售後與返工紀錄'],
  ['cost-finance-production', 'flywheel-cost', '財務部', '生產部', '成本分析與改善重點'],
  ['cost-production-finance', 'flywheel-cost', '生產部', '財務部', '實作成本與改善結果'],
]

export function createDutyMapSeed(source: OrgDirectoryState, makeId: () => string = () => crypto.randomUUID()): OrgDirectoryState {
  const state = structuredClone(source)
  const map: DutyMapData = state.dutyMap ?? {
    schemaVersion: 1, companyName: '鉦富機械', groups: [], memberships: [], chapterLinks: [],
    methodLinks: [], flywheels: [], relationships: [], departmentLayout: [], sourceBindings: [],
  }
  state.dutyMap = map
  const departmentIdsBySourceName = new Map<string, string>()
  const binding = (key: string) => map.sourceBindings.find(value => value.sourceKey === key)?.target
  const bind = (key: string, target: DutyMapNodeRef) => {
    const existing = binding(key)
    if (existing && dutyMapTargetKey(existing) !== dutyMapTargetKey(target)) throw new DutyMapSeedConflict(key, '來源已連結其他節點，請先核對')
    if (!existing) map.sourceBindings.push({ sourceKey: key, target })
  }
  const resolveExisting = <T extends { id: string }>(values: T[], key: string, matches: T[]): T | undefined => {
    const previous = binding(key)
    if (previous) {
      const item = values.find(value => value.id === previous.id)
      if (!item) throw new DutyMapSeedConflict(key, '既有對照已找不到節點')
      return item
    }
    if (matches.length > 1) throw new DutyMapSeedConflict(key, '找到同名節點，請先核對實際 ID')
    return matches[0]
  }
  for (const department of baseline.departments) {
    const departmentKey = baseline.source + '/' + department.name
    let existingDepartment = resolveExisting<Department>(state.departments, departmentKey, state.departments.filter(value => value.name.trim() === department.name))
    if (!existingDepartment) {
      existingDepartment = { id: makeId(), name: department.name, parentId: null }
      state.departments.push(existingDepartment)
    }
    const departmentId = existingDepartment.id
    departmentIdsBySourceName.set(department.name, departmentId)
    bind(departmentKey, { kind: 'department', id: departmentId })
    if (!map.departmentLayout.some(value => value.departmentId === departmentId)) map.departmentLayout.push({ departmentId, side: department.side as 'left' | 'right', order: department.order })
    for (const [order, group] of department.groups.entries()) {
      const groupKey = departmentKey + '/' + group.title
      let existingGroup = resolveExisting(map.groups, groupKey, map.groups.filter(value => value.departmentId === departmentId && value.title.trim() === group.title))
      if (!existingGroup) {
        existingGroup = { id: makeId(), departmentId, title: group.title, order }
        map.groups.push(existingGroup)
      }
      if (existingGroup.departmentId !== departmentId) throw new DutyMapSeedConflict(groupKey, '既有大項歸屬不同，請先核對')
      bind(groupKey, { kind: 'group', id: existingGroup.id })
      for (const [dutyOrder, duty] of group.duties.entries()) {
        const dutyKey = groupKey + '/' + duty.title
        let existingDuty = resolveExisting<Duty>(state.duties, dutyKey, state.duties.filter(value => value.title.trim() === duty.title))
        if (!existingDuty) {
          existingDuty = { id: makeId(), title: duty.title, description: null }
          state.duties.push(existingDuty)
        }
        bind(dutyKey, { kind: 'duty', id: existingDuty.id })
        const membership = map.memberships.find(value => value.dutyId === existingDuty.id)
        if (membership && membership.groupId !== existingGroup.id) throw new DutyMapSeedConflict(dutyKey, '既有細項歸屬不同，請先核對')
        if (!membership) map.memberships.push({ dutyId: existingDuty.id, groupId: existingGroup.id, order: dutyOrder, planningStage: null })
        const target = { kind: 'duty' as const, id: existingDuty.id }
        const primary = map.chapterLinks.find(value => value.kind === 'primary' && dutyMapTargetKey(value.target) === dutyMapTargetKey(target))
        if (primary && primary.chapterId !== duty.chapterId) throw new DutyMapSeedConflict(dutyKey, '既有主要歸章不同，請先核對')
        if (!primary) map.chapterLinks.push({ id: makeId(), target, chapterId: duty.chapterId, kind: 'primary', explanation: '' })
      }
    }
  }
  for (const link of baseline.crossChapterLinks) {
    const originalGroup = baseline.departments.find(value => value.name === link.departmentName)?.groups.find(value =>
      link.kind === 'group' ? value.title === link.title : value.duties.some(duty => duty.title === link.title))
    const key = originalGroup && `${baseline.source}/${link.departmentName}/${originalGroup.title}${link.kind === 'duty' ? '/' + link.title : ''}`
    const bound = key ? binding(key) : undefined
    if (!bound || bound.kind !== link.kind) throw new DutyMapSeedConflict(link.departmentName + '/' + link.title, '找不到跨章交接的職掌')
    const target = { kind: link.kind as 'group' | 'duty', id: bound.id }
    if (!map.chapterLinks.some(value => value.kind === 'collaboration' && value.chapterId === link.chapterId && dutyMapTargetKey(value.target) === dutyMapTargetKey(target))) {
      map.chapterLinks.push({ id: makeId(), target, chapterId: link.chapterId, kind: 'collaboration', explanation: link.explanation })
    }
  }
  const departmentId = (name: string) => {
    const id = departmentIdsBySourceName.get(name)
    if (!id) throw new DutyMapSeedConflict(name, '飛輪所屬部門不存在')
    return id
  }
  for (const flywheel of crossDepartmentFlywheels) {
    if (!map.flywheels.some(value => value.id === flywheel.id)) map.flywheels.push({ ...flywheel, presentation: 'cross-department', departmentId: null, steps: [] })
  }
  const localCycles: DutyMapData['flywheels'] = [
    { id: 'flywheel-administration', title: '管理部基礎支援改善', colorKey: 'purple', presentation: 'department-cycle', departmentId: departmentId('管理部'), steps: ['改善共用工具與行政流程', '減少重複求助與作業', '釋出支援時間', '投入下一項共通改善'] },
    { id: 'flywheel-general-management', title: '總經理室自主成長', colorKey: 'teal', presentation: 'department-cycle', departmentId: departmentId('總經理室'), steps: ['各部門在既有職掌內自主改善', '回饋成果與瓶頸', '調整授權或資源', '擴大自主解題空間'] },
  ]
  for (const flywheel of localCycles) if (!map.flywheels.some(value => value.id === flywheel.id)) map.flywheels.push(flywheel)
  for (const [id, flywheelId, from, to, delivery] of deliveries) {
    if (!map.relationships.some(value => value.id === id)) map.relationships.push({ id, flywheelId, fromDepartmentId: departmentId(from), toDepartmentId: departmentId(to), delivery })
  }
  const validation = validateDutyMap(state)
  if (!validation.ok) throw new DutyMapSeedConflict(baseline.source, validation.message)
  return state
}
