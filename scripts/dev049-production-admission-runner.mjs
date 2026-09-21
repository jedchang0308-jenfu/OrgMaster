#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  assertRunnerTarget,
  metadataAccessToken,
  parseGsUri,
  publishGcsJson,
  readGcsObject,
} from './lib/dev012-production-migration-runner.mjs'
import {
  assertOrgMasterAdmissionOperation,
  executeOrgMasterAdmission,
  ORGMASTER_ADMISSION_TARGET,
} from './lib/dev049-production-admission.mjs'
import { databaseOptions } from './dev040-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

function parseArgs(argv) {
  const names = ['--operation-ref', '--operation-sha256', '--source-revision', '--output-ref']
  const allowed = new Set(names)
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const next = argv[index + 1]
    if (!allowed.has(key) || !next) throw new Error('DEV049_ADMISSION_ARGUMENT_INVALID')
    const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    if (value[name]) throw new Error('DEV049_ADMISSION_ARGUMENT_INVALID')
    value[name] = next
  }
  if (Object.keys(value).length !== names.length || !H64.test(value.operationSha256 ?? '') || !H40.test(value.sourceRevision ?? '')) throw new Error('DEV049_ADMISSION_ARGUMENT_INVALID')
  return value
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client } = {}) {
  const args = parseArgs(argv)
  assertRunnerTarget(environment, { ...ORGMASTER_ADMISSION_TARGET, job: ORGMASTER_ADMISSION_TARGET.jobName })
  parseGsUri(args.operationRef, ORGMASTER_ADMISSION_TARGET.releaseBucket, 'source/production-data/dev014/admission')
  parseGsUri(args.outputRef, ORGMASTER_ADMISSION_TARGET.releaseBucket, 'receipts/releases/DEV014-ADMISSION')
  const token = await metadataAccessToken(fetchImpl)
  const object = await readGcsObject({
    uri: args.operationRef,
    expectedBucket: ORGMASTER_ADMISSION_TARGET.releaseBucket,
    expectedPrefix: 'source/production-data/dev014/admission',
    token,
    fetchImpl,
  })
  let value
  try { value = JSON.parse(object.bytes.toString('utf8')) } catch { throw new Error('DEV049_OPERATION_JSON_INVALID') }
  const operation = assertOrgMasterAdmissionOperation(value, { bytes: object.bytes, operationSha256: args.operationSha256, sourceRevision: args.sourceRevision, now: new Date() })
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const result = await executeOrgMasterAdmission({ operation, database })
    const receipt = {
      schemaVersion: 'jenfu.dev049.orgmaster-production-admission-receipt.v1',
      ownerApplicationId: 'orgmaster',
      operationId: operation.operationId,
      sourceRevision: operation.sourceRevision,
      operationRef: args.operationRef,
      operationSha256: args.operationSha256,
      action: operation.action,
      status: 'PASS',
      disposition: result.disposition,
      before: result.before,
      after: result.after,
      supports: result.supports,
      affectedIdentityCount: result.affectedIdentityCount,
      outboxCount: result.outboxCount,
      database: ORGMASTER_ADMISSION_TARGET.database,
      completedAt: new Date().toISOString(),
    }
    const publication = await publishGcsJson({
      uri: args.outputRef,
      expectedBucket: ORGMASTER_ADMISSION_TARGET.releaseBucket,
      expectedPrefix: 'receipts/releases/DEV014-ADMISSION',
      value: receipt,
      token,
      fetchImpl,
    })
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
