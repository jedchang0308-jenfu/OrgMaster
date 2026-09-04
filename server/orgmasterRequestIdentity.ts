import type { IncomingMessage } from 'node:http'
import type { GovernanceActorContext } from '../src/governance/types'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const requestIdentities = new WeakMap<IncomingMessage, OrgmasterSession>()

export function setVerifiedRequestIdentity(request: IncomingMessage, session: OrgmasterSession) {
  requestIdentities.set(request, session)
}

export function readVerifiedRequestIdentity(request: IncomingMessage) {
  return requestIdentities.get(request) ?? null
}

export function verifiedGovernanceActor(request: IncomingMessage): GovernanceActorContext | null {
  const session = readVerifiedRequestIdentity(request)
  return session ? {
    principalId: session.principalId,
    issuer: session.identityIssuer,
    subject: session.identitySubject,
    employeeId: session.employeeId,
    bootstrap: false,
    assuranceLevel: session.assuranceLevel,
    authenticatedAt: session.authenticatedAt,
    sessionId: session.id,
  } : null
}
