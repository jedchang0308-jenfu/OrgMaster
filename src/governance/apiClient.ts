import type { GovernanceCommandV2, GovernanceDocumentV2, GovernanceRoleAssignmentV2, ExternalRoleCatalogSnapshotV1, GovernanceCommandReceiptV2 } from './types'
import type { PrivilegedAssignmentExpected, PrivilegedAssignmentRequest } from './privilegedAssignments'
import type { GovernanceDocumentViewV2 } from './governancePresentation'

export const GOVERNANCE_API_PATH = '/api/orgmaster/governance'
export type GovernanceVersionSummary = { id: string; kind: 'legacy-policy-v1' | 'assignment-governance-v2'; versionNumber: number; publishedAt: string; publishedByPrincipalId: string; publishReason: string; snapshotHash: string; organizationVersionId: string; effectState: string }
export type GovernanceApiSnapshot = { document: GovernanceDocumentViewV2; catalogs: ExternalRoleCatalogSnapshotV1[]; revision: string; activeVersionId: string | null; versions: GovernanceVersionSummary[] }
export type GovernanceSession = { runtimeMode: string; actor: { principalId: string; subjectHint: string }; capabilities: { manage: boolean; publish: boolean; simulate: boolean } }
export type PrivilegedAssignmentWorkspace = {
  contractVersion: 'orgmaster.privileged-assignment-workspace.v1'
  applicationId: 'ai-pdm'
  stableRoleId: 'role-system-admin'
  catalogVersion: string
  catalogPayloadHash: string
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  sourceDataAt: string
  mutationAllowed: boolean
  blockers: string[]
  role: {
    stableRoleId: 'role-system-admin'
    roleCode: 'system_admin'
    displayName: string
    status: 'active'
    assignable: true
    riskLevel: 'critical'
    subjectKind: 'principal'
    assignmentTier: 'cross_app_override'
    recommendationAllowed: false
    delegationAllowed: false
    allowedScopeKinds: ['global']
  } | null
  eligiblePrincipals: Array<{
    employeeId: string
    principalAdmissionId: string
    principalHint: string
    accountType: 'human_privileged'
    status: 'active'
  }>
  assignments: Array<{
    assignmentId: string
    employeeId: string
    principalAdmissionId: string
    principalHint: string
    status: 'active' | 'revoked'
    validFrom: string
    validTo: string | null
    auditReference: string
  }>
}
export type PrivilegedAssignmentOperationResponse = {
  contractVersion: 'orgmaster.privileged-assignment-operation.v1'
  phase: 'preview'
  operation: 'grant_system_admin' | 'revoke_system_admin'
  applicationId: 'ai-pdm'
  stableRoleId: 'role-system-admin'
  payload: { employeeId: string; principalAdmissionId: string } | { assignmentId: string }
  expected: PrivilegedAssignmentExpected
  reason: string
  requestHash: string
  preview: {
    previewHash: string
    beforeHolderCount: number
    afterHolderCount: number
    targetHint: string
    affectedSessionCount: number
    securityAlertRequired: true
  }
}
export class GovernanceApiError extends Error { constructor(public readonly code: string, public readonly status: number, public readonly issues?: unknown) { super(code) } }
const headers = { 'Content-Type': 'application/json', 'X-OrgMaster-Dev-Issuer': 'urn:orgmaster:dev', 'X-OrgMaster-Dev-Subject': 'local-admin' }
async function request<T>(path: string, init: RequestInit = {}) { const response = await fetch(`${GOVERNANCE_API_PATH}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new GovernanceApiError(payload.error ?? 'GOVERNANCE_REQUEST_FAILED', response.status, payload.issues); return { payload: payload as T, revision: response.headers.get('X-OrgMaster-Governance-Revision') ?? '' } }
export async function loadGovernance() { return request<GovernanceApiSnapshot>('/') }
export async function loadGovernanceSession() { return request<GovernanceSession>('/session') }
export async function linkCurrentGovernanceIdentity(revision: string, commandId: string, employeeId: string) { return request<{ status: string; document: GovernanceDocumentViewV2; revision: string }>('/identity-links/current', { method: 'POST', body: JSON.stringify({ expectedRevision: revision, commandId, employeeId }) }) }
export async function patchGovernanceDraft(revision: string, command: GovernanceCommandV2) { return request<{ status: string; document: GovernanceDocumentViewV2; revision: string }>('/draft', { method: 'PATCH', body: JSON.stringify({ expectedRevision: revision, command }) }) }
export async function validateGovernanceAssignment(value: Partial<GovernanceRoleAssignmentV2>) { return request<{ status: 'valid' | 'invalid'; issues: Array<{ code: string; path: string; message: string }>; catalogVersion: string; payloadHash: string; effectState: string; checkedAt: string }>('/validate/assignment', { method: 'POST', body: JSON.stringify(value) }) }
export async function publishGovernancePolicy(revision: string, commandId: string, reason: string, organizationVersionId: string) { return request<{ versionSummary: GovernanceVersionSummary; revision: string }>('/versions', { method: 'POST', body: JSON.stringify({ expectedRevision: revision, commandId, reason, organizationVersionId }) }) }
export async function setActiveGovernanceVersion(revision: string, commandId: string, reason: string, versionId: string | null) { return request<{ activePolicyVersionId: string | null; revision: string }>('/active-version', { method: 'POST', body: JSON.stringify({ expectedRevision: revision, commandId, reason, versionId }) }) }
export async function loadGovernanceVersion(id: string) { return request<{ version: GovernanceDocumentV2['publishedVersions'][number] }>(`/versions/${encodeURIComponent(id)}`) }
export async function loadGovernanceAudit(limit = 50, cursor?: string | null) { return request<{ items: unknown[]; nextCursor: string | null }>(`/audit?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`) }
function privilegedOperationBody(requestValue: PrivilegedAssignmentRequest, phase: 'preview' | 'publish') {
  return {
    contractVersion: 'orgmaster.privileged-assignment-operation.v1' as const,
    phase,
    operation: requestValue.operation,
    applicationId: requestValue.applicationId,
    stableRoleId: requestValue.stableRoleId,
    payload: requestValue.operation === 'grant_system_admin'
      ? { employeeId: requestValue.employeeId, principalAdmissionId: requestValue.principalAdmissionId }
      : { assignmentId: requestValue.assignmentId },
    expected: requestValue.expected,
    reason: requestValue.reason.trim(),
  }
}
export async function loadPrivilegedAssignmentWorkspace() { return request<PrivilegedAssignmentWorkspace>('/privileged-assignments?applicationId=ai-pdm&stableRoleId=role-system-admin') }
export async function previewPrivilegedAssignment(requestValue: PrivilegedAssignmentRequest) { return request<PrivilegedAssignmentOperationResponse>('/privileged-assignments/preview', { method: 'POST', body: JSON.stringify(privilegedOperationBody(requestValue, 'preview')) }) }
export async function publishPrivilegedAssignment(requestValue: PrivilegedAssignmentRequest, commandId: string, requestHash: string, previewHash: string) { return request<GovernanceCommandReceiptV2>('/privileged-assignments/publish', { method: 'POST', body: JSON.stringify({ ...privilegedOperationBody(requestValue, 'publish'), commandId, requestHash, preview: { previewHash } }) }) }
export async function loadPrivilegedAssignmentReceipt(commandId: string) { return request<GovernanceCommandReceiptV2>(`/privileged-assignments/commands/${encodeURIComponent(commandId)}`) }
