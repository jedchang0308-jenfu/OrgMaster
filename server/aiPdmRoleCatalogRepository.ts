import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { decodeDynamicAiPdmRoleCatalog, type DynamicCatalogMetadata } from './aiPdmDynamicRoleCatalog.ts'

export const JENFU_ENTITLEMENT_CONTRACT_VERSION = 'jenfu.platform-entitlement.v1' as const
export const AI_PDM_APPLICATION_ID = 'ai-pdm' as const
export const AI_PDM_ROLE_CATALOG_V3_VERSION = 'ai-pdm.role-catalog.2026-09-03.v3' as const
export const AI_PDM_ROLE_CATALOG_V3_SHA256 = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8' as const
export const AI_PDM_ROLE_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-28.v5' as const
export const AI_PDM_ROLE_CATALOG_SHA256 = '4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197' as const
export const AI_PDM_ROLE_CATALOG_V6_VERSION = 'ai-pdm.role-catalog.2026-10-05.v6' as const
export const AI_PDM_ROLE_CATALOG_V6_SHA256 = 'bdc8d2b8f717e4af9d48cf882d1a564a5caaabaaaacdcf20bc5db36a5b6960af' as const
export const AI_PDM_ROLE_CATALOG_V7_VERSION = 'ai-pdm.role-catalog.2026-10-10.v7' as const
export const AI_PDM_ROLE_CATALOG_V7_SHA256 = '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9' as const
const APPROVED_CATALOGS: Record<string, { path: string; hash: string }> = {
  [AI_PDM_ROLE_CATALOG_V3_VERSION]: { path: 'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json', hash: AI_PDM_ROLE_CATALOG_V3_SHA256 },
  [AI_PDM_ROLE_CATALOG_VERSION]: { path: 'config/catalogs/ai-pdm-role-catalog.v5.json', hash: AI_PDM_ROLE_CATALOG_SHA256 },
  [AI_PDM_ROLE_CATALOG_V6_VERSION]: { path: 'config/catalogs/ai-pdm-role-catalog.v6.json', hash: AI_PDM_ROLE_CATALOG_V6_SHA256 },
  [AI_PDM_ROLE_CATALOG_V7_VERSION]: { path: 'config/catalogs/ai-pdm-role-catalog.v7.json', hash: AI_PDM_ROLE_CATALOG_V7_SHA256 },
} as const

export type PublishedAiPdmRole = {
  stableRoleId: string
  roleCode: string
  displayName: string
  assignable: boolean
  risk: 'normal' | 'high' | 'critical'
  subjectKind: 'employee' | 'principal'
  recommendationAllowed: boolean
  delegationAllowed: boolean
  allowedScopeKinds: Array<'workspace' | 'project' | 'global'>
  assignmentTier: 'app_admin' | 'cross_app_override'
  permissions: Array<{ code: string; kind: 'page' | 'action'; allowed: boolean }>
  metadata?: Record<string, string | boolean | number | null> | null
  roleStatus?: 'active' | 'inactive'
  roleDefinitionHash: string
}

export type PublishedAiPdmRoleCatalog = {
  contractVersion: typeof JENFU_ENTITLEMENT_CONTRACT_VERSION
  applicationId: typeof AI_PDM_APPLICATION_ID
  catalogVersion: string
  publishedAt: string
  roles: PublishedAiPdmRole[]
  catalogSha256: string
  sourcePath: string
} & Partial<DynamicCatalogMetadata>

export class AiPdmRoleCatalogRepositoryError extends Error {
  constructor(readonly code: 'EXTERNAL_CATALOG_UNAVAILABLE' | 'EXTERNAL_CATALOG_INVALID' | 'EXTERNAL_CATALOG_STALE') {
    super(code)
    this.name = 'AiPdmRoleCatalogRepositoryError'
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && /\S/u.test(value)
}

function isSha256(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

function canonicalRole(role: PublishedAiPdmRole) {
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
    permissions: [...role.permissions].sort((a, b) => `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)),
    metadata: role.metadata ?? null,
  })
}

function canonicalCatalog(catalog: PublishedAiPdmRoleCatalog) {
  return JSON.stringify({
    contractVersion: catalog.contractVersion,
    applicationId: catalog.applicationId,
    catalogVersion: catalog.catalogVersion,
    roles: catalog.roles.map((role) => ({ ...JSON.parse(canonicalRole(role)), roleDefinitionHash: role.roleDefinitionHash })),
  })
}

function validateCatalog(catalog: PublishedAiPdmRoleCatalog) {
  const approved = APPROVED_CATALOGS[catalog.catalogVersion];
  if (catalog.contractVersion !== JENFU_ENTITLEMENT_CONTRACT_VERSION || catalog.applicationId !== AI_PDM_APPLICATION_ID || !approved || !nonBlank(catalog.publishedAt) || !Array.isArray(catalog.roles) || catalog.roles.length !== 9 || !isSha256(catalog.catalogSha256)) {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  if (catalog.catalogSha256 !== approved.hash || catalog.catalogSha256 !== sha256(canonicalCatalog(catalog))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  const stableIds = new Set<string>()
  const roleCodes = new Set<string>()
  for (const role of catalog.roles) {
    if (!nonBlank(role.stableRoleId) || !nonBlank(role.roleCode) || stableIds.has(role.stableRoleId) || roleCodes.has(role.roleCode) || !isSha256(role.roleDefinitionHash) || role.roleDefinitionHash !== sha256(canonicalRole(role))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
    stableIds.add(role.stableRoleId)
    roleCodes.add(role.roleCode)
    if (role.roleCode === 'system_admin' && (role.stableRoleId !== 'role-system-admin' || role.assignable !== true || role.risk !== 'critical' || role.subjectKind !== 'principal' || role.assignmentTier !== 'cross_app_override' || role.recommendationAllowed || role.delegationAllowed || JSON.stringify(role.allowedScopeKinds) !== JSON.stringify(['global']))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
    if (role.roleCode === 'external_specialist' && (role.subjectKind !== 'employee' || role.recommendationAllowed || role.delegationAllowed || JSON.stringify(role.allowedScopeKinds) !== JSON.stringify(['project']))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  return catalog
}

export async function readPublishedAiPdmRoleCatalog(root = process.cwd(), catalogVersion: PublishedAiPdmRoleCatalog['catalogVersion'] = AI_PDM_ROLE_CATALOG_VERSION): Promise<PublishedAiPdmRoleCatalog> {
  const approved = APPROVED_CATALOGS[catalogVersion]
  if (!approved) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_STALE')
  const sourcePath = resolve(root, approved.path)
  let raw: string
  try {
    await access(sourcePath)
    raw = await readFile(sourcePath, 'utf8')
  } catch {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_UNAVAILABLE')
  }
  let parsed: Partial<PublishedAiPdmRoleCatalog>
  try {
    parsed = JSON.parse(raw) as Partial<PublishedAiPdmRoleCatalog>
  } catch {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  return validateCatalog({ ...parsed, sourcePath } as PublishedAiPdmRoleCatalog)
}

type CatalogQueryResult = { rows: Array<Record<string, unknown>>; rowCount?: number | null }
export type AiPdmRoleCatalogQueryable = { query: (sql: string, values?: unknown[]) => Promise<CatalogQueryResult> }

const AI_PDM_ROLE_CATALOG_V2_COLUMNS = `contract_version, application_id, catalog_version, published_at, catalog_sha256,
              display_order, stable_role_id, role_code, display_name, assignable, risk,
              subject_kind, recommendation_allowed, delegation_allowed, allowed_scope_kinds,
              assignment_tier, permissions, metadata, role_definition_hash,
              publication_format, canonicalization_version, role_schema_id,
              baseline_role_identity_hash, role_identity_hash, protected_policy_hash, registry_hash,
              role_profile_schema_id, role_profile_hash, role_status, permission_role_id,
              presentation_name, presentation_order, assignment_disposition, lifecycle`

/** New CONTENT versions may change business capabilities, not the assignment contract. */
function validateAssignmentCompatibleCatalog(catalog: PublishedAiPdmRoleCatalog, baseline: PublishedAiPdmRoleCatalog) {
  const invalid = () => { throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID') }
  if (catalog.contractVersion !== baseline.contractVersion || catalog.applicationId !== baseline.applicationId ||
    !Number.isFinite(Date.parse(catalog.publishedAt)) || catalog.roles.length !== baseline.roles.length || !isSha256(catalog.catalogSha256)) invalid()
  const identity = (role: PublishedAiPdmRole) => {
    const { permissions: _permissions, roleDefinitionHash: _hash, ...fields } = role
    return fields
  }
  const roles = catalog.roles.map((role, index) => {
    const original = baseline.roles[index]
    if (!isDeepStrictEqual(identity(role), identity(original)) || !Array.isArray(role.permissions)) invalid()
    const seen = new Set<string>()
    const permissions = role.permissions.map(permission => {
      if (!permission || Object.keys(permission).sort().join(',') !== 'allowed,code,kind' ||
        !['page', 'action'].includes(permission.kind) || typeof permission.code !== 'string' ||
        !/^[a-z0-9][a-z0-9._-]{0,159}$/.test(permission.code) || typeof permission.allowed !== 'boolean') invalid()
      const key = `${permission.kind}:${permission.code}`
      if (seen.has(key)) invalid()
      seen.add(key)
      return { code: permission.code, kind: permission.kind, allowed: permission.allowed }
    })
    const normalized = { ...original, permissions, roleDefinitionHash: role.roleDefinitionHash }
    for (const denied of original.permissions.filter(permission => !permission.allowed)) {
      if (!permissions.some(permission => permission.kind === denied.kind && permission.code === denied.code && !permission.allowed)) invalid()
    }
    if (original.roleCode === 'system_admin' && !isDeepStrictEqual(permissions, original.permissions)) invalid()
    if (sha256(canonicalRole(normalized)) !== role.roleDefinitionHash) invalid()
    return normalized
  })
  const normalized = { ...catalog, roles }
  if (sha256(canonicalCatalog(normalized)) !== catalog.catalogSha256) invalid()
  return normalized
}

async function decodeDatabaseCatalogRows(rows: Array<Record<string, unknown>>, expectedCatalogSha256?: string): Promise<PublishedAiPdmRoleCatalog> {
  if (!rows.length) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_UNAVAILABLE')
  const first = rows[0]
  if (first.publication_format === 'dynamic-policy-v1' || String(first.catalog_version).startsWith('ai-pdm.role-policy.')) {
    try {
      const decoded = decodeDynamicAiPdmRoleCatalog(rows, await Promise.all(Object.keys(APPROVED_CATALOGS).map(version => readPublishedAiPdmRoleCatalog(process.cwd(), version))))
      if (expectedCatalogSha256 && decoded.catalogSha256 !== expectedCatalogSha256.toLowerCase()) throw new Error('catalog binding conflict')
      return decoded
    } catch { throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID') }
  }
  const pinned = Object.hasOwn(APPROVED_CATALOGS, String(first.catalog_version))
  if (!pinned && !/^ai-pdm\.role-catalog\.\d{4}-\d{2}-\d{2}\.v[1-9]\d*$/.test(String(first.catalog_version))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_STALE')
  if (expectedCatalogSha256 && String(first.catalog_sha256).toLowerCase() !== expectedCatalogSha256.toLowerCase()) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_STALE')
  if (rows.some((row, index) => row.contract_version !== first.contract_version || row.application_id !== first.application_id || row.catalog_version !== first.catalog_version || row.catalog_sha256 !== first.catalog_sha256 || Number(row.display_order) !== index)) {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  const publishedAt = first.published_at instanceof Date ? first.published_at.toISOString() : String(first.published_at)
  const catalog = {
    contractVersion: first.contract_version,
    applicationId: first.application_id,
    catalogVersion: first.catalog_version,
    publishedAt,
    catalogSha256: first.catalog_sha256,
    roles: rows.map((row) => ({
      stableRoleId: row.stable_role_id,
      roleCode: row.role_code,
      displayName: row.display_name,
      assignable: row.assignable,
      risk: row.risk,
      subjectKind: row.subject_kind,
      recommendationAllowed: row.recommendation_allowed,
      delegationAllowed: row.delegation_allowed,
      allowedScopeKinds: row.allowed_scope_kinds,
      assignmentTier: row.assignment_tier,
      permissions: row.permissions,
      ...(row.metadata == null ? {} : { metadata: row.metadata }),
      roleDefinitionHash: row.role_definition_hash,
    })),
    sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2',
  } as PublishedAiPdmRoleCatalog
  if (!pinned) {
    try {
      if (rows.some(row => new Date(row.published_at as string | Date).toISOString() !== new Date(publishedAt).toISOString())) throw new Error('mixed publication')
      return validateAssignmentCompatibleCatalog(catalog, await readPublishedAiPdmRoleCatalog(process.cwd(), AI_PDM_ROLE_CATALOG_V7_VERSION))
    } catch (error) {
      if (error instanceof AiPdmRoleCatalogRepositoryError) throw error
      throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
    }
  }
  // jsonb preserves values, but not nested object key insertion order. The
  // producer's frozen digest was computed from its source JSON serialization,
  // so hashing decoded jsonb would reject an identical published catalog.
  // Compare exact values against the independently validated source snapshot.
  const approved = await readPublishedAiPdmRoleCatalog(process.cwd(), first.catalog_version as PublishedAiPdmRoleCatalog['catalogVersion'])
  const { sourcePath: _publishedPath, ...publishedValues } = approved
  const { sourcePath: _databasePath, ...databaseValues } = catalog
  if (!isDeepStrictEqual(databaseValues, publishedValues)) {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  return catalog
}

/** Read exactly one current producer projection. The producer owns the active pointer. */
export async function readPublishedAiPdmRoleCatalogFromDatabase(database: AiPdmRoleCatalogQueryable, expectedCatalogSha256?: string): Promise<PublishedAiPdmRoleCatalog> {
  let rows: Array<Record<string, unknown>>
  try {
    const result = await database.query(
      `SELECT ${AI_PDM_ROLE_CATALOG_V2_COLUMNS}
         FROM ai_pdm_contract.v_application_role_catalog_v2
        ORDER BY display_order`,
    )
    rows = result.rows
  } catch {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_UNAVAILABLE')
  }
  return decodeDatabaseCatalogRows(rows, expectedCatalogSha256)
}

/** Read one immutable publication needed to validate stored assignment provenance. */
export async function readHistoricalAiPdmRoleCatalogFromDatabase(
  database: AiPdmRoleCatalogQueryable,
  catalogVersion: string,
  expectedCatalogSha256?: string,
): Promise<PublishedAiPdmRoleCatalog> {
  if (!nonBlank(catalogVersion) || catalogVersion.length > 200) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_STALE')
  let rows: Array<Record<string, unknown>>
  try {
    const result = await database.query(
      `SELECT ${AI_PDM_ROLE_CATALOG_V2_COLUMNS}
         FROM ai_pdm_contract.v_role_policy_publications_v1
        WHERE application_id = $1 AND catalog_version = $2
        ORDER BY display_order`,
      [AI_PDM_APPLICATION_ID, catalogVersion],
    )
    rows = result.rows
  } catch {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_UNAVAILABLE')
  }
  const catalog = await decodeDatabaseCatalogRows(rows, expectedCatalogSha256)
  if (catalog.catalogVersion !== catalogVersion) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  return { ...catalog, sourcePath: 'postgres:ai_pdm_contract.v_role_policy_publications_v1' }
}
