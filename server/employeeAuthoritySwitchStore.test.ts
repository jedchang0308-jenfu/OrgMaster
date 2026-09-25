import { describe, expect, it, vi } from 'vitest'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import type { GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'
import {
  assertEmployeeAuthoritySwitchAccess,
  EmployeeAuthoritySwitchError,
  switchEmployeeEntitlementAuthority,
} from './employeeAuthoritySwitchStore'

const now = '2026-09-20T16:00:00.000Z'
const actor: GovernanceActorContext = {
  principalId: 'principal-privileged',
  employeeId: 'employee-shijie',
  issuer: 'https://securetoken.google.com/jenfu-platform-prod',
  subject: 'subject-privileged',
  bootstrap: false,
  sessionId: 'session-privileged',
  assuranceLevel: 'aal2',
  authenticatedAt: '2026-09-20T15:59:00.000Z',
}

function fixture(): GovernanceDocumentV3 {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'source-v2', readAiPdmRoleCatalog(), now)
  document.draft.identityLinks = [{ id: 'link-privileged', principalId: actor.principalId, employeeId: actor.employeeId!, issuer: actor.issuer, subject: actor.subject, status: 'active', validFrom: '2026-09-10T00:00:00.000Z', validTo: null }]
  document.draft.principalAdmissions = [{ id: 'admission-privileged', identityLinkId: 'link-privileged', accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: 'a'.repeat(64), issuerFingerprintSha256: 'b'.repeat(64), evidenceRefSha256: 'c'.repeat(64), recordedAt: now }]
  document.draft.managementGrants = [{ id: 'grant-cross-app', principalId: actor.principalId, employeeId: actor.employeeId!, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-09-10T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'bootstrap', reason: 'production bootstrap' }]
  document.draft.roleAssignments = [{ id: 'assignment-system-admin', employeeId: actor.employeeId!, applicationId: 'ai-pdm', roleId: 'role-system-admin', roleCodeSnapshot: 'system_admin', roleNameSnapshot: '系統管理員', catalogVersion: readAiPdmRoleCatalog().catalogVersion, scope: { kind: 'global' }, status: 'active', validFrom: '2026-09-10T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'principal', targetPrincipalId: actor.principalId, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'bootstrap', createdReason: 'production bootstrap' }]
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = document.draft
  document.publishedVersions = [{
    kind: 'assignment-governance-v3', id: 'policy-version-2', versionNumber: 2, publishedAt: now,
    publishedByPrincipalId: actor.principalId, publishReason: 'DEV-013 P_BOTH', snapshotHash: 'd'.repeat(64),
    effectState: 'not-synchronized', policy, externalRoleCatalogs: [readAiPdmRoleCatalog()],
    organizationSnapshot: { workspaceVersionId: 'workspace-version-1', workspaceRevision: 'e'.repeat(64), departments: [], positions: [], assignments: [] },
  }]
  document.activePolicyVersionId = 'policy-version-2'
  return document
}

describe('employee authority switch store', () => {
  it('requires the exact active privileged principal and current system_admin assignment', () => {
    const document = fixture()
    expect(assertEmployeeAuthoritySwitchAccess(document, actor, now)).toBe('policy-version-2')
    expect(() => assertEmployeeAuthoritySwitchAccess(document, { ...actor, principalId: 'principal-other' }, now)).toThrowError(expect.objectContaining({ code: 'ENTITLEMENT_AUTHORITY_SWITCH_FORBIDDEN' }))
    document.publishedVersions[0].policy.roleAssignments[0].status = 'revoked'
    expect(() => assertEmployeeAuthoritySwitchAccess(document, actor, now)).toThrowError(expect.objectContaining({ code: 'ENTITLEMENT_AUTHORITY_SYSTEM_ADMIN_REQUIRED' }))
  })

  it('uses the reviewed database function with CAS, stable operation id and active assignment version', async () => {
    const document = fixture()
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [
        { employee_id: 'employee-shijie', principal_id: 'principal-personal', principal_issuer: 'issuer-a', principal_subject: 'subject-a', account_type: 'human_personal' },
        { employee_id: 'employee-shijie', principal_id: 'principal-personal', principal_issuer: 'issuer-b', principal_subject: 'subject-b', account_type: 'human_personal' },
      ] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ receipt_id: 'receipt-1', authority_version: '2', outbox_event_id: 'event-1', session_refresh_state: 'pending', replayed: false }] })
    const receipt = await switchEmployeeEntitlementAuthority('/fixture', actor, {
      applicationId: 'ai-pdm', employeeId: 'employee-shijie', toAuthoritySource: 'orgmaster_authority', expectedAuthorityVersion: 1,
      operationId: 'dev013-p-both-employee-shijie-v1', batchId: 'DEV-013-P_BOTH-20260920', reason: 'DEV-013 Production L4 P_BOTH',
    }, {
      now,
      database: { query, end: vi.fn() } as never,
      readStore: async () => ({ document, revision: 'governance-revision', raw: '{}' }) as never,
    })
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('read_employee_authority_operation_v1'), [
      'ai-pdm', 'employee-shijie', 'dev013-p-both-employee-shijie-v1',
    ])
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('switch_employee_entitlement_authority_v2'), [
      'ai-pdm', 'employee-shijie', 'orgmaster_authority', 1, 'dev013-p-both-employee-shijie-v1', 'DEV-013-P_BOTH-20260920', 'policy-version-2', actor.principalId, 'DEV-013 Production L4 P_BOTH',
      'principal-personal', 'issuer-a', 'subject-a',
    ])
    expect(receipt).toMatchObject({ contractVersion: 'orgmaster.employee-authority-switch-receipt.v1', authorityVersion: 2, assignmentVersionId: 'policy-version-2', sessionRefreshState: 'pending', replayed: false })
  })

  it('rejects cross-employee input before database mutation and maps CAS conflicts', async () => {
    const document = fixture()
    const query = vi.fn()
    const dependencies = { now, database: { query, end: vi.fn() } as never, readStore: async () => ({ document, revision: 'revision', raw: '{}' }) as never }
    await expect(switchEmployeeEntitlementAuthority('/fixture', actor, { applicationId: 'ai-pdm', employeeId: 'employee-other', toAuthoritySource: 'orgmaster_authority', expectedAuthorityVersion: 1, operationId: 'operation-1', batchId: 'batch-1', reason: 'reason' }, dependencies)).rejects.toBeInstanceOf(EmployeeAuthoritySwitchError)
    expect(query).not.toHaveBeenCalled()
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ employee_id: actor.employeeId, principal_id: 'principal-personal', principal_issuer: 'issuer', principal_subject: 'subject', account_type: 'human_personal' }] })
      .mockRejectedValueOnce(new Error('ENTITLEMENT_AUTHORITY_VERSION_CONFLICT'))
    await expect(switchEmployeeEntitlementAuthority('/fixture', actor, { applicationId: 'ai-pdm', employeeId: 'employee-shijie', toAuthoritySource: 'orgmaster_authority', expectedAuthorityVersion: 1, operationId: 'operation-1', batchId: 'batch-1', reason: 'reason' }, dependencies)).rejects.toMatchObject({ code: 'ENTITLEMENT_AUTHORITY_VERSION_CONFLICT' })
  })

  it('requires a fresh AAL2 session before invoking the database function', async () => {
    const document = fixture()
    const query = vi.fn()
    const dependencies = { now, database: { query, end: vi.fn() } as never, readStore: async () => ({ document, revision: 'revision', raw: '{}' }) as never }
    await expect(switchEmployeeEntitlementAuthority('/fixture', { ...actor, assuranceLevel: 'aal1' }, {
      applicationId: 'ai-pdm', employeeId: actor.employeeId!, toAuthoritySource: 'orgmaster_authority', expectedAuthorityVersion: 1,
      operationId: 'operation-aal1', batchId: 'batch-1', reason: 'reason',
    }, dependencies)).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' })
    expect(query).not.toHaveBeenCalled()
  })

  it('replays using the receipt-bound target when the current typed view no longer admits that alias', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ receipt: {
        requestContractVersion: 'orgmaster.employee-authority-switch.v2',
        targetPrincipalId: 'principal-personal', targetIdentityIssuer: 'old-issuer', targetIdentitySubject: 'old-subject',
        assignmentVersionId: 'policy-version-1',
      } }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ receipt_id: 'receipt-1', authority_version: 2, outbox_event_id: 'event-1', session_refresh_state: 'completed', replayed: true }] })
    const receipt = await switchEmployeeEntitlementAuthority('/fixture', actor, {
      applicationId: 'ai-pdm', employeeId: actor.employeeId!, toAuthoritySource: 'orgmaster_authority', expectedAuthorityVersion: 1,
      operationId: 'operation-replay', batchId: 'batch-1', reason: 'reason',
    }, { now, database: { query, end: vi.fn() } as never, readStore: async () => ({ document: fixture(), revision: 'revision', raw: '{}' }) as never })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('switch_employee_entitlement_authority_v2'), [
      'ai-pdm', actor.employeeId, 'orgmaster_authority', 1, 'operation-replay', 'batch-1', 'policy-version-1', actor.principalId,
      'reason', 'principal-personal', 'old-issuer', 'old-subject',
    ])
    expect(receipt).toMatchObject({ replayed: true, assignmentVersionId: 'policy-version-1' })
  })

  it('fails closed when one employee has multiple personal principals or a historical unbound receipt', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [
        { employee_id: actor.employeeId, principal_id: 'principal-one', principal_issuer: 'issuer', principal_subject: 'subject-one', account_type: 'human_personal' },
        { employee_id: actor.employeeId, principal_id: 'principal-two', principal_issuer: 'issuer', principal_subject: 'subject-two', account_type: 'human_personal' },
      ] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ receipt: { requestContractVersion: null } }] })
    const dependencies = { now, database: { query, end: vi.fn() } as never, readStore: async () => ({ document: fixture(), revision: 'revision', raw: '{}' }) as never }
    const request = { applicationId: 'ai-pdm' as const, employeeId: actor.employeeId!, toAuthoritySource: 'orgmaster_authority' as const, expectedAuthorityVersion: 1, operationId: 'operation-1', batchId: 'batch-1', reason: 'reason' }
    await expect(switchEmployeeEntitlementAuthority('/fixture', actor, request, dependencies)).rejects.toMatchObject({ code: 'ENTITLEMENT_AUTHORITY_TARGET_IDENTITY_INVALID' })
    await expect(switchEmployeeEntitlementAuthority('/fixture', actor, request, dependencies)).rejects.toMatchObject({ code: 'legacy_receipt_unbound' })
    expect(query).toHaveBeenCalledTimes(3)
  })
})
