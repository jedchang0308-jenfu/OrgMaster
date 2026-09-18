import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDev049OwnerReceipt, buildDev049OwnerReceipt } from './lib/dev049-managed-login-owner-receipt.mjs'

const hash = 'a'.repeat(64)
const input = {
  producedAt: '2026-09-17T00:00:00.000Z', branch: 'codex/dev-049-existing-google-account', revision: 'b'.repeat(40), migrationSha256: hash,
  controlledFiles: Array.from({ length: 10 }, (_, index) => ({ path: `server/file-${index}.ts`, sha256: hash })),
  evidence: ['browser', 'contract', 'postgres'].map((kind) => ({ kind, path: `qa/${kind}.json`, sha256: hash, status: 'PASS' })),
}

test('builds and validates a self-hashed DEV-049 owner receipt', () => {
  const receipt = buildDev049OwnerReceipt(input)
  assert.equal(assertDev049OwnerReceipt(receipt).status, 'LOCAL_OWNER_IMPLEMENTATION_PASS')
})

test('rejects receipt or controlled-source tampering', () => {
  const receipt = buildDev049OwnerReceipt(input)
  assert.throws(() => assertDev049OwnerReceipt({ ...receipt, status: 'PASS' }), /DEV049_OWNER_RECEIPT_INVALID/u)
  assert.throws(() => assertDev049OwnerReceipt({ ...receipt, source: { ...receipt.source, controlledFiles: receipt.source.controlledFiles.map((item, index) => index ? item : { ...item, sha256: 'c'.repeat(64) }) } }), /DEV049_OWNER_RECEIPT_INVALID/u)
})
