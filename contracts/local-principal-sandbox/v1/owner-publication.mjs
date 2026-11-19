import { LocalSandboxError, LOCAL_IDENTITY_ISSUER, assertExactKeys, contractDigest } from './protocol.mjs'

export const LOCAL_OWNER_PUBLICATION_VERSION = 'orgmaster.local-principal-publication.v1'
const HASH = /^[a-f0-9]{64}$/
const fail = () => { throw new LocalSandboxError('local_owner_contract_mismatch', 409) }
const object = value => Boolean(value && Object.getPrototypeOf(value) === Object.prototype)
const integer = value => Number.isSafeInteger(Number(value)) && Number(value) >= 1
const instant = value => {
  const result = value instanceof Date ? value.toISOString() : value
  if (typeof result !== 'string' || !Number.isFinite(Date.parse(result))) fail()
  return new Date(result).toISOString()
}
const active = (record, nowMs) => record.status === 'active' && Date.parse(record.validFrom) <= nowMs &&
  (record.validTo === null || Date.parse(record.validTo) > nowMs)

export function validateLocalOwnerPublication(row, scenario) {
  assertExactKeys(row, ['contract_version', 'principal_issuer', 'principal_subject', 'principal_id', 'employee_id',
    'account_type', 'employee_status', 'mapping_version', 'published_at', 'published_version', 'pdm_grants', 'pdm_catalog', 'fms_authority'], 'local_owner_contract_mismatch')
  if (row.contract_version !== LOCAL_OWNER_PUBLICATION_VERSION || row.principal_issuer !== LOCAL_IDENTITY_ISSUER ||
    row.principal_issuer !== scenario.identityIssuer || row.principal_subject !== scenario.identitySubject ||
    row.principal_id !== scenario.principalId || row.employee_id !== scenario.employeeId ||
    row.account_type !== scenario.accountType || row.employee_status !== 'active' || !integer(row.mapping_version)) fail()
  instant(row.published_at)
  const version = row.published_version
  if (!object(version) || version.kind !== 'assignment-governance-v3' || version.hashFormat !== 'orgmaster.sorted-json.v1' ||
    typeof version.id !== 'string' || !version.id || !integer(version.versionNumber) || !HASH.test(version.snapshotHash) ||
    !object(version.policy) || !Array.isArray(version.externalRoleCatalogs) || version.effectState !== 'not-synchronized') fail()
  const payload = { kind: version.kind, policy: version.policy, externalRoleCatalogs: version.externalRoleCatalogs,
    organizationSnapshot: version.organizationSnapshot, effectState: version.effectState }
  if (contractDigest(payload) !== version.snapshotHash) fail()
  for (const name of ['identityLinks', 'applicationRoles', 'permissions', 'rolePermissionGrants', 'roleAssignments']) {
    if (!Array.isArray(version.policy[name])) fail()
  }
  if (version.policy.identityLinks.some(link => link.issuer !== LOCAL_IDENTITY_ISSUER ||
    !/^local-[a-z0-9-]+$/.test(link.principalId) || !/^employee-local-[a-z0-9-]+$/.test(link.employeeId) || !/^local-[a-z0-9-]+$/.test(link.subject))) fail()
  if (!Array.isArray(row.pdm_grants) || !Array.isArray(row.pdm_catalog)) fail()
  return row
}

/** OrgMaster's own roles have no external App catalog. This local descriptor
 * binds their real role, permission and allow/deny definitions to the native
 * published-version hash. It never supplies permissions to an App provider.
 */
export function localOrgmasterRoleCatalog(version) {
  if (!object(version?.policy) || !HASH.test(version.snapshotHash) || typeof version.id !== 'string') fail()
  const policy = version.policy
  const roles = policy.applicationRoles.filter(role => role.applicationId === 'orgmaster' && role.status === 'active')
  const ids = new Set()
  const definitions = roles.map(role => {
    if (typeof role.id !== 'string' || !role.id || ids.has(role.id)) fail()
    ids.add(role.id)
    const grants = policy.rolePermissionGrants.filter(grant => grant.roleId === role.id).toSorted((a, b) => a.id.localeCompare(b.id))
    const permissions = policy.permissions.filter(permission => permission.applicationId === 'orgmaster' &&
      grants.some(grant => grant.permissionId === permission.id)).toSorted((a, b) => a.id.localeCompare(b.id))
    if (grants.some(grant => !permissions.some(permission => permission.id === grant.permissionId))) fail()
    return { stableRoleId: role.id, roleDefinitionHash: contractDigest({ contractVersion: 'orgmaster.local-role-definition.v1', role, permissions, grants }),
      subjectKind: 'employee', assignable: true, allowedScopeKinds: ['global'] }
  })
  return { applicationId: 'orgmaster', contractVersion: 'orgmaster.local-role-catalog.v1', catalogVersion: version.id,
    catalogSha256: version.snapshotHash, sourceSha256: version.snapshotHash, roles: definitions }
}

function externalRole(version, applicationId, catalogVersion, roleId, nativeCatalog = []) {
  const catalogs = version.externalRoleCatalogs.filter(catalog => catalog.applicationId === applicationId && catalog.catalogVersion === catalogVersion)
  if (catalogs.length !== 1) fail()
  const catalog = catalogs[0]
  const frozenV7 = applicationId === 'ai-pdm' && catalogVersion === 'ai-pdm.role-catalog.2026-10-10.v7' &&
    catalog.payloadHash === '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9' && catalog.sourceKind === 'bundled-fixture'
  if (catalog.validationState !== 'valid' || !(frozenV7 || catalog.sourceKind === 'application-contract') || !Array.isArray(catalog.roles)) fail()
  const roles = catalog.roles.filter(role => role.stableRoleId === roleId)
  if (roles.length !== 1 || roles[0].assignable !== true || roles[0].status !== 'active') fail()
  const catalogSha256 = applicationId === 'financial-management-system' ? catalog.contentSha256 : catalog.catalogSha256 ?? catalog.payloadHash
  if (!HASH.test(catalogSha256)) fail()
  if (applicationId === 'ai-pdm') {
    const matching = nativeCatalog.filter(row => row.stable_role_id === roleId)
    if (nativeCatalog.length !== 9 || new Set(nativeCatalog.map(row => row.stable_role_id)).size !== 9 || matching.length !== 1 ||
      nativeCatalog.some(row => row.contract_version !== 'jenfu.platform-entitlement.v1' || row.application_id !== 'ai-pdm' ||
        row.catalog_version !== catalogVersion || row.catalog_sha256 !== catalogSha256) ||
      !HASH.test(matching[0].role_definition_hash) || matching[0].assignable !== true ||
      !Array.isArray(matching[0].allowed_scope_kinds) ||
      contractDigest([...matching[0].allowed_scope_kinds].sort()) !== contractDigest([...roles[0].allowedScopeKinds].sort()) ||
      (roles[0].roleDefinitionHash !== undefined && roles[0].roleDefinitionHash !== matching[0].role_definition_hash)) fail()
    return { catalog, role: { ...roles[0], roleDefinitionHash: matching[0].role_definition_hash }, catalogSha256 }
  }
  if (!HASH.test(roles[0].roleDefinitionHash)) fail()
  return { catalog, role: roles[0], catalogSha256 }
}
function grant(applicationId, companyId, role, catalogVersion, catalogSha256, scopeKind, scopeRef, version, validFrom, validUntil) {
  if (!Array.isArray(role.allowedScopeKinds) || !role.allowedScopeKinds.includes(scopeKind)) fail()
  return { applicationId, companyId, stableRoleId: role.stableRoleId, catalogVersion, catalogSha256,
    roleDefinitionHash: role.roleDefinitionHash, scopeKind, scopeRef, grantVersion: Number(version.versionNumber), status: 'active',
    validFrom: instant(validFrom), validUntil: validUntil === null ? null : instant(validUntil) }
}

export function localGrantsFromOwnerPublication(input, scenario, applicationId, nowMs = Date.now()) {
  const row = validateLocalOwnerPublication(input, scenario), version = row.published_version
  if (applicationId === 'orgmaster') {
    const catalog = localOrgmasterRoleCatalog(version)
    return version.policy.roleAssignments.filter(assignment => assignment.applicationId === 'orgmaster' &&
      assignment.employeeId === scenario.employeeId && active(assignment, nowMs) && assignment.scope?.kind === 'global' &&
      (assignment.subjectKind === 'employee' && assignment.targetPrincipalId === null ||
        assignment.subjectKind === 'principal' && assignment.targetPrincipalId === scenario.principalId))
      .map(assignment => {
        const role = catalog.roles.find(item => item.stableRoleId === assignment.roleId)
        if (!role) fail()
        return grant(applicationId, 'company-jenfu', role, catalog.catalogVersion, catalog.catalogSha256,
          'global', null, version, assignment.validFrom, assignment.validTo)
      })
  }
  if (applicationId === 'ai-pdm') return row.pdm_grants.map(native => {
    if (native.contract_version !== 'jenfu.orgmaster.ai-pdm-principal-grants.v4' || native.principal_id !== scenario.principalId ||
      native.employee_id !== scenario.employeeId || native.application_id !== applicationId || native.grant_kind !== 'direct' ||
      native.assignment_version_id !== version.id || Number(native.assignment_version) !== Number(version.versionNumber) ||
      native.delegation_id !== null) fail()
    const { role, catalogSha256 } = externalRole(version, applicationId, native.catalog_version, native.stable_role_id, row.pdm_catalog)
    // Native PDM company context is company-jenfu; company isolation is enforced
    // again by its native account and resource guards, inside the task-only DB.
    return grant(applicationId, 'company-jenfu', role, native.catalog_version, catalogSha256,
      native.scope_kind, native.scope_kind === 'global' ? null : native.scope_key,
      version, native.valid_from, native.valid_until)
  })
  if (applicationId === 'financial-management-system') {
    const authority = row.fms_authority
    if (authority === null) return []
    if (!object(authority) || authority.contract_version !== 'jenfu.orgmaster.fms-authority.v2' ||
      authority.manifest_hash !== 'a7a12188c7b1bb1860f008edfca1abaced2fe3c4afa144c5457f1b5b83c571bb' ||
      authority.application_id !== applicationId || authority.principal_id !== scenario.principalId ||
      authority.employee_id !== scenario.employeeId || authority.assignment_version !== version.id ||
      !Array.isArray(authority.assignments) || Math.abs(Date.parse(instant(authority.read_at)) - nowMs) > 10000) fail()
    return authority.assignments.map(assignment => {
      if (assignment.principalId !== scenario.principalId || assignment.employeeId !== scenario.employeeId ||
        assignment.assignmentVersion !== version.id || assignment.revokedAt !== null ||
        assignment.catalogVersion !== authority.catalog_version || assignment.catalogSha256 !== authority.catalog_content_sha256 ||
        assignment.scope?.kind !== 'workspace' || assignment.scope.key !== 'company-jenfu') fail()
      const { role, catalogSha256 } = externalRole(version, applicationId, assignment.catalogVersion, assignment.stableRoleId)
      if (catalogSha256 !== authority.catalog_content_sha256) fail()
      return grant(applicationId, 'jenfu-machinery', role, assignment.catalogVersion, catalogSha256,
        'workspace', 'company-jenfu', version, assignment.validFrom, assignment.validUntil)
    })
  }
  fail()
}

export function ownerGrantsMatchFixture(row, scenario, applicationId, expectedGrants, nowMs = Date.now()) {
  const observed = localGrantsFromOwnerPublication(row, scenario, applicationId, nowMs)
  const sort = values => values.map(value => contractDigest(value)).sort()
  return contractDigest(sort(observed)) === contractDigest(sort(expectedGrants))
}

/** Runtime readiness compares the fixed fixture's authority, while allowing a
 * later native publication to carry the same grants. Bootstrap keeps using the
 * exact comparison above. Role definitions, scope, validity and revocation stay
 * pinned. A later FMS catalog may advance only an exact immutable fixture grant.
 */
export function ownerGrantsMatchFixturePolicy(row, scenario, applicationId, expectedGrants, nowMs = Date.now()) {
  const publication = validateLocalOwnerPublication(row, scenario).published_version
  if (expectedGrants.some(grant => !Number.isSafeInteger(grant.grantVersion) ||
    grant.grantVersion < 1 || grant.grantVersion > Number(publication.versionNumber))) return false
  const currentExpected = expectedGrants.map(grant => ({
    ...grant,
    grantVersion: Number(publication.versionNumber),
    ...(applicationId === 'orgmaster' && grant.grantVersion < Number(publication.versionNumber)
      ? { catalogVersion: publication.id, catalogSha256: publication.snapshotHash } : {}),
  }))
  if (ownerGrantsMatchFixture(row, scenario, applicationId, currentExpected, nowMs)) return true
  if (applicationId !== 'financial-management-system') return false
  const catalogs = publication.externalRoleCatalogs.filter(catalog => catalog.applicationId === applicationId)
  if (catalogs.length !== 1) return false
  const catalog = catalogs[0]
  const advanced = expectedGrants.map(grant => {
    if (grant.grantVersion >= Number(publication.versionNumber) ||
      !Array.isArray(scenario.grants) || !scenario.grants.some(baseline =>
        contractDigest({ ...baseline, grantVersion: grant.grantVersion }) === contractDigest(grant))) return grant
    return { ...grant, grantVersion: Number(publication.versionNumber),
      catalogVersion: catalog.catalogVersion, catalogSha256: catalog.contentSha256 }
  })
  return ownerGrantsMatchFixture(row, scenario, applicationId, advanced, nowMs)
}
