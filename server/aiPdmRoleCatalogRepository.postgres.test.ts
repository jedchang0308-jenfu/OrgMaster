import { afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'
import { createWorkspaceManifest } from '../src/versionWorkspace'
import { readAiPdmRoleCapabilityWorkspace } from './aiPdmRoleCapabilityStore'
import { closeOrgmasterDatabase, createOrgmasterDatabase } from './orgmasterDatabase'
import {
  readPublishedAiPdmRoleCatalog,
  readPublishedAiPdmRoleCatalogFromDatabase,
} from './aiPdmRoleCatalogRepository'

const connectionString = process.env.DEV057_PRODUCT_CATALOG_POSTGRES_URL

describe.skipIf(!connectionString)('DEV-057 published AI-PDM catalog product readback', () => {
  afterAll(async () => { await closeOrgmasterDatabase() })

  it.skipIf(!process.env.DEV057_PRODUCT_WORKSPACE_FIXTURE_POSTGRES_URL)('reads the actual role workspace from PostgreSQL with no local manifest and rejects missing or corrupt PG source', async () => {
    const fixtureUrl = new URL(process.env.DEV057_PRODUCT_WORKSPACE_FIXTURE_POSTGRES_URL!)
    const runtimeUrl = new URL(connectionString!)
    for (const url of [fixtureUrl, runtimeUrl]) {
      expect(['postgres:', 'postgresql:']).toContain(url.protocol)
      expect(url.search).toBe('')
      expect(url.hash).toBe('')
    }
    expect(fixtureUrl.username).toBe('postgres')
    expect(fixtureUrl.hostname).toBe('127.0.0.1')
    expect(fixtureUrl.pathname.slice(1)).toMatch(/^dev057_[a-f0-9]{16}$/)
    expect(runtimeUrl.host + runtimeUrl.pathname).toBe(fixtureUrl.host + fixtureUrl.pathname)
    expect(runtimeUrl.username).toBe('dev057_orgmaster_catalog_probe')
    const admin = new pg.Pool({ connectionString: fixtureUrl.href, max: 1 })
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev057-pg-workspace-'))
    const old = { mode: process.env.ORGMASTER_PERSISTENCE_MODE, url: process.env.ORGMASTER_POSTGRES_URL, data: process.env.ORGMASTER_GOVERNANCE_DATA_DIR }
    const keys = ['orgmaster-workspace.v1.json', 'orgmaster-versions/current.json']
    let original: pg.QueryResultRow[] = []
    const savedAt = '2026-10-05T00:00:00.000Z'
    const fixtures = [createWorkspaceManifest('current', savedAt), createOrgDocumentFile(screenshotOrganizationState, 'document', savedAt)]
    const change = async (key: string, payload: unknown) => {
      const raw = JSON.stringify(payload), hash = createHash('sha256').update(raw).digest('hex')
      await admin.query('UPDATE orgmaster_core.persistence_artifacts SET payload=$2::jsonb,source_sha256=$3,canonical_sha256=$3,source_bytes=$4 WHERE batch_id=$5 AND artifact_key=$1', [key, raw, hash, Buffer.byteLength(raw), original[0].batch_id])
      return hash
    }
    try {
      original = (await admin.query('SELECT artifact.* FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE authority.singleton=true AND artifact.artifact_key=ANY($1::text[])', [keys])).rows
      expect(original).toHaveLength(2)
      process.env.ORGMASTER_PERSISTENCE_MODE = 'cloud-sql'
      process.env.ORGMASTER_POSTGRES_URL = connectionString
      process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'projection-state')
      await change(keys[0], fixtures[0])
      const versionHash = await change(keys[1], fixtures[1])
      await expect(stat(resolve(root, 'data', keys[0]))).rejects.toMatchObject({ code: 'ENOENT' })
      const actual = await readAiPdmRoleCapabilityWorkspace(root)
      expect(actual.catalogVersion).toBe(process.env.DEV057_PRODUCT_CATALOG_EXPECTED_VERSION)
      expect(actual.roles).toHaveLength(9)
      expect(actual.organizationVersionId).toBe('current')
      expect(actual.organizationRevision).toBe(versionHash)
      expect(actual.sourceDataAt).toBe(savedAt)
      expect(actual.mutationAllowed).toBe(false)
      expect(actual.catalogPayloadHash).toBe((await readPublishedAiPdmRoleCatalog(process.cwd(), 'ai-pdm.role-catalog.2026-10-05.v6')).catalogSha256)
      // Local files must not rescue an invalid PostgreSQL authority.
      const { writeSyntheticWorkspaceFixture } = await import('./syntheticWorkspaceFixture')
      await writeSyntheticWorkspaceFixture(root)
      await admin.query("UPDATE orgmaster_core.persistence_artifacts SET artifact_key='dev057-missing-manifest' WHERE batch_id=$1 AND artifact_key=$2", [original[0].batch_id, keys[0]])
      await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' })
      await admin.query("UPDATE orgmaster_core.persistence_artifacts SET artifact_key=$2 WHERE batch_id=$1 AND artifact_key='dev057-missing-manifest'", [original[0].batch_id, keys[0]])
      await change(keys[1], { kind: 'broken' })
      await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' })
    } finally {
      try {
        if (original.length === 2) {
          await admin.query("UPDATE orgmaster_core.persistence_artifacts SET artifact_key=$2 WHERE batch_id=$1 AND artifact_key='dev057-missing-manifest'", [original[0].batch_id, keys[0]])
          for (const row of original) await admin.query('UPDATE orgmaster_core.persistence_artifacts SET payload=$3::jsonb,source_sha256=$4,canonical_sha256=$5,source_bytes=$6 WHERE batch_id=$1 AND artifact_key=$2', [row.batch_id, row.artifact_key, JSON.stringify(row.payload), row.source_sha256, row.canonical_sha256, row.source_bytes])
        }
      } finally {
        for (const [key, value] of Object.entries({ ORGMASTER_PERSISTENCE_MODE: old.mode, ORGMASTER_POSTGRES_URL: old.url, ORGMASTER_GOVERNANCE_DATA_DIR: old.data })) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
        try { await admin.end() } finally { await rm(root, { recursive: true, force: true }) }
      }
    }
  })

  it('reads the exact active catalog through OrgMaster runtime privileges', async () => {
    if (!connectionString) throw new Error('DEV057_PRODUCT_CATALOG_POSTGRES_URL_REQUIRED')
    const database = createOrgmasterDatabase(connectionString)
    const actual = await readPublishedAiPdmRoleCatalogFromDatabase(database)
    const expectedVersion=process.env.DEV057_PRODUCT_CATALOG_EXPECTED_VERSION ?? 'ai-pdm.role-catalog.2026-10-05.v6'
    const expected = await readPublishedAiPdmRoleCatalog(process.cwd(), expectedVersion)
    expect(actual).toEqual({ ...expected, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v1' })
  })
})
