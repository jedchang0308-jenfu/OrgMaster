import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { ORGMASTER_BUSINESS_PERMISSIONS, ORGMASTER_PERMISSIONS } from '../src/governance/aiPdmCatalog'
import { isOrgMasterPermissionProjection } from '../src/auth/permissionContract'
import { applyGovernanceCommandV3, publicationSnapshotHash } from '../src/governance/commands'
import { evaluateVerifiedPrincipalPermission } from '../src/governance/evaluatePermission'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceAssignmentVersionV3, GovernanceCommandV2, GovernanceDocumentV3 } from '../src/governance/types'
import { syncOrgMasterSystemCatalog } from './orgmasterGovernanceStore'

const permission = ORGMASTER_BUSINESS_PERMISSIONS[0]
const actor = { principalId: 'manager-principal', employeeId: 'manager-employee' }
const at = '2026-01-01T00:00:00.000Z'
function command(document: GovernanceDocumentV3, body: Omit<GovernanceCommandV2, 'commandId' | 'reason'> | Record<string, unknown>) {
  return applyGovernanceCommandV3(document, { ...body, commandId: crypto.randomUUID(), reason: 'RD explicit business appointment' } as GovernanceCommandV2, 'verified-administrator').document
}
function publish(document: GovernanceDocumentV3): GovernanceDocumentV3 {
  const { basePolicyVersionId: _base, updatedAt: _at, ...policy } = document.draft
  const payload = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: [], effectState: 'not-synchronized' as const,
    organizationSnapshot: { workspaceVersionId: 'current', workspaceRevision: 'r1', capturedAt: at, employees: [], departments: [], organizationRoles: [], positions: [], assignments: [] } }
  const version: GovernanceAssignmentVersionV3 = { ...payload, id: crypto.randomUUID(), versionNumber: document.publishedVersions.length + 1, publishedAt: at,
    publishedByPrincipalId: 'verified-administrator', publishReason: 'RD publish', snapshotHash: publicationSnapshotHash(payload) }
  return { ...document, activePolicyVersionId: version.id, publishedVersions: [...document.publishedVersions, version] }
}
function seed() { return publish(migrateGovernanceV2ToV3(createSeedDocumentV2(at), 'fixture')) }
function appointed(document: GovernanceDocumentV3, scope: { kind: 'global' } | { kind: 'department'; value: string } = { kind: 'global' }) {
  document = command(document, { type: 'UPSERT_PERMISSION', value: { ...permission } })
  document = command(document, { type: 'UPSERT_APPLICATION_ROLE', value: { id: 'reviewer', applicationId: 'orgmaster', code: 'duty_reviewer', name: '職掌盤點主管', status: 'active', systemDefined: false } })
  document = command(document, { type: 'SET_ROLE_PERMISSION_GRANT', value: { id: 'review-grant', roleId: 'reviewer', permissionId: permission.id, effect: 'allow' } })
  return command(document, { type: 'UPSERT_ROLE_ASSIGNMENT', value: { id: 'appointment', applicationId: 'orgmaster', employeeId: actor.employeeId,
    roleId: 'reviewer', roleCodeSnapshot: 'duty_reviewer', roleNameSnapshot: '職掌盤點主管', catalogVersion: null, scope, status: 'active', validFrom: at, validTo: null, effectState: 'orgmaster-enforced' } })
}
describe('explicit OrgMaster business permission registration', () => {
  it('keeps business actions separate from frozen seed/admin permissions', async () => {
    const frozen = JSON.parse(await readFile(new URL('../contracts/orgmaster-administration-bootstrap/v1/source-seed.json', import.meta.url), 'utf8'))
    expect(ORGMASTER_PERMISSIONS).toEqual(frozen.permissions)
    expect(ORGMASTER_PERMISSIONS).toHaveLength(15)
    expect(ORGMASTER_BUSINESS_PERMISSIONS).toHaveLength(1)
    const document = seed()
    expect(document.draft.permissions).not.toContainEqual(permission)
    expect(document.draft.rolePermissionGrants.some(value => value.permissionId === permission.id)).toBe(false)
    expect(syncOrgMasterSystemCatalog(document)).toBe(document)
  })
  it('keeps frontend projection v1 compatible with exactly the original 15 keys', () => {
    const legacy = { contractVersion: 'orgmaster.frontend-permission-projection.v1', applicationId: 'orgmaster', principalId: actor.principalId,
      generatedAt: at, governanceRevision: 'revision', management: { crossAppOverride: false },
      permissions: Object.fromEntries(ORGMASTER_PERMISSIONS.map(value => [value.code, true])) }
    expect(isOrgMasterPermissionProjection(legacy, actor.principalId)).toBe(true)
    expect(isOrgMasterPermissionProjection({ ...legacy, permissions: { ...legacy.permissions, [permission.code]: true } }, actor.principalId)).toBe(false)
    expect(legacy.permissions).not.toHaveProperty(permission.code)
  })
  it('requires registration, grant, employee appointment and publication, and preserves the administrative definition', () => {
    const initial = seed()
    const adminGrants = initial.draft.rolePermissionGrants
    const draft = appointed(initial)
    expect(evaluateVerifiedPrincipalPermission(draft, actor, permission.code).status).toBe('denied')
    expect(draft.draft.roleAssignments[0]).toMatchObject({ basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, scope: { kind: 'global' } })
    const published = publish(draft)
    expect(evaluateVerifiedPrincipalPermission(published, actor, permission.code).status).toBe('allowed')
    expect(published.draft.rolePermissionGrants.filter(value => value.roleId === 'role-orgmaster-admin')).toEqual(adminGrants)
    const revoked = command(published, { type: 'REVOKE_ROLE_ASSIGNMENT', id: 'appointment' })
    expect(evaluateVerifiedPrincipalPermission(publish(revoked), actor, permission.code).status).toBe('denied')
    expect(initial.publishedVersions).toHaveLength(1)
  })
  it('rejects department-only appointments and never infers a review grant from admin or a job title', () => {
    expect(evaluateVerifiedPrincipalPermission(publish(appointed(seed(), { kind: 'department', value: 'department-1' })), actor, permission.code).status).toBe('denied')
    expect(evaluateVerifiedPrincipalPermission(seed(), actor, permission.code).status).toBe('denied')
  })
  it.each([{ id: 'alias' }, { risk: 'high' }, { kind: 'system' }, { code: 'orgmaster.other' }])('rejects a changed source-owned business definition %j', override => {
    expect(() => command(seed(), { type: 'UPSERT_PERMISSION', value: { ...permission, ...override } })).toThrowError(expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code: 'BUSINESS_PERMISSION_CATALOG_CONFLICT' })]) }))
  })
  it('refuses adding business capability to the protected admin profile even before initialization', () => {
    const document = command(seed(), { type: 'UPSERT_PERMISSION', value: { ...permission } })
    expect(() => command(document, { type: 'SET_ROLE_PERMISSION_GRANT', value: { id: 'admin-review', roleId: 'role-orgmaster-admin', permissionId: permission.id, effect: 'allow' } })).toThrowError(expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code: 'PROTECTED_ADMINISTRATIVE_CAPABILITY' })]) }))
  })
})
