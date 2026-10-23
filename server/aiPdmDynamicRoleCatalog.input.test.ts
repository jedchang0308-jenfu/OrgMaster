import { describe, expect, it } from 'vitest'
import vectors from '../config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json'
import { decodeDynamicAiPdmRoleCatalog } from './aiPdmDynamicRoleCatalog'
import { readPublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'

/** Producer-shaped rows from the immutable handoff vector; no product canonicalization is duplicated here. */
function projection(vector = vectors[2]): Record<string, unknown>[] {
  const policy = vector.policy
  return policy.roles.map((role, index) => ({
    contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm',
    catalog_version: policy.candidateCatalogVersion, catalog_sha256: policy.contentHash,
    published_at: vector.publishedAt, display_order: index,
    stable_role_id: role.stableRoleId, role_code: role.roleCode, display_name: role.displayName,
    assignable: role.assignable, risk: role.risk, subject_kind: role.subjectKind,
    recommendation_allowed: role.recommendationAllowed, delegation_allowed: role.delegationAllowed,
    allowed_scope_kinds: role.allowedScopeKinds, assignment_tier: role.assignmentTier,
    metadata: role.metadata, permissions: role.permissions, role_definition_hash: role.roleDefinitionHash,
    role_status: role.roleStatus, lifecycle: 'active', publication_format: policy.format,
    canonicalization_version: 'jenfu.canonical-json.v1', role_schema_id: policy.roleSchemaId,
    role_profile_schema_id: policy.roleProfileSchemaId, baseline_role_identity_hash: policy.baselineRoleIdentityHash,
    role_identity_hash: policy.roleIdentityHash, registry_hash: policy.registryHash,
    protected_policy_hash: policy.protectedPolicyHash, role_profile_hash: policy.roleProfileHash,
    permission_role_id: policy.roleProfiles[index].permissionRoleId,
    presentation_name: policy.roleProfiles[index].presentationName,
    presentation_order: policy.roleProfiles[index].presentationOrder,
    assignment_disposition: policy.roleProfiles[index].assignmentDisposition,
  }))
}

describe('dynamic PDM catalog source input boundary', () => {
  it('accepts the 34-column producer projection without activation_generation', async () => {
    const rows = projection()
    const baseline = await readPublishedAiPdmRoleCatalog(process.cwd(), vectors[2].baselineCatalogVersion)

    expect(Object.keys(rows[0])).toHaveLength(34)
    expect(rows.every(row => !Object.hasOwn(row, 'activation_generation'))).toBe(true)
    const catalog = decodeDynamicAiPdmRoleCatalog(rows, [baseline])

    expect(catalog.roles).toHaveLength(10)
    expect(catalog.catalogVersion).toBe(vectors[2].policy.candidateCatalogVersion)
  })

  it('accepts a valid Unicode custom identity from the producer vector', async () => {
    const rows = projection()
    const baseline = await readPublishedAiPdmRoleCatalog(process.cwd(), vectors[2].baselineCatalogVersion)
    const catalog = decodeDynamicAiPdmRoleCatalog(rows, [baseline])

    expect(catalog.roles[9]).toMatchObject({ stableRoleId: vectors[2].policy.roles[9].stableRoleId, displayName: '供應協作' })
  })

  it.each([
    ['positive unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['negative unsafe integer', Number.MIN_SAFE_INTEGER - 1],
    ['NaN', Number.NaN],
    ['positive Infinity', Number.POSITIVE_INFINITY],
    ['negative Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s in producer numeric input', async (_label, value) => {
    const rows = projection()
    const baseline = await readPublishedAiPdmRoleCatalog(process.cwd(), vectors[2].baselineCatalogVersion)
    rows[9].presentation_order = value

    expect(() => decodeDynamicAiPdmRoleCatalog(rows, [baseline])).toThrow('EXTERNAL_CATALOG_INVALID')
  })

  it.each([
    ['lone high surrogate', '\uD800'],
    ['lone low surrogate', '\uDC00'],
  ])('rejects %s in a custom identity display name', async (_label, value) => {
    const rows = projection()
    const baseline = await readPublishedAiPdmRoleCatalog(process.cwd(), vectors[2].baselineCatalogVersion)
    rows[9].display_name = value

    expect(() => decodeDynamicAiPdmRoleCatalog(rows, [baseline])).toThrow('EXTERNAL_CATALOG_INVALID')
  })
})
