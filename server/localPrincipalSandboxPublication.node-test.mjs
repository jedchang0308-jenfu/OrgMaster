import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AI_PDM_ROLE_CATALOG_V7_SHA256,
  AI_PDM_ROLE_CATALOG_V7_VERSION,
  LOCAL_SANDBOX_COMPANY_ID,
  LOCAL_SANDBOX_WORKSPACE_REF,
  buildLocalPrincipalSandboxFixture,
  readAiPdmRoleCatalogV7,
} from './localPrincipalSandboxFixture.mjs'
import { buildLocalPrincipalSandboxPublicationPlan } from './localPrincipalSandboxPublication.mjs'

test('plans typed owner events and read-only contract queries without claiming live publication', () => {
  const fixture = buildLocalPrincipalSandboxFixture()
  const plan = buildLocalPrincipalSandboxPublicationPlan({ fixture, sandboxId: 'dev060-local-20261029', assignmentVersionNumber: 17 })

  assert.equal(plan.planStatus, 'plan-only')
  assert.equal(plan.executable, false)
  assert.deepEqual(plan.target, {
    applicationId: 'orgmaster',
    sandboxId: 'dev060-local-20261029',
    databaseName: 'jenfu_local_dev060_local_20261029',
    credentialIncluded: false,
  })
  assert.equal(plan.transactionPort.execution, 'not-performed')
  assert.match(plan.transactionPort.writerSql, /orgmaster_core\.write_active_persistence_artifacts_with_identity_fence_v2/u)
  assert.ok(plan.transactionPort.writerSql.includes('$1::jsonb'))
  assert.ok(plan.readbackQueries.every((query) => Array.isArray(query.values)))
  assert.ok(plan.readbackQueries.some((query) => query.text.includes('orgmaster_contract.v_active_principal_accounts_v1')))
  assert.ok(plan.readbackQueries.some((query) => query.text.includes('orgmaster_contract.v_ai_pdm_principal_effective_grants_v4')))
  assert.ok(plan.readbackQueries.some((query) => query.text.includes('ai_pdm_contract.v_application_role_catalog_v2')))
  assert.ok(plan.readbackQueries.every((query) => !/\b(?:orgmaster_core|ai_pdm_core|platform_core)\./u.test(query.text)))
  assert.ok(plan.blockers.includes('ai-pdm_owner_catalog_pin_required'))
  assert.ok(plan.blockers.includes('local_fixture_lifecycle_generation_has_no_owner_event_readback'))
})

test('preserves the v7 system_admin human_privileged exact-Principal global semantics', () => {
  const fixture = buildLocalPrincipalSandboxFixture()
  const plan = buildLocalPrincipalSandboxPublicationPlan({ fixture, sandboxId: 'dev060-system-admin', assignmentVersionNumber: 4 })
  const event = plan.events.find((entry) => entry.scenarioId === 'catalog-system-admin').grants[0]

  assert.equal(event.eventType, 'privileged_assignment_intent')
  assert.equal(event.subjectKind, 'principal')
  assert.equal(event.targetPrincipalId, event.principalId)
  assert.deepEqual(event.scope, { kind: 'global' })
  assert.equal(event.grantVersion, 4)
  assert.ok(plan.blockers.includes('system_admin_requires_privileged_aal2_owner_port'))
  assert.ok(!plan.events.some((entry) => entry.grants.some((grant) => grant.stableRoleId.toLowerCase() === 'defaultadmin')))
})

test('uses company-jenfu as the workspace company scope and keeps negative company and scope cases distinct', () => {
  assert.equal(LOCAL_SANDBOX_COMPANY_ID, 'company-jenfu')
  assert.equal(LOCAL_SANDBOX_WORKSPACE_REF, 'company-jenfu')
  const fixture = buildLocalPrincipalSandboxFixture()
  const plan = buildLocalPrincipalSandboxPublicationPlan({ fixture, sandboxId: 'dev060-company-scope', assignmentVersionNumber: 5 })
  const active = plan.events.find((entry) => entry.scenarioId === 'active').grants[0]
  const wrongCompany = plan.events.find((entry) => entry.scenarioId === 'wrong-company').grants[0]
  const wrongScope = plan.events.find((entry) => entry.scenarioId === 'wrong-scope').grants[0]

  assert.equal(active.scope.value, 'company-jenfu')
  assert.equal(active.companyBridge.source, 'native-workspace-company-scope-key')
  assert.equal(active.companyBridge.ownerCompanyGuardMustRecheck, true)
  assert.equal(wrongCompany.companyBridge.companyId, 'company-local-other')
  assert.equal(wrongCompany.scope.value, 'workspace-local-other')
  assert.equal(wrongCompany.companyBridge.source, 'fixture-context-only')
  assert.equal(wrongScope.companyBridge.companyId, 'company-jenfu')
  assert.equal(wrongScope.scope.value, 'workspace-local-outside-jenfu')
})

test('requires the exact database-read v7 pin and uses the planned published version as grantVersion', () => {
  const fixture = buildLocalPrincipalSandboxFixture()
  const source = readAiPdmRoleCatalogV7()
  const pin = {
    applicationId: 'ai-pdm',
    sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2',
    catalogVersion: AI_PDM_ROLE_CATALOG_V7_VERSION,
    catalogSha256: AI_PDM_ROLE_CATALOG_V7_SHA256,
    roles: source.catalog.roles,
  }
  const plan = buildLocalPrincipalSandboxPublicationPlan({
    fixture,
    sandboxId: 'dev060-pdm-v7',
    assignmentVersionNumber: 29,
    ownerCatalogPins: { aiPdm: pin },
  })

  assert.ok(!plan.blockers.includes('ai-pdm_owner_catalog_pin_required'))
  assert.ok(!plan.blockers.includes('ai_pdm_v7_owner_contract_pin_mismatch'))
  assert.equal(plan.events.find((entry) => entry.scenarioId === 'catalog-rd').grants[0].grantVersion, 29)
  assert.equal(plan.nativeFieldMap.grantVersion,
    'the planned OrgMaster published assignment version number, matching v4.assignment_version; not a per-grant counter')
})

test('pins OrgMaster grants to the native published governance version and explicit shared role bundle', () => {
  const ownerRoleDefinitions = {
    orgmaster: {
      applicationId: 'orgmaster',
      contractVersion: 'orgmaster.synthetic-role-catalog.v1',
      catalogVersion: 'orgmaster.synthetic-role-catalog.2026-10-29.v1',
      catalogSha256: 'c'.repeat(64),
      sourceSha256: 'd'.repeat(64),
      roles: [{
        stableRoleId: 'orgmaster-local-identity-manager',
        roleDefinitionHash: 'e'.repeat(64),
        subjectKind: 'employee',
        assignable: true,
        allowedScopeKinds: ['workspace'],
      }],
    },
  }
  const fixture = buildLocalPrincipalSandboxFixture({
    ownerRoleDefinitions,
    ownerDirectGrants: [{
      scenarioId: 'active',
      applicationId: 'orgmaster',
      stableRoleId: 'orgmaster-local-identity-manager',
      companyId: LOCAL_SANDBOX_COMPANY_ID,
      scopeKind: 'workspace',
      scopeRef: LOCAL_SANDBOX_WORKSPACE_REF,
      grantVersion: 1,
      status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      grantKind: 'direct',
    }],
  })
  const orgmasterPin = {
    applicationId: 'orgmaster',
    sourceKind: 'orgmaster-native-published-version',
    activeVersionId: 'orgmaster-governance-version-12',
    snapshotHash: 'a'.repeat(64),
    roleBundleSharedHash: 'b'.repeat(64),
  }
  const plan = buildLocalPrincipalSandboxPublicationPlan({
    fixture,
    sandboxId: 'dev060-orgmaster-native',
    assignmentVersionNumber: 12,
    ownerRoleDefinitions,
    ownerCatalogPins: { orgmaster: orgmasterPin },
  })
  const orgmasterGrant = plan.events.flatMap((event) => event.grants)
    .find((grant) => grant.applicationId === 'orgmaster')

  assert.ok(!plan.blockers.includes('orgmaster_native_active_published_version_pin_required'))
  assert.equal(orgmasterGrant.catalogVersion, orgmasterPin.activeVersionId)
  assert.equal(orgmasterGrant.catalogSha256, orgmasterPin.snapshotHash)
  assert.equal(orgmasterGrant.roleDefinitionHash, orgmasterPin.roleBundleSharedHash)
  assert.equal(orgmasterGrant.roleHashKind, 'role-bundle-explicit-shared-hash')
  assert.equal(plan.nativePublishedSource.governanceArtifactKey, 'orgmaster-governance.v3.json')
  assert.ok(plan.nativePublishedSource.publicationFields.includes('versionNumber'))
})
test('requires a version readback and rejects non-sandbox database identifiers', () => {
  const fixture = buildLocalPrincipalSandboxFixture()
  const plan = buildLocalPrincipalSandboxPublicationPlan({ fixture, sandboxId: 'dev060-version' })

  assert.ok(plan.blockers.includes('target_assignment_version_number_readback_required'))
  assert.equal(plan.events.find((entry) => entry.scenarioId === 'active').grants[0].grantVersion, null)
  assert.throws(() => buildLocalPrincipalSandboxPublicationPlan({ fixture, sandboxId: 'bad/id' }))
})
