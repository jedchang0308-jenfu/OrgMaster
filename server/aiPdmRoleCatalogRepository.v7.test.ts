import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'

const version = 'ai-pdm.role-catalog.2026-10-10.v7'
const hash = '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9'

async function publishedRows() {
  const fixture = JSON.parse(await readFile(resolve('config/catalogs/ai-pdm-role-catalog.v7.json'), 'utf8'))
  return fixture.roles.map((role: Record<string, unknown>, index: number) => ({
    contract_version: fixture.contractVersion, application_id: fixture.applicationId,
    catalog_version: fixture.catalogVersion, published_at: fixture.publishedAt,
    catalog_sha256: fixture.catalogSha256, display_order: index,
    stable_role_id: role.stableRoleId, role_code: role.roleCode,
    display_name: role.displayName, assignable: role.assignable, risk: role.risk,
    subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
    delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
    assignment_tier: role.assignmentTier, permissions: role.permissions,
    metadata: role.metadata ?? null, role_definition_hash: role.roleDefinitionHash,
  }))
}

describe('DEV-057 active AI-PDM v7 catalog compatibility', () => {
  it('accepts the exact producer publication and exposes RD drawings without approval authority', async () => {
    const rows = await publishedRows()
    const catalog = await readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) }, hash)
    expect(catalog).toMatchObject({ catalogVersion: version, catalogSha256: hash })
    expect(catalog.roles).toHaveLength(9)
    const rd = catalog.roles.find(role => role.roleCode === 'rd')!
    expect(rd.permissions).toContainEqual({ code: 'numbering.drawings.view', kind: 'page', allowed: true })
    expect(rd.permissions.some(permission => permission.code === 'approval.request.decide' && permission.allowed)).toBe(false)
  })

  it.each(['v5', 'v6', 'v7'] as const)('retains the exact approved %s snapshot', async (suffix) => {
    const versions = { v5: 'ai-pdm.role-catalog.2026-09-28.v5', v6: 'ai-pdm.role-catalog.2026-10-05.v6', v7: version } as const
    const catalog = await readPublishedAiPdmRoleCatalog(process.cwd(), versions[suffix])
    expect(catalog.catalogVersion).toBe(versions[suffix])
  })

  it.each(['hash', 'permission', 'identity', 'order', 'publication'] as const)('rejects v7 %s drift', async (field) => {
    const rows = await publishedRows()
    if (field === 'hash') rows[0].catalog_sha256 = '0'.repeat(64)
    if (field === 'permission') rows[0].permissions = [{ code: 'approval.request.decide', kind: 'action', allowed: true }]
    if (field === 'identity') rows[0].subject_kind = 'principal'
    if (field === 'order') rows[0].display_order = 2
    if (field === 'publication') rows[0].published_at = '2026-10-11T00:00:00.000Z'
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
  })

  it('rejects an unapproved publication and a stale caller hash without fallback', async () => {
    const rows = await publishedRows()
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) }, '0'.repeat(64))).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_STALE' })
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows: rows.map(row => ({ ...row, catalog_version: 'ai-pdm.role-catalog.unapproved.v8' })) }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_STALE' })
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => { throw Error('dependency unavailable') } })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_UNAVAILABLE' })
  })
})
