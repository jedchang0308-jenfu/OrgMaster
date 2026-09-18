import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, loadProfile, sha256 } from './lib/dev013-orgmaster-staging-release.mjs'
import { assertSecretVersionBootstrapReceipt, buildSecretVersionBootstrapReceipt, buildSecretVersionContinuityReceipt, constants, createSecretVersionBootstrapPlan, runSecretVersionBootstrap } from './lib/dev013-orgmaster-secret-bootstrap.mjs'
import { resolvePortableInvocation } from './lib/dev013-portable-command.mjs'
import { resolveCleanSource } from './dev013-orgmaster-secret-bootstrap.mjs'

const profile = loadProfile()
const exactName = `projects/${profile.target.projectNumber}/secrets/${profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER}/versions/1`
const source = { sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), clean: true }

test('Windows resolves the PowerShell gcloud shim without enabling a command shell', () => {
  const shim = String.raw`C:\Tools\Google Cloud SDK\bin\gcloud.ps1`
  const invocation = resolvePortableInvocation('gcloud', ['--version'], {
    platform: 'win32',
    searchPath: String.raw`C:\Windows\System32;C:\Tools\Google Cloud SDK\bin`,
    fileExists: (candidate) => candidate === shim,
  })
  assert.deepEqual(invocation, {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', shim, '--version'],
  })
  assert.deepEqual(resolvePortableInvocation('gcloud', ['--version'], { platform: 'linux' }), { command: 'gcloud', args: ['--version'] })
})

test('secret bootstrap defaults to read-only preflight and exact target', () => {
  let entropyCalls = 0
  const calls = []
  const result = runSecretVersionBootstrap({
    invoke(command, args, input) {
      calls.push({ command, args, input })
      return { status: 0, stdout: '[]', stderr: '' }
    },
    entropySource() { entropyCalls += 1; return Buffer.alloc(64, 1) },
  }, profile)
  assert.equal(result.executed, false)
  assert.equal(result.plan.status, 'READY_FOR_READ_ONLY_PREFLIGHT')
  assert.deepEqual(result.plan.target, { projectId: 'jenfu-platform-nonprod', environment: 'staging', secretId: 'dev010-stg-orgmaster-runtime-config' })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args.slice(0, 4), ['secrets', 'versions', 'list', 'dev010-stg-orgmaster-runtime-config'])
  assert.equal(calls[0].input, undefined)
  assert.equal(entropyCalls, 0)
})

test('secret bootstrap refuses any existing version before entropy generation', () => {
  let entropyCalls = 0
  assert.throws(() => runSecretVersionBootstrap({
    execute: true,
    authorization: constants.EXECUTE_CAPABILITY,
    source,
    invoke: () => ({ status: 0, stdout: JSON.stringify([{ name: exactName, state: 'DESTROYED' }]), stderr: '' }),
    entropySource() { entropyCalls += 1; return Buffer.alloc(64, 2) },
  }, profile), /SECRET_ALREADY_VERSIONED: count=1/u)
  assert.equal(entropyCalls, 0)
})

test('execute streams base64url from 64 random bytes to stdin, zeroes buffers, and emits metadata-only receipt', () => {
  const entropy = Buffer.alloc(64, 0x5a)
  let streamed
  let call = 0
  const result = runSecretVersionBootstrap({
    execute: true,
    authorization: constants.EXECUTE_CAPABILITY,
    source,
    requestedProjectId: profile.target.projectId,
    requestedSecretId: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER,
    observedAt: '2026-09-17T05:00:00.000Z',
    entropySource: (size) => { assert.equal(size, 64); return entropy },
    invoke(command, args, input) {
      call += 1
      if (call === 1) return { status: 0, stdout: '[]', stderr: '' }
      assert.equal(command, 'gcloud')
      if (call === 2) {
        assert.ok(args.includes('--data-file=-'))
        assert.ok(Buffer.isBuffer(input))
        streamed = Buffer.from(input)
        return { status: 0, stdout: JSON.stringify({ name: exactName, state: 'ENABLED' }), stderr: '' }
      }
      assert.deepEqual(args.slice(0, 4), ['secrets', 'versions', 'describe', '1'])
      assert.equal(input, undefined)
      return { status: 0, stdout: JSON.stringify({ name: exactName, state: 'ENABLED' }), stderr: '' }
    },
  }, profile)
  assert.equal(result.executed, true)
  assert.equal(call, 3)
  assert.equal(streamed.length, 86)
  assert.match(streamed.toString('utf8'), /^[A-Za-z0-9_-]{86}$/u)
  assert.ok(entropy.every((byte) => byte === 0))
  assert.deepEqual(result.receipt.result, { numericVersion: '1', state: 'ENABLED' })
  assert.deepEqual(result.receipt.target, { projectId: 'jenfu-platform-nonprod', secretId: 'dev010-stg-orgmaster-runtime-config', environmentName: 'ORGMASTER_SESSION_HASH_PEPPER' })
  assert.equal(result.receipt.status, 'FIRST_VERSION_CREATED')
  assert.equal(result.receipt.sourceRevision, source.sourceRevision)
  assert.equal(result.receipt.sourceTree, source.sourceTree)
  assert.equal(result.receipt.secretPayloadCaptured, false)
  assert.equal(result.receipt.receiptSha256, sha256(canonicalize(Object.fromEntries(Object.entries(result.receipt).filter(([key]) => key !== 'receiptSha256')))))
  assert.equal(JSON.stringify(result.receipt).includes('ZZZZ'), false)
  assert.equal(assertSecretVersionBootstrapReceipt(result.receipt, profile), result.receipt)
})

test('secret bootstrap rejects target drift, short entropy, and nonnumeric provider version', () => {
  const emptyThen = (row) => {
    let call = 0
    return (_command, _args, _input) => {
      call += 1
      return call === 1 ? { status: 0, stdout: '[]', stderr: '' } : { status: 0, stdout: JSON.stringify(row), stderr: '' }
    }
  }
  assert.throws(() => runSecretVersionBootstrap({ requestedProjectId: 'another-project', invoke: () => ({ status: 0, stdout: '[]', stderr: '' }) }, profile), /TARGET_INVALID: project/u)
  const authorized = { execute: true, authorization: constants.EXECUTE_CAPABILITY, source }
  assert.throws(() => runSecretVersionBootstrap({ ...authorized, invoke: emptyThen({ name: exactName, state: 'ENABLED' }), entropySource: () => Buffer.alloc(63) }, profile), /ENTROPY_INVALID/u)
  assert.throws(() => runSecretVersionBootstrap({ ...authorized, invoke: emptyThen({ name: `projects/${profile.target.projectNumber}/secrets/${profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER}/versions/latest`, state: 'ENABLED' }), entropySource: () => Buffer.alloc(64) }, profile), /VERSION_ADD_INVALID: metadata/u)
  assert.throws(() => runSecretVersionBootstrap({ ...authorized, invoke: emptyThen({ name: `projects/${profile.target.projectNumber}/secrets/${profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER}/versions/2`, state: 'ENABLED' }), entropySource: () => Buffer.alloc(64) }, profile), /VERSION_ADD_INVALID: metadata/u)
  assert.throws(() => runSecretVersionBootstrap({ ...authorized, invoke: emptyThen({ name: `projects/9999999999999/secrets/${profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER}/versions/1`, state: 'ENABLED' }), entropySource: () => Buffer.alloc(64) }, profile), /VERSION_ADD_INVALID: metadata/u)
})

test('execute requires exact capability and clean committed source before provider access', () => {
  let providerCalls = 0
  const invoke = () => { providerCalls += 1; return { status: 0, stdout: '[]', stderr: '' } }
  assert.throws(() => runSecretVersionBootstrap({ execute: true, source, invoke }, profile), /CAPABILITY_REQUIRED/u)
  assert.throws(() => runSecretVersionBootstrap({ execute: true, authorization: 'DEV013-L3-ORGMASTER-FIRST-SECRET-VERSION-TYPO', source, invoke }, profile), /CAPABILITY_REQUIRED/u)
  assert.throws(() => runSecretVersionBootstrap({ execute: true, authorization: constants.EXECUTE_CAPABILITY, source: { ...source, clean: false }, invoke }, profile), /SOURCE_INVALID/u)
  assert.equal(providerCalls, 0)
  assert.throws(() => resolveCleanSource((...args) => args[0] === 'status' ? ' M package.json' : ''), /SOURCE_NOT_CLEAN/u)
  const resolved = resolveCleanSource((...args) => args[0] === 'status' ? '' : args[1] === 'HEAD' ? source.sourceRevision : source.sourceTree)
  assert.deepEqual(resolved, source)
})

test('provider failure still zeroes raw entropy and stdin payload buffers', () => {
  const entropy = Buffer.alloc(64, 0x41)
  let streamedPayload
  let call = 0
  assert.throws(() => runSecretVersionBootstrap({
    execute: true,
    authorization: constants.EXECUTE_CAPABILITY,
    source,
    entropySource: () => entropy,
    invoke(_command, _args, input) {
      call += 1
      if (call === 1) return { status: 0, stdout: '[]', stderr: '' }
      streamedPayload = input
      return { status: 1, stdout: '', stderr: 'provider rejected request' }
    },
  }, profile), /SECRET_PROVIDER_COMMAND_FAILED/u)
  assert.ok(entropy.every((byte) => byte === 0))
  assert.ok(streamedPayload.every((byte) => byte === 0))
})

test('bootstrap plan hash covers exact commands and fail-closed guards', () => {
  const plan = createSecretVersionBootstrapPlan(profile)
  const core = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'planSha256'))
  assert.equal(plan.planSha256, sha256(canonicalize(core)))
  assert.equal(plan.providerCommands.execute.stdinOnly, true)
  assert.equal(plan.providerCommands.readback.args[3], '<NUMERIC_VERSION>')
  assert.equal(plan.guards.payloadEncoding, 'base64url')
  assert.equal(plan.guards.requiresEmptyVersionHistory, true)
  assert.equal(plan.guards.secretPayloadMayAppearInEvidence, false)
})

test('continuity receipt reattests enabled version 1 only for the fixed governance descendant source', () => {
  const plan = createSecretVersionBootstrapPlan(profile)
  const original = buildSecretVersionBootstrapReceipt({ plan, providerReadback: { name: exactName, state: 'ENABLED' }, source, observedAt: '2026-09-17T05:00:00.000Z' }, profile)
  const current = { sourceRevision: 'c'.repeat(40), sourceTree: 'd'.repeat(40), clean: true }
  const input = { originalReceipt: original, providerReadback: { name: exactName, state: 'ENABLED' }, source: current, changedPaths: [...constants.CONTINUITY_CHANGED_PATHS], ancestorVerified: true, authorization: constants.CONTINUITY_CAPABILITY, observedAt: '2026-09-17T08:30:00.000Z' }
  const receipt = buildSecretVersionContinuityReceipt(input, profile)
  assert.equal(receipt.status, 'EXISTING_FIRST_VERSION_REATTESTED')
  assert.equal(receipt.mutationExecuted, false)
  assert.equal(receipt.cloudMutations, 0)
  assert.equal(receipt.originalReceiptSha256, original.receiptSha256)
  assert.throws(() => buildSecretVersionContinuityReceipt({ ...input, changedPaths: [...constants.CONTINUITY_CHANGED_PATHS, 'server/runtime.ts'] }, profile), /CONTINUITY_PATH_INVALID/u)
  assert.throws(() => buildSecretVersionContinuityReceipt({ ...input, ancestorVerified: false }, profile), /CONTINUITY_SOURCE_INVALID/u)
  assert.throws(() => buildSecretVersionContinuityReceipt({ ...input, providerReadback: { name: exactName, state: 'DISABLED' } }, profile), /VERSION_ADD_INVALID/u)
})
