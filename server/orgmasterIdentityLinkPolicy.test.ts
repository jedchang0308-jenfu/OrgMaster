import { describe, expect, it } from 'vitest'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { assertIdentityLinkStatusMutationAllowed, IdentityLinkPolicyError, resolveIdentityLinkUpsert } from './orgmasterIdentityLinkPolicy'

const actor = { principalId: 'p-1', issuer: 'issuer', subject: 'subject' }
const document = () => migrateGovernanceV2ToV3(createSeedDocumentV2('2026-01-01T00:00:00.000Z'), 'revision', readAiPdmRoleCatalog(), '2026-01-01T00:00:00.000Z')
describe('identity link policy', () => {
  it('creates, reactivates and preserves deterministic identity ids', () => { const first = resolveIdentityLinkUpsert(document(), { ...actor, employeeId: 'e-1', newIdentityLinkId: 'identity-a' }); expect(first.id).toBe('identity-a'); const next = document(); next.draft.identityLinks = [{ ...first, status: 'inactive' }]; expect(resolveIdentityLinkUpsert(next, { ...actor, employeeId: 'e-1', newIdentityLinkId: 'identity-b' }).id).toBe('identity-a') })
  it('rejects cross employee dual-key collision and active admission deactivation', () => { const next = document(); const first = resolveIdentityLinkUpsert(next, { ...actor, employeeId: 'e-2', newIdentityLinkId: 'identity-a' }); next.draft.identityLinks = [first]; expect(() => resolveIdentityLinkUpsert(next, { ...actor, employeeId: 'e-1', newIdentityLinkId: 'identity-b' })).toThrow(IdentityLinkPolicyError); next.draft.principalAdmissions = [{ id: 'admission', principalFingerprintSha256: 'a'.repeat(64), issuerFingerprintSha256: 'b'.repeat(64), accountType: 'human_personal', identityLinkId: first.id, sharedRetirementState: 'not_applicable', status: 'active', recordedAt: '2026-01-01T00:00:00.000Z', evidenceRefSha256: 'c'.repeat(64) }]; expect(() => assertIdentityLinkStatusMutationAllowed(next, { identityLinkId: first.id, employeeId: 'e-2', status: 'inactive', actor: { principalId: 'operator', issuer: 'operator', subject: 'operator' } })).toThrow('IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN') })
})
