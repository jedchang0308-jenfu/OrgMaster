import { describe, expect, it } from 'vitest'
import { issuerFingerprintSha256, principalFingerprintSha256 } from './identityAdmission'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
import { applyGovernanceCommandV2 } from './commands'

describe('DEV-040 identity admission', () => {
  it('uses case-sensitive exact issuer and subject fingerprints', () => {
    expect(principalFingerprintSha256('issuer', 'Subject')).not.toBe(principalFingerprintSha256('issuer', 'subject'))
    expect(issuerFingerprintSha256('issuer')).toHaveLength(64)
  })
  it('applies admission commands idempotently and without employeeId authority', () => {
    const link = { id: 'link-1', principalId: 'p-1', issuer: 'issuer', subject: 'subject', employeeId: '01900000-0000-7000-8000-000000000001', status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
    const admission = { id: 'admission-1', principalFingerprintSha256: principalFingerprintSha256(link.issuer, link.subject), issuerFingerprintSha256: issuerFingerprintSha256(link.issuer), accountType: 'human_personal' as const, identityLinkId: link.id, sharedRetirementState: 'not_applicable' as const, status: 'active' as const, recordedAt: '2026-01-01T00:00:00.000Z', evidenceRefSha256: 'a'.repeat(64) }
    const document = { ...createSeedDocumentV2(), draft: { ...createSeedDocumentV2().draft, identityLinks: [link] } }
    const command = { type: 'UPSERT_PRINCIPAL_ADMISSION' as const, commandId: 'cmd-1', reason: 'fixture', value: admission }
    const applied = applyGovernanceCommandV2(document, command, { workspaceVersionId: 'test-current', workspaceRevision: 'test', state: { employees: [{ id: link.employeeId, primaryAssignmentId: null }], departments: [], roles: [], positions: [], assignments: [] } }, [])
    expect(applied.status).toBe('applied')
    expect(applied.document.draft.principalAdmissions?.[0]).not.toHaveProperty('employeeId')
  })
})
