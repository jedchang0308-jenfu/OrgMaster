import type { FirebaseIdentityProvider, VerifiedFirebaseIdentity } from './orgmasterFirebaseIdentityProvider'

export const PROJED_PRINCIPAL_CONTRACT_VERSION = 'orgmaster.projed-principal.v1' as const

export type ProjedPrincipalPublication = {
  contractVersion: typeof PROJED_PRINCIPAL_CONTRACT_VERSION
  principalId: string
  principalKind: 'employee' | 'personal'
  employeeId: string | null
  identityIssuer: string
  identitySubject: string
  googleSubject: string
  mappingRevision: string
  publishedAt: string
}

export type ProjedPrincipalRepository = {
  enroll(input: {
    requestId: string
    issuer: string
    subject: string
    googleSubject: string
    authenticatedAt: string
  }): Promise<ProjedPrincipalPublication>
}

export type ProjedPrincipalService = {
  enroll(request: { requestId: string; idToken: string }): Promise<ProjedPrincipalPublication>
}

export type ProjedPrincipalServiceErrorCode =
  | 'request_invalid'
  | 'principal_identity_invalid'
  | 'principal_mapping_conflict'
  | 'principal_enrollment_unavailable'

export class ProjedPrincipalServiceError extends Error {
  constructor(public readonly status: 400 | 401 | 409 | 503, public readonly code: ProjedPrincipalServiceErrorCode) {
    super(code)
  }
}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MAX_ID_TOKEN_LENGTH = 16_384
const MAX_INT64 = '9223372036854775807'
const REQUEST_KEYS = ['requestId', 'idToken']
const PUBLICATION_KEYS = [
  'contractVersion', 'principalId', 'principalKind', 'employeeId', 'identityIssuer', 'identitySubject', 'googleSubject', 'mappingRevision', 'publishedAt',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const keys = Reflect.ownKeys(value)
  return keys.length === expected.length
    && keys.every((key) => typeof key === 'string' && expected.includes(key))
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function exactNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && value.trim() === value
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function validMappingRevision(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/u.test(value)) return false
  return value.length < MAX_INT64.length || value <= MAX_INT64
}

function validRequest(request: unknown): request is { requestId: string; idToken: string } {
  if (!hasExactKeys(request, REQUEST_KEYS)) return false
  return typeof request.requestId === 'string'
    && request.requestId.length === 36
    && REQUEST_ID.test(request.requestId)
    && typeof request.idToken === 'string'
    && request.idToken.length > 0
    && request.idToken.length <= MAX_ID_TOKEN_LENGTH
    && request.idToken.trim() === request.idToken
}

function validProof(identity: VerifiedFirebaseIdentity, nowMs: number): identity is VerifiedFirebaseIdentity & {
  issuer: string
  subject: string
  authenticatedAt: string
  signInProvider: 'google.com'
  emailVerified: true
  googleUserId: string
} {
  if (!identity || typeof identity !== 'object') return false
  const authenticatedAt = identity.authenticatedAt
  const authenticatedAtMs = validIsoTimestamp(authenticatedAt) ? Date.parse(authenticatedAt) : Number.NaN
  return exactNonemptyString(identity.issuer)
    && exactNonemptyString(identity.subject)
    && identity.signInProvider === 'google.com'
    && identity.emailVerified === true
    && exactNonemptyString(identity.googleUserId)
    && Number.isFinite(authenticatedAtMs)
    && authenticatedAtMs > 0
    && authenticatedAtMs <= nowMs + 5 * 60_000
}

function validPublication(value: unknown): value is ProjedPrincipalPublication {
  if (!hasExactKeys(value, PUBLICATION_KEYS)) return false
  if (value.contractVersion !== PROJED_PRINCIPAL_CONTRACT_VERSION
    || !exactNonemptyString(value.principalId)
    || !exactNonemptyString(value.identityIssuer)
    || !exactNonemptyString(value.identitySubject)
    || !exactNonemptyString(value.googleSubject)
    || !validMappingRevision(value.mappingRevision)
    || !validIsoTimestamp(value.publishedAt)) return false

  if (value.principalKind === 'employee') return exactNonemptyString(value.employeeId)
  if (value.principalKind === 'personal') return value.employeeId === null
  return false
}

export function createProjedPrincipalService(input: {
  firebase: FirebaseIdentityProvider
  repository: ProjedPrincipalRepository
  now?: () => Date
}): ProjedPrincipalService {
  const now = input.now ?? (() => new Date())

  return {
    async enroll(request) {
      if (!validRequest(request)) throw new ProjedPrincipalServiceError(400, 'request_invalid')

      let identity: VerifiedFirebaseIdentity
      try {
        identity = await input.firebase.verifyIdToken(request.idToken)
      } catch {
        throw new ProjedPrincipalServiceError(401, 'principal_identity_invalid')
      }

      let nowMs: number
      try {
        nowMs = now().getTime()
      } catch {
        throw new ProjedPrincipalServiceError(503, 'principal_enrollment_unavailable')
      }
      if (!Number.isFinite(nowMs)) throw new ProjedPrincipalServiceError(503, 'principal_enrollment_unavailable')
      let proof: { issuer: string; subject: string; googleSubject: string; authenticatedAt: string } | null = null
      try {
        if (validProof(identity, nowMs)) proof = {
          issuer: identity.issuer, subject: identity.subject,
          googleSubject: identity.googleUserId, authenticatedAt: identity.authenticatedAt,
        }
      } catch { /* malformed verifier output remains rejected */ }
      if (!proof) {
        throw new ProjedPrincipalServiceError(401, 'principal_identity_invalid')
      }

      let publication: ProjedPrincipalPublication
      try {
        publication = await input.repository.enroll({
          requestId: request.requestId,
          ...proof,
        })
      } catch (error) {
        if (error instanceof ProjedPrincipalServiceError) throw error
        throw new ProjedPrincipalServiceError(503, 'principal_enrollment_unavailable')
      }

      let publicationValid = false
      let publicationMatchesIdentity = false
      try {
        publicationValid = validPublication(publication)
        publicationMatchesIdentity = publicationValid
          && publication.identityIssuer === proof.issuer
          && publication.identitySubject === proof.subject
          && publication.googleSubject === proof.googleSubject
      } catch {
        publicationValid = false
      }
      if (!publicationValid) throw new ProjedPrincipalServiceError(503, 'principal_enrollment_unavailable')
      if (!publicationMatchesIdentity) {
        throw new ProjedPrincipalServiceError(409, 'principal_mapping_conflict')
      }

      return {
        contractVersion: publication.contractVersion,
        principalId: publication.principalId,
        principalKind: publication.principalKind,
        employeeId: publication.employeeId,
        identityIssuer: publication.identityIssuer,
        identitySubject: publication.identitySubject,
        googleSubject: publication.googleSubject,
        mappingRevision: publication.mappingRevision,
        publishedAt: publication.publishedAt,
      }
    },
  }
}
