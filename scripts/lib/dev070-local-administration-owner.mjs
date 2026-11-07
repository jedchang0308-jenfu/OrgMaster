import {createHash,randomUUID} from 'node:crypto'
import {readFile,lstat,realpath} from 'node:fs/promises'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {GoogleAuth,Impersonated,OAuth2Client} from 'google-auth-library'
import {assertDev070MigrationEntries} from './dev070-administration-migration.mjs'
import {unwrapMigrationTransaction} from './dev040-orgmaster-independent-release.mjs'
export const LOCAL_BRIDGE_PATH='db/migrations/local/046_dev070_local_administration_bridge_v1.sql'
export const LOCAL_OWNER_BOOTSTRAP_PATH='db/dev-010/071_local_orgmaster_administration_owner_bootstrap_v2.sql'
export const OWNER_BOOTSTRAP_SIGNATURES=['orgmaster_core.read_active_persistence_artifact_v1(text)','orgmaster_core.read_active_persistence_authority_v1()','orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text)']
export const OWNER_EMAIL='dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com'
export const OWNER_SUBJECT='109035753048386897825'
const PRINCIPALS=['principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation']
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
export const localOwnerHash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:canonical(value)).digest('hex')
const fail=code=>{throw Object.assign(new Error('DEV070_LOCAL_'+code),{code:'DEV070_LOCAL_'+code})}
export function validateLocalLedger(entries,rows,database){
 assertDev070MigrationEntries(entries)
 if(!Array.isArray(rows)||![39,40,41,42,43,44,45].includes(rows.length)||new Set(rows.map(r=>r.version)).size!==rows.length)fail('LEDGER_UNKNOWN')
 const byVersion=new Map(rows.map(r=>[r.version,r]))
 for(const entry of entries.slice(0,rows.length)){
  const row=byVersion.get(entry.version),name=entry.path.split('/').at(-1).replace(/^\d{3}_/u,'').replace(/\.sql$/u,'')
  const raw042=entry.version==='dev057-orgmaster-042'&&row?.checksum_sha256===entry.sourceSha256&&/^LOCAL_GENESIS:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(row.source_revision)&&database.endsWith('_'+row.source_revision.slice(14,22))
  if(!row||row.name!==name||row.checksum_sha256!==entry.appliedSha256&&!raw042||!raw042&&!/^[a-f0-9]{40}$/u.test(row.source_revision))fail('LEDGER_UNKNOWN')
 }
 return {count:rows.length,raw042:rows.find(r=>r.version==='dev057-orgmaster-042')?.checksum_sha256===entries[39].sourceSha256,pending:entries.slice(rows.length)}
}
export async function readLocalOwnerSource(context){
 const root=context.ownerRoot,profile=JSON.parse(await readFile(path.join(root,'config/release/dev040-orgmaster-independent-production-v3.json'),'utf8'))
 assertDev070MigrationEntries(profile.migrations.entries)
 const entries=profile.migrations.entries
 const migrations=[]
 for(const entry of entries.slice(39)){
  const bytes=await readFile(path.join(root,entry.path)),sql=unwrapMigrationTransaction(bytes)
  if(localOwnerHash(bytes)!==entry.sourceSha256||localOwnerHash(sql)!==entry.appliedSha256)fail('SOURCE_MISMATCH')
  migrations.push({...entry,name:entry.path.split('/').at(-1).replace(/^\d{3}_/u,'').replace(/\.sql$/u,''),sql})
 }
 const localBytes=await readFile(path.join(root,LOCAL_BRIDGE_PATH)),localSql=unwrapMigrationTransaction(localBytes)
 const bootstrapBytes=await readFile(path.join(root,LOCAL_OWNER_BOOTSTRAP_PATH)),ownershipSql=unwrapMigrationTransaction(bootstrapBytes)
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024})
 const sourceRevision=git(['rev-parse','HEAD']).trim(),dirty=git(['diff','--binary','HEAD'])
 if(!/^[a-f0-9]{40}$/u.test(sourceRevision))fail('SOURCE_MISMATCH')
 const ownPaths=['scripts/dev070-local-administration-owner.mjs','scripts/lib/dev070-local-administration-owner.mjs','server/orgmasterLocalAdministrationRuntime.ts',LOCAL_BRIDGE_PATH,LOCAL_OWNER_BOOTSTRAP_PATH]
 const inputs=await Promise.all(ownPaths.map(async p=>[p,localOwnerHash(await readFile(path.join(root,p)))]))
 const neutralPaths=['scripts/lib/dev021-local-postgres-cluster.mjs','scripts/lib/dev-local-process-ownership.mjs']
 const neutral=await Promise.all(neutralPaths.map(async p=>{const filename=path.join(context.platformRoot,p);if((await lstat(filename)).isSymbolicLink()||await realpath(filename)!==filename)fail('NEUTRAL_SOURCE_INVALID');return [p,localOwnerHash(await readFile(filename))]}))
 const sourceSha256=localOwnerHash({sourceRevision,dirty,inputs,neutral,migrations:migrations.map(({sql,...v})=>v)})
 return {sourceRevision,sourceSha256,workingTreeClean:git(['status','--porcelain','-uall']).trim()==='',entries,migrations,localMigration:{path:LOCAL_BRIDGE_PATH,sourceSha256:localOwnerHash(localBytes),appliedSha256:localOwnerHash(localSql)},ownershipBootstrap:{path:LOCAL_OWNER_BOOTSTRAP_PATH,sourceSha256:localOwnerHash(bootstrapBytes),appliedSha256:localOwnerHash(ownershipSql)},ownershipSql,localSql,neutral}
}
/** Only the explicitly selected existing neutral cluster inspector is imported. */
export async function inspectLocalOwnerCluster(context,source){
 const modulePath=path.join(context.platformRoot,'scripts/lib/dev021-local-postgres-cluster.mjs')
 for(const [relative,hash] of source.neutral)if(localOwnerHash(await readFile(path.join(context.platformRoot,relative)))!==hash)fail('NEUTRAL_SOURCE_CHANGED')
 const module=await import(pathToFileURL(modulePath).href),cluster=await module.inspectLocalPostgresCluster({taskRoot:context.clusterRoot})
 const recordBytes=await readFile(path.join(context.clusterRoot,'private/control/cluster.json')),record=JSON.parse(recordBytes)
 if(cluster.root!==context.clusterRoot||cluster.postmaster.pid!==context.config.postmaster.pid||cluster.postmaster.port!==context.config.target.port||cluster.postmaster.dataDirectory!==context.config.postmaster.dataDirectory||record.postmaster?.startToken!==context.config.postmaster.startToken||!Object.hasOwn(cluster,'adminConnection')||Object.prototype.propertyIsEnumerable.call(cluster,'adminConnection'))fail('CLUSTER_MISMATCH')
 return {cluster,recordSha256:localOwnerHash(recordBytes)}
}
export async function verifyLocalOwnerGoogleIdentity(context,{now=Date.now,fetchIdentity}={}){
 let token
 if(fetchIdentity)token=await fetchIdentity()
 else{
  const auth=new GoogleAuth({credentials:context.credentials,projectId:'jenfu-platform-nonprod',scopes:['https://www.googleapis.com/auth/cloud-platform']})
  const sourceClient=await auth.getClient(),client=new Impersonated({sourceClient,targetPrincipal:OWNER_EMAIL,targetScopes:['https://www.googleapis.com/auth/cloud-platform'],lifetime:300})
  token=await client.fetchIdToken('http://localhost:1010')
 }
 const client=new OAuth2Client(),payload=(await client.verifyIdToken({idToken:token,audience:'http://localhost:1010'})).getPayload()
 if(!payload||!['accounts.google.com','https://accounts.google.com'].includes(payload.iss)||payload.email!==OWNER_EMAIL||payload.email_verified!==true||payload.sub!==OWNER_SUBJECT||!Number.isFinite(payload.iat)||now()/1000-Number(payload.iat)<0||now()/1000-Number(payload.iat)>300||!payload.exp||payload.exp*1000<=now())fail('OWNER_IDENTITY_INVALID')
 return {email:OWNER_EMAIL,subject:OWNER_SUBJECT}
}
export async function assertOwnerSession(client,target){
 const row=(await client.query("SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,session_user,current_user,pg_has_role(session_user,'jenfu_orgmaster_migrator','MEMBER') migrator,pg_has_role(session_user,'jenfu_orgmaster_runtime','MEMBER') runtime")).rows[0]
 if(!row||row.database!==target.database||row.host!==target.host||Number(row.port)!==target.port||row.session_user!=='jenfu_orgmaster_migrator'||row.current_user!==row.session_user||row.migrator!==true||row.runtime!==false)fail('OWNER_SESSION_INVALID')
}
export async function readLocalOwnerBootstrapFacts(client){
 return (await client.query(`SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition,p.prosrc body,
 encode(public.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') AS "definitionSha256",encode(public.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS "bodySha256",p.prosecdef AS "securityDefiner",COALESCE(p.proconfig,ARRAY[]::text[]) configuration,
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.grantor),'[]'::jsonb) FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))a) acl
 FROM pg_proc p WHERE p.oid::regprocedure::text=ANY($1::text[]) ORDER BY signature`,[OWNER_BOOTSTRAP_SIGNATURES])).rows
}
export async function readLocalOwnerFacts(client,context,source){
 await assertOwnerSession(client,context.config.target)
 const schemas=(await client.query("SELECT nspname,pg_has_role(session_user,nspowner,'USAGE') schema_owner,has_schema_privilege(session_user,oid,'USAGE') schema_usage,has_schema_privilege(session_user,oid,'CREATE') schema_create FROM pg_namespace WHERE nspname IN ('orgmaster_core','orgmaster_contract') ORDER BY nspname")).rows
 if(schemas.length!==2||schemas.some(r=>r.schema_owner!==true||r.schema_usage!==true||r.schema_create!==true))fail('DDL_AUTHORITY_NOT_READY')
 const foreign=(await client.query(`SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('orgmaster_core','orgmaster_contract') AND NOT pg_has_role(session_user,c.relowner,'USAGE')) relations,
 EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('orgmaster_core','orgmaster_contract') AND p.oid::regprocedure::text<>ALL($1::text[]) AND NOT pg_has_role(session_user,p.proowner,'USAGE')) functions`,[OWNER_BOOTSTRAP_SIGNATURES])).rows[0]
 if(!foreign||foreign.relations!==false||foreign.functions!==false)fail('DDL_AUTHORITY_NOT_READY')
 const beforeOwnership=await readLocalOwnerBootstrapFacts(client)
 if(beforeOwnership.length!==3||beforeOwnership.some(r=>!OWNER_BOOTSTRAP_SIGNATURES.includes(r.signature)||!['postgres','jenfu_orgmaster_migrator'].includes(r.owner)))fail('DDL_AUTHORITY_NOT_READY')
 const ledger=(await client.query('SELECT version,name,btrim(checksum_sha256) checksum_sha256,source_revision FROM orgmaster_core.schema_migrations ORDER BY applied_at,version')).rows
 const disposition=validateLocalLedger(source.entries,ledger,context.config.target.database)
 const bindings=(await client.query('SELECT principal_id,owner,purpose,provider_issuer,provider_subject,db_session_user,binding_version::text binding_version,enabled FROM orgmaster_core.workload_principal_bindings WHERE principal_id=ANY($1::text[]) ORDER BY principal_id',[PRINCIPALS])).rows
 if(bindings.length!==2)fail('BINDING_UNAVAILABLE')
 const roleNames=[`dev069_orgmaster_${context.runId.slice(0,12)}`,`dev069_platform_${context.runId.slice(0,12)}`,`fms_test_runtime_${context.runId.slice(0,12)}`]
 const roles=(await client.query(`SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
 pg_has_role(r.rolname,'jenfu_orgmaster_runtime','MEMBER') org_runtime,pg_has_role(r.rolname,'jenfu_platform_runtime','MEMBER') platform_runtime,pg_has_role(r.rolname,'fms_runtime','MEMBER') fms_runtime,
 EXISTS(SELECT 1 FROM pg_roles p WHERE pg_has_role(r.rolname,p.oid,'MEMBER') AND(p.rolsuper OR p.rolcreaterole OR p.rolcreatedb OR p.rolreplication OR p.rolbypassrls OR p.rolname~*'(owner|migrator)')) privileged,
 EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(r.rolname,d.datdba,'USAGE')) database_owner,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege(r.rolname,n.oid,'CREATE')) schema_create
 FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname`,[roleNames])).rows
 if(roles.length!==3||roles.some(r=>!roleNames.includes(r.rolname)||r.rolcanlogin!==true||['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','privileged','database_owner','schema_create'].some(k=>r[k]!==false)||['org_runtime','platform_runtime','fms_runtime'].some((k,i)=>r[k]!== (roleNames[i]===r.rolname))))fail('RUNTIME_ROLE_INVALID')
 const installation=(await client.query("SELECT to_regclass('orgmaster_core.administration_local_bridge_installations_v1') IS NOT NULL present")).rows[0]?.present
 const installed=installation?(await client.query('SELECT source_path,source_sha256,source_revision FROM orgmaster_core.administration_local_bridge_installations_v1 WHERE singleton')).rows:null
 if(installed&&(installed.length!==1||installed[0].source_path!==LOCAL_BRIDGE_PATH||installed[0].source_sha256!==source.localMigration.sourceSha256))fail('LOCAL_MIGRATION_CONFLICT')
 return {ledger,ledgerSha256:localOwnerHash(ledger),bindings,bindingsSha256:localOwnerHash(bindings),runtimeRolesSha256:localOwnerHash(roles),beforeOwnership,disposition,installed:!!installed}
}
export function planLocalOwnerBridge({context,source,facts,ownerProof,commandId=randomUUID(),reason,now=Date.now()}){
 if(typeof reason!=='string'||!reason.trim()||reason!==reason.normalize('NFC').trim()||reason.length>240)fail('REASON_INVALID')
 const core={format:'orgmaster.local-administration-bridge-plan.v1',commandId,sourceRevision:source.sourceRevision,sourceSha256:source.sourceSha256,configurationSha256:context.configurationSha256,profileSha256:context.config.profileRef.sha256,sqlProfileSha256:context.config.sqlProfileRef.sha256,runId:context.runId,target:context.config.target,postmaster:context.config.postmaster,clusterRecordSha256:context.clusterRecordSha256,ownerProof,beforeLedgerSha256:facts.ledgerSha256,beforeBindingsSha256:facts.bindingsSha256,beforeRuntimeRolesSha256:facts.runtimeRolesSha256,beforeOwnership:facts.beforeOwnership,ownershipBootstrap:source.ownershipBootstrap,migrations:facts.disposition.pending.map(entry=>({version:entry.version,path:entry.path,sourceSha256:entry.sourceSha256,appliedSha256:entry.appliedSha256})),localMigration:source.localMigration,fmsRuntimeLogin:`fms_test_runtime_${context.runId.slice(0,12)}`,reason,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+15*60000).toISOString()}
 return {...core,planSha256:localOwnerHash(core)}
}
/** Read an immutable 046 receipt only when every stored pointer matches its plan. */
export async function readLocalOwnerBridgeReceipt(client,plan){
 const {planSha256,...core}=plan??{}
 if(plan?.format!=='orgmaster.local-administration-bridge-plan.v1'||!/^[a-f0-9]{64}$/u.test(planSha256??'')||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(plan.commandId??'')||localOwnerHash(core)!==planSha256)fail('PLAN_INVALID')
 const rows=(await client.query('SELECT command_id::text command_id,plan_sha256,response FROM orgmaster_core.administration_local_bridge_receipts_v1 WHERE command_id=$1::uuid',[plan.commandId])).rows
 if(rows.length===0)return null
 const row=rows[0],receipt=row?.response
 if(rows.length!==1||row.command_id!==plan.commandId||row.plan_sha256!==planSha256||!exactKeys(receipt,['format','commandId','database','sourceRevision','planSha256','changedBindings','beforeBindingsSha256','afterBindingsSha256'])
 ||receipt.format!=='orgmaster.local-administration-bridge-receipt.v1'||receipt.commandId!==plan.commandId||receipt.planSha256!==planSha256||receipt.database!==plan.target?.database||receipt.sourceRevision!==plan.sourceRevision||receipt.beforeBindingsSha256!==plan.beforeBindingsSha256
 ||!Number.isSafeInteger(receipt.changedBindings)||receipt.changedBindings<0||receipt.changedBindings>2||!/^[a-f0-9]{64}$/u.test(receipt.afterBindingsSha256??''))fail('RECEIPT_CONFLICT')
 return receipt
}
function assertLocalOwnerPlan({context,source,plan,ownerProof,now}){
 if(source.workingTreeClean!==true)fail('SOURCE_NOT_REVIEWABLE')
 const {planSha256,...core}=plan??{}
 if(localOwnerHash(core)!==planSha256||plan.format!=='orgmaster.local-administration-bridge-plan.v1'||plan.sourceRevision!==source.sourceRevision||plan.sourceSha256!==source.sourceSha256||plan.configurationSha256!==context.configurationSha256||plan.clusterRecordSha256!==context.clusterRecordSha256||plan.profileSha256!==context.config.profileRef.sha256||plan.sqlProfileSha256!==context.config.sqlProfileRef.sha256||canonical(plan.target)!==canonical(context.config.target)||canonical(plan.postmaster)!==canonical(context.config.postmaster)||canonical(plan.ownerProof)!==canonical(ownerProof)||!Number.isFinite(Date.parse(plan.expiresAt))||Date.parse(plan.expiresAt)<=now||Date.parse(plan.createdAt)>now||Date.parse(plan.expiresAt)-Date.parse(plan.createdAt)!==15*60000)fail('PLAN_STALE_OR_INVALID')
 return {planSha256,core}
}
export async function commitLocalOwnerBridge({client,context,source,plan,ownerProof,now=Date.now()}){
 const {planSha256,core}=assertLocalOwnerPlan({context,source,plan,ownerProof,now})
 let committing=false
 await client.query('BEGIN')
 try{
  await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s'")
  await client.query("SELECT pg_advisory_xact_lock(hashtext('dev070-local-administration-bridge'),hashtext(current_database()))")
  let facts=await readLocalOwnerFacts(client,context,source)
  const prior=facts.installed?await readLocalOwnerBridgeReceipt(client,plan):null
  if(prior){if(prior.afterBindingsSha256!==facts.bindingsSha256||facts.disposition.count!==source.entries.length)fail('RECEIPT_CONFLICT');await client.query('ROLLBACK');return prior}
  if(facts.ledgerSha256!==plan.beforeLedgerSha256||facts.bindingsSha256!==plan.beforeBindingsSha256||facts.runtimeRolesSha256!==plan.beforeRuntimeRolesSha256||canonical(facts.beforeOwnership)!==canonical(plan.beforeOwnership)||canonical(source.ownershipBootstrap)!==canonical(plan.ownershipBootstrap)||canonical(facts.disposition.pending.map(e=>({version:e.version,path:e.path,sourceSha256:e.sourceSha256,appliedSha256:e.appliedSha256})))!==canonical(plan.migrations)||canonical(plan.localMigration)!==canonical(source.localMigration))fail('PLAN_CAS_CONFLICT')
  await client.query('RESET SESSION AUTHORIZATION')
  const operator=(await client.query("SELECT session_user,current_user,r.rolsuper FROM pg_roles r WHERE r.rolname=session_user")).rows[0]
  if(!operator||operator.session_user!=='postgres'||operator.current_user!=='postgres'||operator.rolsuper!==true)fail('OPERATOR_INVALID')
  await client.query("SELECT set_config('orgmaster.dev070.local_owner_plan',$1,true)",[JSON.stringify(plan)])
  await client.query(source.ownershipSql)
  await client.query('SET SESSION AUTHORIZATION jenfu_orgmaster_migrator')
  await assertOwnerSession(client,context.config.target)
  for(const entry of facts.disposition.pending){const migration=source.migrations.find(e=>e.version===entry.version);if(!migration)fail('MIGRATION_UNAVAILABLE');await client.query(migration.sql);await client.query('INSERT INTO orgmaster_core.schema_migrations(version,name,checksum_sha256,source_revision) VALUES($1,$2,$3,$4)',[migration.version,migration.name,migration.appliedSha256,source.sourceRevision])}
  if(!facts.installed){await client.query(source.localSql);await client.query('INSERT INTO orgmaster_core.administration_local_bridge_installations_v1(singleton,source_path,source_sha256,source_revision) VALUES(true,$1,$2,$3)',[LOCAL_BRIDGE_PATH,source.localMigration.sourceSha256,source.sourceRevision])}
  const receipt=(await client.query('SELECT orgmaster_core.bind_local_administration_workloads_v1($1::jsonb) receipt',[JSON.stringify(core)])).rows[0]?.receipt
  facts=await readLocalOwnerFacts(client,context,source)
  if(!receipt||receipt.planSha256!==planSha256||receipt.afterBindingsSha256!==facts.bindingsSha256||facts.disposition.count!==source.entries.length)fail('COMMIT_READBACK_INVALID')
  committing=true;await client.query('COMMIT');return receipt
 }catch(error){if(!committing)await client.query('ROLLBACK').catch(()=>undefined);if(committing)fail('COMMIT_UNKNOWN_REQUIRES_STATUS');throw error}
}

const exactKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',')
const boundedText=value=>typeof value==='string'&&value.length>=1&&value.length<=255
function assertLocalEnrollmentIntent(intent,context,source,planning){
 const keys=['contractVersion','commandId','environmentKey','sourceRevision','employeeId','directoryKey','principalId','expiresAt','expected','reason','admittingWorkload']
 if(!exactKeys(intent,keys)||intent.contractVersion!=='orgmaster.administration-enrollment-intent.v1'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(intent.commandId??'')
 ||intent.environmentKey!==context.config.target.database||intent.sourceRevision!==source.sourceRevision||!boundedText(intent.employeeId)||!exactKeys(intent.directoryKey,['customerId','userId'])||!boundedText(intent.directoryKey.customerId)||intent.directoryKey.customerId!==context.directoryCustomerId||!boundedText(intent.directoryKey.userId)||intent.principalId!==null&&!boundedText(intent.principalId)
 ||typeof intent.expiresAt!=='string'||!Number.isFinite(Date.parse(intent.expiresAt))||new Date(intent.expiresAt).toISOString()!==intent.expiresAt||typeof intent.reason!=='string'||intent.reason.length<1||intent.reason.length>240||intent.reason!==intent.reason.trim().normalize('NFC')
 ||planning&&(intent.expected!==null||intent.admittingWorkload!==null)
 ||!planning&&(!exactKeys(intent.expected,['governanceRevision','organizationRevision','administrationVersion'])||!boundedText(intent.expected.governanceRevision)||!boundedText(intent.expected.organizationRevision)||intent.expected.administrationVersion!==0||!exactKeys(intent.admittingWorkload,['principalId','dbSessionUser','providerSubject'])||intent.admittingWorkload.principalId!=='principal-workload:orgmaster-administration-initialize'||intent.admittingWorkload.dbSessionUser!=='jenfu_orgmaster_migrator'||intent.admittingWorkload.providerSubject!==OWNER_SUBJECT))fail('INTENT_INPUT_INVALID')
}
async function readLocalEnrollmentReadiness(client,intent){
 const row=(await client.query(`SELECT trim(a.canonical_sha256) governance_revision,e.workspace_revision,aa.admission_enabled FROM orgmaster_core.persistence_artifacts a JOIN orgmaster_core.persistence_authority authority ON a.batch_id=authority.active_batch_id CROSS JOIN orgmaster_core.managed_identity_admission_authority aa JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id=$1 AND e.employee_status='active' WHERE a.artifact_key='orgmaster-governance.v3.json' AND authority.singleton AND aa.singleton`,[intent.employeeId])).rows[0]
 const state=(await client.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows[0]
 if(!row||!state||Number(state.administration_version)!==0||state.initialized_by_command_id!==null||typeof row.admission_enabled!=='boolean')fail('INTENT_PLAN_NOT_READY')
 if(intent.principalId!==null){
  const accounts=(await client.query('SELECT DISTINCT principal_id,employee_id FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',[intent.principalId])).rows
  if(accounts.length!==1||accounts[0].principal_id!==intent.principalId||accounts[0].employee_id!==intent.employeeId)fail('INTENT_TARGET_INVALID')
 }
 const managed=(await client.query('SELECT employee_id,principal_id FROM orgmaster_core.managed_daily_identities WHERE directory_customer_id=$1 AND directory_user_id=$2',[intent.directoryKey.customerId,intent.directoryKey.userId])).rows
 if(managed.length>1||managed.some(r=>r.employee_id!==intent.employeeId||intent.principalId!==null&&r.principal_id!==intent.principalId))fail('INTENT_TARGET_INVALID')
 return {expected:{governanceRevision:row.governance_revision,organizationRevision:row.workspace_revision,administrationVersion:0},readiness:{globalAdmissionEnabled:row.admission_enabled,globalAdmissionWillNotBeChanged:true,principalResolution:intent.principalId===null?'verified_google_pair_required':'pinned_existing_principal'}}
}
/** Owner-only local adapter to the existing 045 intent functions; no root writer. */
export async function executeLocalEnrollmentIntent({client,context,source,input,action,ownerProof,now=Date.now()}){
 if(!['plan','admit','status','revoke'].includes(action))fail('INTENT_ARGUMENT_INVALID')
 const planning=action==='plan',write=action==='admit'||action==='revoke'
 let basis,intent
 if(planning){intent=input;assertLocalEnrollmentIntent(intent,context,source,true);if(Date.parse(intent.expiresAt)<=now||Date.parse(intent.expiresAt)>now+15*60000)fail('INTENT_EXPIRED')}
 else{
  if(!exactKeys(input,['format','basis','intent','intentSha256','planSha256'])||input.format!=='orgmaster.local-administration-enrollment-plan.v1'||!input.intent||localOwnerHash(input.intent)!==input.intentSha256)fail('INTENT_INPUT_INVALID')
  const {planSha256,...core}=input;if(localOwnerHash(core)!==planSha256)fail('INTENT_INPUT_INVALID')
  basis=input.basis;intent=input.intent
  // Status may read a previous source/expired intent after an unknown outcome.
  // It still requires the same immutable target/profile/OS/owner proof.
  if(action==='status'){
   const {planSha256,...core}=basis??{}
   if(localOwnerHash(core)!==planSha256||basis.format!=='orgmaster.local-administration-bridge-plan.v1'||basis.configurationSha256!==context.configurationSha256||basis.profileSha256!==context.config.profileRef.sha256||basis.sqlProfileSha256!==context.config.sqlProfileRef.sha256||basis.clusterRecordSha256!==context.clusterRecordSha256||canonical(basis.target)!==canonical(context.config.target)||canonical(basis.postmaster)!==canonical(context.config.postmaster)||canonical(basis.ownerProof)!==canonical(ownerProof))fail('PLAN_STALE_OR_INVALID')
   assertLocalEnrollmentIntent(intent,context,{sourceRevision:basis.sourceRevision},false)
  }else{assertLocalOwnerPlan({context,source,plan:basis,ownerProof,now});assertLocalEnrollmentIntent(intent,context,source,false);if(Date.parse(intent.expiresAt)<=now||Date.parse(intent.expiresAt)>Date.parse(basis.expiresAt))fail('INTENT_EXPIRED')}
  if(basis.commandId!==intent.commandId||basis.reason!==intent.reason)fail('INTENT_INPUT_INVALID')
 }
 if(ownerProof.email!==OWNER_EMAIL||ownerProof.subject!==OWNER_SUBJECT)fail('OWNER_IDENTITY_INVALID')
 let committing=false
 await client.query(write?'BEGIN':'BEGIN READ ONLY')
 try{
  if(write){await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s'");await client.query("SELECT pg_advisory_xact_lock(hashtext('dev070-local-administration-bridge'),hashtext(current_database()))")}
  const facts=await readLocalOwnerFacts(client,context,source)
  if(!facts.installed||facts.disposition.count!==source.entries.length||facts.beforeOwnership.some(r=>r.owner!=='jenfu_orgmaster_migrator'))fail('INTENT_BRIDGE_NOT_READY')
  if(planning){
   const {expected,readiness}=await readLocalEnrollmentReadiness(client,intent)
   basis=planLocalOwnerBridge({context,source,facts,ownerProof,commandId:intent.commandId,reason:intent.reason,now})
   intent={...intent,expected,admittingWorkload:{principalId:'principal-workload:orgmaster-administration-initialize',dbSessionUser:'jenfu_orgmaster_migrator',providerSubject:ownerProof.subject}}
   await client.query('ROLLBACK')
   const core={format:'orgmaster.local-administration-enrollment-plan.v1',basis,intent,intentSha256:localOwnerHash(intent)}
   return {status:'PLANNED',plan:{...core,planSha256:localOwnerHash(core)},readiness}
  }
  const read=async()=>{
   const value=(await client.query('SELECT orgmaster_core.read_administration_enrollment_intent_owner_v1($1::uuid) receipt',[intent.commandId])).rows[0]?.receipt??null
   if(value!==null&&(!exactKeys(value,['intent','revoked','receipt'])||typeof value.revoked!=='boolean'||!exactKeys(value.intent,['contractVersion','intentHash','intent','admittedAt'])||value.intent.contractVersion!=='orgmaster.administration-enrollment-intent-receipt.v1'||value.intent.intentHash!==input.intentSha256||!exactKeys(value.intent.intent,Object.keys(intent))||value.receipt!==null&&(typeof value.receipt!=='object'||Array.isArray(value.receipt)||value.receipt.commandId!==intent.commandId||!['pending','acknowledged'].includes(value.receipt.activation))))fail('INTENT_RECEIPT_CONFLICT')
   return value
  }
  const prior=await read()
  if(prior&&localOwnerHash(prior.intent?.intent)!==input.intentSha256)fail('INTENT_RECEIPT_CONFLICT')
  const initializedStatus=()=>prior.receipt.activation==='pending'?'ACTIVATION_PENDING':'INITIALIZED'
  if(action==='status'){await client.query('ROLLBACK');return {status:prior===null?'NOT_FOUND':prior.receipt!==null?initializedStatus():prior.revoked?'REVOKED':Date.parse(intent.expiresAt)<=now?'EXPIRED':'ADMITTED',receipt:prior}}
  if(prior!==null&&prior.receipt!==null){if(action==='revoke')fail('INTENT_ALREADY_COMPLETED');await client.query('ROLLBACK');return {status:initializedStatus(),receipt:prior}}
  if(prior?.revoked){if(action==='admit')fail('INTENT_REVOKED');await client.query('ROLLBACK');return {status:'REVOKED',receipt:prior}}
  if(facts.ledgerSha256!==basis.beforeLedgerSha256||facts.bindingsSha256!==basis.beforeBindingsSha256||facts.runtimeRolesSha256!==basis.beforeRuntimeRolesSha256||canonical(facts.beforeOwnership)!==canonical(basis.beforeOwnership))fail('PLAN_CAS_CONFLICT')
  if(action==='admit'&&prior){await client.query('ROLLBACK');return {status:'ADMITTED',receipt:prior}}
  if(action==='revoke'&&!prior)fail('INTENT_NOT_FOUND')
  if(action==='admit'){
   const readiness=await readLocalEnrollmentReadiness(client,intent)
   if(canonical(readiness.expected)!==canonical(intent.expected))fail('PLAN_CAS_CONFLICT')
   await client.query('SELECT orgmaster_core.admit_administration_enrollment_intent_v1($1::jsonb) receipt',[JSON.stringify(intent)])
  }else await client.query('SELECT orgmaster_core.revoke_administration_enrollment_intent_v1($1::uuid) receipt',[intent.commandId])
  const receipt=await read()
  if(!receipt||localOwnerHash(receipt.intent?.intent)!==input.intentSha256||receipt.receipt!==null||receipt.revoked!==(action==='revoke'))fail('INTENT_READBACK_INVALID')
  committing=true;await client.query('COMMIT')
  return {status:action==='admit'?'ADMITTED':'REVOKED',receipt}
 }catch(error){if(!committing)await client.query('ROLLBACK').catch(()=>undefined);if(committing)fail('INTENT_COMMIT_UNKNOWN_REQUIRES_STATUS');throw error}
}
