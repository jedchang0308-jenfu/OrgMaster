import { canonicalJson, sha256 } from './commands'
import { AI_PDM_ROLE_CATALOG_ROLES, readAiPdmRoleCatalog, validateExternalRoleCatalog } from './aiPdmCatalog'
import type {
  ExternalRoleCatalogSnapshotV1,
  GovernanceDocumentV2,
  GovernanceDocumentV3,
  GovernanceRoleAssignmentV2,
  GovernanceRoleAssignmentV3,
  GovernancePolicyDataV3,
} from './types'

const SYSTEM_ADMIN_ROLE_ID = 'role-system-admin'

function isSystemAdmin(value: Pick<GovernanceRoleAssignmentV2, 'roleId' | 'roleCodeSnapshot'>) {
  return value.roleId === SYSTEM_ADMIN_ROLE_ID || value.roleCodeSnapshot === 'system_admin'
}

function migrationAssignment(value: GovernanceRoleAssignmentV2) {
  return {
    id: value.id,
    employeeId: value.employeeId,
    roleId: value.roleId,
    scope: value.scope,
    status: value.status === 'active' ? 'active' as const : 'revoked' as const,
    validFrom: value.validFrom,
    validTo: value.validTo,
  }
}

function mapAssignment(value: GovernanceRoleAssignmentV2, document: GovernanceDocumentV2, catalog: ExternalRoleCatalogSnapshotV1): GovernanceRoleAssignmentV3 | null {
  if (isSystemAdmin(value)) return null
  const internalRole = document.draft.applicationRoles.find((role) => role.id === value.roleId && role.applicationId === 'orgmaster')
  const externalRole = catalog.roles.find((role) => role.stableRoleId === value.roleId)
  if (!internalRole && !externalRole) return null
  if (externalRole && (externalRole.status !== 'active' || !externalRole.assignable || !externalRole.allowedScopeKinds.includes(value.scope.kind))) return null
  return {
    id: value.id,
    employeeId: value.employeeId,
    applicationId: value.applicationId,
    roleId: value.roleId,
    roleCodeSnapshot: internalRole?.code ?? externalRole!.code,
    roleNameSnapshot: internalRole?.name ?? externalRole!.displayName,
    catalogVersion: value.applicationId === 'ai-pdm' ? catalog.catalogVersion : null,
    scope: value.scope,
    status: value.status,
    validFrom: value.validFrom,
    validTo: value.validTo,
    effectState: value.effectState,
    basis: 'manual',
    subjectKind: 'employee',
    targetPrincipalId: null,
    sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: 'system:migrate-v2-to-v3',
    createdReason: 'V2 assignment 非破壞遷移至 V3',
  }
}

export function migrateGovernanceV2ToV3(
  document: GovernanceDocumentV2,
  sourceRevision: string,
  catalog = readAiPdmRoleCatalog(),
  migratedAt = new Date().toISOString(),
): GovernanceDocumentV3 {
  const catalogIssues = validateExternalRoleCatalog(catalog)
  const roleAssignments: GovernanceRoleAssignmentV3[] = []
  const unresolvedAssignments = [...document.migration.unresolvedAssignments]

  for (const assignment of document.draft.roleAssignments) {
    const mapped = mapAssignment(assignment, document, catalog)
    if (mapped) roleAssignments.push(mapped)
    else unresolvedAssignments.push({
      value: migrationAssignment(assignment),
      reason: isSystemAdmin(assignment)
        ? 'SYSTEM_ADMIN_PRINCIPAL_REQUIRED'
        : catalogIssues.length ? 'EXTERNAL_CATALOG_INVALID' : 'ASSIGNMENT_UNRESOLVED',
    })
  }

  const policy: GovernancePolicyDataV3 = {
    applications: document.draft.applications.map((value) => ({ ...value })),
    identityLinks: document.draft.identityLinks.map((value) => ({ ...value })),
    applicationRoles: document.draft.applicationRoles.filter((role) => role.applicationId === 'orgmaster').map((value) => ({ ...value })),
    permissions: document.draft.permissions.filter((permission) => permission.applicationId === 'orgmaster').map((value) => ({ ...value })),
    rolePermissionGrants: document.draft.rolePermissionGrants.filter((grant) => document.draft.applicationRoles.some((role) => role.applicationId === 'orgmaster' && role.id === grant.roleId) && document.draft.permissions.some((permission) => permission.applicationId === 'orgmaster' && permission.id === grant.permissionId)).map((value) => ({ ...value })),
    roleAssignments,
    roleDelegations: document.draft.roleDelegations.filter((delegation) => delegation.roleId !== SYSTEM_ADMIN_ROLE_ID).map((value) => ({ ...value })),
    principalAdmissions: (document.draft.principalAdmissions ?? []).map((value) => ({ ...value })),
    positionRolePolicies: [],
    applicationPositionAdoptions: [],
    managementGrants: [],
  }

  return {
    app: 'OrgMaster',
    schemaVersion: 3,
    draft: { ...policy, basePolicyVersionId: null, updatedAt: document.draft.updatedAt },
    activePolicyVersionId: null,
    publishedVersions: document.publishedVersions.map((version) => ({ ...version })),
    auditEvents: document.auditEvents.map((event) => ({ ...event })),
    migration: {
      sourceSchemaVersion: 2,
      sourceRevision,
      migratedAt,
      legacyDraftHash: sha256(canonicalJson(document.draft)),
      removedExternalDraftCounts: { ...document.migration.removedExternalDraftCounts },
      unresolvedAssignments,
      unresolvedDelegations: document.migration.unresolvedDelegations.map((value) => ({ ...value })),
    },
    securityAlertIntents: [],
    sessionInvalidationOutbox: [],
    commandReceipts: [],
  }
}

export function systemAdminCatalogRole(catalog = readAiPdmRoleCatalog()) {
  return catalog.roles.find((role) => role.stableRoleId === SYSTEM_ADMIN_ROLE_ID && role.code === 'system_admin') ?? AI_PDM_ROLE_CATALOG_ROLES.find((role) => role.stableRoleId === SYSTEM_ADMIN_ROLE_ID)
}
