import type { PublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'

export function catalogRows(catalog: PublishedAiPdmRoleCatalog) {
  return catalog.roles.map((role, index) => ({ contract_version: catalog.contractVersion,
    application_id: catalog.applicationId, catalog_version: catalog.catalogVersion, published_at: catalog.publishedAt,
    catalog_sha256: catalog.catalogSha256, display_order: index, stable_role_id: role.stableRoleId,
    role_code: role.roleCode, display_name: role.displayName, assignable: role.assignable, risk: role.risk,
    subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
    delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
    assignment_tier: role.assignmentTier, permissions: role.permissions, metadata: role.metadata ?? null,
    role_definition_hash: role.roleDefinitionHash }))
}

/** Mock the relation probe separately; catalog rows must never answer it. */
export function catalogQueryResult(sql: string, rows: Array<Record<string, unknown>>, v3 = true) {
  if (sql === "SELECT pg_catalog.to_regclass('ai_pdm_contract.v_application_role_catalog_v3') IS NOT NULL AS v3_exists") return { rows: [{ v3_exists: v3 }] }
  return { rows }
}
