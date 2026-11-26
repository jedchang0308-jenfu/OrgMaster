import type { IncomingMessage } from 'node:http'
import type { GovernanceActorContext } from '../src/governance/types'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const requestIdentities = new WeakMap<IncomingMessage, OrgmasterSession>()
const trustedRevalidators = new WeakMap<IncomingMessage, { original: OrgmasterSession; run: () => Promise<OrgmasterSession> }>()

export class RequestIdentityRevalidationError extends Error {
  constructor(readonly status: 401 | 503, readonly code: string) { super(code); this.name = 'RequestIdentityRevalidationError' }
}

/** Only an authentication adapter may bind this closure after verifying the request. */
export function setTrustedRequestIdentityRevalidator(request: IncomingMessage, run: () => Promise<OrgmasterSession>) {
  const original = readVerifiedRequestIdentity(request)
  if (!original) throw new RequestIdentityRevalidationError(401, 'IDENTITY_CONTEXT_REQUIRED')
  trustedRevalidators.set(request, { original: { ...original }, run })
}

/** Revalidates the original request, never substitutes a different valid login. */
export async function revalidateVerifiedRequestIdentity(request: IncomingMessage) {
  const bound = trustedRevalidators.get(request)
  if (!bound) throw new RequestIdentityRevalidationError(503, 'IDENTITY_REVALIDATOR_UNAVAILABLE')
  let fresh: OrgmasterSession
  try { fresh = await bound.run() }
  catch (error) {
    const status = (error as { status?: unknown })?.status
    throw new RequestIdentityRevalidationError(status === 401 || status === 403 ? 401 : 503,
      status === 401 || status === 403 ? 'IDENTITY_CONTEXT_REQUIRED' : 'IDENTITY_AUTHORITY_UNAVAILABLE')
  }
  const keys = ['id', 'principalId', 'employeeId', 'identityIssuer', 'identitySubject', 'sessionSchemaVersion', 'epochKind',
    'principalAuthEpoch', 'authEpoch', 'authenticatedAt', 'assuranceLevel'] as const
  if (!fresh || keys.some(key => fresh[key] !== bound.original[key]) || fresh.revokedAt
    || !Number.isFinite(Date.parse(fresh.expiresAt)) || Date.parse(fresh.expiresAt) <= Date.now()) {
    throw new RequestIdentityRevalidationError(401, 'IDENTITY_CONTEXT_REQUIRED')
  }
  setVerifiedRequestIdentity(request, fresh)
  return fresh
}

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
    principalAuthEpoch: session.principalAuthEpoch,
  } : null
}
