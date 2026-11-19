import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createServer} from 'vite'
import {withAdministrationPostgresFixture,prepareAdministrationEnrollmentFixture} from './lib/dev070-administration-postgres-fixture.mjs'
const modulePath=process.env.DEV070_PLATFORM_FIXTURE_MODULE
if(!modulePath)throw new Error('DEV070_PLATFORM_OWNER_FIXTURE_MODULE_REQUIRED')
const {createAdministrationLifecycleFixtureDispatch}=await import(pathToFileURL(modulePath).href)
const loader=await createServer({root:process.cwd(),configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
try{
 const [{createAdministrationEnrollment},{createAdministrationLifecycleDispatcher},{createOrgmasterServer}]=await Promise.all([loader.ssrLoadModule('/server/orgmasterAdministrationEnrollment.ts'),loader.ssrLoadModule('/server/orgmasterAdministrationLifecycle.ts'),loader.ssrLoadModule('/server/orgmasterServer.ts')])
 const scope=handle=>console.log(JSON.stringify({scope:'ISOLATED_ONLY_ENROLLMENT',pid:handle.process.pid,port:handle.port,database:handle.databaseName}))
 async function httpFixture(fixture,enrollment,{autoDispatch=false}={}){
  const platform=await fixture.connect('platform-prod-runtime@jenfu-platform-prod.iam'),consume=createAdministrationLifecycleFixtureDispatch({database:platform,handle:fixture.handle})
  let directoryReads=0,tokenCalls=0
  const identity={issuer:enrollment.facts.issuer,subject:enrollment.facts.subject,email:enrollment.facts.primaryEmail,emailVerified:true,googleUserId:enrollment.facts.directoryUserId,signInProvider:'google.com',authenticatedAt:enrollment.facts.authenticatedAt,assuranceLevel:'aal1'}
  const firebase={verifyIdToken:async token=>{tokenCalls++;assert.equal(token,'opaque-isolated-memory-token');return {...identity}}}
  const directory={mode:'google-admin-readonly',readByDirectoryKey:async(customer,user)=>{directoryReads++;return {ok:true,user:{customerId:customer,userId:user,primaryEmail:identity.email,directoryState:'present',sourceEtag:null}}}}
  const dispatcher=createAdministrationLifecycleDispatcher({database:enrollment.runtime,dispatch:async claim=>consume({eventId:claim.eventId,snapshotHash:claim.snapshotHash,deliveryPrincipalId:'principal-workload:orgmaster-managed-identity-lifecycle'})})
  const service=createAdministrationEnrollment({database:enrollment.runtime,firebase,directory,directoryCustomerId:'fixture-customer',dispatcher:autoDispatch?dispatcher:undefined})
  const server=createOrgmasterServer({authRuntime:{configResult:{configured:false,missing:[],reason:'ISOLATED_AFTER_PROVIDER_ADAPTERS'},administrationEnrollment:service,administrationLifecycle:dispatcher,managedLoginCallerVerifier:{verify:async token=>{if(token!=='isolated-platform-service')throw new Error('caller');return {email:'isolated-platform-service',subject:'fixture-platform-subject'}}}}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address(),origin=`http://127.0.0.1:${address.port}`
  const body={contractVersion:'orgmaster.administration-enrollment.v1',requestId:randomUUID(),directoryCustomerId:'fixture-customer',idToken:'opaque-isolated-memory-token'}
  const post=async(value=body,caller='isolated-platform-service',path='/api/internal/administration-enrollment/v1/complete')=>{const r=await fetch(origin+path,{method:'POST',headers:{authorization:`Bearer ${caller}`,...(value===null?{}:{'content-type':'application/json'})},...(value===null?{}:{body:JSON.stringify(value)})});return {status:r.status,body:await r.json()}}
  return {platform,identity,body,post,directoryReads:()=>directoryReads,tokenCalls:()=>tokenCalls,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
 }
 await withAdministrationPostgresFixture(async fixture=>{
  scope(fixture.handle);const enrollment=await prepareAdministrationEnrollmentFixture(fixture),http=await httpFixture(fixture,enrollment)
  try{
   assert.equal((await http.post()).body.status,'not_applicable');assert.equal(http.directoryReads(),0)
   assert.equal((await http.post(http.body,'wrong-service')).status,401)
   assert.equal((await http.post({...http.body,principalId:'caller-selected'})).status,400)
   const admitted=await enrollment.admit();assert.deepEqual(await enrollment.admit(),admitted)
   await assert.rejects(enrollment.admit({...enrollment.intent,employeeId:'employee-two'}),/ADMINISTRATION_COMMAND_CONFLICT/)
   await assert.rejects(enrollment.runtime.query('SELECT orgmaster_core.admit_administration_enrollment_intent_v1($1::jsonb)',[JSON.stringify(enrollment.intent)]),error=>error.code==='42501')
   await assert.rejects(enrollment.runtime.query("SELECT orgmaster_core.prepare_administration_identity_owner_v1('{}')"),error=>error.code==='42501')
   const tokenTime=http.identity.authenticatedAt;http.identity.authenticatedAt=new Date(Date.now()-301000).toISOString();assert.equal((await http.post()).status,401);http.identity.authenticatedAt=tokenTime
   const missing={...enrollment.facts};delete missing.authenticatedAt;await assert.rejects(enrollment.complete(missing),/ADMIN_TARGET_INVALID/)
   const pending=await http.post();assert.equal(pending.status,200);assert.equal(pending.body.status,'activation_pending');assert.equal(pending.body.principalId,'principal-legacy');assert.equal(pending.body.employeeId,'employee-legacy');assert.equal(pending.body.authenticatedAt,tokenTime)
   assert.deepEqual(Object.keys(pending.body).sort(),['contractVersion','requestId','status','commandId','principalId','employeeId','issuer','subject','authenticatedAt'].sort())
   assert.equal((await http.platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows.length,0)
   const unrelatedId=randomUUID(),payload=JSON.stringify({contractVersion:'orgmaster.principal-lifecycle.v2',eventId:unrelatedId,operationId:'unrelated-isolated-fixture',sourceRevision:'unrelated',reasonCode:'managed_directory_observation_changed',principals:[]}),hash=createHash('sha256').update(payload).digest('hex')
   await fixture.admin.query("INSERT INTO orgmaster_core.principal_lifecycle_events_v2(event_id,operation_id,source_revision,originating_principal_id,reason_code,snapshot_text,snapshot_hash) VALUES($1,'unrelated-isolated-fixture','unrelated','fixture-workload','managed_directory_observation_changed',$2,$3)",[unrelatedId,payload,hash])
   await fixture.admin.query("INSERT INTO orgmaster_core.principal_lifecycle_delivery_v2(event_id,status,attempt_count) VALUES($1,'blocked',5)",[unrelatedId])
   const ownEvent=(await fixture.admin.query("SELECT e.event_id,trim(e.snapshot_hash) snapshot_hash FROM orgmaster_core.principal_lifecycle_events_v2 e WHERE reason_code='administration_changed'")).rows[0]
   assert.equal((await http.platform.query('SELECT orgmaster_contract.administration_lifecycle_event_eligible_v1($1::uuid,$2) allowed',[ownEvent.event_id,ownEvent.snapshot_hash])).rows[0].allowed,true)
   for(const [id,candidateHash]of[[ownEvent.event_id,'0'.repeat(64)],[unrelatedId,hash],[randomUUID(),'0'.repeat(64)]])assert.equal((await http.platform.query('SELECT orgmaster_contract.administration_lifecycle_event_eligible_v1($1::uuid,$2) allowed',[id,candidateHash])).rows[0].allowed,false)
   await assert.rejects(enrollment.runtime.query('SELECT orgmaster_contract.administration_lifecycle_event_eligible_v1($1::uuid,$2)',[ownEvent.event_id,ownEvent.snapshot_hash]),error=>error.code==='42501')
   await fixture.admin.query("UPDATE orgmaster_core.principal_lifecycle_delivery_v2 SET status='blocked',attempt_count=5 WHERE event_id=$1",[ownEvent.event_id])

   assert.equal((await http.post(null,'wrong-service','/api/internal/administration-lifecycle/v1')).status,401)
   const wake=await http.post(null,'isolated-platform-service','/api/internal/administration-lifecycle/v1');assert.equal(wake.status,200);assert.equal(wake.body.completed,1)
   assert.deepEqual((await fixture.admin.query('SELECT status,attempt_count FROM orgmaster_core.principal_lifecycle_delivery_v2 WHERE event_id=$1',[unrelatedId])).rows,[{status:'blocked',attempt_count:5}])
   const completed=await http.post();assert.equal(completed.status,200);assert.equal(completed.body.status,'completed');assert.equal(completed.body.principalId,'principal-legacy')
   assert.equal((await http.platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows.length,1)
   assert.equal((await fixture.admin.query("SELECT count(*) count FROM orgmaster_core.administrative_command_receipts_v1 WHERE operation='initialize_platform_administrator'")).rows[0].count,'1')
   const stored=(await fixture.admin.query("SELECT string_agg(response_payload::text,'') payload FROM orgmaster_core.managed_identity_command_receipts")).rows[0].payload
   assert.equal(stored.includes(http.body.idToken),false)
   await assert.rejects(enrollment.complete({...enrollment.facts,subject:'other-pair'}),/ADMIN_TARGET_INVALID/)
   console.log('PASS admitted legacy exact Principal reuse / real HTTP pending→filtered worker→Platform consumer ack→completed / no credential persistence / owner fences / unrelated queue untouched')
  }finally{await http.close()}
 })
 await withAdministrationPostgresFixture(async fixture=>{
  scope(fixture.handle);const enrollment=await prepareAdministrationEnrollmentFixture(fixture,{freshNative:true,noPublication:true}),http=await httpFixture(fixture,enrollment,{autoDispatch:true})
  try{
   await enrollment.admit()
   assert.equal((await fixture.admin.query("SELECT count(*) count FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-two'")).rows[0].count,'0')
   const results=await Promise.all([http.post(),http.post({...http.body,requestId:randomUUID()})])
   for(const result of results){assert.equal(result.status,200);assert.equal(result.body.status,'completed');assert.match(result.body.principalId,/^principal-managed:/)}
   assert.equal(results[0].body.principalId,results[1].body.principalId)
   assert.equal((await fixture.admin.query("SELECT count(*) count FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-two' AND link_state='active'")).rows[0].count,'1')
   const receipt=(await fixture.admin.query('SELECT result FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=$1',[enrollment.intent.commandId])).rows[0].result
   assert.equal(receipt.activation,'pending') // immutable terminal, activation is derived by readback
   const published=(await fixture.admin.query('SELECT orgmaster_core.read_administration_publication_v1() value')).rows[0].value
   assert.ok(published.policy.permissions.some(value=>value.code==='orgmaster.governance.manage'))
   assert.equal((await http.platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows.length,1)
   console.log('PASS fresh no-publication Google completion creates native identity only after verified proof, concurrent replay one Principal/once receipt, real auto-dispatch/ack')
  }finally{await http.close()}
 })
 await withAdministrationPostgresFixture(async fixture=>{
  scope(fixture.handle);const enrollment=await prepareAdministrationEnrollmentFixture(fixture,{freshNative:true,noPublication:true,admissionEnabled:false})
  await assert.rejects(enrollment.admit({...enrollment.intent,expiresAt:new Date(Date.now()+3600000).toISOString()}),/ADMINISTRATION_INTENT_EXPIRED/)
  await assert.rejects(enrollment.admit({...enrollment.intent,expected:{...enrollment.intent.expected,governanceRevision:'0'.repeat(64)}}),/ADMINISTRATION_CONFLICT/)
  await enrollment.admit();await assert.rejects(enrollment.complete(),/ADMINISTRATION_ENROLLMENT_NOT_READY/)
  assert.equal((await fixture.admin.query("SELECT count(*) count FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-two'")).rows[0].count,'0')
  await enrollment.owner.query('SELECT orgmaster_core.revoke_administration_enrollment_intent_v1($1::uuid)',[enrollment.intent.commandId])
  await assert.rejects(enrollment.complete(),/ADMINISTRATION_INTENT_REVOKED/)
  assert.equal((await fixture.admin.query('SELECT admission_enabled FROM orgmaster_core.managed_identity_admission_authority WHERE singleton')).rows[0].admission_enabled,false)
  console.log('PASS disabled global admission is explicit readiness failure, no native/root/flag side effect; owner revocation closes completion')
 })
}finally{await loader.close()}
