import type { GovernanceDocumentV3, GovernanceIdentityLinkV1 } from '../src/governance/types'

export class IdentityLinkPolicyError extends Error {
  constructor(readonly code: 'IDENTITY_LINK_CONFLICT' | 'IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN' | 'SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN' | 'IDENTITY_LINK_NOT_FOUND') { super(code); this.name = 'IdentityLinkPolicyError' }
}

export interface VerifiedIdentityTargetV1 {
  employeeId: string
  principalId: string
  issuer: string
  subject: string
  newIdentityLinkId: string
}

export function resolveIdentityLinkUpsert(document: GovernanceDocumentV3, target: VerifiedIdentityTargetV1, at = new Date().toISOString()): GovernanceIdentityLinkV1 {
  const exact = document.draft.identityLinks.filter((link) => link.issuer === target.issuer && link.subject === target.subject)
  const principalMatches = document.draft.identityLinks.filter((link) => link.principalId === target.principalId)
  const conflicts = [...exact, ...principalMatches].filter((link, index, list) => list.findIndex((item) => item.id === link.id) === index && link.employeeId !== target.employeeId)
  if (conflicts.length) throw new IdentityLinkPolicyError('IDENTITY_LINK_CONFLICT')
  const existing = [...exact, ...principalMatches].find((link) => link.employeeId === target.employeeId)
  if (existing) return { ...existing, principalId: target.principalId, issuer: target.issuer, subject: target.subject, status: 'active', validTo: null }
  return { id: target.newIdentityLinkId, principalId: target.principalId, issuer: target.issuer, subject: target.subject, employeeId: target.employeeId, status: 'active', validFrom: at, validTo: null }
}

export function assertIdentityLinkStatusMutationAllowed(document: GovernanceDocumentV3, input: { identityLinkId: string; employeeId: string; status: 'active' | 'inactive'; actor: { principalId: string; issuer: string; subject: string } }): void {
  const target = document.draft.identityLinks.find((link) => link.id === input.identityLinkId)
  if (!target) throw new IdentityLinkPolicyError('IDENTITY_LINK_NOT_FOUND')
  if (target.employeeId !== input.employeeId) throw new IdentityLinkPolicyError('IDENTITY_LINK_CONFLICT')
  if (input.status !== 'inactive') return
  if (target.principalId === input.actor.principalId && target.issuer === input.actor.issuer && target.subject === input.actor.subject) throw new IdentityLinkPolicyError('SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN')
  const admission = (document.draft.principalAdmissions ?? []).find((value) => value.identityLinkId === target.id && value.status === 'active')
  if (admission) throw new IdentityLinkPolicyError('IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN')
}
