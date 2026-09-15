#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const outputDir = join(root, 'qa', 'dev-047', 'postgres')
await mkdir(outputDir, { recursive: true })
const target = String(process.env.DEV047_POSTGRES_URL ?? '').trim()
if (!target || process.env.DEV047_POSTGRES_DISPOSABLE !== 'true') {
  const evidence = { contract: 'DEV-047', evidenceScope: 'LOCAL_ISOLATED', status: 'NOT_RUN', reason: 'Requires DEV047_POSTGRES_URL and DEV047_POSTGRES_DISPOSABLE=true; staging and production are never valid targets.', targetProvided: Boolean(target), generatedAt: new Date().toISOString() }
  await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
  process.exit(0)
}
// The disposable runner is intentionally fail-closed until a caller provides
// an isolated database harness.  It must never silently point at a shared DB.
const evidence = { contract: 'DEV-047', evidenceScope: 'LOCAL_ISOLATED', status: 'BLOCKED', reason: 'Disposable PostgreSQL harness is not bundled; provide an isolated target and migration runner.', targetClass: 'explicit-disposable-only', generatedAt: new Date().toISOString() }
await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(evidence, null, 2)); process.exit(2)
