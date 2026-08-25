import { describe, expect, it } from 'vitest'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { resolveReviewers } from './resolveReviewers'
describe('reviewer resolver', () => { it('returns no active policy without guessing reviewers', () => { const result = resolveReviewers(createSeedDocument(), { applicationId: 'ai-pdm', actionCode: 'numbering.release', requestor: { issuer: 'urn:test', subject: 'u1' }, scope: { kind: 'global' } }); expect(result.status).toBe('unresolved'); expect(result.reason).toBe('NO_ACTIVE_POLICY'); expect(result.reviewerPrincipalIds).toEqual([]) }) })
