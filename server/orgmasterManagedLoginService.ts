import type { FirebaseIdentityProvider } from './orgmasterFirebaseIdentityProvider'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'
import type { ManagedIdentityRepositoryV1 } from './orgmasterManagedIdentityRepository'
import {
  MANAGED_LOGIN_CONTRACT_VERSION,
  canonicalManagedLoginIdentity,
  incrementRevision,
  managedLoginRequestDigest,
  type ManagedLoginIdentity,
  type ManagedLoginResponse,
} from './orgmasterManagedLoginContract'

export type ManagedLoginOwnerErrorCode =
  | 'request_invalid'
  | 'caller_or_token_invalid'
  | 'managed_identity_denied'
  | 'identity_changed'
  | 'managed_login_unavailable'

export class ManagedLoginOwnerError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 409 | 503, public readonly code: ManagedLoginOwnerErrorCode) {
    super(code)
  }
}

export type ManagedLoginCaller = { email: string; subject: string }

export interface ManagedLoginOwnerServiceV1 {
  resolveAlias(input: { requestId: string; employeeNumber: string | null; caller: ManagedLoginCaller }): Promise<Extract<ManagedLoginResponse, { action: 'resolveAlias' }>>
  verifyIdentity(input: { requestId: string; directoryCustomerId: string; idToken: string; expected: ManagedLoginIdentity | null; caller: ManagedLoginCaller }): Promise<Extract<ManagedLoginResponse, { action: 'verifyIdentity' }>>
}

const EMPLOYEE_NUMBER = /^JFS[0-9]{4}$/u

function samePair(left: ManagedLoginIdentity['pair'], right: ManagedLoginIdentity['pair']) {
  return left?.issuer === right?.issuer && left?.subject === right?.subject
}

function sameStableIdentity(left: ManagedLoginIdentity, right: ManagedLoginIdentity) {
  return left.employeeId === right.employeeId
    && left.principalId === right.principalId
    && left.employeeNumber === right.employeeNumber
    && left.directoryCustomerId === right.directoryCustomerId
    && left.directoryUserId === right.directoryUserId
    && left.identityRecordId === right.identityRecordId
}

export function expectedManagedLoginIdentityMatches(expected: ManagedLoginIdentity | null, current: ManagedLoginIdentity, pair: { issuer: string; subject: string }) {
  if (!expected) return true
  if (!sameStableIdentity(expected, current)) return false
  if (canonicalManagedLoginIdentity(expected) === canonicalManagedLoginIdentity(current)) return true
  return expected.linkState === 'directory_linked_pending_auth'
    && expected.pair === null
    && current.linkState === 'active'
    && current.pair !== null
    && current.pair.issuer === pair.issuer
    && current.pair.subject === pair.subject
    && current.identityRevision === incrementRevision(expected.identityRevision)
    && current.registryRevision === expected.registryRevision
}

function mapDependencyError(error: unknown): never {
  if (error instanceof ManagedLoginOwnerError) throw error
  const code = error instanceof Error ? error.message : ''
  if (code.includes('REVISION') || code.includes('IDEMPOTENCY')) throw new ManagedLoginOwnerError(409, 'identity_changed')
  if (code.includes('ADMISSION') || code.includes('IDENTITY_CONFLICT') || code.includes('LOGIN_NOT_AVAILABLE')) throw new ManagedLoginOwnerError(403, 'managed_identity_denied')
  throw new ManagedLoginOwnerError(503, 'managed_login_unavailable')
}

export function createManagedLoginOwnerService(input: {
  repository: ManagedIdentityRepositoryV1
  directory: ManagedDirectoryPortV1
  firebase: FirebaseIdentityProvider
  directoryCustomerId: string
  now?: () => Date
}): ManagedLoginOwnerServiceV1 {
  const customerId = input.directoryCustomerId.trim()
  const now = input.now ?? (() => new Date())

  return {
    async resolveAlias(request) {
      if (!customerId) throw new ManagedLoginOwnerError(503, 'managed_login_unavailable')
      let match: ManagedLoginIdentity | null = null
      if (request.employeeNumber !== null) {
        const employeeNumber = request.employeeNumber.trim().toUpperCase()
        if (!EMPLOYEE_NUMBER.test(employeeNumber) || employeeNumber === 'JFS0000') throw new ManagedLoginOwnerError(400, 'request_invalid')
        try { match = await input.repository.resolveManagedLoginAlias(employeeNumber) } catch (error) { mapDependencyError(error) }
        if (match && match.directoryCustomerId !== customerId) throw new ManagedLoginOwnerError(403, 'managed_identity_denied')
      }
      return { contractVersion: MANAGED_LOGIN_CONTRACT_VERSION, action: 'resolveAlias', requestId: request.requestId, directoryCustomerId: customerId, match }
    },

    async verifyIdentity(request) {
      if (!customerId) throw new ManagedLoginOwnerError(503, 'managed_login_unavailable')
      if (request.directoryCustomerId !== customerId) throw new ManagedLoginOwnerError(403, 'managed_identity_denied')

      const token = await input.firebase.verifyIdToken(request.idToken).catch(() => { throw new ManagedLoginOwnerError(401, 'caller_or_token_invalid') })
      const authenticatedAt = token.authenticatedAt
      const authenticatedAtMs = authenticatedAt ? Date.parse(authenticatedAt) : Number.NaN
      if (!token.issuer || !token.subject || token.signInProvider !== 'google.com' || token.emailVerified !== true || !token.email || !token.googleUserId
        || !Number.isFinite(authenticatedAtMs) || authenticatedAtMs > now().getTime() + 5 * 60_000) {
        throw new ManagedLoginOwnerError(401, 'caller_or_token_invalid')
      }
      const verifiedAuthenticatedAt = authenticatedAt as string

      let directoryUser
      try {
        await input.repository.reserveDirectoryRead()
        const directoryRead = await input.directory.readByDirectoryKey(customerId, token.googleUserId)
        if (!directoryRead.ok) {
          if (directoryRead.kind === 'retryable_error') throw new ManagedLoginOwnerError(503, 'managed_login_unavailable')
          throw new ManagedLoginOwnerError(403, 'managed_identity_denied')
        }
        directoryUser = directoryRead.user
      } catch (error) { mapDependencyError(error) }

      if (directoryUser.customerId !== customerId || directoryUser.userId !== token.googleUserId || directoryUser.directoryState !== 'present'
        || directoryUser.primaryEmail.trim().toLowerCase() !== token.email.trim().toLowerCase()) {
        throw new ManagedLoginOwnerError(403, 'managed_identity_denied')
      }

      let current: ManagedLoginIdentity | null
      try { current = await input.repository.readManagedLoginIdentity(customerId, token.googleUserId) } catch (error) { mapDependencyError(error) }
      const pair = { issuer: token.issuer, subject: token.subject }
      if (!current || !expectedManagedLoginIdentityMatches(request.expected, current, pair)) throw new ManagedLoginOwnerError(409, 'identity_changed')
      if (current.linkState === 'active' && !samePair(current.pair, pair)) throw new ManagedLoginOwnerError(403, 'managed_identity_denied')

      const requestHash = managedLoginRequestDigest({
        directoryCustomerId: customerId,
        issuer: pair.issuer,
        subject: pair.subject,
        googleUserId: token.googleUserId,
        authenticatedAt: verifiedAuthenticatedAt,
        expected: request.expected,
      })
      let verified
      try {
        verified = await input.repository.verifyManagedLoginIdentity({ requestId: request.requestId, requestHash, current, issuer: pair.issuer, subject: pair.subject, actor: request.caller.subject })
      } catch (error) { mapDependencyError(error) }
      if (!expectedManagedLoginIdentityMatches(current, verified.identity, pair)) throw new ManagedLoginOwnerError(409, 'identity_changed')
      return {
        contractVersion: MANAGED_LOGIN_CONTRACT_VERSION,
        action: 'verifyIdentity',
        requestId: request.requestId,
        identity: verified.identity,
        mappingVersion: verified.mappingVersion,
        authenticatedAt: verifiedAuthenticatedAt,
      }
    },
  }
}
