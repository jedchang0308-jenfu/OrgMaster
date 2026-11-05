import type { OrgmasterDatabase } from './orgmasterDatabase'
import type { FinancialCatalogActivationPersistence } from './financialCatalogActivationStore'
import type { GovernanceDocumentV3, GovernanceOrgSource } from '../src/governance/types'
import { GovernanceStoreError } from './orgmasterGovernanceStore'
import { readPersistenceArtifact, withPersistenceActor, writePersistenceArtifacts } from './orgmasterPersistenceRepository'
import { withAdministrativePrincipalSource } from './orgmasterAdministrationIdentity'
import { assertCurrentGovernanceWriteActor } from './orgmasterGovernanceWriteActor'

/** Disposable SQL fixture IO only: deliberately bypasses product file/workspace parsing.
 * Domain preview/activation/receipt and the restricted v3 SQL identity/CAS writer are real. */
export function createCatalogInitializationPostgresFixturePersistence(runtime: Pick<OrgmasterDatabase, 'query'>): FinancialCatalogActivationPersistence {
  const artifact = (artifactKey: string, artifactKind: 'governance' | 'workspace-manifest' | 'workspace-version') =>
    readPersistenceArtifact({ localPath: '', artifactKey, artifactKind, database: runtime })
  const read: FinancialCatalogActivationPersistence['read'] = async () => {
    const stored = await artifact('orgmaster-governance.v3.json', 'governance')
    return { document: stored.payload as unknown as GovernanceDocumentV3, raw: stored.raw, revision: stored.revision }
  }
  const source: FinancialCatalogActivationPersistence['source'] = async () => {
    const manifest = await artifact('orgmaster-workspace.v1.json', 'workspace-manifest')
    const versionId = String(manifest.payload.currentVersionId), workspace = await artifact(`orgmaster-versions/${versionId}.json`, 'workspace-version')
    const state = workspace.payload.state as GovernanceOrgSource['state']
    return withAdministrativePrincipalSource({ workspaceVersionId: versionId, workspaceRevision: workspace.revision,
      state: { ...state, departments: state.departments ?? [], roles: state.roles ?? [], positions: state.positions ?? [], assignments: state.assignments ?? [] } }, runtime)
  }
  return { read, source, async commit(root, expected, mutate, actor, authorize) {
    await runtime.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    try {
      await assertCurrentGovernanceWriteActor(runtime, actor, false)
      const current = await read(root); authorize(current.document)
      if (current.revision !== expected) throw new GovernanceStoreError('REVISION_CONFLICT')
      const mutation = await mutate(current, await source(root)), raw = JSON.stringify(mutation.document) + '\n'
      await withPersistenceActor(actor, () => writePersistenceArtifacts([{ localPath: '', artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance',
        payload: mutation.document as unknown as Record<string, unknown>, raw, expectedRevision: current.revision }], { database: runtime, updatedBy: actor.principalId, reasonCode: mutation.reasonCode }))
      await assertCurrentGovernanceWriteActor(runtime, actor, true); authorize(current.document)
      const result = await read(root); await runtime.query('COMMIT')
      return { status: 'applied' as const, ...result }
    } catch (error) { await runtime.query('ROLLBACK'); throw error }
  } }
}
