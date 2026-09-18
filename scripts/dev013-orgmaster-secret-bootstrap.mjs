import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProfile } from './lib/dev013-orgmaster-staging-release.mjs'
import { buildSecretVersionContinuityReceipt, runSecretVersionBootstrap } from './lib/dev013-orgmaster-secret-bootstrap.mjs'
import { spawnPortableSync } from './lib/dev013-portable-command.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parse(argv) {
  const result = { execute: false, reattest: false }
  const allowed = new Set(['authorization', 'original-receipt', 'output', 'project', 'secret'])
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--execute') { result.execute = true; continue }
    if (key === '--reattest') { result.reattest = true; continue }
    if (key.startsWith('--') && key.includes('=')) {
      const [name, ...rest] = key.slice(2).split('=')
      if (!allowed.has(name) || rest.length === 0 || rest.join('=').length === 0) throw new Error(`Invalid argument: ${key}`)
      result[name] = rest.join('=')
      continue
    }
    const name = key.startsWith('--') ? key.slice(2) : ''
    if (!allowed.has(name) || !argv[index + 1]) throw new Error(`Invalid argument: ${key}`)
    result[name] = argv[index + 1]
    index += 1
  }
  return result
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

export function resolveCleanSource(readGit = (...args) => git(...args)) {
  if (readGit('status', '--porcelain=v1', '--untracked-files=all')) throw new Error('DEV013_ORGMASTER_SECRET_BOOTSTRAP_SOURCE_NOT_CLEAN')
  return { sourceRevision: readGit('rev-parse', 'HEAD'), sourceTree: readGit('rev-parse', 'HEAD^{tree}'), clean: true }
}

function invoke(command, args, input) {
  return spawnPortableSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    input,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function runCli(argv = process.argv.slice(2)) {
  const input = parse(argv)
  if ((input.execute || input.reattest) && !input.output) throw new Error('DEV013_ORGMASTER_SECRET_BOOTSTRAP_OUTPUT_REQUIRED')
  if (input.execute && input.reattest) throw new Error('DEV013_ORGMASTER_SECRET_BOOTSTRAP_MODE_INVALID')
  const output = (input.execute || input.reattest) ? path.resolve(root, input.output) : null
  if (output && fs.existsSync(output)) throw new Error('DEV013_ORGMASTER_SECRET_BOOTSTRAP_OUTPUT_EXISTS')
  let source
  if (input.execute || input.reattest) source = resolveCleanSource()
  if (input.reattest) {
    if (!input['original-receipt']) throw new Error('DEV013_ORGMASTER_SECRET_CONTINUITY_ORIGINAL_REQUIRED')
    const originalReceipt = JSON.parse(fs.readFileSync(path.resolve(root, input['original-receipt']), 'utf8'))
    let ancestorVerified = false
    try { execFileSync('git', ['merge-base', '--is-ancestor', originalReceipt.sourceRevision, source.sourceRevision], { cwd: root, windowsHide: true }); ancestorVerified = true } catch {}
    const changedPaths = git('diff', '--name-only', `${originalReceipt.sourceRevision}..${source.sourceRevision}`).split(/\r?\n/u).filter(Boolean).sort()
    const profile = loadProfile()
    const secretId = profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER
    const readback = invoke('gcloud', ['secrets', 'versions', 'describe', '1', '--secret', secretId, '--project', profile.target.projectId, '--format=json(name,state)'])
    if (readback.status !== 0) throw new Error('DEV013_ORGMASTER_SECRET_PROVIDER_COMMAND_FAILED')
    const receipt = buildSecretVersionContinuityReceipt({ originalReceipt, providerReadback: JSON.parse(readback.stdout), source, changedPaths, ancestorVerified, authorization: input.authorization })
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
    return { executed: false, reattested: true, receipt, output: path.relative(root, output).replaceAll('\\', '/') }
  }
  const result = runSecretVersionBootstrap({
    execute: input.execute,
    authorization: input.authorization,
    requestedProjectId: input.project,
    requestedSecretId: input.secret,
    source,
    invoke,
  }, loadProfile())
  if (result.executed) {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(result.receipt, null, 2)}\n`, { flag: 'wx' })
    return { ...result, output: path.relative(root, output).replaceAll('\\', '/') }
  }
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runCli()
    process.stdout.write(`${JSON.stringify(result.executed || result.reattested
      ? { status: result.receipt.status, executed: result.executed, reattested: result.reattested === true, output: result.output, receiptSha256: result.receipt.receiptSha256, releaseAuthority: false }
      : { status: result.plan.status, executed: false, target: result.plan.target, existingVersionCount: result.preflight.existingVersionCount, planSha256: result.plan.planSha256, releaseAuthority: false })}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
