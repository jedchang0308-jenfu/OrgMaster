import { describe, expect, it, vi } from 'vitest'
import * as persistence from './orgmasterPersistenceRepository'
import * as workspaceStore from './orgmasterWorkspaceStore'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createOrgDocumentFile } from '../src/documentStorage'
import { AiPdmRoleCapabilityStoreError, readAiPdmRoleCapabilityProjection, readAiPdmRoleCapabilityReceipt, readAiPdmRoleCapabilityWorkspace, publishAiPdmRoleCapabilityChange, resolveAiPdmRoleCapabilityUnknown, validateAiPdmRoleCapabilityReason } from './aiPdmRoleCapabilityStore'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'

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
  it('reads a validated persistence workspace without any local manifest or version file', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev057-provider-'))
    await writeSyntheticWorkspaceFixture(root)
    const index = await workspaceStore.getWorkspaceIndex(root)
    const version = await workspaceStore.getWorkspaceVersion(root, index.currentVersionId)
    await rm(resolve(root, 'data'), { recursive: true, force: true })
    const source = vi.spyOn(persistence, 'persistenceArtifactExists').mockResolvedValue(true)
    const indexRead = vi.spyOn(workspaceStore, 'getWorkspaceIndex').mockResolvedValue(index)
    const versionRead = vi.spyOn(workspaceStore, 'getWorkspaceVersion').mockResolvedValue(version)
    try {
      const actual = await readAiPdmRoleCapabilityWorkspace(root)
      expect(actual.organizationVersionId).toBe(index.currentVersionId)
      expect(actual.organizationRevision).toBe(version.version.revision)
      expect(actual.roles).toHaveLength(9)
      expect(actual.mutationAllowed).toBe(false)
      expect(source).toHaveBeenCalledWith(resolve(root, 'data', 'orgmaster-workspace.v1.json'), 'orgmaster-workspace.v1.json')
      expect(versionRead).toHaveBeenCalledWith(root, index.currentVersionId)
    } finally { source.mockRestore(); indexRead.mockRestore(); versionRead.mockRestore(); await rm(root, { recursive: true, force: true }) }
  })
  it.each(['missing', 'read-failed'])('does not use local workspace files when the authoritative source is %s', async (failure) => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev057-source-'))
    await writeSyntheticWorkspaceFixture(root)
    const probe = vi.spyOn(persistence, 'persistenceArtifactExists')
    if (failure === 'missing') probe.mockResolvedValue(false)
    else probe.mockRejectedValue(new persistence.OrgmasterPersistenceError('PERSISTENCE_READ_FAILED'))
    try {
      await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' })
      expect(probe).toHaveBeenCalledWith(resolve(root, 'data', 'orgmaster-workspace.v1.json'), 'orgmaster-workspace.v1.json')
    } finally { probe.mockRestore(); await rm(root, { recursive: true, force: true }) }
  })
  it('does not fallback when the workspace source is absent', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev008-'))
    const previous = process.env.ORGMASTER_GOVERNANCE_DATA_DIR
    process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'state')
    try { await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' }) }
    finally { if (previous === undefined) delete process.env.ORGMASTER_GOVERNANCE_DATA_DIR; else process.env.ORGMASTER_GOVERNANCE_DATA_DIR = previous; await rm(root, { recursive: true, force: true }) }
  })

  it('fails closed when the current workspace version is corrupted', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev008-'))
    const manifest = await writeSyntheticWorkspaceFixture(root)
    await writeFile(resolve(root, 'data', 'orgmaster-versions', `${manifest.currentVersionId}.json`), '{"kind":"broken"}\n', 'utf8')
    const previous = process.env.ORGMASTER_GOVERNANCE_DATA_DIR
    process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'state')
    try { await expect(readAiPdmRoleCapabilityWorkspace(root)).rejects.toMatchObject({ code: 'ORGMASTER_SOURCE_UNAVAILABLE' }) }
    finally { if (previous === undefined) delete process.env.ORGMASTER_GOVERNANCE_DATA_DIR; else process.env.ORGMASTER_GOVERNANCE_DATA_DIR = previous; await rm(root, { recursive: true, force: true }) }
  })

  it('persists a no-op as a terminal applied receipt and resolves an absent command', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev008-'))
    await writeSyntheticWorkspaceFixture(root)
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

  it('keeps a published source selection while an authoritative assignment expires', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'orgmaster-dev058-qa14-'))
    await writeSyntheticWorkspaceFixture(root)
    const previous = process.env.ORGMASTER_GOVERNANCE_DATA_DIR
    process.env.ORGMASTER_GOVERNANCE_DATA_DIR = resolve(root, 'state')
    const roleId = 'role-rd-manager'
    const adoptedPositionIds = ['position-management-manager', 'position-marketing-specialist']
    const selectedSource = { employeeId: 'employee-youhao', positionId: 'position-management-manager' }
    try {
      const workspace = await readAiPdmRoleCapabilityWorkspace(root)
      const beforeAdoption = await readAiPdmRoleCapabilityProjection(root, roleId)
      const adopted = await publishAiPdmRoleCapabilityChange(root, {
        stableRoleId: roleId, operation: 'set_position_adoptions', adoptedPositionIds,
        baseProjectionCursor: beforeAdoption.changeCursor, commandId: 'dev058-qa14-adopt', reason: 'QA058-14 valid position adoption',
        expectedCatalogVersion: workspace.catalogVersion, expectedCatalogPayloadHash: workspace.catalogPayloadHash,
        expectedGovernanceRevision: workspace.governanceRevision, expectedOrganizationRevision: workspace.organizationRevision,
      })
      expect(adopted.status).toBe('applied')
      const afterAdoption = await readAiPdmRoleCapabilityProjection(root, roleId)
      expect(afterAdoption.positions.filter(position => position.adopted).map(position => position.positionId).sort()).toEqual([...adoptedPositionIds].sort())

      const afterAdoptionWorkspace = await readAiPdmRoleCapabilityWorkspace(root)
      const selected = await publishAiPdmRoleCapabilityChange(root, {
        stableRoleId: roleId, operation: 'set_assignment_sources', changes: [{ ...selectedSource, selected: true }],
        baseProjectionCursor: afterAdoption.changeCursor, commandId: 'dev058-qa14-source-select', reason: 'QA058-14 valid assignment source',
        expectedCatalogVersion: afterAdoptionWorkspace.catalogVersion, expectedCatalogPayloadHash: afterAdoptionWorkspace.catalogPayloadHash,
        expectedGovernanceRevision: afterAdoptionWorkspace.governanceRevision, expectedOrganizationRevision: afterAdoptionWorkspace.organizationRevision,
      })
      expect(selected.status).toBe('applied')
      const selectedProjection = await readAiPdmRoleCapabilityProjection(root, roleId)
      const selectedEmployee = selectedProjection.positions.find(position => position.positionId === selectedSource.positionId)?.employees.find(employee => employee.employeeId === selectedSource.employeeId)
      expect(selectedEmployee).toMatchObject({ sourceSelected: true, effectiveHolder: true, sourceCount: 1 })

      const index = await workspaceStore.getWorkspaceIndex(root)
      const current = await workspaceStore.getWorkspaceVersion(root, index.currentVersionId)
      const expiredDocument = createOrgDocumentFile({
        ...current.document.state,
        assignments: current.document.state.assignments.map(assignment => assignment.id === 'assignment-management-manager-youhao'
          ? { ...assignment, validTo: '2026-01-02' }
          : assignment),
        employees: current.document.state.employees.map(employee => employee.id === selectedSource.employeeId
          ? { ...employee, primaryAssignmentId: 'assignment-marketing-specialist-youhao' }
          : employee),
      }, 'document', current.document.savedAt)
      await workspaceStore.saveWorkspaceVersion(root, index.currentVersionId, expiredDocument, current.version.revision, 'current-maintenance')

      const afterSourceExpiry = await readAiPdmRoleCapabilityProjection(root, roleId)
      const survivingEmployee = afterSourceExpiry.positions.find(position => position.positionId === 'position-marketing-specialist')?.employees.find(employee => employee.employeeId === selectedSource.employeeId)
      expect(survivingEmployee).toMatchObject({ sourceSelected: false, effectiveHolder: false, sourceCount: 0 })
      const state = JSON.parse(await readFile(resolve(root, 'state', 'ai-pdm-role-capability.v1.json'), 'utf8'))
      expect(state.assignmentSourcesByRole[roleId]).toContainEqual(selectedSource)
    } finally {
      if (previous === undefined) delete process.env.ORGMASTER_GOVERNANCE_DATA_DIR
      else process.env.ORGMASTER_GOVERNANCE_DATA_DIR = previous
      await rm(root, { recursive: true, force: true })
    }
  })
})
