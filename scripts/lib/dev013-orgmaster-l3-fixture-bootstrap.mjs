import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEV013_ORGMASTER_FIXTURE_VERSION = 'jenfu.dev013.orgmaster-l3-p-both-fixture.v1'
export const DEV013_ORGMASTER_FIXTURE_APPROVAL = 'DEV013-L3-P-BOTH-FIXTURE-AUTHORIZED'

export const DEV013_ORGMASTER_FIXTURE_TARGET = Object.freeze({
  projectId: 'jenfu-platform-nonprod',
  region: 'asia-east1',
  cloudSqlInstance: 'jenfu-platform-nonprod-pg',
  database: 'jenfu_stg',
  databaseUser: 'dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam',
  role: 'jenfu_orgmaster_migrator',
})

const ISSUER = 'https://securetoken.google.com/jenfu-platform-nonprod'
const EMPLOYEE_ID = 'employee-dev013-p-both'
const PRINCIPAL_ID = 'principal-dev013-p-both'
const WORKSPACE_VERSION_ID = 'current-dev013-p-both-v1'
const POLICY_VERSION_ID = 'policy-dev013-p-both-v1'
const AT = '2026-09-17T00:00:00.000Z'
const PRINCIPAL_FINGERPRINT_DOMAIN = 'jenfu.identity-admission.principal.v1'
const ISSUER_FINGERPRINT_DOMAIN = 'jenfu.identity-admission.issuer.v1'
const ORGANIZATION_LEVELS = [
  { id: 'level-executive', name: '經營決策層', order: 0 },
  { id: 'level-department', name: '部門主管層', order: 1 },
  { id: 'level-team', name: '單位／組級主管層', order: 2 },
  { id: 'level-execution', name: '執行／專業層', order: 3 },
]
const ORGMASTER_PERMISSIONS = [
  ['permission-orgmaster-governance-manage', 'orgmaster.governance.manage', 'high'],
  ['permission-orgmaster-governance-publish', 'orgmaster.governance.publish', 'high'],
  ['permission-orgmaster-governance-simulate', 'orgmaster.governance.simulate', 'normal'],
  ['permission-orgmaster-identity-view', 'orgmaster.identity.view', 'normal'],
  ['permission-orgmaster-identity-refresh', 'orgmaster.identity.refresh', 'high'],
  ['permission-orgmaster-employee-number-manage', 'orgmaster.employee-number.manage', 'high'],
  ['permission-orgmaster-identity-invite', 'orgmaster.identity.invite', 'high'],
  ['permission-orgmaster-identity-link', 'orgmaster.identity.link', 'high'],
  ['permission-orgmaster-identity-invitation-manage', 'orgmaster.identity.invitation.manage', 'high'],
  ['permission-orgmaster-management-method-create', 'orgmaster.management_method.create', 'normal'],
  ['permission-orgmaster-management-method-read-readable', 'orgmaster.management_method.read_readable', 'normal'],
  ['permission-orgmaster-management-method-read-draft', 'orgmaster.management_method.read_draft', 'normal'],
  ['permission-orgmaster-management-method-edit-draft', 'orgmaster.management_method.edit_draft', 'normal'],
  ['permission-orgmaster-management-method-manage-readable', 'orgmaster.management_method.manage_read_availability', 'high'],
  ['permission-orgmaster-management-method-manage-metadata', 'orgmaster.management_method.manage_metadata', 'normal'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function artifact(artifactKey, artifactKind, payload) {
  const raw = JSON.stringify(payload)
  return {
    artifactKey,
    artifactKind,
    payload,
    sourceSha256: sha256(raw),
    canonicalSha256: sha256(canonicalJson(payload)),
    sourceBytes: Buffer.byteLength(raw),
  }
}

function readAiPdmCatalog(root) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json'), 'utf8'))
  if (source.contractVersion !== 'jenfu.platform-entitlement.v1' || source.applicationId !== 'ai-pdm') throw new Error('DEV013_AI_PDM_CATALOG_INVALID')
  return {
    applicationId: 'ai-pdm',
    catalogVersion: source.catalogVersion,
    sourceKind: 'bundled-fixture',
    sourceRefs: [
      { path: 'AI_PDM/db/schema.sql', range: '2222-2232', sha256: 'B89925107C6ADC10D085E581EBB9E5FBAC42505155CB0774F1AB46B7F261FCD8' },
      { path: 'AI_PDM/src/lib/repositories/numbering-repository.ts', range: '4744-4759', sha256: '69E21966C1DA2A8146144CC83251FA606572A5042437342FBEF475C7D771289A' },
      { path: 'AI_PDM/src/lib/repositories/numbering-repository.ts', range: '4785-4791', sha256: '388291CD51446AA88D5A1B935D109FEB9FC6663FDEE8B1545A2F5B67C448005C' },
    ],
    capturedAt: source.publishedAt,
    payloadHash: source.catalogSha256.toLowerCase(),
    validationState: 'valid',
    effectState: 'not-synchronized',
    roles: source.roles.map((role) => ({
      stableRoleId: role.stableRoleId,
      code: role.roleCode,
      displayName: role.displayName,
      status: 'active',
      assignable: role.assignable,
      riskLevel: role.risk,
      allowedScopeKinds: role.allowedScopeKinds,
      subjectKind: role.subjectKind,
      recommendationAllowed: role.recommendationAllowed,
      delegationAllowed: role.delegationAllowed,
      assignmentTier: role.assignmentTier,
    })),
  }
}

export function assertDev013OrgmasterFixtureEnvironment(env = process.env) {
  const exact = [
    ['DEV013_L3_FIXTURE_APPROVAL', DEV013_ORGMASTER_FIXTURE_APPROVAL],
    ['DEV013_TARGET_PROJECT_ID', DEV013_ORGMASTER_FIXTURE_TARGET.projectId],
    ['DEV013_TARGET_REGION', DEV013_ORGMASTER_FIXTURE_TARGET.region],
    ['DEV013_TARGET_CLOUD_SQL_INSTANCE', DEV013_ORGMASTER_FIXTURE_TARGET.cloudSqlInstance],
    ['DEV013_TARGET_DATABASE', DEV013_ORGMASTER_FIXTURE_TARGET.database],
    ['DEV013_DATABASE_USER', DEV013_ORGMASTER_FIXTURE_TARGET.databaseUser],
  ]
  for (const [key, expected] of exact) if (env[key] !== expected) throw new Error(`DEV013_FIXTURE_TARGET_MISMATCH:${key}`)
  const identitySubject = String(env.DEV013_FIXTURE_FIREBASE_UID ?? '').trim()
  if (!/^[A-Za-z0-9_-]{20,128}$/u.test(identitySubject)) throw new Error('DEV013_FIXTURE_SUBJECT_INVALID')
  return { identitySubject }
}

export function buildDev013OrgmasterFixture(identitySubject, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  if (!/^[A-Za-z0-9_-]{20,128}$/u.test(identitySubject)) throw new Error('DEV013_FIXTURE_SUBJECT_INVALID')
  const subjectFingerprintSha256 = sha256(identitySubject)
  const principalFingerprintSha256 = sha256(`${PRINCIPAL_FINGERPRINT_DOMAIN}\u0000${ISSUER}\u0000${identitySubject}`)
  const issuerFingerprintSha256 = sha256(`${ISSUER_FINGERPRINT_DOMAIN}\u0000${ISSUER}`)
  const catalog = readAiPdmCatalog(root)
  const role = catalog.roles.find((candidate) => candidate.stableRoleId === 'role-rd' && candidate.code === 'rd')
  if (!role || role.subjectKind !== 'employee' || !role.allowedScopeKinds.includes('workspace')) throw new Error('DEV013_AI_PDM_ROLE_INVALID')

  const workspace = {
    app: 'OrgMaster', version: 7, kind: 'document', savedAt: AT,
    state: {
      employees: [{ id: EMPLOYEE_ID, name: 'DEV-013 Synthetic P_BOTH', status: 'active', departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }],
      departments: [], roles: [], positions: [], assignments: [], members: [], roleCombinationRiskRules: [], organizationLevels: ORGANIZATION_LEVELS,
      organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
      duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
    },
  }
  const workspaceArtifact = artifact(`orgmaster-versions/${WORKSPACE_VERSION_ID}.json`, 'workspace-version', workspace)
  const manifest = {
    app: 'OrgMaster', workspaceVersion: 1, currentVersionId: WORKSPACE_VERSION_ID,
    entries: [{ id: WORKSPACE_VERSION_ID, name: '現行版', kind: 'current', status: 'active', basedOnVersionId: null, createdAt: AT, archivedAt: null }],
  }
  const identityLinkId = 'identity-dev013-p-both'
  const permissions = ORGMASTER_PERMISSIONS.map(([id, code, risk]) => ({ id, applicationId: 'orgmaster', kind: code.includes('.read_') || code.endsWith('.view') ? 'page' : 'action', code, name: code, risk, status: 'active' }))
  const policy = {
    applications: [{ id: 'orgmaster', name: 'OrgMaster', status: 'active' }, { id: 'ai-pdm', name: 'AI-PDM', status: 'active' }],
    identityLinks: [{ id: identityLinkId, principalId: PRINCIPAL_ID, issuer: ISSUER, subject: identitySubject, employeeId: EMPLOYEE_ID, status: 'active', validFrom: AT, validTo: null }],
    applicationRoles: [{ id: 'role-orgmaster-admin', applicationId: 'orgmaster', code: 'orgmaster_admin', name: 'OrgMaster 管理者', status: 'active', systemDefined: true }],
    permissions,
    rolePermissionGrants: permissions.map((permission) => ({ id: `grant-orgmaster-admin-${permission.id}`, roleId: 'role-orgmaster-admin', permissionId: permission.id, effect: 'allow' })),
    roleAssignments: [
      { id: 'assignment-dev013-orgmaster', employeeId: EMPLOYEE_ID, applicationId: 'orgmaster', roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null, scope: { kind: 'global' }, status: 'active', validFrom: AT, validTo: null, effectState: 'orgmaster-enforced', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'fixture:dev013', createdReason: 'DEV-013 controlled L3 P_BOTH fixture' },
      { id: 'assignment-dev013-ai-pdm', employeeId: EMPLOYEE_ID, applicationId: 'ai-pdm', roleId: role.stableRoleId, roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace', value: 'company-dev013-l3' }, status: 'active', validFrom: AT, validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'fixture:dev013', createdReason: 'DEV-013 controlled L3 P_BOTH fixture' },
    ],
    roleDelegations: [],
    principalAdmissions: [{ id: 'admission-dev013-p-both', principalFingerprintSha256, issuerFingerprintSha256, accountType: 'human_personal', identityLinkId, sharedRetirementState: 'not_applicable', status: 'active', recordedAt: AT, evidenceRefSha256: sha256(DEV013_ORGMASTER_FIXTURE_VERSION) }],
    positionRolePolicies: [], applicationPositionAdoptions: [], managementGrants: [],
  }
  const governance = {
    app: 'OrgMaster', schemaVersion: 3,
    draft: { ...policy, basePolicyVersionId: POLICY_VERSION_ID, updatedAt: AT },
    activePolicyVersionId: POLICY_VERSION_ID,
    publishedVersions: [{
      kind: 'assignment-governance-v3', id: POLICY_VERSION_ID, versionNumber: 1, publishedAt: AT,
      publishedByPrincipalId: 'fixture:dev013', publishReason: 'DEV-013 controlled L3 P_BOTH fixture',
      snapshotHash: sha256(canonicalJson(policy)), effectState: 'not-synchronized', policy,
      externalRoleCatalogs: [catalog],
      organizationSnapshot: { workspaceVersionId: WORKSPACE_VERSION_ID, workspaceRevision: workspaceArtifact.sourceSha256, capturedAt: AT, employees: [{ id: EMPLOYEE_ID, primaryAssignmentId: null }], departments: [], organizationRoles: [], positions: [], assignments: [] },
    }],
    auditEvents: [],
    migration: { sourceSchemaVersion: 2, sourceRevision: sha256(DEV013_ORGMASTER_FIXTURE_VERSION), migratedAt: AT, legacyDraftHash: sha256(canonicalJson(policy)), removedExternalDraftCounts: { roles: 0, permissions: 0, grants: 0, approvalPolicies: 0 }, unresolvedAssignments: [], unresolvedDelegations: [] },
    securityAlertIntents: [], sessionInvalidationOutbox: [], commandReceipts: [],
  }
  const artifacts = [artifact('orgmaster-workspace.v1.json', 'workspace-manifest', manifest), workspaceArtifact, artifact('orgmaster-governance.v3.json', 'governance', governance)]
  const sourceManifest = { contractVersion: 'jenfu.orgmaster-persistence.v1', fixtureVersion: DEV013_ORGMASTER_FIXTURE_VERSION, artifacts: artifacts.map(({ artifactKey, artifactKind, sourceSha256, canonicalSha256, sourceBytes }) => ({ artifactKey, artifactKind, sourceSha256, canonicalSha256, sourceBytes })), media: [] }
  return {
    fixtureVersion: DEV013_ORGMASTER_FIXTURE_VERSION,
    identity: { issuer: ISSUER, subject: identitySubject, subjectFingerprintSha256, principalId: PRINCIPAL_ID, employeeId: EMPLOYEE_ID },
    policyVersionId: POLICY_VERSION_ID,
    sourceRevision: sha256(canonicalJson(sourceManifest)),
    sourceManifest,
    artifacts,
  }
}

function trimHash(value) {
  return String(value ?? '').trim()
}

export async function applyDev013OrgmasterFixture(client, fixture) {
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s'; SET LOCAL idle_in_transaction_session_timeout = '30s'")
    const identity = (await client.query('SELECT current_database() AS database_name, current_user AS database_user')).rows[0]
    if (identity?.database_name !== DEV013_ORGMASTER_FIXTURE_TARGET.database || identity?.database_user !== DEV013_ORGMASTER_FIXTURE_TARGET.databaseUser) throw new Error('DEV013_DATABASE_IDENTITY_MISMATCH')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dev013-l3-orgmaster-p-both'), hashtext(current_database()))")
    await client.query(`SET LOCAL ROLE ${DEV013_ORGMASTER_FIXTURE_TARGET.role}`)
    const boundary = (await client.query(`SELECT
      to_regclass('orgmaster_core.persistence_authority') IS NOT NULL AS authority,
      to_regclass('orgmaster_core.persistence_batches') IS NOT NULL AS batches,
      to_regclass('orgmaster_core.persistence_artifacts') IS NOT NULL AS artifacts,
      to_regclass('orgmaster_contract.v_active_principal_mappings_v1') IS NOT NULL AS principal_contract,
      to_regclass('orgmaster_contract.v_portal_app_visibility_v1') IS NOT NULL AS visibility_contract,
      to_regclass('orgmaster_contract.v_ai_pdm_effective_role_assignments_v1') IS NOT NULL AS role_contract`)).rows[0]
    if (!boundary || Object.values(boundary).some((value) => value !== true)) throw new Error('DEV013_ORGMASTER_SCHEMA_INCOMPLETE')
    const authority = (await client.query(`SELECT a.active_batch_id, a.authority_version, a.updated_by, a.reason_code,
        trim(b.source_revision) AS source_revision, b.status, b.source_manifest, b.artifact_count, b.media_count
      FROM orgmaster_core.persistence_authority a LEFT JOIN orgmaster_core.persistence_batches b ON b.id=a.active_batch_id
      WHERE a.singleton=true FOR UPDATE OF a`)).rows
    if (authority.length !== 1) throw new Error('DEV013_PERSISTENCE_AUTHORITY_INVALID')
    const currentSourceRevision = authority[0].source_revision ?? null
    const replayed = currentSourceRevision === fixture.sourceRevision
    const controlledFixtureReplacement = authority[0].active_batch_id !== null
      && authority[0].status === 'active'
      && authority[0].source_manifest?.contractVersion === 'jenfu.orgmaster-persistence.v1'
      && authority[0].source_manifest?.fixtureVersion === DEV013_ORGMASTER_FIXTURE_VERSION
      && ['controlled_p_both_fixture', 'controlled_p_both_fixture_correction'].includes(authority[0].reason_code)
      && authority[0].updated_by === 'dev013-l3-owner-bootstrap'
      && Number(authority[0].artifact_count) === 3
      && Number(authority[0].media_count) === 0
    if (authority[0].active_batch_id !== null && !replayed && !controlledFixtureReplacement) throw new Error('DEV013_NONEMPTY_PERSISTENCE_AUTHORITY_REFUSED')
    let batchId = authority[0].active_batch_id
    if (!replayed) {
      batchId = crypto.randomUUID()
      await client.query(`INSERT INTO orgmaster_core.persistence_batches
        (id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at,activated_at)
        VALUES($1,$2,'jenfu.orgmaster-persistence.v1',$3::jsonb,$4,0,$5,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`,
      [batchId, fixture.sourceRevision, JSON.stringify(fixture.sourceManifest), fixture.artifacts.length, fixture.artifacts.reduce((sum, item) => sum + item.sourceBytes, 0)])
      for (const item of fixture.artifacts) await client.query(`INSERT INTO orgmaster_core.persistence_artifacts
        (batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,clock_timestamp())`, [batchId, item.artifactKey, item.artifactKind, JSON.stringify(item.payload), item.sourceSha256, item.canonicalSha256, item.sourceBytes])
      if (authority[0].active_batch_id !== null) await client.query(`UPDATE orgmaster_core.persistence_batches
        SET status='retired', retired_at=clock_timestamp() WHERE id=$1 AND status='active'`, [authority[0].active_batch_id])
      await client.query(`UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1,authority_version=authority_version+1,
        updated_at=clock_timestamp(),updated_by='dev013-l3-owner-bootstrap',reason_code=$2
        WHERE singleton=true`, [batchId, controlledFixtureReplacement ? 'controlled_p_both_fixture_correction' : 'controlled_p_both_fixture'])
    }
    if (!replayed && !controlledFixtureReplacement) await client.query(`SELECT * FROM access_governance.switch_employee_entitlement_authority_v1(
      'ai-pdm',$1,'orgmaster_authority',1,$2,$3,$4,'dev013-l3-owner-bootstrap','controlled P_BOTH fixture')`,
    [fixture.identity.employeeId, `dev013-l3-p-both-${fixture.sourceRevision.slice(0, 16)}`, fixture.sourceRevision, fixture.policyVersionId])
    const stored = (await client.query(`SELECT artifact_key,trim(source_sha256) AS source_sha256,trim(canonical_sha256) AS canonical_sha256,source_bytes
      FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1 ORDER BY artifact_key`, [batchId])).rows
    const expected = fixture.artifacts.map((item) => ({ artifact_key: item.artifactKey, source_sha256: item.sourceSha256, canonical_sha256: item.canonicalSha256, source_bytes: String(item.sourceBytes) })).sort((a, b) => a.artifact_key.localeCompare(b.artifact_key))
    const actual = stored.map((item) => ({ ...item, source_bytes: String(item.source_bytes) }))
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('DEV013_ARTIFACT_READBACK_MISMATCH')
    const principals = (await client.query(`SELECT principal_id,employee_id,mapping_version FROM orgmaster_contract.v_active_principal_mappings_v1
      WHERE principal_issuer=$1 AND principal_subject=$2 ORDER BY principal_id,employee_id`, [fixture.identity.issuer, fixture.identity.subject])).rows
    if (principals.length !== 1 || principals[0].principal_id !== fixture.identity.principalId || principals[0].employee_id !== fixture.identity.employeeId || Number(principals[0].mapping_version) !== 1) throw new Error('DEV013_PRINCIPAL_READBACK_MISMATCH')
    const visibility = (await client.query(`SELECT application_id,assignment_version,visibility_state FROM orgmaster_contract.v_portal_app_visibility_v1
      WHERE principal_issuer=$1 AND principal_subject=$2 ORDER BY application_id`, [fixture.identity.issuer, fixture.identity.subject])).rows
    if (JSON.stringify(visibility.map((row) => row.application_id)) !== JSON.stringify(['ai-pdm', 'orgmaster']) || visibility.some((row) => Number(row.assignment_version) !== 1 || row.visibility_state !== 'visible')) throw new Error('DEV013_VISIBILITY_READBACK_MISMATCH')
    const roles = (await client.query(`SELECT stable_role_id,role_code,scope_kind,scope_key FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
      WHERE identity_issuer=$1 AND identity_subject=$2 ORDER BY stable_role_id`, [fixture.identity.issuer, fixture.identity.subject])).rows
    if (roles.length !== 1 || roles[0].stable_role_id !== 'role-rd' || roles[0].role_code !== 'rd' || roles[0].scope_kind !== 'workspace' || roles[0].scope_key !== 'company-dev013-l3') throw new Error('DEV013_AI_PDM_ROLE_READBACK_MISMATCH')
    const authorityReadback = (await client.query(`SELECT trim(b.source_revision) AS source_revision,a.authority_version FROM orgmaster_core.persistence_authority a JOIN orgmaster_core.persistence_batches b ON b.id=a.active_batch_id WHERE a.singleton=true AND b.status='active'`)).rows[0]
    if (trimHash(authorityReadback?.source_revision) !== fixture.sourceRevision || Number(authorityReadback?.authority_version) < 1) throw new Error('DEV013_AUTHORITY_READBACK_MISMATCH')
    await client.query('COMMIT')
    return { replayed, batchId, authorityVersion: Number(authorityReadback.authority_version), principalCount: principals.length, visibleApplications: visibility.map((row) => row.application_id), effectiveRoleCount: roles.length }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export function summarizeDev013OrgmasterFixture(fixture, result) {
  return {
    schemaVersion: 'jenfu.dev013.orgmaster-l3-fixture-receipt.v1',
    status: 'PASS',
    fixtureKey: 'P_BOTH',
    fixtureVersion: fixture.fixtureVersion,
    target: DEV013_ORGMASTER_FIXTURE_TARGET,
    sourceRevision: fixture.sourceRevision,
    subjectFingerprintSha256: fixture.identity.subjectFingerprintSha256,
    artifactCount: fixture.artifacts.length,
    replayed: result.replayed,
    authorityVersion: result.authorityVersion,
    principalCount: result.principalCount,
    visibleApplications: result.visibleApplications,
    effectiveRoleCount: result.effectiveRoleCount,
    containsRawIdentity: false,
  }
}
