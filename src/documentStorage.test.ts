import { describe, expect, it } from 'vitest'
import {
  LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY,
  LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY,
  LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY,
  LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY,
  LEGACY_ORG_DOCUMENT_STORAGE_KEY,
  ORG_DOCUMENT_DRAFT_STORAGE_KEY,
  ORG_DOCUMENT_STORAGE_KEY,
  RECOVERY_ORG_DOCUMENT_DRAFT_STORAGE_KEY,
  archiveFailedLocalDocument,
  clearDraftLocalDocument,
  createDownloadFilename,
  createOrgDocumentFile,
  loadLocalDocument,
  orgStateSignature,
  parseOrgDocument,
  saveDraftLocalDocument,
  saveLocalDocument,
} from './documentStorage'
import { initialAssignments, initialDepartments, initialEmployees, initialMembers, initialOrganizationLevels, initialPositions, initialRoles } from './data'
import type { OrgDirectoryState } from './types'

const state: OrgDirectoryState = {
  employees: initialEmployees,
  departments: initialDepartments,
  roles: initialRoles,
  positions: initialPositions,
  assignments: initialAssignments,
  members: initialMembers,
  roleCombinationRiskRules: [],
  organizationLevels: initialOrganizationLevels,
  organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
  duties: [],
  dutyPositionRelations: [],
}

function toV4State(source: OrgDirectoryState) {
  const { organizationLevels: _organizationLevels, organizationLayout: _organizationLayout, duties: _duties, dutyPositionRelations: _dutyPositionRelations, ...legacy } = source
  return {
    ...legacy,
    positions: legacy.positions.map(({ organizationLevelId: _organizationLevelId, ...position }) => position),
  }
}

function toV5State(source: OrgDirectoryState) {
  const { duties: _duties, dutyPositionRelations: _dutyPositionRelations, ...legacy } = source
  return legacy
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size },
  }
}

describe('document storage', () => {
  it('creates a versioned document without sharing mutable state', () => {
    const document = createOrgDocumentFile(state, 'copy', '2026-08-11T09:00:00.000Z')
    expect(document).toMatchObject({ app: 'OrgMaster', version: 6, kind: 'copy', savedAt: '2026-08-11T09:00:00.000Z' })
    expect(orgStateSignature(document.state)).toBe(orgStateSignature(state))
    expect(document.state).not.toBe(state)
    expect(document.state.members).not.toBe(state.members)
  })

  it('never persists a legacy member parent field in the V3 writer', () => {
    const legacyState = {
      ...state,
      members: state.members.map((member, index) => ({ ...member, parentId: index === 0 ? null : 'ceo' })),
    }
    const document = createOrgDocumentFile(legacyState, 'copy', '2026-08-11T09:00:00.000Z')
    expect(document.state.members.every((member) => !('parentId' in member))).toBe(true)
  })

  it('round-trips a saved local document', () => {
    const storage = createMemoryStorage()
    const saved = saveLocalDocument(state, storage, '2026-08-11T09:01:00.000Z')
    expect(saved?.kind).toBe('document')
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toContain('OrgMaster')
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'loaded', sourceVersion: 6, document: { kind: 'document', savedAt: '2026-08-11T09:01:00.000Z' } })
    if (loaded.status !== 'loaded') return
    expect(orgStateSignature(loaded.document.state)).toBe(orgStateSignature(state))
  })

  it('canonicalizes legacy collaborate relations when the backend document is loaded', () => {
    const legacyState: OrgDirectoryState = {
      ...state,
      duties: [{ id: 'duty-a', title: '年度計畫', description: null }],
      dutyPositionRelations: [{ id: 'rel-legacy', dutyId: 'duty-a', relationType: 'collaborate', target: { kind: 'position', positionId: 'ceo' }, isPrimaryExecutor: false, order: 0 }],
    }
    const parsed = parseOrgDocument({ app: 'OrgMaster', version: 6, kind: 'document', savedAt: '2026-08-25T00:00:00.000Z', state: legacyState })
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 6 })
    if (!parsed.ok) return
    expect(parsed.document.state.dutyPositionRelations).toEqual([{ id: 'rel-legacy', dutyId: 'duty-a', relationType: 'execute', target: { kind: 'position', positionId: 'ceo' }, isPrimaryExecutor: false, order: 0 }])
  })

  it('round-trips V3 role combination risk rules', () => {
    const stateWithRule: OrgDirectoryState = {
      ...state,
      roleCombinationRiskRules: [{
        id: 'risk-rule',
        roleAId: state.roles[0].id,
        roleBId: state.roles[1].id,
        level: 'high',
        reason: '測試用風險原因',
        enabled: true,
      }],
    }
    const parsed = parseOrgDocument(createOrgDocumentFile(stateWithRule, 'backup', '2026-08-15T09:00:00.000Z'))
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 6 })
    if (!parsed.ok) return
    expect(parsed.document.state.roleCombinationRiskRules).toEqual(stateWithRule.roleCombinationRiskRules)
  })

  it('migrates V4 reporting depth into final level assignments without enabling level layout', () => {
    const parsed = parseOrgDocument({
      app: 'OrgMaster',
      version: 4,
      kind: 'document',
      savedAt: '2026-08-17T00:00:00.000Z',
      state: toV4State(state),
    })
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 4, document: { version: 6 } })
    if (!parsed.ok) return
    expect(parsed.document.state.organizationLayout).toEqual({ mode: 'tree', showLevelGuides: true, positionYOverrides: {} })
    expect(parsed.document.state.positions.find((position) => position.id === 'ceo')?.organizationLevelId).toBe('level-executive')
    expect(parsed.document.state.positions.find((position) => position.id === 'operations')?.organizationLevelId).toBe('level-department')
    expect(parsed.document.state.positions.find((position) => position.id === 'hr')?.organizationLevelId).toBe('level-team')
  })

  it('migrates a V5 state to V6 with explicit empty duty collections', () => {
    const parsed = parseOrgDocument({ app: 'OrgMaster', version: 5, kind: 'document', savedAt: '2026-08-18T00:00:00.000Z', state: toV5State(state) })
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 5, document: { version: 6 } })
    if (!parsed.ok) return
    expect(parsed.document.state.duties).toEqual([])
    expect(parsed.document.state.dutyPositionRelations).toEqual([])
  })

  it('adds deterministic extra levels when V4 hierarchy depth exceeds four', () => {
    const legacy = toV4State(state)
    const parsed = parseOrgDocument({
      app: 'OrgMaster',
      version: 4,
      kind: 'backup',
      savedAt: '2026-08-17T00:00:00.000Z',
      state: {
        ...legacy,
        positions: [
          ...legacy.positions,
          { id: 'depth-4', roleId: initialRoles[0].id, departmentId: null, parentPositionId: 'hr', title: '第四層', status: 'active', allowMultipleAssignees: false },
          { id: 'depth-5', roleId: initialRoles[0].id, departmentId: null, parentPositionId: 'depth-4', title: '第五層', status: 'active', allowMultipleAssignees: false },
        ],
        members: [
          ...legacy.members,
          { id: 'depth-4', order: 0, childrenAxis: 'horizontal' },
          { id: 'depth-5', order: 0, childrenAxis: 'horizontal' },
        ],
      },
    })
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 4 })
    if (!parsed.ok) return
    expect(parsed.document.state.organizationLevels).toHaveLength(5)
    expect(parsed.document.state.organizationLevels[4]).toMatchObject({ id: 'level-depth-5', order: 4 })
    expect(parsed.document.state.positions.find((position) => position.id === 'depth-5')?.organizationLevelId).toBe('level-depth-5')
  })

  it('promotes a V4 local key to V6 while preserving the original bytes', () => {
    const storage = createMemoryStorage()
    const raw = JSON.stringify({ app: 'OrgMaster', version: 4, kind: 'document', savedAt: '2026-08-17T00:00:00.000Z', state: toV4State(state) })
    storage.setItem(LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY, raw)
    expect(loadLocalDocument(storage)).toMatchObject({ status: 'loaded', sourceVersion: 4, document: { version: 6 } })
    expect(storage.getItem(LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY)).toBe(raw)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toContain('"version":6')
  })

  it('promotes a V5 local key to V6 while preserving the legacy bytes', () => {
    const storage = createMemoryStorage()
    const raw = JSON.stringify({ app: 'OrgMaster', version: 5, kind: 'document', savedAt: '2026-08-17T00:00:00.000Z', state: toV5State(state) })
    storage.setItem(LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY, raw)
    expect(loadLocalDocument(storage)).toMatchObject({ status: 'loaded', sourceVersion: 5, document: { version: 6 } })
    expect(storage.getItem(LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY)).toBe(raw)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toContain('"version":6')
  })

  it('migrates the former warning level and keeps an optional missing reason empty when loading V3', () => {
    const legacyRule = {
      id: 'legacy-warning-rule',
      roleAId: state.roles[0].id,
      roleBId: state.roles[1].id,
      level: 'warning',
      enabled: true,
    }
    const parsed = parseOrgDocument({
      app: 'OrgMaster',
      version: 3,
      kind: 'backup',
      savedAt: '2026-08-15T09:00:00.000Z',
      state: { ...state, roleCombinationRiskRules: [legacyRule] },
    })
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 3 })
    if (!parsed.ok) return
    expect(parsed.document.state.roleCombinationRiskRules[0].level).toBe('medium')
    expect(parsed.document.state.roleCombinationRiskRules[0].reason).toBe('')
  })

  it('migrates V2 to V3 without creating risk rules', () => {
    const { roleCombinationRiskRules: _riskRules, ...stateV2 } = state
    const parsed = parseOrgDocument({
      app: 'OrgMaster', version: 2, kind: 'document', savedAt: '2026-08-15T09:00:00.000Z', state: stateV2,
    })
    expect(parsed).toMatchObject({ ok: true, sourceVersion: 2, document: { version: 6 } })
    if (!parsed.ok) return
    expect(parsed.document.state.roleCombinationRiskRules).toEqual([])
  })

  it('promotes a legacy V2 storage key to V3 without deleting the source', () => {
    const storage = createMemoryStorage()
    const { roleCombinationRiskRules: _riskRules, ...stateV2 } = state
    const rawV2 = JSON.stringify({
      app: 'OrgMaster', version: 2, kind: 'document', savedAt: '2026-08-15T09:00:00.000Z', state: stateV2,
    })
    storage.setItem(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY, rawV2)
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'loaded', sourceVersion: 2, document: { version: 6 } })
    expect(storage.getItem(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY)).toBe(rawV2)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toContain('"version":6')
  })

  it.each([
    ['RISK_RULE_SELF_PAIR', [{ id: 'self', roleAId: state.roles[0].id, roleBId: state.roles[0].id, level: 'medium', enabled: true }]],
    ['RISK_RULE_DUPLICATE_PAIR', [
      { id: 'first', roleAId: state.roles[0].id, roleBId: state.roles[1].id, level: 'medium', enabled: true },
      { id: 'second', roleAId: state.roles[1].id, roleBId: state.roles[0].id, level: 'high', enabled: true },
    ]],
    ['RISK_RULE_UNKNOWN_ROLE', [{ id: 'unknown', roleAId: state.roles[0].id, roleBId: 'missing', level: 'medium', enabled: true }]],
    ['RISK_RULE_INVALID_LEVEL', [{ id: 'level', roleAId: state.roles[0].id, roleBId: state.roles[1].id, level: 'critical', enabled: true }]],
  ])('fails closed for invalid V3 rules with %s', (code, roleCombinationRiskRules) => {
    expect(parseOrgDocument({
      app: 'OrgMaster', version: 3, kind: 'document', savedAt: 'now', state: { ...state, roleCombinationRiskRules },
    })).toMatchObject({ ok: false, code })
  })

  it('migrates legacy single employee department fields to departmentIds', () => {
    const legacyState = {
      ...state,
      employees: state.employees.map(({ departmentIds, ...employee }) => ({
        ...employee,
        departmentId: departmentIds[0] ?? null,
      })),
    }
    const parsed = parseOrgDocument({
      app: 'OrgMaster',
      version: 2,
      kind: 'backup',
      savedAt: '2026-08-11T09:01:00.000Z',
      state: legacyState,
    })

    expect(parsed).toMatchObject({ ok: true, sourceVersion: 2 })
    if (!parsed.ok) return
    expect(parsed.document.state.employees[0]).toMatchObject({
      id: state.employees[0].id,
      departmentIds: [state.employees[0].departmentIds[0]],
    })
    expect(parsed.document.state.employees[0]).not.toHaveProperty('departmentId')
  })

  it('prefers the latest autosaved draft over the last formal document', () => {
    const storage = createMemoryStorage()
    const formal = saveLocalDocument(state, storage, '2026-08-12T09:00:00.000Z')
    expect(formal).not.toBeNull()
    const draftState: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => position.id === 'ceo' ? { ...position, title: '新的執行長' } : position),
    }
    const draft = saveDraftLocalDocument(draftState, storage, '2026-08-12T09:01:00.000Z')
    expect(draft).toMatchObject({ kind: 'draft', savedAt: '2026-08-12T09:01:00.000Z' })
    expect(storage.getItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY)).toContain('新的執行長')
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'loaded', sourceVersion: 6, document: { kind: 'draft' } })
    if (loaded.status !== 'loaded') return
    expect(loaded.document.state.positions.find((position) => position.id === 'ceo')?.title).toBe('新的執行長')
  })

  it('fails closed when a newer V4 payload is malformed instead of falling back to V3', () => {
    const storage = createMemoryStorage()
    storage.setItem(ORG_DOCUMENT_STORAGE_KEY, '{"app":"OrgMaster","version":4')
    storage.setItem(LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY, JSON.stringify({
      app: 'OrgMaster', version: 3, kind: 'document', savedAt: '2026-08-12T09:00:00.000Z', state,
    }))
    expect(loadLocalDocument(storage)).toMatchObject({ status: 'failed', sourceKey: ORG_DOCUMENT_STORAGE_KEY, code: 'INVALID_JSON' })
  })

  it('prefers a valid V3 source over a newer-timestamp V2 source during migration', () => {
    const storage = createMemoryStorage()
    storage.setItem(LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY, JSON.stringify({
      app: 'OrgMaster', version: 3, kind: 'document', savedAt: '2026-08-12T09:00:00.000Z', state,
    }))
    const { roleCombinationRiskRules: _riskRules, ...stateV2 } = state
    storage.setItem(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY, JSON.stringify({
      app: 'OrgMaster', version: 2, kind: 'document', savedAt: '2026-08-15T09:00:00.000Z', state: stateV2,
    }))
    expect(loadLocalDocument(storage)).toMatchObject({ status: 'loaded', sourceVersion: 3 })
  })

  it('prefers a newer formal document if stale draft cleanup was interrupted', () => {
    const storage = createMemoryStorage()
    saveDraftLocalDocument(state, storage, '2026-08-12T09:00:00.000Z')
    const staleDraft = storage.getItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    const formalState: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => position.id === 'ceo' ? { ...position, title: '正式保存版本' } : position),
    }
    saveLocalDocument(formalState, storage, '2026-08-12T09:01:00.000Z')
    storage.setItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY, staleDraft!)
    expect(staleDraft).toContain('OrgMaster')
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'loaded', document: { kind: 'document', savedAt: '2026-08-12T09:01:00.000Z' } })
    if (loaded.status !== 'loaded') return
    expect(loaded.document.state.positions.find((position) => position.id === 'ceo')?.title).toBe('正式保存版本')
  })

  it('archives an invalid autosave draft without falling back to formal data', () => {
    const storage = createMemoryStorage()
    const formal = saveLocalDocument(state, storage, '2026-08-12T09:02:00.000Z')
    expect(formal).not.toBeNull()
    const raw = '{"app":"OrgMaster","version":2'
    storage.setItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY, raw)
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'failed', code: 'INVALID_JSON', sourceKey: ORG_DOCUMENT_DRAFT_STORAGE_KEY })
    if (loaded.status !== 'failed') return
    expect(archiveFailedLocalDocument(loaded, storage)).toBe(true)
    expect(storage.getItem(RECOVERY_ORG_DOCUMENT_DRAFT_STORAGE_KEY)).toBe(raw)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toContain('OrgMaster')
  })

  it('clears a draft after a formal save is promoted', () => {
    const storage = createMemoryStorage()
    saveDraftLocalDocument(state, storage, '2026-08-12T09:03:00.000Z')
    expect(clearDraftLocalDocument(storage)).toBe(true)
    expect(storage.getItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('round-trips an explicit department remap with disconnected target regions', () => {
    const storage = createMemoryStorage()
    const sourceDepartmentId = state.positions.find((position) => position.departmentId)?.departmentId
    const targetDepartmentId = state.positions.find((position) => position.departmentId && position.departmentId !== sourceDepartmentId)?.departmentId
    const movedPosition = state.positions.find((position) => position.departmentId === sourceDepartmentId)
    expect(sourceDepartmentId).toBeTruthy()
    expect(targetDepartmentId).toBeTruthy()
    expect(movedPosition).toBeTruthy()
    const remapped: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => position.departmentId === sourceDepartmentId
        ? { ...position, departmentId: targetDepartmentId! }
        : position),
    }
    const saved = saveLocalDocument(remapped, storage, '2026-08-12T09:02:00.000Z')
    expect(saved).not.toBeNull()
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'loaded', sourceVersion: 6 })
    if (loaded.status !== 'loaded') return
    expect(loaded.document.state.positions.find((position) => position.id === movedPosition!.id)?.departmentId).toBe(targetDepartmentId)
  })

  it('rejects unsupported or incomplete documents', () => {
    expect(parseOrgDocument({ app: 'OtherApp', version: 1 })).toMatchObject({ ok: false, code: 'INVALID_APP' })
    expect(parseOrgDocument({ app: 'OrgMaster', version: 7, kind: 'backup', savedAt: 'now', state })).toMatchObject({ ok: false, code: 'UNSUPPORTED_VERSION' })
    expect(parseOrgDocument({ app: 'OrgMaster', version: 3, kind: 'backup', savedAt: 'now', state: { ...state, roleCombinationRiskRules: null } })).toMatchObject({ ok: false, code: 'INVALID_DOCUMENT_SHAPE' })
    expect(parseOrgDocument({ app: 'OrgMaster', version: 2, kind: 'backup', savedAt: 'now', state: { ...state, members: null } })).toMatchObject({ ok: false, code: 'INVALID_DOCUMENT_SHAPE' })
  })

  it('migrates V1 parentId layout authority into Position.parentPositionId', () => {
    const storage = createMemoryStorage()
    const v1State = {
      ...state,
      positions: state.positions.map(({ parentPositionId: _parentPositionId, ...position }) => position),
      members: state.members.map((member) => ({ ...member, parentId: state.positions.find((position) => position.id === member.id)?.parentPositionId ?? null })),
    }
    storage.setItem(LEGACY_ORG_DOCUMENT_STORAGE_KEY, JSON.stringify({
      app: 'OrgMaster', version: 1, kind: 'document', savedAt: '2026-08-11T09:03:00.000Z', state: v1State,
    }))
    const loaded = loadLocalDocument(storage)
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') return
    expect(loaded.document.version).toBe(6)
    expect(loaded.sourceVersion).toBe(1)
    expect(loaded.document.state.positions.every((position) => 'parentPositionId' in position)).toBe(true)
    expect(loaded.document.state.members.every((member) => !('parentId' in member))).toBe(true)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toContain('"version":6')
  })

  it('fails closed for V1 ID mismatch and preserves the source key', () => {
    const storage = createMemoryStorage()
    const v1State = {
      ...state,
      positions: state.positions.map(({ parentPositionId: _parentPositionId, ...position }) => position),
      members: state.members.filter((member) => member.id !== 'ceo').map((member) => ({ ...member, parentId: null })),
    }
    const raw = JSON.stringify({ app: 'OrgMaster', version: 1, kind: 'document', savedAt: 'now', state: v1State })
    storage.setItem(LEGACY_ORG_DOCUMENT_STORAGE_KEY, raw)
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'failed', code: 'MIGRATION_ID_MISMATCH', sourceKey: LEGACY_ORG_DOCUMENT_STORAGE_KEY })
    if (loaded.status !== 'failed') return
    expect(archiveFailedLocalDocument(loaded, storage)).toBe(true)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_ORG_DOCUMENT_STORAGE_KEY)).toBe(raw)
  })

  it('preserves a failed legacy V2 payload without promoting it', () => {
    const storage = createMemoryStorage()
    const raw = '{"app":"OrgMaster","version":2'
    storage.setItem(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY, raw)
    const loaded = loadLocalDocument(storage)
    expect(loaded.status).toBe('failed')
    if (loaded.status !== 'failed') return
    expect(archiveFailedLocalDocument(loaded, storage)).toBe(true)
    expect(storage.getItem(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY)).toBe(raw)
    expect(storage.getItem(ORG_DOCUMENT_STORAGE_KEY)).toBeNull()
  })

  it('prioritizes a valid V3 document when legacy keys also exist', () => {
    const storage = createMemoryStorage()
    const v3 = saveLocalDocument(state, storage, '2026-08-11T09:04:00.000Z')
    expect(v3).not.toBeNull()
    storage.setItem(LEGACY_ORG_DOCUMENT_STORAGE_KEY, JSON.stringify({ app: 'OrgMaster', version: 1, kind: 'document', savedAt: 'old', state: { ...state, members: [] } }))
    const loaded = loadLocalDocument(storage)
    expect(loaded).toMatchObject({ status: 'loaded', sourceVersion: 6, document: { savedAt: '2026-08-11T09:04:00.000Z' } })
  })

  it('rejects a V3 payload that attempts to restore a second persisted parent source', () => {
    const raw = createOrgDocumentFile(state, 'backup', '2026-08-11T09:05:00.000Z')
    raw.state.members = raw.state.members.map((member) => ({ ...member, parentId: null })) as typeof raw.state.members
    expect(parseOrgDocument(raw)).toMatchObject({ ok: false, code: 'INVALID_DOCUMENT_SHAPE' })
  })

  it('creates stable download filenames', () => {
    expect(createDownloadFilename('backup', new Date('2026-08-11T09:02:03.000Z'))).toBe('orgmaster-backup-20260811T090203Z.json')
  })
})
