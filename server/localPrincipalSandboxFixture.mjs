import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LOCAL_FIXTURE_VERSION,
  LOCAL_IDENTITY_ISSUER,
  LocalSandboxError,
  assertExactKeys,
  assertFixtureEnvelope,
  contractDigest,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'

export const AI_PDM_ROLE_CATALOG_V7_VERSION = 'ai-pdm.role-catalog.2026-10-10.v7'
export const AI_PDM_ROLE_CATALOG_V7_SHA256 = '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9'
export const LOCAL_PRINCIPAL_FIXTURE_VERSION = 'orgmaster.local-principal-fixtures.2026-10-29.v1'
export const LOCAL_PRINCIPAL_FIXTURE_V2_VERSION = 'orgmaster.local-principal-fixtures.2026-10-30.v2'
export const LOCAL_EXTERNAL_SPECIALIST_TERM_DAYS = 90
export const LOCAL_SANDBOX_COMPANY_ID = 'company-jenfu'
export const LOCAL_SANDBOX_WORKSPACE_REF = 'company-jenfu'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_RELATIVE_PATH = 'config/catalogs/ai-pdm-role-catalog.v7.json'
const HASH_PATTERN = /^[a-f0-9]{64}$/u
const ROLE_KEYS = [
  'stableRoleId', 'roleCode', 'displayName', 'assignable', 'risk', 'subjectKind',
  'recommendationAllowed', 'delegationAllowed', 'allowedScopeKinds', 'assignmentTier',
  'permissions', 'roleDefinitionHash',
]
const EXPECTED_ROLES = [
  { stableRoleId: 'role-rd', roleCode: 'rd', subjectKind: 'employee', scope: 'workspace', hash: 'c876a59eb9398fe0cffdb742df0544eda4a84bf921dc65e05b77de3b3e3a848c' },
  { stableRoleId: 'role-rd-manager', roleCode: 'rd_manager', subjectKind: 'employee', scope: 'workspace', hash: 'a45616a32478f475c9759a4c25c0e5e528a4efd8ae57ef7f01a17026db538247' },
  { stableRoleId: 'role-qa', roleCode: 'qa', subjectKind: 'employee', scope: 'workspace', hash: '8cd170a02064590b53926af7d93b0cdb03d98605df5ca396aa891f2b44dc7875' },
  { stableRoleId: 'role-manufacturing', roleCode: 'manufacturing', subjectKind: 'employee', scope: 'workspace', hash: '39f27d8a6674f3ecba37ad42f6b9442c4fe9c09807f1ab72f78e00ab9191a4e6' },
  { stableRoleId: 'role-production-planning', roleCode: 'production_planning', subjectKind: 'employee', scope: 'workspace', hash: '2f2833c7cbc6324e36fe2f9dcc23876c2e1b45ff83abe8afb7dd43b9888e0305' },
  { stableRoleId: 'role-procurement', roleCode: 'procurement', subjectKind: 'employee', scope: 'workspace', hash: '4dc4ce62fa28ef86f9353dcd59588056788a9b962bcb2b1393e253728e6024d9' },
  { stableRoleId: 'role-external-specialist', roleCode: 'external_specialist', subjectKind: 'employee', scope: 'project', hash: 'ec9cb497e7ae3c8984ab6d39d1f7e71e6410e1bc3b07fd3076bed562581464df' },
  { stableRoleId: 'role-pdm-admin', roleCode: 'pdm_admin', subjectKind: 'employee', scope: 'workspace', hash: '7cc9287ad5512b7523d9198a4af641b7d83cd142bc4fddeb416dfb9b602660ab' },
  { stableRoleId: 'role-system-admin', roleCode: 'system_admin', subjectKind: 'principal', scope: 'global', hash: 'dba9885fd76af1a646b02018d809ff868ae90ea6a047553011f35f24bb89f815' },
]

function fail(code) {
  throw new LocalSandboxError(code, 409)
}

function rawSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalRole(role) {
  return JSON.stringify({
    stableRoleId: role.stableRoleId,
    roleCode: role.roleCode,
    displayName: role.displayName,
    assignable: role.assignable,
    risk: role.risk,
    subjectKind: role.subjectKind,
    recommendationAllowed: role.recommendationAllowed,
    delegationAllowed: role.delegationAllowed,
    allowedScopeKinds: [...role.allowedScopeKinds].sort(),
    assignmentTier: role.assignmentTier,
    permissions: [...role.permissions].sort((left, right) =>
      (left.kind + ':' + left.code + ':' + left.allowed).localeCompare(right.kind + ':' + right.code + ':' + right.allowed)),
    metadata: role.metadata ?? null,
  })
}

function canonicalCatalog(catalog) {
  return JSON.stringify({
    contractVersion: catalog.contractVersion,
    applicationId: catalog.applicationId,
    catalogVersion: catalog.catalogVersion,
    roles: catalog.roles.map((role) => ({
      ...JSON.parse(canonicalRole(role)),
      roleDefinitionHash: role.roleDefinitionHash,
    })),
  })
}

function assertCatalogShape(catalog) {
  assertExactKeys(catalog, [
    'contractVersion', 'applicationId', 'catalogVersion', 'publishedAt', 'roles', 'catalogSha256',
  ], 'local_catalog_invalid')
  if (catalog.contractVersion !== 'jenfu.platform-entitlement.v1' ||
    catalog.applicationId !== 'ai-pdm' ||
    catalog.catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION ||
    catalog.catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256 ||
    !HASH_PATTERN.test(catalog.catalogSha256) ||
    typeof catalog.publishedAt !== 'string' || !Number.isFinite(Date.parse(catalog.publishedAt)) ||
    !Array.isArray(catalog.roles) || catalog.roles.length !== EXPECTED_ROLES.length) {
    fail('local_catalog_invalid')
  }

  const stableIds = new Set()
  const roleCodes = new Set()
  for (let index = 0; index < EXPECTED_ROLES.length; index += 1) {
    const role = catalog.roles[index]
    const expected = EXPECTED_ROLES[index]
    assertExactKeys(role, Object.hasOwn(role, 'metadata') ? [...ROLE_KEYS, 'metadata'] : ROLE_KEYS, 'local_catalog_invalid')
    if (role.stableRoleId !== expected.stableRoleId || role.roleCode !== expected.roleCode ||
      role.subjectKind !== expected.subjectKind || role.roleDefinitionHash !== expected.hash ||
      role.assignable !== true || !Array.isArray(role.allowedScopeKinds) ||
      role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== expected.scope ||
      !Array.isArray(role.permissions) ||
      stableIds.has(role.stableRoleId) || roleCodes.has(role.roleCode) ||
      rawSha256(Buffer.from(canonicalRole(role), 'utf8')) !== role.roleDefinitionHash) {
      fail('local_catalog_invalid')
    }
    for (const permission of role.permissions) {
      assertExactKeys(permission, ['code', 'kind', 'allowed'], 'local_catalog_invalid')
      if (typeof permission.code !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,159}$/u.test(permission.code) ||
        !['page', 'action'].includes(permission.kind) || typeof permission.allowed !== 'boolean') {
        fail('local_catalog_invalid')
      }
    }
    stableIds.add(role.stableRoleId)
    roleCodes.add(role.roleCode)
  }

  if (rawSha256(Buffer.from(canonicalCatalog(catalog), 'utf8')) !== AI_PDM_ROLE_CATALOG_V7_SHA256) {
    fail('local_catalog_invalid')
  }
  return catalog
}

function assertCatalogSource(source, {
  catalogVersion = AI_PDM_ROLE_CATALOG_V7_VERSION,
  catalogSha256 = AI_PDM_ROLE_CATALOG_V7_SHA256,
  sourceSha256 = source?.sourceSha256,
} = {}) {
  assertExactKeys(source, ['catalog', 'sourceSha256'], 'local_catalog_invalid')
  if (catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION ||
    catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256 ||
    typeof sourceSha256 !== 'string' || !HASH_PATTERN.test(sourceSha256) ||
    source.sourceSha256 !== sourceSha256) {
    fail('local_catalog_source_mismatch')
  }
  assertCatalogShape(source.catalog)
  return source
}

export function validateAiPdmRoleCatalogV7(source, options = {}) {
  return assertCatalogSource(source, options)
}

export function readAiPdmRoleCatalogV7({
  root = REPOSITORY_ROOT,
  catalogVersion = AI_PDM_ROLE_CATALOG_V7_VERSION,
  catalogSha256 = AI_PDM_ROLE_CATALOG_V7_SHA256,
  expectedSourceSha256,
} = {}) {
  if (catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION ||
    catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256) {
    fail('local_catalog_source_mismatch')
  }
  let bytes
  try {
    bytes = readFileSync(resolve(root, CATALOG_RELATIVE_PATH))
  } catch {
    throw new LocalSandboxError('local_catalog_unavailable', 503)
  }
  const sourceSha256 = rawSha256(bytes)
  if (expectedSourceSha256 !== undefined &&
    (typeof expectedSourceSha256 !== 'string' || !HASH_PATTERN.test(expectedSourceSha256) ||
      expectedSourceSha256 !== sourceSha256)) {
    fail('local_catalog_source_mismatch')
  }
  let catalog
  try {
    catalog = JSON.parse(bytes.toString('utf8'))
  } catch {
    fail('local_catalog_invalid')
  }
  return assertCatalogSource({ catalog, sourceSha256 }, {
    catalogVersion,
    catalogSha256,
    sourceSha256,
  })
}

function isRecord(value) {
  return Boolean(value && Object.getPrototypeOf(value) === Object.prototype)
}

function validateOwnerRoleDefinitions(ownerRoleDefinitions = {}) {
  if (!isRecord(ownerRoleDefinitions)) fail('local_owner_catalog_invalid')
  const catalogs = new Map()
  for (const [applicationId, catalog] of Object.entries(ownerRoleDefinitions)) {
    if (!['orgmaster', 'financial-management-system'].includes(applicationId)) {
      fail('local_owner_catalog_invalid')
    }
    assertExactKeys(catalog, [
      'applicationId', 'contractVersion', 'catalogVersion', 'catalogSha256', 'sourceSha256', 'roles',
    ], 'local_owner_catalog_invalid')
    if (catalog.applicationId !== applicationId ||
      typeof catalog.contractVersion !== 'string' || !catalog.contractVersion ||
      typeof catalog.catalogVersion !== 'string' || !catalog.catalogVersion ||
      !HASH_PATTERN.test(catalog.catalogSha256) || !HASH_PATTERN.test(catalog.sourceSha256) ||
      !Array.isArray(catalog.roles) || catalog.roles.length === 0) {
      fail('local_owner_catalog_invalid')
    }
    const roles = new Map()
    for (const role of catalog.roles) {
      assertExactKeys(role, [
        'stableRoleId', 'roleDefinitionHash', 'subjectKind', 'assignable', 'allowedScopeKinds',
      ], 'local_owner_catalog_invalid')
      if (typeof role.stableRoleId !== 'string' || !role.stableRoleId ||
        !HASH_PATTERN.test(role.roleDefinitionHash) ||
        !['employee', 'principal'].includes(role.subjectKind) ||
        typeof role.assignable !== 'boolean' ||
        !Array.isArray(role.allowedScopeKinds) || role.allowedScopeKinds.length === 0 ||
        role.allowedScopeKinds.some((scope) => typeof scope !== 'string' || !scope) ||
        roles.has(role.stableRoleId)) {
        fail('local_owner_catalog_invalid')
      }
      roles.set(role.stableRoleId, role)
    }
    catalogs.set(applicationId, { catalog, roles })
  }
  return catalogs
}

function accountTypeForSubjectKind(subjectKind) {
  if (subjectKind === 'employee') return 'human_personal'
  if (subjectKind === 'principal') return 'human_privileged'
  fail('local_fixture_invalid')
}

function localIdentity(scenarioId) {
  return {
    principalId: 'local-' + scenarioId,
    employeeId: 'employee-local-' + scenarioId,
    identityIssuer: LOCAL_IDENTITY_ISSUER,
    identitySubject: 'local-' + scenarioId,
  }
}

function makeScenario(scenarioId, label, {
  role = null,
  companyId = LOCAL_SANDBOX_COMPANY_ID,
  scopeRef,
  status = 'active',
  validFrom = '2026-01-01T00:00:00.000Z',
  validUntil = null,
  principalStatus = 'active',
  employeeStatus = 'active',
} = {}) {
  const identity = localIdentity(scenarioId)
  const roleScopeKind = role?.allowedScopeKinds[0]
  const roleScopeRef = roleScopeKind === 'global'
    ? null
    : scopeRef ?? (roleScopeKind === 'project' ? 'project-local-jenfu' : LOCAL_SANDBOX_WORKSPACE_REF)
  const grants = role ? [{
    applicationId: 'ai-pdm',
    companyId,
    stableRoleId: role.stableRoleId,
    catalogVersion: AI_PDM_ROLE_CATALOG_V7_VERSION,
    catalogSha256: AI_PDM_ROLE_CATALOG_V7_SHA256,
    roleDefinitionHash: role.roleDefinitionHash,
    scopeKind: roleScopeKind,
    scopeRef: roleScopeRef,
    grantVersion: 1,
    status,
    validFrom,
    validUntil,
  }] : []
  return {
    scenarioId,
    label: 'Synthetic fixture: ' + label,
    ...identity,
    accountType: role ? accountTypeForSubjectKind(role.subjectKind) : 'human_personal',
    principalStatus,
    employeeStatus,
    accountLifecycleVersion: 1,
    profileVersion: 1,
    grants,
  }
}

function validateOwnerDirectGrants(ownerDirectGrants, ownerCatalogs, scenarios) {
  if (!Array.isArray(ownerDirectGrants)) fail('local_owner_grant_invalid')
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]))
  const grantsByScenario = new Map()
  for (const assignment of ownerDirectGrants) {
    assertExactKeys(assignment, [
      'scenarioId', 'applicationId', 'stableRoleId', 'companyId', 'scopeKind', 'scopeRef',
      'grantVersion', 'status', 'validFrom', 'validUntil', 'grantKind',
    ], 'local_owner_grant_invalid')
    if (assignment.grantKind !== 'direct' ||
      !['orgmaster', 'financial-management-system'].includes(assignment.applicationId)) {
      fail('local_owner_grant_invalid')
    }
    const scenario = scenarioById.get(assignment.scenarioId)
    const ownerCatalog = ownerCatalogs.get(assignment.applicationId)
    const role = ownerCatalog?.roles.get(assignment.stableRoleId)
    if (!scenario || !ownerCatalog || !role || !role.assignable ||
      (role.subjectKind === 'employee' && scenario.accountType !== 'human_personal') ||
      (role.subjectKind === 'principal' && scenario.accountType !== 'human_privileged') ||
      !role.allowedScopeKinds.includes(assignment.scopeKind) ||
      typeof assignment.companyId !== 'string' || !assignment.companyId ||
      (assignment.scopeKind === 'global' && assignment.scopeRef !== null) ||
      (assignment.scopeKind !== 'global' && (typeof assignment.scopeRef !== 'string' || !assignment.scopeRef)) ||
      !Number.isSafeInteger(assignment.grantVersion) || assignment.grantVersion < 1 ||
      !['active', 'revoked'].includes(assignment.status) ||
      !Number.isFinite(Date.parse(assignment.validFrom)) ||
      !(assignment.validUntil === null || Number.isFinite(Date.parse(assignment.validUntil))) ||
      (assignment.validUntil !== null && Date.parse(assignment.validUntil) <= Date.parse(assignment.validFrom))) {
      fail('local_owner_grant_invalid')
    }
    const grant = {
      applicationId: assignment.applicationId,
      companyId: assignment.companyId,
      stableRoleId: role.stableRoleId,
      catalogVersion: ownerCatalog.catalog.catalogVersion,
      catalogSha256: ownerCatalog.catalog.catalogSha256,
      roleDefinitionHash: role.roleDefinitionHash,
      scopeKind: assignment.scopeKind,
      scopeRef: assignment.scopeRef,
      grantVersion: assignment.grantVersion,
      status: assignment.status,
      validFrom: assignment.validFrom,
      validUntil: assignment.validUntil,
    }
    const existing = grantsByScenario.get(assignment.scenarioId) ?? []
    existing.push(grant)
    grantsByScenario.set(assignment.scenarioId, existing)
  }
  for (const [scenarioId, grants] of grantsByScenario) {
    scenarioById.get(scenarioId).grants.push(...grants)
  }
}

function assertPdmGrantMatchesCatalog(grant, scenario, catalog) {
  const role = catalog.roles.find((candidate) => candidate.stableRoleId === grant.stableRoleId)
  if (!role || !role.assignable ||
    grant.catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION ||
    grant.catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256 ||
    grant.roleDefinitionHash !== role.roleDefinitionHash ||
    accountTypeForSubjectKind(role.subjectKind) !== scenario.accountType ||
    !role.allowedScopeKinds.includes(grant.scopeKind) ||
    (grant.scopeKind === 'global' && grant.scopeRef !== null) ||
    (grant.scopeKind !== 'global' && (typeof grant.scopeRef !== 'string' || !grant.scopeRef)) ||
    (role.roleCode === 'system_admin' &&
      (scenario.accountType !== 'human_privileged' || grant.scopeKind !== 'global' || grant.scopeRef !== null)) ||
    (role.roleCode !== 'system_admin' && grant.scopeKind === 'global')) {
    fail('local_fixture_invalid')
  }
}

export function validateLocalPrincipalSandboxFixture(fixture, {
  catalogSource = readAiPdmRoleCatalogV7(),
  catalogVersion = AI_PDM_ROLE_CATALOG_V7_VERSION,
  catalogSha256 = AI_PDM_ROLE_CATALOG_V7_SHA256,
  sourceSha256 = catalogSource?.sourceSha256,
  fixtureVersion,
  ownerRoleDefinitions = {},
} = {}) {
  assertCatalogSource(catalogSource, { catalogVersion, catalogSha256, sourceSha256 })
  const catalog = catalogSource.catalog
  const ownerCatalogs = validateOwnerRoleDefinitions(ownerRoleDefinitions)
  assertFixtureEnvelope(fixture)
  if (fixture.contractVersion !== LOCAL_FIXTURE_VERSION ||
    ![LOCAL_PRINCIPAL_FIXTURE_VERSION, LOCAL_PRINCIPAL_FIXTURE_V2_VERSION].includes(fixture.fixtureVersion) ||
    fixtureVersion !== undefined && fixture.fixtureVersion !== fixtureVersion) {
    fail('local_fixture_version_mismatch')
  }

  const scenarios = new Map(fixture.scenarios.map((scenario) => [scenario.scenarioId, scenario]))
  for (const required of ['active', 'no-grant', 'wrong-company', 'wrong-scope', 'expired', 'revoked', 'disabled']) {
    if (!scenarios.has(required)) fail('local_fixture_invalid')
  }
  for (const expected of EXPECTED_ROLES) {
    const scenarioId = 'catalog-' + expected.roleCode.replaceAll('_', '-')
    const scenario = scenarios.get(scenarioId)
    if (!scenario) fail('local_fixture_invalid')
    const matches = scenario.grants.filter((grant) => grant.applicationId === 'ai-pdm')
    if (matches.length !== 1) fail('local_fixture_invalid')
    assertPdmGrantMatchesCatalog(matches[0], scenario, catalog)
    if (matches[0].stableRoleId !== expected.stableRoleId) fail('local_fixture_invalid')
  }
  for (const scenario of fixture.scenarios) {
    for (const grant of scenario.grants) {
      if (grant.applicationId === 'ai-pdm') {
        assertPdmGrantMatchesCatalog(grant, scenario, catalog)
      } else {
        const ownerCatalog = ownerCatalogs.get(grant.applicationId)
        const role = ownerCatalog?.roles.get(grant.stableRoleId)
        if (!role || !role.assignable ||
          grant.catalogVersion !== ownerCatalog.catalog.catalogVersion ||
          grant.catalogSha256 !== ownerCatalog.catalog.catalogSha256 ||
          grant.roleDefinitionHash !== role.roleDefinitionHash ||
          accountTypeForSubjectKind(role.subjectKind) !== scenario.accountType ||
          !role.allowedScopeKinds.includes(grant.scopeKind)) {
          fail('local_owner_grant_invalid')
        }
      }
    }
  }

  const active = scenarios.get('active')
  const noGrant = scenarios.get('no-grant')
  const wrongCompany = scenarios.get('wrong-company')
  const wrongScope = scenarios.get('wrong-scope')
  const expired = scenarios.get('expired')
  const revoked = scenarios.get('revoked')
  const disabled = scenarios.get('disabled')
  if (active.accountType !== 'human_personal' || active.principalStatus !== 'active' ||
    active.employeeStatus !== 'active' ||
    !active.grants.some((grant) => grant.applicationId === 'ai-pdm' && grant.stableRoleId === 'role-rd' && grant.status === 'active') ||
    noGrant.grants.length !== 0 ||
    !wrongCompany.grants.some((grant) => grant.applicationId === 'ai-pdm' && grant.companyId !== LOCAL_SANDBOX_COMPANY_ID) ||
    !wrongScope.grants.some((grant) => grant.applicationId === 'ai-pdm' && grant.companyId === LOCAL_SANDBOX_COMPANY_ID && grant.scopeRef !== LOCAL_SANDBOX_WORKSPACE_REF) ||
    !expired.grants.some((grant) => grant.applicationId === 'ai-pdm' && grant.status === 'active' && Date.parse(grant.validUntil) <= Date.parse('2026-10-29T00:00:00.000Z')) ||
    !revoked.grants.some((grant) => grant.applicationId === 'ai-pdm' && grant.status === 'revoked') ||
    disabled.principalStatus !== 'disabled' || disabled.employeeStatus !== 'inactive') {
    fail('local_fixture_invalid')
  }
  if (fixture.fixtureVersion === LOCAL_PRINCIPAL_FIXTURE_V2_VERSION) {
    const external = scenarios.get('catalog-external-specialist')
    const externalGrants = external?.grants.filter((grant) =>
      grant.applicationId === 'ai-pdm' && grant.stableRoleId === 'role-external-specialist') ?? []
    const externalGrant = externalGrants[0]
    if (external?.accountType !== 'human_personal' || external.principalStatus !== 'active' ||
      external.employeeStatus !== 'active' || externalGrants.length !== 1 ||
      externalGrant.scopeKind !== 'project' || !externalGrant.scopeRef ||
      externalGrant.status !== 'active' || externalGrant.validUntil === null ||
      Date.parse(externalGrant.validUntil) <= Date.parse(externalGrant.validFrom)) {
      fail('local_fixture_invalid')
    }
  }
  return fixture
}

function buildLocalPrincipalSandboxFixtureForVersion({
  root = REPOSITORY_ROOT,
  catalogSource,
  catalogVersion = AI_PDM_ROLE_CATALOG_V7_VERSION,
  catalogSha256 = AI_PDM_ROLE_CATALOG_V7_SHA256,
  sourceSha256,
  fixtureVersion,
  externalSpecialistWindow = null,
  ownerRoleDefinitions = {},
  ownerDirectGrants = [],
} = {}) {
  const source = catalogSource ?? readAiPdmRoleCatalogV7({
    root,
    catalogVersion,
    catalogSha256,
    expectedSourceSha256: sourceSha256,
  })
  assertCatalogSource(source, {
    catalogVersion,
    catalogSha256,
    sourceSha256: sourceSha256 ?? source.sourceSha256,
  })
  const rolesByCode = new Map(source.catalog.roles.map((role) => [role.roleCode, role]))
  const roleByCode = (roleCode) => {
    const role = rolesByCode.get(roleCode)
    if (!role) fail('local_catalog_invalid')
    return role
  }

  const scenarios = [
    makeScenario('active', 'active employee with one direct RD grant', { role: roleByCode('rd') }),
    makeScenario('no-grant', 'active employee with no grants'),
    makeScenario('wrong-company', 'active grant for a different synthetic company', {
      role: roleByCode('rd'),
      companyId: 'company-local-other',
      scopeRef: 'workspace-local-other',
    }),
    makeScenario('wrong-scope', 'active grant outside the requested synthetic workspace', {
      role: roleByCode('rd'),
      scopeRef: 'workspace-local-outside-jenfu',
    }),
    makeScenario('expired', 'active grant whose validity period has ended', {
      role: roleByCode('rd'),
      validFrom: '2025-01-01T00:00:00.000Z',
      validUntil: '2025-01-02T00:00:00.000Z',
    }),
    makeScenario('revoked', 'revoked direct grant', {
      role: roleByCode('rd'),
      status: 'revoked',
    }),
    makeScenario('disabled', 'disabled Principal and inactive Employee', {
      role: roleByCode('rd'),
      principalStatus: 'disabled',
      employeeStatus: 'inactive',
    }),
    ...source.catalog.roles.map((role) => makeScenario(
      'catalog-' + role.roleCode.replaceAll('_', '-'),
      'catalog role ' + role.roleCode + ' direct assignment',
      { role, ...(role.roleCode === 'external_specialist' && externalSpecialistWindow
        ? externalSpecialistWindow : {}) },
    )),
  ]

  validateOwnerDirectGrants(ownerDirectGrants, validateOwnerRoleDefinitions(ownerRoleDefinitions), scenarios)
  const payload = {
    contractVersion: LOCAL_FIXTURE_VERSION,
    fixtureVersion,
    scenarios,
  }
  const fixture = { ...payload, fixtureHash: contractDigest(payload) }
  return validateLocalPrincipalSandboxFixture(fixture, {
    catalogSource: source,
    catalogVersion,
    catalogSha256,
    sourceSha256: sourceSha256 ?? source.sourceSha256,
    fixtureVersion,
    ownerRoleDefinitions,
  })
}

export function buildLocalPrincipalSandboxFixture({
  fixtureVersion = LOCAL_PRINCIPAL_FIXTURE_VERSION,
  ...options
} = {}) {
  if (fixtureVersion !== LOCAL_PRINCIPAL_FIXTURE_VERSION) fail('local_fixture_version_mismatch')
  return buildLocalPrincipalSandboxFixtureForVersion({ ...options, fixtureVersion })
}

export function buildLocalPrincipalSandboxFixtureV2({
  createdAt,
  ...options
} = {}) {
  const createdAtMs = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN
  if (!Number.isFinite(createdAtMs)) fail('local_fixture_generation_time_invalid')
  const validFrom = new Date(createdAtMs).toISOString()
  const validUntil = new Date(createdAtMs + LOCAL_EXTERNAL_SPECIALIST_TERM_DAYS * 24 * 60 * 60 * 1000).toISOString()
  return buildLocalPrincipalSandboxFixtureForVersion({
    ...options,
    fixtureVersion: LOCAL_PRINCIPAL_FIXTURE_V2_VERSION,
    externalSpecialistWindow: { validFrom, validUntil },
  })
}
