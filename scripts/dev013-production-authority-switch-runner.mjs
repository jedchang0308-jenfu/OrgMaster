#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { metadataAccessToken, parseGsUri, publishGcsJson, readGcsObject } from './lib/dev012-production-migration-runner.mjs'
import { assertAuthorityOperation, assertAuthorityRunnerTarget, DEV013_AUTHORITY_TARGET, executeAuthorityOperation, parseAuthorityRunnerArgs } from './lib/dev013-production-authority-switch.mjs'

export function databaseOptions(environment, token) {
  return { host: environment.POSTGRES_SOCKET, database: environment.POSTGRES_DATABASE, user: environment.POSTGRES_IAM_LOGIN, password: token, ssl: false, application_name: 'dev013-orgmaster-production-authority-operator', connectionTimeoutMillis: 10_000, query_timeout: 35_000, statement_timeout: 30_000 }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client, now = () => new Date().toISOString() } = {}) {
  const args = parseAuthorityRunnerArgs(argv)
  assertAuthorityRunnerTarget(environment)
  if (environment.SOURCE_REVISION !== args.sourceRevision) throw new Error('DEV013_AUTHORITY_SOURCE_REVISION_MISMATCH')
  parseGsUri(args.operationRef, DEV013_AUTHORITY_TARGET.releaseBucket, 'source/production-data')
  parseGsUri(args.outputRef, DEV013_AUTHORITY_TARGET.releaseBucket, 'receipts/releases')
  const token = await metadataAccessToken(fetchImpl)
  const object = await readGcsObject({ uri: args.operationRef, expectedBucket: DEV013_AUTHORITY_TARGET.releaseBucket, expectedPrefix: 'source/production-data', token, fetchImpl })
  let raw
  try { raw = JSON.parse(object.bytes.toString('utf8')) } catch { throw new Error('DEV013_AUTHORITY_OPERATION_JSON_INVALID') }
  const operation = assertAuthorityOperation(raw, { bytes: object.bytes, operationSha256: args.operationSha256, sourceRevision: args.sourceRevision, now: new Date(now()) })
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const receipt = await executeAuthorityOperation({ database, operation, now })
    const published = await publishGcsJson({ uri: args.outputRef, expectedBucket: DEV013_AUTHORITY_TARGET.releaseBucket, expectedPrefix: 'receipts/releases', value: receipt, token, fetchImpl })
    return { ...receipt, outputRef: args.outputRef, outputGeneration: published.generation, outputSha256: published.sha256 }
  } finally { await database.end() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
