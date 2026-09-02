import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const JENFU_ENTITLEMENT_CONTRACT_VERSION = 'jenfu.platform-entitlement.v1' as const
export const AI_PDM_APPLICATION_ID = 'ai-pdm' as const
export const AI_PDM_ROLE_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-02.v2' as const
export const AI_PDM_ROLE_CATALOG_SHA256 = 'ebdaa2960960e0683b480c721d2c27df59031b4af23b124f2ac7e882309f6b6e' as const

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
  metadata?: Record<string, string | boolean | number | null>
  roleDefinitionHash: string
}

export type PublishedAiPdmRoleCatalog = {
  contractVersion: typeof JENFU_ENTITLEMENT_CONTRACT_VERSION
  applicationId: typeof AI_PDM_APPLICATION_ID
  catalogVersion: typeof AI_PDM_ROLE_CATALOG_VERSION
  publishedAt: string
  roles: PublishedAiPdmRole[]
  catalogSha256: string
  sourcePath: string
}

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
  if (catalog.contractVersion !== JENFU_ENTITLEMENT_CONTRACT_VERSION || catalog.applicationId !== AI_PDM_APPLICATION_ID || catalog.catalogVersion !== AI_PDM_ROLE_CATALOG_VERSION || !nonBlank(catalog.publishedAt) || !Array.isArray(catalog.roles) || catalog.roles.length !== 9 || !isSha256(catalog.catalogSha256)) {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  if (catalog.catalogSha256 !== AI_PDM_ROLE_CATALOG_SHA256 || catalog.catalogSha256 !== sha256(canonicalCatalog(catalog))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  const stableIds = new Set<string>()
  const roleCodes = new Set<string>()
  for (const role of catalog.roles) {
    if (!nonBlank(role.stableRoleId) || !nonBlank(role.roleCode) || stableIds.has(role.stableRoleId) || roleCodes.has(role.roleCode) || !isSha256(role.roleDefinitionHash) || role.roleDefinitionHash !== sha256(canonicalRole(role))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
    stableIds.add(role.stableRoleId)
    roleCodes.add(role.roleCode)
    if (role.roleCode === 'system_admin' && (role.subjectKind !== 'principal' || role.recommendationAllowed || role.delegationAllowed || JSON.stringify(role.allowedScopeKinds) !== JSON.stringify(['global']))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
    if (role.roleCode === 'external_specialist' && (role.subjectKind !== 'employee' || role.recommendationAllowed || role.delegationAllowed || JSON.stringify(role.allowedScopeKinds) !== JSON.stringify(['project']))) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_INVALID')
  }
  return catalog
}

export async function readPublishedAiPdmRoleCatalog(root = process.cwd()): Promise<PublishedAiPdmRoleCatalog> {
  const sourcePath = resolve(root, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json')
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

export async function readPublishedAiPdmRoleCatalogFromDatabase(database: AiPdmRoleCatalogQueryable, expectedCatalogSha256?: string): Promise<PublishedAiPdmRoleCatalog> {
  let rows: Array<Record<string, unknown>>
  try {
    const result = await database.query(
      `SELECT contract_version, application_id, catalog_version, published_at, catalog_sha256,
              display_order, stable_role_id, role_code, display_name, assignable, risk,
              subject_kind, recommendation_allowed, delegation_allowed, allowed_scope_kinds,
              assignment_tier, permissions, metadata, role_definition_hash
         FROM ai_pdm_contract.v_application_role_catalog_v1
        ORDER BY display_order`,
    )
    rows = result.rows
  } catch {
    throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_UNAVAILABLE')
  }
  if (!rows.length) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_UNAVAILABLE')
  const first = rows[0]
  if (first.catalog_version !== AI_PDM_ROLE_CATALOG_VERSION) throw new AiPdmRoleCatalogRepositoryError('EXTERNAL_CATALOG_STALE')
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
      metadata: row.metadata ?? undefined,
      roleDefinitionHash: row.role_definition_hash,
    })),
    sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v1',
  } as PublishedAiPdmRoleCatalog
  return validateCatalog(catalog)
}
