import { describe, expect, it, vi } from 'vitest'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { createProjedPrincipalRepository } from './orgmasterProjedPrincipalRepository'

const input = { requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', issuer: 'verified-issuer',
  subject: 'verified-subject', googleSubject: 'verified-google-subject', authenticatedAt: '2026-10-28T04:00:00.000Z' }

describe('ProJED publication repository errors', () => {
  it.each(['PROJED_PRINCIPAL_INACTIVE', 'PROJED_PUBLICATION_REPLAY_CONFLICT'])('returns a permanent conflict for %s', async (code) => {
    const query = vi.fn().mockRejectedValue(new Error(code))
    const repository = createProjedPrincipalRepository({ query } as unknown as Pick<OrgmasterDatabase, 'query'>)
    await expect(repository.enroll(input)).rejects.toMatchObject({ status: 409, code: 'principal_mapping_conflict' })
  })

  it('does not expose unknown database details', async () => {
    const query = vi.fn().mockRejectedValue(new Error('internal database connection details'))
    const repository = createProjedPrincipalRepository({ query } as unknown as Pick<OrgmasterDatabase, 'query'>)
    await expect(repository.enroll(input)).rejects.toMatchObject({ status: 503, code: 'principal_enrollment_unavailable', message: 'principal_enrollment_unavailable' })
  })
})
