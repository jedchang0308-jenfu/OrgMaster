import { sha256 } from './commands'
import { ORGMASTER_PERMISSIONS, readAiPdmRoleCatalog, validateExternalRoleCatalog } from './aiPdmCatalog'
import type {
  ExternalRoleCatalogSnapshotV1,
  GovernanceApplicationRoleV1,
  GovernanceDocumentV1,
  GovernanceDocumentV2,
  GovernancePolicyDataV2,
  GovernanceRoleAssignmentV1,
  GovernanceRoleAssignmentV2,
  GovernanceRoleDelegationV2,
} from './types'

function emptyMigration() {
  return {
    sourceSchemaVersion: null,
    sourceRevision: null,
    migratedAt: null,
    legacyDraftHash: null,
    removedExternalDraftCounts: { roles: 0, permissions: 0, grants: 0, approvalPolicies: 0 },
    unresolvedAssignments: [],
    unresolvedDelegations: [],
  }
}

function roleById(roles: GovernanceApplicationRoleV1[], roleId: string) { return roles.find((role) => role.id === roleId) }
function catalogRole(catalog: ExternalRoleCatalogSnapshotV1, roleId: string) { return catalog.roles.find((role) => role.stableRoleId === roleId) }
function isAllowed(catalogRoleValue: NonNullable<ReturnType<typeof catalogRole>>, scope: GovernanceRoleAssignmentV1['scope']) {
  return catalogRoleValue.allowedScopeKinds.includes(scope.kind)
}

function mapAssignment(value: GovernanceRoleAssignmentV1, roles: GovernanceApplicationRoleV1[], catalog: ExternalRoleCatalogSnapshotV1): { value?: GovernanceRoleAssignmentV2; reason?: string } {
  const role = roleById(roles, value.roleId)
  if (!role) return { reason: 'ROLE_NOT_FOUND' }
  if (role.applicationId === 'orgmaster') {
    return {
      value: {
        ...value,
        applicationId: 'orgmaster',
        roleCodeSnapshot: role.code,
        roleNameSnapshot: role.name,
        catalogVersion: null,
        effectState: 'orgmaster-enforced',
      },
    }
  }
  const external = catalogRole(catalog, value.roleId)
  if (!external) return { reason: 'EXTERNAL_ROLE_UNKNOWN' }
  if (external.status !== 'active') return { reason: 'EXTERNAL_ROLE_INACTIVE' }
  if (!external.assignable) return { reason: external.unassignableReason ?? 'EXTERNAL_ROLE_UNASSIGNABLE' }
  if (!isAllowed(external, value.scope)) return { reason: 'EXTERNAL_SCOPE_UNSUPPORTED' }
  return {
    value: {
      ...value,
      applicationId: 'ai-pdm',
      roleCodeSnapshot: external.code,
      roleNameSnapshot: external.displayName,
      catalogVersion: catalog.catalogVersion,
      effectState: 'not-synchronized',
    },
  }
}

export function createSeedDocumentV2(now = new Date().toISOString(), catalog = readAiPdmRoleCatalog()): GovernanceDocumentV2 {
  const internalRoles = [{ id: 'role-orgmaster-admin', applicationId: 'orgmaster' as const, code: 'orgmaster_admin', name: 'OrgMaster 管理者', status: 'active' as const, systemDefined: true }]
  const orgmasterPermissions = ORGMASTER_PERMISSIONS.map((permission) => ({ ...permission }))
  const policy: GovernancePolicyDataV2 = {
    applications: [{ id: 'orgmaster', name: 'OrgMaster', status: 'active' }, { id: 'ai-pdm', name: 'AI-PDM', status: 'active' }],
    identityLinks: [], applicationRoles: internalRoles, permissions: orgmasterPermissions,
    rolePermissionGrants: orgmasterPermissions.map((permission) => ({ id: `grant-orgmaster-admin-${permission.id}`, roleId: 'role-orgmaster-admin', permissionId: permission.id, effect: 'allow' as const })),
    roleAssignments: [], roleDelegations: [],
  }
  return { app: 'OrgMaster', schemaVersion: 2, draft: { ...policy, basePolicyVersionId: null, updatedAt: now }, activePolicyVersionId: null, publishedVersions: [], auditEvents: [], migration: { ...emptyMigration(), migratedAt: null }, }
}

export function migrateGovernanceV1ToV2(v1: GovernanceDocumentV1, sourceRevision: string, catalogs: ExternalRoleCatalogSnapshotV1[] = [readAiPdmRoleCatalog()], migratedAt = new Date().toISOString()): GovernanceDocumentV2 {
  const catalog = catalogs.find((entry) => entry.applicationId === 'ai-pdm') ?? readAiPdmRoleCatalog('unavailable')
  const catalogIssues = validateExternalRoleCatalog(catalog)
  const externalRoles = v1.draft.applicationRoles.filter((role) => role.applicationId === 'ai-pdm')
  const externalPermissions = v1.draft.permissions.filter((permission) => permission.applicationId === 'ai-pdm')
  const externalGrants = v1.draft.rolePermissionGrants.filter((grant) => externalRoles.some((role) => role.id === grant.roleId) || externalPermissions.some((permission) => permission.id === grant.permissionId))
  const unresolvedAssignments: GovernanceDocumentV2['migration']['unresolvedAssignments'] = []
  const mappedAssignments: GovernanceRoleAssignmentV2[] = []
  for (const assignment of v1.draft.roleAssignments) {
    const mapped = mapAssignment(assignment, v1.draft.applicationRoles, catalog)
    if (mapped.value) mappedAssignments.push(mapped.value)
    else unresolvedAssignments.push({ value: assignment, reason: catalogIssues.length ? 'EXTERNAL_CATALOG_INVALID' : mapped.reason ?? 'ASSIGNMENT_UNRESOLVED' })
  }
  const unresolvedDelegations: GovernanceDocumentV2['migration']['unresolvedDelegations'] = v1.draft.delegations.map((value) => ({ value, reason: 'PERMISSION_DELEGATION_NOT_MIGRATABLE' as const }))
  const policy: GovernancePolicyDataV2 = {
    applications: v1.draft.applications.map((value) => ({ ...value })),
    identityLinks: v1.draft.identityLinks.map((value) => ({ ...value })),
    applicationRoles: v1.draft.applicationRoles.filter((role) => role.applicationId === 'orgmaster').map((value) => ({ ...value })),
    permissions: v1.draft.permissions.filter((permission) => permission.applicationId === 'orgmaster').map((value) => ({ ...value })),
    rolePermissionGrants: v1.draft.rolePermissionGrants.filter((grant) => v1.draft.applicationRoles.some((role) => role.applicationId === 'orgmaster' && role.id === grant.roleId) && v1.draft.permissions.some((permission) => permission.applicationId === 'orgmaster' && permission.id === grant.permissionId)).map((value) => ({ ...value })),
    roleAssignments: mappedAssignments,
    roleDelegations: [],
  }
  return {
    app: 'OrgMaster', schemaVersion: 2,
    draft: { ...policy, basePolicyVersionId: v1.draft.basePolicyVersionId, updatedAt: v1.draft.updatedAt },
    activePolicyVersionId: v1.activePolicyVersionId,
    publishedVersions: v1.publishedVersions.map((version) => ({ ...version, kind: 'legacy-policy-v1' as const })),
    auditEvents: v1.auditEvents.map((event) => ({ ...event })),
    migration: {
      sourceSchemaVersion: 1, sourceRevision, migratedAt, legacyDraftHash: sha256(JSON.stringify(v1.draft)),
      removedExternalDraftCounts: { roles: externalRoles.length, permissions: externalPermissions.length, grants: externalGrants.length, approvalPolicies: v1.draft.approvalPolicies.length },
      unresolvedAssignments, unresolvedDelegations,
    },
  }
}
