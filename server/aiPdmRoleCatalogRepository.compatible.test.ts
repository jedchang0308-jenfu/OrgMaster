import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase, type PublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import { createAiPdmRoleCatalog, validateExternalRoleCatalog } from '../src/governance/aiPdmCatalog'
import { validatePolicyDataV3 } from '../src/governance/validation'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function rehash(catalog: PublishedAiPdmRoleCatalog) {
  const roles = catalog.roles.map(role => {
    const payload = { stableRoleId: role.stableRoleId, roleCode: role.roleCode, displayName: role.displayName,
      assignable: role.assignable, risk: role.risk, subjectKind: role.subjectKind,
      recommendationAllowed: role.recommendationAllowed, delegationAllowed: role.delegationAllowed,
      allowedScopeKinds: [...role.allowedScopeKinds].sort(), assignmentTier: role.assignmentTier,
      permissions: [...role.permissions].map(value => ({ code: value.code, kind: value.kind, allowed: value.allowed }))
        .sort((a, b) => `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)), metadata: role.metadata ?? null }
    role.roleDefinitionHash = hash(JSON.stringify(payload))
    return { ...payload, roleDefinitionHash: role.roleDefinitionHash }
  })
  catalog.catalogSha256 = hash(JSON.stringify({ contractVersion: catalog.contractVersion,
    applicationId: catalog.applicationId, catalogVersion: catalog.catalogVersion, roles }))
  return catalog
}
export async function compatibleCatalog(version = 8) {
  const catalog = structuredClone(await readPublishedAiPdmRoleCatalog(process.cwd(), 'ai-pdm.role-catalog.2026-10-10.v7'))
  catalog.catalogVersion = `ai-pdm.role-catalog.2026-10-19.v${version}`
  catalog.publishedAt = '2026-10-19T00:00:00.000Z'
  if (version === 8) catalog.roles[0].permissions = catalog.roles[0].permissions.filter(value => value.code !== 'numbering.drawings.view')
  return rehash(catalog)
}
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
const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) :
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, reorder(child)])) : value

describe('DEV-058 assignment-compatible content publications', () => {
  it('accepts two capability versions without a new consumer pin, even after jsonb key reordering', async () => {
    for (const version of [8, 9]) {
      const expected = await compatibleCatalog(version)
      const rows = reorder(catalogRows(expected)) as ReturnType<typeof catalogRows>
      const catalog = await readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) })
      expect(catalog.catalogSha256).toBe(expected.catalogSha256)
      expect(catalog.catalogVersion).toBe(expected.catalogVersion)
      expect(validateExternalRoleCatalog(createAiPdmRoleCatalog('valid', catalog.publishedAt, catalog))).toEqual([])
    }
  })
  it.each(['identity', 'scope', 'subject', 'protected', 'order'] as const)('rejects self-consistently rehashed %s contract changes', async field => {
    const catalog = await compatibleCatalog()
    if (field === 'identity') catalog.roles[0].stableRoleId = 'role-forged'
    if (field === 'scope') catalog.roles[0].allowedScopeKinds = ['global']
    if (field === 'subject') catalog.roles[0].subjectKind = 'principal'
    if (field === 'protected') catalog.roles.find(value => value.roleCode === 'system_admin')!.permissions.pop()
    if (field === 'order') catalog.roles.reverse()
    rehash(catalog)
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows: catalogRows(catalog) }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
  })
  it('rejects content tampering, mixed headers and an exact stale caller binding', async () => {
    const catalog = await compatibleCatalog()
    const rows = catalogRows(catalog)
    rows[0].permissions[0].allowed = !rows[0].permissions[0].allowed
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
    rows[0].permissions[0].allowed = !rows[0].permissions[0].allowed
    rows[1].catalog_version = 'mixed'
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows: catalogRows(catalog) }) }, '0'.repeat(64))).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_STALE' })
  })
  it('keeps A-version assignment provenance under B only with a supplied trusted history snapshot', async () => {
    const a = createAiPdmRoleCatalog('valid', '2026-10-19T00:00:00.000Z', await compatibleCatalog(8))
    const b = createAiPdmRoleCatalog('valid', '2026-10-19T00:00:00.000Z', await compatibleCatalog(9))
    const document = migrateGovernanceV2ToV3(createSeedDocumentV2(), 'fixture', b)
    document.draft.roleAssignments = [{ id: 'original-a', employeeId: 'employee-1', applicationId: 'ai-pdm', roleId: 'role-rd',
      roleCodeSnapshot: 'rd', roleNameSnapshot: '研發人員', catalogVersion: a.catalogVersion,
      scope: { kind: 'workspace', value: 'company-test' }, status: 'active', validFrom: '2000-01-01T00:00:00.000Z', validTo: null,
      effectState: 'not-synchronized', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], createdByPrincipalId: 'test-manager' }]
    const original = structuredClone(document.draft.roleAssignments)
    expect(validatePolicyDataV3(document.draft, undefined, [b, a])).toEqual([])
    expect(validatePolicyDataV3(document.draft, undefined, [b]).some(issue => issue.code === 'EXTERNAL_ASSIGNMENT_SNAPSHOT_INVALID')).toBe(true)
    expect(document.draft.roleAssignments).toEqual(original)
  })
})

it.runIf(!!process.env.DEV058_CATALOG_POSTGRES_URL && !!process.env.DEV058_PDM_BUILDER)('reads actual PDM owner artifacts through a SELECT-only PostgreSQL contract', async () => {
  const url = new URL(process.env.DEV058_CATALOG_POSTGRES_URL!)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.startsWith('/dev058_') || url.port === '5432') throw Error('TASK_OWNED_DATABASE_REQUIRED')
  const database = new pg.Client({ connectionString: url.toString() })
  await database.connect()
  try {
    const existing = await database.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('ai_pdm_core','ai_pdm_contract')")
    expect(existing.rows).toHaveLength(0)
    const builder = await import(/* @vite-ignore */ pathToFileURL(process.env.DEV058_PDM_BUILDER!).href)
    const baseline = await readPublishedAiPdmRoleCatalog(process.cwd(), 'ai-pdm.role-catalog.2026-10-10.v7')
    await database.query(`CREATE ROLE dev058_pdm_owner NOLOGIN; CREATE ROLE dev058_org_consumer NOLOGIN;
      CREATE SCHEMA ai_pdm_core AUTHORIZATION dev058_pdm_owner;
      CREATE SCHEMA ai_pdm_contract AUTHORIZATION dev058_pdm_owner;
      SET ROLE dev058_pdm_owner;
      CREATE TABLE ai_pdm_core.catalog_fixture(payload jsonb NOT NULL);
      CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS SELECT
        payload->>'contractVersion' AS contract_version, payload->>'applicationId' AS application_id,
        payload->>'catalogVersion' AS catalog_version, (payload->>'publishedAt')::timestamptz AS published_at,
        payload->>'catalogSha256' AS catalog_sha256, (ordinal-1)::integer AS display_order,
        role->>'stableRoleId' AS stable_role_id, role->>'roleCode' AS role_code, role->>'displayName' AS display_name,
        (role->>'assignable')::boolean AS assignable, role->>'risk' AS risk, role->>'subjectKind' AS subject_kind,
        (role->>'recommendationAllowed')::boolean AS recommendation_allowed,
        (role->>'delegationAllowed')::boolean AS delegation_allowed,
        ARRAY(SELECT jsonb_array_elements_text(role->'allowedScopeKinds')) AS allowed_scope_kinds,
        role->>'assignmentTier' AS assignment_tier, role->'permissions' AS permissions,
        role->'metadata' AS metadata, role->>'roleDefinitionHash' AS role_definition_hash
      FROM ai_pdm_core.catalog_fixture CROSS JOIN LATERAL jsonb_array_elements(payload->'roles') WITH ORDINALITY AS r(role,ordinal);
      GRANT USAGE ON SCHEMA ai_pdm_contract TO dev058_org_consumer;
      GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO dev058_org_consumer;`)
    for (const version of [8, 9]) {
      const roles = structuredClone(baseline.roles)
      if (version === 8) roles[0].permissions = roles[0].permissions.filter(value => value.code !== 'numbering.drawings.view')
      const artifact = builder.buildAssignmentCompatibleRoleCatalog({ roles,
        catalogVersion: `ai-pdm.role-catalog.2026-10-19.v${version}`, publishedAt: '2026-10-19T00:00:00.000Z' })
      await database.query('RESET ROLE; SET ROLE dev058_pdm_owner; DELETE FROM ai_pdm_core.catalog_fixture')
      await database.query('INSERT INTO ai_pdm_core.catalog_fixture(payload) VALUES ($1::jsonb)', [JSON.stringify(artifact)])
      await database.query('RESET ROLE; SET ROLE dev058_org_consumer')
      const decoded = await readPublishedAiPdmRoleCatalogFromDatabase(database)
      expect(decoded.catalogSha256).toBe(artifact.catalogSha256)
      expect(validateExternalRoleCatalog(createAiPdmRoleCatalog('valid', decoded.publishedAt, decoded))).toEqual([])
      await expect(database.query('SELECT * FROM ai_pdm_core.catalog_fixture')).rejects.toMatchObject({ code: '42501' })
      const privilege = await database.query("SELECT has_table_privilege(current_user, 'ai_pdm_contract.v_application_role_catalog_v1', 'DELETE') AS can_delete")
      expect(privilege.rows[0].can_delete).toBe(false)
      // PostgreSQL rejects this non-updatable projection before its ACL stage.
      await expect(database.query('DELETE FROM ai_pdm_contract.v_application_role_catalog_v1')).rejects.toMatchObject({ code: '55000' })
    }
  } finally { await database.end() }
})
