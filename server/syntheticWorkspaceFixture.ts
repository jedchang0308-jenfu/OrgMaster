import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'
import { createWorkspaceManifest } from '../src/versionWorkspace'

/** Deterministic test workspace; never reads the checkout's ignored data directory. */
export async function writeSyntheticWorkspaceFixture(root: string) {
  const currentVersionId = 'current-synthetic-test'
  const savedAt = '2026-09-29T12:00:00.000Z'
  const manifest = createWorkspaceManifest(currentVersionId, savedAt)
  const document = createOrgDocumentFile(screenshotOrganizationState, 'document', savedAt)
  const directory = join(root, 'data', 'orgmaster-versions')
  await mkdir(directory, { recursive: true })
  await writeFile(join(root, 'data', 'orgmaster-workspace.v1.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(directory, `${currentVersionId}.json`), `${JSON.stringify(document, null, 2)}\n`)
  return { currentVersionId, manifest, document }
}
