import { describe, expect, it, vi } from 'vitest'
import type { FirebaseIdentityProvider, VerifiedFirebaseIdentity } from './orgmasterFirebaseIdentityProvider'
import {
  createProjedPrincipalService,
  ProjedPrincipalServiceError,
  type ProjedPrincipalPublication,
  type ProjedPrincipalRepository,
} from './orgmasterProjedPrincipalService'

const now = new Date('2026-10-28T04:00:00.000Z')
const request = { requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', idToken: 'firebase-id-token' }
const identity: VerifiedFirebaseIdentity = {
  issuer: 'https://securetoken.google.com/jenfu-platform-nonprod',
  subject: 'firebase-subject-1',
  assuranceLevel: 'aal1',
  authenticatedAt: '2026-10-28T03:59:00.000Z',
  signInProvider: 'google.com',
  email: 'must-not-be-used@example.test',
  emailVerified: true,
  googleUserId: 'google-subject-1',
}

function publication(overrides: Partial<ProjedPrincipalPublication> = {}): ProjedPrincipalPublication {
  return {
    contractVersion: 'orgmaster.projed-principal.v1',
    principalId: 'principal-1',
    principalKind: 'personal',
    employeeId: null,
    identityIssuer: identity.issuer,
    identitySubject: identity.subject,
    googleSubject: identity.googleUserId!,
    mappingRevision: '9223372036854775807',
    publishedAt: '2026-10-28T04:00:00.123Z',
    ...overrides,
  }
}

function setup(options: {
  identity?: VerifiedFirebaseIdentity
  publication?: ProjedPrincipalPublication
  verifyError?: Error
  enrollError?: Error
} = {}) {
  const firebase: FirebaseIdentityProvider = {
    verifyIdToken: vi.fn(async () => {
      if (options.verifyError) throw options.verifyError
      return options.identity ?? identity
    }),
  }
  const repository: ProjedPrincipalRepository = {
    enroll: vi.fn(async () => {
      if (options.enrollError) throw options.enrollError
      return options.publication ?? publication()
    }),
  }
  return { firebase, repository, service: createProjedPrincipalService({ firebase, repository, now: () => now }) }
}

describe('DEV-057 ProJED principal publication service', () => {
  it('publishes a personal principal using only verified identity keys', async () => {
    const { firebase, repository, service } = setup()
    const result = await service.enroll(request)

    expect(firebase.verifyIdToken).toHaveBeenCalledWith(request.idToken)
    expect(repository.enroll).toHaveBeenCalledWith({
      requestId: request.requestId,
      issuer: identity.issuer,
      subject: identity.subject,
      googleSubject: identity.googleUserId,
      authenticatedAt: identity.authenticatedAt,
    })
    expect(result).toEqual(publication())
    expect(JSON.stringify(repository.enroll.mock.calls[0][0])).not.toContain(identity.email)
  })

  it('publishes an employee principal with a nonempty employee ID', async () => {
    const employeePublication = publication({ principalKind: 'employee', employeeId: 'employee-8' })
    const { service } = setup({ publication: employeePublication })
    await expect(service.enroll(request)).resolves.toEqual(employeePublication)
  })

  it.each([
    ['missing issuer', { issuer: '' }],
    ['missing subject', { subject: '' }],
    ['missing Google subject', { googleUserId: undefined }],
    ['whitespace Google subject', { googleUserId: ' google-subject-1 ' }],
    ['unverified email', { emailVerified: false }],
    ['wrong sign-in provider', { signInProvider: 'password' }],
    ['missing authentication time', { authenticatedAt: null }],
    ['invalid authentication time', { authenticatedAt: 'not-a-time' }],
    ['future authentication time', { authenticatedAt: '2026-10-28T04:05:01.000Z' }],
  ])('rejects %s before repository access', async (_label, override) => {
    const { repository, service } = setup({ identity: { ...identity, ...override } as VerifiedFirebaseIdentity })
    await expect(service.enroll(request)).rejects.toMatchObject<ProjedPrincipalServiceError>({ status: 401, code: 'principal_identity_invalid' })
    expect(repository.enroll).not.toHaveBeenCalled()
  })

  it('rejects malformed requests before Firebase verification', async () => {
    const { firebase, repository, service } = setup()
    const invalidRequests = [
      { ...request, requestId: 'not-a-uuid' },
      { ...request, requestId: `${request.requestId}x` },
      { ...request, idToken: '' },
      { ...request, idToken: 'x'.repeat(16_385) },
      { ...request, idToken: ` ${request.idToken}` },
      { ...request, principalId: 'client-selected-principal' },
      { ...request, employeeId: 'client-selected-employee' },
      { ...request, googleSubject: 'client-selected-google-subject' },
    ]

    for (const invalidRequest of invalidRequests) {
      await expect(service.enroll(invalidRequest as typeof request)).rejects.toMatchObject<ProjedPrincipalServiceError>({ status: 400, code: 'request_invalid' })
    }
    expect(firebase.verifyIdToken).not.toHaveBeenCalled()
    expect(repository.enroll).not.toHaveBeenCalled()
  })

  it('rejects a Firebase verification failure without repository access', async () => {
    const { repository, service } = setup({ verifyError: new Error('revoked or invalid token') })
    await expect(service.enroll(request)).rejects.toMatchObject<ProjedPrincipalServiceError>({ status: 401, code: 'principal_identity_invalid' })
    expect(repository.enroll).not.toHaveBeenCalled()
  })

  it.each([
    ['issuer', { identityIssuer: 'different-issuer' }],
    ['subject', { identitySubject: 'different-subject' }],
    ['Google subject', { googleSubject: 'different-google-subject' }],
  ])('fails closed when the repository returns another %s mapping', async (_label, override) => {
    const { service } = setup({ publication: publication(override) })
    await expect(service.enroll(request)).rejects.toMatchObject<ProjedPrincipalServiceError>({ status: 409, code: 'principal_mapping_conflict' })
  })

  it.each([
    ['unknown contract version', { contractVersion: 'other.v1' }],
    ['invalid principal kind', { principalKind: 'service' }],
    ['employee without employee ID', { principalKind: 'employee', employeeId: null }],
    ['employee with empty employee ID', { principalKind: 'employee', employeeId: '' }],
    ['personal with employee ID', { principalKind: 'personal', employeeId: 'employee-1' }],
    ['zero mapping revision', { mappingRevision: '0' }],
    ['mapping revision beyond int64', { mappingRevision: '9223372036854775808' }],
    ['invalid publication time', { publishedAt: 'not-a-time' }],
    ['extra publication field', { email: 'private@example.test' }],
  ])('fails closed on %s', async (_label, override) => {
    const { service } = setup({ publication: publication(override as Partial<ProjedPrincipalPublication>) })
    await expect(service.enroll(request)).rejects.toMatchObject<ProjedPrincipalServiceError>({ status: 503, code: 'principal_enrollment_unavailable' })
  })

  it('maps repository failures to unavailable without exposing dependency details', async () => {
    const { service } = setup({ enrollError: new Error('database connection contains internal details') })
    await expect(service.enroll(request)).rejects.toMatchObject<ProjedPrincipalServiceError>({ status: 503, code: 'principal_enrollment_unavailable' })
  })

  it('preserves a permanent publication conflict instead of inviting a dependency retry', async () => {
    const { service } = setup({ enrollError: new ProjedPrincipalServiceError(409, 'principal_mapping_conflict') })
    await expect(service.enroll(request)).rejects.toMatchObject({ status: 409, code: 'principal_mapping_conflict' })
  })
})
