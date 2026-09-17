import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReleasePlan, loadProfile } from './lib/dev013-orgmaster-staging-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parse(argv) {
  const result = { execute: false }
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--execute') { result.execute = true; continue }
    if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`Invalid argument: ${key}`)
    result[key.slice(2)] = argv[index + 1]
    index += 1
  }
  return result
}

export function runRelease(argv = process.argv.slice(2)) {
  const input = parse(argv)
  if (!input.request) throw new Error('Required: --request; add --execute only inside the protected owner release boundary')
  const request = JSON.parse(fs.readFileSync(path.resolve(root, input.request), 'utf8'))
  const plan = createReleasePlan(request, loadProfile())
  if (!input.execute) return { executed: false, plan }
  const result = spawnSync(plan.gcloud.command, plan.gcloud.args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) throw new Error(`DEV013_ORGMASTER_RELEASE_EXECUTION_FAILED: ${String(result.stderr).trim()}`)
  return { executed: true, plan, providerOutput: String(result.stdout).trim() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runRelease()
    process.stdout.write(`${JSON.stringify({ status: result.plan.status, operation: result.plan.operation, executed: result.executed, planSha256: result.plan.planSha256, releaseAuthority: false })}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
