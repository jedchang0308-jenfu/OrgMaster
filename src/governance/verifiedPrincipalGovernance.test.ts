import { describe, expect, it } from 'vitest'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from './migrateGovernanceV2ToV3'
import { evaluateVerifiedPrincipalPermission } from './evaluatePermission'
import { governancePublishBlockersV2 } from './governancePresentation'
import { assertActivationContinuity, assertCurrentPublicationAuthority } from '../../server/orgmasterGovernanceStore'
import type { GovernanceDocumentViewV2 } from './governancePresentation'

const now = '2026-10-05T00:00:00.000Z'
const actor = { principalId: 'managed-principal', employeeId: 'employee-managed', issuer: 'provider', subject: 'uid', bootstrap: false }
function fixture() {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'fixture', undefined, now)
  document.draft.identityLinks = []
  document.draft.roleAssignments = [{
    id: 'own-manager', employeeId: actor.employeeId, applicationId: 'orgmaster',
    roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin',
    roleNameSnapshot: '管理者', catalogVersion: null, scope: { kind: 'global' },
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    effectState: 'orgmaster-enforced', basis: 'manual', sources: [], subjectKind: 'employee',
    targetPrincipalId: null, createdByPrincipalId: actor.principalId, createdReason: 'fixture',
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
  }]
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
  document.activePolicyVersionId = 'current'
  document.publishedVersions.push({
    kind: 'assignment-governance-v3', id: 'current', versionNumber: 1, publishedAt: now,
    publishedByPrincipalId: actor.principalId, publishReason: 'fixture', snapshotHash: 'fixture',
    effectState: 'not-synchronized', policy, externalRoleCatalogs: [],
    organizationSnapshot: { workspaceVersionId: 'current', workspaceRevision: 'fixture',
      capturedAt: now, employees: [{ id: actor.employeeId, primaryAssignmentId: null }],
      departments: [], organizationRoles: [], positions: [], assignments: [] },
  })
  return document
}
function policy(document: ReturnType<typeof fixture>) {
  const version = document.publishedVersions[0]
  if (version.kind !== 'assignment-governance-v3') throw Error('fixture')
  return version.policy
}
function ready(document: ReturnType<typeof fixture>) {
  return governancePublishBlockersV2(document.draft as unknown as GovernanceDocumentViewV2['draft'], actor, 'current', now)
}

describe('verified Principal governance uses own roles without JSON identity aliases', () => {
  it('allows the qualified manager in evaluator, publish, activation and UI readiness without an alias', () => {
    const document = fixture()
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', { now }).status).toBe('allowed')
    expect(() => assertCurrentPublicationAuthority(document, actor, now)).not.toThrow()
    expect(() => assertActivationContinuity(document.publishedVersions[0], actor, now)).not.toThrow()
    expect(ready(document)).toEqual([])
  })
  it('does not let a draft self-grant replace a missing published grant', () => {
    const document = fixture()
    policy(document).roleAssignments = []
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', { now }).status).toBe('denied')
    expect(() => assertCurrentPublicationAuthority(document, actor, now)).toThrow('GOVERNANCE_ADMIN_REQUIRED')
    expect(ready(document)).toEqual([])
  })
  it.each(['revoked', 'expired', 'scope', 'deny', 'wrong-employee', 'wrong-principal-target', 'external-app'] as const)(
    'preserves %s denial', reason => {
      const document = fixture()
      for (const target of [policy(document), document.draft]) {
        const assignment = target.roleAssignments[0]
        if (reason === 'revoked') assignment.status = 'revoked'
        if (reason === 'expired') assignment.validTo = '2026-10-04T00:00:00.000Z'
        if (reason === 'scope') assignment.scope = { kind: 'department', value: 'department-other' }
        if (reason === 'deny') target.rolePermissionGrants.push({ id: 'deny', roleId: assignment.roleId, permissionId: 'permission-orgmaster-governance-manage', effect: 'deny' })
        if (reason === 'wrong-employee') assignment.employeeId = 'employee-other'
        if (reason === 'wrong-principal-target') { assignment.subjectKind = 'principal'; assignment.targetPrincipalId = 'principal-other' }
        if (reason === 'external-app') assignment.applicationId = 'ai-pdm'
      }
      expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', { now }).status).toBe('denied')
      expect(() => assertCurrentPublicationAuthority(document, actor, now)).toThrow('GOVERNANCE_ADMIN_REQUIRED')
      expect(ready(document).map(row => row.code)).toContain('GOVERNANCE_MANAGE_REQUIRED')
    })
  it('rejects empty Principal or Employee and does not elevate a same-Employee principal target', () => {
    const document = fixture()
    for (const invalid of [{ ...actor, principalId: '' }, { ...actor, employeeId: null }]) {
      expect(evaluateVerifiedPrincipalPermission(document, invalid, 'orgmaster.governance.manage', { now }).status).toBe('denied')
      expect(governancePublishBlockersV2(document.draft as unknown as GovernanceDocumentViewV2['draft'], invalid, 'current', now).map(row=>row.code)).toContain('VERIFIED_EMPLOYEE_REQUIRED')
    }
    const assignment = policy(document).roleAssignments[0]
    assignment.subjectKind = 'principal'
    assignment.targetPrincipalId = actor.principalId
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', { now }).status).toBe('allowed')
    expect(evaluateVerifiedPrincipalPermission(document, { ...actor, principalId: 'other-same-employee' }, 'orgmaster.governance.manage', { now }).status).toBe('denied')
  })
})
