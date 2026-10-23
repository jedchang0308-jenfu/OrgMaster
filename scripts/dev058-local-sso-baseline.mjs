import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { activeGovernanceArtifact, publishGovernance } from './dev058-dev123-native-fixtures.mjs'

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const BUILTIN_ROLE_COUNT = 9
const MANAGED_LOGIN_ADMISSION_KEY = 'managed-google-login'

function requireText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code)
  return value
}

function requireIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new Error('DEV058_IDENTITY_FACTS_REQUIRED')
  for (const key of ['issuer', 'subject', 'email', 'googleSubject']) requireText(identity[key], `DEV058_IDENTITY_${key.toUpperCase()}_REQUIRED`)
  if (identity.emailVerified !== true) throw new Error('DEV058_IDENTITY_EMAIL_NOT_VERIFIED')
  if (identity.disabled !== false) throw new Error('DEV058_IDENTITY_DISABLED')
}

function requireEqual(actual, expected, code) {
  if (actual !== expected) throw new Error(code)
}

async function preparePdmConfiguration(admin, activeCatalog) {
  const builtinRoleCodes = activeCatalog.roles
    .filter(role => !role.stableRoleId.startsWith('role-custom-'))
    .map(role => role.roleCode)
  requireEqual(builtinRoleCodes.length, BUILTIN_ROLE_COUNT, 'DEV058_BUILTIN_ROLE_COUNT_MISMATCH')

  await admin.query('BEGIN')
  try {
    await admin.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    await admin.query(`INSERT INTO ai_pdm_core.companies(id,company_code,company_kind,display_name)
      VALUES('company-jenfu','JENFU','business','鉦富')
      ON CONFLICT(id) DO NOTHING`)
    await admin.query(`INSERT INTO ai_pdm_core.role_priority_versions(id,version_code,priority_json,status)
      VALUES('dev058-local-sso-priority','dev058-local-sso.v1',$1,'active')
      ON CONFLICT(id) DO NOTHING`, [JSON.stringify(builtinRoleCodes)])
    const company = await admin.query(`SELECT id,company_code,company_kind
      FROM ai_pdm_core.companies WHERE id='company-jenfu'`)
    requireEqual(company.rowCount, 1, 'DEV058_COMPANY_READBACK_MISSING')
    requireEqual(company.rows[0].company_code, 'JENFU', 'DEV058_COMPANY_CODE_MISMATCH')
    requireEqual(company.rows[0].company_kind, 'business', 'DEV058_COMPANY_KIND_MISMATCH')
    const priority = await admin.query(`SELECT version_code,priority_json,status
      FROM ai_pdm_core.role_priority_versions WHERE id='dev058-local-sso-priority'`)
    requireEqual(priority.rowCount, 1, 'DEV058_ROLE_PRIORITY_READBACK_MISSING')
    requireEqual(priority.rows[0].version_code, 'dev058-local-sso.v1', 'DEV058_ROLE_PRIORITY_VERSION_MISMATCH')
    requireEqual(priority.rows[0].priority_json, JSON.stringify(builtinRoleCodes), 'DEV058_ROLE_PRIORITY_CONTENT_MISMATCH')
    requireEqual(priority.rows[0].status, 'active', 'DEV058_ROLE_PRIORITY_STATUS_MISMATCH')
    await admin.query('COMMIT')
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined)
    throw error
  }

  return Object.freeze({ companyId: 'company-jenfu', builtinRoleCount: builtinRoleCodes.length,
    rolePriorityVersion: 'dev058-local-sso.v1' })
}

async function writeWorkspaceAndTargetReservations(admin, { workspaceDocument, manifest, target, now }) {
  await admin.query('BEGIN')
  try {
    await admin.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    for (const [key, payload] of [['orgmaster-workspace.v1.json', manifest], ['orgmaster-versions/current.json', workspaceDocument]]) {
      const serialized = JSON.stringify(payload)
      const hash = sha256(serialized)
      const updated = await admin.query(`UPDATE orgmaster_core.persistence_artifacts
        SET payload=$1::jsonb,source_sha256=$2,canonical_sha256=$2,source_bytes=$3
        WHERE artifact_key=$4
          AND batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)`,
      [serialized, hash, Buffer.byteLength(serialized), key])
      requireEqual(updated.rowCount, 1, `DEV058_WORKSPACE_ARTIFACT_MISSING:${key}`)
    }

    await admin.query(`INSERT INTO orgmaster_core.principal_ownership_reservations(
        principal_id,employee_id,account_type,first_seen_at,source_revision)
      VALUES($1,$2,'human_personal',$3::timestamptz,'dev058-local-sso-baseline')
      ON CONFLICT(principal_id) DO NOTHING`, [target.principalId, target.employeeId, now])
    await admin.query(`INSERT INTO orgmaster_core.principal_identity_reservations(
        principal_issuer,principal_subject,employee_id,first_seen_at,source_kind,source_revision,principal_id)
      VALUES($1,$2,$3,$4::timestamptz,'legacy','dev058-local-sso-baseline',$5)
      ON CONFLICT(principal_issuer,principal_subject) DO NOTHING`,
    [target.issuer, target.subject, target.employeeId, now, target.principalId])
    const owner = await admin.query(`SELECT principal_id,employee_id,account_type
      FROM orgmaster_core.principal_ownership_reservations WHERE principal_id=$1`, [target.principalId])
    requireEqual(owner.rowCount, 1, 'DEV058_TARGET_OWNER_RESERVATION_MISSING')
    requireEqual(owner.rows[0].employee_id, target.employeeId, 'DEV058_TARGET_OWNER_EMPLOYEE_MISMATCH')
    requireEqual(owner.rows[0].account_type, 'human_personal', 'DEV058_TARGET_OWNER_TYPE_MISMATCH')
    const pair = await admin.query(`SELECT principal_issuer,principal_subject,employee_id,principal_id
      FROM orgmaster_core.principal_identity_reservations
      WHERE principal_issuer=$1 AND principal_subject=$2`, [target.issuer, target.subject])
    requireEqual(pair.rowCount, 1, 'DEV058_TARGET_PAIR_RESERVATION_MISSING')
    requireEqual(pair.rows[0].employee_id, target.employeeId, 'DEV058_TARGET_PAIR_EMPLOYEE_MISMATCH')
    requireEqual(pair.rows[0].principal_id, target.principalId, 'DEV058_TARGET_PAIR_PRINCIPAL_MISMATCH')
    await admin.query('COMMIT')
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function enableManagedLoginAdmission(admin) {
  await admin.query('BEGIN')
  try {
    await admin.query('SET LOCAL ROLE jenfu_platform_migrator')
    const before = await admin.query(`SELECT enabled,admission_revision::text AS admission_revision
      FROM platform_core.managed_login_admission
      WHERE admission_key=$1 FOR UPDATE`, [MANAGED_LOGIN_ADMISSION_KEY])
    requireEqual(before.rowCount, 1, 'DEV058_PLATFORM_MANAGED_LOGIN_ADMISSION_MISSING')
    let result
    if (before.rows[0].enabled === true) {
      result = before.rows[0]
    } else {
      const updated = await admin.query(`UPDATE platform_core.managed_login_admission
        SET enabled=true,admission_revision=admission_revision+1,
            updated_at=clock_timestamp(),updated_by='dev058-local-sso-baseline'
        WHERE admission_key=$1 AND enabled=false
        RETURNING enabled,admission_revision::text AS admission_revision`, [MANAGED_LOGIN_ADMISSION_KEY])
      requireEqual(updated.rowCount, 1, 'DEV058_PLATFORM_MANAGED_LOGIN_ADMISSION_UPDATE_FAILED')
      result = updated.rows[0]
    }
    requireEqual(result.enabled, true, 'DEV058_PLATFORM_MANAGED_LOGIN_ADMISSION_NOT_ENABLED')
    await admin.query('COMMIT')
    return Object.freeze({ enabled: true, admissionRevision: String(result.admission_revision), epochSeeded: false })
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

/**
 * Prepare only the local disposable SSO prerequisites. Real Google/Firebase
 * verification, normal sessions, PDM account creation and desiredApply remain
 * caller-owned runtime actions.
 */
export async function prepareLocalSsoBaseline({ admin, orgRuntime, orgRoot, identity }) {
  if (!admin || typeof admin.query !== 'function') throw new TypeError('DEV058_ADMIN_CLIENT_REQUIRED')
  if (!orgRuntime || typeof orgRuntime.query !== 'function') throw new TypeError('DEV058_ORG_RUNTIME_CLIENT_REQUIRED')
  requireText(orgRoot, 'DEV058_ORG_ROOT_REQUIRED')
  requireIdentity(identity)

  const now = new Date().toISOString()
  const managerLink = {
    id: 'identity-link-dev058-google-manager',
    employeeId: 'employee-dev058-google-manager',
    principalId: 'principal-dev058-google-manager',
    issuer: identity.issuer,
    subject: identity.subject,
    status: 'active',
    validFrom: now,
    validTo: null,
  }
  const targetLink = {
    id: 'identity-link-dev058-target',
    employeeId: 'employee-dev058-target',
    principalId: 'principal-dev058-target',
    // A local-only Principal fixture in the configured issuer namespace. No
    // Firebase account or Google sign-in is created for this target.
    issuer: identity.issuer,
    subject: 'subject-dev058-local-sso-target',
    status: 'active',
    validFrom: now,
    validTo: null,
  }

  const catalogReader = await import(new URL('../server/aiPdmRoleCatalogRepository.ts', import.meta.url))
  const orgCatalog = await import(new URL('../src/governance/aiPdmCatalog.ts', import.meta.url))
  const store = await import(new URL('../server/orgmasterGovernanceStore.ts', import.meta.url))
  const documentStorage = await import(new URL('../src/documentStorage.ts', import.meta.url))
  const workspace = await import(new URL('../src/versionWorkspace.ts', import.meta.url))
  const seed = await import(new URL('../src/governance/migrateGovernanceV1ToV2.ts', import.meta.url))
  const migration = await import(new URL('../src/governance/migrateGovernanceV2ToV3.ts', import.meta.url))
  const screenshot = await import(new URL('../src/screenshotData.ts', import.meta.url))
  const validation = await import(new URL('../src/governance/validation.ts', import.meta.url))
  const commands = await import(new URL('../src/governance/commands.ts', import.meta.url))
  const admission = await import(new URL('../src/governance/identityAdmission.ts', import.meta.url))
  const financial = await import(new URL('../server/financialRoleCatalogRepository.ts', import.meta.url))

  const activeCatalog = await catalogReader.readPublishedAiPdmRoleCatalogFromDatabase(orgRuntime)
  const catalog = orgCatalog.createAiPdmRoleCatalog('valid', activeCatalog.publishedAt, activeCatalog)
  const financialCatalog = await financial.readFinancialRoleCatalog('valid', orgRoot)
  const pdmConfiguration = await preparePdmConfiguration(admin, activeCatalog)
  const accountTypeByPrincipal = new Map([
    [managerLink.principalId, 'human_privileged'],
    [targetLink.principalId, 'human_personal'],
  ])

  const state = structuredClone(screenshot.screenshotOrganizationState)
  for (const [link, name] of [[managerLink, 'DEV058 Google manager'], [targetLink, 'DEV058 unassigned target']]) {
    state.employees.push({ ...structuredClone(state.employees[0]), id: link.employeeId, name,
      status: 'active', departmentIds: [], primaryAssignmentId: null })
  }
  const workspaceDocument = documentStorage.createOrgDocumentFile(state, 'document', now)
  const manifest = workspace.createWorkspaceManifest('current', now)
  const governance = migration.migrateGovernanceV2ToV3(
    seed.createSeedDocumentV2(now), 'dev058-local-sso-baseline-v2', catalog, now)
  const links = [managerLink, targetLink]
  governance.draft.identityLinks = links
  governance.draft.principalAdmissions = links.map((link, index) => ({
    id: `dev058-local-sso-admission-${index}`,
    identityLinkId: link.id,
    principalFingerprintSha256: admission.principalFingerprintSha256(link.issuer, link.subject),
    issuerFingerprintSha256: admission.issuerFingerprintSha256(link.issuer),
    accountType: accountTypeByPrincipal.get(link.principalId),
    sharedRetirementState: 'not_applicable',
    status: 'active',
    recordedAt: now,
    evidenceRefSha256: sha256(`dev058-local-sso-admission:${link.id}`),
  }))

  const old = await activeGovernanceArtifact(admin)
  const systemAdminRole = catalog.roles.find(role => role.stableRoleId === 'role-system-admin')
  assert.ok(systemAdminRole, 'DEV058_SYSTEM_ADMIN_CATALOG_ROLE_MISSING')
  requireEqual(systemAdminRole.code, 'system_admin', 'DEV058_SYSTEM_ADMIN_CATALOG_CODE_MISMATCH')
  requireEqual(systemAdminRole.status, 'active', 'DEV058_SYSTEM_ADMIN_CATALOG_STATUS_MISMATCH')
  requireEqual(systemAdminRole.assignable, true, 'DEV058_SYSTEM_ADMIN_CATALOG_NOT_ASSIGNABLE')
  requireEqual(systemAdminRole.subjectKind, 'principal', 'DEV058_SYSTEM_ADMIN_CATALOG_SUBJECT_MISMATCH')
  requireEqual(systemAdminRole.assignmentTier, 'cross_app_override', 'DEV058_SYSTEM_ADMIN_CATALOG_TIER_MISMATCH')
  requireEqual(JSON.stringify(systemAdminRole.allowedScopeKinds), JSON.stringify(['global']), 'DEV058_SYSTEM_ADMIN_CATALOG_SCOPE_MISMATCH')
  const managerGrant = {
    id: 'assignment-dev058-manager-system-admin',
    employeeId: managerLink.employeeId,
    applicationId: 'ai-pdm',
    roleId: systemAdminRole.stableRoleId,
    roleCodeSnapshot: systemAdminRole.code,
    roleNameSnapshot: systemAdminRole.displayName,
    catalogVersion: catalog.catalogVersion,
    scope: { kind: 'global' },
    status: 'active',
    validFrom: now,
    validTo: null,
    effectState: 'not-synchronized',
    basis: 'manual',
    subjectKind: 'principal',
    targetPrincipalId: managerLink.principalId,
    sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: 'bootstrap-fixture',
    createdReason: 'DEV058 local SSO manager baseline',
  }
  governance.draft.roleAssignments = [managerGrant, {
    id: 'dev058-local-sso-orgmaster-admin',
    employeeId: managerLink.employeeId,
    applicationId: 'orgmaster',
    roleId: 'role-orgmaster-admin',
    roleCodeSnapshot: 'orgmaster_admin',
    roleNameSnapshot: 'OrgMaster 管理者',
    catalogVersion: null,
    scope: { kind: 'global' },
    status: 'active',
    validFrom: now,
    validTo: null,
    effectState: 'orgmaster-enforced',
    basis: 'manual',
    sources: [],
    subjectKind: 'employee',
    targetPrincipalId: null,
    createdByPrincipalId: managerLink.principalId,
  }]
  governance.draft.managementGrants = [{
    id: 'dev058-local-sso-cross-app-override',
    principalId: managerLink.principalId,
    employeeId: managerLink.employeeId,
    applicationId: 'ai-pdm',
    capability: 'orgmaster.cross_app_override',
    status: 'active',
    validFrom: now,
    validTo: null,
    grantedByPrincipalId: 'bootstrap-fixture',
    reason: 'DEV058 local SSO manager baseline',
  }]

  await writeWorkspaceAndTargetReservations(admin, { workspaceDocument, manifest, target: targetLink, now })
  const source = await store.loadOrganizationSource(orgRoot)
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = governance.draft
  const publishedPayload = {
    kind: 'assignment-governance-v3',
    policy,
    externalRoleCatalogs: [catalog, financialCatalog],
    organizationSnapshot: validation.buildOrganizationSnapshot(source),
    effectState: 'not-synchronized',
  }
  governance.publishedVersions = [{ ...publishedPayload, id: 'dev058-local-sso-baseline', versionNumber: 1,
    publishedAt: now, publishedByPrincipalId: managerLink.principalId,
    publishReason: 'DEV058 local SSO prerequisite baseline',
    hashFormat: commands.GOVERNANCE_PUBLICATION_HASH_FORMAT,
    snapshotHash: commands.publicationSnapshotHash(publishedPayload) }]
  governance.activePolicyVersionId = 'dev058-local-sso-baseline'
  governance.draft.basePolicyVersionId = 'dev058-local-sso-baseline'
  const issues = validation.validateDocumentV3(governance, source, [catalog, financialCatalog])
  if (issues.length) throw new Error(`DEV058_LOCAL_SSO_GOVERNANCE_INVALID:${issues.map(issue => issue.code).join(',')}`)
  await publishGovernance(admin, governance, old.canonical_sha256, 'local-sso-baseline', managerLink)

  const typed = await admin.query(`SELECT principal_issuer,principal_subject,principal_id,employee_id,account_type
    FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE principal_id IN ($1,$2) ORDER BY principal_id`, [managerLink.principalId, targetLink.principalId])
  requireEqual(typed.rowCount, 2, 'DEV058_TYPED_PRINCIPAL_MAPPING_CARDINALITY')
  const managerTyped = typed.rows.find(row => row.principal_id === managerLink.principalId)
  const targetTyped = typed.rows.find(row => row.principal_id === targetLink.principalId)
  assert.ok(managerTyped && targetTyped, 'DEV058_TYPED_PRINCIPAL_MAPPING_MISSING')
  requireEqual(managerTyped.principal_issuer, managerLink.issuer, 'DEV058_MANAGER_ISSUER_MAPPING_MISMATCH')
  requireEqual(managerTyped.principal_subject, managerLink.subject, 'DEV058_MANAGER_SUBJECT_MAPPING_MISMATCH')
  requireEqual(managerTyped.employee_id, managerLink.employeeId, 'DEV058_MANAGER_EMPLOYEE_MAPPING_MISMATCH')
  requireEqual(managerTyped.account_type, 'human_privileged', 'DEV058_MANAGER_ACCOUNT_TYPE_MISMATCH')
  requireEqual(targetTyped.principal_issuer, targetLink.issuer, 'DEV058_TARGET_ISSUER_MAPPING_MISMATCH')
  requireEqual(targetTyped.principal_subject, targetLink.subject, 'DEV058_TARGET_SUBJECT_MAPPING_MISMATCH')
  requireEqual(targetTyped.employee_id, targetLink.employeeId, 'DEV058_TARGET_EMPLOYEE_MAPPING_MISMATCH')
  requireEqual(targetTyped.account_type, 'human_personal', 'DEV058_TARGET_ACCOUNT_TYPE_MISMATCH')

  const platformAdmission = await enableManagedLoginAdmission(admin)
  return Object.freeze({
    managerLink: Object.freeze({ ...managerLink }),
    targetLink: Object.freeze({ ...targetLink }),
    catalogMetadata: Object.freeze({
      catalogVersion: activeCatalog.catalogVersion,
      catalogSha256: activeCatalog.catalogSha256,
      roleCount: activeCatalog.roles.length,
      governanceVersionId: 'dev058-local-sso-baseline',
      pdmConfiguration,
    }),
    platformAdmission,
  })
}
