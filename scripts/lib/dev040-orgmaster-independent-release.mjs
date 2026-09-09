import { createHash } from 'node:crypto'
import { createMigrationBundle } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/
const H64 = /^[a-f0-9]{64}$/
const V3_CONTRACT_SHA256 = 'd88b9aaa8a5e27082746221fc5b473abd8a78da712409279baf5ecdb0e176f05'
const REQUIRED_PLAIN_ENV = [
  'ORGMASTER_PERSISTENCE_MODE', 'ORGMASTER_PUBLIC_BASE_URL',
  'ORGMASTER_POSTGRES_POOL_MAX', 'ORGMASTER_POSTGRES_CONNECTION_TIMEOUT_MS',
  'ORGMASTER_POSTGRES_IDLE_TIMEOUT_MS', 'ORGMASTER_POSTGRES_STATEMENT_TIMEOUT_MS', 'ORGMASTER_POSTGRES_QUERY_TIMEOUT_MS',
  'JENFU_FIREBASE_PROJECT_ID', 'JENFU_IDENTITY_ISSUER', 'JENFU_IDENTITY_AUDIENCE',
  'VITE_JENFU_FIREBASE_API_KEY', 'VITE_JENFU_FIREBASE_AUTH_DOMAIN',
  'VITE_JENFU_FIREBASE_PROJECT_ID', 'VITE_JENFU_FIREBASE_APP_ID',
]
const REQUIRED_SECRET_ENV = ['ORGMASTER_POSTGRES_URL', 'ORGMASTER_SESSION_HASH_PEPPER']

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function sourceSha256(bytes) {
  return createHash('sha256').update(Buffer.isBuffer(bytes) ? bytes.toString('utf8').replace(/\r\n/gu, '\n') : String(bytes).replace(/\r\n/gu, '\n')).digest('hex')
}

export function assertDev040ReleaseIntent(value, profile) {
  const expected = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt'].sort()
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected) || value.schemaVersion !== profile.schemas.releaseIntent || value.ownerApplicationId !== 'orgmaster' || !/^[A-Z0-9][A-Z0-9-]{5,63}$/.test(value.releaseId ?? '') || !H40.test(value.sourceRevision ?? '') || !H64.test(value.sourceSha256 ?? '') || !H64.test(value.migrationManifestSha256 ?? '') || !value.previousRevision || value.previousRevision === 'latest' || !Number.isFinite(Date.parse(value.deadlineAt))) fail('RELEASE_INTENT_INVALID')
  for (const name of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) if (!new RegExp(`^gs://${profile.artifact.releaseBucket}/receipts/[A-Za-z0-9._/-]+\\.json$`).test(value[name]?.uri ?? '') || !H64.test(value[name]?.sha256 ?? '') || JSON.stringify(Object.keys(value[name] ?? {}).sort()) !== JSON.stringify(['sha256', 'uri'])) fail('RELEASE_INTENT_REF_INVALID', name)
  return value
}

export function assertDev040V3Profile(profile, n1c) {
  if (profile?.schemaVersion !== 'jenfu.dev040.orgmaster-continuous-release.v3' || profile.profileVersion !== 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP' || profile.contractSha256 !== V3_CONTRACT_SHA256) fail('UNSUPPORTED_PROFILE')
  if (profile.application?.id !== 'orgmaster' || profile.application?.repository !== 'jedchang0308-jenfu/OrgMaster' || profile.application?.branch !== 'master') fail('SOURCE_SCOPE_MISMATCH')
  const target = profile.target || {}
  if (target.projectId !== 'jenfu-platform-prod' || target.projectNumber !== '9536592944' || target.region !== 'asia-east1' || target.serviceName !== 'orgmaster-prod' || target.canonicalOrigin !== 'https://orgmaster-prod-9536592944.asia-east1.run.app' || target.databaseInstance !== 'jenfu-platform-prod-pg' || target.database !== 'jenfu_prod' || JSON.stringify(target.entryPolicy) !== JSON.stringify({ ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true })) fail('TARGET_MISMATCH')
  const runtime = profile.runtime || {}
  if (runtime.containerName !== 'orgmaster' || runtime.cpu !== '1' || runtime.memory !== '512Mi' || runtime.port !== 8080 || runtime.concurrency !== 20 || runtime.timeoutSeconds !== 60 || runtime.maxInstances !== 1 || runtime.poolMax !== 6 || runtime.startupProbePath !== '/api/auth/mode' || runtime.cloudSqlConnectionName !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' || runtime.cloudSqlProxyContainer !== 'cloud-sql-proxy' || runtime.cloudSqlProxyImage !== 'gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f' || runtime.cloudSqlProxyPort !== 5432 || runtime.cloudSqlProxyMaximumConnections !== 24 || runtime.network !== 'jenfu-platform-prod-vpc' || runtime.subnet !== 'jenfu-platform-prod-runtime' || profile.artifact?.releaseBucket !== 'jenfu-platform-prod-orgmaster-release' || profile.state?.backendKey !== 'dev-040-r2/production-release/default.tfstate') fail('RUNTIME_OR_STATE_MISMATCH')
  if (profile.identities?.smoke !== 'orgmaster-prod-smoke@jenfu-platform-prod.iam.gserviceaccount.com') fail('RUNTIME_OR_STATE_MISMATCH')
  if (profile.schemas?.releaseIntent !== 'jenfu.dev040.orgmaster-release-intent.v2' || profile.schemas?.deploymentCapsule !== 'jenfu.dev040.orgmaster-deployment-capsule.v2') fail('SCHEMA_PROFILE_MISMATCH')
  if (profile.workflow?.onlyInput !== 'releaseCapsuleRef' || profile.workflow?.concurrency !== 'production-release-orgmaster-prod') fail('WORKFLOW_CONTRACT_MISMATCH')
  if (JSON.stringify(profile.workflow.jobs) !== JSON.stringify(['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'])) fail('WORKFLOW_CONTRACT_MISMATCH')
  if (profile.artifact?.migrationRunnerUri !== 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-migration-runner' || profile.artifact?.migrationBundlePrefix !== 'source/migration-bundles') fail('MIGRATION_ARTIFACT_MISMATCH')
  if (profile.build?.dockerBuilderImage !== 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c' || profile.build?.dockerfile !== 'Dockerfile' || profile.build?.dockerTarget !== 'runner' || profile.build?.sourceArchiveFormat !== 'tar.gz' || profile.build?.requestedVerifyOption !== 'VERIFIED' || profile.build?.maximumAllowedSeverity !== 'MEDIUM' || !Number.isFinite(Date.parse(profile.build?.builderDigestObservedAt))) fail('BUILD_PROFILE_MISMATCH')
  if (profile.verification?.refreshTokenEnvironmentName !== 'DEV012_ORGMASTER_FIREBASE_REFRESH_TOKEN' || profile.verification?.firebaseApiKeyEnvironmentName !== 'DEV012_ORGMASTER_FIREBASE_API_KEY' || profile.verification?.authModePath !== '/api/auth/mode' || profile.verification?.sessionPath !== '/api/auth/firebase/session' || profile.verification?.mePath !== '/api/auth/me' || profile.verification?.logoutPath !== '/api/auth/logout' || profile.verification?.authenticatedProbes?.length !== 1 || profile.verification?.negativeProbes?.length !== 1) fail('VERIFICATION_PROFILE_MISMATCH')
  if (profile.verification?.candidateSmokeMode !== 'WORKFLOWS_INTERNAL_OIDC_V1' || profile.verification?.candidateWorkflowName !== 'orgmaster-prod-candidate-smoke' || profile.verification?.candidateRefreshTokenSecretId !== 'orgmaster-prod-smoke-firebase-refresh-token') fail('VERIFICATION_PROFILE_MISMATCH')
  if (profile.incidentRuntime?.controllerAudience !== 'https://release-controller.jenfu.internal/orgmaster' || profile.incidentRuntime?.githubReadTokenSecretId !== 'orgmaster-prod-controller-github-read-token' || profile.incidentRuntime?.numericSecretVersionRequired !== true || profile.incidentRuntime?.activeControlObject !== 'control/active.json') fail('INCIDENT_RUNTIME_PROFILE_MISMATCH')
  if (profile.migrations?.jobName !== 'orgmaster-prod-migration-runner' || profile.migrations?.serviceAccount !== 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com') fail('MIGRATION_JOB_MISMATCH')
  if (profile.productionData?.required !== true || profile.productionData?.packageSchema !== 'jenfu.dev012.orgmaster-production-data-package.v1' || profile.productionData?.bootstrapSchema !== 'jenfu.dev012.orgmaster-first-principal-bootstrap.v1' || profile.productionData?.dataObjectPrefix !== 'source/production-data' || profile.productionData?.bootstrapObjectPrefix !== 'receipts/releases' || profile.productionData?.sourceRepository !== 'jedchang0308-jenfu/OrgMaster' || profile.productionData?.preferenceDisposition !== 'EXCLUDED_UNATTRIBUTABLE_PRINCIPAL') fail('PRODUCTION_DATA_PROFILE_MISMATCH')
  if (JSON.stringify([...profile.environment.requiredPlainEnvironmentNames].sort()) !== JSON.stringify([...REQUIRED_PLAIN_ENV].sort())
    || JSON.stringify([...profile.environment.requiredSecretNames].sort()) !== JSON.stringify([...REQUIRED_SECRET_ENV].sort())) fail('ENVIRONMENT_SET_DRIFT')
  const fixed = profile.environment.fixedValues || {}
  if (fixed.ORGMASTER_PERSISTENCE_MODE !== 'cloud-sql' || fixed.ORGMASTER_PUBLIC_BASE_URL !== target.canonicalOrigin || fixed.ORGMASTER_POSTGRES_POOL_MAX !== '6' || fixed.ORGMASTER_POSTGRES_QUERY_TIMEOUT_MS !== '35000' || profile.environment.candidateOriginEnvironmentName !== 'ORGMASTER_RELEASE_CANDIDATE_ORIGIN') fail('ENVIRONMENT_VALUE_DRIFT')
  if (profile.environment.allowedSecretIds?.ORGMASTER_POSTGRES_URL !== 'orgmaster-prod-postgres-url' || profile.environment.allowedSecretIds?.ORGMASTER_SESSION_HASH_PEPPER !== 'orgmaster-prod-session-pepper' || profile.environment.numericVersionsRequired !== true) fail('SECRET_BOUNDARY_DRIFT')
  const order = profile.migrations?.entries?.map((entry) => entry.path)
  if (profile.migrations?.ledger !== 'orgmaster_core.schema_migrations' || profile.migrations?.baselineCount !== 10 || order?.length !== 11 || JSON.stringify(order.slice(0, 10)) !== JSON.stringify(n1c.migration.order) || order[10] !== 'db/migrations/011_dev046_workbench_list_width_preferences.sql') fail('MIGRATION_MANIFEST_DRIFT')
  if (profile.migrations.entries.some((entry, index) => entry.order !== index + 1 || !H64.test(entry.sourceSha256) || !H64.test(entry.appliedSha256))) fail('MIGRATION_MANIFEST_DRIFT')
  if (Object.values(profile.sideEffects || {}).some((value) => value !== 'DISABLED')) fail('SIDE_EFFECT_ENABLED')
  if (profile.operations?.CONFIGURE_ENTRYPOINT !== 'run.projects.locations.services.patch?updateMask=ingress,defaultUriDisabled,invokerIamDisabled') fail('ENTRYPOINT_OPERATION_MISSING')
  if (JSON.stringify(profile.edge) !== JSON.stringify({ servingDependency: false, rollbackDependency: false, ordinaryReleaseMutations: 0, disposition: 'RETAINED_UNUSED_EDGE' })) fail('EDGE_BOUNDARY_DRIFT')
  return profile
}

export function verifyDev040MigrationBytes(profile, files) {
  if (!(files instanceof Map) || files.size !== 11) fail('MIGRATION_SET_DRIFT')
  for (const entry of profile.migrations.entries) {
    if (!files.has(entry.path) || sourceSha256(files.get(entry.path)) !== entry.sourceSha256) fail('MIGRATION_CHECKSUM_MISMATCH', entry.path)
  }
  return true
}

export function assertDev040WorkflowSource(source) {
  const inputBlock = source.match(/workflow_dispatch:[^\S\r\n]*\r?\n\s*inputs:[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\s*concurrency:/)?.[1] || ''
  const keys = [...inputBlock.matchAll(/^\s{6}([A-Za-z0-9_-]+):/gm)].map((match) => match[1])
  if (JSON.stringify(keys) !== JSON.stringify(['releaseCapsuleRef'])) fail('WORKFLOW_INPUT_DRIFT')
  for (const forbidden of ['product_owner_decision:', 'artifact_receipt_ref:', 'candidate_receipt_ref:', 'stage:', 'approve:', 'skip:']) if (source.includes(forbidden)) fail('HISTORICAL_INPUT_ACTIVE', forbidden)
  if (!source.includes('group: production-release-orgmaster-prod')) fail('WORKFLOW_CONCURRENCY_DRIFT')
  for (const job of ['prepare:', 'build:', 'migrate:', 'candidate:', 'entrypoint:', 'verify:', 'decision:', 'activate:', 'canonical:', 'finalize:', 'failure:']) if (!source.includes(`\n  ${job}`)) fail('WORKFLOW_JOB_MISSING', job)
  if (/CAPSULE_PROVIDER_FETCH_REQUIRED|run:\s*echo\s/iu.test(source)) fail('PROVIDER_PLACEHOLDER_ACTIVE')
  if ((source.match(/^    environment: production$/gmu) ?? []).length !== 11 || (source.match(/DEV012_ORGMASTER_FIREBASE_REFRESH_TOKEN:/gu) ?? []).length !== 1 || (source.match(/DEV012_ORGMASTER_FIREBASE_API_KEY:/gu) ?? []).length !== 2 || source.includes('DEV012_ORGMASTER_FIREBASE_ID_TOKEN')) fail('WORKFLOW_AUTH_PREFLIGHT_DRIFT')
  for (const block of source.split(/^  (?=[a-z][a-z-]+:)/gmu).filter((value) => value.includes('google-github-actions/auth@v3'))) if (block.indexOf('actions/checkout@v4') < 0 || block.indexOf('actions/checkout@v4') > block.indexOf('google-github-actions/auth@v3')) fail('WORKFLOW_AUTH_ORDER_DRIFT')
  if (/\.\.\/Jenlkbz|\.\.\/Jenfu-Platform|\.\.\/AI_PDM|checkout[^\n]+repository:/i.test(source)) fail('SIBLING_CHECKOUT_DENIED')
  return true
}

export function buildDev040Mutation({ operation, service, updateMask, revision, trafficPercent, etag }) {
  if (service !== 'orgmaster-prod' || !etag || revision === 'latest' || (operation !== 'CONFIGURE_ENTRYPOINT' && !revision)) fail('TARGET_MISMATCH')
  if (operation === 'CREATE_CANDIDATE' && (updateMask !== 'template' || trafficPercent !== 0)) fail('MIXED_MUTATION_MASK')
  if (operation === 'CONFIGURE_ENTRYPOINT' && (updateMask !== 'ingress,defaultUriDisabled,invokerIamDisabled' || revision != null || trafficPercent != null)) fail('MIXED_MUTATION_MASK')
  if (['ACTIVATE', 'ROLLBACK'].includes(operation) && updateMask !== 'traffic') fail('MIXED_MUTATION_MASK')
  return { operation, service, updateMask, revision, trafficPercent, etag }
}

export function buildDev040CandidateTag({ service, revision, tag, beforeTraffic, etag }) {
  if (service !== 'orgmaster-prod' || !/^orgmaster-prod-[a-z0-9-]+$/.test(revision || '') || !/^candidate-[a-f0-9]{12}$/.test(tag || '') || !etag || !Array.isArray(beforeTraffic) || beforeTraffic.some((row) => row.latestRevision === true || row.tag)) fail('CANDIDATE_TAG_INVALID')
  return { operation: 'TAG_CANDIDATE', service, updateMask: 'traffic', etag, traffic: [...beforeTraffic, { revision, percent: 0, tag, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }] }
}

export function assertN1cLedgerBaseline(profile, rows) {
  if (!Array.isArray(rows)) fail('LEDGER_READBACK_INVALID')
  const byVersion = new Map(rows.map((row) => [row.version, row]))
  for (const entry of profile.migrations.entries.slice(0, profile.migrations.baselineCount)) {
    const row = byVersion.get(entry.version)
    if (!row || (row.checksum_sha256 ?? row.checksumSha256) !== entry.appliedSha256) fail('N1C_LEDGER_BASELINE_MISMATCH', entry.version)
  }
  return true
}

export function buildDev040MigrationPlan(profile, files, ledgerRows) {
  verifyDev040MigrationBytes(profile, files)
  assertN1cLedgerBaseline(profile, ledgerRows)
  const entry = profile.migrations.entries[10]
  const row = ledgerRows.find((item) => item.version === entry.version)
  if (!row) return { status: 'PENDING', entry }
  if ((row.checksum_sha256 ?? row.checksumSha256) !== entry.appliedSha256) fail('MIGRATION_CHECKSUM_MISMATCH', entry.version)
  return { status: 'REPLAY', entry }
}

export function unwrapMigrationTransaction(bytes) {
  const normalized = Buffer.isBuffer(bytes) ? bytes.toString('utf8').replace(/\r\n/gu, '\n') : String(bytes).replace(/\r\n/gu, '\n')
  const beginCount = normalized.match(/^BEGIN;\s*$/gmu)?.length ?? 0
  const commitCount = normalized.match(/^COMMIT;\s*$/gmu)?.length ?? 0
  const envelope = /^(?<leading>(?:(?:--[^\n]*)?\n)*)BEGIN;\s*\n(?<body>[\s\S]*?)\nCOMMIT;\s*$/u.exec(normalized)
  if (!envelope || beginCount !== 1 || commitCount !== 1) fail('MIGRATION_TRANSACTION_SHAPE_MISMATCH')
  return `${envelope.groups?.leading ?? ''}${envelope.groups?.body ?? ''}\n`
}

export function buildDev040MigrationBundle(profile, n1cPackage, files, sourceRevision) {
  verifyDev040MigrationBytes(profile, files)
  if (!Array.isArray(n1cPackage?.entries) || n1cPackage.entries.length !== profile.migrations.baselineCount) fail('MIGRATION_PACKAGE_INVALID')
  const entries = profile.migrations.entries.map((authority, index) => {
    if (index < profile.migrations.baselineCount) {
      const item = n1cPackage.entries[index]
      if (item.sourcePath !== authority.path || item.sourceSha256 !== authority.sourceSha256 || item.outputSha256 !== authority.appliedSha256 || sourceSha256(item.sql) !== authority.appliedSha256) fail('MIGRATION_PACKAGE_INVALID', authority.path)
      return { order: authority.order, version: authority.version, name: item.name, path: authority.path, sourceSha256: authority.sourceSha256, appliedSha256: authority.appliedSha256, sqlBase64: Buffer.from(item.sql, 'utf8').toString('base64') }
    }
    const sql = unwrapMigrationTransaction(files.get(authority.path))
    if (sourceSha256(sql) !== authority.appliedSha256) fail('MIGRATION_PACKAGE_INVALID', authority.path)
    return { order: authority.order, version: authority.version, name: authority.path.split('/').at(-1).replace(/^\d{3}_/u, '').replace(/\.sql$/u, ''), path: authority.path, sourceSha256: authority.sourceSha256, appliedSha256: authority.appliedSha256, sqlBase64: Buffer.from(sql, 'utf8').toString('base64') }
  })
  return createMigrationBundle({ target: { ownerApplicationId: 'orgmaster', ledger: profile.migrations.ledger, baselineCount: profile.migrations.baselineCount }, sourceRevision, entries })
}
