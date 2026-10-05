#!/usr/bin/env node
import crypto from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TARGET, databaseOptions } from './dev040-production-migration-runner.mjs'
import {
  assertRunnerTarget, metadataAccessToken, parseGsUri, publishGcsJson,
  readGcsObject, sha256,
} from './lib/dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const JOB = 'orgmaster-prod-dev057-principal-pair-diagnostic'
const INPUT_PREFIX = 'source/migration-bundles/dev057/principal-pair-diagnostic'
const OUTPUT_PREFIX = 'receipts/releases/DEV057-PRINCIPAL-PAIR-DIAGNOSTIC'
const MAX_ROWS = 10000
const FIXTURE_ROW_LIMIT = 32
const FIXTURE_GRANT_LIMIT = 128
const FIXTURE_EMPLOYEES = new Set([
  '01a0c82b-11c6-77ab-887f-58df9d243e63',
  '01a0c82b-372c-7d20-ba3b-6e3b892d2f63',
])

function fail(code) { throw new Error(`DEV057_PAIR_DIAGNOSTIC_${code}`) }

export function pairHash(issuer, subject) {
  if (typeof issuer !== 'string' || typeof subject !== 'string' ||
      !issuer || !subject || issuer.includes('\0') || subject.includes('\0')) {
    fail('PAIR_INVALID')
  }
  return crypto.createHash('sha256').update(issuer).update(Buffer.from([0]))
    .update(subject).digest('hex')
}

export function parseArgs(argv) {
  const keys = ['--operation-ref', '--operation-sha256',
    '--source-revision', '--output-ref']
  if (!Array.isArray(argv) || argv.length !== 8 ||
      keys.some((key, index) => argv[index * 2] !== key ||
        typeof argv[index * 2 + 1] !== 'string')) fail('ARGUMENT_INVALID')
  const result = { operationRef: argv[1], operationSha256: argv[3],
    sourceRevision: argv[5], outputRef: argv[7] }
  if (!H64.test(result.operationSha256) || !H40.test(result.sourceRevision)) {
    fail('ARGUMENT_INVALID')
  }
  parseGsUri(result.operationRef, TARGET.releaseBucket, INPUT_PREFIX)
  parseGsUri(result.outputRef, TARGET.releaseBucket, OUTPUT_PREFIX)
  return result
}

export function assertOperation(value, bytes, args) {
  if (value?.schemaVersion === 'orgmaster.dev057-principal-pair-diagnostic-operation.v3') {
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== args.operationSha256 || value.sourceRevision !== args.sourceRevision) fail('OPERATION_INVALID')
    return assertPrincipalObservationOperation(value)
  }
  const employeeMode = value?.schemaVersion ===
    'orgmaster.dev057-principal-pair-diagnostic-operation.v2'
  const selector = employeeMode ? 'employeeIds' : 'pairHashes'
  const keys = ['applicationId', 'database', 'operationId', selector,
    'projectId', 'region', 'schemaVersion', 'sourceRevision']
  const values = value?.[selector]
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== args.operationSha256 ||
      !value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys.sort()) ||
      (!employeeMode && value.schemaVersion !== 'orgmaster.dev057-principal-pair-diagnostic-operation.v1') ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/u.test(value.operationId ?? '') ||
      value.sourceRevision !== args.sourceRevision ||
      value.projectId !== 'jenfu-platform-prod' || value.region !== 'asia-east1' ||
      value.database !== 'jenfu_prod' || value.applicationId !== 'ai-pdm' ||
      !Array.isArray(values) || values.length < 1 ||
      (employeeMode ? values.length !== FIXTURE_EMPLOYEES.size : values.length > 32) ||
      values.some((item) => employeeMode ? !FIXTURE_EMPLOYEES.has(item) : !H64.test(item)) ||
      values.some((item, index) => index > 0 && item <= values[index - 1])) {
    fail('OPERATION_INVALID')
  }
  return value
}

function selected(rows, hashes, shape) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail('SOURCE_UNBOUNDED')
  const selectedRows = new Map(hashes.map((hash) => [hash, []]))
  for (const row of rows) {
    if (!row.principal_issuer || !row.principal_subject) continue
    const hash = pairHash(row.principal_issuer, row.principal_subject)
    if (!selectedRows.has(hash)) continue
    const items = selectedRows.get(hash)
    if (items.length >= 4) fail('SOURCE_AMBIGUOUS')
    items.push(shape(row))
  }
  return selectedRows
}

export function summarizePairs(operation, { mappings, accounts, managed, governance,
  reservations, governanceHash, unboundManagedCount }) {
  if (!H64.test(governanceHash ?? '') ||
      !Number.isSafeInteger(unboundManagedCount) || unboundManagedCount < 0) {
    fail('SOURCE_INVALID')
  }
  const hashes = operation.pairHashes
  const mappingRows = selected(mappings, hashes, (row) => ({
    principalId: row.principal_id, employeeId: row.employee_id,
    employeeStatus: row.employee_status, mappingVersion: Number(row.mapping_version),
    publishedAt: new Date(row.published_at).toISOString(),
  }))
  const accountRows = selected(accounts, hashes, (row) => ({
    principalId: row.principal_id, employeeId: row.employee_id,
    employeeStatus: row.employee_status, accountType: row.account_type,
    mappingVersion: Number(row.mapping_version),
    publishedAt: new Date(row.published_at).toISOString(),
  }))
  const managedRows = selected(managed, hashes, (row) => ({
    principalId: row.principal_id, employeeId: row.employee_id,
    employeeStatus: row.employee_status, linkState: row.link_state,
    admissionRevision: row.admission_revision === null ? null :
      Number(row.admission_revision),
    directoryState: row.directory_state, freshness: row.freshness,
    pendingLifecycle: row.pending_lifecycle, admissionEnabled: row.admission_enabled,
  }))
  const governanceRows = selected(governance, hashes, (row) => ({
    principalId: row.principal_id, employeeId: row.employee_id,
    status: row.status, validFrom: row.valid_from, validTo: row.valid_to,
    accountTypes: row.account_types,
  }))
  const reservationRows = selected(reservations, hashes, (row) => ({
    employeeId: row.employee_id, sourceKind: row.source_kind,
  }))
  return {
    schemaVersion: 'orgmaster.dev057-principal-pair-diagnostic.v1',
    governanceHash, unboundManagedCount,
    pairs: hashes.map((hash) => ({
      pairHash: hash,
      canonicalMappings: mappingRows.get(hash),
      typedAccounts: accountRows.get(hash),
      managedIdentities: managedRows.get(hash),
      governanceLinks: governanceRows.get(hash),
      reservations: reservationRows.get(hash),
    })),
  }
}

function observedTimestamp(value) {
  if (value == null) return null
  if (!(value instanceof Date) && typeof value !== 'string') fail('TIMESTAMP_INVALID')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) fail('TIMESTAMP_INVALID')
  return date.toISOString()
}

/** Domain-keyed observation only. This report neither admits a login nor creates a grant. */
export function summarizeEmployees(operation, sources) {
  const ids = operation.employeeIds
  if (!Array.isArray(ids) || ids.length !== FIXTURE_EMPLOYEES.size ||
      ids.some((id) => !FIXTURE_EMPLOYEES.has(id)) ||
      ids.some((id, index) => index > 0 && id <= ids[index - 1])) fail('OPERATION_INVALID')
  for (const key of ['mappings', 'accounts', 'managed', 'governance', 'reservations',
    'ownership', 'grants']) {
    if (!Array.isArray(sources[key]) || sources[key].length >
        (key === 'grants' ? FIXTURE_GRANT_LIMIT : FIXTURE_ROW_LIMIT)) fail('SOURCE_UNBOUNDED')
  }
  const hashes = new Set()
  for (const rows of [sources.mappings, sources.accounts, sources.managed,
    sources.governance, sources.reservations]) {
    for (const row of rows.filter((item) => ids.includes(item.employee_id))) {
      if (row.principal_issuer == null && row.principal_subject == null) continue
      hashes.add(pairHash(row.principal_issuer, row.principal_subject))
    }
  }
  if (hashes.size > 32) fail('SOURCE_AMBIGUOUS')
  const paired = summarizePairs({ pairHashes: [...hashes].sort() }, sources)
  return {
    schemaVersion: 'orgmaster.dev057-principal-employee-diagnostic.v2',
    observationOnly: true, releaseAuthority: false,
    governanceHash: paired.governanceHash,
    employees: ids.map((employeeId) => ({
      employeeId,
      typedAccountCount: sources.accounts.filter((row) => row.employee_id === employeeId).length,
      missingOwnershipCount: sources.accounts.filter((row) => row.employee_id === employeeId &&
        !sources.ownership.some((owner) => owner.employee_id === employeeId &&
          owner.principal_id === row.principal_id && owner.account_type === row.account_type)).length,
      grantWithoutTypedOwnerCount: sources.grants.filter((grant) => grant.employee_id === employeeId &&
        !sources.accounts.some((account) => account.employee_id === employeeId &&
          account.principal_id === grant.principal_id && sources.ownership.some((owner) =>
            owner.employee_id === employeeId && owner.principal_id === account.principal_id &&
            owner.account_type === account.account_type))).length,
      managedIdentities: sources.managed.filter((row) => row.employee_id === employeeId)
        .map((row) => ({ principalId: row.principal_id, employeeStatus: row.employee_status,
          linkState: row.link_state, pairBound: row.principal_issuer != null && row.principal_subject != null,
          admissionRevision: row.admission_revision == null ? null : Number(row.admission_revision),
          directoryState: row.directory_state, freshness: row.freshness,
          pendingLifecycle: row.pending_lifecycle, admissionEnabled: row.admission_enabled })),
      ownershipReservations: sources.ownership.filter((row) => row.employee_id === employeeId)
        .map((row) => ({ principalId: row.principal_id, accountType: row.account_type })),
      effectiveGrants: sources.grants.filter((row) => row.employee_id === employeeId)
        .map((row) => ({ contractVersion: row.contract_version,
          assignmentVersionId: row.assignment_version_id, assignmentVersion: String(row.assignment_version),
          principalId: row.principal_id, assignmentId: row.assignment_id,
          grantKind: row.grant_kind, delegationId: row.delegation_id, stableRoleId: row.stable_role_id,
          roleCode: row.role_code, subjectKind: row.subject_kind, targetPrincipalId: row.target_principal_id,
          catalogVersion: row.catalog_version, scopeKind: row.scope_kind, scopeKey: row.scope_key,
          validFrom: observedTimestamp(row.valid_from), validUntil: observedTimestamp(row.valid_until),
          publishedAt: observedTimestamp(row.published_at) })),
    })),
    pairs: paired.pairs,
  }
}


const FORMAL_PRINCIPAL = 'principal-firebase-b71682bf0d7cc5596b48dfad991e4096'
const FORMAL_EMPLOYEE = 'employee-shijie'
function assertPrincipalObservationOperation(value) {
  const keys = ['applicationId','database','employeeId','operationId','principalId',
    'projectId','region','schemaVersion','sourceRevision']
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys.sort()) ||
    value.principalId !== FORMAL_PRINCIPAL || value.employeeId !== FORMAL_EMPLOYEE ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/u.test(value.operationId ?? '') ||
    !H40.test(value.sourceRevision ?? '') || value.projectId !== 'jenfu-platform-prod' ||
    value.region !== 'asia-east1' || value.database !== 'jenfu_prod' ||
    value.applicationId !== 'ai-pdm') fail('OPERATION_INVALID')
  return value
}

/** Exact Principal observation only; it cannot bind identity, assign a role or activate traffic. */
export function summarizePrincipalObservation(operation, { accounts, grants, catalogs, observedAt }) {
  assertPrincipalObservationOperation(operation)
  if (!Array.isArray(accounts) || !Array.isArray(grants) || !Array.isArray(catalogs) ||
    (accounts.length < 1 || accounts.length > 2) || grants.length !== 1 || catalogs.length !== 1) fail('SOURCE_AMBIGUOUS')
  const account = accounts[0], grant = grants[0], catalog = catalogs[0]
  if (accounts.some(row => row.principal_id !== FORMAL_PRINCIPAL || row.employee_id !== FORMAL_EMPLOYEE ||
    row.employee_status !== 'active' || row.account_type !== 'human_privileged' ||
    !Number.isSafeInteger(Number(row.mapping_version)) || Number(row.mapping_version) < 1 || !observedTimestamp(row.published_at))) fail('SOURCE_INVALID')
  const at = observedTimestamp(observedAt), from = observedTimestamp(grant.valid_from),
    until = observedTimestamp(grant.valid_until), publishedAt = observedTimestamp(grant.published_at)
  if (account.principal_id !== FORMAL_PRINCIPAL || account.employee_id !== FORMAL_EMPLOYEE ||
    account.employee_status !== 'active' || account.account_type !== 'human_privileged' ||
    !Number.isSafeInteger(Number(account.mapping_version)) || Number(account.mapping_version) < 1 ||
    grant.contract_version !== 'jenfu.orgmaster.ai-pdm-principal-grants.v4' ||
    grant.principal_id !== FORMAL_PRINCIPAL || grant.employee_id !== FORMAL_EMPLOYEE ||
    grant.subject_kind !== 'principal' || grant.target_principal_id !== FORMAL_PRINCIPAL ||
    grant.stable_role_id !== 'role-system-admin' || grant.role_code !== 'system_admin' ||
    grant.grant_kind !== 'direct' || grant.delegation_id !== null ||
    grant.scope_kind !== 'global' || grant.scope_key !== null ||
    !at || !from || Date.parse(from) > Date.parse(at) ||
    (until !== null && Date.parse(until) <= Date.parse(at)) || !publishedAt ||
    !grant.assignment_id || !grant.assignment_version_id ||
    !/^[1-9][0-9]*$/u.test(String(grant.assignment_version)) ||
    !H64.test(catalog.catalog_sha256 ?? '') ||
    catalog.catalog_sha256 !== ({ 'ai-pdm.role-catalog.2026-09-28.v5': '4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197',
      'ai-pdm.role-catalog.2026-10-05.v6': 'bdc8d2b8f717e4af9d48cf882d1a564a5caaabaaaacdcf20bc5db36a5b6960af' })[catalog.catalog_version] ||
    !['ai-pdm.role-catalog.2026-09-28.v5','ai-pdm.role-catalog.2026-10-05.v6'].includes(catalog.catalog_version)) fail('SOURCE_INVALID')
  return {
    schemaVersion: 'orgmaster.dev057-principal-grant-diagnostic.v3',
    observationOnly: true, releaseAuthority: false, observedAt: at,
    principalId: FORMAL_PRINCIPAL, employeeId: FORMAL_EMPLOYEE,
    accountType: account.account_type, employeeStatus: account.employee_status,
    typedAccountRowCount: accounts.length, mappingVersions: [...new Set(accounts.map(row => Number(row.mapping_version)))].sort((a,b) => a-b),
    accountPublishedAt: [...new Set(accounts.map(row => observedTimestamp(row.published_at)))].sort(),
    activeCatalogVersion: catalog.catalog_version, activeCatalogSha256: catalog.catalog_sha256,
    grant: { contractVersion: grant.contract_version, assignmentId: grant.assignment_id,
      assignmentVersionId: grant.assignment_version_id, assignmentVersion: String(grant.assignment_version),
      stableRoleId: grant.stable_role_id, roleCode: grant.role_code, grantKind: grant.grant_kind,
      subjectKind: grant.subject_kind, targetPrincipalId: grant.target_principal_id,
      catalogVersion: grant.catalog_version, scopeKind: grant.scope_kind, scopeKey: grant.scope_key,
      delegationId: null, validFrom: from, validUntil: until, publishedAt },
  }
}

async function readPrincipalObservation(database, operation) {
  assertPrincipalObservationOperation(operation)
  const values = [operation.principalId, operation.employeeId]
  const accounts = await database.query(
    'SELECT principal_id,employee_id,employee_status,account_type,mapping_version,published_at '+
    'FROM orgmaster_contract.v_active_principal_accounts_v1 '+
    'WHERE principal_id=$1 AND employee_id=$2 FETCH FIRST 3 ROWS ONLY', values)
  const grants = await database.query(
    'SELECT contract_version,assignment_version_id,assignment_version,principal_id,employee_id,'+
    'assignment_id,grant_kind,delegation_id,stable_role_id,role_code,catalog_version,'+
    'subject_kind,target_principal_id,scope_kind,scope_key,valid_from,valid_until,published_at '+
    'FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 '+
    "WHERE principal_id=$1 AND employee_id=$2 AND stable_role_id='role-system-admin' FETCH FIRST 3 ROWS ONLY", values)
  const catalogs = await database.query(
    'SELECT DISTINCT catalog_version,catalog_sha256 FROM ai_pdm_contract.v_application_role_catalog_v1 FETCH FIRST 3 ROWS ONLY')
  const clock = await database.query('SELECT transaction_timestamp() AS observed_at')
  return summarizePrincipalObservation(operation, { accounts: accounts.rows, grants: grants.rows,
    catalogs: catalogs.rows, observedAt: clock.rows?.[0]?.observed_at })
}

function governanceLinks(document) {
  const version = document.publishedVersions?.find(
    (item) => item.id === document.activePolicyVersionId)
  if (!version || version.kind !== 'assignment-governance-v3' ||
      !Array.isArray(version.policy?.identityLinks) ||
      !Array.isArray(version.policy?.principalAdmissions)) fail('GOVERNANCE_INVALID')
  return version.policy.identityLinks.map((link) => ({
    principal_issuer: link.issuer, principal_subject: link.subject,
    principal_id: link.principalId, employee_id: link.employeeId,
    status: link.status,
    valid_from: link.validFrom, valid_to: link.validTo,
    account_types: version.policy.principalAdmissions
      .filter((admission) => admission.identityLinkId === link.id &&
        admission.status === 'active')
      .map((admission) => admission.accountType).sort(),
  }))
}

export async function readDiagnosticSnapshot(database, operation) {
  try {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    await database.query("SET LOCAL statement_timeout = '10s'")
    if (operation.schemaVersion === 'orgmaster.dev057-principal-pair-diagnostic-operation.v3') {
      const result = await readPrincipalObservation(database, operation)
      await database.query('COMMIT')
      return result
    }
    const rowLimit = (operation.employeeIds ? FIXTURE_ROW_LIMIT : MAX_ROWS) + 1
    const employeeWhere = operation.employeeIds ? 'WHERE employee_id = ANY($1::text[])' : ''
    const queryValues = operation.employeeIds ? [operation.employeeIds] : []
    const mappings = await database.query(`SELECT principal_issuer,principal_subject,principal_id,
        employee_id,employee_status,mapping_version,published_at
        FROM orgmaster_contract.v_active_principal_mappings_v1
        ${employeeWhere}
        FETCH FIRST ${rowLimit} ROWS ONLY`, queryValues)
    const accounts = await database.query(`SELECT principal_issuer,principal_subject,principal_id,
        employee_id,employee_status,account_type,mapping_version,published_at
        FROM orgmaster_contract.v_active_principal_accounts_v1
        ${employeeWhere}
        FETCH FIRST ${rowLimit} ROWS ONLY`, queryValues)
    const managed = await database.query(`SELECT identity.auth_issuer AS principal_issuer,
        identity.auth_subject AS principal_subject,identity.principal_id,
        identity.employee_id,identity.link_state,identity.admission_revision,
        observation.directory_state,observation.freshness,
        employee.employee_status,
        EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
          WHERE lifecycle.employee_id=identity.employee_id
            AND lifecycle.status <> 'completed') AS pending_lifecycle,
        EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
          WHERE authority.singleton=true AND authority.admission_enabled) AS admission_enabled
        FROM orgmaster_core.managed_daily_identities identity
        LEFT JOIN orgmaster_core.managed_identity_observations observation
          ON observation.identity_record_id=identity.identity_record_id
        LEFT JOIN orgmaster_core.v_current_workspace_employees_v1 employee
          ON employee.employee_id=identity.employee_id
        ${operation.employeeIds ? 'WHERE identity.employee_id = ANY($1::text[])' : 'WHERE identity.auth_issuer IS NOT NULL AND identity.auth_subject IS NOT NULL'}
        FETCH FIRST ${rowLimit} ROWS ONLY`, queryValues)
    const reservations = await database.query(`SELECT principal_issuer,
        principal_subject,employee_id,source_kind
        FROM orgmaster_core.principal_identity_reservations
        ${employeeWhere}
        FETCH FIRST ${rowLimit} ROWS ONLY`, queryValues)
    const governance = await database.query(
      'SELECT payload,source_sha256 FROM orgmaster_core.read_active_persistence_artifact_v1($1)',
      ['orgmaster-governance.v3.json'])
    const unbound = await database.query(`SELECT count(*)::integer AS total
        FROM orgmaster_core.managed_daily_identities
        WHERE auth_issuer IS NULL AND auth_subject IS NULL
          ${operation.employeeIds ? 'AND employee_id = ANY($1::text[])' : ''}`, queryValues)
    if (governance.rows.length !== 1 || unbound.rows.length !== 1) {
      fail('GOVERNANCE_INVALID')
    }
    const ownership = operation.employeeIds ? await database.query(`
      SELECT principal_id,employee_id,account_type
        FROM orgmaster_core.principal_ownership_reservations
       WHERE employee_id = ANY($1::text[])
       FETCH FIRST ${rowLimit} ROWS ONLY`, [operation.employeeIds]) : { rows: [] }
    const grants = operation.employeeIds ? await database.query(`
      SELECT contract_version,assignment_version_id,assignment_version,principal_id,employee_id,
             assignment_id,grant_kind,delegation_id,stable_role_id,role_code,catalog_version,
             subject_kind,target_principal_id,scope_kind,scope_key,valid_from,valid_until,published_at
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
       WHERE employee_id = ANY($1::text[])
       FETCH FIRST ${FIXTURE_GRANT_LIMIT + 1} ROWS ONLY`, [operation.employeeIds]) : { rows: [] }
    const summarize = operation.employeeIds ? summarizeEmployees : summarizePairs
    const outcome = summarize(operation, {
      ownership: ownership.rows, grants: grants.rows,
      mappings: mappings.rows, accounts: accounts.rows, managed: managed.rows,
      reservations: reservations.rows,
      governance: governanceLinks(governance.rows[0].payload)
        .filter((row) => !operation.employeeIds || operation.employeeIds.includes(row.employee_id)),
      governanceHash: governance.rows[0].source_sha256,
      unboundManagedCount: unbound.rows[0].total,
    })
    await database.query('COMMIT')
    return outcome
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env,
  fetchImpl = fetch, Client = pg.Client } = {}) {
  const args = parseArgs(argv)
  const target = assertRunnerTarget(environment, { ...TARGET, job: JOB })
  if (environment.SOURCE_REVISION !== args.sourceRevision) fail('IMAGE_SOURCE_MISMATCH')
  const token = await metadataAccessToken(fetchImpl)
  const object = await readGcsObject({ uri: args.operationRef,
    expectedBucket: TARGET.releaseBucket, expectedPrefix: INPUT_PREFIX,
    token, fetchImpl })
  let raw
  try { raw = JSON.parse(object.bytes.toString('utf8')) }
  catch { fail('OPERATION_JSON_INVALID') }
  const operation = assertOperation(raw, object.bytes, args)
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const outcome = await readDiagnosticSnapshot(database, operation)
    const receipt = {
      schemaVersion: operation.schemaVersion === 'orgmaster.dev057-principal-pair-diagnostic-operation.v3' ? 'orgmaster.dev057-principal-grant-diagnostic-receipt.v3' : operation.employeeIds ? 'orgmaster.dev057-principal-employee-diagnostic-receipt.v2' :
        'orgmaster.dev057-principal-pair-diagnostic-receipt.v1',
      operationId: operation.operationId, sourceRevision: args.sourceRevision,
      operationRef: args.operationRef, operationSha256: args.operationSha256,
      operationGeneration: object.generation, target, outcome,
    }
    const published = await publishGcsJson({ uri: args.outputRef,
      expectedBucket: TARGET.releaseBucket, expectedPrefix: OUTPUT_PREFIX,
      value: receipt, token, fetchImpl })
    return { outputRef: args.outputRef, outputGeneration: published.generation,
      outputSha256: published.sha256, pairCount: outcome.pairs?.length ?? 0,
      ...(operation.employeeIds ? { employeeCount: outcome.employees.length, observationOnly: true } : {}),
      ...(operation.principalId ? { principalCount: 1, observationOnly: true } : {}),
      sourceRevision: args.sourceRevision }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
