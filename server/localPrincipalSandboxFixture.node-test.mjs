import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeScenarioGrants,
  assertFixtureEnvelope,
  contractDigest,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import {
  AI_PDM_ROLE_CATALOG_V7_SHA256,
  AI_PDM_ROLE_CATALOG_V7_VERSION,
  LOCAL_PRINCIPAL_FIXTURE_VERSION,
  LOCAL_SANDBOX_COMPANY_ID,
  LOCAL_SANDBOX_WORKSPACE_REF,
  buildLocalPrincipalSandboxFixture,
  readAiPdmRoleCatalogV7,
  validateAiPdmRoleCatalogV7,
  validateLocalPrincipalSandboxFixture,
} from './localPrincipalSandboxFixture.mjs'

const BASE_TIME = Date.parse('2026-10-29T00:00:00.000Z')

function errorCode(code) {
  return (error) => error?.code === code
}

function reseal(fixture, mutate) {
  const changed = structuredClone(fixture)
  delete changed.fixtureHash
  mutate(changed)
  changed.fixtureHash = contractDigest(changed)
  return changed
}

test('builds a versioned exact-envelope fixture with all required lifecycle scenarios', () => {
  const source = readAiPdmRoleCatalogV7()
  const fixture = buildLocalPrincipalSandboxFixture({ catalogSource: source })

  assert.equal(fixture.contractVersion, 'jenfu.local-principal-fixtures.v1')
  assert.equal(fixture.fixtureVersion, LOCAL_PRINCIPAL_FIXTURE_VERSION)
  assert.equal(fixture.fixtureHash, contractDigest({
    contractVersion: fixture.contractVersion,
    fixtureVersion: fixture.fixtureVersion,
    scenarios: fixture.scenarios,
  }))
  assert.equal(assertFixtureEnvelope(fixture), fixture)
  assert.deepEqual(
    ['active', 'no-grant', 'wrong-company', 'wrong-scope', 'expired', 'revoked', 'disabled']
      .every((id) => fixture.scenarios.some((scenario) => scenario.scenarioId === id)),
    true,
  )
  assert.ok(fixture.scenarios.every((scenario) =>
    scenario.identityIssuer === 'urn:jenfu:local-principal-sandbox' &&
    scenario.principalId.startsWith('local-') &&
    scenario.employeeId.startsWith('employee-local-') &&
    scenario.identitySubject.startsWith('local-')))
})

test('uses the exact nine v7 role IDs, hashes, account types, and allowed scopes', () => {
  const source = readAiPdmRoleCatalogV7()
  const fixture = buildLocalPrincipalSandboxFixture({ catalogSource: source })

  assert.equal(source.catalog.catalogVersion, AI_PDM_ROLE_CATALOG_V7_VERSION)
  assert.equal(source.catalog.catalogSha256, AI_PDM_ROLE_CATALOG_V7_SHA256)
  assert.equal(source.catalog.roles.length, 9)
  for (const role of source.catalog.roles) {
    const scenarioId = 'catalog-' + role.roleCode.replaceAll('_', '-')
    const scenario = fixture.scenarios.find((entry) => entry.scenarioId === scenarioId)
    assert.ok(scenario, 'missing role scenario ' + role.roleCode)
    assert.equal(scenario.grants.length, 1)
    assert.equal(scenario.grants[0].applicationId, 'ai-pdm')
    assert.equal(scenario.grants[0].stableRoleId, role.stableRoleId)
    assert.equal(scenario.grants[0].catalogVersion, AI_PDM_ROLE_CATALOG_V7_VERSION)
    assert.equal(scenario.grants[0].catalogSha256, AI_PDM_ROLE_CATALOG_V7_SHA256)
    assert.equal(scenario.grants[0].roleDefinitionHash, role.roleDefinitionHash)
    assert.equal(scenario.grants[0].scopeKind, role.allowedScopeKinds[0])
    assert.equal(
      scenario.accountType,
      role.subjectKind === 'principal' ? 'human_privileged' : 'human_personal',
    )
  }

  const systemAdmin = fixture.scenarios.find((entry) => entry.scenarioId === 'catalog-system-admin')
  assert.equal(systemAdmin.accountType, 'human_privileged')
  assert.deepEqual(systemAdmin.grants.map((grant) => [grant.scopeKind, grant.scopeRef]), [['global', null]])
  assert.equal(fixture.scenarios.find((entry) => entry.scenarioId === 'active').grants.length, 1)
  assert.equal(fixture.scenarios.find((entry) => entry.scenarioId === 'active').grants[0].stableRoleId, 'role-rd')

  const external = fixture.scenarios.find((entry) => entry.scenarioId === 'catalog-external-specialist')
  assert.equal(external.grants[0].scopeKind, 'project')
  assert.equal(external.grants[0].scopeRef, 'project-local-jenfu')
})

test('keeps grant, company, scope, lifecycle, and disabled cases distinct', () => {
  const fixture = buildLocalPrincipalSandboxFixture()
  const scenario = (id) => fixture.scenarios.find((entry) => entry.scenarioId === id)

  assert.equal(activeScenarioGrants(fixture, 'active', 'ai-pdm', BASE_TIME).grants[0].stableRoleId, 'role-rd')
  assert.throws(() => activeScenarioGrants(fixture, 'no-grant', 'ai-pdm', BASE_TIME), errorCode('local_access_denied'))
  assert.throws(() => activeScenarioGrants(fixture, 'expired', 'ai-pdm', BASE_TIME), errorCode('local_access_denied'))
  assert.throws(() => activeScenarioGrants(fixture, 'revoked', 'ai-pdm', BASE_TIME), errorCode('local_access_denied'))
  assert.throws(() => activeScenarioGrants(fixture, 'disabled', 'ai-pdm', BASE_TIME), errorCode('local_principal_inactive'))

  assert.notEqual(scenario('wrong-company').grants[0].companyId, LOCAL_SANDBOX_COMPANY_ID)
  assert.equal(scenario('wrong-scope').grants[0].companyId, LOCAL_SANDBOX_COMPANY_ID)
  assert.notEqual(scenario('wrong-scope').grants[0].scopeRef, LOCAL_SANDBOX_WORKSPACE_REF)
  assert.equal(scenario('expired').grants[0].status, 'active')
  assert.ok(Date.parse(scenario('expired').grants[0].validUntil) < BASE_TIME)
  assert.equal(scenario('revoked').grants[0].status, 'revoked')
  assert.equal(scenario('disabled').principalStatus, 'disabled')
  assert.equal(scenario('disabled').employeeStatus, 'inactive')
})

test('pins v7 version and catalog hash and rejects a mismatched raw source hash', () => {
  const source = readAiPdmRoleCatalogV7()
  assert.equal(validateAiPdmRoleCatalogV7(source, {
    catalogVersion: AI_PDM_ROLE_CATALOG_V7_VERSION,
    catalogSha256: AI_PDM_ROLE_CATALOG_V7_SHA256,
    sourceSha256: source.sourceSha256,
  }).sourceSha256, source.sourceSha256)

  assert.throws(() => readAiPdmRoleCatalogV7({ catalogVersion: 'ai-pdm.role-catalog.2026-09-28.v5' }), errorCode('local_catalog_source_mismatch'))
  assert.throws(() => readAiPdmRoleCatalogV7({ catalogSha256: '0'.repeat(64) }), errorCode('local_catalog_source_mismatch'))
  assert.throws(() => readAiPdmRoleCatalogV7({ expectedSourceSha256: '0'.repeat(64) }), errorCode('local_catalog_source_mismatch'))
  assert.throws(() => validateAiPdmRoleCatalogV7(source, {
    catalogVersion: AI_PDM_ROLE_CATALOG_V7_VERSION,
    catalogSha256: AI_PDM_ROLE_CATALOG_V7_SHA256,
    sourceSha256: '0'.repeat(64),
  }), errorCode('local_catalog_source_mismatch'))
})

test('rejects altered catalog content, role hashes, fixture hashes, versions, and identities', () => {
  const source = readAiPdmRoleCatalogV7()
  const alteredCatalog = structuredClone(source)
  alteredCatalog.catalog.roles[0].permissions[0].allowed = !alteredCatalog.catalog.roles[0].permissions[0].allowed
  assert.throws(() => validateAiPdmRoleCatalogV7(alteredCatalog), errorCode('local_catalog_invalid'))

  const badRoleHash = structuredClone(source)
  badRoleHash.catalog.roles[0].roleDefinitionHash = '0'.repeat(64)
  assert.throws(() => validateAiPdmRoleCatalogV7(badRoleHash), errorCode('local_catalog_invalid'))

  const fixture = buildLocalPrincipalSandboxFixture({ catalogSource: source })
  assert.throws(() => validateLocalPrincipalSandboxFixture({
    ...fixture,
    fixtureHash: '0'.repeat(64),
  }), errorCode('local_fixture_mismatch'))

  const wrongVersion = reseal(fixture, (value) => { value.fixtureVersion = 'orgmaster.local-principal-fixtures.v2' })
  assert.throws(() => validateLocalPrincipalSandboxFixture(wrongVersion), errorCode('local_fixture_version_mismatch'))

  const realIdentity = reseal(fixture, (value) => {
    value.scenarios[0].identityIssuer = 'https://accounts.example.invalid'
  })
  assert.throws(() => validateLocalPrincipalSandboxFixture(realIdentity), errorCode('local_fixture_invalid'))
})

test('uses only owner-supplied OrgMaster or FMS role definitions for those applications', () => {
  const ownerRoleDefinitions = {
    orgmaster: {
      applicationId: 'orgmaster',
      contractVersion: 'orgmaster.synthetic-role-catalog.v1',
      catalogVersion: 'orgmaster.synthetic-role-catalog.2026-10-29.v1',
      catalogSha256: 'a'.repeat(64),
      sourceSha256: 'b'.repeat(64),
      roles: [{
        stableRoleId: 'orgmaster-local-identity-manager',
        roleDefinitionHash: 'c'.repeat(64),
        subjectKind: 'employee',
        assignable: true,
        allowedScopeKinds: ['workspace'],
      }],
    },
  }
  const ownerDirectGrants = [{
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
  }]
  const fixture = buildLocalPrincipalSandboxFixture({ ownerRoleDefinitions, ownerDirectGrants })
  const ownerGrant = fixture.scenarios.find((entry) => entry.scenarioId === 'active')
    .grants.find((grant) => grant.applicationId === 'orgmaster')
  assert.deepEqual(ownerGrant, {
    applicationId: 'orgmaster',
    companyId: LOCAL_SANDBOX_COMPANY_ID,
    stableRoleId: 'orgmaster-local-identity-manager',
    catalogVersion: 'orgmaster.synthetic-role-catalog.2026-10-29.v1',
    catalogSha256: 'a'.repeat(64),
    roleDefinitionHash: 'c'.repeat(64),
    scopeKind: 'workspace',
    scopeRef: LOCAL_SANDBOX_WORKSPACE_REF,
    grantVersion: 1,
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  })
  assert.equal(Object.hasOwn(ownerGrant, 'permissions'), false)
  assert.equal(assertFixtureEnvelope(fixture), fixture)
  assert.throws(() => buildLocalPrincipalSandboxFixture({
    ownerDirectGrants: [{ ...ownerDirectGrants[0], grantKind: 'delegated' }],
  }), errorCode('local_owner_grant_invalid'))
  assert.throws(() => buildLocalPrincipalSandboxFixture({
    ownerRoleDefinitions: {
      orgmaster: { ...ownerRoleDefinitions.orgmaster, applicationId: 'ai-pdm' },
    },
    ownerDirectGrants,
  }), errorCode('local_owner_catalog_invalid'))
})
