export type EmployeeNumberErrorCode =
  | 'EMPLOYEE_NUMBER_INVALID'
  | 'EMPLOYEE_NUMBER_REQUIRED'
  | 'EMPLOYEE_NUMBER_CONFLICT'
  | 'EMPLOYEE_NUMBER_RETIRED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'IDENTITY_CONTEXT_REQUIRED'
  | 'IDENTITY_NUMBER_MANAGE_REQUIRED'
  | 'IDENTITY_LINK_REQUIRED'
  | 'CANDIDATE_INVALID'
  | 'CANDIDATE_EXPIRED'
  | 'CANDIDATE_CONSUMED'
  | 'DIRECTORY_CANDIDATE_NOT_FOUND'
  | 'DIRECTORY_CANDIDATE_MISMATCH'
  | 'DIRECTORY_USER_INELIGIBLE'
  | 'DIRECTORY_IDENTITY_CONFLICT'
  | 'DIRECTORY_READ_UNAVAILABLE'
  | 'DIRECTORY_SCOPE_INVALID'
  | 'AUTH_PROVIDER_REQUIRED'
  | 'AUTH_EMAIL_UNVERIFIED'
  | 'AUTH_IDENTITY_CONFLICT'
  | 'LOGIN_NOT_AVAILABLE'
  | 'DB_ADMISSION_DISABLED'
  | 'INVALIDATION_PENDING'
  | 'WORKSPACE_AUTHORITY_INVALID'
  | 'INVALIDATION_APPLICATION_UNREADY'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'MANAGED_PRIMARY_EMAIL_INVALID'
  | 'MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED'
  | 'HUMAN_PRIVILEGED_REQUIRED'

export type EmployeeNumberParseResult =
  | { ok: true; value: string }
  | { ok: false; code: 'EMPLOYEE_NUMBER_INVALID' }

export interface EmployeeNumberAssignmentV1 {
  employeeId: string
  employeeNumber: string
  revision: number
  assignedAt: string
  assignedBy: string
}

export interface EmployeeNumberTombstoneV1 {
  employeeNumber: string
  firstEmployeeId: string
  firstAssignedAt: string
  retiredAt: string | null
}

export interface ManagedIdentityRegistryV1 {
  revision: number
  assignments: EmployeeNumberAssignmentV1[]
  tombstones: EmployeeNumberTombstoneV1[]
}

export interface ManagedIdentityAuditEventV1 {
  id: string
  action:
    | 'employee_number_assigned'
    | 'employee_number_changed'
    | 'managed_identity_link_confirmed'
    | 'managed_identity_auth_bound'
    | 'managed_login_identity_verified'
    | 'managed_identity_refresh_enqueued'
    | 'managed_identity_refresh_completed'
    | 'managed_identity_refresh_failed'
    | 'managed_identity_quarantined'
    | 'managed_identity_admission_changed'
    | 'managed_identity_lifecycle_changed'
  employeeId: string
  employeeNumber: string
  previousEmployeeNumber: string | null
  actor: string
  occurredAt: string
  commandId?: string | null
  identityRecordId?: string | null
  beforeHash?: string | null
  afterHash?: string | null
  previousEventHash?: string | null
  eventHash?: string | null
  result?: 'applied' | 'noop' | 'rejected' | 'queued' | 'superseded' | 'conflict'
  reasonCode?: string | null
  details?: Record<string, unknown>
}

export type ManagedIdentityKind = 'human_daily_managed'
export type ManagedIdentityLinkState = 'directory_linked_pending_auth' | 'active' | 'conflict'
export type DirectoryState = 'missing' | 'present' | 'suspended' | 'archived' | 'unknown'
export type DirectoryAdapterOutcome = 'success' | 'not_found' | 'retryable_error' | 'permanent_error' | 'candidate_miss' | 'parse_error'

export interface ManagedDailyIdentityV1 {
  identityRecordId: string
  identityKind: ManagedIdentityKind
  employeeId: string
  principalId: string
  directoryCustomerId: string
  directoryUserId: string
  lastVerifiedPrimaryEmail: string
  authIssuer: string | null
  authSubject: string | null
  boundAt: string | null
  linkState: ManagedIdentityLinkState
  revision: number
  admissionRevision: number | null
  admissionChangedAt: string | null
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface ManagedIdentityObservationV1 {
  identityRecordId: string
  primaryEmail: string | null
  directoryState: DirectoryState
  sourceEtag: string | null
  lastAppliedRequestSequence: number
  adapterOutcome: DirectoryAdapterOutcome
  errorCode: string | null
  trustedObservedAt: string | null
  lastAttemptAt: string | null
  freshness: 'fresh' | 'stale' | 'unknown'
}

export interface ManagedIdentityCandidateLeaseV1 {
  leaseId: string
  tokenHashSha256: string
  actorBindingSha256: string
  employeeId: string
  employeeNumber: string
  expectedPrimaryEmail: string
  directoryCustomerId: string
  directoryUserId: string
  primaryEmail: string
  sourceEtag: string | null
  workspaceRevision: string | null
  registryRevision: string | null
  createdAt: string
  expiresAt: string
  invalidatedAt: string | null
  consumedAt: string | null
}

export interface ManagedIdentityCommandReceiptV1 {
  commandId: string
  requestHashSha256: string
  action: string
  employeeId: string
  identityRecordId: string | null
  responsePayload: Record<string, unknown>
  createdAt: string
}

export type ManagedIdentityRefreshState = 'queued' | 'leased' | 'completed' | 'retry' | 'dead'

export interface ManagedIdentityRefreshOutboxV1 {
  requestId: string
  identityRecordId: string
  trigger: 'manual' | 'periodic' | 'domain'
  state: ManagedIdentityRefreshState
  requestSequence: number
  attemptCount: number
  availableAt: string
  leaseVersion: number
  leaseWorkerId: string | null
  leaseUntil: string | null
  rerunRequested: boolean
  completionDisposition: 'applied' | 'superseded' | 'terminal' | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  lastErrorCode: string | null
}

export interface PrincipalIdentityReservationV1 {
  principalIssuer: string
  principalSubject: string
  employeeId: string
  firstSeenAt: string
  sourceKind: 'legacy' | 'managed'
  sourceRevision: string
}

export interface ManagedIdentityAdmissionAuthorityV1 {
  admissionEnabled: boolean
  revision: number
  updatedAt: string
  updatedBy: string
  reasonCode: string
}

export interface ManagedIdentityInvalidationApplicationV1 {
  applicationId: string
  status: 'active' | 'inactive'
  supportState: 'pending' | 'verified'
  supportRevision: number
  supportEvidenceRef: string | null
  supportVerifiedAt: string | null
  supportVerifiedBy: string | null
  sourceGovernanceVersionId: string | null
  updatedAt: string
}

export interface ManagedIdentityLifecycleEventV1 {
  operationId: string
  employeeId: string
  applicationId: string
  actor: string
  reasonCode: string
  state: 'queued' | 'leased' | 'completed' | 'retry' | 'dead'
  attemptCount: number
  availableAt: string
  createdAt: string
  updatedAt: string
}

export interface ManagedIdentityDocumentV1 {
  app: 'OrgMaster'
  schemaVersion: 1
  updatedAt: string
  registry: ManagedIdentityRegistryV1
  auditEvents: ManagedIdentityAuditEventV1[]
  managedDailyIdentities?: ManagedDailyIdentityV1[]
  observations?: ManagedIdentityObservationV1[]
  candidateLeases?: ManagedIdentityCandidateLeaseV1[]
  commandReceipts?: ManagedIdentityCommandReceiptV1[]
  refreshOutbox?: ManagedIdentityRefreshOutboxV1[]
  principalIdentityReservations?: PrincipalIdentityReservationV1[]
  admissionAuthority?: ManagedIdentityAdmissionAuthorityV1
  invalidationApplications?: ManagedIdentityInvalidationApplicationV1[]
  lifecycleEvents?: ManagedIdentityLifecycleEventV1[]
  directoryReadBudget?: string[]
  currentWorkspaceAuthority?: { workspaceVersionId: string; workspaceRevision: string; employeeIds: string[] } | null
  nextRefreshRequestSequence?: number
  nextAdmissionRevision?: number
}

export interface ManagedIdentityReadModelV1 {
  contractVersion: 'orgmaster.managed-identity.v1'
  managedDomain?: string
  employee: { id: string; status: 'active' | 'inactive' }
  employeeNumber: {
    status: 'unassigned' | 'assigned'
    value: string | null
    revision: number | null
  }
  identity: {
    state: 'not_linked' | 'directory_linked_pending_auth' | 'active' | 'conflict'
    provider: 'google.com'
    note: string
    directoryState?: DirectoryState
    primaryEmail?: string | null
    freshness?: 'fresh' | 'stale' | 'unknown'
  }
  capabilities: {
    view: true
    manageNumber: boolean
    manageLink?: boolean
    refresh?: boolean
  }
  registryRevision: string | null
  workspaceRevision?: string | null
  admissionEnabled?: boolean
}

export interface ManagedEmployeeNumberListItemV1 {
  employeeId: string
  employeeName: string
  employeeNumber: string
  status: 'active' | 'retired'
}

export interface ManagedEmployeeNumberListReadModelV1 {
  contractVersion: 'orgmaster.managed-identity-numbers.v1'
  items: ManagedEmployeeNumberListItemV1[]
  registryRevision: string | null
}

export interface AssignEmployeeNumberRequestV1 {
  commandId: string
  expectedRegistryRevision: string | null
  employeeNumber: string
  expectedWorkspaceRevision?: string | null
}

export interface ManagedIdentityCandidateResponseV1 {
  candidateToken: string
  expiresAt: string
  employee: { id: string; employeeNumber: string }
  directory: { primaryEmail: string }
  workspaceRevision: string | null
  registryRevision: string
}

export interface FindManagedIdentityCandidateRequestV1 {
  expectedWorkspaceRevision: string | null
  expectedRegistryRevision: string
  primaryEmail: string
}

export interface ConfirmManagedIdentityLinkRequestV1 {
  commandId: string
  candidateToken: string
  expectedWorkspaceRevision: string | null
  expectedRegistryRevision: string
}

export interface BindManagedIdentityAuthRequestV1 {
  idToken: string
}

export interface ResolveLoginAliasRequestV1 { employeeNumber: string }
export interface ResolveLoginAliasResponseV1 { provider: 'google.com'; loginHint: string; expiresAt: string }

export interface ManagedIdentityRefreshRequestV1 {
  commandId: string
  trigger: 'manual' | 'periodic' | 'domain'
}

export interface ManagedIdentityRefreshClaimV1 {
  claimKind: 'leased' | 'terminal_due'
  requestId: string
  identityRecordId: string
  employeeId: string
  directoryCustomerId: string
  directoryUserId: string
  requestSequence: number
  attemptCount: number
  leaseVersion: number
  leaseUntil: string | null
}

export interface ManagedIdentityRefreshResultV1 {
  disposition: 'applied' | 'superseded' | 'terminal'
  requestId: string
  identityRecordId: string
}
