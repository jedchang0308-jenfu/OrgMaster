import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const FIREBASE_ISSUER = 'https://securetoken.google.com/jenfu-platform-prod'
const PACKAGE_SCHEMA = 'jenfu.dev012.orgmaster-production-data-package.v1'
const BOOTSTRAP_SCHEMA = 'jenfu.dev012.orgmaster-first-principal-bootstrap.v1'
const PERSISTENCE_CONTRACT = 'jenfu.orgmaster-persistence.v1'

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function sha256(value) { return createHash('sha256').update(value).digest('hex') }
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function applicationCanonicalJson(value) { return JSON.stringify(value) }
function applicationHash(value) { return sha256(applicationCanonicalJson(value)) }
function commandHash(command) { return applicationHash(command) }
function principalFingerprint(issuer, subject) { return sha256(`jenfu.identity-admission.principal.v1\0${issuer}\0${subject}`) }
function issuerFingerprint(issuer) { return sha256(`jenfu.identity-admission.issuer.v1\0${issuer}`) }

function exactRef(value, bucket, prefix) {
  if (!value || Object.keys(value).sort().join(',') !== 'sha256,uri' || !H64.test(value.sha256 ?? '') || !value.uri?.startsWith(`gs://${bucket}/${prefix}/`) || value.uri.includes('..')) fail('PRODUCTION_DATA_REF_INVALID')
  return value
}

function emailHash(email) { return sha256(String(email).trim().toLowerCase()) }

export function buildFirstPrincipalBootstrap({ releaseId, sourceRevision, employeeIds, input, identityEvidence, observedAt }) {
  if (!RELEASE_ID.test(releaseId ?? '') || !H40.test(sourceRevision ?? '') || !employeeIds?.has(input?.employeeId) || input?.issuer !== FIREBASE_ISSUER || !/^[A-Za-z0-9_-]{6,128}$/u.test(input?.firebaseUid ?? '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input?.email ?? '') || String(input.email).length > 254 || !Number.isFinite(Date.parse(observedAt)) || input?.authorizedBy !== 'OWNER_EXPLICIT_DECISION') fail('FIRST_PRINCIPAL_INPUT_INVALID')
  const emailSha256 = emailHash(input.email)
  exactRef(input.identityEvidenceRef, 'jenfu-platform-prod-orgmaster-release', 'receipts')
  if (identityEvidence?.schemaVersion !== 'jenfu.dev012.firebase-identity-readback.v1' || identityEvidence.status !== 'PASS' || identityEvidence.releaseAuthority !== true || identityEvidence.evidenceScope !== 'PRODUCTION_PROVIDER' || identityEvidence.projectId !== 'jenfu-platform-prod' || identityEvidence.issuer !== FIREBASE_ISSUER || identityEvidence.uid !== input.firebaseUid || identityEvidence.emailSha256 !== emailSha256 || identityEvidence.emailVerified !== true || identityEvidence.firstFactor !== 'password' || identityEvidence.mfaEnrolled !== false || identityEvidence.mfaFactor !== null || identityEvidence.assuranceLevel !== 'aal1' || identityEvidence.assuranceEvidence !== 'SIGNED_ID_TOKEN_AFTER_PASSWORD_SIGNIN' || identityEvidence.credentialMaterialPresent !== false || !H64.test(input.identityEvidenceRef?.sha256 ?? '')) fail('FIRST_PRINCIPAL_IDENTITY_EVIDENCE_INVALID')
  const principalId = `principal-firebase-${sha256(`${input.issuer}\0${input.firebaseUid}`).slice(0, 32)}`
  const core = {
    schemaVersion: BOOTSTRAP_SCHEMA,
    ownerApplicationId: 'orgmaster',
    releaseId,
    sourceRevision,
    employeeId: input.employeeId,
    identity: { issuer: input.issuer, subject: input.firebaseUid, principalId },
    emailSha256,
    accountType: 'human_privileged',
    assuranceLevel: 'aal1',
    identityEvidenceRef: input.identityEvidenceRef,
    authorizedBy: input.authorizedBy,
    authorizedAt: observedAt,
    oneTimeCas: true,
    status: 'READY',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
  }
  return { ...core, bootstrapSha256: sha256(canonicalize(core)) }
}

function appendAudit(document, command, actorPrincipalId, info, now, idSuffix) {
  const previousEventHash = document.auditEvents.at(-1)?.eventHash ?? null
  const base = {
    id: `audit-production-${idSuffix}`,
    commandId: command.commandId,
    commandHash: commandHash(command),
    occurredAt: now,
    actorPrincipalId,
    action: info.action,
    entityType: info.entityType,
    entityId: info.entityId,
    reason: command.reason,
    beforeHash: info.beforeHash,
    afterHash: info.afterHash,
    previousEventHash,
  }
  return { ...document, auditEvents: [...document.auditEvents, { ...base, eventHash: applicationHash(base) }] }
}

function roleCatalog(fixture) {
  if (fixture?.contractVersion !== 'jenfu.platform-entitlement.v1' || fixture.applicationId !== 'ai-pdm' || !H64.test(String(fixture.catalogSha256).toLowerCase()) || !Array.isArray(fixture.roles)) fail('PRODUCTION_CATALOG_INVALID')
  return {
    applicationId: 'ai-pdm',
    catalogVersion: fixture.catalogVersion,
    sourceKind: 'bundled-fixture',
    sourceRefs: [
      { path: 'AI_PDM/db/schema.sql', range: '2222-2232', sha256: 'B89925107C6ADC10D085E581EBB9E5FBAC42505155CB0774F1AB46B7F261FCD8' },
      { path: 'AI_PDM/src/lib/repositories/numbering-repository.ts', range: '4744-4759', sha256: '69E21966C1DA2A8146144CC83251FA606572A5042437342FBEF475C7D771289A' },
      { path: 'AI_PDM/src/lib/repositories/numbering-repository.ts', range: '4785-4791', sha256: '388291CD51446AA88D5A1B935D109FEB9FC6663FDEE8B1545A2F5B67C448005C' },
    ],
    capturedAt: fixture.publishedAt,
    roles: fixture.roles.map((role) => ({ stableRoleId: role.stableRoleId, code: role.roleCode, displayName: role.displayName, status: 'active', assignable: role.assignable, riskLevel: role.risk, allowedScopeKinds: [...role.allowedScopeKinds], subjectKind: role.subjectKind, recommendationAllowed: role.recommendationAllowed, delegationAllowed: role.delegationAllowed, assignmentTier: role.assignmentTier })),
    payloadHash: String(fixture.catalogSha256).toLowerCase(),
    validationState: 'valid',
    effectState: 'not-synchronized',
  }
}

function organizationSnapshot(workspace, workspaceVersionId, workspaceRevision, capturedAt) {
  const state = workspace.state
  return {
    workspaceVersionId,
    workspaceRevision,
    capturedAt,
    employees: state.employees.map((value) => ({ id: value.id, primaryAssignmentId: value.primaryAssignmentId })),
    departments: state.departments.map((value) => ({ id: value.id, parentId: value.parentId })),
    organizationRoles: state.roles.map((value) => ({ id: value.id })),
    positions: state.positions.map(({ id, roleId, departmentId, parentPositionId, status }) => ({ id, roleId, departmentId, parentPositionId, status })),
    assignments: state.assignments.map(({ id, employeeId, positionId, assignmentType, validFrom, validTo }) => ({ id, employeeId, positionId, assignmentType, validFrom, validTo })),
  }
}

export function applyFirstPrincipalBootstrap({ governance, workspace, workspaceVersionId, workspaceRevision, catalogFixture, bootstrap }) {
  if (governance?.app !== 'OrgMaster' || governance.schemaVersion !== 3 || governance.activePolicyVersionId !== null || governance.publishedVersions?.length !== 0 || !Array.isArray(governance.auditEvents) || !workspace?.state?.employees?.some((value) => value.id === bootstrap.employeeId && value.status !== 'inactive')) fail('FIRST_PRINCIPAL_BASELINE_INVALID')
  const foreignLinks = governance.draft.identityLinks.filter((value) => value.status === 'active' && value.issuer !== 'urn:orgmaster:dev')
  if (foreignLinks.length || governance.draft.principalAdmissions.some((value) => value.status === 'active') || governance.draft.roleAssignments.some((value) => value.status === 'active') || governance.draft.managementGrants.some((value) => value.status === 'active')) fail('FIRST_PRINCIPAL_CAS_CONFLICT')
  const catalog = roleCatalog(catalogFixture)
  const systemRole = catalog.roles.find((value) => value.stableRoleId === 'role-system-admin' && value.code === 'system_admin')
  const orgRole = governance.draft.applicationRoles.find((value) => value.id === 'role-orgmaster-admin' && value.applicationId === 'orgmaster')
  if (!systemRole || !orgRole) fail('FIRST_PRINCIPAL_ROLE_CONTRACT_INVALID')
  const key = bootstrap.bootstrapSha256.slice(0, 24)
  const link = { id: `identity-production-${key}`, principalId: bootstrap.identity.principalId, issuer: bootstrap.identity.issuer, subject: bootstrap.identity.subject, employeeId: bootstrap.employeeId, status: 'active', validFrom: bootstrap.authorizedAt, validTo: null }
  const admission = { id: `admission-production-${key}`, principalFingerprintSha256: principalFingerprint(link.issuer, link.subject), issuerFingerprintSha256: issuerFingerprint(link.issuer), accountType: 'human_privileged', identityLinkId: link.id, sharedRetirementState: 'not_applicable', status: 'active', recordedAt: bootstrap.authorizedAt, evidenceRefSha256: bootstrap.identityEvidenceRef.sha256 }
  const baseAssignment = { employeeId: bootstrap.employeeId, scope: { kind: 'global' }, status: 'active', validFrom: bootstrap.authorizedAt, validTo: null, basis: 'manual', sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'system:production-bootstrap', createdReason: 'DEV-012 explicit first-principal bootstrap' }
  const assignments = [
    { ...baseAssignment, id: `assignment-orgmaster-admin-${key}`, applicationId: 'orgmaster', roleId: orgRole.id, roleCodeSnapshot: orgRole.code, roleNameSnapshot: orgRole.name, catalogVersion: null, effectState: 'orgmaster-enforced', subjectKind: 'employee', targetPrincipalId: null },
    { ...baseAssignment, id: `assignment-system-admin-${key}`, applicationId: 'ai-pdm', roleId: systemRole.stableRoleId, roleCodeSnapshot: systemRole.code, roleNameSnapshot: systemRole.displayName, catalogVersion: catalog.catalogVersion, effectState: 'not-synchronized', subjectKind: 'principal', targetPrincipalId: link.principalId },
  ]
  const managementGrant = { id: `grant-cross-app-${key}`, principalId: link.principalId, employeeId: bootstrap.employeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: bootstrap.authorizedAt, validTo: null, grantedByPrincipalId: 'system:production-bootstrap', reason: 'DEV-012 explicit first-principal bootstrap' }
  const beforeHash = applicationHash(governance.draft)
  const retainedLinkIds = new Set(governance.draft.identityLinks.filter((value) => value.issuer !== 'urn:orgmaster:dev').map((value) => value.id))
  let next = {
    ...governance,
    draft: {
      ...governance.draft,
      identityLinks: [...governance.draft.identityLinks.filter((value) => retainedLinkIds.has(value.id)), link],
      principalAdmissions: [...governance.draft.principalAdmissions.filter((value) => value.identityLinkId === null || retainedLinkIds.has(value.identityLinkId)), admission],
      roleAssignments: assignments,
      roleDelegations: [],
      managementGrants: [managementGrant],
      basePolicyVersionId: null,
      updatedAt: bootstrap.authorizedAt,
    },
  }
  const bootstrapCommand = { commandId: `dev012-first-principal-${key}`, reason: 'DEV-012 explicit first-principal bootstrap', type: 'PRODUCTION_FIRST_PRINCIPAL_BOOTSTRAP' }
  next = appendAudit(next, bootstrapCommand, 'system:production-bootstrap', { action: bootstrapCommand.type, entityType: 'principalAdmission', entityId: admission.id, beforeHash, afterHash: applicationHash(next.draft) }, bootstrap.authorizedAt, `bootstrap-${key}`)
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = next.draft
  const snapshotPayload = { kind: 'assignment-governance-v3', policy, externalRoleCatalogs: [catalog], organizationSnapshot: organizationSnapshot(workspace, workspaceVersionId, workspaceRevision, bootstrap.authorizedAt), effectState: 'not-synchronized' }
  const versionId = `assignment-policy-production-${key}`
  const version = { kind: 'assignment-governance-v3', id: versionId, versionNumber: 1, publishedAt: bootstrap.authorizedAt, publishedByPrincipalId: link.principalId, publishReason: 'DEV-012 initial production authority', snapshotHash: applicationHash(snapshotPayload), effectState: 'not-synchronized', policy, externalRoleCatalogs: [catalog], organizationSnapshot: snapshotPayload.organizationSnapshot }
  next = { ...next, activePolicyVersionId: versionId, publishedVersions: [version], draft: { ...next.draft, basePolicyVersionId: versionId } }
  const publishCommand = { commandId: `dev012-publish-first-policy-${key}`, reason: 'DEV-012 initial production authority', type: 'PUBLISH_ASSIGNMENTS' }
  return appendAudit(next, publishCommand, link.principalId, { action: publishCommand.type, entityType: 'assignmentVersion', entityId: versionId, beforeHash: null, afterHash: version.snapshotHash }, bootstrap.authorizedAt, `publish-${key}`)
}

async function safePath(root, relative) {
  const resolvedRoot = await realpath(root)
  const candidate = path.resolve(resolvedRoot, ...relative.split('/'))
  const actual = await realpath(candidate)
  if (!actual.startsWith(resolvedRoot + path.sep) || (await lstat(candidate)).isSymbolicLink()) fail('PRODUCTION_DATA_PATH_OUT_OF_SCOPE', relative)
  return actual
}

async function jsonArtifact(root, relative, artifactKey, artifactKind) {
  const filename = await safePath(root, relative)
  const raw = await readFile(filename, 'utf8')
  let payload
  try { payload = JSON.parse(raw) } catch { fail('PRODUCTION_DATA_JSON_INVALID', relative) }
  return { artifactKey, artifactKind, payload, sourceSha256: sha256(raw), canonicalSha256: sha256(canonicalize(payload)), sourceBytes: Buffer.byteLength(raw) }
}

async function listMedia(dataRoot) {
  const directory = await safePath(dataRoot, 'orgmaster-management-method-media')
  const entries = await readdir(directory, { withFileTypes: true })
  const output = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/^[A-Za-z0-9._-]{1,200}$/u.test(entry.name)) continue
    const bytes = await readFile(await safePath(directory, entry.name))
    const extension = entry.name.toLowerCase().split('.').at(-1)
    const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : ['jpg', 'jpeg'].includes(extension) ? 'image/jpeg' : null
    if (!mimeType || bytes.length > 8 * 1024 * 1024) fail('PRODUCTION_MEDIA_INVALID')
    output.push({ mediaKey: `orgmaster-management-method-media/${entry.name}`, sourceSha256: sha256(bytes), sourceBytes: bytes.length, mimeType, bytesBase64: bytes.toString('base64') })
  }
  return output
}

async function preferenceDispositions(dataRoot) {
  const directory = await safePath(dataRoot, 'user-preferences/workbench-list-widths')
  const entries = await readdir(directory, { withFileTypes: true })
  const values = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.v1\.json$/u.test(entry.name)) fail('PRODUCTION_PREFERENCE_INVALID')
    const bytes = await readFile(await safePath(directory, entry.name))
    JSON.parse(bytes.toString('utf8'))
    values.push({ identitySha256: sha256(`orgmaster:preference:${entry.name}`), contentSha256: sha256(bytes), sourceBytes: bytes.length, disposition: 'EXCLUDED_UNATTRIBUTABLE_PRINCIPAL' })
  }
  return values
}

export async function collectProductionData({ sourceRoot, releaseRoot, releaseId, sourceRevision, bootstrap, catalogFixture, observedAt }) {
  const dataRoot = await safePath(sourceRoot, 'data')
  const manifest = await jsonArtifact(dataRoot, 'orgmaster-workspace.v1.json', 'orgmaster-workspace.v1.json', 'workspace-manifest')
  if (manifest.payload.app !== 'OrgMaster' || manifest.payload.workspaceVersion !== 1 || !Array.isArray(manifest.payload.entries) || !manifest.payload.currentVersionId) fail('PRODUCTION_WORKSPACE_MANIFEST_INVALID')
  const artifacts = [manifest]
  const ids = new Set()
  let current = null
  let currentRawSha = null
  for (const entry of manifest.payload.entries) {
    if (!/^[A-Za-z0-9-]{1,80}$/u.test(entry.id) || ids.has(entry.id) || !['current', 'draft'].includes(entry.kind) || !['active', 'archived'].includes(entry.status)) fail('PRODUCTION_WORKSPACE_ENTRY_INVALID')
    ids.add(entry.id)
    const artifact = await jsonArtifact(dataRoot, `orgmaster-versions/${entry.id}.json`, `orgmaster-versions/${entry.id}.json`, 'workspace-version')
    if (artifact.payload.app !== 'OrgMaster' || !artifact.payload.state) fail('PRODUCTION_WORKSPACE_ENTRY_INVALID')
    artifacts.push(artifact)
    if (entry.id === manifest.payload.currentVersionId) { current = artifact.payload; currentRawSha = artifact.sourceSha256 }
  }
  if (!current || !currentRawSha) fail('PRODUCTION_WORKSPACE_CURRENT_MISSING')
  const employeeIds = new Set(current.state.employees.map((value) => value.id))
  if (!employeeIds.has(bootstrap.employeeId)) fail('FIRST_PRINCIPAL_EMPLOYEE_MISSING')
  const governanceSource = await jsonArtifact(dataRoot, 'orgmaster-governance.v3.json', 'orgmaster-governance.v3.json', 'governance')
  const governance = applyFirstPrincipalBootstrap({ governance: governanceSource.payload, workspace: current, workspaceVersionId: manifest.payload.currentVersionId, workspaceRevision: currentRawSha, catalogFixture, bootstrap })
  const governanceRaw = `${JSON.stringify(governance, null, 2)}\n`
  artifacts.push({ artifactKey: governanceSource.artifactKey, artifactKind: 'governance', payload: governance, sourceSha256: sha256(governanceRaw), canonicalSha256: sha256(canonicalize(governance)), sourceBytes: Buffer.byteLength(governanceRaw), originalSourceSha256: governanceSource.sourceSha256 })
  artifacts.push(await jsonArtifact(dataRoot, 'orgmaster-management-methods.v1.json', 'orgmaster-management-methods.v1.json', 'management-methods'))
  artifacts.sort((a, b) => a.artifactKey.localeCompare(b.artifactKey))
  const [media, preferences] = await Promise.all([listMedia(dataRoot), preferenceDispositions(dataRoot)])
  const safeManifest = {
    contractVersion: PERSISTENCE_CONTRACT,
    releaseId,
    sourceRevision,
    artifacts: artifacts.map(({ payload: _payload, bytesBase64: _bytes, ...value }) => value),
    media: media.map(({ bytesBase64: _bytes, mimeType, ...value }) => ({ ...value, mimeType })),
    preferences,
    bootstrapSha256: bootstrap.bootstrapSha256,
  }
  const dataRevision = sha256(canonicalize(safeManifest))
  const sourceBytes = artifacts.reduce((sum, value) => sum + value.sourceBytes, 0) + media.reduce((sum, value) => sum + value.sourceBytes, 0)
  const core = {
    schemaVersion: PACKAGE_SCHEMA,
    ownerApplicationId: 'orgmaster',
    releaseId,
    sourceRevision,
    sourceRepository: 'jedchang0308-jenfu/OrgMaster',
    dataRevision,
    persistenceContract: PERSISTENCE_CONTRACT,
    bootstrapSha256: bootstrap.bootstrapSha256,
    artifactCount: artifacts.length,
    mediaCount: media.length,
    preferenceCount: preferences.length,
    sourceBytes,
    dataClassCounts: { employees: current.state.employees.length, positions: current.state.positions.length, governance: 1, identityLinks: governance.draft.identityLinks.length, assignments: governance.draft.roleAssignments.length, preferences: preferences.length, media: media.length, audit: governance.auditEvents.length },
    preferenceDisposition: preferences.length ? 'EXCLUDED_UNATTRIBUTABLE_PRINCIPAL' : 'NONE',
    safeManifest,
    artifacts,
    media,
    observedAt,
    status: 'READY',
  }
  const value = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${canonicalize(value)}\n`, 'utf8')
  assertProductionDataPackage(value, { bytes, releaseId, sourceRevision, bootstrapSha256: bootstrap.bootstrapSha256 })
  return { value, bytes, packageSha256: sha256(bytes) }
}

export function assertProductionDataPackage(value, { bytes, releaseId, sourceRevision, bootstrapSha256 }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) === '' || value?.schemaVersion !== PACKAGE_SCHEMA || value.ownerApplicationId !== 'orgmaster' || value.releaseId !== releaseId || value.sourceRevision !== sourceRevision || value.bootstrapSha256 !== bootstrapSha256 || value.persistenceContract !== PERSISTENCE_CONTRACT || value.status !== 'READY' || !H64.test(value.dataRevision ?? '') || !H64.test(value.manifestSha256 ?? '')) fail('PRODUCTION_DATA_PACKAGE_INVALID')
  const core = { ...value }
  delete core.manifestSha256
  if (sha256(canonicalize(core)) !== value.manifestSha256 || sha256(bytes) !== sha256(Buffer.from(`${canonicalize(value)}\n`, 'utf8'))) fail('PRODUCTION_DATA_PACKAGE_HASH_INVALID')
  if (!Array.isArray(value.artifacts) || value.artifacts.length !== value.artifactCount || !Array.isArray(value.media) || value.media.length !== value.mediaCount || !Array.isArray(value.safeManifest?.preferences) || value.safeManifest.preferences.length !== value.preferenceCount || value.safeManifest.preferences.some((item) => item.disposition !== 'EXCLUDED_UNATTRIBUTABLE_PRINCIPAL')) fail('PRODUCTION_DATA_PACKAGE_COUNTS_INVALID')
  for (const artifact of value.artifacts) if (!artifact.artifactKey || !['workspace-manifest', 'workspace-version', 'governance', 'management-methods'].includes(artifact.artifactKind) || sha256(canonicalize(artifact.payload)) !== artifact.canonicalSha256) fail('PRODUCTION_DATA_ARTIFACT_INVALID')
  for (const media of value.media) {
    const payload = Buffer.from(media.bytesBase64, 'base64')
    if (sha256(payload) !== media.sourceSha256 || payload.length !== media.sourceBytes || !['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType)) fail('PRODUCTION_DATA_MEDIA_INVALID')
  }
  return value
}

export function assertFirstPrincipalBootstrap(value, { releaseId, sourceRevision }) {
  const core = { ...value }
  delete core.bootstrapSha256
  if (value?.schemaVersion !== BOOTSTRAP_SCHEMA || value.ownerApplicationId !== 'orgmaster' || value.releaseId !== releaseId || value.sourceRevision !== sourceRevision || value.identity?.issuer !== FIREBASE_ISSUER || value.accountType !== 'human_privileged' || value.assuranceLevel !== 'aal1' || value.oneTimeCas !== true || value.status !== 'READY' || value.releaseAuthority !== true || !H64.test(value.bootstrapSha256 ?? '') || sha256(canonicalize(core)) !== value.bootstrapSha256) fail('FIRST_PRINCIPAL_MANIFEST_INVALID')
  return value
}

async function reconcileBatch(database, batchId, packageValue) {
  const artifacts = (await database.query('SELECT artifact_key, btrim(source_sha256) AS source_sha256, btrim(canonical_sha256) AS canonical_sha256, source_bytes FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1 ORDER BY artifact_key', [batchId])).rows
  const media = (await database.query('SELECT media_key, btrim(source_sha256) AS source_sha256, source_bytes FROM orgmaster_core.persistence_media_inventory WHERE batch_id=$1 ORDER BY media_key', [batchId])).rows
  const expectedArtifacts = packageValue.artifacts.map((item) => ({ artifact_key: item.artifactKey, source_sha256: item.sourceSha256, canonical_sha256: item.canonicalSha256, source_bytes: Number(item.sourceBytes) })).sort((a, b) => a.artifact_key.localeCompare(b.artifact_key))
  const expectedMedia = packageValue.media.map((item) => ({ media_key: item.mediaKey, source_sha256: item.sourceSha256, source_bytes: Number(item.sourceBytes) })).sort((a, b) => a.media_key.localeCompare(b.media_key))
  const normalizedArtifacts = artifacts.map((item) => ({ ...item, source_bytes: Number(item.source_bytes) }))
  const normalizedMedia = media.map((item) => ({ ...item, source_bytes: Number(item.source_bytes) }))
  if (canonicalize(normalizedArtifacts) !== canonicalize(expectedArtifacts) || canonicalize(normalizedMedia) !== canonicalize(expectedMedia)) fail('PRODUCTION_DATA_RECONCILIATION_FAILED')
}

export async function importProductionData({ database, packageValue, bootstrap, now = () => new Date().toISOString() }) {
  const at = now()
  await database.query('BEGIN')
  try {
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    await database.query("SELECT pg_advisory_xact_lock(hashtext('dev012-orgmaster-production-data'), hashtext(current_database()))")
    const authority = (await database.query('SELECT active_batch_id, authority_version FROM orgmaster_core.persistence_authority WHERE singleton=true FOR UPDATE')).rows[0]
    const existing = (await database.query('SELECT id,status FROM orgmaster_core.persistence_batches WHERE source_revision=$1', [packageValue.dataRevision])).rows[0]
    if (authority?.active_batch_id && (!existing || String(authority.active_batch_id) !== String(existing.id))) fail('PRODUCTION_DATA_AUTHORITY_CAS_CONFLICT')
    let batchId = existing?.id
    let replayed = Boolean(existing)
    if (!existing) {
      batchId = randomUUID()
      await database.query("INSERT INTO orgmaster_core.persistence_batches(id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,'shadow',$8,$8)", [batchId, packageValue.dataRevision, PERSISTENCE_CONTRACT, JSON.stringify(packageValue.safeManifest), packageValue.artifactCount, packageValue.mediaCount, packageValue.sourceBytes, at])
      for (const artifact of packageValue.artifacts) await database.query('INSERT INTO orgmaster_core.persistence_artifacts(batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8)', [batchId, artifact.artifactKey, artifact.artifactKind, JSON.stringify(artifact.payload), artifact.sourceSha256, artifact.canonicalSha256, artifact.sourceBytes, at])
      for (const media of packageValue.media) {
        const bytes = Buffer.from(media.bytesBase64, 'base64')
        await database.query('INSERT INTO orgmaster_core.persistence_media_inventory(batch_id,media_key,source_sha256,source_bytes) VALUES($1,$2,$3,$4)', [batchId, media.mediaKey, media.sourceSha256, media.sourceBytes])
        const result = await database.query('INSERT INTO orgmaster_core.persistence_media_blobs(media_key,media_bytes,mime_type,content_sha256,byte_size,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(media_key) DO UPDATE SET updated_at=EXCLUDED.updated_at WHERE orgmaster_core.persistence_media_blobs.content_sha256=EXCLUDED.content_sha256 RETURNING media_key', [media.mediaKey, bytes, media.mimeType, media.sourceSha256, media.sourceBytes, at])
        if (result.rowCount !== 1) fail('PRODUCTION_MEDIA_CONFLICT')
      }
    }
    await reconcileBatch(database, batchId, packageValue)
    if (!authority?.active_batch_id) {
      await database.query("UPDATE orgmaster_core.persistence_batches SET status='active',activated_at=$2 WHERE id=$1 AND status='shadow'", [batchId, at])
      const pointer = await database.query("UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1,authority_version=authority_version+1,updated_at=$2,updated_by='dev012-production-import',reason_code='first_production_authority' WHERE singleton=true AND active_batch_id IS NULL RETURNING authority_version", [batchId, at])
      if (pointer.rowCount !== 1) fail('PRODUCTION_DATA_AUTHORITY_CAS_CONFLICT')
      replayed = false
    }
    const governance = (await database.query("SELECT payload FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1 AND artifact_key='orgmaster-governance.v3.json'", [batchId])).rows[0]?.payload
    const activeLinks = governance?.draft?.identityLinks?.filter((item) => item.status === 'active' && item.issuer === bootstrap.identity.issuer && item.subject === bootstrap.identity.subject && item.employeeId === bootstrap.employeeId) ?? []
    const activeAdmissions = governance?.draft?.principalAdmissions?.filter((item) => item.status === 'active' && item.accountType === 'human_privileged' && activeLinks.some((link) => link.id === item.identityLinkId)) ?? []
    const adminAssignments = governance?.draft?.roleAssignments?.filter((item) => item.status === 'active' && item.employeeId === bootstrap.employeeId && ['role-orgmaster-admin', 'role-system-admin'].includes(item.roleId)) ?? []
    if (governance?.activePolicyVersionId == null || activeLinks.length !== 1 || activeAdmissions.length !== 1 || adminAssignments.length !== 2) fail('FIRST_PRINCIPAL_RECONCILIATION_FAILED')
    await database.query('COMMIT')
    return { status: 'PASS', dataRevision: packageValue.dataRevision, manifestSha256: packageValue.manifestSha256, bootstrapSha256: bootstrap.bootstrapSha256, artifactCount: packageValue.artifactCount, mediaCount: packageValue.mediaCount, preferenceDisposition: packageValue.preferenceDisposition, firstPrincipalCount: 1, adminAssignmentCount: 2, replayed, completedAt: at }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export const ORGMASTER_PRODUCTION_DATA = Object.freeze({ packageSchema: PACKAGE_SCHEMA, bootstrapSchema: BOOTSTRAP_SCHEMA, firebaseIssuer: FIREBASE_ISSUER })
