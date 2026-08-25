export type GovernanceRecordStatus = 'active' | 'inactive'
export type GovernancePermissionKind = 'page' | 'action' | 'system'
export type GovernancePermissionEffect = 'allow' | 'deny'
export type GovernanceRisk = 'normal' | 'high'
export type GovernanceScopeV1 =
  | { kind: 'global' }
  | { kind: 'workspace' | 'department' | 'project' | 'product'; value: string }

export interface GovernanceApplicationV1 {
  id: 'orgmaster' | 'ai-pdm'
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
export interface GovernanceActorContext {
  principalId: string
  issuer: string
  subject: string
  employeeId: string | null
  bootstrap: boolean
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
  state: {
    employees: Array<{ id: string; primaryAssignmentId: string | null }>
    departments: Array<{ id: string; parentId: string | null }>
    roles: Array<{ id: string }>
    positions: GovernanceOrganizationSnapshotV1['positions']
    assignments: GovernanceOrganizationSnapshotV1['assignments']
  }
}
