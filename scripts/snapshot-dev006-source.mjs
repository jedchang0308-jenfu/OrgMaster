import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { inventorySource } from './dev006-orgmaster-migrate.mjs'

function parseTarget(argv) {
  const index = argv.indexOf('--target')
  const value = index >= 0 ? argv[index + 1] : null
  if (!value) throw new Error('SNAPSHOT_TARGET_REQUIRED')
  return resolve(value)
}

function copy(source, target) { mkdirSync(dirname(target), { recursive: true }); copyFileSync(source, target) }

async function main() {
  const sourceRoot = resolve(process.cwd())
  const targetRoot = parseTarget(process.argv)
  rmSync(targetRoot, { recursive: true, force: true })
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'data', 'orgmaster-workspace.v1.json'), 'utf8'))
  const paths = [
    'orgmaster-workspace.v1.json',
    'orgmaster-governance.v2.json',
    'orgmaster-management-methods.v1.json',
    ...manifest.entries.map((entry) => `orgmaster-versions/${entry.id}.json`),
  ]
  for (const path of paths) copy(join(sourceRoot, 'data', path), join(targetRoot, 'data', path))
  const mediaRoot = join(sourceRoot, 'data', 'orgmaster-management-method-media')
  for (const entry of readdirSync(mediaRoot, { withFileTypes: true })) {
    if (entry.isFile()) copy(join(mediaRoot, entry.name), join(targetRoot, 'data', 'orgmaster-management-method-media', entry.name))
  }
  const snapshot = await inventorySource(targetRoot)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', targetRoot, sourceRevision: snapshot.sourceRevision, artifactCount: snapshot.artifactCount, mediaCount: snapshot.mediaCount, sourceBytes: snapshot.sourceBytes })}\n`)
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ status: 'FAIL', code: error instanceof Error ? error.message : 'SNAPSHOT_FAILED' })}\n`)
  process.exitCode = 1
})
