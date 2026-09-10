#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040ReleaseIntent, assertDev040V3Profile, buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { executePrerequisiteProducer, parsePrerequisiteProducerArgs, resolveOwnerInputPath } from './lib/dev012-owner-prerequisite-producer.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readInput(inputPath) {
  const [realRoot, realInput] = await Promise.all([fs.realpath(root), fs.realpath(resolveOwnerInputPath(root, inputPath))])
  if (!realInput.startsWith(realRoot + path.sep)) {
    const error = new Error('INPUT_PATH_OUT_OF_SCOPE')
    error.code = 'INPUT_PATH_OUT_OF_SCOPE'
    throw error
  }
  return JSON.parse(await fs.readFile(realInput, 'utf8'))
}

async function main() {
  const args = parsePrerequisiteProducerArgs(process.argv.slice(2))
  const [profile, n1c] = await Promise.all(['config/release/dev040-orgmaster-independent-production-v3.json', 'config/dev-010/n1c-orgmaster.json'].map((file) => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse)))
  assertDev040V3Profile(profile, n1c)
  const input = args.inputPath ? await readInput(args.inputPath) : null
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const result = await executePrerequisiteProducer({
    ...args, input, profile, root, transport,
    validateIntent: assertDev040ReleaseIntent,
    createSourceIdentity: async (sourceRevision) => createGitSourceIdentity(root, sourceRevision),
    buildMigrationBundle: async (sourceRevision) => {
      const files = new Map(await Promise.all(profile.migrations.entries.map(async (entry) => [entry.path, await fs.readFile(path.join(root, ...entry.path.split('/')))])))
      return buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, sourceRevision)
    },
  })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, releaseId: args.releaseId, ref: result.ref, generation: String(result.metadata.generation), status: 'PASS' })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
