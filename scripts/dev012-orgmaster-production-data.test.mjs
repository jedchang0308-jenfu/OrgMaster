import assert from 'node:assert/strict'
import test from 'node:test'

import { ORGMASTER_PRODUCTION_DATA, applyFirstPrincipalBootstrap, assertFirstPrincipalBootstrap, assertProductionDataPackage, buildFirstPrincipalBootstrap, canonicalize, sha256 } from './lib/dev012-orgmaster-production-data.mjs'

const H40 = 'a'.repeat(40)
const H64 = 'b'.repeat(64)
const NOW = '2026-09-08T01:00:00.000Z'
const releaseId = 'REL-ORG-001'
const identityEvidence = { schemaVersion: 'jenfu.dev012.firebase-identity-readback.v1', status: 'PASS', releaseAuthority: true, projectId: 'jenfu-platform-prod', uid: 'firebase-user-001', emailSha256: sha256('owner@example.com'), mfaEnrolled: false, assuranceLevel: 'aal1', totpProviderState: 'DISABLED' }
const input = { employeeId: 'employee-1', email: 'owner@example.com', firebaseUid: identityEvidence.uid, issuer: ORGMASTER_PRODUCTION_DATA.firebaseIssuer, identityEvidenceRef: { uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/identity.json', sha256: H64 }, authorizedBy: 'OWNER_EXPLICIT_DECISION' }

function catalogFixture() {
  return { contractVersion: 'jenfu.platform-entitlement.v1', applicationId: 'ai-pdm', catalogVersion: 'catalog-v1', catalogSha256: 'c'.repeat(64), publishedAt: NOW, roles: [{ stableRoleId: 'role-system-admin', roleCode: 'system_admin', displayName: 'System Admin', assignable: true, risk: 'critical', allowedScopeKinds: ['global'], subjectKind: 'principal', recommendationAllowed: false, delegationAllowed: false, assignmentTier: 'cross_app_override' }] }
}
function governance() {
  const audit = { id: 'audit-seed', commandId: 'seed', commandHash: sha256(JSON.stringify({ commandId: 'seed' })), occurredAt: NOW, actorPrincipalId: 'system', action: 'SEED', entityType: 'governance', entityId: null, reason: 'seed', beforeHash: null, afterHash: null, previousEventHash: null }
  audit.eventHash = sha256(JSON.stringify(audit))
  return { app: 'OrgMaster', schemaVersion: 3, draft: { applications: [{ id: 'orgmaster', status: 'active' }, { id: 'ai-pdm', status: 'active' }], identityLinks: [{ id: 'dev', principalId: 'dev', issuer: 'urn:orgmaster:dev', subject: 'local', employeeId: 'employee-1', status: 'active', validFrom: NOW, validTo: null }], applicationRoles: [{ id: 'role-orgmaster-admin', applicationId: 'orgmaster', code: 'orgmaster_admin', name: 'Org admin', status: 'active' }], permissions: [], rolePermissionGrants: [], roleAssignments: [], roleDelegations: [], principalAdmissions: [], positionRolePolicies: [], applicationPositionAdoptions: [], managementGrants: [], basePolicyVersionId: null, updatedAt: NOW }, activePolicyVersionId: null, publishedVersions: [], auditEvents: [audit], migration: { sourceSchemaVersion: 2, unresolvedAssignments: [], unresolvedDelegations: [] }, securityAlertIntents: [], sessionInvalidationOutbox: [], commandReceipts: [] }
}
const workspace = { state: { employees: [{ id: 'employee-1', status: 'active', primaryAssignmentId: null }], departments: [], roles: [], positions: [], assignments: [] } }

test('first-principal manifest requires an explicit employee and provider-proven password Firebase identity', () => {
  const value = buildFirstPrincipalBootstrap({ releaseId, sourceRevision: H40, employeeIds: new Set(['employee-1']), input, identityEvidence, observedAt: NOW })
  assert.equal(value.accountType, 'human_privileged')
  assert.equal(value.assuranceLevel, 'aal1')
  assert.equal('email' in value, false)
  assertFirstPrincipalBootstrap(value, { releaseId, sourceRevision: H40 })
  assert.throws(() => buildFirstPrincipalBootstrap({ releaseId, sourceRevision: H40, employeeIds: new Set(['employee-1']), input, identityEvidence: { ...identityEvidence, mfaEnrolled: true, assuranceLevel: 'aal2' }, observedAt: NOW }), /FIRST_PRINCIPAL_IDENTITY_EVIDENCE_INVALID/)
  assert.throws(() => buildFirstPrincipalBootstrap({ releaseId, sourceRevision: H40, employeeIds: new Set(['employee-1']), input: { ...input, email: 'not-an-email' }, identityEvidence, observedAt: NOW }), /FIRST_PRINCIPAL_INPUT_INVALID/)
  assert.throws(() => buildFirstPrincipalBootstrap({ releaseId, sourceRevision: H40, employeeIds: new Set(['employee-1']), input: { ...input, identityEvidenceRef: { uri: 'gs://another-bucket/receipts/identity.json', sha256: H64 } }, identityEvidence, observedAt: NOW }), /PRODUCTION_DATA_REF_INVALID/)
})

test('bootstrap produces exactly one admitted principal, two admin assignments and an active V3 policy', () => {
  const bootstrap = buildFirstPrincipalBootstrap({ releaseId, sourceRevision: H40, employeeIds: new Set(['employee-1']), input, identityEvidence, observedAt: NOW })
  const value = applyFirstPrincipalBootstrap({ governance: governance(), workspace, workspaceVersionId: 'current-1', workspaceRevision: H64, catalogFixture: catalogFixture(), bootstrap })
  assert.equal(value.activePolicyVersionId, value.publishedVersions[0].id)
  assert.equal(value.draft.identityLinks.length, 1)
  assert.equal(value.draft.principalAdmissions.length, 1)
  assert.deepEqual(value.draft.roleAssignments.map((row) => row.roleId).sort(), ['role-orgmaster-admin', 'role-system-admin'])
  assert.equal(value.draft.managementGrants[0].capability, 'orgmaster.cross_app_override')
})

test('package validator fails closed on data mutation and retains explicit preference disposition', () => {
  const core = { schemaVersion: ORGMASTER_PRODUCTION_DATA.packageSchema, ownerApplicationId: 'orgmaster', releaseId, sourceRevision: H40, sourceRepository: 'jedchang0308-jenfu/OrgMaster', dataRevision: H64, persistenceContract: 'jenfu.orgmaster-persistence.v1', bootstrapSha256: H64, artifactCount: 0, mediaCount: 0, preferenceCount: 1, sourceBytes: 0, dataClassCounts: {}, preferenceDisposition: 'EXCLUDED_UNATTRIBUTABLE_PRINCIPAL', safeManifest: { preferences: [{ disposition: 'EXCLUDED_UNATTRIBUTABLE_PRINCIPAL' }] }, artifacts: [], media: [], observedAt: NOW, status: 'READY' }
  const value = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${canonicalize(value)}\n`)
  assert.equal(assertProductionDataPackage(value, { bytes, releaseId, sourceRevision: H40, bootstrapSha256: H64 }), value)
  assert.throws(() => assertProductionDataPackage({ ...value, artifactCount: 1 }, { bytes, releaseId, sourceRevision: H40, bootstrapSha256: H64 }), /PRODUCTION_DATA_PACKAGE_HASH_INVALID|PRODUCTION_DATA_PACKAGE_COUNTS_INVALID/)
})
