import { describe, expect, it } from 'vitest'
import { mkdtemp, cp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AiPdmRoleCapabilityStoreError, readAiPdmRoleCapabilityReceipt, readAiPdmRoleCapabilityWorkspace, publishAiPdmRoleCapabilityChange, resolveAiPdmRoleCapabilityUnknown, validateAiPdmRoleCapabilityReason } from './aiPdmRoleCapabilityStore'

async function copyCurrentWorkspaceFixture(sourceRoot: string, root: string) {
  await mkdir(resolve(root, 'data', 'orgmaster-versions'), { recursive: true })
  const sourceManifest = resolve(sourceRoot, 'data', 'orgmaster-workspace.v1.json')
  const targetManifest = resolve(root, 'data', 'orgmaster-workspace.v1.json')
  await cp(sourceManifest, targetManifest)
  const manifest = JSON.parse(await readFile(targetManifest, 'utf8')) as { currentVersionId: string }
  await cp(
    resolve(sourceRoot, 'data', 'orgmaster-versions', `${manifest.currentVersionId}.json`),
    resolve(root, 'data', 'orgmaster-versions', `${manifest.currentVersionId}.json`),
  )
  return manifest
}

describe('AI-PDM role capability save reason', () => {
  it('allows an optional blank reason', () => {
    expect(() => validateAiPdmRoleCapabilityReason('')).not.toThrow()
    expect(() => validateAiPdmRoleCapabilityReason('   ')).not.toThrow()
  })

  it('keeps the maximum length guard', () => {
    expect(() => validateAiPdmRoleCapabilityReason('a'.repeat(241))).toThrowError(new AiPdmRoleCapabilityStoreError('INVALID_COMMAND'))
  })
})

describe('DEV-008 fail-closed source and terminal command receipt', () => {
  it('does not fallback when the workspace source is absent', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev008-'))
    const previous = process.env.ORGMASTER_GOVERNANCE_DATA_DIR
    process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'state')
    try { await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' }) }
    finally { if (previous === undefined) delete process.env.ORGMASTER_GOVERNANCE_DATA_DIR; else process.env.ORGMASTER_GOVERNANCE_DATA_DIR = previous; await rm(root, { recursive: true, force: true }) }
  })

  it('fails closed when the current workspace version is corrupted', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev008-'))
    const sourceRoot = process.cwd()
    const manifest = await copyCurrentWorkspaceFixture(sourceRoot, root)
    await writeFile(resolve(root, 'data', 'orgmaster-versions', `${manifest.currentVersionId}.json`), '{"kind":"broken"}\n', 'utf8')
    const previous = process.env.ORGMASTER_GOVERNANCE_DATA_DIR
    process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'state')
    try { await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' }) }
    finally { if (previous === undefined) delete process.env.ORGMASTER_GOVERNANCE_DATA_DIR; else process.env.ORGMASTER_GOVERNANCE_DATA_DIR = previous; await rm(root, { recursive: true, force: true }) }
  })

  it('persists a no-op as a terminal applied receipt and resolves an absent command', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev008-'))
    const sourceRoot = process.cwd()
    await copyCurrentWorkspaceFixture(sourceRoot, root)
    const previous = process.env.ORGMASTER_GOVERNANCE_DATA_DIR
    process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'state')
    try {
      const workspace = await readAiPdmRoleCapabilityWorkspace(root)
      await expect(publishAiPdmRoleCapabilityChange(root, { stableRoleId: 'role-rd', operation: 'set_position_adoptions', adoptedPositionIds: [], baseProjectionCursor: workspace.projectionCursor, commandId: 'dev008-missing-precondition', reason: '', expectedCatalogVersion: workspace.catalogVersion, expectedCatalogPayloadHash: workspace.catalogPayloadHash, expectedGovernanceRevision: '', expectedOrganizationRevision: workspace.organizationRevision })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
      expect((await readAiPdmRoleCapabilityReceipt(root, 'dev008-missing-precondition')).receiptStatus).toBe('not_found')
      const result = await publishAiPdmRoleCapabilityChange(root, { stableRoleId: 'role-rd', operation: 'set_position_adoptions', adoptedPositionIds: [], baseProjectionCursor: workspace.projectionCursor, commandId: 'dev008-noop', reason: '', expectedCatalogVersion: workspace.catalogVersion, expectedCatalogPayloadHash: workspace.catalogPayloadHash, expectedGovernanceRevision: workspace.governanceRevision, expectedOrganizationRevision: workspace.organizationRevision })
      expect(result.status).toBe('noop')
      expect((await readAiPdmRoleCapabilityReceipt(root, 'dev008-noop')).decisionCode).toBe('COMMAND_NOOP')
      expect((await resolveAiPdmRoleCapabilityUnknown(root, 'dev008-absent', 'a'.repeat(64), 'cancel_if_absent_or_expired')).decisionCode).toBe('COMMAND_NOT_OBSERVED')
    } finally { if (previous === undefined) delete process.env.ORGMASTER_GOVERNANCE_DATA_DIR; else process.env.ORGMASTER_GOVERNANCE_DATA_DIR = previous; await rm(root, { recursive: true, force: true }) }
  })
})
