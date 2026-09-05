#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

import { canonicalize, sha256, sourceSha256 } from './lib/dev010-n2-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'config', 'dev-010', 'n1c-orgmaster.json')
const exactTarget = {
  environment: 'staging',
  projectId: 'jenfu-platform-nonprod',
  region: 'asia-east1',
  instance: 'jenfu-platform-nonprod-pg',
  connectionName: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
  database: 'jenfu_stg',
  login: 'dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam',
}

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  throw error
}

export function loadN1cOrgmasterConfig() {
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const keys = Object.keys(value).sort().join(',')
  if (keys !== ['contractVersion', 'devId', 'fixture', 'migration', 'repository', 'safety', 'slice', 'sourceFreeze', 'target'].sort().join(',')) fail('DEV010_N1C_ORGMASTER_UNKNOWN_KEY')
  if (value.contractVersion !== 'jenfu.dev010.n1c.orgmaster.v1' || value.devId !== 'DEV-010' || value.slice !== '010-N1C') fail('DEV010_N1C_ORGMASTER_INVALID_CONTRACT')
  if (canonicalize(value.target) !== canonicalize(exactTarget)) fail('DEV010_N1C_ORGMASTER_WRONG_TARGET')
  if (!Array.isArray(value.migration.order) || value.migration.order.length !== 10 || value.migration.order.some((item, index) => !item.startsWith(`db/migrations/${String(index + 1).padStart(3, '0')}_`))) fail('DEV010_N1C_ORGMASTER_INVALID_ORDER')
  if (value.migration.transformationId !== 'jenfu.dev010.n1c.foundation-schema-owner-rebind.v2' || value.migration.ledger !== 'orgmaster_core.schema_migrations') fail('DEV010_N1C_ORGMASTER_INVALID_TRANSFORMATION')
  if (value.fixture.tenantId !== 'company-staging-smoke' || value.fixture.productionTenantId !== 'company-jenfu' || value.safety.defaultMode !== 'dry-run' || value.safety.productionWrites !== false || value.safety.runtimeServices !== 0) fail('DEV010_N1C_ORGMASTER_SAFETY_FAILED')
  return value
}

export function assertN1cOrgmasterTarget(environment, readback = null, config = loadN1cOrgmasterConfig()) {
  const observed = {
    environment: environment.ORGMASTER_DEPLOYMENT_ENV,
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    instance: environment.ORGMASTER_CLOUD_SQL_INSTANCE,
    connectionName: environment.ORGMASTER_CLOUD_SQL_CONNECTION_NAME,
    database: environment.ORGMASTER_POSTGRES_DATABASE,
    login: environment.ORGMASTER_POSTGRES_IAM_LOGIN,
  }
  if (canonicalize(observed) !== canonicalize(config.target)) fail('DEV010_N1C_ORGMASTER_WRONG_TARGET')
  if (readback && (readback.database !== config.target.database || readback.user !== config.target.login || Number(readback.postgresMajor) !== 17)) fail('DEV010_N1C_ORGMASTER_DATABASE_READBACK_MISMATCH')
  return { ...observed, status: 'PASS' }
}

export function deriveOrgmasterMigration(relativePath, bytes) {
  const normalized = String(bytes).replace(/\r\n/gu, '\n')
  const beginCount = normalized.match(/^BEGIN;\s*$/gmu)?.length ?? 0
  const commitCount = normalized.match(/^COMMIT;\s*$/gmu)?.length ?? 0
  const envelope = /^(?<leading>(?:(?:--[^\n]*)?\n)*)BEGIN;\s*\n(?<body>[\s\S]*?)\nCOMMIT;\s*$/u.exec(normalized)
  if (!envelope || beginCount !== 1 || commitCount !== 1) fail('DEV010_N1C_ORGMASTER_TRANSACTION_SHAPE_MISMATCH', relativePath)
  const body = `${envelope.groups?.leading ?? ''}${envelope.groups?.body ?? ''}\n`
  let rebound = relativePath.includes('/010_') ? body : body.replaceAll('jenfu_platform_migrator', 'jenfu_orgmaster_migrator')
  rebound = rebound
    .replace(/^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*$/gmu, '')
    .replace(/^CREATE SCHEMA IF NOT EXISTS (?:orgmaster|organization|access_governance) AUTHORIZATION jenfu_orgmaster_migrator;\s*$/gmu, '')
    .replace(/^ALTER SCHEMA (?:orgmaster|organization|access_governance) OWNER TO jenfu_orgmaster_migrator;\s*$/gmu, '')
  if (/^BEGIN;|\nCOMMIT;\s*$/u.test(rebound)) fail('DEV010_N1C_ORGMASTER_TRANSACTION_TRANSFORM_FAILED', relativePath)
  if (!relativePath.includes('/010_') && rebound.includes('jenfu_platform_migrator')) fail('DEV010_N1C_ORGMASTER_OWNER_REBIND_FAILED', relativePath)
  return rebound
}

export function buildOrgmasterPackage(config = loadN1cOrgmasterConfig()) {
  const entries = config.migration.order.map((relativePath) => {
    const source = fs.readFileSync(path.join(root, ...relativePath.split('/')))
    const derived = deriveOrgmasterMigration(relativePath, source)
    return {
      version: `dev010-n1c-orgmaster-${path.basename(relativePath).slice(0, 3)}`,
      name: path.basename(relativePath, '.sql').slice(4),
      sourcePath: relativePath,
      sourceSha256: sourceSha256(source),
      transformationId: config.migration.transformationId,
      outputSha256: sha256(derived),
      sql: derived,
    }
  })
  const manifestCore = { contractVersion: config.contractVersion, entries: entries.map(({ sql, ...entry }) => entry), requiredDependency: config.migration.requiredDependency, target: config.target }
  return { entries, manifest: { ...manifestCore, manifestSha256: sha256(canonicalize(manifestCore)) } }
}

function writePackage(value) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const runId = `PACKAGE-${new Date().toISOString().replace(/[-:.TZ]/gu, '')}-${process.pid}`
  const outputDir = path.join(root, 'output', 'dev-010', 'n1c', runId, 'migrations', 'orgmaster')
  fs.mkdirSync(outputDir, { recursive: true })
  for (const entry of value.entries) fs.writeFileSync(path.join(outputDir, `${entry.version}.sql`), entry.sql, 'utf8')
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ ...value.manifest, sourceRevision: head }, null, 2)}\n`, 'utf8')
  return { outputDir: path.relative(root, outputDir).replaceAll('\\', '/'), sourceRevision: head }
}

async function executePackage(value, config) {
  assertN1cOrgmasterTarget(process.env, null, config)
  if (process.env.DEV010_N1C_EXECUTION_ACK !== 'ORGMASTER_STAGING_MIGRATION') fail('DEV010_N1C_ORGMASTER_EXECUTION_ACK_REQUIRED')
  if (!/^[0-9a-f]{40}$/u.test(process.env.DEV010_N1C_SOURCE_REVISION ?? '')) fail('DEV010_N1C_ORGMASTER_SOURCE_REVISION_REQUIRED')
  const connectionString = process.env.ORGMASTER_POSTGRES_URL
  let connection
  if (connectionString) {
    connection = { connectionString }
  } else {
    const tokenResponse = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10_000) })
    if (!tokenResponse.ok) fail('DEV010_N1C_ORGMASTER_IAM_TOKEN_FAILED', String(tokenResponse.status))
    const token = await tokenResponse.json()
    if (typeof token.access_token !== 'string' || token.access_token.length < 20) fail('DEV010_N1C_ORGMASTER_IAM_TOKEN_FAILED')
    connection = {
      host: `/cloudsql/${config.target.connectionName}`,
      database: config.target.database,
      user: config.target.login,
      password: token.access_token,
      ssl: false,
    }
  }
  const client = new pg.Client({ ...connection, application_name: 'dev010-n1c-orgmaster-migrator', connectionTimeoutMillis: 10_000, query_timeout: 35_000, statement_timeout: 30_000 })
  await client.connect()
  try {
    const readback = (await client.query("SELECT current_database() AS database, current_user AS user, current_setting('server_version_num')::integer / 10000 AS \"postgresMajor\"")).rows[0]
    assertN1cOrgmasterTarget(process.env, readback, config)
    const dependency = (await client.query(`
      SELECT contract_id, contract_version, signature_sha256, payload_sha256
      FROM ai_pdm_contract.v_contract_manifest_v1
      WHERE contract_id = $1
    `, [config.migration.requiredDependency.contractId])).rows[0]
    const expectedDependency = config.migration.requiredDependency
    if (!dependency || dependency.contract_id !== expectedDependency.contractId || dependency.contract_version !== expectedDependency.contractVersion || dependency.signature_sha256 !== expectedDependency.signatureSha256 || dependency.payload_sha256 !== expectedDependency.payloadSha256) {
      fail('DEV010_N1C_ORGMASTER_DEPENDENCY_MISMATCH')
    }
    await client.query("SELECT pg_advisory_lock(hashtext('dev010-n1c-orgmaster'), hashtext(current_database()))")
    await client.query('SET ROLE jenfu_orgmaster_migrator')
    await client.query(`CREATE TABLE IF NOT EXISTS orgmaster_core.schema_migrations (
      version text PRIMARY KEY, name text NOT NULL, checksum_sha256 char(64) NOT NULL,
      source_revision text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT n1c_orgmaster_checksum_valid CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'))`)
    for (const entry of value.entries) {
      const existing = (await client.query('SELECT name, checksum_sha256, source_revision FROM orgmaster_core.schema_migrations WHERE version=$1', [entry.version])).rows[0]
      if (existing) {
        if (existing.name !== entry.name || existing.checksum_sha256 !== entry.outputSha256 || existing.source_revision !== process.env.DEV010_N1C_SOURCE_REVISION) fail('MIGRATION_CHECKSUM_MISMATCH', entry.version)
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(entry.sql)
        await client.query('INSERT INTO orgmaster_core.schema_migrations(version,name,checksum_sha256,source_revision) VALUES ($1,$2,$3,$4)', [entry.version, entry.name, entry.outputSha256, process.env.DEV010_N1C_SOURCE_REVISION])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('RESET ROLE').catch(() => undefined)
    await client.query("SELECT pg_advisory_unlock(hashtext('dev010-n1c-orgmaster'), hashtext(current_database()))").catch(() => undefined)
    await client.end()
  }
}

async function main() {
  const config = loadN1cOrgmasterConfig()
  const value = buildOrgmasterPackage(config)
  const args = process.argv.slice(2)
  if (args.includes('--execute')) {
    await executePackage(value, config)
    process.stdout.write(`${JSON.stringify({ entries: value.entries.length, manifestSha256: value.manifest.manifestSha256, status: 'PASS' })}\n`)
    return
  }
  const written = args.includes('--write') ? writePackage(value) : null
  process.stdout.write(`${JSON.stringify({ defaultMode: 'dry-run', entries: value.entries.length, manifestSha256: value.manifest.manifestSha256, output: written, status: 'PASS' })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 })
