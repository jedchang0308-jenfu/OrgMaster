export type AccountEnrollmentStatus =
  | 'requested' | 'dispatching' | 'pending_acceptance'
  | 'accepted_pending_link' | 'linked' | 'outcome_unknown'
  | 'expired' | 'failed' | 'cancelled' | 'conflict'

export type AccountEnrollmentReasonCode =
  | 'invite_requested' | 'provider_dispatch_started'
  | 'provider_pending_acceptance' | 'provider_accepted'
  | 'provider_outcome_unknown' | 'provider_rejected' | 'provider_unavailable'
  | 'employee_inactive' | 'invitation_expired' | 'operator_cancelled'
  | 'candidate_resolved' | 'candidate_token_expired' | 'account_already_exists'
  | 'identity_link_conflict' | 'governance_revision_conflict'
  | 'identity_link_applied' | 'identity_link_status_changed' | 'reconciliation_advanced'

export type EmployeeAccountAccessState =
  | 'empty' | 'ready' | 'in_progress' | 'attention' | 'inactive_only' | 'contract_mismatch'

export interface EmployeeAccountAccessViewV1 {
  contractVersion: 'orgmaster.employee-account-access.v1'
  employee: { id: string; status: 'active' | 'inactive' }
  state: EmployeeAccountAccessState
  deliveryMode: 'simulated' | 'unavailable'
  accounts: Array<{
    identityLinkId: string
    accountHint: string
    providerLabel: string
    accountType: 'human_personal' | 'human_privileged' | 'unclassified'
    status: 'active' | 'inactive'
    linkStatusMutable: boolean
  }>
  enrollments: Array<{
    id: string
    kind: 'invite_new' | 'link_existing'
    status: AccountEnrollmentStatus
    emailHint: string
    statusReasonCode: AccountEnrollmentReasonCode | null
    expiresAt: string | null
    revision: number
    actions: Array<'resend' | 'cancel'>
  }>
  capabilities: {
    view: true
    invite: boolean
    link: boolean
    manageInvitation: boolean
    manageLinkStatus: boolean
  }
  governanceRevision: string
}

export interface ExistingAccountCandidateViewV1 {
  contractVersion: 'orgmaster.existing-account-candidate.v1'
  candidateToken: string
  candidate: { emailHint: string; providerLabel: string; status: 'eligible' }
  expiresAt: string
}

export type AccountEnrollmentErrorCodeV1 =
  | 'IDENTITY_CONTEXT_REQUIRED' | 'IDENTITY_VIEW_REQUIRED' | 'IDENTITY_INVITE_REQUIRED'
  | 'IDENTITY_LINK_REQUIRED' | 'IDENTITY_INVITATION_MANAGE_REQUIRED' | 'GOVERNANCE_ADMIN_REQUIRED'
  | 'IDENTITY_ORIGIN_INVALID' | 'EMPLOYEE_NOT_FOUND' | 'EMPLOYEE_NOT_ACTIVE'
  | 'ACCOUNT_ENROLLMENT_NOT_FOUND' | 'IDENTITY_LINK_NOT_FOUND' | 'WORK_EMAIL_INVALID'
  | 'WORK_EMAIL_DOMAIN_NOT_ALLOWED' | 'ACCOUNT_ALREADY_EXISTS' | 'INVITATION_ALREADY_PENDING'
  | 'ACCOUNT_CANDIDATE_NOT_FOUND' | 'ACCOUNT_NOT_ELIGIBLE' | 'CANDIDATE_TOKEN_INVALID'
  | 'CANDIDATE_TOKEN_EXPIRED' | 'IDENTITY_LINK_CONFLICT' | 'IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN'
  | 'SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN' | 'INVITATION_STATE_INVALID' | 'PROVIDER_OUTCOME_UNKNOWN'
  | 'COMMAND_ID_REUSED' | 'ACCOUNT_ENROLLMENT_REVISION_CONFLICT' | 'ACCOUNT_ENROLLMENT_CONTRACT_MISMATCH'
  | 'IDENTITY_PROVISIONING_UNAVAILABLE' | 'REVISION_CONFLICT' | 'IDENTITY_ACCOUNT_FLOW_REQUIRED'
  | 'ACCOUNT_ENROLLMENT_STORE_INVALID' | 'ACCOUNT_ENROLLMENT_WRITE_FAILED' | 'GOVERNANCE_READ_FAILED'
  | 'INVALID_JSON' | 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'METHOD_NOT_ALLOWED' | 'ROUTE_NOT_FOUND'

export type AccountEnrollmentErrorBodyV1 = {
  error: AccountEnrollmentErrorCodeV1
  retryable?: boolean
  field?: 'email'
  conflictingEmployee?: { id: string; name: string }
}

export interface InviteAccountRequestV1 { commandId: string; employeeId: string; email: string }
export interface ExistingCandidateRequestV1 { employeeId: string; email: string }
export interface LinkExistingAccountRequestV1 { commandId: string; employeeId: string; candidateToken: string; expectedGovernanceRevision: string }
export interface ManageInvitationRequestV1 { commandId: string; enrollmentId: string; expectedEnrollmentRevision: number }
export interface SetIdentityLinkStatusRequestV1 { commandId: string; employeeId: string; identityLinkId: string; status: 'active' | 'inactive'; expectedGovernanceRevision: string }
export interface InviteAccountResultV1 { disposition: 'created' | 'replayed'; view: EmployeeAccountAccessViewV1 }

export interface EmployeeAccountEnrollmentV1 {
  id: string
  employeeId: string
  kind: 'invite_new' | 'link_existing'
  providerKey: 'local-deterministic'
  providerRequestKey: string | null
  targetEmail: string
  targetEmailHash: string
  targetEmailHint: string
  providerOperationRef: string | null
  status: AccountEnrollmentStatus
  statusReasonCode: AccountEnrollmentReasonCode | null
  candidateLeaseId: string | null
  identityLinkId: string | null
  createdByPrincipalId: string
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  revision: number
}

export interface AccountEnrollmentCommandReceiptV1 {
  commandId: string
  requestHash: string
  action: 'invite_new' | 'link_existing' | 'resend_invitation' | 'cancel_invitation'
  employeeId: string
  enrollmentId: string
  providerRequestKey: string | null
  createdAt: string
}

export interface ExistingAccountCandidateLeaseV1 {
  id: string; tokenHashSha256: string; actorBinding: string; employeeId: string
  providerKey: 'local-deterministic'; targetEmail: string; targetEmailHash: string
  targetEmailHint: string; issuer: string; subject: string; verified: true; active: true
  createdAt: string; expiresAt: string; consumedAt: string | null
}

export interface AccountEnrollmentAuditEventV1 {
  id: string; commandId: string; occurredAt: string; actorPrincipalId: string
  action: 'ENROLLMENT_REQUESTED' | 'PROVIDER_DISPATCH_STARTED' | 'PROVIDER_OUTCOME_OBSERVED'
    | 'CANDIDATE_LEASED' | 'IDENTITY_LINK_REQUESTED' | 'IDENTITY_LINK_APPLIED'
    | 'INVITATION_RESENT' | 'INVITATION_CANCELLED' | 'IDENTITY_LINK_STATUS_CHANGED'
    | 'RECONCILIATION_COMPLETED'
  enrollmentId: string | null; reasonCode: AccountEnrollmentReasonCode
  beforeHash: string | null; afterHash: string | null; previousEventHash: string | null; eventHash: string
}

export interface AccountEnrollmentDocumentV1 {
  app: 'OrgMaster'; schemaVersion: 1; updatedAt: string
  enrollments: EmployeeAccountEnrollmentV1[]
  commands: AccountEnrollmentCommandReceiptV1[]
  candidateLeases: ExistingAccountCandidateLeaseV1[]
  auditEvents: AccountEnrollmentAuditEventV1[]
}

export interface AccountEnrollmentStoreReadV1 { exists: boolean; raw: string | null; revision: string | null; document: AccountEnrollmentDocumentV1 }
