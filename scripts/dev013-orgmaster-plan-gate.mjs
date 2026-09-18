import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertTerraformPlan, loadProfile } from './lib/dev013-orgmaster-staging-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parse(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`Invalid argument: ${key}`)
    result[key.slice(2)] = argv[index + 1]
    index += 1
  }
  return result
}

export function runPlanGate(planFile, freezeFile) {
  const plan = JSON.parse(fs.readFileSync(path.resolve(root, planFile), 'utf8'))
  const freeze = JSON.parse(fs.readFileSync(path.resolve(root, freezeFile), 'utf8'))
  return assertTerraformPlan(plan, freeze, loadProfile())
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = parse(process.argv.slice(2))
    if (!input.plan || !input['source-freeze']) throw new Error('Required: --plan --source-freeze')
    process.stdout.write(`${JSON.stringify(runPlanGate(input.plan, input['source-freeze']))}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
