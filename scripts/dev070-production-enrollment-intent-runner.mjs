import pg from 'pg'
import {canonicalize,sha256,assertRunnerTarget,metadataAccessToken,readGcsObject,publishGcsJson,readMigrationLedger} from './lib/dev012-production-migration-runner.mjs'
import {TARGET,databaseOptions} from './lib/orgmaster-production-database.mjs'
import {assertDev070MigrationEntries} from './lib/dev070-administration-migration.mjs'
const H40=/^[a-f0-9]{40}$/,H64=/^[a-f0-9]{64}$/
const exact=(value,keys)=>value&&typeof value==='object'&&Object.keys(value).sort().join(',')===[...keys].sort().join(',')
const fail=code=>{throw new Error(code)}
export function assertEnrollmentIntentInput(value,action){
 const keys=['contractVersion','commandId','environmentKey','sourceRevision','employeeId','directoryKey','principalId','expiresAt','expected','reason','admittingWorkload']
 const text=value=>typeof value==='string'&&value.length>=1&&value.length<=255
 if(!exact(value,keys)||value.contractVersion!=='orgmaster.administration-enrollment-intent.v1'||!(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i).test(value.commandId)||value.environmentKey!=='jenfu_prod'||!H40.test(value.sourceRevision)||!text(value.employeeId)||!exact(value.directoryKey,['customerId','userId'])||!text(value.directoryKey.customerId)||!text(value.directoryKey.userId)||value.principalId!==null&&!text(value.principalId)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||new Date(value.expiresAt).toISOString()!==value.expiresAt||typeof value.reason!=='string'||value.reason.length<1||value.reason.length>240||value.reason.trim().normalize('NFC')!==value.reason)fail('DEV070_INTENT_MANIFEST_INVALID')
 if(!(action==='plan'&&value.expected===null)&&(!exact(value.expected,['governanceRevision','organizationRevision','administrationVersion'])||!text(value.expected.governanceRevision)||!text(value.expected.organizationRevision)||value.expected.administrationVersion!==0))fail('DEV070_INTENT_MANIFEST_INVALID')
 if(!(action==='plan'&&value.admittingWorkload===null)&&(!exact(value.admittingWorkload,['principalId','dbSessionUser','providerSubject'])||value.admittingWorkload.principalId!=='principal-workload:orgmaster-administration-initialize'||value.admittingWorkload.dbSessionUser!==TARGET.login||!(/^[0-9]{18,24}$/).test(value.admittingWorkload.providerSubject)))fail('DEV070_INTENT_MANIFEST_INVALID')
 return value
}
export function parseEnrollmentIntentJobArgs(argv){
 const names=['--operation-mode','--action','--intent-ref','--intent-sha256','--source-revision','--output-ref'],out={}
 for(let index=0;index<argv.length;index+=2){const key=argv[index];if(!names.includes(key)||typeof argv[index+1]!=='string'||out[key])fail('DEV070_INTENT_ARGUMENT_INVALID');out[key]=argv[index+1]}
 if(!exact(out,names)||out['--operation-mode']!=='DEV070_ENROLLMENT_INTENT'||!['plan','admit','revoke','status'].includes(out['--action'])||!H40.test(out['--source-revision'])||!H64.test(out['--intent-sha256']))fail('DEV070_INTENT_ARGUMENT_INVALID')
 return {action:out['--action'],intentRef:out['--intent-ref'],intentSha256:out['--intent-sha256'],sourceRevision:out['--source-revision'],outputRef:out['--output-ref']}
}
function sealed(value){const {receiptSha256,...core}=value??{};if(!H64.test(receiptSha256??'')||receiptSha256!==sha256(canonicalize(core)))fail('DEV070_INTENT_RELEASE_EVIDENCE_INVALID')}
async function readEnrollmentStatusWithObservation(database,commandId){
 await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 try{
  const result=(await database.query('SELECT orgmaster_core.read_administration_enrollment_intent_owner_v1($1::uuid) receipt',[commandId])).rows[0]?.receipt??null
  if(result===null)return null
  await database.query('SAVEPOINT dev070_capacity_observation')
  let observations
  try{
   const {rows}=await database.query(`SELECT pg_catalog.current_setting('jit') owner_session_jit_setting,pg_catalog.pg_jit_available() owner_session_jit_available,pg_catalog.jsonb_array_length(artifact.payload->'publishedVersions') governance_published_version_count,pg_catalog.octet_length(artifact.payload::text) governance_payload_logical_bytes,pg_catalog.pg_column_size(artifact.payload) governance_payload_column_bytes FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' AND artifact.artifact_kind='governance' WHERE authority.singleton`)
   const row=rows?.[0],counts=['governance_published_version_count','governance_payload_logical_bytes','governance_payload_column_bytes']
   if(rows?.length!==1||!exact(row,['owner_session_jit_setting','owner_session_jit_available',...counts])||!['on','off'].includes(row.owner_session_jit_setting)||typeof row.owner_session_jit_available!=='boolean'||counts.some(key=>!Number.isSafeInteger(row[key])||row[key]<0))fail('DEV070_STATUS_CAPACITY_OBSERVATION_INVALID')
   observations={status:'AVAILABLE',scope:'owner_session',ownerSessionJitSetting:row.owner_session_jit_setting,ownerSessionJitAvailable:row.owner_session_jit_available,governancePublishedVersionCount:row.governance_published_version_count,governancePayloadLogicalBytes:row.governance_payload_logical_bytes,governancePayloadColumnBytes:row.governance_payload_column_bytes}
  }catch{
   await database.query('ROLLBACK TO SAVEPOINT dev070_capacity_observation')
   observations={status:'UNAVAILABLE',code:'DEV070_STATUS_CAPACITY_OBSERVATION_UNAVAILABLE'}
  }
  await database.query('RELEASE SAVEPOINT dev070_capacity_observation')
  return {...result,observations}
 }finally{await database.query('ROLLBACK')}
}
export async function executeEnrollmentIntentOperation({database,manifest,action,sourceRevision}){
 if(!exact(manifest,['schemaVersion','ownerApplicationId','action','sourceRevision','releaseIntentRef','terminalRef','deploymentRef','migrationBundleRef','intent'])||manifest.schemaVersion!=='orgmaster.administration-enrollment-owner-operation.v1'||manifest.ownerApplicationId!=='orgmaster'||manifest.action!==action||manifest.sourceRevision!==sourceRevision||manifest.intent.sourceRevision!==sourceRevision)fail('DEV070_INTENT_MANIFEST_INVALID')
 assertEnrollmentIntentInput(manifest.intent,action)
 const actual=(await database.query("SELECT SESSION_USER::text session_user,current_database() database,pg_has_role(SESSION_USER,'jenfu_orgmaster_migrator','MEMBER') migrator,pg_has_role(SESSION_USER,'jenfu_orgmaster_runtime','MEMBER') runtime")).rows[0]
 if(!actual||actual.session_user!==TARGET.login||actual.database!=='jenfu_prod'||actual.migrator!==true||actual.runtime!==false||manifest.intent.environmentKey!==actual.database||manifest.intent.admittingWorkload.dbSessionUser!==actual.session_user)fail('DEV070_INTENT_DATABASE_IDENTITY_INVALID')
 if(action==='plan'){
  const row=(await database.query(`SELECT trim(a.canonical_sha256) governance_revision,e.workspace_revision,aa.admission_enabled FROM orgmaster_core.persistence_artifacts a JOIN orgmaster_core.persistence_authority authority ON a.batch_id=authority.active_batch_id CROSS JOIN orgmaster_core.managed_identity_admission_authority aa JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id=$1 AND e.employee_status='active' WHERE a.artifact_key='orgmaster-governance.v3.json' AND authority.singleton AND aa.singleton`,[manifest.intent.employeeId])).rows[0]
  const state=(await database.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows[0]
  if(!row||!state||Number(state.administration_version)!==0||state.initialized_by_command_id!==null)fail('DEV070_INTENT_PLAN_NOT_READY')
  return {status:'PLANNED',commandId:manifest.intent.commandId,intent:{...manifest.intent,expected:{governanceRevision:row.governance_revision,organizationRevision:row.workspace_revision,administrationVersion:0}},readiness:{globalAdmissionEnabled:row.admission_enabled,globalAdmissionWillNotBeChanged:true}}
 }
 if(action==='status')return readEnrollmentStatusWithObservation(database,manifest.intent.commandId)
 const sql=action==='admit'?'SELECT orgmaster_core.admit_administration_enrollment_intent_v1($1::jsonb) receipt':action==='revoke'?'SELECT orgmaster_core.revoke_administration_enrollment_intent_v1($1::uuid) receipt':'SELECT orgmaster_core.read_administration_enrollment_intent_owner_v1($1::uuid) receipt'
 return (await database.query(sql,[action==='admit'?JSON.stringify(manifest.intent):manifest.intent.commandId])).rows[0]?.receipt??null
}
export async function runEnrollmentIntentJob({argv=process.argv.slice(2),environment=process.env,fetchImpl=fetch,Client=pg.Client}={}){
 const args=parseEnrollmentIntentJobArgs(argv)
 assertRunnerTarget(environment,TARGET)
 const token=await metadataAccessToken(fetchImpl)
 const object=await readGcsObject({uri:args.intentRef,expectedBucket:TARGET.releaseBucket,expectedPrefix:'source/migration-bundles/enrollment-intents',token,fetchImpl})
 if(sha256(object.bytes)!==args.intentSha256)fail('DEV070_INTENT_INPUT_HASH_INVALID')
 const manifest=JSON.parse(object.bytes.toString('utf8'))
 const read=async(ref,prefix='receipts')=>{if(!exact(ref,['uri','sha256'])||!H64.test(ref.sha256))fail('DEV070_INTENT_REF_INVALID');const r=await readGcsObject({uri:ref.uri,expectedBucket:TARGET.releaseBucket,expectedPrefix:prefix,token,fetchImpl});if(sha256(r.bytes)!==ref.sha256)fail('DEV070_INTENT_REF_INVALID');return JSON.parse(r.bytes)}
 const intent=await read(manifest.releaseIntentRef),terminal=await read(manifest.terminalRef),deployment=await read(manifest.deploymentRef),bundle=await read(manifest.migrationBundleRef,'source/migration-bundles')
 sealed(terminal)
 if(terminal.stage!=='terminal'||terminal.ownerApplicationId!=='orgmaster'||terminal.sourceRevision!==args.sourceRevision||terminal.facts?.result!=='RELEASED'||terminal.facts?.remainingHumanAction!==0||deployment.sourceRevision!==args.sourceRevision||intent.sourceRevision!==args.sourceRevision||canonicalize(deployment.releaseIntentRef)!==canonicalize(manifest.releaseIntentRef)||canonicalize(deployment.migrationBundleRef)!==canonicalize(manifest.migrationBundleRef)||terminal.facts.artifactDigest!==deployment.artifactDigest)fail('DEV070_INTENT_RELEASE_EVIDENCE_INVALID')
 assertDev070MigrationEntries(bundle.entries)
 if(bundle.sourceRevision!==args.sourceRevision||bundle.manifestSha256!==intent.migrationManifestSha256)fail('DEV070_INTENT_RELEASE_EVIDENCE_INVALID')
 const identity=await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Frun.googleapis.com%2Fdev070-enrollment-intent&format=full',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(10000)})
 if(!identity.ok)fail('DEV070_INTENT_METADATA_IDENTITY_INVALID')
 const encoded=await identity.text();let claims;try{claims=JSON.parse(Buffer.from(encoded.split('.')[1],'base64url'))}catch{fail('DEV070_INTENT_METADATA_IDENTITY_INVALID')}
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!=='https://run.googleapis.com/dev070-enrollment-intent'||claims.email!=='orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com'||!(/^[0-9]{18,24}$/).test(claims.sub)||args.action!=='plan'&&claims.sub!==manifest.intent.admittingWorkload.providerSubject||claims.email_verified!==true)fail('DEV070_INTENT_METADATA_IDENTITY_INVALID')
 if(args.action==='plan')manifest.intent.admittingWorkload={principalId:'principal-workload:orgmaster-administration-initialize',dbSessionUser:TARGET.login,providerSubject:claims.sub}
 const database=new Client(databaseOptions(environment,token));await database.connect()
 try{
  const ledger=await readMigrationLedger(database,'orgmaster_core.schema_migrations')
  if(ledger.length!==bundle.entries.length||ledger.some((row,index)=>row.version!==bundle.entries[index].version||row.name!==bundle.entries[index].name||row.checksum_sha256!==bundle.entries[index].appliedSha256))fail('DEV070_INTENT_LEDGER_INVALID')
  const previous=await readGcsObject({uri:args.outputRef,expectedBucket:TARGET.releaseBucket,expectedPrefix:'receipts',token,fetchImpl}).catch(error=>{if(error.code==='MIGRATION_GCS_METADATA_FAILED'&&error.message==='MIGRATION_GCS_METADATA_FAILED:404')return null;throw error})
  if(previous){const receipt=JSON.parse(previous.bytes),{receiptSha256,...core}=receipt;if(receiptSha256!==sha256(canonicalize(core))||receipt.status!=='PASS'||receipt.sourceRevision!==args.sourceRevision||receipt.action!==args.action||receipt.commandId!==manifest.intent.commandId||canonicalize(receipt.inputRef)!==canonicalize({uri:args.intentRef,sha256:args.intentSha256})||canonicalize(receipt.releaseIntentRef)!==canonicalize(manifest.releaseIntentRef))fail('DEV070_INTENT_EXISTING_RECEIPT_INVALID');return receipt}
  const result=await executeEnrollmentIntentOperation({database,manifest,action:args.action,sourceRevision:args.sourceRevision})
  const core={schemaVersion:'orgmaster.administration-enrollment-owner-job-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:args.sourceRevision,action:args.action,commandId:manifest.intent.commandId,inputRef:{uri:args.intentRef,sha256:args.intentSha256},releaseIntentRef:manifest.releaseIntentRef,status:'PASS',result,observedAt:new Date().toISOString()}
  const receipt={...core,receiptSha256:sha256(canonicalize(core))}
  await publishGcsJson({uri:args.outputRef,expectedBucket:TARGET.releaseBucket,expectedPrefix:'receipts',value:receipt,token,fetchImpl})
  return receipt
 }finally{await database.end()}
}
