import { beforeAll, describe, expect, it } from 'vitest'
import vectors from '../config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json'
import { decodeDynamicAiPdmRoleCatalog } from './aiPdmDynamicRoleCatalog'
import { readPublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import { applyGovernanceCommandV3 } from '../src/governance/commands'
import { createAiPdmRoleCatalog, validateExternalRoleCatalog } from '../src/governance/aiPdmCatalog'
import { buildPositionRoleRecommendations } from '../src/governance/positionRoleRecommendations'
import {
  applyPrivilegedAssignment,
  buildPrivilegedPreview,
  hasCrossAppOverride,
  privilegedAssignmentWorkspace,
  type PrivilegedAssignmentRequest,
} from '../src/governance/privilegedAssignments'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { validatePolicyDataV3 } from '../src/governance/validation'
import { GovernanceValidationError } from '../src/governance/validation'
import { assertDynamicCatalogBinding } from './orgmasterGovernanceStore'
import type {
  ExternalRoleCatalogSnapshotV1,
  ExternalRoleCatalogRoleV1,
  GovernanceActorContext,
  GovernanceIdentityLinkV1,
  GovernancePrincipalAdmissionV1,
  GovernanceRoleAssignmentV2,
} from '../src/governance/types'

const vector = vectors[2]
const now = '2026-10-19T12:00:00.000Z'
const employeeId = 'employee-1'
const workspaceKey = 'company-jenfu'

let baselineV7: ExternalRoleCatalogSnapshotV1
let dynamicV7: ExternalRoleCatalogSnapshotV1

/** Rows projected from the checked-in source-produced vector, without a database. */
function projection(): Record<string, unknown>[] {
  const policy = vector.policy
  return policy.roles.map((role, index) => ({
    contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm',
    catalog_version: policy.candidateCatalogVersion, catalog_sha256: policy.contentHash,
    published_at: vector.publishedAt, display_order: index,
    stable_role_id: role.stableRoleId, role_code: role.roleCode, display_name: role.displayName,
    assignable: role.assignable, risk: role.risk, subject_kind: role.subjectKind,
    recommendation_allowed: role.recommendationAllowed, delegation_allowed: role.delegationAllowed,
    allowed_scope_kinds: role.allowedScopeKinds, assignment_tier: role.assignmentTier,
    metadata: role.metadata, permissions: role.permissions, role_definition_hash: role.roleDefinitionHash,
    role_status: role.roleStatus, lifecycle: 'active', publication_format: policy.format,
    canonicalization_version: 'jenfu.canonical-json.v1', role_schema_id: policy.roleSchemaId,
    role_profile_schema_id: policy.roleProfileSchemaId,
    baseline_role_identity_hash: policy.baselineRoleIdentityHash, role_identity_hash: policy.roleIdentityHash,
    registry_hash: policy.registryHash, protected_policy_hash: policy.protectedPolicyHash,
    activation_generation: vector.activationGeneration, role_profile_hash: policy.roleProfileHash,
    permission_role_id: policy.roleProfiles[index].permissionRoleId,
    presentation_name: policy.roleProfiles[index].presentationName,
    presentation_order: policy.roleProfiles[index].presentationOrder,
    assignment_disposition: policy.roleProfiles[index].assignmentDisposition,
  }))
}

beforeAll(async () => {
  const baselineArtifact = await readPublishedAiPdmRoleCatalog(process.cwd(), vector.baselineCatalogVersion)
  baselineV7 = createAiPdmRoleCatalog('valid', baselineArtifact.publishedAt, baselineArtifact)
  const artifact = decodeDynamicAiPdmRoleCatalog(projection(), [baselineArtifact])
  dynamicV7 = createAiPdmRoleCatalog('valid', artifact.publishedAt, artifact)
})

function role(catalog: ExternalRoleCatalogSnapshotV1, stableRoleId: string): ExternalRoleCatalogRoleV1 {
  const found = catalog.roles.find((candidate) => candidate.stableRoleId === stableRoleId)
  if (!found) throw new Error(`missing role: ${stableRoleId}`)
  return found
}

function assignmentValue(
  catalog: ExternalRoleCatalogSnapshotV1,
  selectedRole: ExternalRoleCatalogRoleV1,
  status: 'active' | 'revoked' = 'active',
  id = 'fixture-assignment',
): GovernanceRoleAssignmentV2 {
  return {
    id, employeeId, applicationId: 'ai-pdm', roleId: selectedRole.stableRoleId,
    roleCodeSnapshot: selectedRole.code, roleNameSnapshot: selectedRole.displayName,
    catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace', value: workspaceKey },
    status, validFrom: '2026-10-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized',
  }
}

function v3DocumentWithAssignment(
  catalog: ExternalRoleCatalogSnapshotV1,
  selectedRole: ExternalRoleCatalogRoleV1,
  status: 'active' | 'revoked' = 'active',
) {
  const v2 = createSeedDocumentV2(now)
  v2.draft.roleAssignments.push(assignmentValue(catalog, selectedRole, status))
  return migrateGovernanceV2ToV3(v2, 'dynamic-role-fixture', catalog, now)
}

function expectGovernanceCode(action: () => unknown, code: string) {
  expect(action).toThrowError(expect.objectContaining({
    issues: expect.arrayContaining([expect.objectContaining({ code })]),
  }))
}

function recommendationInput(catalog: ExternalRoleCatalogSnapshotV1, stableRoleId: string) {
  return {
    employeeId,
    organization: {
      workspaceVersionId: 'organization-v1', workspaceRevision: 'organization-r1', capturedAt: now,
      employees: [{ id: employeeId, primaryAssignmentId: 'position-assignment-1' }],
      departments: [], organizationRoles: [],
      positions: [{ id: 'position-1', roleId: 'org-role-1', departmentId: null, parentPositionId: null, status: 'active' as const }],
      assignments: [{ id: 'position-assignment-1', employeeId, positionId: 'position-1', assignmentType: 'regular' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }],
    },
    policies: [{ id: 'position-policy-1', version: 1, applicationId: 'ai-pdm' as const, positionId: 'position-1', stableRoleId,
      catalogVersion: catalog.catalogVersion, defaultScopeSource: 'jenfu_workspace' as const, fixedScopeKey: null,
      status: 'active' as const, createdAt: now, createdBy: 'principal-admin', updatedAt: now, updatedBy: 'principal-admin', reason: 'fixture' }],
    catalog, workspaceKey,
  }
}

describe('DEV-058 dynamic catalog assignment consumer', () => {
  it('requires the exact current tuple for dynamic grants and restores', () => {
    const expected = { catalogVersion: dynamicV7.catalogVersion, catalogSha256: dynamicV7.catalogSha256!, activationGeneration: dynamicV7.activationGeneration! }
    expect(() => assertDynamicCatalogBinding(dynamicV7, { expectedCatalog: expected })).not.toThrow()
    expect(() => assertDynamicCatalogBinding(dynamicV7, {})).toThrowError(expect.objectContaining({ code: 'EXTERNAL_CATALOG_VERSION_CONFLICT' }))
    expect(() => assertDynamicCatalogBinding(dynamicV7, { expectedCatalog: { ...expected, activationGeneration: '999' } })).toThrowError(expect.objectContaining({ code: 'EXTERNAL_CATALOG_VERSION_CONFLICT' }))
    expect(() => assertDynamicCatalogBinding(baselineV7, {})).not.toThrow()
  })
  it('allows an active selectable custom role to be newly assigned and a revoked assignment to be restored', () => {
    const custom = role(dynamicV7, 'role-custom-30000000-0000-4000-8000-000000000001')
    expect(custom).toMatchObject({ status: 'active', assignable: true, assignmentDisposition: 'selectable' })

    const empty = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'empty-fixture', baselineV7, now)
    const create = applyGovernanceCommandV3(empty, {
      type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'custom-create', reason: 'fixture',
      value: assignmentValue(dynamicV7, custom, 'active', 'custom-new'),
    }, 'principal-fixture', undefined, [dynamicV7])
    expect(create.document.draft.roleAssignments).toHaveLength(1)
    expect(create.document.draft.roleAssignments[0]).toMatchObject({
      id: 'custom-new', roleId: custom.stableRoleId, catalogVersion: dynamicV7.catalogVersion, status: 'active',
    })

    const revoked = v3DocumentWithAssignment(dynamicV7, custom, 'revoked')
    const restore = applyGovernanceCommandV3(revoked, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'custom-restore', reason: 'fixture', id: 'fixture-assignment',
    }, 'principal-fixture', undefined, [dynamicV7])
    expect(restore.document.draft.roleAssignments[0]).toMatchObject({
      id: 'fixture-assignment', roleId: custom.stableRoleId, status: 'active',
    })
  })

  it('keeps a legacy-only planning assignment valid and revocable, but blocks new or restored grants', () => {
    const legacyPlanning = role(baselineV7, 'role-production-planning')
    const currentPlanning = role(dynamicV7, 'role-production-planning')
    expect(currentPlanning).toMatchObject({ assignmentDisposition: 'legacy-only', permissionRoleId: 'role-procurement' })
    // Operation context is current-first; later entries are immutable history.
    const catalogs = [dynamicV7, baselineV7]
    const existing = v3DocumentWithAssignment(baselineV7, legacyPlanning)
    expect(validatePolicyDataV3(existing.draft, undefined, catalogs)).toEqual([])

    const revoked = applyGovernanceCommandV3(existing, {
      type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'legacy-planning-revoke', reason: 'fixture', id: 'fixture-assignment',
    }, 'principal-fixture', undefined, catalogs)
    expect(revoked.document.draft.roleAssignments[0]).toMatchObject({ id: 'fixture-assignment', status: 'revoked' })

    const createDocument = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'empty-fixture', baselineV7, now)
    expectGovernanceCode(() => applyGovernanceCommandV3(createDocument, {
      type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'legacy-planning-create', reason: 'fixture',
      value: assignmentValue(dynamicV7, currentPlanning, 'active', 'legacy-planning-new'),
    }, 'principal-fixture', undefined, catalogs), 'EXTERNAL_ROLE_UNASSIGNABLE')
    expectGovernanceCode(() => applyGovernanceCommandV3(revoked.document, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'legacy-planning-restore', reason: 'fixture', id: 'fixture-assignment',
    }, 'principal-fixture', undefined, catalogs), 'EXTERNAL_ROLE_UNASSIGNABLE')
  })

  it('retains an inactive custom role assignment in valid history and permits revocation', () => {
    const custom = role(dynamicV7, 'role-custom-30000000-0000-4000-8000-000000000001')
    const inactiveCatalog = structuredClone(dynamicV7)
    inactiveCatalog.roles.find((candidate) => candidate.stableRoleId === custom.stableRoleId)!.status = 'inactive'
    expect(validateExternalRoleCatalog(inactiveCatalog)).toEqual([])

    const existing = v3DocumentWithAssignment(dynamicV7, custom)
    expect(validatePolicyDataV3(existing.draft, undefined, [inactiveCatalog])).toEqual([])

    const revoke = applyGovernanceCommandV3(existing, {
      type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'inactive-custom-revoke', reason: 'fixture', id: 'fixture-assignment',
    }, 'principal-fixture', undefined, [inactiveCatalog])
    expect(revoke.document.draft.roleAssignments[0]).toMatchObject({ id: 'fixture-assignment', status: 'revoked' })
  })

  it('blocks new, restored, and recommended assignments for an inactive role', () => {
    const custom = role(dynamicV7, 'role-custom-30000000-0000-4000-8000-000000000001')
    const inactiveCatalog = structuredClone(dynamicV7)
    inactiveCatalog.roles.find((candidate) => candidate.stableRoleId === custom.stableRoleId)!.status = 'inactive'
    const inactiveCustom = role(inactiveCatalog, custom.stableRoleId)

    const empty = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'empty-fixture', baselineV7, now)
    expectGovernanceCode(() => applyGovernanceCommandV3(empty, {
      type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'inactive-custom-create', reason: 'fixture',
      value: assignmentValue(inactiveCatalog, inactiveCustom, 'active', 'inactive-new'),
    }, 'principal-fixture', undefined, [inactiveCatalog]), 'EXTERNAL_ROLE_UNASSIGNABLE')

    const revoked = v3DocumentWithAssignment(dynamicV7, custom, 'revoked')
    expectGovernanceCode(() => applyGovernanceCommandV3(revoked, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'inactive-custom-restore', reason: 'fixture', id: 'fixture-assignment',
    }, 'principal-fixture', undefined, [inactiveCatalog]), 'EXTERNAL_ROLE_UNASSIGNABLE')
    expect(buildPositionRoleRecommendations(recommendationInput(inactiveCatalog, custom.stableRoleId))).toEqual([])
  })

  it('keeps system_admin on its existing exact-principal global flow, outside generic assignment', () => {
    const actor: GovernanceActorContext = {
      principalId: 'principal-override', issuer: 'issuer-fixture', subject: 'subject-override', employeeId: 'employee-a', bootstrap: false,
    }
    const targetLink: GovernanceIdentityLinkV1 = {
      id: 'link-target', principalId: 'principal-target', issuer: 'issuer-fixture', subject: 'subject-target',
      employeeId: 'employee-b', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    }
    const actorLink: GovernanceIdentityLinkV1 = {
      id: 'link-override', principalId: actor.principalId, issuer: actor.issuer, subject: actor.subject,
      employeeId: actor.employeeId!, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    }
    const admission = (id: string, identityLinkId: string): GovernancePrincipalAdmissionV1 => ({
      id, identityLinkId, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable',
      principalFingerprintSha256: 'a'.repeat(64), issuerFingerprintSha256: 'b'.repeat(64),
      evidenceRefSha256: 'c'.repeat(64), recordedAt: now,
    })
    const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'protected-fixture', baselineV7, now)
    document.draft.identityLinks = [actorLink, targetLink]
    document.draft.principalAdmissions = [admission('admission-override', actorLink.id), admission('admission-target', targetLink.id)]
    document.draft.managementGrants = [{
      id: 'grant-override', principalId: actor.principalId, employeeId: actor.employeeId!, applicationId: 'ai-pdm',
      capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null, grantedByPrincipalId: 'principal-bootstrap', reason: 'fixture',
    }]
    const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
    document.publishedVersions.push({
      kind: 'assignment-governance-v3', id: 'published-fixture', versionNumber: 1, publishedAt: now,
      publishedByPrincipalId: actor.principalId, publishReason: 'fixture', snapshotHash: 'fixture',
      effectState: 'not-synchronized', policy,
      externalRoleCatalogs: [dynamicV7],
      organizationSnapshot: {
        workspaceVersionId: 'organization-v1', workspaceRevision: 'organization-r1', capturedAt: now,
        employees: [{ id: 'employee-a', primaryAssignmentId: null }, { id: 'employee-b', primaryAssignmentId: null }],
        departments: [], organizationRoles: [], positions: [], assignments: [],
      },
    })
    document.activePolicyVersionId = 'published-fixture'

    const source = {
      workspaceVersionId: 'organization-v1', workspaceRevision: 'organization-r1', sourceDataAt: now,
      state: { employees: [{ id: 'employee-a', primaryAssignmentId: null }, { id: 'employee-b', primaryAssignmentId: null }], departments: [], roles: [], positions: [], assignments: [] },
    }
    const request: PrivilegedAssignmentRequest = {
      operation: 'grant_system_admin', employeeId: 'employee-b', principalAdmissionId: 'admission-target',
      applicationId: 'ai-pdm', stableRoleId: 'role-system-admin', reason: 'fixture grant',
      expected: { catalogVersion: dynamicV7.catalogVersion, catalogPayloadHash: dynamicV7.payloadHash,
        governanceRevision: 'governance-r1', organizationRevision: 'organization-r1' },
    }
    expect(hasCrossAppOverride(document, actor, now)).toBe(true)
    expect(privilegedAssignmentWorkspace(document, source, dynamicV7, 'governance-r1', actor, now).mutationAllowed).toBe(true)
    const preview = buildPrivilegedPreview(document, actor, request, now)
    expect(preview).toMatchObject({ beforeHolderCount: 0, afterHolderCount: 1, securityAlertRequired: true, noOp: false })
    const applied = applyPrivilegedAssignment(document, dynamicV7, actor, request, now)
    expect(applied.status).toBe('applied')
    expect(applied.document.draft.roleAssignments[0]).toMatchObject({
      roleId: 'role-system-admin', subjectKind: 'principal', targetPrincipalId: 'principal-target', scope: { kind: 'global' },
    })

    const generic = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'generic-protected-fixture', baselineV7, now)
    const protectedRole = role(dynamicV7, 'role-system-admin')
    expect(protectedRole.assignmentDisposition).toBe('hidden-protected')
    expect(() => applyGovernanceCommandV3(generic, {
      type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'generic-system-admin', reason: 'fixture',
      value: assignmentValue(dynamicV7, protectedRole, 'active', 'generic-system-admin'),
    }, 'principal-fixture', undefined, [dynamicV7])).toThrow(GovernanceValidationError)
    expect(generic.draft.roleAssignments).toEqual([])
  })
})
