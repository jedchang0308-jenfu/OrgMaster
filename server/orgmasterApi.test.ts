import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'
import { getOrgMasterDocumentPaths, readStoredDocument, writeStoredDocument } from './orgmasterApi'

const temporaryRoots: string[] = []

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev019-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('OrgMaster local document file compatibility', () => {
  it('reads V2, writes V6, and preserves the V2 bytes', async () => {
    const root = await temporaryRoot()
    const paths = getOrgMasterDocumentPaths(root)
    await mkdir(dirname(paths.v2), { recursive: true })
    const stateV2 = Object.fromEntries(
      Object.entries(screenshotOrganizationState).filter(([key]) => key !== 'roleCombinationRiskRules'),
    )
    const rawV2 = `${JSON.stringify({
      app: 'OrgMaster',
      version: 2,
      kind: 'document',
      savedAt: '2026-08-15T00:00:00.000Z',
      state: stateV2,
    }, null, 2)}\n`
    await writeFile(paths.v2, rawV2, 'utf8')

    const loaded = await readStoredDocument(root)
    expect(loaded.document).toMatchObject({ version: 6, state: { roleCombinationRiskRules: [], duties: [], dutyPositionRelations: [], organizationLayout: { mode: 'tree' } } })
    await writeStoredDocument(loaded.document, root)
    expect(JSON.parse(await readFile(paths.v6, 'utf8'))).toMatchObject({ version: 6 })
    expect(await readFile(paths.v2, 'utf8')).toBe(rawV2)
  })

  it('does not fall back to a valid V2 file when newer V3 exists but is malformed', async () => {
    const root = await temporaryRoot()
    const paths = getOrgMasterDocumentPaths(root)
    await mkdir(dirname(paths.v2), { recursive: true })
    const v2State = Object.fromEntries(
      Object.entries(screenshotOrganizationState).filter(([key]) => key !== 'roleCombinationRiskRules'),
    )
    await writeFile(paths.v2, JSON.stringify({
      app: 'OrgMaster', version: 2, kind: 'document', savedAt: 'now', state: v2State,
    }), 'utf8')
    await writeFile(paths.v3, '{"app":"OrgMaster","version":3', 'utf8')

    await expect(readStoredDocument(root)).rejects.toBeTruthy()
  })

  it('round-trips an explicit V6 document through the V6 path', async () => {
    const root = await temporaryRoot()
    const document = createOrgDocumentFile(screenshotOrganizationState, 'document', '2026-08-15T00:00:00.000Z')
    const stored = await writeStoredDocument(document, root)
    expect(stored.document).toEqual(document)
  })
})
