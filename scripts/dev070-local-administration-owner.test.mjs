import assert from 'node:assert/strict'
import test from 'node:test'
import {mock} from 'node:test'
import {OAuth2Client} from 'google-auth-library'
import {readFileSync} from 'node:fs'
import {parseLocalAdministrationOwnerArgs} from './dev070-local-administration-owner.mjs'
import {validateLocalLedger,localOwnerHash,planLocalOwnerBridge,commitLocalOwnerBridge,readLocalOwnerBridgeReceipt,LOCAL_OWNER_BOOTSTRAP_PATH,LOCAL_PERSISTENCE_COMPATIBILITY_PATH,OWNER_BOOTSTRAP_SIGNATURES,verifyLocalOwnerGoogleIdentity,OWNER_EMAIL,OWNER_SUBJECT,executeLocalEnrollmentIntent} from './lib/dev070-local-administration-owner.mjs'
const entries=JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json',import.meta.url),'utf8')).migrations.entries
const row=e=>({version:e.version,name:e.path.split('/').at(-1).replace(/^\d{3}_/u,'').replace(/\.sql$/u,''),checksum_sha256:e.appliedSha256,source_revision:'a'.repeat(40)})
const runId='e598c60a4bc64ee5889048bb4355f7c0',database='jenfu_local_dev070_16930fa3'
const before=[{principal_id:'principal-workload:orgmaster-managed-identity-lifecycle',owner:'orgmaster',purpose:'managed-identity-lifecycle',provider_issuer:'https://accounts.google.com',provider_subject:'109928765105400231333',db_session_user:'orgmaster-prod-runtime@jenfu-platform-prod.iam',binding_version:'1',enabled:true},{principal_id:'principal-workload:platform-principal-lifecycle-invalidation',owner:'platform',purpose:'principal-lifecycle-invalidation',provider_issuer:'https://accounts.google.com',provider_subject:'101029748006912113815',db_session_user:'platform-prod-runtime@jenfu-platform-prod.iam',binding_version:'1',enabled:true}]
function fixture(){
 const role=(name,key)=>({rolname:name,rolcanlogin:true,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,org_runtime:key==='org',platform_runtime:key==='platform',fms_runtime:key==='fms',privileged:false,database_owner:false,schema_create:false})
 const state={ledger:entries.slice(0,40).map(row),bindings:structuredClone(before),installed:false,receipt:null,roleRows:[role('dev069_orgmaster_e598c60a4bc6','org'),role('dev069_platform_e598c60a4bc6','platform'),role('fms_test_runtime_e598c60a4bc6','fms')],queries:[],failCommit:false,failMigration:false,binderCalls:0,beforeOwnership:OWNER_BOOTSTRAP_SIGNATURES.map(signature=>({signature,owner:'postgres',definition:'isolated-definition',body:'isolated-body',acl:[]}))}
 state.ledger[39].checksum_sha256=entries[39].sourceSha256;state.ledger[39].source_revision='LOCAL_GENESIS:16930fa3-b7cd-4c7c-947d-c3203e59178c'
 const context={configurationSha256:'1'.repeat(64),clusterRecordSha256:'2'.repeat(64),runId,config:{target:{host:'127.0.0.1',port:61312,database,sessionUser:'dev069_orgmaster_e598c60a4bc6'},postmaster:{pid:123,startToken:'133000000000000001',dataDirectory:'C:\\isolated\\data'},profileRef:{sha256:'3'.repeat(64)},sqlProfileRef:{sha256:'4'.repeat(64)}}}
 const source={workingTreeClean:true,sourceRevision:'a'.repeat(40),sourceSha256:'b'.repeat(64),entries,migrations:entries.slice(39).map(e=>({...e,name:row(e).name,sql:'ISOLATED_MIGRATION'})),localMigration:{path:'db/migrations/local/046_dev070_local_administration_bridge_v1.sql',sourceSha256:'c'.repeat(64),appliedSha256:'d'.repeat(64)},ownershipBootstrap:{path:LOCAL_OWNER_BOOTSTRAP_PATH,sourceSha256:'e'.repeat(64),appliedSha256:'f'.repeat(64),compatibility:{path:LOCAL_PERSISTENCE_COMPATIBILITY_PATH,sourceSha256:'7'.repeat(64),appliedSha256:'8'.repeat(64)}},ownershipSql:'ISOLATED_OWNERSHIP_BOOTSTRAP',compatibilitySql:'ISOLATED_PERSISTENCE_COMPATIBILITY',localSql:'ISOLATED_LOCAL_DDL'}
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
  if(sql.startsWith('SELECT command_id::text command_id,plan_sha256'))return {rows:state.receipt?[{command_id:plan.commandId,plan_sha256:plan.planSha256,response:state.receipt}]:[]}
  if(sql==='ISOLATED_MIGRATION'&&state.failMigration)throw new Error('isolated SQL failure')
  if(sql.startsWith('INSERT INTO orgmaster_core.schema_migrations')){state.ledger.push({version:values[0],name:values[1],checksum_sha256:values[2],source_revision:values[3]})}
  if(sql==='ISOLATED_LOCAL_DDL')state.installed=true
  if(sql.startsWith('SELECT orgmaster_core.bind_local')){state.binderCalls++;state.bindings=state.bindings.map(b=>({...b,provider_subject:b.owner==='orgmaster'?'102985156037283277347':'117743617824418208171',db_session_user:b.owner==='orgmaster'?'dev069_orgmaster_e598c60a4bc6':'dev069_platform_e598c60a4bc6',binding_version:'2'}));state.receipt={format:'orgmaster.local-administration-bridge-receipt.v1',commandId:plan.commandId,database,sourceRevision:source.sourceRevision,planSha256:plan.planSha256,beforeBindingsSha256:plan.beforeBindingsSha256,afterBindingsSha256:localOwnerHash(state.bindings),changedBindings:2};return {rows:[{receipt:state.receipt}]}}
  if(sql==='COMMIT'&&state.failCommit)throw new Error('connection outcome unknown')
  return {rows:[]}
 }}
 const commit=()=>commitLocalOwnerBridge({client,context,source,plan,ownerProof:proof})
 return {state,context,source,plan,proof,commit,client}
}
test('local CLI only admits bounded plan/status/commit arguments',()=>{
 assert.equal(parseLocalAdministrationOwnerArgs(['plan','--config','own.json','--output','plan.json','--reason','reason']).action,'plan')
 assert.throws(()=>parseLocalAdministrationOwnerArgs(['commit','--config','own.json','--plan','plan.json','--sql','SELECT 1']))
 assert.throws(()=>parseLocalAdministrationOwnerArgs(['commit','--config','own.json']))
})
test('known local raw 042 genesis is preserved as its own exact ledger variant',()=>{
 const f=fixture(),result=validateLocalLedger(entries,f.state.ledger,database)
 assert.equal(result.raw042,true);assert.equal(result.count,40);assert.deepEqual(result.pending.map(e=>e.version),['dev070-orgmaster-044','dev070-orgmaster-045','dev070-orgmaster-047','dev070-orgmaster-048','dev070-orgmaster-049','dev070-orgmaster-050','dev070-orgmaster-051'])
 for(const change of [rows=>rows[39].checksum_sha256='0'.repeat(64),rows=>rows[39].source_revision='LOCAL_GENESIS:99999999-b7cd-4c7c-947d-c3203e59178c',rows=>rows[0].name='foreign',rows=>rows.push({...rows[0],version:'unknown'})]){const rows=structuredClone(f.state.ledger);change(rows);assert.throws(()=>validateLocalLedger(entries,rows,database),/LEDGER_UNKNOWN/)}
})

test('source selects forward bootstrap 071 and a rehashed old 070 plan cannot authorize writes',async()=>{
 assert.equal(LOCAL_OWNER_BOOTSTRAP_PATH,'db/dev-010/071_local_orgmaster_administration_owner_bootstrap_v2.sql')
 assert.equal(readFileSync(new URL('../'+LOCAL_OWNER_BOOTSTRAP_PATH,import.meta.url)).includes(13),false,'071 raw source must remain LF on Windows too')
 assert.ok(readFileSync(new URL('../.gitattributes',import.meta.url),'utf8').split(/\r?\n/u).includes(LOCAL_OWNER_BOOTSTRAP_PATH+' text eol=lf'))
 assert.equal(localOwnerHash(readFileSync(new URL('../db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql',import.meta.url))),'040cdccabc25d55ac0f94efa772386ef1575fe4f11a231a99bbc9e018ca9445c')
 const f=fixture();f.plan.ownershipBootstrap={...f.plan.ownershipBootstrap,path:'db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql'}
 const {planSha256,...core}=f.plan;f.plan.planSha256=localOwnerHash(core)
 await assert.rejects(f.commit,/PLAN_CAS_CONFLICT/)
 assert.equal(f.state.binderCalls,0);assert.equal(f.state.queries.includes('ISOLATED_OWNERSHIP_BOOTSTRAP'),false)
})
test('local bridge appends only missing owner migrations and reuses one terminal receipt',async()=>{
 const f=fixture(),original042=structuredClone(f.state.ledger[39]);const receipt=await f.commit()
 assert.equal(receipt.changedBindings,2);assert.equal(f.state.ledger.length,47);assert.deepEqual(f.state.ledger[39],original042);assert.equal(f.state.binderCalls,1)
 assert.deepEqual(await f.commit(),receipt);assert.equal(f.state.binderCalls,1)
 assert.equal(f.state.queries.filter(q=>q==='COMMIT').length,1)
 const ownershipIndex=f.state.queries.indexOf('ISOLATED_OWNERSHIP_BOOTSTRAP')
 assert.equal(f.state.queries[ownershipIndex+1],'ISOLATED_PERSISTENCE_COMPATIBILITY')
 assert.equal(f.state.queries.filter(q=>q==='ISOLATED_PERSISTENCE_COMPATIBILITY').length,1)
})
test('a plan with changed compatibility source is rejected before owner DDL',async()=>{
 const f=fixture()
 f.plan.ownershipBootstrap={...f.plan.ownershipBootstrap,compatibility:{...f.plan.ownershipBootstrap.compatibility,sourceSha256:'9'.repeat(64)}}
 const {planSha256,...core}=f.plan
 f.plan.planSha256=localOwnerHash(core)
 await assert.rejects(f.commit,/PLAN_CAS_CONFLICT/)
 assert.equal(f.state.queries.includes('ISOLATED_OWNERSHIP_BOOTSTRAP'),false)
 assert.equal(f.state.queries.includes('ISOLATED_PERSISTENCE_COMPATIBILITY'),false)
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

test('standard owner status reads only the original plan receipt and preserves a missing receipt as null',async()=>{
 const f=fixture();assert.equal(await readLocalOwnerBridgeReceipt(f.client,f.plan),null)
 const original=await f.commit();assert.deepEqual(await readLocalOwnerBridgeReceipt(f.client,f.plan),original)
 const changed=structuredClone(f.plan);changed.reason='different plan with same command';const {planSha256,...core}=changed;changed.planSha256=localOwnerHash(core)
 await assert.rejects(readLocalOwnerBridgeReceipt(f.client,changed),/RECEIPT_CONFLICT/);assert.equal(f.state.binderCalls,1)
})
test('standard owner status rejects partial or conflicting stored 046 receipt fields',async()=>{
 const f=fixture(),original=await f.commit()
 for(const change of [r=>delete r.format,r=>r.planSha256='0'.repeat(64),r=>r.commandId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',r=>r.database='other_database',r=>r.sourceRevision='0'.repeat(40),r=>r.beforeBindingsSha256='0'.repeat(64),r=>r.afterBindingsSha256='partial',r=>r.changedBindings=3]){
  f.state.receipt=structuredClone(original);change(f.state.receipt);await assert.rejects(readLocalOwnerBridgeReceipt(f.client,f.plan),/RECEIPT_CONFLICT/)
 }
 f.state.receipt=original
 for(const change of [r=>r.plan_sha256='0'.repeat(64),r=>r.command_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',r=>r.response=null]){
  const stored={command_id:f.plan.commandId,plan_sha256:f.plan.planSha256,response:original};change(stored)
  await assert.rejects(readLocalOwnerBridgeReceipt({query:async()=>({rows:[stored]})},f.plan),/RECEIPT_CONFLICT/)
 }
 assert.equal(f.state.binderCalls,1)
})

function enrollmentFixture(){
 const f=fixture(),now=Date.now(),original=f.client.query
 f.context.directoryCustomerId='verified-customer'
 f.state.ledger=entries.map(row);f.state.installed=true;f.state.beforeOwnership=f.state.beforeOwnership.map(r=>({...r,owner:'jenfu_orgmaster_migrator'}))
 Object.assign(f.state,{intent:null,intentWrites:0,revokeWrites:0,governance:'7'.repeat(64),organization:'8'.repeat(64),admission:false,accounts:[{principal_id:'native-existing',employee_id:'employee-target'}],managed:[]})
 f.client.query=async(sql,values)=>{
  if(sql.startsWith('SELECT trim(a.canonical_sha256)'))return {rows:[{governance_revision:f.state.governance,workspace_revision:f.state.organization,admission_enabled:f.state.admission}]}
  if(sql==='SELECT * FROM orgmaster_contract.read_administration_state_v1()')return {rows:[{administration_version:'0',initialized_by_command_id:null}]}
  if(sql.startsWith('SELECT DISTINCT principal_id'))return {rows:f.state.accounts}
  if(sql.startsWith('SELECT employee_id,principal_id'))return {rows:f.state.managed}
  if(sql.startsWith('SELECT orgmaster_core.read_administration_enrollment_intent_owner'))return {rows:[{receipt:structuredClone(f.state.intent)}]}
  if(sql.startsWith('SELECT orgmaster_core.admit_administration_enrollment_intent')){const intent=JSON.parse(values[0]);f.state.intentWrites++;f.state.intent={intent:{contractVersion:'orgmaster.administration-enrollment-intent-receipt.v1',intentHash:localOwnerHash(intent),intent,admittedAt:new Date(now).toISOString()},revoked:false,receipt:null};return {rows:[{receipt:f.state.intent.intent}]}}
  if(sql.startsWith('SELECT orgmaster_core.revoke_administration_enrollment_intent')){f.state.revokeWrites++;f.state.intent.revoked=true;return {rows:[{receipt:structuredClone(f.state.intent)}]}}
  return original(sql,values)
 }
 f.input={contractVersion:'orgmaster.administration-enrollment-intent.v1',commandId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',environmentKey:database,sourceRevision:f.source.sourceRevision,employeeId:'employee-target',directoryKey:{customerId:'verified-customer',userId:'immutable-google-user'},principalId:'native-existing',expiresAt:new Date(now+10*60000).toISOString(),expected:null,reason:'指定本人首位初始化',admittingWorkload:null}
 f.run=(action,input=f.enrollmentPlan??f.input,clock=now)=>executeLocalEnrollmentIntent({client:f.client,context:f.context,source:f.source,input,action,ownerProof:f.proof,now:clock})
 f.prepare=async()=>{const result=await f.run('plan',f.input);f.enrollmentPlan=result.plan;return result}
 return f
}
test('local intent CLI is closed and the plan fills only the existing 045 intent wire',async()=>{
 for(const action of ['intent-plan','intent-admit','intent-status','intent-revoke']){
  const args=[action,'--config','own.json','--intent','intent.json',...(action==='intent-plan'?['--output','planned.json']:[])]
  assert.equal(parseLocalAdministrationOwnerArgs(args).action,action)
  for(const flag of ['--token','--sql','--database-url','--employee-id','--force','--plan'])assert.throws(()=>parseLocalAdministrationOwnerArgs([...args,flag,'forbidden']))
 }
 const f=enrollmentFixture(),result=await f.prepare()
 assert.equal(result.status,'PLANNED');assert.equal(result.readiness.globalAdmissionEnabled,false);assert.equal(result.readiness.globalAdmissionWillNotBeChanged,true)
 assert.equal(result.plan.intent.admittingWorkload.dbSessionUser,'jenfu_orgmaster_migrator');assert.equal(result.plan.intent.expected.administrationVersion,0);assert.equal(result.plan.intent.principalId,'native-existing');assert.equal(f.state.intentWrites,0)
})
test('local intent admits once, reads back, revokes once and cannot re-admit a revoked target',async()=>{
 const f=enrollmentFixture();await f.prepare()
 assert.equal((await f.run('admit')).status,'ADMITTED');assert.equal((await f.run('admit')).status,'ADMITTED');assert.equal(f.state.intentWrites,1)
 assert.equal((await f.run('status')).status,'ADMITTED');assert.equal((await f.run('revoke')).status,'REVOKED');assert.equal((await f.run('revoke')).status,'REVOKED');assert.equal(f.state.revokeWrites,1)
 await assert.rejects(f.run('admit'),/INTENT_REVOKED/);assert.equal(f.state.intentWrites,1);assert.equal(f.state.binderCalls,0)
})
test('local intent rejects credentials, foreign identity, expired target and unqualified known Principal before mutation',async()=>{
 for(const change of [f=>f.input.idToken='forbidden',f=>f.input.directoryKey.idToken='forbidden',f=>f.input.environmentKey='jenfu_prod',f=>f.input.sourceRevision='0'.repeat(40),f=>f.input.expiresAt='2000-01-01T00:00:00.000Z',f=>f.state.accounts=[{principal_id:'native-existing',employee_id:'different-employee'}],f=>f.state.managed=[{employee_id:'different-employee',principal_id:'native-existing'}]]){
  const f=enrollmentFixture();change(f);await assert.rejects(f.prepare);assert.equal(f.state.intentWrites,0)
 }
 const unresolved=enrollmentFixture();unresolved.input.principalId=null;const result=await unresolved.prepare();assert.equal(result.plan.intent.principalId,null);assert.equal(result.readiness.principalResolution,'verified_google_pair_required')
})
test('local intent source, role, immutable ownership, target and policy CAS drift fail closed',async()=>{
 for(const change of [f=>f.source.workingTreeClean=false,f=>f.source.sourceSha256='0'.repeat(64),f=>f.context.config.target.port++,f=>f.state.roleRows[0].privileged=true,f=>f.state.beforeOwnership[0].body='drift',f=>f.state.governance='0'.repeat(64),f=>f.state.ledger[0].checksum_sha256='0'.repeat(64),f=>f.state.installed=false]){
  const f=enrollmentFixture();await f.prepare();change(f);await assert.rejects(f.run('admit'));assert.equal(f.state.intentWrites,0)
 }
 const expired=enrollmentFixture();await expired.prepare();await assert.rejects(expired.run('admit',expired.enrollmentPlan,Date.parse(expired.input.expiresAt)),/INTENT_EXPIRED/)
})
test('local intent unknown COMMIT uses terminal readback without rewriting an intent or root',async()=>{
 const f=enrollmentFixture();await f.prepare();f.state.failCommit=true
 await assert.rejects(f.run('admit'),/INTENT_COMMIT_UNKNOWN_REQUIRES_STATUS/);assert.equal(f.state.intentWrites,1)
 f.state.failCommit=false;assert.equal((await f.run('status')).status,'ADMITTED');await f.run('admit');assert.equal(f.state.intentWrites,1)
 f.state.intent.receipt={commandId:f.input.commandId,activation:'pending'}
 assert.equal((await f.run('status')).status,'ACTIVATION_PENDING');assert.equal((await f.run('admit')).status,'ACTIVATION_PENDING');await assert.rejects(f.run('revoke'),/INTENT_ALREADY_COMPLETED/);assert.equal(f.state.revokeWrites,0)
 f.state.intent.receipt.activation='acknowledged';assert.equal((await f.run('status')).status,'INITIALIZED')
})
test('local intent status survives expiry and source advancement but never a changed immutable intent',async()=>{
 const f=enrollmentFixture();await f.prepare();await f.run('admit');f.source.sourceRevision='f'.repeat(40)
 assert.equal((await f.run('status',f.enrollmentPlan,Date.parse(f.input.expiresAt)+1)).status,'EXPIRED')
 await assert.rejects(f.run('admit'));f.state.intent.intent.intent.directoryKey.userId='other-user';await assert.rejects(f.run('status'),/INTENT_RECEIPT_CONFLICT/)
})


test('local current47 ledger accepts exact installed rows and the known forward append',()=>{
 const current=entries.map(row)
 assert.deepEqual(validateLocalLedger(entries,current,database).pending,[])
 assert.equal(validateLocalLedger(entries,current,database).count,47)
 assert.deepEqual(validateLocalLedger(entries,current.slice(0,46),database).pending.map(e=>e.version),['dev070-orgmaster-051'])
 assert.throws(()=>validateLocalLedger(entries,[...current,{...current.at(-1),version:'unknown-048'}],database),/LEDGER_UNKNOWN/)
})
