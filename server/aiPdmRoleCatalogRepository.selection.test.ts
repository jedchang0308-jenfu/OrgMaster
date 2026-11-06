import { describe, expect, it } from 'vitest'
import { readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'
import { catalogRows, catalogQueryResult } from './aiPdmRoleCatalogRepository.fixture'

describe('current AI-PDM contract version selection', () => {
  it('reads a pre-096 v2-only producer without executing a missing v3 query', async () => {
    const expected = await readPublishedAiPdmRoleCatalog()
    const queries: string[] = []
    const actual = await readPublishedAiPdmRoleCatalogFromDatabase({ query: async sql => {
      queries.push(sql)
      if (sql.includes('pg_catalog.to_regclass')) return { rows: [{ v3_exists: false }] }
      if (sql.includes('FROM ai_pdm_contract.v_application_role_catalog_v2')) return { rows: catalogRows(expected) }
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' })
    } })
    expect(actual).toEqual({ ...expected, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2' })
    expect(queries).toHaveLength(2)
    expect(queries[0]).toBe("SELECT pg_catalog.to_regclass('ai_pdm_contract.v_application_role_catalog_v3') IS NOT NULL AS v3_exists")
    expect(queries[1]).not.toContain('v_application_role_catalog_v3')
  })

  it.each([[], [{ v3_exists: null }], [{ v3_exists: 'false' }], [{ v3_exists: true }, { v3_exists: false }]])('rejects an invalid relation probe %j without reading another view', async rows => {
    let queries = 0
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => { queries++; return { rows } } }))
      .rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_UNAVAILABLE' })
    expect(queries).toBe(1)
  })

  it.each(['42501', '42P01', '08006'])('does not downgrade after a v3 query error %s', async code => {
    const queries: string[] = []
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async sql => {
      queries.push(sql)
      if (sql.includes('pg_catalog.to_regclass')) return { rows: [{ v3_exists: true }] }
      throw Object.assign(new Error('unavailable'), { code })
    } })).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_UNAVAILABLE' })
    expect(queries).toHaveLength(2)
    expect(queries[1]).toContain('FROM ai_pdm_contract.v_application_role_catalog_v3')
  })

  it.each(['empty', 'hash', 'wrong-catalog'] as const)('does not downgrade after a v3 %s result', async field => {
    const fixture = await readPublishedAiPdmRoleCatalog()
    const rows = field === 'empty' ? [] : catalogRows(fixture)
    if (field === 'hash') rows[0].catalog_sha256 = '0'.repeat(64)
    if (field === 'wrong-catalog') rows[0].application_id = 'another-app' as typeof rows[0]['application_id']
    const queries: string[] = []
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async sql => {
      queries.push(sql); return catalogQueryResult(sql, rows)
    } })).rejects.toMatchObject({ code: field === 'empty' ? 'EXTERNAL_CATALOG_UNAVAILABLE' : 'EXTERNAL_CATALOG_INVALID' })
    expect(queries).toHaveLength(2)
  })
  it('does not accept a v2-format protected catalog through the pre-096 view', async () => {
    const rows = catalogRows(await readPublishedAiPdmRoleCatalog()).map(row => ({ ...row, publication_format: 'dynamic-policy-v2' }))
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({ query: async sql => catalogQueryResult(sql, rows, false) }))
      .rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_INVALID' })
  })
})
