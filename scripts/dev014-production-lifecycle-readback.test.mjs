import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readLifecycleSnapshot, runMain, safeReadbackErrorCode } from './dev014-production-lifecycle-readback.mjs'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { TARGET } from './dev040-production-migration-runner.mjs'

function database(mode = 'migrator', identityOverrides = {}, fixtures = {}) {
  const calls = []
  const identity = { database:'jenfu_prod', session_user:`orgmaster-prod-${mode}@jenfu-platform-prod.iam`, effective_user:`orgmaster-prod-${mode}@jenfu-platform-prod.iam`, server_version_num:'170010', transaction_read_only:'on', ...identityOverrides }
  return { calls, async query(sql) {
    calls.push(sql)
    if(sql.startsWith('SELECT current_database')) return {rows:[identity]}
    if(sql.startsWith('SELECT version')) return {rows:[{version:'dev057-orgmaster-030',name:'030',checksum_sha256:'a'.repeat(64),source_revision:'b'.repeat(40)}]}
    if(sql.includes('GROUP BY 1,2,3 ORDER BY 1,2,3')) return {rows:fixtures.refreshRows ?? [{trigger:'manual',state:'queued',completion_disposition:null,count:'1',expired_leases:'0',due:'1',rerun:'0',max_attempts:0,oldest_open_seconds:'10'}]}
    if(sql.includes('GROUP BY 1,2,3,4 ORDER BY 1,2,3,4')) return {rows:fixtures.lifecycleRows ?? [{application_id:'platform',event_kind:'managed_identity_lifecycle_changed',reason_code:'entitlement_authority_switch',status:'pending',count:'2',expired_leases:'0',due:'2',receipts:'0',operation_provenance_rows:'2',max_attempts:0,oldest_open_seconds:'12'}]}
    if(sql.includes('UNION ALL SELECT')) return {rows:fixtures.errorRows ?? [{queue:'refresh',code:'TIMEOUT',count:'1'},{queue:'lifecycle',code:'private@example.test',count:'1'}]}
    return {rows:[]}
  } }
}

function v2Database({ accountRows = [], eventRows = [] } = {}) {
  const calls = []
  let identityRead = 0
  return { calls, async query(sql, params = []) {
    calls.push({ sql, params })
    if (['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'COMMIT', 'ROLLBACK',
      "SET LOCAL statement_timeout = '10s'", "SET LOCAL idle_in_transaction_session_timeout = '10s'",
      'SET LOCAL ROLE jenfu_orgmaster_migrator'].includes(sql)) return { rows: [] }
    if (sql.includes('current_database()')) {
      identityRead += 1
      return { rows: [{ database: 'jenfu_prod', session_user: TARGET.login,
        effective_user: identityRead === 1 ? TARGET.login : 'jenfu_orgmaster_migrator', transaction_read_only: 'on' }] }
    }
    if (sql.includes('v_active_principal_accounts_v1')) return { rows: accountRows }
    if (sql.includes('v_principal_lifecycle_events_v2')) return { rows: eventRows }
    if (sql.includes('read_principal_auth_state_v3')) return { rows: [] }
    throw new Error('unexpected query in v2 CLI test')
  } }
}

function productionEnvironment(source, job = TARGET.job) {
  return { SOURCE_REVISION: source, OWNER_APPLICATION_ID: 'orgmaster', RELEASE_BUCKET: TARGET.releaseBucket,
    GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    POSTGRES_DATABASE: 'jenfu_prod', POSTGRES_IAM_LOGIN: TARGET.login,
    POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', CLOUD_RUN_JOB: job }
}

function publishFetch(outputRef, capture) {
  return async (url, init = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'synthetic-readback-token', expires_in: 3600 })
    if (init.method === 'POST') {
      assert.ok(url.includes(`name=${encodeURIComponent(outputRef.slice(`gs://${TARGET.releaseBucket}/`.length))}`))
      assert.match(url, /ifGenerationMatch=0$/u)
      capture.bytes = Buffer.from(init.body)
      return Response.json({ generation: '1' })
    }
    if (url.includes('alt=media')) return new Response(capture.bytes)
    return Response.json({ generation: '1', crc32c: crc32cBase64(capture.bytes) })
  }
}

test('migrator uses one read-only snapshot, the original SQL login, and bounded owner-only aggregates', async()=>{
  const db=database(); const result=await readLifecycleSnapshot(db)
  assert.equal(result.databaseWrites,0); assert.equal(result.ledgerRead,true); assert.equal(result.queueRead,true)
  assert.equal(result.lifecycleOpenCount,2); assert.equal(result.lifecycleEventTimeSnapshotAvailable,false)
  assert.deepEqual(result.errorClasses,[{queue:'refresh',code:'TIMEOUT',count:1},{queue:'lifecycle',code:'OTHER_SANITIZED',count:1}])
  assert.deepEqual(result.refresh[0],{trigger:'manual',state:'queued',completion_disposition:null,count:1,expired_leases:0,due:1,rerun:0,max_attempts:0,oldest_open_seconds:10})
  assert.equal(result.lifecycle[0].application_id,'platform'); assert.equal(result.lifecycle[0].reason_code,'entitlement_authority_switch')
  assert.equal(db.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.ok(db.calls.findIndex(x=>x.startsWith('SELECT current_database')) < db.calls.indexOf('SET LOCAL ROLE jenfu_orgmaster_migrator'))
  assert.equal(db.calls.at(-1),'COMMIT')
  assert.match(db.calls.find(x=>x.includes('GROUP BY 1,2,3 ORDER BY 1,2,3')),/FETCH FIRST 61 ROWS ONLY$/u)
  assert.match(db.calls.find(x=>x.includes('GROUP BY 1,2,3,4 ORDER BY 1,2,3,4')),/FETCH FIRST 1025 ROWS ONLY$/u)
  assert.match(db.calls.find(x=>x.includes('UNION ALL SELECT')),/FETCH FIRST 1025 ROWS ONLY$/u)
  assert.ok(db.calls.every(sql=>/^(BEGIN|SET LOCAL|SELECT|COMMIT)$/u.test(sql.split(' ')[0]==='SET'?'SET LOCAL':sql.split(' ')[0])))
  assert.ok(db.calls.every(sql=>!sql.includes('platform_core')&&!sql.includes('ai_pdm_core')))
  assert.ok(!JSON.stringify(result).includes('private@example.test'))
})
test('PII-like application, reason, queue, state, and error labels collapse to fixed public classes',async()=>{
  const privateLabel='person@example.test'
  const db=database('migrator',{}, {
    refreshRows:[{trigger:privateLabel,state:privateLabel,completion_disposition:privateLabel,count:'1',expired_leases:'0',due:'0',rerun:'0',max_attempts:0,oldest_open_seconds:'0'}],
    lifecycleRows:[{application_id:privateLabel,event_kind:privateLabel,reason_code:privateLabel,status:privateLabel,count:'1',expired_leases:'0',due:'0',receipts:'0',operation_provenance_rows:'1',max_attempts:0,oldest_open_seconds:'0'}],
    errorRows:[{queue:privateLabel,code:privateLabel,count:'1'}],
  })
  const result=await readLifecycleSnapshot(db)
  assert.deepEqual(result.refresh[0],{trigger:'OTHER_SANITIZED',state:'OTHER_SANITIZED',completion_disposition:'OTHER_SANITIZED',count:1,expired_leases:0,due:0,rerun:0,max_attempts:0,oldest_open_seconds:0})
  assert.deepEqual(result.lifecycle[0],{application_id:'OTHER_SANITIZED',event_kind:'OTHER_SANITIZED',reason_code:'OTHER_SANITIZED',status:'OTHER_SANITIZED',count:1,expired_leases:0,due:0,receipts:0,operation_provenance_rows:1,max_attempts:0,oldest_open_seconds:0})
  assert.deepEqual(result.errorClasses,[{queue:'OTHER_SANITIZED',code:'OTHER_SANITIZED',count:1}])
  assert.ok(!JSON.stringify(result).includes(privateLabel))
})
test('aggregate output row caps fail closed when the database returns the cap row',async()=>{
  const refreshRow={trigger:'manual',state:'queued',completion_disposition:null,count:'1',expired_leases:'0',due:'0',rerun:'0',max_attempts:0,oldest_open_seconds:'0'}
  const refreshDb=database('migrator',{}, {refreshRows:Array.from({length:61},()=>refreshRow)})
  await assert.rejects(readLifecycleSnapshot(refreshDb),/AGGREGATE_LIMIT/u)
  assert.equal(refreshDb.calls.at(-1),'ROLLBACK')

  const lifecycleRow={application_id:'platform',event_kind:'managed_identity_lifecycle_changed',reason_code:'entitlement_authority_switch',status:'pending',count:'1',expired_leases:'0',due:'0',receipts:'0',operation_provenance_rows:'1',max_attempts:0,oldest_open_seconds:'0'}
  const lifecycleDb=database('migrator',{}, {lifecycleRows:Array.from({length:1025},()=>lifecycleRow)})
  await assert.rejects(readLifecycleSnapshot(lifecycleDb),/AGGREGATE_LIMIT/u)
  assert.equal(lifecycleDb.calls.at(-1),'ROLLBACK')
})
test('runtime mode reads only its real SQL session and never assumes migrator privileges',async()=>{
  const db=database('runtime'); const result=await readLifecycleSnapshot(db,'runtime')
  assert.equal(result.mode,'runtime'); assert.equal(result.ledgerRead,false); assert.equal(result.queueRead,false)
  assert.ok(!db.calls.some(sql=>sql.includes('orgmaster_core')||sql.includes('SET LOCAL ROLE')))
})
for(const [label,overrides] of Object.entries({wrongDatabase:{database:'another_db'},wrongSessionUser:{session_user:'another_login'},definerImpersonation:{effective_user:'jenfu_orgmaster_migrator'},readWriteTransaction:{transaction_read_only:'off'}})) {
  test(`rejects ${label} before owner-table access and rolls back`,async()=>{
    const db=database('migrator',overrides)
    await assert.rejects(readLifecycleSnapshot(db),/DATABASE_IDENTITY_INVALID/u)
    assert.equal(db.calls.at(-1),'ROLLBACK'); assert.ok(!db.calls.some(sql=>sql.includes('orgmaster_core')))
  })
}
test('unknown execution modes perform no SQL',async()=>{
  const db=database(); await assert.rejects(readLifecycleSnapshot(db,'other'),/MODE_INVALID/u); assert.equal(db.calls.length,0)
})
test('a queue read error rolls back without emitting a successful snapshot',async()=>{
  const db=database();const query=db.query.bind(db)
  db.query=async sql=>{ if(sql.includes('GROUP BY 1,2,3 ORDER BY 1,2,3')) throw new Error('synthetic read failed'); return query(sql) }
  await assert.rejects(readLifecycleSnapshot(db),/synthetic read failed/u);assert.equal(db.calls.at(-1),'ROLLBACK')
})
test('invalid ledger hashes fail closed',async()=>{
  const db=database();const query=db.query.bind(db)
  db.query=async sql=>sql.startsWith('SELECT version')?{rows:[{version:'30',name:'30',checksum_sha256:'broken',source_revision:'source'}]}:query(sql)
  await assert.rejects(readLifecycleSnapshot(db),/LEDGER_INVALID/u);assert.equal(db.calls.at(-1),'ROLLBACK')
})
test('duplicate CLI arguments cannot pick an alternate mode or target',async()=>{
  let fetches=0
  await assert.rejects(runMain({argv:['--mode=migrator','--mode=runtime','--source-revision='+ 'a'.repeat(40)],fetchImpl:async()=>{fetches++;throw new Error('must not fetch')}}),/ARG_INVALID/u)
  assert.equal(fetches,0)
})
test('image source mismatch is rejected before obtaining any credentials',async()=>{
  let fetches=0
  await assert.rejects(runMain({argv:['--mode=migrator','--source-revision='+ 'a'.repeat(40),'--output-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV014-LIFECYCLE-READBACK/test.json'],environment:{SOURCE_REVISION:'b'.repeat(40)},fetchImpl:async()=>{fetches++;throw new Error('must not fetch')}}),/IMAGE_SOURCE_MISMATCH/u)
  assert.equal(fetches,0)
})
test('fixed production target mismatch is rejected before obtaining any credentials',async()=>{
  let fetches=0
  const environment={SOURCE_REVISION:'a'.repeat(40),OWNER_APPLICATION_ID:'orgmaster',RELEASE_BUCKET:'jenfu-platform-prod-orgmaster-release',GOOGLE_CLOUD_PROJECT:'jenfu-platform-prod',GOOGLE_CLOUD_REGION:'asia-east1',CLOUD_SQL_INSTANCE_CONNECTION_NAME:'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',POSTGRES_DATABASE:'jenfu_dev',POSTGRES_IAM_LOGIN:'orgmaster-prod-migrator@jenfu-platform-prod.iam',POSTGRES_SOCKET:'/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',CLOUD_RUN_JOB:'orgmaster-prod-migration-runner'}
  await assert.rejects(runMain({argv:['--mode=migrator','--source-revision='+ 'a'.repeat(40),'--output-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV014-LIFECYCLE-READBACK/test.json'],environment,fetchImpl:async()=>{fetches++;throw new Error('must not fetch')}}),/MIGRATION_PRODUCTION_TARGET_MISMATCH/u)
  assert.equal(fetches,0)
})
test('output object must remain under the fixed release bucket and prefix before credentials are read',async()=>{
  let fetches=0
  const environment={SOURCE_REVISION:'a'.repeat(40),OWNER_APPLICATION_ID:'orgmaster',RELEASE_BUCKET:'jenfu-platform-prod-orgmaster-release',GOOGLE_CLOUD_PROJECT:'jenfu-platform-prod',GOOGLE_CLOUD_REGION:'asia-east1',CLOUD_SQL_INSTANCE_CONNECTION_NAME:'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',POSTGRES_DATABASE:'jenfu_prod',POSTGRES_IAM_LOGIN:'orgmaster-prod-migrator@jenfu-platform-prod.iam',POSTGRES_SOCKET:'/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',CLOUD_RUN_JOB:'orgmaster-prod-migration-runner'}
  await assert.rejects(runMain({argv:['--mode=migrator','--source-revision='+ 'a'.repeat(40),'--output-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/releases/OTHER/report.json'],environment,fetchImpl:async()=>{fetches++;throw new Error('must not fetch')}}))
  assert.equal(fetches,0)
})

test('native migrator CLI accepts the documented output path and publishes an exact read-only receipt',async()=>{
  const source='a'.repeat(40)
  const environment={SOURCE_REVISION:source,OWNER_APPLICATION_ID:'orgmaster',RELEASE_BUCKET:'jenfu-platform-prod-orgmaster-release',GOOGLE_CLOUD_PROJECT:'jenfu-platform-prod',GOOGLE_CLOUD_REGION:'asia-east1',CLOUD_SQL_INSTANCE_CONNECTION_NAME:'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',POSTGRES_DATABASE:'jenfu_prod',POSTGRES_IAM_LOGIN:'orgmaster-prod-migrator@jenfu-platform-prod.iam',POSTGRES_SOCKET:'/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',CLOUD_RUN_JOB:'orgmaster-prod-migration-runner'}
  const db=database(),token='synthetic-readback-token-no-credential',requests=[]
  let bytes,connected=0,ended=0,options
  class Client {
    constructor(value){options=value;this.query=db.query.bind(db)}
    async connect(){connected++}
    async end(){ended++}
  }
  const fetchImpl=async(url,init={})=>{
    requests.push({url,method:init.method??'GET'})
    if(url.startsWith('http://metadata.google.internal/')) return Response.json({access_token:token,expires_in:3600})
    assert.equal(init.headers.authorization,'Bearer '+token)
    if(init.method==='POST'){
      assert.match(url,/uploadType=media&name=receipts%2Freleases%2FDEV014-LIFECYCLE-READBACK%2Ftest.json&ifGenerationMatch=0$/u)
      bytes=Buffer.from(init.body)
      return Response.json({generation:'1'})
    }
    if(url.includes('alt=media'))return new Response(bytes)
    return Response.json({generation:'1',crc32c:crc32cBase64(bytes)})
  }
  const result=await runMain({argv:['--mode=migrator','--source-revision='+source,'--output-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV014-LIFECYCLE-READBACK/test.json'],environment,Client,fetchImpl})
  assert.equal(connected,1);assert.equal(ended,1)
  assert.equal(options.user,environment.POSTGRES_IAM_LOGIN)
  assert.equal(options.database,'jenfu_prod')
  assert.equal(db.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(db.calls.at(-1),'COMMIT')
  assert.equal(result.sourceRevision,source);assert.equal(result.databaseWrites,0)
  assert.equal(result.ledgerRead,true);assert.equal(result.queueRead,true)
  assert.equal(result.fullDev014Complete,false)
  assert.deepEqual(JSON.parse(bytes),result)
  assert.equal(requests.filter(row=>row.method==='POST').length,1)
  assert.ok(!bytes.includes(token))
})

test('v2 preflight CLI keeps the native migrator target and publishes under its source-bound fixed subprefix', async () => {
  const source = 'c'.repeat(40)
  const outputRef = `gs://${TARGET.releaseBucket}/receipts/releases/DEV014-LIFECYCLE-READBACK/v2/${source}/preflight-001.json`
  const db = v2Database()
  const capture = {}
  let clientOptions, connected = 0, ended = 0
  class Client {
    constructor(options) { clientOptions = options }
    async connect() { connected += 1 }
    query(sql, params) { return db.query(sql, params) }
    async end() { ended += 1 }
  }
  const result = await runMain({
    argv: ['--mode=v2-preflight', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--include-jed-smoke=false'],
    environment: productionEnvironment(source), Client, fetchImpl: publishFetch(outputRef, capture),
  })
  assert.equal(clientOptions.user, TARGET.login)
  assert.equal(clientOptions.database, 'jenfu_prod')
  assert.equal(clientOptions.password, 'synthetic-readback-token')
  assert.equal(connected, 1)
  assert.equal(ended, 1)
  assert.equal(result.mode, 'v2-preflight')
  assert.equal(result.schemaVersion, 'orgmaster.dev014-lifecycle-v2-preflight.v1')
  assert.equal(result.sourceRevision, source)
  assert.equal(result.databaseWrites, 0)
  assert.deepEqual(JSON.parse(capture.bytes), result)
  assert.equal(db.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.ok(db.calls.some(call => call.sql === 'SET LOCAL ROLE jenfu_orgmaster_migrator'))
  assert.equal(db.calls.at(-1).sql, 'COMMIT')
  assert.equal(db.calls.some(call => call.sql.includes('schema_migrations') || call.sql.includes('managed_identity_lifecycle_outbox')), false)
})

test('v2 event CLI binds one fixed employee and exact operation selector without publishing when absent', async () => {
  const source = 'd'.repeat(40)
  const outputRef = `gs://${TARGET.releaseBucket}/receipts/releases/DEV014-LIFECYCLE-READBACK/v2/${source}/event-001.json`
  const db = v2Database()
  const fetchCalls = []
  let ended = 0
  class Client {
    async connect() {}
    query(sql, params) { return db.query(sql, params) }
    async end() { ended += 1 }
  }
  const fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url, method: init.method ?? 'GET' })
    if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'synthetic-readback-token', expires_in: 3600 })
    throw new Error('event lookup failure must not publish an object')
  }
  await assert.rejects(runMain({
    argv: ['--mode=v2-event', `--source-revision=${source}`, `--output-ref=${outputRef}`,
      '--employee-number=JFS9014', '--operation-id=DEV014-JFS9014-REVOKE-0001'],
    environment: productionEnvironment(source), Client, fetchImpl,
  }), /DEV014_LIFECYCLE_V2_READBACK_EVENT_NOT_FOUND/u)
  const eventCall = db.calls.find(call => call.sql.includes('v_principal_lifecycle_events_v2'))
  assert.ok(eventCall.sql.includes('operation_id=$2'))
  assert.deepEqual(eventCall.params, ['orgmaster.principal-lifecycle.v2', 'DEV014-JFS9014-REVOKE-0001'])
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
  assert.equal(fetchCalls.filter(call => call.method === 'POST').length, 0)
  assert.equal(ended, 1)
})

test('v2 event created-after selector is bound as a timestamp and rejects ambiguous selectors before credentials', async () => {
  const source = 'e'.repeat(40)
  const outputRef = `gs://${TARGET.releaseBucket}/receipts/releases/DEV014-LIFECYCLE-READBACK/v2/${source}/event-002.json`
  const db = v2Database()
  let fetches = 0
  class Client {
    async connect() {}
    query(sql, params) { return db.query(sql, params) }
    async end() {}
  }
  const fetchImpl = async (url, init = {}) => {
    fetches += 1
    if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'synthetic-readback-token', expires_in: 3600 })
    if (init.method === 'POST') throw new Error('empty candidate must not publish')
    throw new Error('unexpected storage read')
  }
  await assert.rejects(runMain({
    argv: ['--mode=v2-event', `--source-revision=${source}`, `--output-ref=${outputRef}`,
      '--employee-number=JFS9015', '--created-after=2026-10-05T00:00:00Z'],
    environment: productionEnvironment(source), Client, fetchImpl,
  }), /DEV014_LIFECYCLE_V2_READBACK_EVENT_NOT_FOUND/u)
  const eventCall = db.calls.find(call => call.sql.includes('v_principal_lifecycle_events_v2'))
  assert.ok(eventCall.sql.includes('created_at >= $2::timestamptz'))
  assert.equal(eventCall.params[2], '01a0c82b-372c-7d20-ba3b-6e3b892d2f63')
  assert.equal(fetches, 1)

  fetches = 0
  await assert.rejects(runMain({
    argv: ['--mode=v2-event', `--source-revision=${source}`, `--output-ref=${outputRef}`,
      '--employee-number=JFS9015', '--operation-id=DEV014-JFS9015-REVOKE-0001', '--created-after=2026-10-05T00:00:00Z'],
    environment: productionEnvironment(source), Client, fetchImpl,
  }), /DEV014_LIFECYCLE_READBACK_ARG_INVALID/u)
  assert.equal(fetches, 0)
})

test('unknown, duplicate, extra-mode, and wrong-target v2 arguments fail before reading credentials', async () => {
  const source = 'f'.repeat(40)
  const outputRef = `gs://${TARGET.releaseBucket}/receipts/releases/DEV014-LIFECYCLE-READBACK/v2/${source}/event-003.json`
  let fetches = 0, clients = 0
  class Client { constructor() { clients += 1 } }
  const fetchImpl = async () => { fetches += 1; throw new Error('credentials must not be read') }
  const invalid = [
    ['--mode=v2-event', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--employee-number=JFS9999', '--operation-id=OP-1'],
    ['--mode=v2-event', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--employee-number=JFS9014', '--operation-id=OP-1', '--created-after=2026-10-05T00:00:00Z'],
    ['--mode=v2-preflight', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--include-jed-smoke=maybe'],
    ['--mode=v2-preflight', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--latest=true'],
    ['--mode=v2-preflight', `--source-revision=${source}`, `--source-revision=${source}`, `--output-ref=${outputRef}`],
    ['--mode=migrator', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--include-jed-smoke=true'],
    ['--mode=runtime', `--source-revision=${source}`, `--output-ref=${outputRef}`, '--employee-number=JFS9014'],
    ['--mode=v2-preflight', `--source-revision=${source}`, `--output-ref=gs://${TARGET.releaseBucket}/receipts/releases/DEV014-LIFECYCLE-READBACK/legacy-v2.json`],
  ]
  for (const argv of invalid) await assert.rejects(runMain({ argv, environment: productionEnvironment(source), Client, fetchImpl }), /DEV014_LIFECYCLE_READBACK_ARG_INVALID/u)
  assert.equal(fetches, 0)
  assert.equal(clients, 0)
})

test('diagnostics retain fixed guard/SQLSTATE codes and suppress arbitrary error messages',()=>{
  assert.equal(safeReadbackErrorCode({code:'MIGRATION_GCS_REF_INVALID',message:'private material'}),'MIGRATION_GCS_REF_INVALID')
  assert.equal(safeReadbackErrorCode({code:'42501',message:'private query'}),'42501')
  assert.equal(safeReadbackErrorCode(new Error('DEV014_LIFECYCLE_READBACK_DATABASE_IDENTITY_INVALID')),'DEV014_LIFECYCLE_READBACK_DATABASE_IDENTITY_INVALID')
  assert.equal(safeReadbackErrorCode(new Error('person@example.test secret')),'UNCLASSIFIED_READBACK_FAILURE')
  assert.equal(safeReadbackErrorCode({code:'contains private text'}),'UNCLASSIFIED_READBACK_FAILURE')
  assert.equal(safeReadbackErrorCode({code:'SECRET123'}),'UNCLASSIFIED_READBACK_FAILURE')
  assert.equal(safeReadbackErrorCode({code:'SECRE'}),'UNCLASSIFIED_READBACK_FAILURE')
  assert.equal(safeReadbackErrorCode(new Error('DEV014_LIFECYCLE_READBACK_SECRET123')),'UNCLASSIFIED_READBACK_FAILURE')
  assert.equal(safeReadbackErrorCode(new Error('DEV014_LIFECYCLE_V2_READBACK_EVENT_NOT_FOUND')),'DEV014_LIFECYCLE_V2_READBACK_EVENT_NOT_FOUND')
  assert.equal(safeReadbackErrorCode(new Error('DEV014_LIFECYCLE_V2_READBACK_DELIVERY_QUERY_INVALID')),'DEV014_LIFECYCLE_V2_READBACK_DELIVERY_QUERY_INVALID')
  assert.equal(safeReadbackErrorCode(new Error('DEV014_LIFECYCLE_V2_READBACK_SECRET123')),'UNCLASSIFIED_READBACK_FAILURE')
})
