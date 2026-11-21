export const PROJED_EXTERNAL_VERSION = 'orgmaster.projed-external-qualification.v1' as const
export type ProjedExternalRequest = {
  requestId: string; invitationId: string; inviterPrincipalId: string; boardId: string; role: string
  expiresAt: string; contactEmail: string; company: string; note: string
}
export type ProjedExternalNotification =
  | ({ contractVersion: typeof PROJED_EXTERNAL_VERSION; action: 'submit' } & ProjedExternalRequest)
  | { contractVersion: typeof PROJED_EXTERNAL_VERSION; action: 'bind'; requestId: string; principalId: string; googleSubject: string }
  | { contractVersion: typeof PROJED_EXTERNAL_VERSION; action: 'withdraw'; requestId: string }
export type ProjedExternalRecord = ProjedExternalRequest & {
  principalId: string | null; googleSubject: string | null; revision: string
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED' | 'WITHDRAWN'
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'; approvedBy: string | null; approvedAt: string | null
  lastLoginAt: string | null; createdAt: string
}
export type ProjedExternalDecision = {
  commandId: string; requestId: string; expectedRevision: string
  action: 'approve' | 'reject' | 'disable' | 'restore'; note: string
}
