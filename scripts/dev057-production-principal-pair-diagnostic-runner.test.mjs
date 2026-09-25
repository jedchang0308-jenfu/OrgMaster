import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertOperation, pairHash, parseArgs, summarizePairs,
} from './dev057-production-principal-pair-diagnostic-runner.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRevision = 'a'.repeat(40)
const input = 'gs://jenfu-platform-prod-orgmaster-release/source/migration-bundles/dev057/principal-pair-diagnostic/one.json'
const output = 'gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-PRINCIPAL-PAIR-DIAGNOSTIC/one.json'
const hash = pairHash('issuer', 'subject')
const operation = { schemaVersion: 'orgmaster.dev057-principal-pair-diagnostic-operation.v1',
  operationId: 'dev057-principal-pair-one', sourceRevision,
  projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod',
  applicationId: 'ai-pdm', pairHashes: [hash] }

test('diagnostic input is exact-target and content bound', () => {
  const bytes = Buffer.from(JSON.stringify(operation))
  const args = parseArgs(['--operation-ref', input, '--operation-sha256',
    crypto.createHash('sha256').update(bytes).digest('hex'),
    '--source-revision', sourceRevision, '--output-ref', output])
  assert.deepEqual(assertOperation(operation, bytes, args), operation)
  assert.throws(() => parseArgs(['--operation-ref', input.replace('source/migration-bundles', 'source/production-data'),
    '--operation-sha256', args.operationSha256, '--source-revision', sourceRevision,
    '--output-ref', output]), /INVALID|PREFIX/u)
  assert.throws(() => assertOperation({ ...operation, pairHashes: [hash, hash] }, bytes, args))
  assert.throws(() => assertOperation({ ...operation, employeeId: 'employee-other' }, bytes, args))
  assert.throws(() => assertOperation(operation, Buffer.from('changed'), args))
})

test('same snapshot distinguishes missing, reserved and managed pending pairs', () => {
  const row = { principal_issuer: 'issuer', principal_subject: 'subject' }
  const empty = summarizePairs(operation, { mappings: [], accounts: [], managed: [],
    governance: [], reservations: [], governanceHash: 'b'.repeat(64),
    unboundManagedCount: 0 })
  assert.deepEqual(empty.pairs[0].canonicalMappings, [])
  assert.deepEqual(empty.pairs[0].reservations, [])
  const observed = summarizePairs(operation, { mappings: [], accounts: [],
    managed: [{ ...row, principal_id: 'p1', employee_id: 'e1',
      employee_status: 'active', link_state: 'directory_linked_pending_auth',
      admission_revision: null, directory_state: 'present', freshness: 'fresh',
      pending_lifecycle: false, admission_enabled: true }],
    governance: [{ ...row, principal_id: 'p2', employee_id: 'e2',
      status: 'inactive', valid_from: null, valid_to: null, account_types: [] }],
    reservations: [{ ...row, employee_id: 'e1', source_kind: 'managed' }],
    governanceHash: 'b'.repeat(64), unboundManagedCount: 2 })
  assert.equal(observed.pairs[0].managedIdentities[0].linkState,
    'directory_linked_pending_auth')
  assert.equal(observed.pairs[0].governanceLinks[0].status, 'inactive')
  assert.equal(observed.pairs[0].reservations[0].employeeId, 'e1')
  assert.equal(observed.unboundManagedCount, 2)
  assert.equal(JSON.stringify(observed).includes('subject'), false)
})

test('operator image runs locked source with no migration or write command', () => {
  const dockerfile = fs.readFileSync(path.join(root,
    'infra/google-cloud/dev-040-production-release/dev057-principal-pair-diagnostic.Dockerfile'), 'utf8')
  assert.match(dockerfile, /USER node/u)
  assert.match(dockerfile, /SOURCE_REVISION=\$\{SOURCE_REVISION\}/u)
  assert.match(dockerfile, /scripts\/dev057-production-principal-pair-diagnostic-runner\.mjs/u)
  const script = fs.readFileSync(path.join(root,
    'scripts/dev057-production-principal-pair-diagnostic-runner.mjs'), 'utf8')
  assert.match(script, /REPEATABLE READ READ ONLY/u)
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/u)
})
