import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {parseEnrollmentIntentJobArgs,assertEnrollmentIntentInput,executeEnrollmentIntentOperation} from './dev070-production-enrollment-intent-runner.mjs'
import {parseEnrollmentOwnerOperationArgs,executeEnrollmentOwnerOperation} from './dev070-enrollment-owner-operation.mjs'
import {runEnrollmentIntentJob} from './dev070-production-enrollment-intent-runner.mjs'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {buildOrgmasterPackage} from './dev010-n1c-orgmaster-package.mjs'
import {buildDev040MigrationBundle} from './lib/dev040-orgmaster-independent-release.mjs'
import {canonicalize,crc32cBase64,sha256} from './lib/dev012-production-migration-runner.mjs'
import {releasePaths,stageReceipt} from './lib/dev012-owner-release-runtime.mjs'
const intent=()=>({contractVersion:'orgmaster.administration-enrollment-intent.v1',commandId:randomUUID(),environmentKey:'jenfu_prod',sourceRevision:'a'.repeat(40),employeeId:'employee-target',directoryKey:{customerId:'customer',userId:'immutable-user'},principalId:null,expiresAt:new Date(Date.now()+600000).toISOString(),expected:{governanceRevision:'b'.repeat(64),organizationRevision:'c'.repeat(64),administrationVersion:0},reason:'首位初始化',admittingWorkload:{principalId:'principal-workload:orgmaster-administration-initialize',dbSessionUser:'orgmaster-prod-migrator@jenfu-platform-prod.iam',providerSubject:'109999999999999999999'}})
test('intent job accepts one closed operation and rejects human-credential/SQL/bootstrap arguments',()=>{
 const args=['--operation-mode','DEV070_ENROLLMENT_INTENT','--action','admit','--intent-ref','gs://jenfu-platform-prod-orgmaster-release/source/migration-bundles/enrollment-intents/intent.json','--intent-sha256','b'.repeat(64),'--source-revision','a'.repeat(40),'--output-ref','gs://jenfu-platform-prod-orgmaster-release/receipts/intent.json']
 assert.equal(parseEnrollmentIntentJobArgs(args).action,'admit')
 for(const flag of['--id-token','--sql','--migration-mode','--employee-id','--target-database'])assert.throws(()=>parseEnrollmentIntentJobArgs([...args,flag,'forbidden']))
 assert.throws(()=>parseEnrollmentIntentJobArgs([...args,'--action','status']))
})
test('intent input is nonsensitive exact target metadata and has no user-chosen grants or provider pair',()=>{
 const value=intent();assert.doesNotThrow(()=>assertEnrollmentIntentInput(value,'admit'))
 for(const extra of[{idToken:'raw'},{grants:[]},{issuer:'caller'},{subject:'caller'},{directoryKey:{...value.directoryKey,idToken:'raw'}}])assert.throws(()=>assertEnrollmentIntentInput({...value,...extra},'admit'))
 assert.doesNotThrow(()=>assertEnrollmentIntentInput({...value,expected:null,admittingWorkload:null},'plan'))
 assert.throws(()=>assertEnrollmentIntentInput({...value,expected:null},'admit'))
})
test('closed owner CLI exposes only plan/admit/revoke/status against an immutable own released capsule',()=>{
 const args=['--action','status','--intent-file','nonsensitive-intent.json','--release-capsule-ref',`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV070/release-intent.json#sha256=${'b'.repeat(64)}`]
 assert.equal(parseEnrollmentOwnerOperationArgs(args).action,'status')
 for(const flag of['--token','--database-url','--sql','--bootstrap','--force','--observation-id'])assert.throws(()=>parseEnrollmentOwnerOperationArgs([...args,flag,'no']))
})
test('job SQL writes are restricted to the current migrator SESSION_USER and one typed owner function',async()=>{
 const value=intent(),seen=[];const manifest={schemaVersion:'orgmaster.administration-enrollment-owner-operation.v1',ownerApplicationId:'orgmaster',action:'admit',sourceRevision:value.sourceRevision,releaseIntentRef:{},terminalRef:{},deploymentRef:{},migrationBundleRef:{},intent:value}
 const database={query:async(sql,values)=>{seen.push({sql,values});return {rows:sql.includes('SESSION_USER')?[{session_user:value.admittingWorkload.dbSessionUser,database:'jenfu_prod',migrator:true,runtime:false}]:[{receipt:{admitted:true}}]}}}
 assert.deepEqual(await executeEnrollmentIntentOperation({database,manifest,action:'admit',sourceRevision:value.sourceRevision}),{admitted:true})
 assert.equal(seen.length,2);assert.match(seen[1].sql,/admit_administration_enrollment_intent_v1/)
 const denied={query:async()=>({rows:[{session_user:'runtime',database:'jenfu_prod',migrator:false,runtime:true}]})}
 await assert.rejects(executeEnrollmentIntentOperation({database:denied,manifest,action:'admit',sourceRevision:value.sourceRevision}),/DATABASE_IDENTITY_INVALID/)
})

function sealedJobFixture({action='admit'}={}){
 const root=fileURLToPath(new URL('../',import.meta.url)),profile=JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json',import.meta.url))),n1c=JSON.parse(readFileSync(new URL('../config/dev-010/n1c-orgmaster.json',import.meta.url)))
 const source='a'.repeat(40),files=new Map(profile.migrations.entries.map(row=>[row.path,readFileSync(new URL('../'+row.path,import.meta.url))]))
 const bundle=buildDev040MigrationBundle(profile,buildOrgmasterPackage(n1c,root),files,source).bundle
 const objects=new Map(),put=(uri,value)=>{const bytes=Buffer.from(canonicalize(value)+'\n');objects.set(uri,bytes);return {uri,sha256:sha256(bytes)}}
 const bucket='jenfu-platform-prod-orgmaster-release',value=intent(),bundleRef=put(`gs://${bucket}/source/migration-bundles/current.json`,bundle)
 const releasedIntent={schemaVersion:profile.schemas.releaseIntent,ownerApplicationId:'orgmaster',releaseId:'DEV070-SEALED-TEST',sourceRevision:source,migrationManifestSha256:bundle.manifestSha256}
 const releaseIntentRef=put(`gs://${bucket}/receipts/releases/DEV070/release-intent.json`,releasedIntent)
 const deployment={schemaVersion:profile.schemas.deploymentCapsule,ownerApplicationId:'orgmaster',sourceRevision:source,releaseIntentRef,migrationBundleRef:bundleRef,artifactDigest:`${profile.artifact.uri}@sha256:${'b'.repeat(64)}`,migrationRunnerDigest:`${profile.artifact.migrationRunnerUri}@sha256:${'c'.repeat(64)}`}
 const deploymentRef=put(`gs://${bucket}/receipts/releases/DEV070/deployment.json`,deployment)
 const terminal=stageReceipt({profile,intent:releasedIntent,stage:'terminal',facts:{result:'RELEASED',remainingHumanAction:0,artifactDigest:deployment.artifactDigest},observedAt:'2026-11-06T00:00:00.000Z'})
 const terminalRef=put(`gs://${bucket}/receipts/releases/DEV070/terminal.json`,terminal)
 const manifest={schemaVersion:'orgmaster.administration-enrollment-owner-operation.v1',ownerApplicationId:'orgmaster',action,sourceRevision:source,releaseIntentRef,terminalRef,deploymentRef,migrationBundleRef:bundleRef,intent:value}
 const inputUri=`gs://${bucket}/source/migration-bundles/enrollment-intents/input.json`,outputUri=`gs://${bucket}/receipts/administration-enrollment/result.json`
 let inputRef=put(inputUri,manifest),writes=0,connections=0;const queries=[]
 const environment={OWNER_APPLICATION_ID:'orgmaster',RELEASE_BUCKET:bucket,GOOGLE_CLOUD_PROJECT:'jenfu-platform-prod',GOOGLE_CLOUD_REGION:'asia-east1',CLOUD_SQL_INSTANCE_CONNECTION_NAME:'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',POSTGRES_DATABASE:'jenfu_prod',POSTGRES_IAM_LOGIN:value.admittingWorkload.dbSessionUser,POSTGRES_SOCKET:'/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',CLOUD_RUN_JOB:'orgmaster-prod-migration-runner'}
 const claims={iss:'https://accounts.google.com',aud:'https://run.googleapis.com/dev070-enrollment-intent',email:'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',email_verified:true,sub:value.admittingWorkload.providerSubject}
 const identityRow={session_user:value.admittingWorkload.dbSessionUser,database:'jenfu_prod',migrator:true,runtime:false}
 const ledger=bundle.entries.map(row=>({version:row.version,name:row.name,checksum_sha256:row.appliedSha256,source_revision:source}))
 class Client{async connect(){connections++}async end(){}async query(sql,parameters){queries.push({sql,parameters});if(sql.includes('schema_migrations'))return {rows:ledger};if(sql.includes('SESSION_USER'))return {rows:[identityRow]};if(sql.includes('admit_administration')){writes++;return {rows:[{receipt:{admitted:true}}]}};if(sql.includes('governance_revision'))return {rows:[{governance_revision:'b'.repeat(64),workspace_revision:'c'.repeat(64),admission_enabled:true}]};if(sql.includes('read_administration_state'))return {rows:[{administration_version:'0',initialized_by_command_id:null}]};return {rows:[{receipt:{found:true}}]}}}
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
 const fetchImpl=async(uri,options={})=>{
  const url=new URL(uri)
  if(url.hostname==='metadata.google.internal'){assert.equal(options.headers['Metadata-Flavor'],'Google');return url.pathname.endsWith('/token')?json({access_token:'x'.repeat(40),expires_in:300}):new Response('header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.metadata-provider-signature')}
  assert.equal(url.hostname,'storage.googleapis.com')
  if(url.pathname.startsWith('/upload/')){const target=`gs://${bucket}/`+url.searchParams.get('name');if(objects.has(target))return json({},412);objects.set(target,Buffer.from(options.body));return json({generation:'1'})}
  const target=`gs://${bucket}/`+decodeURIComponent(url.pathname.split('/o/')[1]),bytes=objects.get(target)
  if(!bytes)return json({},404)
  return url.searchParams.get('alt')==='media'?new Response(bytes):json({generation:'1',crc32c:crc32cBase64(bytes)})
 }
 const argv=()=>['--operation-mode','DEV070_ENROLLMENT_INTENT','--action',action,'--intent-ref',inputRef.uri,'--intent-sha256',inputRef.sha256,'--source-revision',source,'--output-ref',outputUri]
 return {manifest,terminal,deployment,claims,ledger,identityRow,objects,queries,inputUri,outputUri,put,refresh(){inputRef=put(inputUri,manifest)},run:()=>runEnrollmentIntentJob({argv:argv(),environment,fetchImpl,Client}),writes:()=>writes,connections:()=>connections}
}
function sealedOwnerFixture({action='plan',mutateBundle=()=>{},baselineSource='a'.repeat(40),terminalResult='RELEASED'}={}){
 const f=sealedJobFixture({action}),{objects,put}=f,profile=JSON.parse(readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json',import.meta.url)))
 const bucket=profile.artifact.releaseBucket,value=intent(),bundle=JSON.parse(objects.get(f.manifest.migrationBundleRef.uri))
 bundle.sourceRevision=baselineSource;mutateBundle(bundle)
 const {manifestSha256,...bundleCore}=bundle;bundle.manifestSha256=sha256(canonicalize(bundleCore))
 const receipt=(name,data)=>put(`gs://${bucket}/receipts/owner-fixture/${name}.json`,data)
 const released={schemaVersion:profile.schemas.releaseIntent,ownerApplicationId:'orgmaster',releaseId:'DEV070-OWNER-TEST',sourceRevision:baselineSource,sourceSha256:'e'.repeat(64),
  sourceLockRef:receipt('source',{}),authorizationPolicyRef:receipt('auth',{}),readinessReceiptRef:receipt('readiness',{}),foundationReceiptRef:receipt('foundation',{}),
  infraReceiptRef:receipt('infra',{}),runtimeConfigRef:receipt('runtime',{}),migrationManifestSha256:bundle.manifestSha256,previousRevision:'orgmaster-prod-previous',deadlineAt:'2026-11-06T00:00:00.000Z'}
 const releaseIntentRef=receipt('intent',released),paths=releasePaths(profile,released,releaseIntentRef.sha256)
 const bundleRef=put(`gs://${bucket}/source/migration-bundles/owner-fixture.json`,bundle)
 const deployment={sourceRevision:baselineSource,releaseIntentRef,migrationBundleRef:bundleRef,artifactDigest:`${profile.artifact.uri}@sha256:${'d'.repeat(64)}`}
 const deploymentRef=put(paths.deployment,deployment),migrationRef=put(paths.migrate,{schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:baselineSource,manifestSha256:bundle.manifestSha256,status:'PASS',boundaryStatus:'PASS'})
 const seal=(stage,facts)=>stageReceipt({profile,intent:released,stage,facts,observedAt:'2026-11-06T00:00:00.000Z'})
 put(paths.candidate,seal('candidate',{deploymentCapsuleRef:deploymentRef,migrationReceiptRef:migrationRef,candidateRevision:'orgmaster-prod-released'}))
 put(paths.terminal,seal('terminal',{result:terminalResult,remainingHumanAction:0,candidateRevision:'orgmaster-prod-released',artifactDigest:deployment.artifactDigest}))
 const read=uri=>{const bytes=objects.get(uri);if(!bytes)throw Object.assign(new Error('MISSING'),{code:'MISSING',detail:'404'});return {bytes,ref:{uri,sha256:sha256(bytes)},value:JSON.parse(bytes)}}
 let puts=0,runs=0,nativeResult=action==='plan'?{status:'PLANNED'}:action==='status'?null:{status:'OBSERVED'}
 const outputUris=[]
 const transport={async readJson(ref){const row=read(ref.uri);assert.equal(row.ref.sha256,ref.sha256);return row},async readBytes(uri){return read(uri)},
  async putJson(uri,data){puts++;return read(put(uri,data).uri)},async runMigrationJob({outputUri,enrollmentIntentOperation}){
   runs++;const input=read(enrollmentIntentOperation.ref.uri).value
   outputUris.push(outputUri);assert.equal(objects.has(outputUri),false,'observations must be create-only')
   const core={sourceRevision:value.sourceRevision,commandId:value.commandId,action,inputRef:enrollmentIntentOperation.ref,status:'PASS',result:structuredClone(nativeResult)}
   put(outputUri,{...core,receiptSha256:sha256(canonicalize(core))});assert.equal(input.migrationBundleRef.sha256,bundleRef.sha256)
  }}
 return {run:()=>executeEnrollmentOwnerOperation({profile,transport,sourceRevision:value.sourceRevision,releaseIntentRef,intent:value,action}),puts:()=>puts,runs:()=>runs,
  setNativeResult:next=>{nativeResult=next},outputUris,readOutput:uri=>Buffer.from(objects.get(uri))}
}

test('owner adapter accepts the current exact43 sealed RELEASED manifest and reuses immutable plan/admit/revoke receipts',async()=>{
 for(const action of['plan','admit','revoke']){
  const f=sealedOwnerFixture({action}),first=await f.run()
  assert.equal(first.status,'PASS');assert.equal(f.runs(),1)
  assert.deepEqual(await f.run(),first);assert.equal(f.runs(),1)
 }
})
test('owner status obtains fresh native initialized/revoked observations after pending without overwriting old output',async()=>{
 for(const state of['INITIALIZED','REVOKED']){
  const f=sealedOwnerFixture({action:'status'}),pending=await f.run()
  assert.equal(pending.result,null);assert.equal(f.runs(),1)
  const oldBytes=f.readOutput(pending.receiptRef.uri)
  f.setNativeResult({status:state,receiptId:'native-'+state.toLowerCase()})
  const fresh=await f.run()
  assert.deepEqual(fresh.result,{status:state,receiptId:'native-'+state.toLowerCase()});assert.equal(f.runs(),2)
  assert.notEqual(fresh.receiptRef.uri,pending.receiptRef.uri)
  assert.match(fresh.receiptRef.uri,/\/status-[a-f0-9]{64}-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.json$/)
  assert.deepEqual(fresh.inputRef,pending.inputRef,'fresh observations must not alter the admitted operation')
  assert.deepEqual(f.readOutput(pending.receiptRef.uri),oldBytes)
  assert.equal(f.outputUris.length,2)
 }
})
test('owner rejects historical42, unknown44 and altered exact manifest identities before publishing or running a Job',async()=>{
 const cases=[
  bundle=>{bundle.entries.pop()},
  bundle=>{const entry={...bundle.entries.at(-1),order:44,version:'dev070-orgmaster-048',path:'db/migrations/048_unknown.sql',name:'unknown'};bundle.entries.push(entry)},
  bundle=>{bundle.entries[0].sourceSha256='0'.repeat(64)},
  bundle=>{bundle.entries.at(-1).sourceSha256='0'.repeat(64)},
  bundle=>{bundle.entries.at(-1).path='db/migrations/047_foreign.sql'},
  bundle=>{const entry=bundle.entries.at(-1);entry.sqlBase64=Buffer.from('SELECT 1;').toString('base64');entry.appliedSha256=sha256(Buffer.from('SELECT 1;'))},
 ]
 for(const [index,mutateBundle] of cases.entries()){
  const f=sealedOwnerFixture({mutateBundle})
  await assert.rejects(f.run(),index===2?/MIGRATION_PREFIX_001_031_DRIFT/:/DEV070_MIGRATION_APPEND_INVALID/)
  assert.equal(f.puts(),0);assert.equal(f.runs(),0)
 }
})
test('owner preserves same-source and RELEASED evidence requirements before any enrollment artifact or Job',async()=>{
 for(const options of[{baselineSource:'b'.repeat(40)},{terminalResult:'FORWARD_APPLIED'}]){
  const f=sealedOwnerFixture(options);await assert.rejects(f.run(),/(?:RELEASE_NOT_READY|BASELINE_NOT_RELEASED)/);assert.equal(f.puts(),0);assert.equal(f.runs(),0)
 }
})

test('actual runner joins sealed owner receipts, metadata identity and exact live ledger before writing intent, then reuses output',async()=>{
 const fixture=sealedJobFixture();const first=await fixture.run();assert.equal(first.status,'PASS');assert.equal(fixture.writes(),1)
 assert.equal(first.result.admitted,true);assert.deepEqual(await fixture.run(),first);assert.equal(fixture.writes(),1)
 assert.equal(fixture.queries.filter(row=>row.sql.includes('admit_administration')).length,1)
})
test('actual runner readonly plan fills source CAS without creating an intent',async()=>{
 const fixture=sealedJobFixture({action:'plan'});fixture.manifest.intent.expected=null;fixture.manifest.intent.admittingWorkload=null;fixture.refresh()
 const result=await fixture.run();assert.equal(result.result.status,'PLANNED');assert.equal(result.result.intent.expected.administrationVersion,0);assert.equal(fixture.writes(),0)
})
test('actual runner rejects unsealed/foreign/source-drifted release evidence before any database mutation',async()=>{
 for(const mutate of[
  f=>{f.terminal.facts.result='ROLLED_BACK';f.manifest.terminalRef=f.put(f.manifest.terminalRef.uri,f.terminal)},
  f=>{f.deployment.sourceRevision='0'.repeat(40);f.manifest.deploymentRef=f.put(f.manifest.deploymentRef.uri,f.deployment)},
  f=>{f.claims.sub='100000000000000000000'},
  f=>{f.ledger[41].checksum_sha256='0'.repeat(64)},
  f=>{f.identityRow.runtime=true},
 ]){const fixture=sealedJobFixture();mutate(fixture);fixture.refresh();await assert.rejects(fixture.run());assert.equal(fixture.writes(),0)}
})
