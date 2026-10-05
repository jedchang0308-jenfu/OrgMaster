import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readLifecycleSnapshot, runMain } from './dev014-production-lifecycle-readback.mjs'

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
