import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import v8 from '../config/catalogs/ai-pdm-role-catalog.v8.json'
import registry from '../contracts/ai-pdm-role-policy-catalog/v3/editor-registry.json'
import { createAiPdmRoleCatalog, validateExternalRoleCatalog } from '../src/governance/aiPdmCatalog'
import { readHistoricalAiPdmRoleCatalogFromDatabase, readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'

// Source-shaped v3 projection, including native NULLs and static self bindings.
function rows() {
  return v8.roles.map((role, index): Record<string, unknown> => {
    const profile = index === 9 ? registry.roleProfiles[9] : {
      permissionRoleId: role.stableRoleId, presentationName: role.displayName, presentationOrder: index,
      assignmentDisposition: index === 8 ? 'hidden-protected' : 'selectable',
    }
    return { contract_version: v8.contractVersion, application_id: v8.applicationId,
      catalog_version: v8.catalogVersion, catalog_sha256: v8.catalogSha256, published_at: new Date('2026-11-06T15:00:00.000Z'),
      display_order: index, stable_role_id: role.stableRoleId, role_code: role.roleCode, display_name: role.displayName,
      assignable: role.assignable, risk: role.risk, subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
      delegation_allowed: role.delegationAllowed, allowed_scope_kinds: structuredClone(role.allowedScopeKinds), assignment_tier: role.assignmentTier,
      permissions: structuredClone(role.permissions), metadata: structuredClone(role.metadata ?? null), role_definition_hash: role.roleDefinitionHash,
      publication_format: 'legacy-static-v1', canonicalization_version: null, role_schema_id: null,
      baseline_role_identity_hash: null, role_identity_hash: null, protected_policy_hash: null, registry_hash: null,
      role_profile_schema_id: 'ai-pdm.static-role-profiles.v1', role_profile_hash: '6cbc0346701146191fca929354883eb04a758daa7a695cc22c41c7bb5dfb5fe9',
      role_status: 'active', permission_role_id: profile.permissionRoleId, presentation_name: profile.presentationName,
      presentation_order: profile.presentationOrder, assignment_disposition: profile.assignmentDisposition, lifecycle: 'active' }
  })
}
function database(nativeRows = rows(), v3 = true) {
  const calls: string[] = []
  return { calls, query: async (sql: string) => {
    calls.push(sql)
    if (sql.includes('pg_catalog.to_regclass')) return { rows: [{ v3_exists: v3 }] }
    if (sql.includes(`FROM ai_pdm_contract.v_application_role_catalog_${v3 ? 'v3' : 'v2'}`)) return { rows: nativeRows }
    throw new Error('unexpected view')
  } }
}
describe('DEV070 exact static-v8 normal catalog reader', () => {
  it('reads the complete source-pinned ten-row v3 publication through the normal DB and governance pipeline', async () => {
    const db = database()
    const catalog = await readPublishedAiPdmRoleCatalogFromDatabase(db, v8.catalogSha256)
    expect(catalog.roles).toEqual(v8.roles)
    expect(catalog.sourcePath).toBe('postgres:ai_pdm_contract.v_application_role_catalog_v3')
    const snapshot = createAiPdmRoleCatalog('valid', catalog.publishedAt, catalog)
    expect(validateExternalRoleCatalog(snapshot)).toEqual([])
    expect(snapshot.sourceRefs).toEqual([{ path: 'ai_pdm_contract.v_application_role_catalog_v3', range: 'verified active publication', sha256: v8.catalogSha256 }])
    expect(snapshot.roles[4]).toMatchObject({ permissionRoleId: 'role-production-planning', presentationName: '生管人員', presentationOrder: 4 })
    expect(snapshot.roles[9]).toMatchObject({ roleDefinitionHash: v8.roles[9].roleDefinitionHash, assignmentDisposition: 'hidden-protected' })
    expect(db.calls).toHaveLength(2)
  })
  it('retains exact vendored v8 and its protected hash rather than applying the legacy role hash algorithm', async () => {
    const catalog = await readPublishedAiPdmRoleCatalog(process.cwd(), v8.catalogVersion)
    expect(catalog.roles).toEqual(v8.roles)
    expect(catalog.roles[9].roleDefinitionHash).toBe('e7ff57ed1ca6d2d99e6e052f1f48829365093a32a1d6bb9f8503490a3e7bcbfc')
  })
  it('rejects changed vendored bytes even when only its unhashed publication time changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-static-v8-'))
    try {
      await mkdir(join(root, 'config', 'catalogs'), { recursive: true })
      await writeFile(join(root, 'config', 'catalogs', 'ai-pdm-role-catalog.v8.json'), JSON.stringify({ ...v8, publishedAt: '2026-11-07T00:00:00.000Z' }))
      await expect(readPublishedAiPdmRoleCatalog(root, v8.catalogVersion)).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('accepts PostgreSQL JSONB key reordering without changing role or permission order', async () => {
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value
    const native = rows().map(row => ({ ...row, permissions: reverse(row.permissions), metadata: reverse(row.metadata) }))
    await expect(readPublishedAiPdmRoleCatalogFromDatabase(database(native))).resolves.toMatchObject({ catalogVersion: v8.catalogVersion })
  })
  it.each([
    ['missing', (r: Record<string, unknown>[]) => { r.pop() }],
    ['extra', (r: Record<string, unknown>[]) => { r.push({ ...r[9], display_order: 10 }) }],
    ['hash', (r: Record<string, unknown>[]) => { r.forEach(row => { row.catalog_sha256 = '0'.repeat(64) }) }],
    ['permission', (r: Record<string, unknown>[]) => { r[0].permissions = [] }],
    ['protected permission', (r: Record<string, unknown>[]) => { r[9].permissions = [] }],
    ['protected hash', (r: Record<string, unknown>[]) => { r[9].role_definition_hash = createHash('sha256').update('legacy hash').digest('hex') }],
    ['role identity', (r: Record<string, unknown>[]) => { r[9].stable_role_id = 'role-system-admin' }],
    ['order', (r: Record<string, unknown>[]) => { r[0].display_order = 1 }],
    ['subject', (r: Record<string, unknown>[]) => { r[9].subject_kind = 'employee' }],
    ['assignable', (r: Record<string, unknown>[]) => { r[9].assignable = true }],
    ['inactive', (r: Record<string, unknown>[]) => { r[9].role_status = 'inactive' }],
    ['retired current', (r: Record<string, unknown>[]) => { r.forEach(row => { row.lifecycle = 'retired' }) }],
    ['dynamic profile alias', (r: Record<string, unknown>[]) => { r[4].permission_role_id = 'role-procurement' }],
    ['protected profile', (r: Record<string, unknown>[]) => { r[9].assignment_disposition = 'selectable' }],
    ['profile hash', (r: Record<string, unknown>[]) => { r[9].role_profile_hash = '0'.repeat(64) }],
    ['profile schema', (r: Record<string, unknown>[]) => { r[9].role_profile_schema_id = 'ai-pdm.role-profile-schema.v1' }],
    ['canonical metadata', (r: Record<string, unknown>[]) => { r[0].canonicalization_version = 'jenfu.canonical-json.v1' }],
    ['missing metadata', (r: Record<string, unknown>[]) => { delete r[0].registry_hash }],
    ['extra field', (r: Record<string, unknown>[]) => { r[0].unknown_authority = true }],
    ['mixed publication', (r: Record<string, unknown>[]) => { r[1].published_at = new Date('2026-11-07T00:00:00Z') }],
    ['format', (r: Record<string, unknown>[]) => { r.forEach(row => { row.publication_format = 'dynamic-policy-v1' }) }],
  ] as const)('rejects %s without fallback', async (_name, mutate) => {
    const native = rows(); mutate(native); const db = database(native)
    await expect(readPublishedAiPdmRoleCatalogFromDatabase(db)).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
    expect(db.calls).toHaveLength(2)
  })
  it('rejects static-v8 from the pre-096 v2 view', async () => {
    await expect(readPublishedAiPdmRoleCatalogFromDatabase(database(rows(), false))).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
  })
  it('retains historical v8 provenance after normal retirement without accepting it as current', async () => {
    const native = rows().map(row => ({ ...row, lifecycle: 'retired' }))
    const catalog = await readHistoricalAiPdmRoleCatalogFromDatabase({ query: async sql => {
      expect(sql).toContain('FROM ai_pdm_contract.v_role_policy_publications_v1')
      return { rows: native }
    } }, v8.catalogVersion, v8.catalogSha256)
    expect(catalog.roles).toEqual(v8.roles)
    expect(catalog.sourcePath).toBe('postgres:ai_pdm_contract.v_role_policy_publications_v1')
  })
})
