import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyTarget, requiredCorrectionCases, resolvePostgresBin, resultExitCode, supportsServerVersion } from './lib/dev047-postgres-qc-contract.mjs'

test('rejects every externally supplied target even when it is labelled disposable', () => {
  for (const url of [
    'postgresql://localhost/jenfu_dev',
    'postgresql://db/staging',
    'postgresql://db/production',
    'postgresql://unknown/unknown',
  ]) assert.deepEqual(classifyTarget({ DEV047_POSTGRES_URL: url, DEV047_POSTGRES_DISPOSABLE: 'true' }).reasonCode, 'EXTERNAL_TARGET_REJECTED')
  assert.equal(classifyTarget({ DEV047_POSTGRES_TARGET_CLASS: 'shared-dev' }).reasonCode, 'TARGET_CLASS_REJECTED')
  assert.equal(classifyTarget({}).ok, true)
})

test('reports a missing or incomplete PostgreSQL runtime as a blocker', () => {
  const result = resolvePostgresBin({ DEV047_POSTGRES_BIN: 'C:\\missing\\postgres' }, () => false)
  assert.deepEqual(result.reasonCode, 'POSTGRES_RUNTIME_MISSING')
})

test('accepts the PostgreSQL 17 contract runtime and its 18 compatibility runner only', () => {
  assert.equal(supportsServerVersion('17.6'), true)
  assert.equal(supportsServerVersion('18.4'), true)
  assert.equal(supportsServerVersion('16.10'), false)
  assert.equal(supportsServerVersion('19beta1'), false)
})

test('NOT_RUN, BLOCKED, FAIL and zero-case manifests can never pass', () => {
  for (const status of ['NOT_RUN', 'BLOCKED', 'FAIL']) assert.equal(resultExitCode({ status }), 2)
  assert.equal(resultExitCode({ status: 'PASS', executedCaseCount: 0, checks: [], runtime: { cleanup: { clusterStopped: true, portReleased: true, tempRemoved: true } } }), 2)
})

test('PASS requires A17-A22 and complete cleanup evidence', () => {
  const manifest = {
    status: 'PASS', executedCaseCount: requiredCorrectionCases.length,
    checks: requiredCorrectionCases.map((id) => ({ id, status: 'PASS' })),
    runtime: { cleanup: { clusterStopped: true, portReleased: true, tempRemoved: true } },
  }
  assert.equal(resultExitCode(manifest), 0)
  assert.equal(resultExitCode({ ...manifest, checks: manifest.checks.slice(1) }), 2)
  assert.equal(resultExitCode({ ...manifest, runtime: { cleanup: { clusterStopped: true, portReleased: false, tempRemoved: true } } }), 2)
})
