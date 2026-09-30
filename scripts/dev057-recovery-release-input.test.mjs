import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArgs } from './dev040-deploy-production.mjs'
const exact = `gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${'a'.repeat(40)}.json#sha256=${'b'.repeat(64)}`
test('routine release input carries only an immutable own Principal-only recovery receipt', () => {
  const result = parseArgs(['--check', `--principal-only-recovery-ref=${exact}`])
  assert.equal(result.check, true)
  assert.deepEqual(result.principalOnlyRecoveryRef, { uri: exact.split('#')[0], sha256: 'b'.repeat(64) })
  assert.equal(parseArgs(['--check']).principalOnlyRecoveryRef, null)
  for (const value of [exact.replace('orgmaster-release', 'aipdm-release'), exact.replace('a'.repeat(40), 'latest'), exact.replace('b'.repeat(64), 'bad')]) {
    assert.throws(() => parseArgs([`--principal-only-recovery-ref=${value}`]), /DEV057_RECOVERY_REF_INVALID/u)
  }
  assert.throws(() => parseArgs([`--principal-only-recovery-ref=${exact}`, `--principal-only-recovery-ref=${exact}`]))
})
