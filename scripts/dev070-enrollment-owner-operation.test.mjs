import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {parseEnrollmentIntentJobArgs,assertEnrollmentIntentInput,executeEnrollmentIntentOperation} from './dev070-production-enrollment-intent-runner.mjs'
import {parseEnrollmentOwnerOperationArgs} from './dev070-enrollment-owner-operation.mjs'
import {runEnrollmentIntentJob} from './dev070-production-enrollment-intent-runner.mjs'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {buildOrgmasterPackage} from './dev010-n1c-orgmaster-package.mjs'
import {buildDev040MigrationBundle} from './lib/dev040-orgmaster-independent-release.mjs'
import {canonicalize,crc32cBase64,sha256} from './lib/dev012-production-migration-runner.mjs'
import {stageReceipt} from './lib/dev012-owner-release-runtime.mjs'
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
 for(const flag of['--token','--database-url','--sql','--bootstrap','--force'])assert.throws(()=>parseEnrollmentOwnerOperationArgs([...args,flag,'no']))
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
