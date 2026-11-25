import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { ORGMASTER_BUSINESS_PERMISSIONS } from '../src/governance/aiPdmCatalog'
import { applyGovernanceCommandV3, publicationSnapshotHash } from '../src/governance/commands'
import { evaluateVerifiedPrincipalPermission } from '../src/governance/evaluatePermission'
import type { GovernanceCommandV2, GovernanceDocumentV3 } from '../src/governance/types'
// @ts-expect-error Existing JavaScript fixture creates and verifies a disposable cluster only.
import { withAdministrationPostgresFixture, prepareAdministrationInitializationFixture, drainAdministrationFixtureEvents, createAdministrativeHumanFixture } from '../scripts/lib/dev070-administration-postgres-fixture.mjs'

for (const includeV2Definitions of [false, true]) {
it.skipIf(process.env.ORGMASTER_BUSINESS_PERMISSION_POSTGRES !== '1')(`registers business appointments through the real verified v3 writer without changing initialized admin definition/hash (v2 definitions: ${includeV2Definitions})`, async () => {
  const platformFixture = await import(pathToFileURL(resolve('C:/VIBE CODING/Jenfu-Platform/scripts/lib/dev022-administration-lifecycle-fixture.mjs')).href)
  await withAdministrationPostgresFixture(async (fixture: any) => {
    const { admin, connect, handle } = fixture
    expect(handle.targetClass).toBe('task-owned-local')
    expect(handle.host).toBe('127.0.0.1')
    const initialization = await prepareAdministrationInitializationFixture(fixture, { noPublication: true, freshNative: true })
    await initialization.initialize()
    const platform = await connect('platform-prod-runtime@jenfu-platform-prod.iam')
    await drainAdministrationFixtureEvents(fixture, platformFixture.createAdministrationLifecycleFixtureDispatch({ database: platform, handle }))
    const principalId = initialization.nativeFacts.principalId
    await platformFixture.initializePrincipalForAdministrationFixture({ database: platform, handle, principalId })
    const human = await createAdministrativeHumanFixture(fixture, { principalId })
    const permission = ORGMASTER_BUSINESS_PERMISSIONS[0]
    const reader = { principalId: human.principalId, employeeId: human.employeeId }
    const read = async () => (await admin.query(`SELECT payload,trim(canonical_sha256) revision FROM orgmaster_core.persistence_artifacts artifact
      JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0] as { payload: GovernanceDocumentV3; revision: string }
    const protectedDefinition = async () => (await admin.query(`SELECT orgmaster_core.administrative_protected_definition_v1(publication->'policy') definition,
      orgmaster_core.administration_sha256_v1(orgmaster_core.administrative_protected_definition_v1(publication->'policy')) hash,
      publication#>'{policy,administration}' administration FROM (SELECT orgmaster_core.read_administration_publication_v1() publication) source`)).rows[0]
    const initialDefinition = await protectedDefinition()
    const write = async (document: GovernanceDocumentV3, actor = human.actor) => {
      const current = await read()
      const hash = (await admin.query('SELECT orgmaster_core.administration_sha256_v1($1::jsonb) hash', [JSON.stringify(document)])).rows[0].hash
      const change = { artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance', payload: document,
        expectedCanonicalSha256: current.revision, nextCanonicalSha256: hash, sourceSha256: hash, sourceBytes: Buffer.byteLength(JSON.stringify(document)) }
      await human.runtime.query('SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3($1::jsonb,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
        [JSON.stringify([change]), hash, human.principalId, 'explicit-business-permission-rd', randomUUID(), '[]', JSON.stringify(actor)])
      return (await read()).payload
    }
    let document = (await read()).payload
    const initialVersion = document.publishedVersions.find(value => value.id === document.activePolicyVersionId)!
    // An initially unpublished business draft is not published by bootstrap. Start
    // this scenario from the actual bootstrap publication using the runtime writer.
    document.draft = { ...structuredClone(initialVersion.policy), basePolicyVersionId: initialVersion.id, updatedAt: new Date().toISOString() } as GovernanceDocumentV3['draft']
    document = await write(document)
    const allowed = () => evaluateVerifiedPrincipalPermission(document, reader, permission.code).status
    const command = async (body: Record<string, unknown>) => {
      const applied = applyGovernanceCommandV3(document, { ...body, commandId: randomUUID(), reason: '明示職掌盤點主管任用' } as GovernanceCommandV2, human.principalId)
      document = await write(applied.document)
      expect(await protectedDefinition()).toEqual(initialDefinition)
    }
    const publish = async () => {
      const { basePolicyVersionId: _base, updatedAt: _at, ...policy } = document.draft
      const payload = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: [], organizationSnapshot: initialVersion.organizationSnapshot, effectState: 'not-synchronized' as const }
      const version = { ...payload, id: randomUUID(), versionNumber: document.publishedVersions.length + 1, publishedAt: new Date().toISOString(), publishedByPrincipalId: human.principalId,
        publishReason: '明示發布業務任用', hashFormat: 'orgmaster.sorted-json.v1' as const, snapshotHash: publicationSnapshotHash(payload) }
      document = await write({ ...document, activePolicyVersionId: version.id, publishedVersions: [...document.publishedVersions, version], draft: { ...document.draft, basePolicyVersionId: version.id } })
      expect(await protectedDefinition()).toEqual(initialDefinition)
    }
    expect(allowed()).toBe('denied')
    await command({ type: 'UPSERT_PERMISSION', value: { ...permission } })
    await command({ type: 'UPSERT_APPLICATION_ROLE', value: { id: 'reviewer', applicationId: 'orgmaster', code: 'duty_reviewer', name: '職掌盤點主管', status: 'active', systemDefined: false } })
    await command({ type: 'SET_ROLE_PERMISSION_GRANT', value: { id: 'review-grant', roleId: 'reviewer', permissionId: permission.id, effect: 'allow' } })
    const appointment = { id: 'review-appointment', applicationId: 'orgmaster', employeeId: human.employeeId, roleId: 'reviewer', roleCodeSnapshot: 'duty_reviewer', roleNameSnapshot: '職掌盤點主管', catalogVersion: null,
      status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'orgmaster-enforced' }
    await command({ type: 'UPSERT_ROLE_ASSIGNMENT', value: { ...appointment, scope: { kind: 'department', value: 'department-1' } } })
    await publish()
    expect(allowed()).toBe('denied')
    await command({ type: 'UPSERT_ROLE_ASSIGNMENT', value: { ...appointment, scope: { kind: 'global' } } })
    expect(allowed()).toBe('denied')
    await publish()
    expect(allowed()).toBe('allowed')
    expect(document.draft.roleAssignments.find(value => value.id === 'review-appointment')).toMatchObject({ basis: 'manual', subjectKind: 'employee', targetPrincipalId: null })
    await command({ type: 'REVOKE_ROLE_ASSIGNMENT', id: 'review-appointment' })
    await publish()
    expect(allowed()).toBe('denied')
    const beforeRejected = await read()
    const forged = structuredClone(document)
    forged.draft.rolePermissionGrants.push({ id: 'forged-admin-review', roleId: 'role-orgmaster-admin', permissionId: permission.id, effect: 'allow' })
    await expect(write(forged)).rejects.toThrow(/ADMINISTRATION_CONFLICT/)
    await expect(write(document, { ...human.actor, principalAuthEpoch: human.actor.principalAuthEpoch + 1 })).rejects.toThrow(/IDENTITY|SESSION|AUTH|PRINCIPAL/)
    expect(await read()).toEqual(beforeRejected)
    expect(await protectedDefinition()).toEqual(initialDefinition)
    expect((await admin.query(`SELECT has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(jsonb,text,text,text,text,jsonb)','EXECUTE') old,
      has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)','EXECUTE') current`)).rows[0]).toEqual({ old: false, current: true })
  }, { orgmasterRoot: process.cwd(), includeV2Definitions })
}, 120_000)
}
