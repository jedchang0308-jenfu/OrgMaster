import type { ExternalRoleCatalogRoleV1, GovernanceApplicationRoleV1 } from './types'

export type AssignmentSurface = 'ordinary' | 'privileged_system_admin' | 'unsupported_principal_role'

export type AssignmentSurfaceRole = Partial<ExternalRoleCatalogRoleV1> & Pick<ExternalRoleCatalogRoleV1, 'stableRoleId' | 'code'>

const SYSTEM_ADMIN_ROLE_ID = 'role-system-admin'
const SYSTEM_ADMIN_ROLE_CODE = 'system_admin'
const ORDINARY_SCOPE_KINDS = new Set(['workspace', 'project', 'global'])

function isExactGlobalScope(value: ExternalRoleCatalogRoleV1['allowedScopeKinds'] | undefined) {
  return Array.isArray(value) && value.length === 1 && value[0] === 'global'
}

function hasCompleteOrdinaryPolicy(role: AssignmentSurfaceRole) {
  return role.status === 'active'
    && role.assignable === true
    && ['normal', 'high', 'critical'].includes(role.riskLevel ?? '')
    && role.subjectKind === 'employee'
    && role.assignmentTier === 'app_admin'
    && typeof role.recommendationAllowed === 'boolean'
    && typeof role.delegationAllowed === 'boolean'
    && Array.isArray(role.allowedScopeKinds)
    && role.allowedScopeKinds.length > 0
    && role.allowedScopeKinds.every((scope) => ORDINARY_SCOPE_KINDS.has(scope))
}

export function isSystemAdminRoleIdentity(role: Pick<AssignmentSurfaceRole, 'stableRoleId' | 'code'> | undefined) {
  return role?.stableRoleId === SYSTEM_ADMIN_ROLE_ID || role?.code === SYSTEM_ADMIN_ROLE_CODE
}

export function classifyAssignmentSurface(applicationId: string, role: AssignmentSurfaceRole | GovernanceApplicationRoleV1 | undefined): AssignmentSurface {
  if (!role) return 'unsupported_principal_role'
  if (applicationId !== 'ai-pdm') {
    if (applicationId === 'financial-management-system') return hasCompleteOrdinaryPolicy(role as AssignmentSurfaceRole) ? 'ordinary' : 'unsupported_principal_role'
    return role.status === 'active' ? 'ordinary' : 'unsupported_principal_role'
  }

  const externalRole = role as AssignmentSurfaceRole
  if (isSystemAdminRoleIdentity(externalRole)) {
    return externalRole.stableRoleId === SYSTEM_ADMIN_ROLE_ID
      && externalRole.code === SYSTEM_ADMIN_ROLE_CODE
      && externalRole.status === 'active'
      && externalRole.assignable === true
      && externalRole.riskLevel === 'critical'
      && externalRole.subjectKind === 'principal'
      && externalRole.assignmentTier === 'cross_app_override'
      && externalRole.recommendationAllowed === false
      && externalRole.delegationAllowed === false
      && isExactGlobalScope(externalRole.allowedScopeKinds)
      ? 'privileged_system_admin'
      : 'unsupported_principal_role'
  }

  return hasCompleteOrdinaryPolicy(externalRole) ? 'ordinary' : 'unsupported_principal_role'
}

export function genericV2AssignmentSurfaceIssue(
  applicationId: string,
  assignmentRole: Pick<AssignmentSurfaceRole, 'stableRoleId' | 'code'>,
  catalogRole?: AssignmentSurfaceRole,
) {
  if (applicationId !== 'ai-pdm' && applicationId !== 'financial-management-system') return null
  if (isSystemAdminRoleIdentity(assignmentRole) || isSystemAdminRoleIdentity(catalogRole)) return 'PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED' as const
  if (!catalogRole) return null
  const surface = classifyAssignmentSurface(applicationId, catalogRole)
  if (surface === 'ordinary') return null
  if (catalogRole.subjectKind === 'principal' || catalogRole.assignmentTier === 'cross_app_override') return 'PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED' as const
  return 'CATALOG_ROLE_CONTRACT_MISMATCH' as const
}
