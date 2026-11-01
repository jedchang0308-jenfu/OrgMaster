#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TARGET as PRODUCTION_TARGET, databaseOptions } from './lib/orgmaster-production-database.mjs'
import { DEV059_MIGRATION_ENTRY_COUNT, assertDev059MigrationEntries } from './lib/dev059-fms-authority-migration.mjs'
import { DEV060_RELEASE_MODE, assertDev060MigrationEntries } from './lib/dev060-fms-catalog-activation-migration.mjs'
import {
  ProductionMigrationError,
  assertMigrationBundle,
  assertRunnerTarget,
  executeProductionMigration,
  metadataAccessToken,
  parseGsUri,
  parseRunnerArgs,
  publishGcsJson,
  readGcsObject,
} from './lib/dev012-production-migration-runner.mjs'

export const TARGET = Object.freeze({
  ...PRODUCTION_TARGET,
  ledger: 'orgmaster_core.schema_migrations',
  baselineCount: 10,
  entryCount: DEV059_MIGRATION_ENTRY_COUNT,
  allowedExistingLedgerCounts: Object.freeze(Array.from({ length: DEV059_MIGRATION_ENTRY_COUNT - 30 }, (_, index) => index + 31)),
  migratorRole: 'jenfu_orgmaster_migrator',
  runtimeRole: 'jenfu_orgmaster_runtime',
  coreSchema: 'orgmaster_core',
  siblingCoreSchemas: ['ai_pdm_core', 'platform_core'],
})

export const DEV060_TARGET = Object.freeze({
  ...TARGET,
  allowedExistingLedgerCounts: Object.freeze([DEV059_MIGRATION_ENTRY_COUNT - 1, DEV059_MIGRATION_ENTRY_COUNT]),
})

export function parseOrgmasterRunnerArgs(argv) {
  const baseArgs = []
  let migrationMode = null
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (key === '--migration-mode') {
      if (migrationMode !== null || value !== DEV060_RELEASE_MODE) throw new ProductionMigrationError('MIGRATION_ARGUMENT_INVALID', key)
      migrationMode = value
    } else {
      baseArgs.push(key, value)
    }
  }
  const parsed = parseRunnerArgs(baseArgs)
  return migrationMode === null ? parsed : { ...parsed, migrationMode }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client } = {}) {
  const args = parseOrgmasterRunnerArgs(argv)
  const target = args.migrationMode === DEV060_RELEASE_MODE ? DEV060_TARGET : TARGET
  assertRunnerTarget(environment, target)
  parseGsUri(args.bundleRef, target.releaseBucket, 'source/migration-bundles')
  parseGsUri(args.outputRef, target.releaseBucket, 'receipts')
  const token = await metadataAccessToken(fetchImpl)
  const object = await readGcsObject({ uri: args.bundleRef, expectedBucket: target.releaseBucket, expectedPrefix: 'source/migration-bundles', token, fetchImpl })
  let value
  try {
    value = JSON.parse(object.bytes.toString('utf8'))
  } catch { throw new Error('MIGRATION_INPUT_JSON_INVALID') }
  const bundle = assertMigrationBundle(value, { target, sourceRevision: args.sourceRevision, bundleSha256: args.bundleSha256, bytes: object.bytes })
  if (args.migrationMode === DEV060_RELEASE_MODE) assertDev060MigrationEntries(bundle.entries)
  else assertDev059MigrationEntries(bundle.entries)
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const receipt = await executeProductionMigration({
      bundle,
      database,
      target,
      sourceRevision: args.sourceRevision,
      denyDatabaseConnect: async (databaseName) => {
        const denied = new Client(databaseOptions(environment, token, databaseName))
        try {
          await denied.connect()
          return false
        } catch {
          return true
        } finally {
          await denied.end().catch(() => undefined)
        }
      },
    })
    const publication = await publishGcsJson({ uri: args.outputRef, expectedBucket: target.releaseBucket, expectedPrefix: 'receipts', value: receipt, token, fetchImpl })
    return { ...receipt, outputRef: args.outputRef, outputGeneration: publication.generation, outputSha256: publication.sha256 }
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => {
    process.stderr.write(`${error.code || error.message}\n`)
    process.exitCode = 1
  })
}
