import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { withAdministrationPostgresFixture } from './lib/dev070-administration-postgres-fixture.mjs'

// Node's test CLI loads compiled TypeScript via this repository's Vite.
import { createServer } from 'vite'
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
const { publishAfterOrgmasterPdmRevocation, reconcileOrgmasterPdmPublications } =
  await vite.ssrLoadModule('/server/orgmasterPdmPublication.ts')
await withAdministrationPostgresFixture(async ({ admin, connect }) => {
  for (const file of ['053_dev057_ai_pdm_session_authority.sql', '054_dev057_pdm_session_publication.sql']) {
    await admin.query(await readFile(new URL('../db/migrations/' + file, import.meta.url), 'utf8'))
  }
  const version = async () => (await admin.query(
    'SELECT authority_version::text AS version FROM orgmaster_core.persistence_authority',
  )).rows[0].version
  const definition = (await admin.query(`
    SELECT payload FROM orgmaster_core.persistence_artifacts artifact
    JOIN orgmaster_core.persistence_authority owner ON owner.active_batch_id = artifact.batch_id
    WHERE artifact.artifact_key='orgmaster-governance.v3.json'
  `)).rows[0].payload
  const policy = definition.publishedVersions.find(row => row.id === definition.activePolicyVersionId)
  const grant = policy.policy.roleAssignments.find(row => row.applicationId === 'ai-pdm')
  const org = await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
  const writer = await connect('postgres')
  await writer.query('SET jit=off')
  await org.query('SET jit=off')
  // The callback is synthetic. Use PostgreSQL for MVCC, savepoints, outbox and locking,
  // and the actual v6 impact reader against the modified publication in each pass.
  const apply = async () => {
    const affected = (await writer.query(`
      SELECT payload, batch_id FROM orgmaster_core.persistence_artifacts artifact
      JOIN orgmaster_core.persistence_authority owner ON owner.active_batch_id=artifact.batch_id
      WHERE artifact.artifact_key='orgmaster-governance.v3.json'
    `)).rows[0]
    const document = affected.payload
    const current = document.publishedVersions.find(row => row.id === document.activePolicyVersionId)
    current.policy.roleAssignments = current.policy.roleAssignments.filter(row => row.id !== grant.id)
    await writer.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb
      WHERE batch_id=$2 AND artifact_key='orgmaster-governance.v3.json'`, [JSON.stringify(document), affected.batch_id])
    await writer.query('UPDATE orgmaster_core.persistence_authority SET authority_version = authority_version + 1')
    return { published: true }
  }
  const transaction = async fn => {
    await writer.query('BEGIN')
    try { const result = await fn(); await writer.query('COMMIT'); return result }
    catch (error) { await writer.query('ROLLBACK'); throw error }
  }
  const receipts = new Map()
  let failure = 'prepare'
  const calls = []
  let phaseHook
  const client = {
    async readback(command) { return receipts.get(command.eventId) ?? null },
    async dispatch(command) {
      calls.push(command)
      const known = receipts.get(command.eventId)
      if (known) return known
      if (command.phase === failure) throw Error('TEST_RELAY_UNAVAILABLE')
      await phaseHook?.(command)
      const result = {
        contractVersion: 'ai-pdm.session-revocation-receipt.v1',
        eventId: command.eventId,
        operationId: command.operationId, phase: command.phase,
        digest: command.digest, receiptId: randomUUID(), appliedAt: new Date().toISOString(),
      }
      receipts.set(command.eventId, result)
      return result
    },
  }
  const base = await version()
  const options = {
    actor:'principal-legacy', commandKey:'scope-change', request: { action:'remove', id:grant.id },
    enabled:true, transaction, database:()=>writer, deliveryDatabase:()=>org, write:apply, client,
  }
  await assert.rejects(publishAfterOrgmasterPdmRevocation(options), /PDM_PUBLICATION_PENDING/)
  assert.equal(await version(), base, 'Failed dispatch leaves existing publication in effect')
  assert.equal((await org.query('SELECT * FROM orgmaster_core.pdm_session_publication_v1')).rowCount, 1)
  assert.deepEqual(calls[0].principalIds, ['principal-legacy'])
  await assert.rejects(publishAfterOrgmasterPdmRevocation({ ...options, commandKey:'overlap' }), /PDM_PUBLICATION_PENDING/)
  assert.equal(calls.length, 1, 'Overlapping operation never dispatches a second prepare')
  failure = 'published'
  phaseHook = async command => {
    if (command.phase === 'prepare') assert.equal(await version(), base)
  }
  assert.deepEqual(await publishAfterOrgmasterPdmRevocation(options), { published:true })
  assert.equal(await version(), (BigInt(base)+1n).toString())
  assert.equal(calls[1].eventId, calls[0].eventId)
  const proof = (await admin.query(
    'SELECT * FROM orgmaster_contract.read_ai_pdm_session_publication_v1($1,$2)',
    [calls[0].operationId, calls[0].publicationVersion],
  )).rows[0]
  assert.equal(proof.publication_version, calls[0].publicationVersion)
  failure = null
  assert.deepEqual(await reconcileOrgmasterPdmPublications(org, client), { selected:1, completed:1 })
  assert.equal(calls[3].eventId, calls[2].eventId, 'Terminal retry keeps the sealed event ID')
  const beforeNoop = calls.length
  await publishAfterOrgmasterPdmRevocation({ ...options, commandKey:'already-removed' })
  assert.equal(calls.length, beforeNoop, 'Effective no-op does not dispatch')
  assert.equal((await org.query('SELECT * FROM orgmaster_core.pdm_session_publication_v1')).rowCount, 1)
  console.log('DEV-057 PDM publication: missing receipt, overlap, stable retry, atomic readback, terminal recovery and no-op PASS')
})
} finally { await vite.close() }
