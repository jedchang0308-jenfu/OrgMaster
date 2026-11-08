import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { assertCancelledRecoveryPreflight } from './dev040-cancelled-release-recovery.mjs'

const profile = { application: { id: 'orgmaster', repository: 'jedchang0308-jenfu/OrgMaster' }, target: { serviceName: 'orgmaster-prod' }, artifact: { releaseBucket: 'jenfu-platform-prod-orgmaster-release' } }
const intent = { releaseId: 'ORGMASTER-REL-TEST-001', sourceRevision: 'a'.repeat(40) }
const run = { id: '42494658983', headSha: intent.sourceRevision, event: 'workflow_dispatch', status: 'completed', conclusion: 'cancelled' }
function control(overrides = {}) {
  const core = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: 'b'.repeat(64), ownerApplicationId: 'orgmaster', service: 'orgmaster-prod', controlBucket: 'jenfu-platform-prod-orgmaster-release', releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, sourceLockSha256: 'c'.repeat(64), candidateRevision: 'orgmaster-prod-candidate', previousRevision: 'orgmaster-prod-previous', ownerRunRef: 'https://api.github.com/repos/jedchang0308-jenfu/OrgMaster/actions/runs/42494658983', leaseExpiresAt: '2026-11-08T15:36:04.899Z', deadlineAt: '2026-11-08T19:24:17.831Z', state: 'CANDIDATE_VERIFIED', result: null, ...overrides }
  return { ...core, controlSha256: sha256(canonicalize(core)) }
}

test('accepts only an expired cancelled exact owner attempt', () => {
  assert.equal(assertCancelledRecoveryPreflight({ profile, intent, control: control(), run, ownerRunId: run.id, nowMs: Date.parse('2026-11-08T15:37:00Z') }).state, 'CANDIDATE_VERIFIED')
})

test('rejects running, successful, mismatched, live-lease and finalized attempts', () => {
  for (const change of [
    { run: { ...run, status: 'in_progress', conclusion: null } },
    { run: { ...run, conclusion: 'success' } },
    { ownerRunId: '42494658984' },
    { nowMs: Date.parse('2026-11-08T15:35:00Z') },
    { control: control({ state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED' }) },
  ]) assert.throws(() => assertCancelledRecoveryPreflight({ profile, intent, control: control(), run, ownerRunId: run.id, nowMs: Date.parse('2026-11-08T15:37:00Z'), ...change }))
})

test('final readback accepts only a sealed abort or rollback', () => {
  assert.equal(assertCancelledRecoveryPreflight({ profile, intent, control: control({ state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED' }), run, ownerRunId: run.id, final: true }).result, 'PRE_ACTIVATION_ABORTED')
  assert.throws(() => assertCancelledRecoveryPreflight({ profile, intent, control: control(), run, ownerRunId: run.id, final: true }))
})

test('recovery workflow exposes only the exact rollback stage', async () => {
  const workflow = await readFile(new URL('../.github/workflows/recover-cancelled-orgmaster-production.yml', import.meta.url), 'utf8')
  assert.equal((workflow.match(/--stage rollback/gu) ?? []).length, 1)
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'decision', 'activate', 'canonical', 'finalize']) {
    assert.equal(workflow.includes(`--stage ${stage}`), false)
  }
  assert.match(workflow, /environment: production/u)
  assert.match(workflow, /cancel-in-progress: false/u)
})
