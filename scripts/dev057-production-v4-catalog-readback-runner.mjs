#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TARGET, databaseOptions } from './dev040-production-migration-runner.mjs'
import {
  assertRunnerTarget, metadataAccessToken, parseGsUri, publishGcsJson,
} from './lib/dev012-production-migration-runner.mjs'
import { readPublishedAiPdmRoleCatalogFromDatabase } from '../server/aiPdmRoleCatalogRepository.ts'

const OUTPUT_PREFIX = 'receipts/releases/DEV057-V4-CONSUMER-READBACK'
const JOB = 'orgmaster-prod-dev057-v4-catalog-readback'
const HISTORICAL_VERSION = 'ai-pdm.role-catalog.2026-09-03.v3'
const HISTORICAL_HASH = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8'

export function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--source-revision' ||
      !/^[a-f0-9]{40}$/u.test(argv[1] ?? '') || argv[2] !== '--output-ref') {
    throw new Error('DEV057_READBACK_ARGUMENT_INVALID')
  }
  parseGsUri(argv[3], TARGET.releaseBucket, OUTPUT_PREFIX)
  return { sourceRevision: argv[1], outputRef: argv[3] }
}

function assignments(document) {
  const active = document.publishedVersions?.find(
    (version) => version.id === document.activePolicyVersionId)
  if (!active || active.kind !== 'assignment-governance-v3' ||
      !Array.isArray(active.policy?.roleAssignments) ||
      !Array.isArray(document.draft?.roleAssignments)) {
    throw new Error('DEV057_READBACK_GOVERNANCE_INVALID')
  }
  return { active: active.policy.roleAssignments, draft: document.draft.roleAssignments }
}

/** The receipt contains counts and hashes only; employee and principal data stay in Cloud SQL. */
export function summarizeGovernance(document, catalog, historical) {
  if (historical.catalogVersion !== HISTORICAL_VERSION ||
      historical.catalogSha256 !== HISTORICAL_HASH ||
      !Array.isArray(historical.roles) || historical.roles.length !== 9) {
    throw new Error('DEV057_READBACK_HISTORICAL_FIXTURE_INVALID')
  }
  const sets = assignments(document)
  const result = {}
  for (const [name, rows] of Object.entries(sets)) {
    const counts = { historicalV3: 0, currentV4: 0 }
    for (const row of rows.filter((value) => value.applicationId === 'ai-pdm')) {
      const currentRole = catalog.roles.find((role) => role.stableRoleId === row.roleId)
      if (!currentRole || !row.scope || !currentRole.allowedScopeKinds.includes(row.scope.kind)) {
        throw new Error('DEV057_READBACK_ASSIGNMENT_INVALID')
      }
      if (row.catalogVersion === HISTORICAL_VERSION) {
        const old = historical.roles.find((role) => role.stableRoleId === row.roleId)
        if (!old || old.roleCode !== row.roleCodeSnapshot ||
            old.displayName !== row.roleNameSnapshot ||
            old.roleCode !== currentRole.roleCode ||
            old.displayName !== currentRole.displayName ||
            old.subjectKind !== currentRole.subjectKind ||
            old.assignable !== currentRole.assignable ||
            old.assignmentTier !== currentRole.assignmentTier ||
            !old.allowedScopeKinds.includes(row.scope.kind)) {
          throw new Error('DEV057_READBACK_HISTORICAL_ASSIGNMENT_INVALID')
        }
        counts.historicalV3 += 1
      } else if (row.catalogVersion === catalog.catalogVersion &&
          row.roleCodeSnapshot === currentRole.roleCode &&
          row.roleNameSnapshot === currentRole.displayName) {
        counts.currentV4 += 1
      } else {
        throw new Error('DEV057_READBACK_ASSIGNMENT_VERSION_INVALID')
      }
    }
    result[name] = counts
  }
  return result
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env,
  fetchImpl = fetch, Client = pg.Client,
  readFixture = () => readFile(new URL(
    '../contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json',
    import.meta.url), 'utf8'),
} = {}) {
  const { sourceRevision, outputRef } = parseArgs(argv)
  const target = assertRunnerTarget(environment, { ...TARGET, job: JOB })
  if (environment.SOURCE_REVISION !== sourceRevision) {
    throw new Error('DEV057_READBACK_IMAGE_SOURCE_MISMATCH')
  }
  const token = await metadataAccessToken(fetchImpl)
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    const catalog = await readPublishedAiPdmRoleCatalogFromDatabase(database)
    const governance = (await database.query(
      "SELECT payload, source_sha256 FROM orgmaster_core.read_active_persistence_artifact_v1($1)",
      ['orgmaster-governance.v3.json'])).rows
    if (governance.length !== 1 || !/^[a-f0-9]{64}$/u.test(governance[0].source_sha256 ?? '')) {
      throw new Error('DEV057_READBACK_GOVERNANCE_MISSING')
    }
    const counts = summarizeGovernance(governance[0].payload, catalog,
      JSON.parse(await readFixture()))
    await database.query('COMMIT')
    const receipt = {
      schemaVersion: 'orgmaster.dev057-v4-consumer-readback.v1',
      sourceRevision, target, catalogVersion: catalog.catalogVersion,
      catalogSha256: catalog.catalogSha256, roleCount: catalog.roles.length,
      governanceSourceSha256: governance[0].source_sha256,
      assignments: counts,
    }
    const published = await publishGcsJson({ uri: outputRef,
      expectedBucket: TARGET.releaseBucket, expectedPrefix: OUTPUT_PREFIX,
      value: receipt, token, fetchImpl })
    return { ...receipt, outputRef, outputGeneration: published.generation,
      outputSha256: published.sha256 }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
