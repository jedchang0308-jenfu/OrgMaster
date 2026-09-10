#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  assertMigrationBundle,
  assertRunnerTarget,
  canonicalize,
  executeProductionMigration,
  metadataAccessToken,
  parseGsUri,
  parseRunnerArgs,
  publishGcsJson,
  readGcsObject,
  sha256,
} from './lib/dev012-production-migration-runner.mjs'
import {
  assertFirstPrincipalBootstrap,
  assertProductionDataPackage,
  importProductionData,
} from './lib/dev012-orgmaster-production-data.mjs'

export const TARGET = Object.freeze({
  ownerApplicationId: 'orgmaster',
  releaseBucket: 'jenfu-platform-prod-orgmaster-release',
  job: 'orgmaster-prod-migration-runner',
  login: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
  ledger: 'orgmaster_core.schema_migrations',
  baselineCount: 10,
  minimumLedgerCount: 0,
  allowFreshLedgerBootstrap: true,
  migratorRole: 'jenfu_orgmaster_migrator',
  runtimeRole: 'jenfu_orgmaster_runtime',
  coreSchema: 'orgmaster_core',
  siblingCoreSchemas: ['ai_pdm_core', 'platform_core'],
})

export function databaseOptions(environment, token, database = 'jenfu_prod') {
  return {
    host: environment.POSTGRES_SOCKET,
    database,
    user: environment.POSTGRES_IAM_LOGIN,
    password: token,
    ssl: false,
    application_name: 'dev012-orgmaster-production-migrator',
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client } = {}) {
  const args = parseRunnerArgs(argv, { productionDataRequired: true })
  assertRunnerTarget(environment, TARGET)
  parseGsUri(args.bundleRef, TARGET.releaseBucket, 'source/migration-bundles')
  parseGsUri(args.dataRef, TARGET.releaseBucket, 'source/production-data')
  parseGsUri(args.bootstrapRef, TARGET.releaseBucket, 'receipts/releases')
  parseGsUri(args.outputRef, TARGET.releaseBucket, 'receipts')
  const token = await metadataAccessToken(fetchImpl)
  const [object, dataObject, bootstrapObject] = await Promise.all([
    readGcsObject({ uri: args.bundleRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: 'source/migration-bundles', token, fetchImpl }),
    readGcsObject({ uri: args.dataRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: 'source/production-data', token, fetchImpl }),
    readGcsObject({ uri: args.bootstrapRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: 'receipts/releases', token, fetchImpl }),
  ])
  let value
  let productionData
  let bootstrap
  try {
    value = JSON.parse(object.bytes.toString('utf8'))
    productionData = JSON.parse(dataObject.bytes.toString('utf8'))
    bootstrap = JSON.parse(bootstrapObject.bytes.toString('utf8'))
  } catch { throw new Error('MIGRATION_INPUT_JSON_INVALID') }
  if (sha256(dataObject.bytes) !== args.dataSha256 || sha256(bootstrapObject.bytes) !== args.bootstrapSha256) throw new Error('MIGRATION_INPUT_SHA256_MISMATCH')
  const bundle = assertMigrationBundle(value, { target: TARGET, sourceRevision: args.sourceRevision, bundleSha256: args.bundleSha256, bytes: object.bytes })
  assertFirstPrincipalBootstrap(bootstrap, { releaseId: productionData.releaseId, sourceRevision: args.sourceRevision })
  assertProductionDataPackage(productionData, { bytes: dataObject.bytes, releaseId: productionData.releaseId, sourceRevision: args.sourceRevision, bootstrapSha256: bootstrap.bootstrapSha256 })
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const migrationReceipt = await executeProductionMigration({
      bundle,
      database,
      target: TARGET,
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
    const productionDataReceipt = await importProductionData({ database, packageValue: productionData, bootstrap })
    const receiptCore = { ...migrationReceipt, productionData: productionDataReceipt }
    delete receiptCore.receiptSha256
    const receipt = { ...receiptCore, receiptSha256: sha256(canonicalize(receiptCore)) }
    const publication = await publishGcsJson({ uri: args.outputRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: 'receipts', value: receipt, token, fetchImpl })
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
