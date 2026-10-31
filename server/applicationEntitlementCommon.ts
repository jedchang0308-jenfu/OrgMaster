import { randomUUID } from 'node:crypto'
import { buildOrganizationSnapshot, isActiveAt } from '../src/governance/validation'
import { canonicalJson, sha256, GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { currentPublishedPolicyV3 } from '../src/governance/evaluatePermission'
import { hasCrossAppOverride } from '../src/governance/privilegedAssignments'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceAssignmentVersionV3, GovernanceDocumentV3, GovernanceOrgSource, GovernancePolicyDataV3, GovernanceRoleAssignmentV3, ManagementGrantV1 } from '../src/governance/types'

export const FINANCIAL_APPLICATION_ID = 'financial-management-system' as const
export const FINANCIAL_ROLE_ASSIGNMENT_MANAGE = 'financial-management-system.role_assignment.manage' as const
export const FINANCIAL_ROLE_ASSIGNMENT_PUBLISH = 'financial-management-system.role_assignment.publish' as const
export const FINANCIAL_PROTECTED_OPERATIONS = [
  'financial-management-system.catalog.read',
  'financial-management-system.catalog.edit',
  'financial-management-system.catalog.publish',
  'financial-management-system.catalog.import',
  'financial-management-system.catalog.activate',
  'financial-management-system.workflow.read',
  'financial-management-system.workflow.edit',
  'financial-management-system.workflow.publish',
  'financial-management-system.workflow.activate',
  'financial-management-system.workflow.reassign',
] as const
export type FinancialManagementCapability = typeof FINANCIAL_ROLE_ASSIGNMENT_MANAGE | typeof FINANCIAL_ROLE_ASSIGNMENT_PUBLISH | typeof FINANCIAL_PROTECTED_OPERATIONS[number]

export type FinancialApplicationErrorCode =
  | 'FINANCIAL_CATALOG_UNAVAILABLE' | 'FINANCIAL_CATALOG_INVALID' | 'FINANCIAL_CATALOG_VERSION_CONFLICT' | 'CATALOG_REGISTRY_UNAVAILABLE'
  | 'IDENTITY_REQUIRED' | 'APP_MANAGEMENT_GRANT_REQUIRED' | 'APP_PUBLISH_GRANT_REQUIRED' | 'PRIVILEGED_ADMIN_REQUIRED'
  | 'EMPLOYEE_NOT_FOUND' | 'PRINCIPAL_NOT_FOUND' | 'ROLE_NOT_FOUND' | 'COMMAND_NOT_FOUND'
  | 'GOVERNANCE_REVISION_CONFLICT' | 'ORGANIZATION_REVISION_CONFLICT' | 'CATALOG_BINDING_CONFLICT'
  | 'PREVIEW_HASH_CONFLICT' | 'REQUEST_HASH_CONFLICT' | 'COMMAND_ID_CONFLICT' | 'INVALID_COMMAND'
  | 'UNSUPPORTED_SUBJECT' | 'UNSUPPORTED_SCOPE' | 'INVALID_VALIDITY' | 'CATALOG_INCOMPATIBLE'
  | 'SELF_GRANT_FORBIDDEN' | 'GOVERNANCE_CONTINUITY_REQUIRED' | 'DUPLICATE_ACTIVE_ASSIGNMENT'
  | 'ASSIGNMENT_NOT_FOUND' | 'COMMAND_NOT_OBSERVED'
  | 'INITIAL_AUTHORITY_ALREADY_EXISTS' | 'INITIAL_AUTHORITY_TARGET_INVALID' | 'INITIAL_AUTHORITY_ROLE_SET_INVALID'

export class ApplicationEntitlementError extends Error {
  constructor(readonly code: FinancialApplicationErrorCode, readonly details?: unknown) {
    super(code)
    this.name = 'ApplicationEntitlementError'
  }
}

export type CatalogBinding = {
  applicationId: typeof FINANCIAL_APPLICATION_ID
  catalogVersion: string
  catalogSha256: string
}

export type FinancialRoleAssignmentInput = {
  operation: 'upsert' | 'revoke'
  employeeId: string
  stableRoleId?: string
  assignmentId?: string
  scope: { kind: 'workspace'; value: string }
  validFrom: string
  validUntil: string | null
  reason: string
  expectedCatalogVersion: string
  expectedCatalogPayloadHash: string
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
}

export type FinancialRoleAssignmentPublishInput = FinancialRoleAssignmentInput & {
  commandId: string
  requestHash: string
  previewHash: string
}

export type FinancialManagementGrantOperation = {
  operation: 'upsert' | 'revoke'
  principalId: string
  employeeId: string
  capabilities: FinancialManagementCapability[]
  validFrom: string
  validUntil: string | null
  reason: string
}

export type FinancialManagementGrantInput = {
  operations: FinancialManagementGrantOperation[]
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
}

export type FinancialManagementGrantPublishInput = FinancialManagementGrantInput & {
  commandId: string
  requestHash: string
  previewHash: string
}

export function catalogBinding(catalog: ExternalRoleCatalogSnapshotV1): CatalogBinding {
  return { applicationId: FINANCIAL_APPLICATION_ID, catalogVersion: catalog.catalogVersion, catalogSha256: catalog.catalogSha256 ?? catalog.payloadHash }
}

export function assertExpectedCatalog(input: FinancialRoleAssignmentInput, binding: CatalogBinding) {
  if (input.expectedCatalogVersion !== binding.catalogVersion || input.expectedCatalogPayloadHash !== binding.catalogSha256) throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
}

export function assertExpectedRevisions(input: { expectedGovernanceRevision: string; expectedOrganizationRevision: string }, governanceRevision: string, organizationRevision: string) {
  if (input.expectedGovernanceRevision !== governanceRevision) throw new ApplicationEntitlementError('GOVERNANCE_REVISION_CONFLICT')
  if (input.expectedOrganizationRevision !== organizationRevision) throw new ApplicationEntitlementError('ORGANIZATION_REVISION_CONFLICT')
}

export function activeIdentityLink(document: GovernanceDocumentV3, actor: GovernanceActorContext, at = new Date().toISOString()) {
  return document.draft.identityLinks.find((link) => link.principalId === actor.principalId && link.employeeId === actor.employeeId && link.issuer === actor.issuer && link.subject === actor.subject && isActiveAt(link.status, link.validFrom, link.validTo, at)) ?? null
}

export function hasFinancialOwnerRole(document: GovernanceDocumentV3, actor: GovernanceActorContext, at = new Date().toISOString()) {
  const policy = currentPublishedPolicyV3(document)
  if (!actor.principalId || !actor.employeeId || !policy) return false
  return policy.roleAssignments.some((assignment) => assignment.applicationId === FINANCIAL_APPLICATION_ID && assignment.employeeId === actor.employeeId && assignment.roleId === 'role-owner' && assignment.status === 'active' && assignment.subjectKind === 'employee' && assignment.scope.kind === 'workspace' && assignment.scope.value === 'company-jenfu' && isActiveAt(assignment.status, assignment.validFrom, assignment.validTo, at))
}

export function hasFinancialManagementGrant(document: GovernanceDocumentV3, actor: GovernanceActorContext, capability: FinancialManagementCapability, at = new Date().toISOString()) {
  const policy = currentPublishedPolicyV3(document)
  if (!actor.principalId || !actor.employeeId || !policy) return false
  return policy.managementGrants.some((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID && grant.principalId === actor.principalId && grant.employeeId === actor.employeeId && grant.capability === capability && isActiveAt(grant.status, grant.validFrom, grant.validTo, at))
}

export function assertFinancialAuthority(document: GovernanceDocumentV3, actor: GovernanceActorContext, capability: FinancialManagementCapability, at = new Date().toISOString()) {
  if (!actor.employeeId) throw new ApplicationEntitlementError('IDENTITY_REQUIRED')
  if (!hasFinancialOwnerRole(document, actor, at)) throw new ApplicationEntitlementError('APP_MANAGEMENT_GRANT_REQUIRED')
  if (!hasFinancialManagementGrant(document, actor, capability, at)) throw new ApplicationEntitlementError(capability === FINANCIAL_ROLE_ASSIGNMENT_PUBLISH ? 'APP_PUBLISH_GRANT_REQUIRED' : 'APP_MANAGEMENT_GRANT_REQUIRED')
}

export function assertPrivilegedAdmin(document: GovernanceDocumentV3, actor: GovernanceActorContext, at = new Date().toISOString()) {
  if (!hasCrossAppOverride(document, actor, at)) throw new ApplicationEntitlementError('PRIVILEGED_ADMIN_REQUIRED')
}

export function policyFromDraft(document: GovernanceDocumentV3): GovernancePolicyDataV3 {
  const { basePolicyVersionId: _basePolicyVersionId, updatedAt: _updatedAt, ...policy } = document.draft
  return policy
}

export function publishFinancialPolicy(document: GovernanceDocumentV3, nextDraft: GovernanceDocumentV3['draft'], catalogs: ExternalRoleCatalogSnapshotV1[], source: GovernanceOrgSource, actor: GovernanceActorContext, reason: string, at: string) {
  const policy = policyFromDraft({ ...document, draft: nextDraft })
  const versionPayload = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: catalogs, organizationSnapshot: buildOrganizationSnapshot(source, at), effectState: 'not-synchronized' as const }
  const version: GovernanceAssignmentVersionV3 = {
    ...versionPayload,
    id: `assignment-policy-${randomUUID()}`,
    versionNumber: document.publishedVersions.length + 1,
    publishedAt: at,
    publishedByPrincipalId: actor.principalId,
    publishReason: reason.trim(),
    hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT,
    snapshotHash: publicationSnapshotHash(versionPayload),
  }
  return {
    ...document,
    activePolicyVersionId: version.id,
    publishedVersions: [...document.publishedVersions, version],
    draft: { ...nextDraft, basePolicyVersionId: version.id },
  }
}

export function commandRequestHash(value: unknown) { return sha256(canonicalJson(value)) }
export function previewHash(value: unknown) { return sha256(canonicalJson(value)) }

export function activeFinancialGrants(document: GovernanceDocumentV3, at = new Date().toISOString()) {
  return document.draft.managementGrants.filter((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID && isActiveAt(grant.status, grant.validFrom, grant.validTo, at))
}

export function grantKey(grant: Pick<ManagementGrantV1, 'principalId' | 'employeeId' | 'applicationId' | 'capability'>) {
  return `${grant.principalId}|${grant.employeeId}|${grant.applicationId}|${grant.capability}`
}

export function isActiveEmployee(source: GovernanceOrgSource, employeeId: string) {
  return source.state.employees.some((employee) => employee.id === employeeId && (employee as { status?: string }).status !== 'inactive')
}
