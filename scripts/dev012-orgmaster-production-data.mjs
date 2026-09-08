#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { buildFirstPrincipalBootstrap, collectProductionData } from './lib/dev012-orgmaster-production-data.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { resolveOwnerInputPath } from './lib/dev012-owner-prerequisite-producer.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const H40 = /^[a-f0-9]{40}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u

function fail(code) { const error = new Error(code); error.code = code; throw error }
function runGit(directory, args) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) fail('PRODUCTION_DATA_SOURCE_REPOSITORY_INVALID')
  return result.stdout.trim()
}
function repositorySlug(remote) { return /(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/iu.exec(remote)?.[1] ?? null }

function parseArgs(argv) {
  const allowed = new Set(['--release-id', '--source-revision', '--source-root', '--input'])
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    if (!allowed.has(argv[index]) || !argv[index + 1] || value[argv[index]]) fail('INVALID_ARGUMENTS')
    value[argv[index]] = argv[index + 1]
  }
  if (Object.keys(value).length !== 4 || !RELEASE_ID.test(value['--release-id'] ?? '') || !H40.test(value['--source-revision'] ?? '')) fail('INVALID_ARGUMENTS')
  return { releaseId: value['--release-id'], sourceRevision: value['--source-revision'], sourceRoot: path.resolve(value['--source-root']), inputPath: value['--input'] }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const profile = JSON.parse(await fs.readFile(path.join(root, 'config/release/dev040-orgmaster-independent-production.json'), 'utf8'))
  if (profile.productionData?.required !== true || repositorySlug(runGit(args.sourceRoot, ['remote', 'get-url', 'origin']))?.toLowerCase() !== 'jedchang0308-jenfu/orgmaster') fail('PRODUCTION_DATA_SOURCE_REPOSITORY_INVALID')
  if (runGit(root, ['rev-parse', 'HEAD']) !== args.sourceRevision || runGit(args.sourceRoot, ['rev-parse', 'HEAD']) !== args.sourceRevision || runGit(args.sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', 'data']) !== '') fail('PRODUCTION_DATA_SOURCE_REVISION_MISMATCH')
  const inputFile = await fs.realpath(resolveOwnerInputPath(root, args.inputPath))
  const realRoot = await fs.realpath(root)
  if (!inputFile.startsWith(realRoot + path.sep)) fail('INPUT_PATH_OUT_OF_SCOPE')
  const input = JSON.parse(await fs.readFile(inputFile, 'utf8'))
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const identityEvidence = (await transport.readJson(input.identityEvidenceRef, profile.artifact.releaseBucket, ['receipts'])).value
  const workspaceManifest = JSON.parse(await fs.readFile(path.join(args.sourceRoot, 'data', 'orgmaster-workspace.v1.json'), 'utf8'))
  const current = JSON.parse(await fs.readFile(path.join(args.sourceRoot, 'data', 'orgmaster-versions', `${workspaceManifest.currentVersionId}.json`), 'utf8'))
  const observedAt = new Date().toISOString()
  const bootstrap = buildFirstPrincipalBootstrap({ releaseId: args.releaseId, sourceRevision: args.sourceRevision, employeeIds: new Set(current.state.employees.map((value) => value.id)), input, identityEvidence, observedAt })
  const catalogFixture = JSON.parse(await fs.readFile(path.join(root, 'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'), 'utf8'))
  const packageResult = await collectProductionData({ ...args, releaseRoot: root, bootstrap, catalogFixture, observedAt })
  const bootstrapUri = `gs://${profile.artifact.releaseBucket}/receipts/releases/${args.releaseId}/first-principal-bootstrap.json`
  const dataUri = `gs://${profile.artifact.releaseBucket}/source/production-data/${args.releaseId}/${packageResult.value.manifestSha256}.json`
  const bootstrapResult = await transport.putJson(bootstrapUri, bootstrap, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  const dataResult = await transport.putBytes(dataUri, packageResult.bytes, { bucket: profile.artifact.releaseBucket, prefix: 'source', contentType: 'application/json' })
  process.stdout.write(`${JSON.stringify({ status: 'PASS', releaseId: args.releaseId, dataClassCounts: packageResult.value.dataClassCounts, preferenceDisposition: packageResult.value.preferenceDisposition, bootstrapRef: bootstrapResult.ref, productionDataRef: dataResult.ref, productionDataGeneration: String(dataResult.metadata.generation) })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
