import { describe, expect, it } from 'vitest'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { evaluatePermission } from './evaluatePermission'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
describe('permission evaluator', () => {
  it('fails closed without an active policy', () => { const result = evaluatePermission(createSeedDocument(), { applicationId: 'orgmaster', issuer: 'urn:test', subject: 'u1', permissionCode: 'orgmaster.governance.manage', scope: { kind: 'global' } }); expect(result.status).toBe('denied'); expect(result.reason).toBe('NO_ACTIVE_POLICY') })
  it('allows an active role grant and denies an unknown identity', () => {
    const document = createSeedDocument(); const base = { ...document.draft, identityLinks: [{ id: 'link', principalId: 'p1', issuer: 'urn:test', subject: 'u1', employeeId: 'e1', status: 'active' as const, validFrom: '2020-01-01T00:00:00.000Z', validTo: null }], roleAssignments: [{ id: 'a', employeeId: 'e1', roleId: 'role-orgmaster-admin', scope: { kind: 'global' as const }, status: 'active' as const, validFrom: '2020-01-01T00:00:00.000Z', validTo: null }] }; const version = { id: 'v1', versionNumber: 1, publishedAt: '2020-01-01T00:00:00.000Z', publishedByPrincipalId: 'p1', publishReason: 'test', snapshotHash: 'hash', policy: base, organizationSnapshot: { workspaceVersionId: 'w', workspaceRevision: 'r', capturedAt: '2020-01-01T00:00:00.000Z', employees: [{ id: 'e1', primaryAssignmentId: null }], departments: [], organizationRoles: [], positions: [], assignments: [] } }; const active = { ...document, activePolicyVersionId: 'v1', publishedVersions: [version] }; expect(evaluatePermission(active, { applicationId: 'orgmaster', issuer: 'urn:test', subject: 'u1', permissionCode: 'orgmaster.governance.manage', scope: { kind: 'global' } }).status).toBe('allowed'); expect(evaluatePermission(active, { applicationId: 'orgmaster', issuer: 'urn:test', subject: 'unknown', permissionCode: 'orgmaster.governance.manage', scope: { kind: 'global' } }).reason).toBe('IDENTITY_NOT_LINKED')
  })
  it('never evaluates AI-PDM permission details from OrgMaster V2', () => {
    const document = createSeedDocumentV2()
    expect(evaluatePermission(document, { applicationId: 'ai-pdm', issuer: 'urn:test', subject: 'u1', permissionCode: 'numbering.publish', scope: { kind: 'global' } }).reason).toBe('EXTERNAL_PERMISSION_EVALUATION_UNSUPPORTED')
  })
})
