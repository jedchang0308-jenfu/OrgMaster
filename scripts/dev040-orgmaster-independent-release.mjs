#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040R2Profile, assertDev040ReleaseIntent, buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitArchive, executeOwnerStage, parseOwnerStageArgs } from './lib/dev012-owner-stage-executor.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const [profile, n1c] = await Promise.all(['config/release/dev040-orgmaster-independent-production.json', 'config/dev-010/n1c-orgmaster.json'].map((file) => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse)))
  assertDev040R2Profile(profile, n1c)
  const args = parseOwnerStageArgs(process.argv.slice(2), profile.artifact.releaseBucket)
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const result = await executeOwnerStage({
    ...args, profile, transport, validateIntent: assertDev040ReleaseIntent,
    createSourceArchive: async (sourceRevision) => createGitArchive(root, sourceRevision),
    buildMigrationBundle: async (sourceRevision) => {
      const files = new Map(await Promise.all(profile.migrations.entries.map(async (entry) => [entry.path, await fs.readFile(path.join(root, ...entry.path.split('/')))])))
      return buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, sourceRevision)
    },
  })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, ref: result.ref, generation: String(result.metadata.generation), status: 'PASS' })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
