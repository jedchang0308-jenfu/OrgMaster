import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { createDisposablePostgresManager } from './dev014-disposable-postgres.mjs'
import { initializeLifecycleFixture } from './dev014-lifecycle-postgres-fixture.mjs'
import {randomUUID} from 'node:crypto'

async function enableFixtureNativeAdmission(admin){
 const apps=(await admin.query("SELECT application_id,support_revision FROM orgmaster_core.managed_identity_invalidation_applications WHERE status='active'")).rows
 for(const app of apps)await admin.query('SELECT * FROM orgmaster_core.attest_managed_identity_invalidation_support_v1($1,$2,$3,$4)',[app.application_id,app.support_revision,'ISOLATED_SYNTHETIC_DEV070_OWNER_FIXTURE','dev070-fixture'])
 const authority=(await admin.query('SELECT revision,admission_enabled FROM orgmaster_core.managed_identity_admission_authority WHERE singleton')).rows[0]
 if(!authority.admission_enabled)await admin.query("SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,true,'dev070-fixture','isolated-fixture-native-admission')",[authority.revision])
}

export async function prepareAdministrationInitializationFixture({admin,connect,handle},{freshNative=false,noPublication=false,acceptedCatalogs=[],freshEmployeeId='employee-two',ordinaryFinancialViewer=false}={}) {
 if(ordinaryFinancialViewer&&(handle.targetClass!=='task-owned-local'||handle.host!=='127.0.0.1'||!/^dev014_[a-f0-9]{20}$/.test(handle.databaseName)||noPublication))throw new Error('DEV070_FINANCIAL_VIEWER_FIXTURE_TARGET_INVALID')
 const artifact=(await admin.query(`SELECT payload,trim(canonical_sha256) AS revision FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0]
 const document=artifact.payload,publication=document.publishedVersions.find(value=>value.id===document.activePolicyVersionId)
 const sourceSeed=JSON.parse(await readFile(new URL('../../contracts/orgmaster-administration-bootstrap/v1/source-seed.json',import.meta.url),'utf8'))
 publication.policy={...sourceSeed,...publication.policy,applicationRoles:[...publication.policy.applicationRoles.filter(value=>value.id!=='role-orgmaster-admin'),sourceSeed.applicationRoles[0]],permissions:sourceSeed.permissions,rolePermissionGrants:sourceSeed.rolePermissionGrants}
 if(ordinaryFinancialViewer){
  const catalog=acceptedCatalogs.find(value=>value.applicationId==='financial-management-system'&&value.sourceKind==='application-contract'&&value.validationState==='valid'),viewer=catalog?.roles.find(value=>value.stableRoleId==='role-viewer'&&value.status==='active'&&value.subjectKind==='employee'&&value.assignable)
  if(!catalog||!viewer||viewer.code!=='viewer'||viewer.allowedScopeKinds?.join(',')!=='workspace'||!Array.isArray(viewer.capabilityIds)||!viewer.capabilityIds.length||viewer.capabilityIds.some(value=>!value.startsWith('finance.')||!value.endsWith('.view'))||!/^[a-f0-9]{64}$/.test(viewer.roleDefinitionHash)||!/^[a-f0-9]{64}$/.test(catalog.contentSha256))throw new Error('DEV070_FINANCIAL_VIEWER_SOURCE_INVALID')
  const definition={stableRoleId:viewer.stableRoleId,code:viewer.code,displayName:viewer.displayName,builtIn:viewer.builtIn,capabilityIds:[...viewer.capabilityIds].sort(),allowedScopeKinds:[...viewer.allowedScopeKinds].sort(),assignmentPolicy:viewer.assignmentPolicy}
  const actual=(await admin.query('SELECT orgmaster_core.administration_sha256_v1($1::jsonb) hash',[JSON.stringify(definition)])).rows[0].hash
  if(actual!==viewer.roleDefinitionHash)throw new Error('DEV070_FINANCIAL_VIEWER_SOURCE_HASH_INVALID')
  const native=(await admin.query("SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id='principal-legacy' AND employee_id='employee-legacy' AND employee_status='active' AND account_type='human_personal'")).rows
  if(native.length!==1)throw new Error('DEV070_FINANCIAL_VIEWER_NATIVE_TARGET_INVALID')
  publication.policy.roleAssignments=[...publication.policy.roleAssignments,{id:`financial-assignment-${randomUUID()}`,applicationId:'financial-management-system',employeeId:'employee-legacy',roleId:viewer.stableRoleId,roleCodeSnapshot:viewer.code,roleNameSnapshot:viewer.displayName,catalogVersion:catalog.catalogVersion,authoringCatalogVersion:catalog.catalogVersion,authoringCatalogSha256:catalog.contentSha256,scope:{kind:'workspace',value:'company-jenfu'},status:'active',validFrom:'2026-01-01T00:00:00.000Z',validTo:null,effectState:'not-synchronized',basis:'manual',subjectKind:'employee',targetPrincipalId:null,sources:[],metadata:{sponsorEmployeeId:null,reviewDueAt:null},createdByPrincipalId:'dev070-isolated-owner-fixture',createdReason:'SOURCE_DOMAIN_FIXTURE_READ_ONLY_VIEWER'}]
 }
 document.draft={...publication.policy,basePolicyVersionId:publication.id,updatedAt:new Date().toISOString(),unpublishedBusinessMarker:'preserve-only-in-draft'}
 publication.externalRoleCatalogs=acceptedCatalogs
 if(noPublication)document.activePolicyVersionId=null
 await admin.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1,canonical_sha256=orgmaster_core.administration_sha256_v1($1::jsonb) WHERE batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton) AND artifact_key='orgmaster-governance.v3.json'`,[JSON.stringify(document)])
 const revision=(await admin.query(`SELECT trim(canonical_sha256) revision FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0].revision
 const workspaceRevision=(await admin.query('SELECT workspace_revision FROM orgmaster_core.v_current_workspace_employees_v1 LIMIT 1')).rows[0].workspace_revision
 if(freshNative)await enableFixtureNativeAdmission(admin)
 const principalId=freshNative?`principal-managed:${randomUUID()}`:'principal-legacy',employeeId=freshNative?freshEmployeeId:'employee-legacy'
 const nativeRow=freshNative?{principal_issuer:'https://securetoken.google.com/isolated-native-project',principal_subject:randomUUID()}:(await admin.query('SELECT principal_issuer,principal_subject FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',[principalId])).rows[0]
 if(!nativeRow)throw new Error('DEV070_FIXTURE_NATIVE_TARGET_MISSING')
 const nativeFacts={principalId,employeeId,directoryCustomerId:'fixture-customer',directoryUserId:'fixture-user',issuer:nativeRow.principal_issuer,subject:nativeRow.principal_subject,primaryEmail:'fixture@example.invalid',authenticatedAt:new Date().toISOString(),assuranceLevel:'aal1'}
 const digest=async value=>(await admin.query('SELECT orgmaster_core.administration_sha256_v1($1::jsonb) hash',[JSON.stringify(value)])).rows[0].hash
 const {authenticatedAt,assuranceLevel,...immutableFacts}=nativeFacts
 const definition={stableRoleId:'role-orgmaster-admin',permissionCodes:sourceSeed.permissions.map(value=>value.code).sort()}
 const orgBinding={catalogVersion:'orgmaster.system-admin.v1',contentSha256:await digest({catalogVersion:'orgmaster.system-admin.v1',definition}),stableRoleId:'role-orgmaster-admin',roleDefinitionHash:await digest(definition)}
 const plan={contractVersion:'orgmaster.administration-owner-plan.v1',commandId:randomUUID(),environmentKey:handle.databaseName,owner:{principalId:'principal-workload:orgmaster-administration-owner-fixture',dbSessionUser:'orgmaster-owner-fixture',providerSubject:'103333333333333333333'},target:{principalId,employeeId,directoryKey:{customerId:nativeFacts.directoryCustomerId,userId:nativeFacts.directoryUserId},identityFactsHash:await digest(immutableFacts)},expected:{governanceRevision:revision,organizationRevision:workspaceRevision,administrationVersion:0},catalogBindings:{orgmaster:orgBinding},grants:[{roleCode:'platform_super_admin',applicationId:null,validFrom:'2026-01-01T00:00:00.000Z',validTo:null},{roleCode:'application_system_admin',applicationId:'orgmaster',validFrom:'2026-01-01T00:00:00.000Z',validTo:null}],plannedProtectedOperations:[],reason:'隔離測試首次授權'}
 const planHash=await digest(plan),boundPlan={...plan,planHash}
 const command={contractVersion:'orgmaster.administration-command.v1',commandId:plan.commandId,operation:'initialize_platform_administrator',environmentKey:plan.environmentKey,target:plan.target,expected:plan.expected,catalogBindings:plan.catalogBindings,grants:plan.grants,plannedProtectedOperations:plan.plannedProtectedOperations,reason:plan.reason}
 await admin.query(`CREATE ROLE "orgmaster-owner-fixture" LOGIN; GRANT jenfu_orgmaster_migrator TO "orgmaster-owner-fixture"`)
 const owner=await connect('orgmaster-owner-fixture')
 await owner.query('SELECT orgmaster_core.bind_administration_owner_package_v1($1::jsonb)',[JSON.stringify(boundPlan)])
 const prepareReceipt=(await owner.query('SELECT orgmaster_core.prepare_administration_identity_owner_v1($1::jsonb) receipt',[JSON.stringify({command,planHash,verifiedAt:new Date().toISOString(),nativeFacts,sourceEtag:null})])).rows[0].receipt
 const facts=(await admin.query(`SELECT principal_id AS "principalId",min(employee_id) AS "employeeId",min(account_type) AS "accountType",min(mapping_version)::text AS "mappingVersion" FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1 GROUP BY principal_id`,[principalId])).rows[0]
 if(!facts)throw new Error('DEV070_PREPARED_NATIVE_TARGET_MISSING')
 const requestHash=await digest({actorId:plan.owner.principalId,environmentKey:handle.databaseName,payload:command})
 command.previewHash=await digest({requestHash,expected:command.expected,catalogBindings:command.catalogBindings,targetFacts:facts,authentication:null})
 const ownerPackage={command,planHash,verifiedAt:new Date().toISOString()}
 const initialize=async()=> (await owner.query('SELECT orgmaster_core.initialize_administration_owner_v1($1::jsonb) receipt',[JSON.stringify(ownerPackage)])).rows[0].receipt
 return {owner,command,package:ownerPackage,facts,document,prepareReceipt,initialize,plan:boundPlan,nativeFacts}
}
/** Arrange an owner-admitted intent, without preparing a native provider pair
 * or binding an owner plan. The runtime completion must do that work itself. */
export async function prepareAdministrationEnrollmentFixture({admin,connect,handle},{freshNative=false,noPublication=false,admissionEnabled=true}={}){
 const sourceSeed=JSON.parse(await readFile(new URL('../../contracts/orgmaster-administration-bootstrap/v1/source-seed.json',import.meta.url),'utf8'))
 const artifact=(await admin.query("SELECT payload FROM orgmaster_core.persistence_artifacts WHERE artifact_key='orgmaster-governance.v3.json'")).rows[0].payload
 const publication=artifact.publishedVersions.find(value=>value.id===artifact.activePolicyVersionId)
 publication.policy={...sourceSeed,...publication.policy,applicationRoles:[...publication.policy.applicationRoles.filter(value=>value.id!=='role-orgmaster-admin'),sourceSeed.applicationRoles[0]],permissions:sourceSeed.permissions,rolePermissionGrants:sourceSeed.rolePermissionGrants}
 artifact.draft={...publication.policy,unpublishedBusinessMarker:'preserve-only-in-draft'}
 if(noPublication)artifact.activePolicyVersionId=null
 await admin.query("UPDATE orgmaster_core.persistence_artifacts SET payload=$1,canonical_sha256=orgmaster_core.administration_sha256_v1($1::jsonb) WHERE artifact_key='orgmaster-governance.v3.json'",[JSON.stringify(artifact)])
 if(freshNative&&admissionEnabled)await enableFixtureNativeAdmission(admin)
 const employeeId=freshNative?'employee-two':'employee-legacy'
 const native=freshNative?{principal_issuer:'https://securetoken.google.com/isolated-native-project',principal_subject:randomUUID()}:(await admin.query("SELECT principal_issuer,principal_subject FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id='principal-legacy'")).rows[0]
 await admin.query('CREATE ROLE "orgmaster-enrollment-owner-fixture" LOGIN; GRANT jenfu_orgmaster_migrator TO "orgmaster-enrollment-owner-fixture"')
 const owner=await connect('orgmaster-enrollment-owner-fixture'),runtime=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
 const expected={governanceRevision:(await admin.query("SELECT trim(canonical_sha256) value FROM orgmaster_core.persistence_artifacts WHERE artifact_key='orgmaster-governance.v3.json'")).rows[0].value,organizationRevision:(await admin.query('SELECT workspace_revision FROM orgmaster_core.v_current_workspace_employees_v1 LIMIT 1')).rows[0].workspace_revision,administrationVersion:0}
 const intent={contractVersion:'orgmaster.administration-enrollment-intent.v1',commandId:randomUUID(),environmentKey:handle.databaseName,sourceRevision:'a'.repeat(40),employeeId,directoryKey:{customerId:'fixture-customer',userId:'fixture-user'},principalId:freshNative?null:'principal-legacy',expiresAt:new Date(Date.now()+600000).toISOString(),expected,reason:'隔離首位預授權',admittingWorkload:{principalId:'principal-workload:orgmaster-administration-initialize',dbSessionUser:'orgmaster-enrollment-owner-fixture',providerSubject:'104444444444444444444'}}
 const facts={directoryCustomerId:'fixture-customer',directoryUserId:'fixture-user',issuer:native.principal_issuer,subject:native.principal_subject,primaryEmail:'fixture@example.invalid',authenticatedAt:new Date().toISOString(),assuranceLevel:'aal1',verifiedAt:new Date().toISOString(),sourceEtag:null}
 const admit=async(value=intent)=>(await owner.query('SELECT orgmaster_core.admit_administration_enrollment_intent_v1($1::jsonb) receipt',[JSON.stringify(value)])).rows[0].receipt
 const complete=async(value=facts)=>(await runtime.query('SELECT orgmaster_core.complete_administration_enrollment_v1($1::uuid,$2::jsonb) result',[intent.commandId,JSON.stringify(value)])).rows[0].result
 return {owner,runtime,intent,facts,admit,complete}
}
export async function drainAdministrationFixtureEvents(fixture,consumePlatformEvent){
 if(typeof consumePlatformEvent!=='function')throw new Error('DEV070_PLATFORM_OWNER_FIXTURE_ADAPTER_REQUIRED')
 const worker=await fixture.connect('orgmaster-prod-runtime@jenfu-platform-prod.iam'),leaseId=randomUUID()
 const executor='principal-workload:orgmaster-managed-identity-lifecycle',outcomes=[]
 for(let round=0;round<4;round++){
  const claims=(await worker.query('SELECT * FROM orgmaster_core.claim_principal_lifecycle_v2($1,$2::uuid,2)',[executor,leaseId])).rows
  if(!claims.length)return outcomes
  for(const claim of claims){
   const consumed=await consumePlatformEvent({eventId:claim.event_id,snapshotHash:claim.snapshot_hash,deliveryPrincipalId:executor})
   if(!consumed?.receiptId)throw new Error('DEV070_PLATFORM_OWNER_RECEIPT_REQUIRED')
   await worker.query('SELECT orgmaster_core.complete_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5::uuid)',[executor,leaseId,claim.event_id,claim.lease_generation,consumed.receiptId])
   outcomes.push({eventId:claim.event_id,status:'completed',receiptId:consumed.receiptId})
  }
 }
 throw new Error('DEV070_FIXTURE_DRAIN_BOUND_EXCEEDED')
}
export async function createAdministrativeHumanFixture(fixture,{principalId='principal-legacy',assuranceLevel='aal1'}={}){
 const {admin,connect,handle}=fixture,runtime=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
 const native=(await runtime.query('SELECT principal_issuer,principal_subject,employee_id FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',[principalId])).rows
 if(!native.length||new Set(native.map(value=>value.employee_id)).size!==1)throw new Error('DEV070_HUMAN_FIXTURE_NATIVE_TARGET_INVALID')
 const epoch=(await runtime.query('SELECT * FROM platform_contract.read_principal_auth_state_v3($1)',[principalId])).rows[0]
 if(!epoch)throw new Error('DEV070_PLATFORM_OWNER_EPOCH_FIXTURE_REQUIRED')
 const sessionId=randomUUID(),authenticatedAt=new Date().toISOString(),actor={kind:'principal',sessionId,principalAuthEpoch:Number(epoch.auth_epoch),authenticatedAt,assuranceLevel}
 await admin.query(`INSERT INTO orgmaster_core.app_sessions(id,session_id_hash,identity_issuer,identity_subject,principal_id,employee_id,app_id,auth_epoch,issued_at,expires_at,last_seen_at,assurance_level,created_at,updated_at,authenticated_at,session_schema_version,epoch_kind,principal_auth_epoch)
 VALUES($1::uuid,$9,$2,$3,$4,$5,'orgmaster',0,$6,clock_timestamp()+interval '1 hour',$6,$7,$6,$6,$6,2,'principal',$8)`,[sessionId,native[0].principal_issuer,native[0].principal_subject,principalId,native[0].employee_id,authenticatedAt,assuranceLevel,actor.principalAuthEpoch,'0'.repeat(32)+sessionId.replaceAll('-','')])
 async function command(operation,options={}){
  const artifact=(await admin.query(`SELECT payload,trim(canonical_sha256) revision FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0]
  const publication=artifact.payload.publishedVersions.find(value=>value.id===artifact.payload.activePolicyVersionId),administration=publication.policy.administration
  const target=options.target??null,grantId=options.grantId??null
  const body={contractVersion:'orgmaster.administration-command.v1',commandId:options.commandId??randomUUID(),operation,target,grantId,reason:options.reason??'隔離行政命令驗證',expected:{governanceRevision:artifact.revision,organizationRevision:(await admin.query('SELECT workspace_revision FROM orgmaster_core.v_current_workspace_employees_v1 LIMIT 1')).rows[0].workspace_revision,administrationVersion:administration.version},catalogBindings:options.catalogBindings??{}}
  const targetFacts=target?(await runtime.query(`SELECT principal_id AS "principalId",min(employee_id) AS "employeeId",min(account_type) AS "accountType",min(mapping_version)::text AS "mappingVersion" FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1 AND employee_id=$2 AND employee_status='active' AND account_type IN('human_personal','human_privileged') GROUP BY principal_id HAVING count(DISTINCT account_type)=1`,[target.principalId,target.employeeId])).rows[0]:null
  const requestHash=(await admin.query('SELECT orgmaster_core.administration_sha256_v1($1::jsonb) hash',[JSON.stringify({actorId:principalId,environmentKey:handle.databaseName,payload:body})])).rows[0].hash
  const previewHash=(await admin.query('SELECT orgmaster_core.administration_sha256_v1($1::jsonb) hash',[JSON.stringify({requestHash,expected:body.expected,catalogBindings:body.catalogBindings,targetFacts,authentication:actor})])).rows[0].hash
  return {...body,previewHash}
 }
 const commit=async value=>(await runtime.query('SELECT orgmaster_core.apply_administration_command_v1($1::jsonb,$2::jsonb) receipt',[JSON.stringify(value),JSON.stringify(actor)])).rows[0].receipt
 const status=async id=>(await runtime.query('SELECT orgmaster_core.read_administration_command_v1($1::uuid,$2::jsonb) receipt',[id,JSON.stringify(actor)])).rows[0].receipt
 return {actor,sessionId,principalId,employeeId:native[0].employee_id,command,commit,status,runtime}
}

/** Read actual owner snapshots for exercising the production domain/API against
 * the disposable runtime connection. This does not create provider sessions. */
export async function readAdministrationStoreFixtureSnapshot({admin,handle}){
 const artifact=(await admin.query(`SELECT payload,trim(canonical_sha256) revision FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0]
 const organization=(await admin.query('SELECT orgmaster_core.read_administration_organization_snapshot_v1() snapshot')).rows[0].snapshot
 const administrativePrincipals=(await admin.query(`SELECT DISTINCT principal_id AS "principalId",employee_id AS "employeeId",account_type AS "accountType",'active' AS status FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE employee_status='active' AND account_type IN('human_personal','human_privileged')`)).rows
 return {document:artifact.payload,revision:artifact.revision,environmentKey:handle.databaseName,source:{workspaceVersionId:organization.workspaceVersionId,workspaceRevision:organization.workspaceRevision,state:{employees:organization.employees,departments:organization.departments,roles:organization.organizationRoles,positions:organization.positions,assignments:organization.assignments},administrativePrincipals}}
}

/** A second independent native target for command/concurrency cases. Arrange
 * isolated Directory observations, then use the existing native bind command. */
export async function createAdditionalAdministrationTargetFixture({admin,handle},{employeeId='employee-two'}={}){
 if(handle.targetClass!=='task-owned-local'||handle.host!=='127.0.0.1'||!/^dev014_[a-f0-9]{20}$/.test(handle.databaseName))throw new Error('DEV070_FIXTURE_TARGET_REQUIRED')
 if((await admin.query('SELECT 1 FROM orgmaster_contract.v_principal_alias_history_v1 WHERE employee_id=$1',[employeeId])).rows.length)throw new Error('DEV070_FIXTURE_EMPLOYEE_ALREADY_HAS_HISTORY')
 const identityId=randomUUID(),principalId=`principal-managed:${identityId}`,issuer='https://securetoken.google.com/isolated-native-project',subject=randomUUID(),email='second@example.invalid'
 await enableFixtureNativeAdmission(admin)
 await admin.query(`INSERT INTO orgmaster_core.managed_daily_identities(identity_record_id,employee_id,principal_id,directory_customer_id,directory_user_id,last_verified_primary_email,link_state,created_by,updated_by)
 VALUES($1,$2,$3,'fixture-customer',$4,$5,'directory_linked_pending_auth','dev070-fixture','dev070-fixture')`,[identityId,employeeId,principalId,randomUUID(),email])
 await admin.query(`INSERT INTO orgmaster_core.managed_identity_observations(identity_record_id,primary_email,directory_state,adapter_outcome,trusted_observed_at,last_attempt_at,freshness)
 VALUES($1,$2,'present','success',clock_timestamp(),clock_timestamp(),'fresh')`,[identityId,email])
 await admin.query('SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1($1,$2,$3,$4,$5)',[employeeId,issuer,subject,email,randomUUID()])
 return {identityId,principalId,employeeId}
}

/** One task-owned disposable cluster; the callback owns no persistent database. */
export async function withAdministrationPostgresFixture(callback, { orgmasterRoot = process.cwd(), platformRoot = 'C:/VIBE CODING/Jenfu-Platform', capacityPopulation } = {}) {
 const manager = createDisposablePostgresManager({maxConnections:16})
 const handle = await manager.startDisposablePostgres({ purpose: 'DEV-070 administration isolated owner transaction' })
 const clients = []
 try {
  const baseline = await initializeLifecycleFixture(handle, { orgmasterRoot, platformRoot,
    ...(capacityPopulation === undefined ? {} : { capacityPopulation }) })
  await handle.client.query('CREATE ROLE fms_runtime LOGIN; GRANT jenfu_orgmaster_migrator TO postgres')
  for (const name of ['032_dev046_employee_list_min_width.sql','033_dev046_shared_list_min_width.sql','034_dev058_ai_pdm_role_policy_compatibility_v2.sql','035_dev058_ai_pdm_compatibility_definer_read.sql','036_dev058_retire_unused_role_policy_readiness.sql','037_dev058_human_privileged_portal_visibility.sql','038_dev065_fms_authority_projection.sql','039_dev065_fms_portal_visibility.sql','040_dev065_fms_human_business_authority_v2.sql','041_dev060_fms_catalog_activation_receipts_v1.sql','042_dev057_principal_display_profiles.sql','044_dev070_administration_projection_v1.sql','045_dev070_administration_commands_v1.sql']) {
   try { await handle.client.query(await readFile(resolve(orgmasterRoot,'db/migrations',name),'utf8')) }
   catch (error) { await handle.client.query('ROLLBACK'); throw new Error(`DEV070_MIGRATION_FAILED:${name}`,{cause:error}) }
  }
  const connect = async user => {
   const client = new pg.Client({ host:handle.host,port:handle.port,database:handle.databaseName,user,ssl:false })
   await client.connect(); clients.push(client); return client
  }
  return await callback({handle,admin:handle.client,connect,baseline})
 } finally {
  await Promise.allSettled(clients.map(client=>client.end()))
  await manager.stopDisposablePostgres(handle)
 }
}
