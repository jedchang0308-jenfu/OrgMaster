import { describe, expect, it } from 'vitest'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from './migrateGovernanceV2ToV3'
import { readAiPdmRoleCatalog } from './aiPdmCatalog'
import {
  assertFreshPrivilegedSession,
  buildPrivilegedPreview,
  hasCrossAppOverride,
  privilegedAssignmentWorkspace,
  PrivilegedAssignmentError,
  type PrivilegedAssignmentRequest,
} from './privilegedAssignments'
import type { GovernanceActorContext, GovernanceDocumentV3, GovernanceIdentityLinkV1, GovernancePrincipalAdmissionV1 } from './types'

const now = '2026-09-02T12:00:00.000Z'
const actor: GovernanceActorContext = { principalId: 'principal-override', issuer: 'issuer-fixture', subject: 'subject-override', employeeId: 'employee-a', bootstrap: false }

function link(id: string, principalId: string, subject: string, employeeId: string): GovernanceIdentityLinkV1 {
  return { id, principalId, issuer: 'issuer-fixture', subject, employeeId, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
}

function admission(id: string, identityLinkId: string): GovernancePrincipalAdmissionV1 {
  return {
    id, identityLinkId, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable',
    principalFingerprintSha256: 'a'.repeat(64), issuerFingerprintSha256: 'b'.repeat(64), evidenceRefSha256: 'c'.repeat(64), recordedAt: now,
  }
}

function fixture(): GovernanceDocumentV3 {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'v2-fixture', readAiPdmRoleCatalog(), now)
  const overrideLink = link('link-override', actor.principalId, actor.subject, actor.employeeId!)
  const targetLink = link('link-target', 'principal-target', 'subject-target', 'employee-b')
  const dailyLink = link('link-daily', 'principal-daily', 'subject-daily', actor.employeeId!)
  document.draft.identityLinks = [overrideLink, targetLink, dailyLink]
  document.draft.principalAdmissions = [admission('admission-override', overrideLink.id), admission('admission-target', targetLink.id), { ...admission('admission-daily', dailyLink.id), accountType: 'human_personal' }]
  document.draft.managementGrants = [{
    id: 'grant-override', principalId: actor.principalId, employeeId: actor.employeeId!, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override',
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'principal-bootstrap', reason: 'fixture',
  }]
  return document
}

function request(employeeId = 'employee-b', principalAdmissionId = 'admission-target'): PrivilegedAssignmentRequest {
  const catalog = readAiPdmRoleCatalog()
  return {
    operation: 'grant_system_admin', employeeId, principalAdmissionId, applicationId: 'ai-pdm', stableRoleId: 'role-system-admin', reason: 'fixture grant',
    expected: { catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.payloadHash, governanceRevision: 'revision-fixture', organizationRevision: 'organization-fixture' },
  }
}

describe('DEV-009 privileged assignment policy', () => {
  it('uses provider authenticatedAt and enforces the inclusive five-minute AAL2 window', () => {
    const session = { sessionId: 'session-1', principalId: actor.principalId, assuranceLevel: 'aal2' as const, authenticatedAt: '2026-09-02T11:55:00.000Z' }
    expect(() => assertFreshPrivilegedSession(actor, session, new Date(now))).not.toThrow()
    expect(() => assertFreshPrivilegedSession(actor, { ...session, authenticatedAt: '2026-09-02T11:54:59.999Z' }, new Date(now))).toThrowError(expect.objectContaining({ code: 'STEP_UP_REQUIRED' }))
    expect(() => assertFreshPrivilegedSession(actor, { ...session, authenticatedAt: '2026-09-02T12:00:00.001Z' }, new Date(now))).toThrowError(expect.objectContaining({ code: 'STEP_UP_REQUIRED' }))
    expect(() => assertFreshPrivilegedSession(actor, { ...session, assuranceLevel: 'aal1' }, new Date(now))).toThrowError(expect.objectContaining({ code: 'STEP_UP_REQUIRED' }))
    expect(() => assertFreshPrivilegedSession(actor, { ...session, principalId: 'principal-other' }, new Date(now))).toThrowError(expect.objectContaining({ code: 'STEP_UP_REQUIRED' }))
  })

  it('binds cross-app override to the exact privileged principal, not the employee', () => {
    const document = fixture()
    expect(hasCrossAppOverride(document, actor, now)).toBe(true)
    expect(hasCrossAppOverride(document, { ...actor, principalId: 'principal-daily', subject: 'subject-daily' }, now)).toBe(false)
  })

  it('denies self grant and allows a different eligible privileged principal preview', () => {
    const document = fixture()
    const preview = buildPrivilegedPreview(document, actor, request(), now)
    expect(preview).toMatchObject({ beforeHolderCount: 0, afterHolderCount: 1, affectedSessionCount: 1, noOp: false })
    document.draft.identityLinks.find((value) => value.id === 'link-target')!.principalId = actor.principalId
    expect(() => buildPrivilegedPreview(document, actor, request(), now)).toThrowError(PrivilegedAssignmentError)
  })

  it('moves legacy employee-wide system_admin into a migration exception with zero V3 assignment', () => {
    const v2 = createSeedDocumentV2(now)
    const catalog = readAiPdmRoleCatalog()
    const role = catalog.roles.find((value) => value.stableRoleId === 'role-system-admin')!
    v2.draft.roleAssignments.push({
      id: 'legacy-system-admin', employeeId: 'employee-a', applicationId: 'ai-pdm', roleId: role.stableRoleId,
      roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, catalogVersion: catalog.catalogVersion,
      scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized',
    })
    const migrated = migrateGovernanceV2ToV3(v2, 'legacy-revision', catalog, now)
    expect(migrated.draft.roleAssignments).toHaveLength(0)
    expect(migrated.migration.unresolvedAssignments).toContainEqual(expect.objectContaining({ reason: 'SYSTEM_ADMIN_PRINCIPAL_REQUIRED' }))
    expect(migrated.activePolicyVersionId).toBeNull()
  })

  it('reports authority data time instead of the read response time', () => {
    const document = fixture()
    document.draft.updatedAt = '2026-09-02T10:00:00.000Z'
    const source = {
      workspaceVersionId: 'workspace-fixture', workspaceRevision: 'organization-fixture', sourceDataAt: '2026-09-02T11:00:00.000Z',
      state: { employees: [{ id: 'employee-a', primaryAssignmentId: null }, { id: 'employee-b', primaryAssignmentId: null }], departments: [], roles: [], positions: [], assignments: [] },
    }
    const workspace = privilegedAssignmentWorkspace(document, source, readAiPdmRoleCatalog(), 'revision-fixture', actor, '2026-09-02T15:00:00.000Z')
    expect(workspace.sourceDataAt).toBe('2026-09-02T11:00:00.000Z')
  })
})
