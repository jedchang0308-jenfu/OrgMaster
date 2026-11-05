import {randomUUID} from 'node:crypto'
import {administrationHash,AdministrationError,type AdministrationCatalogBindings} from '../src/governance/administration.ts'
import type {FirebaseIdentityProvider,VerifiedFirebaseIdentity} from './orgmasterFirebaseIdentityProvider.ts'
import type {ManagedDirectoryPortV1} from './orgmasterManagedDirectoryPort.ts'
import type {OrgmasterDatabase} from './orgmasterDatabase.ts'

export type AdministrationOwnerTarget={principalId:string;employeeId:string;directoryKey:{customerId:string;userId:string};identityFactsHash:string}
export type AdministrationOwnerPlan={contractVersion:'orgmaster.administration-owner-plan.v1';commandId:string;environmentKey:string;owner:{principalId:string;dbSessionUser:string;providerSubject:string};target:AdministrationOwnerTarget;expected:{governanceRevision:string;organizationRevision:string;administrationVersion:number};catalogBindings:AdministrationCatalogBindings;grants:Array<{roleCode:'platform_super_admin'|'application_system_admin';applicationId:'orgmaster'|'ai-pdm'|'financial-management-system'|null;validFrom:string;validTo:string|null}>;plannedProtectedOperations:string[];reason:string;planHash:string}
type Database=Pick<OrgmasterDatabase,'query'>
export function createAdministrationOwner(input:{database:Database;directory:ManagedDirectoryPortV1;identityProvider:FirebaseIdentityProvider;environmentKey:string;now?:()=>string}){
 const now=input.now??(()=>new Date().toISOString())
 async function assertOwner(plan:AdministrationOwnerPlan){
  const result=await input.database.query(`SELECT SESSION_USER::text AS session_user,current_database() AS environment,pg_has_role(SESSION_USER,'jenfu_orgmaster_migrator','MEMBER') AS migrator`)
  const row=result.rows[0]
  if(result.rows.length!==1||!row.migrator||row.environment!==input.environmentKey||row.environment!==plan.environmentKey||row.session_user!==plan.owner.dbSessionUser||!/^[0-9]{18,24}$/.test(plan.owner.providerSubject))throw new AdministrationError('PLATFORM_ADMIN_REQUIRED')
  const {planHash,...payload}=plan
  if(administrationHash(payload)!==planHash)throw new AdministrationError('ADMINISTRATION_COMMAND_CONFLICT')
  const binding=(await input.database.query(`SELECT principal_id,provider_subject,bound_plan_sha256,bound_target_principal_id,bound_target_employee_id FROM orgmaster_core.workload_principal_bindings WHERE db_session_user=SESSION_USER::text AND owner='orgmaster' AND purpose='administration-initialize' AND bound_command_id=$1::uuid`,[plan.commandId])).rows[0]
  if(!binding||binding.principal_id!==plan.owner.principalId||binding.provider_subject!==plan.owner.providerSubject||binding.bound_plan_sha256!==plan.planHash||binding.bound_target_principal_id!==plan.target.principalId||binding.bound_target_employee_id!==plan.target.employeeId)throw new AdministrationError('ADMINISTRATION_COMMAND_CONFLICT')
 }
 async function verify(plan:AdministrationOwnerPlan,idToken:string){
  await assertOwner(plan)
  if(input.directory.mode!=='google-admin-readonly'||!idToken||idToken.length>16384)throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
  const identity=await input.identityProvider.verifyIdToken(idToken)
  const age=Date.parse(now())-Date.parse(identity.authenticatedAt??'')
  if(!['aal1','aal2'].includes(identity.assuranceLevel)||!Number.isFinite(age)||age<0||age>300000)throw new AdministrationError('AUTH_RECENT_REQUIRED')
  if(identity.signInProvider!=='google.com'||identity.emailVerified!==true||!identity.googleUserId||identity.googleUserId!==plan.target.directoryKey.userId)throw new AdministrationError('ADMIN_TARGET_INVALID')
  const directory=await input.directory.readByDirectoryKey(plan.target.directoryKey.customerId,plan.target.directoryKey.userId)
  if(!directory.ok||directory.user.directoryState!=='present'||directory.user.userId!==identity.googleUserId||directory.user.customerId!==plan.target.directoryKey.customerId||directory.user.primaryEmail!==identity.email)throw new AdministrationError('ADMIN_TARGET_INVALID')
  const facts={principalId:plan.target.principalId,employeeId:plan.target.employeeId,directoryCustomerId:directory.user.customerId,directoryUserId:directory.user.userId,issuer:identity.issuer,subject:identity.subject,primaryEmail:directory.user.primaryEmail,authenticatedAt:identity.authenticatedAt,assuranceLevel:identity.assuranceLevel}
  if(administrationHash({...facts,authenticatedAt:undefined,assuranceLevel:undefined})!==plan.target.identityFactsHash)throw new AdministrationError('ADMINISTRATION_COMMAND_CONFLICT')
  return {facts,identity,verifiedAt:now(),sourceEtag:directory.user.sourceEtag}
 }
 const commandFromPlan=(plan:AdministrationOwnerPlan)=>({contractVersion:'orgmaster.administration-command.v1',commandId:plan.commandId,operation:'initialize_platform_administrator',environmentKey:plan.environmentKey,target:plan.target,expected:plan.expected,catalogBindings:plan.catalogBindings,grants:plan.grants,plannedProtectedOperations:plan.plannedProtectedOperations,reason:plan.reason})
 async function prepare(plan:AdministrationOwnerPlan,idToken:string){
  const proof=await verify(plan,idToken)
  const result=await input.database.query('SELECT orgmaster_core.prepare_administration_identity_owner_v1($1::jsonb) receipt',[JSON.stringify({command:commandFromPlan(plan),planHash:plan.planHash,verifiedAt:proof.verifiedAt,nativeFacts:proof.facts,sourceEtag:proof.sourceEtag})])
  if(result.rows.length!==1||!result.rows[0].receipt)throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
  return result.rows[0].receipt
 }
 async function commit(plan:AdministrationOwnerPlan,idToken:string){
  const existing=await status(plan)
  if(existing)return existing
  const proof=await verify(plan,idToken)
  const command=commandFromPlan(plan)
  // Facts are re-read after preparation; the private SQL command repeats all
  // CAS, target, catalog and once-only checks under the owner lock order.
  const targetFacts=(await input.database.query(`SELECT principal_id AS "principalId",min(employee_id) AS "employeeId",min(account_type) AS "accountType",min(mapping_version)::text AS "mappingVersion" FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1 AND employee_id=$2 AND employee_status='active' AND account_type IN('human_personal','human_privileged') GROUP BY principal_id HAVING count(DISTINCT account_type)=1`,[plan.target.principalId,plan.target.employeeId])).rows[0]
  if(!targetFacts)throw new AdministrationError('ADMIN_TARGET_INVALID')
  const requestHash=administrationHash({actorId:plan.owner.principalId,environmentKey:plan.environmentKey,payload:command})
  const previewHash=administrationHash({requestHash,expected:command.expected,catalogBindings:command.catalogBindings,targetFacts,authentication:null})
  const result=await input.database.query('SELECT orgmaster_core.initialize_administration_owner_v1($1::jsonb) receipt',[JSON.stringify({command:{...command,previewHash},planHash:plan.planHash,verifiedAt:proof.verifiedAt})])
  if(!result.rows[0]?.receipt)throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
  return result.rows[0].receipt
 }
 async function status(plan:AdministrationOwnerPlan){await assertOwner(plan);return(await input.database.query('SELECT orgmaster_core.read_administration_command_owner_v1($1::uuid) receipt',[plan.commandId])).rows[0]?.receipt??null}
 return {verify,prepare,commit,status}
}
export function createAdministrationOwnerPlan(value:Omit<AdministrationOwnerPlan,'planHash'|'contractVersion'|'commandId'> & {commandId?:string}):AdministrationOwnerPlan{
 const payload={...value,contractVersion:'orgmaster.administration-owner-plan.v1' as const,commandId:value.commandId??randomUUID()}
 if(!payload.grants.some(grant=>grant.roleCode==='platform_super_admin'&&grant.applicationId===null)||!payload.grants.some(grant=>grant.roleCode==='application_system_admin'&&grant.applicationId==='orgmaster')||new Set(payload.grants.map(grant=>grant.applicationId)).size!==payload.grants.length)throw new AdministrationError('ADMIN_TARGET_INVALID')
 return {...payload,planHash:administrationHash(payload)}
}
