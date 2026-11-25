import { describe, expect, it } from 'vitest'
import { buildDutyMapProjection, validateDutyMap } from './dutyMap'
import { createDutyMapSeed, DutyMapSeedConflict } from './dutyMapSeed'
import { screenshotOrganizationState } from './screenshotData'
import { createOrgDocumentFile, parseOrgDocument } from './documentStorage'
import { executeOrganizationCommand } from './organizationCommands'
import type { OrgDirectoryState } from './types'

function emptyState(): OrgDirectoryState {
  return {
    employees: [], departments: [], positions: [], roles: [], assignments: [], members: [],
    roleCombinationRiskRules: [], organizationLevels: [],
    organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
    duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
  }
}

describe('DEV-071 department duties', () => {
  it('builds the complete six department baseline with no position or employee assignments', () => {
    const state = createDutyMapSeed(emptyState())
    expect(state.departments).toHaveLength(6)
    expect(state.dutyMap?.groups).toHaveLength(33)
    expect(state.duties).toHaveLength(116)
    expect(state.dutyMap?.memberships).toHaveLength(116)
    expect(state.dutyMap?.chapterLinks.filter(link => link.kind === 'primary')).toHaveLength(116)
    expect(state.dutyMap?.flywheels).toHaveLength(5)
    expect(state.dutyMap?.relationships).toHaveLength(9)
    expect(state.positions).toEqual([])
    expect(state.assignments).toEqual([])
    expect(state.dutyPositionRelations).toEqual([])
    expect(state.dutyMap?.memberships.every(value => value.planningStage === null)).toBe(true)
    expect(validateDutyMap(state)).toEqual({ ok: true })
  })

  it('reuses saved source IDs on retry and preserves existing descriptions', () => {
    const state = createDutyMapSeed(emptyState())
    state.duties[0].description = '主管已確認的內容'
    expect(createDutyMapSeed(state, () => { throw new Error('unexpected new ID') })).toEqual(state)
  })

  it('preserves renamed departments, groups and duties when resuming the same source bindings', () => {
    const state = createDutyMapSeed(emptyState())
    const department = state.departments.find(value => value.name === '研發部')!
    const group = state.dutyMap!.groups.find(value => value.title === '品質策劃、檢驗與放行')!
    const duty = state.duties.find(value => value.title === '進料與委外品質驗收')!
    department.name = '研發與品質部'
    group.title = '品質策劃與檢驗放行'
    duty.title = '進料及委外品質驗收'
    expect(createDutyMapSeed(state, () => { throw new Error('unexpected replacement ID') })).toEqual(state)
    const projection = buildDutyMapProjection(state, { versionId: 'renamed-draft', versionName: '改名草稿', versionKind: 'draft', revision: 'r2' }, [], false)
    expect(projection.map!.relationships.some(value => value.toDepartmentId === department.id)).toBe(true)
    expect(projection.departments.find(value => value.id === department.id)?.name).toBe('研發與品質部')
  })

  it('reports same-name conflicts without mutating the source', () => {
    const state = emptyState()
    state.duties = [
      { id: 'one', title: '進料與委外品質驗收', description: null },
      { id: 'two', title: '進料與委外品質驗收', description: null },
    ]
    expect(() => createDutyMapSeed(state)).toThrow(DutyMapSeedConflict)
    expect(state.departments).toEqual([])
    expect(state.dutyMap).toBeUndefined()
  })

  it('rejects duplicate ownership, invalid chapter IDs and dangling targets', () => {
    const state = createDutyMapSeed(emptyState())
    const duplicate = structuredClone(state)
    duplicate.dutyMap!.memberships.push({ ...duplicate.dutyMap!.memberships[0] })
    expect(validateDutyMap(duplicate).ok).toBe(false)
    const chapter = structuredClone(state)
    chapter.dutyMap!.chapterLinks[0].chapterId = '99'
    expect(validateDutyMap(chapter).ok).toBe(false)
    const dangling = structuredClone(state)
    dangling.dutyMap!.methodLinks.push({ id: 'bad', target: { kind: 'group', id: 'missing' }, methodId: 'method-one' })
    expect(validateDutyMap(dangling).ok).toBe(false)
  })

  it('round-trips all map fields through existing document serialization and legacy compatibility', () => {
    const state = createDutyMapSeed(structuredClone(screenshotOrganizationState))
    state.dutyMap!.memberships[0].planningStage = 'long-term'
    const document = createOrgDocumentFile(state, 'draft')
    const parsed = parseOrgDocument(JSON.parse(JSON.stringify(document)))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.state.dutyMap).toEqual(state.dutyMap)
    const legacy = createOrgDocumentFile(screenshotOrganizationState, 'document')
    expect(parseOrgDocument(legacy).ok).toBe(true)
    document.state.dutyMap!.groups[0].departmentId = 'missing'
    expect(parseOrgDocument(document)).toMatchObject({ ok: false, code: 'DUTY_MAP_INVALID' })
  })

  it('removes links to an explicitly deleted duty in the normal command path', () => {
    const state = createDutyMapSeed(structuredClone(screenshotOrganizationState))
    const dutyId = state.duties[0].id
    state.dutyMap!.methodLinks.push({ id: 'document-link', target: { kind: 'duty', id: dutyId }, methodId: 'readable-method' })
    const result = executeOrganizationCommand(state, { type: 'DELETE_DUTY', dutyId })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.dutyMap!.memberships.some(value => value.dutyId === dutyId)).toBe(false)
    expect(result.state.dutyMap!.methodLinks).toEqual([])
    expect(validateDutyMap(result.state).ok).toBe(true)
    expect(state.duties.some(value => value.id === dutyId)).toBe(true)
  })

  it('projects no employee or position data and preserves exact selected version metadata', () => {
    const state = createDutyMapSeed(structuredClone(screenshotOrganizationState))
    Object.assign(state.departments[0], { employees: [{ id: 'legacy-private-employee', name: '不應隨職掌圖輸出的姓名' }] })
    Object.assign(state.duties[0], { assignedPositionIds: ['legacy-private-position'] })
    const projection = buildDutyMapProjection(state, { versionId: 'draft-one', versionName: '規劃草稿', versionKind: 'draft', revision: 'revision-one' }, [], false)
    expect(projection.versionId).toBe('draft-one')
    expect(projection.revision).toBe('revision-one')
    expect(projection).not.toHaveProperty('employees')
    expect(projection).not.toHaveProperty('positions')
    expect(projection.departments[0]).not.toHaveProperty('employees')
    expect(projection.duties[0]).not.toHaveProperty('assignedPositionIds')
    expect(JSON.stringify(projection)).not.toContain('legacy-private-employee')
    expect(JSON.stringify(projection)).not.toContain('legacy-private-position')
    expect(projection.duties).toHaveLength(116)
    projection.map!.groups[0].title = '只改投影'
    expect(state.dutyMap!.groups[0].title).not.toBe('只改投影')
  })
})
