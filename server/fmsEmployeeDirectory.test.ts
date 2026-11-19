import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { buildOrganizationSnapshot } from '../src/governance/validation'
import { GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import type { GovernanceActorContext, GovernanceDocumentV3, GovernanceOrgSource } from '../src/governance/types'
import { FINANCIAL_ROLE_ASSIGNMENT_MANAGE } from './applicationEntitlementCommon'
import { FINANCIAL_ROLE_ASSIGNMENT_PUBLISH } from './applicationEntitlementCommon'
import { appendGovernanceAudit } from './orgmasterGovernanceStore'
import { previewFinancialRoleAssignment, publishFinancialRoleAssignment, readFinancialRoleAssignmentReceipt, readFinancialRoleAssignmentWorkspace } from './applicationRoleAssignmentStore'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import type { GovernanceCommandReceiptV2 } from '../src/governance/types'
import { readFinancialEmployeeDirectory } from './fmsEmployeeDirectory'

const stores = vi.hoisted(() => ({
  readGovernanceStore: vi.fn(),
  loadOrganizationSource: vi.fn(),
  readApplicationRoleCatalogs: vi.fn(),
}))
vi.mock('./orgmasterGovernanceStore', async importOriginal => ({
  ...await importOriginal<typeof import('./orgmasterGovernanceStore')>(), ...stores,
}))
vi.mock('./applicationRoleCatalogRegistry', () => ({ readApplicationRoleCatalogs: stores.readApplicationRoleCatalogs }))

const actor: GovernanceActorContext = {
  principalId: 'principal-directory-owner', employeeId: 'employee-000',
  issuer: 'https://securetoken.google.com/directory-test', subject: 'directory-test', bootstrap: false,
}
const at = '2026-01-01T00:00:00.000Z'
let document: GovernanceDocumentV3
let source: GovernanceOrgSource

function publish() {
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
  const payload = { kind: 'assignment-governance-v3' as const, effectState: 'not-synchronized' as const,
    policy, externalRoleCatalogs: [], organizationSnapshot: buildOrganizationSnapshot(source, at) }
  document.publishedVersions = [{ ...payload, id: 'directory-policy', versionNumber: 1,
    publishedAt: at, publishedByPrincipalId: actor.principalId, publishReason: 'unit fixture',
    hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash: publicationSnapshotHash(payload) }]
  document.activePolicyVersionId = 'directory-policy'
}

beforeEach(() => {
  vi.resetAllMocks()
  source = { workspaceVersionId: 'workspace-current', workspaceRevision: 'directory-r1',
    state: { employees: Array.from({ length: 55 }, (_, index) => ({
      id: 'employee-' + String(index).padStart(3, '0'), name: '員工 ' + index,
      status: 'active' as const, primaryAssignmentId: null,
    })), departments: [], roles: [], positions: [], assignments: [] } }
  document = migrateGovernanceV2ToV3(createSeedDocumentV2(at), 'fixture-revision', readAiPdmRoleCatalog(), at)
  document.draft.roleAssignments = [{ id: 'fms-owner', employeeId: actor.employeeId!,
    applicationId: 'financial-management-system', roleId: 'role-owner', roleCodeSnapshot: 'owner',
    roleNameSnapshot: '負責人', catalogVersion: 'unit-catalog', scope: { kind: 'workspace', value: 'company-jenfu' },
    status: 'active', validFrom: at, validTo: null, effectState: 'not-synchronized', basis: 'manual',
    subjectKind: 'employee', targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: actor.principalId, createdReason: 'unit fixture' }]
  document.draft.managementGrants = [{ id: 'directory-manage', principalId: actor.principalId,
    employeeId: actor.employeeId!, applicationId: 'financial-management-system', capability: FINANCIAL_ROLE_ASSIGNMENT_MANAGE,
    status: 'active', validFrom: at, validTo: null, grantedByPrincipalId: 'fixture-admin', reason: 'unit fixture' }]
  publish()
  stores.readGovernanceStore.mockImplementation(async () => ({ document, revision: 'governance-r1' }))
  stores.loadOrganizationSource.mockImplementation(async () => source)
  stores.readApplicationRoleCatalogs.mockImplementation(async () => [await readFinancialRoleCatalog('valid')])
})

describe('FMS canonical employee directory', () => {
  it('uses the canonical source, excludes inactive employees and returns only assignment display fields', async () => {
    source.state.employees[1].status = 'inactive'
    Object.assign(source.state.employees[0], { personalEmail: 'private@example.test', bankAccount: 'TEST-ONLY' })
    const result = await readFinancialEmployeeDirectory('fixture', actor)
    expect(result).toMatchObject({ contractVersion: 'orgmaster.fms-employee-directory.v1',
      applicationId: 'financial-management-system', directoryRevision: 'directory-r1', governanceRevision: 'governance-r1' })
    expect(result.items).toHaveLength(20)
    expect(result.items.some(item => item.employeeId === 'employee-001')).toBe(false)
    expect(Object.keys(result.items[0]).sort()).toEqual(['active', 'assignable', 'displayName', 'employeeId', 'employeeNumber'])
    expect(result.items[0]).toEqual({ employeeId: 'employee-000', displayName: '員工 0', employeeNumber: null, active: true, assignable: true })
  })

  it('requires both the FMS owner role and exact-Principal manage grant before reading directory data', async () => {
    await expect(readFinancialEmployeeDirectory('fixture', { ...actor, principalId: 'other-principal' }))
      .rejects.toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
    document.draft.managementGrants = []; publish()
    await expect(readFinancialEmployeeDirectory('fixture', actor)).rejects.toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
    expect(stores.loadOrganizationSource).not.toHaveBeenCalled()
  })

  it('rejects an owner role without the existing workspace authority, even for a bootstrap actor', async () => {
    document.draft.roleAssignments = []; publish()
    await expect(readFinancialEmployeeDirectory('fixture', { ...actor, bootstrap: true }))
      .rejects.toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
    expect(stores.loadOrganizationSource).not.toHaveBeenCalled()
  })

  it('does not reuse revoked or expired management authority', async () => {
    document.draft.managementGrants[0].status = 'inactive'; publish()
    await expect(readFinancialEmployeeDirectory('fixture', actor)).rejects.toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
    document.draft.managementGrants[0].status = 'active'
    document.draft.managementGrants[0].validTo = '2026-01-02T00:00:00.000Z'; publish()
    await expect(readFinancialEmployeeDirectory('fixture', actor)).rejects.toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
  })

  it('normalizes name and ID search without requiring a local user or login identity', async () => {
    source.state.employees[5].name = 'Ａｌｉｃｅ 王'
    const result = await readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ q: ' alice ' }))
    expect(result.items.map(item => item.employeeId)).toEqual(['employee-005'])
    expect((await readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ q: 'EMPLOYEE-005' }))).items).toHaveLength(1)
  })

  it('pages deterministically with a bounded response and no duplicate or missing employees', async () => {
    const first = await readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ limit: '50' }))
    const last = await readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ limit: '50', cursor: first.cursor! }))
    expect(first.items).toHaveLength(50); expect(last.items).toHaveLength(5); expect(last.cursor).toBeNull()
    expect(new Set([...first.items, ...last.items].map(item => item.employeeId)).size).toBe(55)
  })

  it('rejects a stale directory revision and a cursor used with a different search', async () => {
    const first = await readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ limit: '1' }))
    await expect(readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ q: '員工', cursor: first.cursor! }))).rejects.toThrow('INVALID_COMMAND')
    source.workspaceRevision = 'directory-r2'
    await expect(readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams({ cursor: first.cursor! }))).rejects.toThrow('ORGANIZATION_REVISION_CONFLICT')
  })

  it.each(['limit=0', 'limit=51', 'limit=01', 'limit=1.5', 'q=a&q=b', 'unknown=true', 'cursor=%25', 'cursor='])(
    'rejects malformed or unbounded search %s', async search => {
      await expect(readFinancialEmployeeDirectory('fixture', actor, new URLSearchParams(search))).rejects.toThrow('INVALID_COMMAND')
    })
})

describe('FMS role-assignment receipt authority', () => {
  function priorReceipt(action = 'financial_role_assignment_upsert') {
    const receipt: GovernanceCommandReceiptV2 = { contractVersion: 'orgmaster.governance-command-receipt.v2',
      commandId: 'fms-assignment-command', requestHash: 'a'.repeat(64), previewHash: 'b'.repeat(64), receiptStatus: 'applied',
      acceptedAt: at, terminalAt: at, decisionCode: 'COMMAND_APPLIED', auditReference: null, securityAlertReference: null,
      sessionRefresh: 'pending', governanceRevision: 'governance-r1', replayed: false, attempt: 1 }
    document = appendGovernanceAudit(document, { type: 'upsert', commandId: receipt.commandId, reason: 'unit fixture' }, actor,
      { action, entityType: 'applicationRoleAssignment', entityId: 'assignment-unit', beforeHash: null, afterHash: 'c'.repeat(64) })
    receipt.auditReference = document.auditEvents.at(-1)!.id
    document.commandReceipts = [receipt]
    return receipt
  }

  it('lets an authorized FMS assignment manager read its typed namespace only', async () => {
    const receipt = priorReceipt()
    expect(await readFinancialRoleAssignmentReceipt('fixture', receipt.commandId, actor)).toEqual(receipt)
    await expect(readFinancialRoleAssignmentReceipt('fixture', receipt.commandId, { ...actor, principalId: 'ordinary-org-viewer' }))
      .rejects.toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
  })

  it('does not expose a receipt from another application through the FMS endpoint', async () => {
    const foreign = priorReceipt('pdm_role_assignment_upsert')
    expect(await readFinancialRoleAssignmentReceipt('fixture', foreign.commandId, actor))
      .toMatchObject({ commandId: foreign.commandId, receiptStatus: 'not_found', requestHash: '', previewHash: '' })
  })

  it('retains the native empty-hash not-found shape without inventing a terminal result', async () => {
    expect(await readFinancialRoleAssignmentReceipt('fixture', 'unknown-command', actor))
      .toMatchObject({ commandId: 'unknown-command', receiptStatus: 'not_found', requestHash: '', previewHash: '' })
  })

  it('checks current publish authority even when a matching committed receipt already exists', async () => {
    const prior = priorReceipt()
    const input = { operation: 'upsert' as const, employeeId: 'employee-001', stableRoleId: 'role-viewer',
      scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: at, validUntil: null, reason: 'unit fixture',
      expectedCatalogVersion: 'unit-catalog', expectedCatalogPayloadHash: 'c'.repeat(64),
      expectedGovernanceRevision: 'governance-r1', expectedOrganizationRevision: 'directory-r1',
      commandId: prior.commandId, requestHash: prior.requestHash, previewHash: prior.previewHash }
    await expect(publishFinancialRoleAssignment('fixture', actor, input)).rejects.toThrow('APP_PUBLISH_GRANT_REQUIRED')
    document.draft.managementGrants.push({ ...document.draft.managementGrants[0], id: 'directory-publish',
      capability: FINANCIAL_ROLE_ASSIGNMENT_PUBLISH })
    publish()
    expect(await publishFinancialRoleAssignment('fixture', actor, input)).toMatchObject({ commandId: prior.commandId, receiptStatus: 'applied', replayed: true })
    expect(stores.loadOrganizationSource).not.toHaveBeenCalled()
    document.auditEvents = document.auditEvents.map(event => event.id === prior.auditReference
      ? { ...event, action: 'pdm_role_assignment_upsert' } : event)
    await expect(publishFinancialRoleAssignment('fixture', actor, input)).rejects.toThrow('COMMAND_ID_CONFLICT')
  })
})
describe('FMS canonical assignment lifecycle', () => {
  async function targetFixture() {
    const catalog = await readFinancialRoleCatalog('valid')
    const target = { ...document.draft.roleAssignments[0], id: 'target-viewer', employeeId: 'employee-001',
      roleId: 'role-viewer', roleCodeSnapshot: 'viewer', roleNameSnapshot: '檢視者' }
    document.draft.roleAssignments.push(target); publish()
    return { target, input: { operation: 'revoke' as const, assignmentId: target.id, employeeId: target.employeeId,
      stableRoleId: target.roleId, scope: { kind: 'workspace' as const, value: 'company-jenfu' },
      validFrom: target.validFrom, validUntil: target.validTo, reason: '撤銷既有任用',
      expectedCatalogVersion: catalog.catalogVersion, expectedCatalogPayloadHash: catalog.payloadHash,
      expectedGovernanceRevision: 'governance-r1', expectedOrganizationRevision: 'directory-r1' } }
  }

  it('previews revocation of an inactive employee without enabling a new assignment or changing stored state', async () => {
    const { target, input } = await targetFixture()
    source.state.employees[1].status = 'inactive'
    const preview = await previewFinancialRoleAssignment('fixture', actor, input)
    expect(preview.beforeAssignments.find(row => row.assignmentId === target.id)?.status).toBe('active')
    expect(preview.afterAssignments.find(row => row.assignmentId === target.id)?.status).toBe('revoked')
    expect(document.draft.roleAssignments.find(row => row.id === target.id)?.status).toBe('active')
    await expect(previewFinancialRoleAssignment('fixture', actor, { ...input, operation: 'upsert' }))
      .rejects.toThrow('EMPLOYEE_NOT_FOUND')
  })

  it('rejects an assignment ID presented with a different employee or role', async () => {
    const { input } = await targetFixture()
    await expect(previewFinancialRoleAssignment('fixture', actor, { ...input, employeeId: 'employee-002' }))
      .rejects.toThrow('ASSIGNMENT_NOT_FOUND')
    await expect(previewFinancialRoleAssignment('fixture', actor, { ...input, stableRoleId: 'role-owner' }))
      .rejects.toThrow('ASSIGNMENT_NOT_FOUND')
    expect(document.draft.roleAssignments.every(row => row.status === 'active')).toBe(true)
  })

  it('returns canonical role choices, employee names and the existing separate publish decision', async () => {
    await targetFixture()
    const current = await readFinancialRoleAssignmentWorkspace('fixture', actor)
    expect(current.roles.some(role => role.stableRoleId === 'role-viewer')).toBe(true)
    expect(current.assignments.find(row => row.employeeId === 'employee-001')?.employeeName).toBe('員工 1')
    expect(current.allowedOperations).toEqual({ preview: true, publish: false })
    document.draft.managementGrants.push({ ...document.draft.managementGrants[0], id: 'lifecycle-publish',
      capability: FINANCIAL_ROLE_ASSIGNMENT_PUBLISH }); publish()
    expect((await readFinancialRoleAssignmentWorkspace('fixture', actor)).allowedOperations.publish).toBe(true)
  })
})
