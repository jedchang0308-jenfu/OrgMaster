import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { privilegedRequestHash } from '../src/governance/privilegedAssignments'
import { ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { previewPrivilegedAssignment, publishPrivilegedAssignment } from './privilegedAssignmentStore'

const roots: string[] = []

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev009-store-'))
  roots.push(root)
  const sourceManifest = JSON.parse(await readFile(resolve('data/orgmaster-workspace.v1.json'), 'utf8'))
  const currentId = sourceManifest.currentVersionId as string
  const currentEntry = sourceManifest.entries.find((entry: { id: string }) => entry.id === currentId)
  const sourceVersionPath = resolve('data/orgmaster-versions', `${currentId}.json`)
  const versionRaw = await readFile(sourceVersionPath, 'utf8')
  await mkdir(join(root, 'data', 'orgmaster-versions'), { recursive: true })
  await writeFile(join(root, 'data', 'orgmaster-workspace.v1.json'), `${JSON.stringify({ ...sourceManifest, entries: [currentEntry] }, null, 2)}\n`)
  await writeFile(join(root, 'data', 'orgmaster-versions', `${currentId}.json`), versionRaw)
  return root
}

describe('privileged assignment store transaction', () => {
  it('publishes one immutable V3 effect with audit, alert and invalidation, then terminal-replays after freshness expires', async () => {
    const root = await fixtureRoot()
    const seeded = await ensureGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const employeeIds = source.state.employees.slice(0, 2).map((employee) => employee.id)
    expect(employeeIds).toHaveLength(2)
    const [actorEmployeeId, targetEmployeeId] = employeeIds
    const issuer = 'https://securetoken.google.com/dev009-fixture'
    const actorSubject = 'actor-subject'
    const targetSubject = 'target-subject'
    const actorPrincipalId = 'principal-override-fixture'
    const targetPrincipalId = 'principal-target-fixture'
    const recordedAt = new Date().toISOString()
    const actorLink = { id: 'link-actor', principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
    const targetLink = { id: 'link-target', principalId: targetPrincipalId, issuer, subject: targetSubject, employeeId: targetEmployeeId, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
    seeded.document.draft.identityLinks = [actorLink, targetLink]
    seeded.document.draft.principalAdmissions = [
      { id: 'admission-actor', identityLinkId: actorLink.id, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(issuer, actorSubject), issuerFingerprintSha256: issuerFingerprintSha256(issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt },
      { id: 'admission-target', identityLinkId: targetLink.id, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(issuer, targetSubject), issuerFingerprintSha256: issuerFingerprintSha256(issuer), evidenceRefSha256: 'b'.repeat(64), recordedAt },
    ]
    seeded.document.draft.managementGrants = [{ id: 'grant-override', principalId: actorPrincipalId, employeeId: actorEmployeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'bootstrap-fixture', reason: 'fixture' }]
    await writeFile(getGovernancePaths(root).current, `${JSON.stringify(seeded.document, null, 2)}\n`)

    const current = await readGovernanceStore(root)
    const catalog = readAiPdmRoleCatalog()
    const actor = { principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, bootstrap: false }
    const request = {
      operation: 'grant_system_admin' as const, employeeId: targetEmployeeId, principalAdmissionId: 'admission-target',
      applicationId: 'ai-pdm' as const, stableRoleId: 'role-system-admin' as const, reason: 'DEV-009 exact privileged grant',
      expected: { catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.payloadHash, governanceRevision: current.revision, organizationRevision: source.workspaceRevision },
    }
    const preview = await previewPrivilegedAssignment(root, actor, request)
    expect(preview.requestHash).toBe(privilegedRequestHash(actorPrincipalId, request, preview.previewHash))
    const publishRequest = { ...request, commandId: 'command-dev009-grant-1', requestHash: preview.requestHash, previewHash: preview.previewHash }
    const freshSession = { sessionId: 'session-fixture', principalId: actorPrincipalId, assuranceLevel: 'aal2' as const, authenticatedAt: new Date(Date.now() - 60_000).toISOString() }
    const receipt = await publishPrivilegedAssignment(root, actor, freshSession, publishRequest)
    expect(receipt).toMatchObject({ receiptStatus: 'applied', decisionCode: 'COMMAND_APPLIED', replayed: false, sessionRefresh: 'pending' })
    expect(receipt.securityAlertReference).toBeTruthy()

    const persisted = await readGovernanceStore(root)
    expect(persisted.document.publishedVersions.at(-1)?.kind).toBe('assignment-governance-v3')
    expect(persisted.document.draft.roleAssignments.at(-1)).toMatchObject({ employeeId: targetEmployeeId, targetPrincipalId, subjectKind: 'principal', basis: 'manual', validTo: null })
    expect(persisted.document.auditEvents.filter((event) => event.commandId === publishRequest.commandId)).toHaveLength(1)
    expect(persisted.document.securityAlertIntents).toHaveLength(1)
    expect(persisted.document.sessionInvalidationOutbox).toHaveLength(1)

    const expiredSession = { ...freshSession, authenticatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }
    const replay = await publishPrivilegedAssignment(root, actor, expiredSession, publishRequest)
    expect(replay).toMatchObject({ replayed: true, auditReference: receipt.auditReference, securityAlertReference: receipt.securityAlertReference })
    await expect(publishPrivilegedAssignment(root, actor, expiredSession, { ...publishRequest, requestHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
  })
})
