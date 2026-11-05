import assert from 'node:assert/strict'
import test from 'node:test'
import {mock} from 'node:test'
import {OAuth2Client} from 'google-auth-library'
import {readFileSync} from 'node:fs'
import {parseLocalAdministrationOwnerArgs} from './dev070-local-administration-owner.mjs'
import {validateLocalLedger,localOwnerHash,planLocalOwnerBridge,commitLocalOwnerBridge,OWNER_BOOTSTRAP_SIGNATURES,verifyLocalOwnerGoogleIdentity,OWNER_EMAIL,OWNER_SUBJECT} from './lib/dev070-local-administration-owner.mjs'
const entries=JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json',import.meta.url),'utf8')).migrations.entries
const row=e=>({version:e.version,name:e.path.split('/').at(-1).replace(/^\d{3}_/u,'').replace(/\.sql$/u,''),checksum_sha256:e.appliedSha256,source_revision:'a'.repeat(40)})
const runId='e598c60a4bc64ee5889048bb4355f7c0',database='jenfu_local_dev070_16930fa3'
const before=[{principal_id:'principal-workload:orgmaster-managed-identity-lifecycle',owner:'orgmaster',purpose:'managed-identity-lifecycle',provider_issuer:'https://accounts.google.com',provider_subject:'109928765105400231333',db_session_user:'orgmaster-prod-runtime@jenfu-platform-prod.iam',binding_version:'1',enabled:true},{principal_id:'principal-workload:platform-principal-lifecycle-invalidation',owner:'platform',purpose:'principal-lifecycle-invalidation',provider_issuer:'https://accounts.google.com',provider_subject:'101029748006912113815',db_session_user:'platform-prod-runtime@jenfu-platform-prod.iam',binding_version:'1',enabled:true}]
function fixture(){
 const role=(name,key)=>({rolname:name,rolcanlogin:true,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,org_runtime:key==='org',platform_runtime:key==='platform',fms_runtime:key==='fms',privileged:false,database_owner:false,schema_create:false})
 const state={ledger:entries.slice(0,40).map(row),bindings:structuredClone(before),installed:false,receipt:null,roleRows:[role('dev069_orgmaster_e598c60a4bc6','org'),role('dev069_platform_e598c60a4bc6','platform'),role('fms_test_runtime_e598c60a4bc6','fms')],queries:[],failCommit:false,failMigration:false,binderCalls:0,beforeOwnership:OWNER_BOOTSTRAP_SIGNATURES.map(signature=>({signature,owner:'postgres',definition:'isolated-definition',body:'isolated-body',acl:[]}))}
 state.ledger[39].checksum_sha256=entries[39].sourceSha256;state.ledger[39].source_revision='LOCAL_GENESIS:16930fa3-b7cd-4c7c-947d-c3203e59178c'
 const context={configurationSha256:'1'.repeat(64),clusterRecordSha256:'2'.repeat(64),runId,config:{target:{host:'127.0.0.1',port:61312,database,sessionUser:'dev069_orgmaster_e598c60a4bc6'},postmaster:{pid:123,startToken:'133000000000000001',dataDirectory:'C:\\isolated\\data'},profileRef:{sha256:'3'.repeat(64)},sqlProfileRef:{sha256:'4'.repeat(64)}}}
 const source={workingTreeClean:true,sourceRevision:'a'.repeat(40),sourceSha256:'b'.repeat(64),entries,migrations:entries.slice(39).map(e=>({...e,name:row(e).name,sql:'ISOLATED_MIGRATION'})),localMigration:{path:'db/migrations/local/046_dev070_local_administration_bridge_v1.sql',sourceSha256:'c'.repeat(64),appliedSha256:'d'.repeat(64)},ownershipBootstrap:{path:'db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql',sourceSha256:'e'.repeat(64),appliedSha256:'f'.repeat(64)},ownershipSql:'ISOLATED_OWNERSHIP_BOOTSTRAP',localSql:'ISOLATED_LOCAL_DDL'}
 const proof={email:'dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com',subject:'109035753048386897825'}
 const facts=()=>({ledgerSha256:localOwnerHash(state.ledger),bindingsSha256:localOwnerHash(state.bindings),runtimeRolesSha256:localOwnerHash(state.roleRows),beforeOwnership:structuredClone(state.beforeOwnership),disposition:validateLocalLedger(entries,state.ledger,database)})
 const plan=planLocalOwnerBridge({context,source,facts:facts(),ownerProof:proof,reason:'Isolated source guard verification'})
 const client={async query(sql,values){state.queries.push(sql)
  if(sql.startsWith('SELECT current_database() database,host'))return {rows:[{...context.config.target,session_user:'jenfu_orgmaster_migrator',current_user:'jenfu_orgmaster_migrator',migrator:true,runtime:false}]}
  if(sql.startsWith('SELECT nspname'))return {rows:[{schema_owner:true,schema_usage:true,schema_create:true},{schema_owner:true,schema_usage:true,schema_create:true}]}
  if(sql.startsWith('SELECT EXISTS'))return {rows:[{relations:false,functions:false}]}
  if(sql.startsWith('SELECT p.oid::regprocedure'))return {rows:state.beforeOwnership}
  if(sql==='SELECT session_user,current_user,r.rolsuper FROM pg_roles r WHERE r.rolname=session_user')return {rows:[{session_user:'postgres',current_user:'postgres',rolsuper:true}]}
  if(sql==='ISOLATED_OWNERSHIP_BOOTSTRAP')state.beforeOwnership=state.beforeOwnership.map(r=>({...r,owner:'jenfu_orgmaster_migrator'}))
  if(sql.startsWith('SELECT version,name'))return {rows:state.ledger}
  if(sql.startsWith('SELECT principal_id,owner'))return {rows:state.bindings}
  if(sql.startsWith('SELECT r.rolname'))return {rows:state.roleRows}
  if(sql.includes('to_regclass'))return {rows:[{present:state.installed}]}
  if(sql.startsWith('SELECT source_path'))return {rows:[{source_path:source.localMigration.path,source_sha256:source.localMigration.sourceSha256,source_revision:source.sourceRevision}]}
  if(sql.startsWith('SELECT plan_sha256'))return {rows:state.receipt?[{plan_sha256:plan.planSha256,response:state.receipt}]:[]}
  if(sql==='ISOLATED_MIGRATION'&&state.failMigration)throw new Error('isolated SQL failure')
  if(sql.startsWith('INSERT INTO orgmaster_core.schema_migrations')){state.ledger.push({version:values[0],name:values[1],checksum_sha256:values[2],source_revision:values[3]})}
  if(sql==='ISOLATED_LOCAL_DDL')state.installed=true
  if(sql.startsWith('SELECT orgmaster_core.bind_local')){state.binderCalls++;state.bindings=state.bindings.map(b=>({...b,provider_subject:b.owner==='orgmaster'?'102985156037283277347':'117743617824418208171',db_session_user:b.owner==='orgmaster'?'dev069_orgmaster_e598c60a4bc6':'dev069_platform_e598c60a4bc6',binding_version:'2'}));state.receipt={planSha256:plan.planSha256,afterBindingsSha256:localOwnerHash(state.bindings),changedBindings:2};return {rows:[{receipt:state.receipt}]}}
  if(sql==='COMMIT'&&state.failCommit)throw new Error('connection outcome unknown')
  return {rows:[]}
 }}
 const commit=()=>commitLocalOwnerBridge({client,context,source,plan,ownerProof:proof})
 return {state,context,source,plan,proof,commit}
}
test('local CLI only admits bounded plan/status/commit arguments',()=>{
 assert.equal(parseLocalAdministrationOwnerArgs(['plan','--config','own.json','--output','plan.json','--reason','reason']).action,'plan')
 assert.throws(()=>parseLocalAdministrationOwnerArgs(['commit','--config','own.json','--plan','plan.json','--sql','SELECT 1']))
 assert.throws(()=>parseLocalAdministrationOwnerArgs(['commit','--config','own.json']))
})
test('known local raw 042 genesis is preserved as its own exact ledger variant',()=>{
 const f=fixture(),result=validateLocalLedger(entries,f.state.ledger,database)
 assert.equal(result.raw042,true);assert.equal(result.count,40);assert.deepEqual(result.pending.map(e=>e.version),['dev070-orgmaster-044','dev070-orgmaster-045'])
 for(const change of [rows=>rows[39].checksum_sha256='0'.repeat(64),rows=>rows[39].source_revision='LOCAL_GENESIS:99999999-b7cd-4c7c-947d-c3203e59178c',rows=>rows[0].name='foreign',rows=>rows.push({...rows[0],version:'unknown'})]){const rows=structuredClone(f.state.ledger);change(rows);assert.throws(()=>validateLocalLedger(entries,rows,database),/LEDGER_UNKNOWN/)}
})
test('local bridge appends only missing owner migrations and reuses one terminal receipt',async()=>{
 const f=fixture(),original042=structuredClone(f.state.ledger[39]);const receipt=await f.commit()
 assert.equal(receipt.changedBindings,2);assert.equal(f.state.ledger.length,42);assert.deepEqual(f.state.ledger[39],original042);assert.equal(f.state.binderCalls,1)
 assert.deepEqual(await f.commit(),receipt);assert.equal(f.state.binderCalls,1)
 assert.equal(f.state.queries.filter(q=>q==='COMMIT').length,1)
})
test('source, profile, target and expired plan are rejected before a transaction',async()=>{
 for(const mutate of [f=>f.source.workingTreeClean=false,f=>f.source.sourceSha256='0'.repeat(64),f=>f.context.config.profileRef.sha256='0'.repeat(64),f=>f.context.config.target.port=61313,f=>{f.plan.expiresAt='2000-01-01T00:00:00.000Z';const{planSha256,...core}=f.plan;f.plan.planSha256=localOwnerHash(core)}]){const f=fixture();mutate(f);await assert.rejects(f.commit);assert.equal(f.state.queries.length,0)}
})
test('actual role and ledger drift fail closed before DDL or binding writes',async()=>{
 for(const mutate of [f=>f.state.roleRows[2].privileged=true,f=>f.state.roleRows.pop(),f=>f.state.ledger[0].checksum_sha256='0'.repeat(64),f=>f.state.bindings[0].binding_version='7',f=>f.state.beforeOwnership[0].owner='foreign',f=>f.state.beforeOwnership[0].body='changed after plan']){const f=fixture();mutate(f);await assert.rejects(f.commit);assert.equal(f.state.binderCalls,0);assert.equal(f.state.queries.includes('ISOLATED_MIGRATION'),false);assert.equal(f.state.queries.at(-1),'ROLLBACK')}
})
test('Google owner proof is exact, cryptographically verified through the SDK seam and fresh, without retaining a token',async()=>{
 const now=Date.now(),payload={iss:'https://accounts.google.com',aud:'http://localhost:1010',email:OWNER_EMAIL,email_verified:true,sub:OWNER_SUBJECT,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+300}
 const verify=mock.method(OAuth2Client.prototype,'verifyIdToken',async()=>({getPayload:()=>payload}))
 try{
  const input={fetchIdentity:async()=>'MEMORY_ONLY_SDK_BOUNDARY_FIXTURE',now:()=>now}
  assert.deepEqual(await verifyLocalOwnerGoogleIdentity({},input),{email:OWNER_EMAIL,subject:OWNER_SUBJECT})
  assert.equal(verify.mock.calls[0].arguments[0].audience,'http://localhost:1010')
  for(const change of [{sub:'100000000000000000000'},{email_verified:false},{iat:Math.floor(now/1000)-301}]){const original={...payload};Object.assign(payload,change);await assert.rejects(verifyLocalOwnerGoogleIdentity({},input),/OWNER_IDENTITY_INVALID/);Object.assign(payload,original)}
 }finally{verify.mock.restore()}
})
test('migration failure rolls back and an unknown COMMIT requires status rather than automatic replay',async()=>{
 const failed=fixture();failed.state.failMigration=true;await assert.rejects(failed.commit);assert.equal(failed.state.binderCalls,0);assert.equal(failed.state.queries.at(-1),'ROLLBACK')
 const unknown=fixture();unknown.state.failCommit=true;await assert.rejects(unknown.commit,/COMMIT_UNKNOWN_REQUIRES_STATUS/);assert.equal(unknown.state.binderCalls,1);assert.equal(unknown.state.queries.at(-1),'COMMIT')
 unknown.state.failCommit=false;await unknown.commit();assert.equal(unknown.state.binderCalls,1)
})
