import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { createPrincipalOnlyRepairFixture as fixture } from './dev057-principal-forward-repair.fixture.mjs'
import { readPrincipalOnlyRepairBaseline } from './dev057-principal-forward-repair.mjs'


test('sealed maintenance rollback provides the application runtime baseline without invoking the old revision', async () => {
  const h = fixture()
  const result = await readPrincipalOnlyRepairBaseline(h.input)
  assert.equal(result.activeRevision, h.recovery)
  assert.deepEqual(result.runtimeConfig, h.runtime)
  assert.equal(result.rollbackRef.uri, h.paths.rollback)
  assert.deepEqual(h.calls, [h.recovery])
})

test('forward repair rejects legacy traffic, tagged traffic, altered images, sidecars and replacement service identity', async () => {
  for (const mutate of [
    h => { h.service.traffic = [{ revision: h.old, percent: 100 }] },
    h => { h.service.trafficStatuses.push({ revision: h.old, percent: 0, tag: 'legacy' }) },
    h => { h.service.uid = 'replacement' },
    h => { h.revision.containers[0].image = h.input.profile.artifact.uri + '@sha256:' + '0'.repeat(64) },
    h => { h.revision.containers.push({ name: 'database-proxy', image: 'proxy' }) },
    h => { h.revision.containers[0].env = [{ name: 'DATABASE_URL', value: 'injected' }] },
  ]) {
    const h = fixture(); mutate(h)
    await assert.rejects(() => readPrincipalOnlyRepairBaseline(h.input), /PRINCIPAL_/)
  }
})

test('forward repair rejects missing, unsealed or unrelated rollback evidence and unfinished owner runs', async () => {
  for (const mutate of [
    h => { h.objects.delete(h.paths.rollback) },
    h => { const row = h.objects.get(h.paths.terminal); h.put(h.paths.terminal, { ...row.value, facts: { ...row.value.facts, previousRevision: h.old } }) },
    h => { h.seal('terminal', { result: 'ROLLED_BACK', previousRevision: h.recovery, databaseDisposition: 'FORWARD_APPLIED' }, h.intent.runtimeConfigRef) },
    h => { h.run.status = 'in_progress' },
    h => { h.run.headSha = '9'.repeat(40) },
    h => { const core = { ...h.controlCore, candidateRevision: h.old }; h.put(h.paths.control, { ...core, controlSha256: sha256(canonicalize(core)) }) },
  ]) {
    const h = fixture(); mutate(h)
    await assert.rejects(() => readPrincipalOnlyRepairBaseline(h.input), /MISSING|PRINCIPAL_/)
  }
})

test('successful or pre-activation terminal receipts never become maintenance repair authority', async () => {
  for (const result of ['RELEASED', 'PRE_ACTIVATION_ABORTED']) {
    const h = fixture(); h.seal('terminal', { result })
    assert.equal(await readPrincipalOnlyRepairBaseline(h.input), null)
  }
})

test('repeated candidate rollback accepts the sealed no-DDL replay result and refuses unknown or mismatched outcomes', async () => {
  const h = fixture()
  const rollback = h.seal('rollback', { result: 'ROLLED_BACK', previousRevision: h.recovery, databaseDisposition: 'UNCHANGED_VERIFIED' })
  h.seal('terminal', { result: 'ROLLED_BACK', previousRevision: h.recovery, databaseDisposition: 'UNCHANGED_VERIFIED' }, rollback.ref)
  assert.equal((await readPrincipalOnlyRepairBaseline(h.input)).activeRevision, h.recovery)
  for (const disposition of ['NOT_APPLIED', 'UNKNOWN_REQUIRES_LEDGER_READBACK', 'FORWARD_APPLIED']) {
    h.seal('terminal', { result: 'ROLLED_BACK', previousRevision: h.recovery, databaseDisposition: disposition }, rollback.ref)
    await assert.rejects(() => readPrincipalOnlyRepairBaseline(h.input), /DEV057_PRINCIPAL_FORWARD_REPAIR_INVALID/u)
  }
})
