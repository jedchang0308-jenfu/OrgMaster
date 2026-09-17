#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildDev049OwnerReceipt, sha256 } from './lib/dev049-managed-login-owner-receipt.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'qa', 'dev-049', 'producer', 'owner-receipt.json')
const controlledPaths = [
  'db/migrations/013_dev049_existing_google_primary_account_link.sql',
  'server/orgmasterFirebaseIdentityProvider.ts',
  'server/orgmasterManagedDirectoryPort.ts',
  'server/orgmasterManagedIdentityRepository.ts',
  'server/orgmasterManagedIdentityStore.ts',
  'server/orgmasterManagedLoginApi.ts',
  'server/orgmasterManagedLoginContract.ts',
  'server/orgmasterManagedLoginService.ts',
  'server/orgmasterAuthApi.ts',
  'server/orgmasterServer.ts',
  'scripts/qc-dev-047-postgres.mjs',
  'scripts/qc-dev-049-contract.mjs',
  'scripts/dev049-managed-login-owner-receipt.mjs',
  'scripts/lib/dev049-managed-login-owner-receipt.mjs',
  'package.json',
  'vite.config.ts',
]
const controlledFiles = controlledPaths.map((relative) => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(root, relative))) }))
const evidencePaths = [
  ['browser', 'qa/dev-049/browser/manifest.json'],
  ['contract', 'qa/dev-049/contracts/manifest.json'],
  ['postgres', 'qa/dev-049/postgres/manifest.json'],
]
const evidence = evidencePaths.map(([kind, relative]) => {
  const bytes = fs.readFileSync(path.join(root, relative))
  const parsed = JSON.parse(bytes)
  if (parsed.status !== 'PASS') throw new Error(`DEV049_OWNER_EVIDENCE_NOT_PASS:${kind}`)
  if (kind === 'postgres' && (!parsed.runtime?.cleanup || Object.values(parsed.runtime.cleanup).some((value) => value !== true))) throw new Error('DEV049_OWNER_POSTGRES_CLEANUP_INVALID')
  return { kind, path: relative, sha256: sha256(bytes), status: 'PASS' }
})
const receipt = buildDev049OwnerReceipt({
  producedAt: new Date().toISOString(),
  branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  controlledFiles,
  migrationSha256: controlledFiles.find((item) => item.path.startsWith('db/migrations/013_')).sha256,
  evidence,
})
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ status: receipt.status, output, receiptSha256: receipt.receiptSha256, controlledTreeSha256: receipt.source.controlledTreeSha256 }, null, 2)}\n`)
