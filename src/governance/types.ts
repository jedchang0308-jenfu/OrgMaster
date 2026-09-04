export type GovernanceRecordStatus = 'active' | 'inactive'
export type GovernancePermissionKind = 'page' | 'action' | 'system'
export type GovernancePermissionEffect = 'allow' | 'deny'
export type GovernanceRisk = 'normal' | 'high' | 'critical'
export type GovernanceScopeV1 =
  | { kind: 'global' }
  | { kind: 'workspace' | 'department' | 'project' | 'product'; value: string }

export type PositionRolePolicyStatusV1 = 'draft' | 'active' | 'retired'
export type PositionRolePolicyScopeSourceV1 = 'jenfu_workspace' | 'fixed_project'
export type RecommendationDecisionStateV1 = 'dismissed' | 'accepted'
export type PositionRoleRecommendationStateV1 = 'ready' | 'scope_conflict' | 'dismissed' | 'already_assigned'

export interface GovernanceApplicationV1 {
  id: 'orgmaster' | 'ai-pdm' | 'financial-management-system'
  name: string
  status: GovernanceRecordStatus
}
export interface GovernanceIdentityLinkV1 {
  id: string
  principalId: string
  issuer: string
  subject: string
  employeeId: string
  status: GovernanceRecordStatus
  validFrom: string
  validTo: string | null
}
export interface GovernanceApplicationRoleV1 {
  id: string
  applicationId: GovernanceApplicationV1['id']
  code: string
  name: string
  status: GovernanceRecordStatus
  systemDefined: boolean
}
export interface GovernancePermissionV1 {
  id: string
  applicationId: GovernanceApplicationV1['id']
  kind: GovernancePermissionKind
  code: string
  name: string
  risk: GovernanceRisk
  status: GovernanceRecordStatus
}
export interface GovernanceRolePermissionGrantV1 {
  id: string
  roleId: string
  permissionId: string
  effect: GovernancePermissionEffect
}
export interface GovernanceRoleAssignmentV1 {
  id: string
  employeeId: string
  roleId: string
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
}
export interface GovernanceDelegationV1 {
  id: string
  applicationId: GovernanceApplicationV1['id']
  fromEmployeeId: string
  toEmployeeId: string
  permissionIds: string[]
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string
  reason: string
}
export type GovernanceReviewerSelectorV1 =
  | { kind: 'application_role'; roleId: string }
  | { kind: 'organization_role'; organizationRoleId: string }
  | { kind: 'direct_supervisor' }
  | { kind: 'employee'; employeeId: string }
export interface GovernanceApprovalPolicyV1 {
  id: string
  applicationId: 'ai-pdm'
  actionCode: string
  name: string
  scope: GovernanceScopeV1
  reviewerSelectors: GovernanceReviewerSelectorV1[]
  quorum: number
  sequence: 'parallel'
  selfApproval: 'deny'
  unresolvedBehavior: 'deny'
  status: GovernanceRecordStatus
  validFrom: string
  validTo: string | null
}
export interface GovernanceOrganizationSnapshotV1 {
  workspaceVersionId: string
  workspaceRevision: string
  capturedAt: string
  employees: Array<{ id: string; primaryAssignmentId: string | null }>
  departments: Array<{ id: string; parentId: string | null }>
  organizationRoles: Array<{ id: string }>
  positions: Array<{ id: string; roleId: string; departmentId: string | null; parentPositionId: string | null; status: 'active' | 'inactive' }>
  assignments: Array<{ id: string; employeeId: string; positionId: string; assignmentType: 'regular' | 'acting'; validFrom: string; validTo: string | null }>
}
export interface GovernancePolicyDataV1 {
  applications: GovernanceApplicationV1[]
  identityLinks: GovernanceIdentityLinkV1[]
  applicationRoles: GovernanceApplicationRoleV1[]
  permissions: GovernancePermissionV1[]
  rolePermissionGrants: GovernanceRolePermissionGrantV1[]
  roleAssignments: GovernanceRoleAssignmentV1[]
  delegations: GovernanceDelegationV1[]
  approvalPolicies: GovernanceApprovalPolicyV1[]
}
export interface GovernanceDraftV1 extends GovernancePolicyDataV1 {
  basePolicyVersionId: string | null
  updatedAt: string
}
export interface GovernancePolicyVersionV1 {
  id: string
  versionNumber: number
  publishedAt: string
  publishedByPrincipalId: string
  publishReason: string
  snapshotHash: string
  policy: GovernancePolicyDataV1
  organizationSnapshot: GovernanceOrganizationSnapshotV1
}
export interface GovernanceAuditEventV1 {
  id: string
  commandId: string
  commandHash: string
  occurredAt: string
  actorPrincipalId: string
  action: string
  entityType: string
  entityId: string | null
  reason: string
  beforeHash: string | null
  afterHash: string | null
  previousEventHash: string | null
  eventHash: string
}
export interface GovernanceDocumentV1 {
  app: 'OrgMaster'
  schemaVersion: 1
  draft: GovernanceDraftV1
  activePolicyVersionId: string | null
  publishedVersions: GovernancePolicyVersionV1[]
  auditEvents: GovernanceAuditEventV1[]
}

export type GovernanceVersionKind = 'legacy-policy-v1' | 'assignment-governance-v2' | 'assignment-governance-v3'
export type AssignmentEffectState = 'orgmaster-enforced' | 'not-synchronized'
export type ExternalRoleCatalogState = 'valid' | 'stale' | 'invalid' | 'unavailable'
export type ExternalRoleCatalogSourceKind = 'bundled-fixture'

export type PrincipalAccountTypeV1 = 'human_personal' | 'human_privileged' | 'legacy_shared' | 'service'
export type SharedRetirementStateV1 = 'not_applicable' | 'pending_replacement' | 'replacement_verified' | 'login_disabled' | 'retired'
export interface GovernancePrincipalAdmissionV1 {
  id: string
  principalFingerprintSha256: string
  issuerFingerprintSha256: string
  accountType: PrincipalAccountTypeV1
  identityLinkId: string | null
  sharedRetirementState: SharedRetirementStateV1
  status: GovernanceRecordStatus
  recordedAt: string
  evidenceRefSha256: string
}

export interface ExternalRoleCatalogRoleV1 {
  stableRoleId: string
  code: string
  displayName: string
  status: GovernanceRecordStatus
  assignable: boolean
  riskLevel: GovernanceRisk
  allowedScopeKinds: GovernanceScopeV1['kind'][]
  subjectKind?: 'employee' | 'principal'
  recommendationAllowed?: boolean
  delegationAllowed?: boolean
  assignmentTier?: 'app_admin' | 'cross_app_override'
  unassignableReason?: 'INTEGRATION_METADATA_REQUIRED'
}

export interface ExternalRoleCatalogSnapshotV1 {
  applicationId: 'ai-pdm' | 'financial-management-system'
  catalogVersion: string
  sourceKind: ExternalRoleCatalogSourceKind
  sourceRefs: Array<{ path: string; range: string; sha256: string }>
  capturedAt: string
  payloadHash: string
  catalogSha256?: string
  validationState: ExternalRoleCatalogState
  effectState: 'not-synchronized'
  roles: ExternalRoleCatalogRoleV1[]
}

export interface GovernanceRoleAssignmentV2 {
  id: string
  employeeId: string
  applicationId: 'orgmaster' | 'ai-pdm' | 'financial-management-system'
  roleId: string
  roleCodeSnapshot: string
  roleNameSnapshot: string
  catalogVersion: string | null
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
  effectState: AssignmentEffectState
}

export interface GovernanceRoleDelegationV2 {
  id: string
  sourceAssignmentId: string
  fromEmployeeId: string
  toEmployeeId: string
  applicationId: 'ai-pdm'
  roleId: string
  catalogVersion: string
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string
  reason: string
  effectState: 'not-synchronized'
}

export interface GovernancePolicyDataV2 {
  applications: GovernanceApplicationV1[]
  identityLinks: GovernanceIdentityLinkV1[]
  applicationRoles: GovernanceApplicationRoleV1[]
  permissions: GovernancePermissionV1[]
  rolePermissionGrants: GovernanceRolePermissionGrantV1[]
  roleAssignments: GovernanceRoleAssignmentV2[]
  roleDelegations: GovernanceRoleDelegationV2[]
  principalAdmissions?: GovernancePrincipalAdmissionV1[]
}

export interface GovernanceAssignmentVersionV2 {
  kind: 'assignment-governance-v2'
  id: string
  versionNumber: number
  publishedAt: string
  publishedByPrincipalId: string
  publishReason: string
  snapshotHash: string
  effectState: 'not-synchronized'
  policy: GovernancePolicyDataV2
  externalRoleCatalogs: ExternalRoleCatalogSnapshotV1[]
  organizationSnapshot: GovernanceOrganizationSnapshotV1
}

export type GovernancePublishedVersionV2 = (GovernancePolicyVersionV1 & { kind: 'legacy-policy-v1' }) | GovernanceAssignmentVersionV2

export interface GovernanceMigrationStateV2 {
  sourceSchemaVersion: 1 | null
  sourceRevision: string | null
  migratedAt: string | null
  legacyDraftHash: string | null
  removedExternalDraftCounts: { roles: number; permissions: number; grants: number; approvalPolicies: number }
  unresolvedAssignments: Array<{ value: GovernanceRoleAssignmentV1; reason: string }>
  unresolvedDelegations: Array<{ value: GovernanceDelegationV1; reason: 'PERMISSION_DELEGATION_NOT_MIGRATABLE' }>
}

export interface GovernanceDocumentV2 {
  app: 'OrgMaster'
  schemaVersion: 2
  draft: GovernancePolicyDataV2 & { basePolicyVersionId: string | null; updatedAt: string }
  activePolicyVersionId: string | null
  publishedVersions: GovernancePublishedVersionV2[]
  auditEvents: GovernanceAuditEventV1[]
  migration: GovernanceMigrationStateV2
}

export interface PositionRolePolicyV1 {
  id: string
  version: number
  applicationId: 'ai-pdm'
  positionId: string
  stableRoleId: string
  catalogVersion: string
  defaultScopeSource: PositionRolePolicyScopeSourceV1
  fixedScopeKey: string | null
  status: PositionRolePolicyStatusV1
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  reason: string
}

export interface RecommendationDecisionV1 {
  recommendationId: string
  decision: RecommendationDecisionStateV1
  actorPrincipalId: string
  reason: string
  decidedAt: string
}

export interface ApplicationPositionAdoptionV1 {
  id: string
  version: number
  applicationId: 'ai-pdm' | 'financial-management-system'
  stableRoleId: string
  positionId: string
  status: 'active' | 'retired'
  recommendationVersionAtPublish: number | null
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  reason: string
}

export interface ManagementGrantV1 {
  id: string
  principalId: string
  employeeId: string
  applicationId: 'ai-pdm' | 'financial-management-system'
  capability: 'orgmaster.position_role_recommendation.manage' | 'ai-pdm.position_adoption.manage' | 'ai-pdm.role_assignment.manage' | 'ai-pdm.role_assignment.publish' | 'financial-management-system.role_assignment.manage' | 'financial-management-system.role_assignment.publish' | 'orgmaster.cross_app_override' | 'platform.entitlement_authority.switch'
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
  grantedByPrincipalId: string
  reason: string
}

export interface GovernanceRoleAssignmentV3 {
  id: string
  employeeId: string
  applicationId: 'orgmaster' | 'ai-pdm' | 'financial-management-system'
  roleId: string
  roleCodeSnapshot: string
  roleNameSnapshot: string
  catalogVersion: string | null
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
  effectState: AssignmentEffectState
  basis: 'manual' | 'position_adoption'
  subjectKind: 'employee' | 'principal'
  targetPrincipalId: string | null
  sources: Array<{
    positionId: string
    positionAssignmentId: string
    positionRolePolicyId: string
    positionRolePolicyVersion: number
    organizationVersionId: string
    organizationRevision: string
    scopeSource: PositionRolePolicyScopeSourceV1
    scopeKeySnapshot: string | null
  }>
  metadata: {
    sponsorEmployeeId: string | null
    reviewDueAt: string | null
  }
  createdByPrincipalId: string
  createdReason: string
}

export interface GovernancePolicyDataV3 extends Omit<GovernancePolicyDataV2, 'roleAssignments'> {
  roleAssignments: GovernanceRoleAssignmentV3[]
  positionRolePolicies: PositionRolePolicyV1[]
  applicationPositionAdoptions: ApplicationPositionAdoptionV1[]
  managementGrants: ManagementGrantV1[]
}

export interface GovernanceMigrationStateV3 extends Omit<GovernanceMigrationStateV2, 'sourceSchemaVersion'> {
  sourceSchemaVersion: 2
}

export interface GovernanceAuditEventV3 extends GovernanceAuditEventV1 {
  detail?: {
    targetPrincipalAdmissionId: string
    employeeId: string
    applicationId: 'ai-pdm'
    stableRoleId: 'role-system-admin'
    scope: { kind: 'global' }
    requestHash: string
    previewHash: string
    catalogVersion: string
    catalogPayloadHash: string
    organizationRevision: string
    governanceRevisionBefore: string
    assuranceLevel: 'aal2'
    authenticatedAt: string
    sessionReference: string
  }
}

export interface GovernanceAssignmentVersionV3 {
  kind: 'assignment-governance-v3'
  id: string
  versionNumber: number
  publishedAt: string
  publishedByPrincipalId: string
  publishReason: string
  snapshotHash: string
  effectState: 'not-synchronized'
  policy: GovernancePolicyDataV3
  externalRoleCatalogs: ExternalRoleCatalogSnapshotV1[]
  organizationSnapshot: GovernanceOrganizationSnapshotV1
}

export interface GovernanceDocumentV3 {
  app: 'OrgMaster'
  schemaVersion: 3
  draft: GovernancePolicyDataV3 & { basePolicyVersionId: string | null; updatedAt: string }
  activePolicyVersionId: string | null
  publishedVersions: Array<GovernanceAssignmentVersionV3 | GovernancePublishedVersionV2>
  auditEvents: GovernanceAuditEventV3[]
  migration: GovernanceMigrationStateV3
  securityAlertIntents: SecurityAlertIntentV1[]
  sessionInvalidationOutbox: SessionInvalidationIntentV1[]
  commandReceipts: GovernanceCommandReceiptV2[]
}

export interface SecurityAlertIntentV1 {
  id: string
  commandId: string
  operation: 'grant_system_admin' | 'revoke_system_admin'
  actorPrincipalId: string
  employeeId: string
  targetHint: string
  auditReference: string
  reasonSha256: string
  status: 'pending' | 'delivered' | 'failed'
  createdAt: string
}

export interface SessionInvalidationIntentV1 {
  id: string
  commandId: string
  targetPrincipalId: string
  reason: 'privileged_assignment_changed'
  status: 'pending' | 'completed'
  createdAt: string
}

export interface GovernanceCommandReceiptV2 {
  contractVersion: 'orgmaster.governance-command-receipt.v2'
  commandId: string
  requestHash: string
  previewHash: string
  receiptStatus: 'processing' | 'applied' | 'rejected' | 'not_found'
  acceptedAt: string | null
  terminalAt: string | null
  decisionCode: string | null
  auditReference: string | null
  securityAlertReference: string | null
  sessionRefresh: 'completed' | 'pending'
  governanceRevision: string
  replayed: boolean
  attempt: number
}

export type GovernanceCommandV2 =
  | Extract<GovernanceCommand, { type: 'UPSERT_IDENTITY_LINK' | 'SET_IDENTITY_LINK_STATUS' | 'UPSERT_APPLICATION_ROLE' | 'SET_APPLICATION_ROLE_STATUS' | 'UPSERT_PERMISSION' | 'SET_PERMISSION_STATUS' | 'SET_ROLE_PERMISSION_GRANT' | 'REMOVE_ROLE_PERMISSION_GRANT' }>
  | { type: 'UPSERT_ROLE_ASSIGNMENT'; commandId: string; reason: string; value: GovernanceRoleAssignmentV2 }
  | { type: 'REVOKE_ROLE_ASSIGNMENT'; commandId: string; reason: string; id: string }
  | { type: 'UPSERT_ROLE_DELEGATION'; commandId: string; reason: string; value: GovernanceRoleDelegationV2 }
  | { type: 'REVOKE_ROLE_DELEGATION'; commandId: string; reason: string; id: string }
  | { type: 'UPSERT_PRINCIPAL_ADMISSION'; commandId: string; reason: string; value: GovernancePrincipalAdmissionV1 }
  | { type: 'SET_PRINCIPAL_ADMISSION_STATUS'; commandId: string; reason: string; id: string; status: GovernanceRecordStatus }
export type GovernanceCommandV3 =
  | Exclude<GovernanceCommandV2, { type: 'UPSERT_ROLE_ASSIGNMENT' }>
  | { type: 'UPSERT_ROLE_ASSIGNMENT'; commandId: string; reason: string; value: GovernanceRoleAssignmentV3 }
export interface GovernanceActorContext {
  principalId: string
  issuer: string
  subject: string
  employeeId: string | null
  bootstrap: boolean
  assuranceLevel?: 'aal1' | 'aal2'
  authenticatedAt?: string | null
  sessionId?: string
}
export interface GovernanceRevisionResult { revision: string; document: GovernanceDocumentV1 }

export interface PermissionEvaluationRequestV1 {
  applicationId: 'orgmaster' | 'ai-pdm'
  issuer: string
  subject: string
  permissionCode: string
  scope: GovernanceScopeV1
  asOf?: string
}
export interface PermissionEvaluationResultV1 {
  status: 'allowed' | 'denied'
  reason: string
  receiptId: string
  policyVersionId: string | null
  policySnapshotHash: string | null
  organizationVersionId: string | null
  organizationRevision: string | null
  principalId: string | null
  matchedRoleIds: string[]
  delegationId: string | null
  evaluatedAt: string
  timeSource: 'server' | 'local-simulator'
}
export interface ReviewerResolutionRequestV1 {
  applicationId: 'ai-pdm'
  actionCode: string
  requestor: { issuer: string; subject: string }
  scope: GovernanceScopeV1
  asOf?: string
}
export interface ReviewerResolutionResultV1 {
  status: 'resolved' | 'unresolved'
  reason: string
  receiptId: string
  policyVersionId: string | null
  policySnapshotHash: string | null
  organizationVersionId: string | null
  organizationRevision: string | null
  requestorPrincipalId: string | null
  reviewerPrincipalIds: string[]
  delegationIds: string[]
  quorum: number | null
  sequence: 'parallel' | null
  evaluatedAt: string
  timeSource: 'server' | 'local-simulator'
}

export type GovernanceCommand =
  | { type: 'UPSERT_IDENTITY_LINK'; commandId: string; reason: string; value: GovernanceIdentityLinkV1 }
  | { type: 'SET_IDENTITY_LINK_STATUS'; commandId: string; reason: string; id: string; status: GovernanceRecordStatus }
  | { type: 'UPSERT_APPLICATION_ROLE'; commandId: string; reason: string; value: GovernanceApplicationRoleV1 }
  | { type: 'SET_APPLICATION_ROLE_STATUS'; commandId: string; reason: string; id: string; status: GovernanceRecordStatus }
  | { type: 'UPSERT_PERMISSION'; commandId: string; reason: string; value: GovernancePermissionV1 }
  | { type: 'SET_PERMISSION_STATUS'; commandId: string; reason: string; id: string; status: GovernanceRecordStatus }
  | { type: 'SET_ROLE_PERMISSION_GRANT'; commandId: string; reason: string; value: GovernanceRolePermissionGrantV1 }
  | { type: 'REMOVE_ROLE_PERMISSION_GRANT'; commandId: string; reason: string; roleId: string; permissionId: string }
  | { type: 'UPSERT_ROLE_ASSIGNMENT'; commandId: string; reason: string; value: GovernanceRoleAssignmentV1 }
  | { type: 'REVOKE_ROLE_ASSIGNMENT'; commandId: string; reason: string; id: string }
  | { type: 'UPSERT_DELEGATION'; commandId: string; reason: string; value: GovernanceDelegationV1 }
  | { type: 'REVOKE_DELEGATION'; commandId: string; reason: string; id: string }
  | { type: 'UPSERT_APPROVAL_POLICY'; commandId: string; reason: string; value: GovernanceApprovalPolicyV1 }
  | { type: 'SET_APPROVAL_POLICY_STATUS'; commandId: string; reason: string; id: string; status: GovernanceRecordStatus }

export interface GovernanceOrgSource {
  workspaceVersionId: string
  workspaceRevision: string
  sourceDataAt?: string
  state: {
    employees: Array<{ id: string; primaryAssignmentId: string | null; status?: 'active' | 'inactive' }>
    departments: Array<{ id: string; parentId: string | null }>
    roles: Array<{ id: string }>
    positions: GovernanceOrganizationSnapshotV1['positions']
    assignments: GovernanceOrganizationSnapshotV1['assignments']
  }
}
