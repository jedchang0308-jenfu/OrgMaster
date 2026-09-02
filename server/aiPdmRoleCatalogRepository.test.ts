import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'

describe('AI-PDM published role catalog adapter', () => {
  it('reads the vendored DEV-005 contract catalog as a read-only catalog', async () => {
    const catalog = await readPublishedAiPdmRoleCatalog()
    expect(catalog.contractVersion).toBe('jenfu.platform-entitlement.v1')
    expect(catalog.applicationId).toBe('ai-pdm')
    expect(catalog.catalogVersion).toBe('ai-pdm.role-catalog.2026-09-02.v2')
    expect(catalog.catalogSha256).toBe('ebdaa2960960e0683b480c721d2c27df59031b4af23b124f2ac7e882309f6b6e')
    expect(catalog.roles).toHaveLength(9)
    expect(catalog.roles.find((role) => role.roleCode === 'system_admin')).toMatchObject({
      subjectKind: 'principal',
      recommendationAllowed: false,
      delegationAllowed: false,
      allowedScopeKinds: ['global'],
    })
    expect(catalog.roles.find((role) => role.roleCode === 'external_specialist')).toMatchObject({
      subjectKind: 'employee',
      recommendationAllowed: false,
      delegationAllowed: false,
      allowedScopeKinds: ['project'],
    })
  })

  it('fails closed when the vendored catalog hash is tampered', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev005-'))
    try {
      const fixtureDir = join(root, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures')
      await mkdir(fixtureDir, { recursive: true })
      const source = join(process.cwd(), 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json')
      const target = join(fixtureDir, 'application-role-catalog.sample.json')
      const catalog = JSON.parse(await readFile(source, 'utf8')) as { catalogSha256: string }
      catalog.catalogSha256 = '0'.repeat(64)
      await writeFile(target, JSON.stringify(catalog), 'utf8')
      await expect(readPublishedAiPdmRoleCatalog(root)).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns unavailable when the catalog fixture is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev005-empty-'))
    try {
      await expect(readPublishedAiPdmRoleCatalog(root)).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_UNAVAILABLE' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reads the live view in publication order and rejects stale, retired, or tampered projections', async () => {
    const fixture = await readPublishedAiPdmRoleCatalog()
    const rows = fixture.roles.map((role, displayOrder) => ({
      contract_version: fixture.contractVersion,
      application_id: fixture.applicationId,
      catalog_version: fixture.catalogVersion,
      published_at: fixture.publishedAt,
      catalog_sha256: fixture.catalogSha256,
      display_order: displayOrder,
      stable_role_id: role.stableRoleId,
      role_code: role.roleCode,
      display_name: role.displayName,
      assignable: role.assignable,
      risk: role.risk,
      subject_kind: role.subjectKind,
      recommendation_allowed: role.recommendationAllowed,
      delegation_allowed: role.delegationAllowed,
      allowed_scope_kinds: role.allowedScopeKinds,
      assignment_tier: role.assignmentTier,
      permissions: role.permissions,
      metadata: role.metadata ?? null,
      role_definition_hash: role.roleDefinitionHash,
    }))
    const live = await readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) }, fixture.catalogSha256)
    expect(live.roles.map((role) => role.stableRoleId)).toEqual(fixture.roles.map((role) => role.stableRoleId))
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows: [] }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_UNAVAILABLE' })
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows: rows.map((row) => ({ ...row, catalog_version: 'ai-pdm.role-catalog.retired.v1' })) }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_STALE' })
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows: rows.map((row, index) => index === 0 ? { ...row, display_name: 'tampered' } : row) }) })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
  })
})
