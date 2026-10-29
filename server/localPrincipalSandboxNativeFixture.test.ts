import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import {
  LOCAL_OWNER_PUBLICATION_VERSION,
  localOrgmasterRoleCatalog,
  ownerGrantsMatchFixture,
} from '../contracts/local-principal-sandbox/v1/owner-publication.mjs'
import {
  buildLocalPrincipalSandboxFixture,
  buildLocalPrincipalSandboxFixtureV2,
  LOCAL_PRINCIPAL_FIXTURE_V2_VERSION,
  LOCAL_SANDBOX_COMPANY_ID,
  readAiPdmRoleCatalogV7,
} from './localPrincipalSandboxFixture.mjs'
import {
  validateAndNormalizeFinancialCatalogRelease,
} from './financialCatalogReleaseStore'
import {
  LocalPrincipalSandboxNativeFixtureError,
  materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof,
  materializeLocalPrincipalSandboxNativeFixture,
  type LocalPrincipalSandboxFmsCatalogPin,
  type LocalPrincipalSandboxPdmV7Readback,
} from './localPrincipalSandboxNativeFixture'
import { readPublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import { publicationSnapshotHash } from '../src/governance/commands'
import { readGovernanceStore } from './orgmasterGovernanceStore'
import { storedGovernanceCatalogs } from './governanceReduction'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'

const stamp = '2026-10-29T12:00:00.000Z'

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(value as Record<string, unknown>).sort()
    .map((key) => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key]))
    .join(',') + '}'
}

/** Unit-test port only; this is not a database readback. */
async function pdmReadbackFixture(): Promise<LocalPrincipalSandboxPdmV7Readback> {
  const catalog = await readPublishedAiPdmRoleCatalog(
    process.cwd(),
    'ai-pdm.role-catalog.2026-10-10.v7',
  )
  return {
    ...catalog,
    sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2',
  } as LocalPrincipalSandboxPdmV7Readback
}

/** Unit-test release built through the real FMS owner validator; not a live release. */
function fmsCatalogPinFixture(): LocalPrincipalSandboxFmsCatalogPin {
  const catalog = {
    formatVersion: 'jf.configuration-catalog.v1',
    applicationId: 'financial-management-system',
    catalogVersion: 'fms.native-fixture-test.v1',
    registryVersion: 'fms.native-fixture-test-registry.v1',
    roles: [{
      stableRoleId: 'role-owner',
      code: 'owner',
      displayName: 'Owner',
      builtIn: true,
      capabilityIds: ['finance.dashboard.view'],
      allowedScopeKinds: ['workspace'],
      assignmentPolicy: 'open' as const,
      roleDefinitionHash: '',
    }],
    publishedAt: stamp,
    publishedBy: {
      principalId: 'test-release-principal',
      employeeId: 'employee-local-test-release',
    },
  }
  const roleBase = { ...catalog.roles[0] }
  delete (roleBase as Partial<typeof catalog.roles[number]>).roleDefinitionHash
  catalog.roles[0].roleDefinitionHash = sha256(canonicalJson(roleBase))
  const artifactUtf8 = canonicalJson(catalog) + '\n'
  const release = {
    applicationId: catalog.applicationId,
    version: catalog.catalogVersion,
    contentSha256: sha256(canonicalJson(catalog)),
    artifactSha256: sha256(artifactUtf8),
    artifactUtf8,
    sourceDraftId: 'test-only-draft',
    sourceDraftRevision: 1,
    createdBy: {
      principalId: catalog.publishedBy.principalId,
      employeeId: catalog.publishedBy.employeeId,
    },
    createdAt: stamp,
  }
  return validateAndNormalizeFinancialCatalogRelease(release, {
    principalId: 'test-release-principal',
    employeeId: 'employee-local-test-release',
    issuer: 'test-only-issuer',
    subject: 'test-only-subject',
    bootstrap: false,
  }) as LocalPrincipalSandboxFmsCatalogPin
}

function fixtureWithFmsGrant(fmsCatalog: LocalPrincipalSandboxFmsCatalogPin) {
  const ownerCatalog = {
    applicationId: 'financial-management-system' as const,
    contractVersion: 'fms.native-fixture-owner-role-catalog.v1',
    catalogVersion: fmsCatalog.catalogVersion,
    catalogSha256: fmsCatalog.contentSha256,
    sourceSha256: fmsCatalog.artifactSha256,
    roles: fmsCatalog.roles.map((role) => ({
      stableRoleId: role.stableRoleId,
      roleDefinitionHash: role.roleDefinitionHash!,
      subjectKind: 'employee' as const,
      assignable: role.assignable,
      allowedScopeKinds: [...role.allowedScopeKinds],
    })),
  }
  return buildLocalPrincipalSandboxFixture({
    ownerRoleDefinitions: { 'financial-management-system': ownerCatalog },
    ownerDirectGrants: [{ scenarioId: 'active', applicationId: 'financial-management-system',
      stableRoleId: 'role-owner', companyId: 'jenfu-machinery', scopeKind: 'workspace',
      scopeRef: 'workspace-jenfu-machinery', grantVersion: 1, status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, grantKind: 'direct' }],
  })
}

function nativeOrgOwnerRoleDefinitions(pdm: LocalPrincipalSandboxPdmV7Readback) {
  const pdmSnapshot = createAiPdmRoleCatalog('valid', pdm.publishedAt, pdm)
  const v2 = createSeedDocumentV2(stamp, pdmSnapshot)
  const v3 = migrateGovernanceV2ToV3(v2, 'synthetic-workspace-revision', pdmSnapshot, stamp)
  const pending = {
    id: 'test-only-pending-version',
    snapshotHash: 'a'.repeat(64),
    policy: v3.draft,
  }
  return localOrgmasterRoleCatalog(pending)
}

function fixtureWithOrgmasterGrant(pdm: LocalPrincipalSandboxPdmV7Readback) {
  const localCatalog = nativeOrgOwnerRoleDefinitions(pdm)
  const ownerRoleDefinitions = {
    orgmaster: {
      ...localCatalog,
      catalogVersion: 'fixture-only-orgmaster-role-bundle',
      catalogSha256: 'b'.repeat(64),
      sourceSha256: 'b'.repeat(64),
    },
  }
  const fixture = buildLocalPrincipalSandboxFixture({
    ownerRoleDefinitions,
    ownerDirectGrants: [{
      scenarioId: 'active',
      applicationId: 'orgmaster',
      stableRoleId: 'role-orgmaster-admin',
      companyId: LOCAL_SANDBOX_COMPANY_ID,
      scopeKind: 'global',
      scopeRef: null,
      grantVersion: 1,
      status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      grantKind: 'direct',
    }],
  })
  return { fixture, ownerRoleDefinitions }
}

function targetRoot() {
  return join(tmpdir(), 'orgmaster-native-fixture-' + randomUUID())
}

function jsonbReorder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(jsonbReorder) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, jsonbReorder(item)])) as T
  }
  return value
}

async function writeMaterializedArtifacts(
  result: ReturnType<typeof materializeLocalPrincipalSandboxNativeFixture>,
  reorderGovernanceJsonb = false,
) {
  for (const artifact of result.persistenceArtifacts) {
    await mkdir(dirname(artifact.localPath), { recursive: true })
    const payload = reorderGovernanceJsonb && artifact.artifactKey === 'orgmaster-governance.v3.json'
      ? jsonbReorder(artifact.payload) : artifact.payload
    const raw = reorderGovernanceJsonb && artifact.artifactKey === 'orgmaster-governance.v3.json'
      ? `${JSON.stringify(payload, null, 2)}\n` : artifact.raw
    await writeFile(artifact.localPath, raw, 'utf8')
  }
}

describe('local principal native fixture materializer', () => {
  it('returns typed missing-input information instead of substituting an FMS bundled catalog', async () => {
    const fixture = buildLocalPrincipalSandboxFixture()
    const pdmCatalogReadback = await pdmReadbackFixture()

    expect(() => materializeLocalPrincipalSandboxNativeFixture({
      fixture,
      sandboxId: 'dev060-native-missing-fms',
      targetRoot: targetRoot(),
      pdmCatalogReadback,
      fmsCatalogPin: undefined as never,
    })).toThrowError(expect.objectContaining({
      code: 'fms_active_application_catalog_pin_required',
      missingInputs: ['fmsCatalogPin'],
    }))
  })

  it('creates owner persistence artifacts and a version-one GovernanceDocumentV3 in memory', async () => {
    const fixture = buildLocalPrincipalSandboxFixture()
    const pdmCatalogReadback = await pdmReadbackFixture()
    const fmsCatalogPin = fmsCatalogPinFixture()
    const root = targetRoot()
    const createdAt = new Date().toISOString()
    const input = {
      fixture,
      sandboxId: 'dev060-native-materializer',
      targetRoot: root,
      pdmCatalogReadback,
      fmsCatalogPin,
      createdAt,
    }
    const result = materializeLocalPrincipalSandboxNativeFixture({
      ...input,
    })
    const repeated = materializeLocalPrincipalSandboxNativeFixture({ ...input })
    // PostgreSQL jsonb returns object keys in its own order. Equal producer
    // metadata must remain valid while role order/content stay pinned.
    const jsonbReadback = JSON.parse(canonicalJson(pdmCatalogReadback)) as LocalPrincipalSandboxPdmV7Readback
    expect(materializeLocalPrincipalSandboxNativeFixture({ ...input, pdmCatalogReadback: jsonbReadback }).fixtureHash).toBe(result.fixtureHash)

    expect(result.status).toBe('materialized-in-memory')
    expect(result.seedable).toBe(true)
    expect(result.databaseName).toBe('jenfu_local_dev060_native_materializer')
    expect(result.workspace.manifest.workspaceVersion).toBe(1)
    expect(result.workspace.currentVersion.state.employees.map((employee) => employee.id).sort())
      .toEqual(fixture.scenarios.map((scenario) => scenario.employeeId).sort())
    expect(result.workspace.currentVersion.state.employees.find((employee) =>
      employee.id === 'employee-local-disabled')?.status).toBe('inactive')
    expect(result.governanceVersion.versionNumber).toBe(1)
    expect(result.governance.activePolicyVersionId).toBe(result.governanceVersion.id)
    expect(result.governanceVersion.policy.identityLinks).toHaveLength(fixture.scenarios.length)
    expect(result.governanceVersion.policy.principalAdmissions).toHaveLength(
      fixture.scenarios.filter((scenario) =>
        scenario.principalStatus === 'active' && scenario.employeeStatus === 'active').length,
    )
    expect(result.governanceVersion.policy.roleAssignments.length).toBeGreaterThan(0)
    expect(result.governanceVersion.externalRoleCatalogs.find((catalog) =>
      catalog.applicationId === 'financial-management-system')?.sourceKind)
      .toBe('application-contract')
    expect(result.persistenceArtifacts).toHaveLength(3)
    expect(result.persistenceArtifacts.every((change) => change.expectedRevision === null)).toBe(true)
    expect(result.persistenceArtifacts.every((change) => change.localPath.startsWith(root))).toBe(true)
    expect(result.inputReadbacks.pdmSourcePath)
      .toBe('postgres:ai_pdm_contract.v_application_role_catalog_v2')
    expect(result.effectiveFixture.fixtureHash).toBe(result.fixtureHash)
    expect(result.inputFixtureHash).toBe(fixture.fixtureHash)
    expect(result.effectiveFixture.fixtureHash).toBe(fixture.fixtureHash)
    expect(result.normalizationChanges).toEqual([])
    expect(result.effectiveFixture.scenarios.map((scenario) => scenario.grants))
      .toEqual(fixture.scenarios.map((scenario) => scenario.grants))
    expect(result.governanceVersion.policy.roleAssignments).toHaveLength(
      fixture.scenarios.reduce((count, scenario) => count + scenario.grants.length, 0),
    )
    const legacyExternal = fixture.scenarios.find((scenario) =>
      scenario.scenarioId === 'catalog-external-specialist')!
    const legacyExternalAssignment = result.governanceVersion.policy.roleAssignments.find((assignment) =>
      assignment.employeeId === legacyExternal.employeeId && assignment.roleId === 'role-external-specialist')!
    expect(legacyExternalAssignment.metadata).toEqual({ sponsorEmployeeId: null, reviewDueAt: null })
    const publicationEvent = result.governance.auditEvents.find((event) =>
      event.entityId === result.governanceVersion.id && event.afterHash === result.governanceVersion.snapshotHash)
    expect(publicationEvent).toMatchObject({
      action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion',
      entityId: result.governanceVersion.id, afterHash: result.governanceVersion.snapshotHash,
      commandHashFormat: 'orgmaster.governance-command.v2',
    })
    expect(repeated.governance.auditEvents).toEqual(result.governance.auditEvents)

    const expiredFixtureGrant = fixture.scenarios.find((scenario) =>
      scenario.scenarioId === 'expired')!.grants[0]
    const expiredNativeGrant = result.governanceVersion.policy.roleAssignments.find((assignment) =>
      assignment.applicationId === 'ai-pdm' && assignment.employeeId ===
        fixture.scenarios.find((scenario) => scenario.scenarioId === 'expired')!.employeeId)!
    expect(expiredNativeGrant.validFrom).toBe(expiredFixtureGrant.validFrom)
    expect(expiredNativeGrant.validTo).toBe(expiredFixtureGrant.validUntil)
    expect(repeated.governanceVersion.snapshotHash).toBe(result.governanceVersion.snapshotHash)
    expect((repeated.governanceVersion.policy.principalAdmissions ?? []).map((admission) =>
      admission.evidenceRefSha256)).toEqual((result.governanceVersion.policy.principalAdmissions ?? []).map((admission) =>
      admission.evidenceRefSha256))
  })

  it('materializes the future external-specialist project expiry, active internal sponsor, review date, and identity anchor', async () => {
    const fixture = buildLocalPrincipalSandboxFixtureV2({ createdAt: stamp })
    const result = materializeLocalPrincipalSandboxNativeFixture({
      fixture,
      sandboxId: 'dev060-native-external-specialist-v2',
      targetRoot: targetRoot(),
      pdmCatalogReadback: await pdmReadbackFixture(),
      fmsCatalogPin: fmsCatalogPinFixture(),
      createdAt: stamp,
    })
    const externalScenario = fixture.scenarios.find((scenario) =>
      scenario.scenarioId === 'catalog-external-specialist')!
    const externalGrant = externalScenario.grants[0]
    const sponsor = fixture.scenarios.find((scenario) => scenario.scenarioId === 'active')!
    const assignment = result.governanceVersion.policy.roleAssignments.find((candidate) =>
      candidate.employeeId === externalScenario.employeeId && candidate.roleId === 'role-external-specialist')!
    const workspaceEmployee = result.workspace.currentVersion.state.employees.find((employee) =>
      employee.id === externalScenario.employeeId)!

    expect(fixture.fixtureVersion).toBe(LOCAL_PRINCIPAL_FIXTURE_V2_VERSION)
    expect(assignment).toMatchObject({
      scope: { kind: 'project', value: externalGrant.scopeRef },
      validFrom: externalGrant.validFrom,
      validTo: externalGrant.validUntil,
      metadata: { sponsorEmployeeId: sponsor.employeeId },
    })
    expect(assignment.metadata.sponsorEmployeeId).not.toBe(externalScenario.employeeId)
    expect(assignment.metadata.reviewDueAt).toBe(
      new Date(Date.parse(externalGrant.validUntil!) - 30 * 24 * 60 * 60 * 1000).toISOString(),
    )
    expect(Date.parse(assignment.metadata.reviewDueAt!)).toBeGreaterThan(Date.parse(externalGrant.validFrom))
    expect(Date.parse(assignment.metadata.reviewDueAt!)).toBeLessThan(Date.parse(externalGrant.validUntil!))
    expect(workspaceEmployee).toMatchObject({ departmentIds: [], primaryAssignmentId: null })
    expect(result.workspace.currentVersion.state.positions).toHaveLength(0)
    expect(result.workspace.currentVersion.state.assignments).toHaveLength(0)
  })

  it('reads the audited seed through the runtime store after JSONB key reordering and a live FMS version change', async () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    vi.stubEnv('ORGMASTER_GOVERNANCE_DATA_DIR', '')
    const pdmCatalogReadback = await pdmReadbackFixture()
    const fmsCatalogPin = fmsCatalogPinFixture()
    const fixture = fixtureWithFmsGrant(fmsCatalogPin)
    const input = { fixture, sandboxId: 'dev060-runtime-history-regression', targetRoot: targetRoot(),
      pdmCatalogReadback, fmsCatalogPin, createdAt: stamp }
    const legacyRoot = targetRoot()
    const legacy = materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof({ ...input, targetRoot: legacyRoot })
    const currentFmsCatalog = await readFinancialRoleCatalog()
    const pinnedFmsCatalog = legacy.governanceVersion.externalRoleCatalogs.find((catalog) =>
      catalog.applicationId === 'financial-management-system')!
    expect(currentFmsCatalog.catalogVersion).not.toBe(pinnedFmsCatalog.catalogVersion)

    const root = targetRoot()
    const materialized = materializeLocalPrincipalSandboxNativeFixture({ ...input, targetRoot: root })
    try {
      await writeMaterializedArtifacts(legacy)
      await expect(readGovernanceStore(legacyRoot)).rejects.toMatchObject({ code: 'GOVERNANCE_READ_FAILED' })

      await writeMaterializedArtifacts(materialized, true)
      const runtimeRead = await readGovernanceStore(root)
      expect(runtimeRead.document.auditEvents).toEqual(materialized.governance.auditEvents)
      expect(storedGovernanceCatalogs(runtimeRead.document)).toEqual(materialized.governanceVersion.externalRoleCatalogs)
      expect(runtimeRead.document.publishedVersions[0].snapshotHash).toBe(materialized.governanceVersion.snapshotHash)
    } finally {
      vi.unstubAllEnvs()
      await rm(legacyRoot, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  })

  it('binds system_admin to the exact fictional Principal and PDM workspace context', async () => {
    const fixture = buildLocalPrincipalSandboxFixture()
    const result = materializeLocalPrincipalSandboxNativeFixture({
      fixture,
      sandboxId: 'dev060-native-principal',
      targetRoot: targetRoot(),
      pdmCatalogReadback: await pdmReadbackFixture(),
      fmsCatalogPin: fmsCatalogPinFixture(),
      createdAt: stamp,
    })
    const privilegedScenario = fixture.scenarios.find((scenario) =>
      scenario.scenarioId === 'catalog-system-admin')!
    const systemAdmin = result.governanceVersion.policy.roleAssignments.find((assignment) =>
      assignment.applicationId === 'ai-pdm' && assignment.roleId === 'role-system-admin')

    expect(systemAdmin).toMatchObject({
      employeeId: privilegedScenario.employeeId,
      subjectKind: 'principal',
      targetPrincipalId: privilegedScenario.principalId,
      scope: { kind: 'global' },
      catalogVersion: 'ai-pdm.role-catalog.2026-10-10.v7',
    })
    expect(result.companyProjection.find((projection) =>
      projection.scenarioId === 'active' && projection.applicationId === 'ai-pdm'))
      .toMatchObject({
        fixtureCompanyId: 'company-jenfu',
        nativeCompanyId: 'company-jenfu',
        representableInNativeAssignment: true,
      })
    expect(result.projectionGaps).toHaveLength(1)
    expect(result.projectionGaps[0]).toMatchObject({
      scenarioId: 'wrong-company',
      fixtureCompanyId: 'company-local-other',
      nativeCompanyId: 'company-jenfu',
    })
  })

  it('binds OrgMaster role catalog metadata after hashing native policy without self-embedding', async () => {
    const pdm = await pdmReadbackFixture()
    const { fixture } = fixtureWithOrgmasterGrant(pdm)
    const result = materializeLocalPrincipalSandboxNativeFixture({
      fixture,
      sandboxId: 'dev060-native-orgmaster',
      targetRoot: targetRoot(),
      pdmCatalogReadback: pdm,
      fmsCatalogPin: fmsCatalogPinFixture(),
      createdAt: stamp,
    })
    const nativeRoleAssignment = result.governanceVersion.policy.roleAssignments.find((assignment) =>
      assignment.applicationId === 'orgmaster')
    const roleCatalog = result.orgmasterRoleCatalog
    const activeScenario = fixture.scenarios.find((scenario) => scenario.scenarioId === 'active')!
    const effectiveScenario = result.effectiveFixture.scenarios.find((scenario) =>
      scenario.scenarioId === 'active')!
    const effectiveOrgGrant = effectiveScenario.grants.find((grant) =>
      grant.applicationId === 'orgmaster')!
    const originalOrgGrant = activeScenario.grants.find((grant) =>
      grant.applicationId === 'orgmaster')!
    const hashPayload = {
      kind: result.governanceVersion.kind,
      policy: result.governanceVersion.policy,
      externalRoleCatalogs: result.governanceVersion.externalRoleCatalogs,
      organizationSnapshot: result.governanceVersion.organizationSnapshot,
      effectState: result.governanceVersion.effectState,
    }

    expect(nativeRoleAssignment?.catalogVersion).toBeNull()
    expect(roleCatalog.catalogVersion).toBe(result.governanceVersion.id)
    expect(roleCatalog.catalogSha256).toBe(result.governanceVersion.snapshotHash)
    expect(effectiveOrgGrant).toMatchObject({
      catalogVersion: result.governanceVersion.id,
      catalogSha256: result.governanceVersion.snapshotHash,
      roleDefinitionHash: roleCatalog.roles.find((role) =>
        role.stableRoleId === effectiveOrgGrant.stableRoleId)?.roleDefinitionHash,
    })
    expect(result.effectiveFixture.fixtureHash).not.toBe(fixture.fixtureHash)
    expect(result.normalizationChanges).toHaveLength(1)
    expect(result.normalizationChanges[0]).toMatchObject({
      scenarioId: 'active',
      applicationId: 'orgmaster',
      stableRoleId: effectiveOrgGrant.stableRoleId,
      reason: 'bound_to_native_published_version',
      previous: {
        catalogVersion: 'fixture-only-orgmaster-role-bundle',
      },
      effective: {
        catalogVersion: result.governanceVersion.id,
        catalogSha256: result.governanceVersion.snapshotHash,
      },
    })
    expect(result.effectiveFixture.scenarios.map((scenario) =>
      scenario.grants.filter((grant) => grant.applicationId !== 'orgmaster')))
      .toEqual(fixture.scenarios.map((scenario) =>
        scenario.grants.filter((grant) => grant.applicationId !== 'orgmaster')))
    expect(result.effectiveFixture.scenarios.map((scenario) => scenario.grants.length))
      .toEqual(fixture.scenarios.map((scenario) => scenario.grants.length))
    const { catalogVersion: _previousVersion, catalogSha256: _previousHash,
      roleDefinitionHash: _previousRoleHash, ...originalOrgGrantFlags } = originalOrgGrant
    const { catalogVersion: _effectiveVersion, catalogSha256: _effectiveHash,
      roleDefinitionHash: _effectiveRoleHash, ...effectiveOrgGrantFlags } = effectiveOrgGrant
    expect(effectiveOrgGrantFlags).toEqual(originalOrgGrantFlags)
    expect(result.effectiveFixture.scenarios.find((scenario) =>
      scenario.scenarioId === 'wrong-company')!.grants[0]?.companyId)
      .toBe('company-local-other')

    const ownerPublicationRow = {
      contract_version: LOCAL_OWNER_PUBLICATION_VERSION,
      principal_issuer: activeScenario.identityIssuer,
      principal_subject: activeScenario.identitySubject,
      principal_id: activeScenario.principalId,
      employee_id: activeScenario.employeeId,
      account_type: activeScenario.accountType,
      employee_status: activeScenario.employeeStatus,
      mapping_version: 1,
      published_at: result.governanceVersion.publishedAt,
      published_version: result.governanceVersion,
      pdm_grants: [],
      pdm_catalog: [],
      fms_authority: null,
    }
    expect(ownerGrantsMatchFixture(
      ownerPublicationRow,
      activeScenario,
      'orgmaster',
      effectiveScenario.grants.filter((grant) => grant.applicationId === 'orgmaster'),
      Date.parse(result.governanceVersion.publishedAt),
    )).toBe(true)
    expect(publicationSnapshotHash(hashPayload)).toBe(result.governanceVersion.snapshotHash)
    expect(JSON.stringify(hashPayload)).not.toContain('orgmaster.local-role-catalog.v1')
    expect(result.governanceVersion.versionNumber).toBe(1)
  })

  it('keeps the native fixture target root disjoint from the repository in both directions', async () => {
    const fixture = buildLocalPrincipalSandboxFixture()
    const input = {
      fixture,
      sandboxId: 'dev060-native-target-root-isolation',
      targetRoot: targetRoot(),
      pdmCatalogReadback: await pdmReadbackFixture(),
      fmsCatalogPin: fmsCatalogPinFixture(),
    }
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    for (const rejectedRoot of [repositoryRoot, join(repositoryRoot, '.native-fixture-output'), dirname(repositoryRoot)]) {
      expect(() => materializeLocalPrincipalSandboxNativeFixture({
        ...input,
        targetRoot: rejectedRoot,
      })).toThrowError(LocalPrincipalSandboxNativeFixtureError)
    }
    expect(materializeLocalPrincipalSandboxNativeFixture(input).databaseName)
      .toBe('jenfu_local_dev060_native_target_root_isolation')
  })

  it('requires database PDM v7 readback and rejects non-owner FMS sources', async () => {
    const fixture = buildLocalPrincipalSandboxFixture()
    const pdmCatalogReadback = await pdmReadbackFixture()
    const fmsCatalogPin = fmsCatalogPinFixture()

    expect(() => materializeLocalPrincipalSandboxNativeFixture({
      fixture,
      sandboxId: 'dev060-native-no-pdm',
      targetRoot: targetRoot(),
      pdmCatalogReadback: {
        ...pdmCatalogReadback,
        sourcePath: 'config/catalogs/ai-pdm-role-catalog.v7.json',
      } as never,
      fmsCatalogPin,
    })).toThrowError(LocalPrincipalSandboxNativeFixtureError)

    expect(() => materializeLocalPrincipalSandboxNativeFixture({
      fixture,
      sandboxId: 'dev060-native-bundled-fms',
      targetRoot: targetRoot(),
      pdmCatalogReadback,
      fmsCatalogPin: {
        ...fmsCatalogPin,
        sourceKind: 'bundled-fixture',
      } as never,
    })).toThrowError(LocalPrincipalSandboxNativeFixtureError)
  })
})
