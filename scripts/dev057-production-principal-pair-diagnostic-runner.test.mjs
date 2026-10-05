import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertOperation, pairHash, parseArgs, summarizePairs, summarizeEmployees, summarizePrincipalObservation, readDiagnosticSnapshot, runMain,
} from './dev057-production-principal-pair-diagnostic-runner.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRevision = 'a'.repeat(40)
const input = 'gs://jenfu-platform-prod-orgmaster-release/source/migration-bundles/dev057/principal-pair-diagnostic/one.json'
const output = 'gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-PRINCIPAL-PAIR-DIAGNOSTIC/one.json'
const hash = pairHash('issuer', 'subject')
const operation = { schemaVersion: 'orgmaster.dev057-principal-pair-diagnostic-operation.v1',
  operationId: 'dev057-principal-pair-one', sourceRevision,
  projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod',
  applicationId: 'ai-pdm', pairHashes: [hash] }

test('diagnostic input is exact-target and content bound', () => {
  const bytes = Buffer.from(JSON.stringify(operation))
  const args = parseArgs(['--operation-ref', input, '--operation-sha256',
    crypto.createHash('sha256').update(bytes).digest('hex'),
    '--source-revision', sourceRevision, '--output-ref', output])
  assert.deepEqual(assertOperation(operation, bytes, args), operation)
  assert.throws(() => parseArgs(['--operation-ref', input.replace('source/migration-bundles', 'source/production-data'),
    '--operation-sha256', args.operationSha256, '--source-revision', sourceRevision,
    '--output-ref', output]), /INVALID|PREFIX/u)
  assert.throws(() => assertOperation({ ...operation, pairHashes: [hash, hash] }, bytes, args))
  assert.throws(() => assertOperation({ ...operation, employeeId: 'employee-other' }, bytes, args))
  assert.throws(() => assertOperation(operation, Buffer.from('changed'), args))
})

test('same snapshot distinguishes missing, reserved and managed pending pairs', () => {
  const row = { principal_issuer: 'issuer', principal_subject: 'subject' }
  const empty = summarizePairs(operation, { mappings: [], accounts: [], managed: [],
    governance: [], reservations: [], governanceHash: 'b'.repeat(64),
    unboundManagedCount: 0 })
  assert.deepEqual(empty.pairs[0].canonicalMappings, [])
  assert.deepEqual(empty.pairs[0].reservations, [])
  const observed = summarizePairs(operation, { mappings: [], accounts: [],
    managed: [{ ...row, principal_id: 'p1', employee_id: 'e1',
      employee_status: 'active', link_state: 'directory_linked_pending_auth',
      admission_revision: null, directory_state: 'present', freshness: 'fresh',
      pending_lifecycle: false, admission_enabled: true }],
    governance: [{ ...row, principal_id: 'p2', employee_id: 'e2',
      status: 'inactive', valid_from: null, valid_to: null, account_types: [] }],
    reservations: [{ ...row, employee_id: 'e1', source_kind: 'managed' }],
    governanceHash: 'b'.repeat(64), unboundManagedCount: 2 })
  assert.equal(observed.pairs[0].managedIdentities[0].linkState,
    'directory_linked_pending_auth')
  assert.equal(observed.pairs[0].governanceLinks[0].status, 'inactive')
  assert.equal(observed.pairs[0].reservations[0].employeeId, 'e1')
  assert.equal(observed.unboundManagedCount, 2)
  assert.equal(JSON.stringify(observed).includes('subject'), false)
})

test('operator image runs locked source with no migration or write command', () => {
  const dockerfile = fs.readFileSync(path.join(root,
    'infra/google-cloud/dev-040-production-release/dev057-principal-pair-diagnostic.Dockerfile'), 'utf8')
  assert.match(dockerfile, /USER node/u)
  assert.match(dockerfile, /SOURCE_REVISION=\$\{SOURCE_REVISION\}/u)
  assert.match(dockerfile, /scripts\/dev057-production-principal-pair-diagnostic-runner\.mjs/u)
  const script = fs.readFileSync(path.join(root,
    'scripts/dev057-production-principal-pair-diagnostic-runner.mjs'), 'utf8')
  assert.match(script, /REPEATABLE READ READ ONLY/u)
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/u)
})

const employeeId = '01a0c82b-11c6-77ab-887f-58df9d243e63'
const secondEmployeeId = '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'
const employeeOperation = { ...operation,
  schemaVersion: 'orgmaster.dev057-principal-pair-diagnostic-operation.v2',
  employeeIds: [employeeId, secondEmployeeId] }
delete employeeOperation.pairHashes
const emptySources = () => ({ mappings: [], accounts: [], managed: [], governance: [],
  reservations: [], ownership: [], grants: [], governanceHash: 'b'.repeat(64),
  unboundManagedCount: 0 })
function checkEmployeeOperation(value) {
  const bytes = Buffer.from(JSON.stringify(value))
  return assertOperation(value, bytes, { ...parseArgs(['--operation-ref', input,
    '--operation-sha256', crypto.createHash('sha256').update(bytes).digest('hex'),
    '--source-revision', sourceRevision, '--output-ref', output]) })
}

test('v2 is fixed to sorted unique existing fixtures and refuses alternate selectors', () => {
  assert.deepEqual(checkEmployeeOperation(employeeOperation), employeeOperation)
  for (const employeeIds of [[], [employeeId], [secondEmployeeId], ['employee-other'], [employeeId, employeeId],
    ['01a0c82b-372c-7d20-ba3b-6e3b892d2f63', employeeId]]) {
    assert.throws(() => checkEmployeeOperation({ ...employeeOperation, employeeIds }), /OPERATION_INVALID/u)
  }
  for (const changes of [{ pairHashes: [hash] }, { email: 'not-an-identity@example.test' },
    { projectId: 'other' }, { sourceRevision: 'c'.repeat(40) }, { schemaVersion: 'future' }]) {
    assert.throws(() => checkEmployeeOperation({ ...employeeOperation, ...changes }), /OPERATION_INVALID/u)
  }
})

test('v2 observes missing or unbound managed facts without manufacturing a Principal', () => {
  const sources = emptySources()
  sources.managed = [{ employee_id: employeeId, principal_id: 'managed-unbound',
    principal_issuer: null, principal_subject: null, link_state: 'directory_linked_pending_auth',
    admission_revision: null, employee_status: 'active', directory_state: 'present',
    freshness: 'fresh', pending_lifecycle: false, admission_enabled: true }]
  const observed = summarizeEmployees(employeeOperation, sources)
  assert.equal(observed.employees[0].typedAccountCount, 0)
  assert.equal(observed.employees[0].managedIdentities[0].pairBound, false)
  assert.deepEqual(observed.pairs, [])
  assert.equal(observed.employees.length, 2)
  assert.throws(() => summarizeEmployees({ ...employeeOperation, employeeIds: [employeeId] }, sources), /OPERATION_INVALID/u)
  assert.deepEqual(observed.employees[0].effectiveGrants, [])
  assert.equal(observed.releaseAuthority, false)
})

test('v2 preserves exact typed owner and complete v4 role/version/scope evidence', () => {
  const sources = emptySources()
  const row = { principal_issuer: 'issuer', principal_subject: 'subject', principal_id: 'p1',
    employee_id: employeeId, employee_status: 'active', account_type: 'human_personal',
    mapping_version: 6, published_at: '2026-10-02T00:00:00Z' }
  sources.accounts = [row]
  sources.mappings = [row]
  sources.ownership = [row]
  sources.grants = [{ ...row, contract_version: 'jenfu.orgmaster.ai-pdm-principal-grants.v4',
    assignment_version_id: 'policy1', assignment_version: '10', assignment_id: 'a1',
    stable_role_id: 'role-rd', role_code: 'rd', catalog_version: 'catalog5',
    subject_kind: 'employee', target_principal_id: null, grant_kind: 'direct', delegation_id: null,
    scope_kind: 'workspace', scope_key: 'company-jenfu', valid_from: null, valid_until: null }]
  const observed = summarizeEmployees(employeeOperation, sources)
  assert.equal(observed.employees[0].missingOwnershipCount, 0)
  assert.equal(observed.employees[0].grantWithoutTypedOwnerCount, 0)
  const grant = observed.employees[0].effectiveGrants[0]
  assert.equal(grant.contractVersion, sources.grants[0].contract_version)
  assert.equal(grant.assignmentVersion, '10')
  assert.equal(grant.scopeKey, 'company-jenfu')
  assert.equal(grant.stableRoleId, 'role-rd')
  assert.equal(observed.pairs[0].typedAccounts[0].mappingVersion, 6)
  const json = JSON.stringify(observed)
  assert.equal(json.includes('"subject"'), false)
  assert.equal(json.includes('"issuer"'), false)
  assert.equal(json.includes('@'), false)
})

test('v2 does not pool a second Principal or account type into the typed owner', () => {
  const sources = emptySources()
  sources.accounts = [{ principal_issuer: 'issuer', principal_subject: 'subject',
    principal_id: 'p1', employee_id: employeeId, account_type: 'human_personal',
    mapping_version: 1, published_at: '2026-10-02T00:00:00Z' }]
  sources.ownership = [{ principal_id: 'p1', employee_id: employeeId, account_type: 'human_privileged' }]
  sources.grants = [{ principal_id: 'p2', employee_id: employeeId }]
  const observed = summarizeEmployees(employeeOperation, sources)
  assert.equal(observed.employees[0].missingOwnershipCount, 1)
  assert.equal(observed.employees[0].grantWithoutTypedOwnerCount, 1)
})

test('v2 rejects overflow and partial provider pairs without returning truncated success', () => {
  for (const key of ['managed', 'accounts', 'ownership', 'grants']) {
    const sources = emptySources()
    sources[key] = Array.from({ length: key === 'grants' ? 129 : 33 }, () => ({}))
    assert.throws(() => summarizeEmployees(employeeOperation, sources), /SOURCE_UNBOUNDED/u)
  }
  const sources = emptySources()
  sources.managed = [{ employee_id: employeeId, principal_issuer: 'issuer', principal_subject: null }]
  assert.throws(() => summarizeEmployees(employeeOperation, sources), /PAIR_INVALID/u)
})

async function executeMockSnapshot({ failedRead = false } = {}) {
  const { crc32cBase64 } = await import('./lib/dev012-production-migration-runner.mjs')
  const bytes = Buffer.from(JSON.stringify(employeeOperation))
  const queries = []
  const objects = new Map()
  let published = null
  let ended = false
  class Client {
    async connect() {}
    async end() { ended = true }
    async query(sql, values) {
      queries.push({ sql, values })
      if (sql.includes('read_active_persistence_artifact')) return { rows: [{
        source_sha256: 'b'.repeat(64), payload: { activePolicyVersionId: 'v1',
          publishedVersions: [{ id: 'v1', kind: 'assignment-governance-v3',
            policy: { identityLinks: [], principalAdmissions: [] } }] } }] }
      if (sql.includes('count(*)')) return { rows: [{ total: 0 }] }
      if (sql.includes('v_ai_pdm_principal_effective_grants_v4') && failedRead) throw new Error('TEST_DEPENDENCY_FAILURE')
      return { rows: [] }
    }
  }
  const fetchImpl = async (url, init = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'test-token-not-real-material-000', expires_in: 3600 })
    if (init.method === 'POST') {
      assert.equal(queries.at(-1).sql, 'COMMIT')
      assert.ok(url.includes('ifGenerationMatch=0'))
      published = JSON.parse(init.body.toString())
      const object = new URL(url).searchParams.get('name')
      objects.set(object, Buffer.from(init.body))
      return Response.json({ generation: '1' })
    }
    const object = decodeURIComponent(new URL(url).pathname.split('/o/')[1])
    const body = object.endsWith('/one.json') && object.startsWith('source/') ? bytes : objects.get(object)
    assert.ok(body)
    return new URL(url).searchParams.get('alt') === 'media' ? new Response(body) :
      Response.json({ generation: '1', crc32c: crc32cBase64(body) })
  }
  const environment = { OWNER_APPLICATION_ID: 'orgmaster', RELEASE_BUCKET: 'jenfu-platform-prod-orgmaster-release',
    GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    POSTGRES_DATABASE: 'jenfu_prod', POSTGRES_IAM_LOGIN: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
    POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    CLOUD_RUN_JOB: 'orgmaster-prod-dev057-principal-pair-diagnostic', SOURCE_REVISION: sourceRevision }
  try {
    const result = await runMain({ Client, fetchImpl, environment, argv: ['--operation-ref', input,
      '--operation-sha256', crypto.createHash('sha256').update(bytes).digest('hex'),
      '--source-revision', sourceRevision, '--output-ref', output] })
    return { result, published, queries, ended }
  } catch (error) { return { error, published, queries, ended } }
}

test('v2 runner parameterizes fixture reads in one read-only snapshot and publishes only after commit', async () => {
  const result = await executeMockSnapshot()
  assert.equal(result.error, undefined)
  assert.equal(result.ended, true)
  assert.equal(result.result.employeeCount, 2)
  assert.equal(result.published.outcome.releaseAuthority, false)
  assert.equal(result.queries[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const scoped = result.queries.filter(({ sql }) => /FROM orgmaster_(?:core|contract)\.(?:v_active_principal_|managed_daily_identities|principal_.*reservations|v_ai_pdm_principal_)/u.test(sql))
  assert.equal(scoped.length, 7)
  for (const query of scoped) {
    assert.match(query.sql, /ANY\(\$1::text\[\]\)/u)
    assert.deepEqual(query.values, [[employeeId, secondEmployeeId]])
    if (!query.sql.includes('count(*)')) assert.match(query.sql, /FETCH FIRST (?:33|129) ROWS ONLY/u)
  }
  assert.equal(result.queries.some(({ sql }) => /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/u.test(sql)), false)
})

test('v2 dependency failure rolls back, closes client and publishes no observation receipt', async () => {
  const result = await executeMockSnapshot({ failedRead: true })
  assert.match(result.error.message, /TEST_DEPENDENCY_FAILURE/u)
  assert.equal(result.ended, true)
  assert.equal(result.queries.at(-1).sql, 'ROLLBACK')
  assert.equal(result.published, null)
})


test('v2 serializes PostgreSQL Date grant timestamps as ISO strings and rejects invalid facts', () => {
  const sources = emptySources()
  const publishedAt = new Date('2026-10-02T01:02:03.456Z')
  const validFrom = new Date('2026-10-01T00:00:00.000Z')
  sources.grants = [{ employee_id: employeeId, principal_id: 'p1',
    assignment_version: '4', published_at: publishedAt, valid_from: validFrom, valid_until: null }]
  const grant = summarizeEmployees(employeeOperation, sources).employees[0].effectiveGrants[0]
  assert.equal(grant.publishedAt, publishedAt.toISOString())
  assert.equal(grant.validFrom, validFrom.toISOString())
  assert.equal(grant.validUntil, null)
  for (const value of [{}, new Date('invalid'), 'invalid-timestamp']) {
    sources.grants[0].published_at = value
    assert.throws(() => summarizeEmployees(employeeOperation, sources), /TIMESTAMP_INVALID/u)
  }
})

const principalOperation = {
 schemaVersion:'orgmaster.dev057-principal-pair-diagnostic-operation.v3',
 operationId:'dev057-jed-principal-observation',sourceRevision,
 projectId:'jenfu-platform-prod',region:'asia-east1',database:'jenfu_prod',applicationId:'ai-pdm',
 principalId:'principal-firebase-b71682bf0d7cc5596b48dfad991e4096',employeeId:'employee-shijie',
}
function principalSources(){
 return { observedAt:new Date('2026-10-05T03:00:00Z'),
 accounts:[{principal_id:principalOperation.principalId,employee_id:principalOperation.employeeId,
 employee_status:'active',account_type:'human_privileged',mapping_version:'2',published_at:new Date('2026-09-26T00:00:00Z')}],
 grants:[{contract_version:'jenfu.orgmaster.ai-pdm-principal-grants.v4',
 assignment_version_id:'published-policy',assignment_version:'4',principal_id:principalOperation.principalId,
 employee_id:principalOperation.employeeId,assignment_id:'system-admin-exact',
 grant_kind:'direct',delegation_id:null,stable_role_id:'role-system-admin',role_code:'system_admin',
 catalog_version:'ai-pdm.role-catalog.2026-09-03.v3',subject_kind:'principal',
 target_principal_id:principalOperation.principalId,scope_kind:'global',scope_key:null,
 valid_from:new Date('2026-01-01T00:00:00Z'),valid_until:null,published_at:new Date('2026-09-26T00:00:00Z')}],
 catalogs:[{catalog_version:'ai-pdm.role-catalog.2026-10-05.v6',catalog_sha256:'bdc8d2b8f717e4af9d48cf882d1a564a5caaabaaaacdcf20bc5db36a5b6960af'}] }
}
test('v3 is exact Principal/Employee read-only observation and does not widen fixture v2',()=>{
 const bytes=Buffer.from(JSON.stringify(principalOperation));const args={sourceRevision,operationSha256:crypto.createHash('sha256').update(bytes).digest('hex')}
 assert.deepEqual(assertOperation(principalOperation,bytes,args),principalOperation)
 for(const change of [{principalId:'other'},{employeeId:employeeId},{employeeIds:[employeeId,secondEmployeeId]}]){
 const op={...principalOperation,...change};const b=Buffer.from(JSON.stringify(op))
 assert.throws(()=>assertOperation(op,b,{...args,operationSha256:crypto.createHash('sha256').update(b).digest('hex')}),/OPERATION_INVALID/)
 }
 const result=summarizePrincipalObservation(principalOperation,principalSources())
 assert.equal(result.observationOnly,true);assert.equal(result.releaseAuthority,false)
 assert.equal(result.grant.catalogVersion,'ai-pdm.role-catalog.2026-09-03.v3')
 assert.equal(result.activeCatalogVersion,'ai-pdm.role-catalog.2026-10-05.v6')
 const aliases=principalSources();aliases.accounts.push({...aliases.accounts[0],mapping_version:'3'})
 assert.equal(summarizePrincipalObservation(principalOperation,aliases).typedAccountRowCount,2)
 assert.doesNotMatch(JSON.stringify(result),/issuer|subject"|email|token|cookie/)
})
test('v3 rejects duplicate, delegated, expired, wrong-owner and nonprivileged published grants',()=>{
 for(const change of [x=>x.accounts.push(x.accounts[0],x.accounts[0]),x=>x.grants.push(x.grants[0]),
 x=>x.accounts[0].account_type='human_personal',x=>x.accounts[0].employee_status='inactive',
 x=>x.grants[0].target_principal_id='same-employee-other-principal',
 x=>x.grants[0].scope_kind='workspace',x=>x.grants[0].delegation_id='delegation',
 x=>x.grants[0].valid_until='2026-10-05T02:00:00Z',x=>x.catalogs[0].catalog_sha256='0'.repeat(64)]){
 const source=principalSources();change(source);assert.throws(()=>summarizePrincipalObservation(principalOperation,source))
 }
})
test('v3 executes bounded parameterized typed account and exact grant contracts on one readonly snapshot',async()=>{
 const source=principalSources(), queries=[]
 const database={async query(sql,values){queries.push({sql,values})
 if(sql.includes('v_active_principal_accounts_v1'))return {rows:source.accounts}
 if(sql.includes('v_ai_pdm_principal_effective_grants_v4'))return {rows:source.grants}
 if(sql.includes('v_application_role_catalog_v1'))return {rows:source.catalogs}
 if(sql.includes('transaction_timestamp()'))return {rows:[{observed_at:source.observedAt}]}
 return {rows:[]}
 }}
 const result=await readDiagnosticSnapshot(database,principalOperation)
 assert.equal(result.principalId,principalOperation.principalId)
 assert.equal(queries[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert.equal(queries.at(-1).sql,'COMMIT')
 for(const query of queries.filter(q=>q.sql.includes('WHERE principal_id='))){
 assert.match(query.sql,/FETCH FIRST 3 ROWS ONLY/);assert.deepEqual(query.values,[principalOperation.principalId,principalOperation.employeeId])
 }
 assert.ok(!queries.some(q=>/principal_issuer|principal_subject|managed_daily/.test(q.sql)))
})
