import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSourceFreezeReceipt, firebasePublicConfigSha256, loadProfile, verifyCanonicalContract, verifyPlatformManifest } from './lib/dev013-orgmaster-staging-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function args(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`Invalid argument: ${key}`)
    result[key.slice(2)] = argv[index + 1]
    index += 1
  }
  return result
}

function readJson(value) {
  return JSON.parse(fs.readFileSync(path.resolve(root, value), 'utf8'))
}

function git(...values) {
  return execFileSync('git', values, { cwd: root, encoding: 'utf8' }).trim()
}

export function runSourceFreeze(argv = process.argv.slice(2)) {
  const input = args(argv)
  if (!input.stage || !input['platform-manifest'] || !input['foundation-ref'] || !input.output) throw new Error('Required: --stage --platform-manifest --foundation-ref --output')
  const profile = loadProfile()
  verifyPlatformManifest(fs.readFileSync(path.resolve(root, input['platform-manifest'])), profile)
  verifyCanonicalContract(root, profile)
  const dirty = git('status', '--porcelain=v1', '--untracked-files=all')
  if (dirty) throw new Error('DEV013_ORGMASTER_SOURCE_NOT_CLEAN')
  const sourceRevision = git('rev-parse', 'HEAD')
  const sourceTree = git('rev-parse', 'HEAD^{tree}')
  const stage = input.stage
  const runtime = stage === 'OWNER_RUNTIME_B'
  if (runtime && (!input['runtime-image'] || !input['runtime-secret-version'] || !input['firebase-public-config'])) throw new Error('OWNER_RUNTIME_B requires --runtime-image --runtime-secret-version --firebase-public-config')
  const receipt = createSourceFreezeReceipt({
    stage,
    sourceRevision,
    sourceTree,
    sourceCreatedAt: git('show', '-s', '--format=%cI', sourceRevision),
    clean: true,
    foundationReceipt: readJson(input['foundation-ref']),
    runtimeImage: runtime ? input['runtime-image'] : null,
    runtimeSecretVersions: runtime ? {
      ORGMASTER_SESSION_HASH_PEPPER: {
        secretId: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER,
        version: input['runtime-secret-version'],
      },
    } : null,
    firebasePublicConfigSha256: runtime ? firebasePublicConfigSha256(readJson(input['firebase-public-config']), profile) : null,
  }, profile)
  const output = path.resolve(root, input.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  return { output: path.relative(root, output).replaceAll('\\', '/'), receipt }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runSourceFreeze()
    process.stdout.write(`${JSON.stringify({ status: result.receipt.status, stage: result.receipt.stage, sourceRevision: result.receipt.sourceRevision, sourceTree: result.receipt.sourceTree, output: result.output, receiptSha256: result.receipt.receiptSha256, releaseAuthority: false })}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
