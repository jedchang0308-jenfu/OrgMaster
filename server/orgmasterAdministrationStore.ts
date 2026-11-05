import { randomUUID } from 'node:crypto'
import type { OrgmasterDatabase } from './orgmasterDatabase'
import { loadOrganizationSource, readExistingGovernanceStore } from './orgmasterGovernanceStore'
import { currentPersistenceTransactionDatabase, persistenceActorContext, usesCloudSqlPersistence, withPersistenceTransaction } from './orgmasterPersistenceRepository'
import { evaluateVerifiedPrincipalPermission } from '../src/governance/evaluatePermission'
import { ADMINISTRATIVE_ROLE_IDS, AdministrationError, administrationHash, administrationPolicy, administrationRequestHash, applyAdministrativeGrantCommand, assertPlatformAdministrator, assertRecentAdministrativeAuthentication, parseAdministrationCommand, publishedAdministrationPolicy, type AdministrationCatalogBindings, type AdministrationCommand } from '../src/governance/administration'
import type { GovernanceActorContext, GovernanceDocumentV3, GovernanceOrgSource, GovernancePolicyDataV3 } from '../src/governance/types'
import {FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH} from '../src/governance/financialCatalog'
import {withAdministrativePrincipalSource} from './orgmasterAdministrationIdentity'

type Database = Pick<OrgmasterDatabase,'query'>
export type AdministrationSnapshot = { document:GovernanceDocumentV3; source:GovernanceOrgSource; revision:string; environmentKey:string; catalogBindings:AdministrationCatalogBindings }
export interface AdministrationReceipt {
 contractVersion:'orgmaster.administration-receipt.v1';commandId:string;result:'applied'|'no_change';administrationVersion:number;
 publishedPolicyId:string;grantIds:string[];outboxIds:string[];activation:'pending'|'acknowledged';correlationId?:string
}
export function orgmasterAdministrativeCatalogBinding(policy:GovernancePolicyDataV3) {
 const ids=new Set(policy.rolePermissionGrants.filter(grant=>grant.roleId==='role-orgmaster-admin' && grant.effect==='allow').map(grant=>grant.permissionId))
 const definition={stableRoleId:'role-orgmaster-admin',permissionCodes:policy.permissions.filter(permission=>permission.applicationId==='orgmaster' && permission.status==='active' && ids.has(permission.id)).map(permission=>permission.code).sort()}
 const roleDefinitionHash=administrationHash(definition)
 return {catalogVersion:'orgmaster.system-admin.v1',contentSha256:administrationHash({catalogVersion:'orgmaster.system-admin.v1',definition}),stableRoleId:'role-orgmaster-admin',roleDefinitionHash}
}
export function acceptedAdministrativeCatalogBindings(document:GovernanceDocumentV3):AdministrationCatalogBindings {
 const version=document.publishedVersions.find(value=>value.id===document.activePolicyVersionId)
 if(version?.kind!=='assignment-governance-v3') return {}
 const result:AdministrationCatalogBindings={orgmaster:orgmasterAdministrativeCatalogBinding(version.policy)}
 for(const catalog of version.externalRoleCatalogs) {
  if(catalog.applicationId!=='ai-pdm' && catalog.applicationId!=='financial-management-system') continue
  const role=catalog.roles.find(role=>role.stableRoleId===ADMINISTRATIVE_ROLE_IDS[catalog.applicationId] && role.status==='active')
  if(!role || !role.roleDefinitionHash || !/^[a-f0-9]{64}$/.test(role.roleDefinitionHash)) continue
  if(catalog.applicationId==='financial-management-system'){
   if(catalog.sourceKind!=='application-contract'||role.roleDefinitionHash!==FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH)continue
   result[catalog.applicationId]={catalogVersion:catalog.catalogVersion,contentSha256:catalog.contentSha256??catalog.payloadHash,stableRoleId:role.stableRoleId,roleDefinitionHash:role.roleDefinitionHash};continue
  }
  result[catalog.applicationId]={catalogVersion:catalog.catalogVersion,contentSha256:catalog.contentSha256??catalog.payloadHash,stableRoleId:role.stableRoleId,roleDefinitionHash:role.roleDefinitionHash}
 }
 return result
}
function activePolicy(snapshot:AdministrationSnapshot) {
 const policy=publishedAdministrationPolicy(snapshot.document)
 if(!policy) throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
 return policy
}
export function createAdministrationStore(input:{database:Database;readSnapshot:()=>Promise<AdministrationSnapshot>;now?:()=>string}) {
 const now=input.now??(()=>new Date().toISOString())
 async function targetFacts(command:AdministrationCommand) {
  if(!command.target) return null
  const result=await input.database.query(`SELECT principal_id AS "principalId",min(employee_id) AS "employeeId",min(account_type) AS "accountType",min(mapping_version)::text AS "mappingVersion"
   FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1 AND employee_id=$2 AND employee_status='active' AND account_type IN('human_personal','human_privileged') GROUP BY principal_id HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1`,[command.target.principalId,command.target.employeeId])
  if(result.rows.length!==1) throw new AdministrationError('ADMIN_TARGET_INVALID')
  return result.rows[0]
 }
 async function preview(actor:GovernanceActorContext,value:unknown) {
  const command=parseAdministrationCommand(value)
  const snapshot=await input.readSnapshot();const policy=activePolicy(snapshot);const at=now()
  assertRecentAdministrativeAuthentication(actor,at);assertPlatformAdministrator(policy,snapshot.source,actor,at)
  const expected={governanceRevision:snapshot.revision,organizationRevision:snapshot.source.workspaceRevision,administrationVersion:administrationPolicy(policy).version}
  if(administrationHash(expected)!==administrationHash(command.expected)) throw new AdministrationError('ADMINISTRATION_CONFLICT')
  const change=applyAdministrativeGrantCommand(policy,snapshot.source,command,{kind:'principal',id:actor.principalId},snapshot.catalogBindings,at)
  const requestHash=administrationRequestHash(command,actor.principalId,snapshot.environmentKey)
  const facts=await targetFacts(command)
  const previewHash=administrationHash({requestHash,expected:command.expected,catalogBindings:command.catalogBindings,targetFacts:facts,authentication:persistenceActorContext(actor)})
  const existing=command.grantId?administrationPolicy(policy).grants.find(value=>value.id===command.grantId):null
  return {contractVersion:'orgmaster.administration-preview.v1' as const,commandId:command.commandId,requestHash,previewHash,expiresAt:new Date(Math.min(Date.parse(at)+300000,Date.parse(actor.authenticatedAt!)+300000)).toISOString(),diff:{grantIds:change.grantIds,result:change.noChange?'no_change':'applied',operation:command.operation,employeeId:command.target?.employeeId??existing?.employeeId,applicationId:command.target?.applicationId??existing?.applicationId??null},expected,catalogBindings:command.catalogBindings,correlationId:randomUUID()}
 }
 async function commit(actor:GovernanceActorContext,value:unknown):Promise<AdministrationReceipt> {
  const command=parseAdministrationCommand(value)
  if(!command.previewHash) throw new AdministrationError('ADMINISTRATION_CONFLICT')
  try {
   const result=await input.database.query('SELECT orgmaster_core.apply_administration_command_v1($1::jsonb,$2::jsonb) AS receipt',[JSON.stringify(command),JSON.stringify(persistenceActorContext(actor))])
   if(result.rows.length!==1 || !result.rows[0].receipt) throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
   return {...result.rows[0].receipt,correlationId:randomUUID()}
  } catch(error) { throw administrationDatabaseError(error) }
 }
 async function workspace(actor:GovernanceActorContext) {
  const snapshot=await input.readSnapshot();const policy=activePolicy(snapshot);const administration=administrationPolicy(policy);const at=now()
  let mutate=false;try{assertPlatformAdministrator(policy,snapshot.source,actor,at);mutate=true}catch{}
  if(!mutate && evaluateVerifiedPrincipalPermission(snapshot.document,actor,'orgmaster.governance.manage',{now:at}).status!=='allowed') throw new AdministrationError('PLATFORM_ADMIN_REQUIRED')
  const eligiblePrincipals=snapshot.source.administrativePrincipals??policy.identityLinks.flatMap(link=>{const admission=policy.principalAdmissions?.find(value=>value.identityLinkId===link.id&&value.status==='active'&&['human_personal','human_privileged'].includes(value.accountType));return admission?[{principalId:link.principalId,employeeId:link.employeeId,accountType:admission.accountType as 'human_personal'|'human_privileged',status:'active' as const}]:[]})
  return {contractVersion:'orgmaster.administration-workspace.v1' as const,governanceRevision:snapshot.revision,organizationRevision:snapshot.source.workspaceRevision,administrationVersion:administration.version,initialized:administration.initializedByCommandId!==null,grants:administration.grants,catalogBindings:snapshot.catalogBindings,eligiblePrincipals:[...new Map(eligiblePrincipals.map(value=>[value.principalId,value])).values()],admission:{read:true,mutate},correlationId:randomUUID()}
 }
 async function status(actor:GovernanceActorContext,commandId:string):Promise<AdministrationReceipt> {
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(commandId)) throw new AdministrationError('ADMIN_TARGET_INVALID')
  try{
   const result=await input.database.query('SELECT orgmaster_core.read_administration_command_v1($1::uuid,$2::jsonb) AS receipt',[commandId,JSON.stringify(persistenceActorContext(actor))])
   if(!result.rows[0]?.receipt) throw new AdministrationError('COMMAND_NOT_COMMITTED')
   return {...result.rows[0].receipt,correlationId:randomUUID()}
  }catch(error){throw administrationDatabaseError(error)}
 }
 return {preview,commit,workspace,status}
}
export function administrationDatabaseError(error:unknown):AdministrationError {
 if(error instanceof AdministrationError) return error
 const message=error instanceof Error?error.message:''
 const code=['AUTH_RECENT_REQUIRED','PLATFORM_ADMIN_REQUIRED','ADMINISTRATION_CONFLICT','ADMINISTRATION_COMMAND_CONFLICT','ADMINISTRATION_ALREADY_INITIALIZED','CATALOG_BINDING_CONFLICT','COMMAND_NOT_COMMITTED','ADMIN_TARGET_INVALID','LAST_PLATFORM_ADMIN','IDENTITY_CONTEXT_REQUIRED'].find(code=>message.includes(code))
 return new AdministrationError(code??'ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
}
async function runStore<T>(root:string,run:(store:ReturnType<typeof createAdministrationStore>)=>Promise<T>) {
 if(!usesCloudSqlPersistence()) throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
 return withPersistenceTransaction(async()=>run(createAdministrationStore({database:currentPersistenceTransactionDatabase(),readSnapshot:async()=>{
  const current=await readExistingGovernanceStore(root);const source=await withAdministrativePrincipalSource(await loadOrganizationSource(root),currentPersistenceTransactionDatabase())
  const environmentKey=(await currentPersistenceTransactionDatabase().query('SELECT current_database() AS environment')).rows[0].environment
  return {...current,source,environmentKey,catalogBindings:acceptedAdministrativeCatalogBindings(current.document)}
 }})))
}
export const readAdministrationWorkspace=(root:string,actor:GovernanceActorContext)=>runStore(root,store=>store.workspace(actor))
export const previewAdministrationCommand=(root:string,actor:GovernanceActorContext,value:unknown)=>runStore(root,store=>store.preview(actor,value))
export const commitAdministrationCommand=(root:string,actor:GovernanceActorContext,value:unknown)=>runStore(root,store=>store.commit(actor,value))
export const readAdministrationCommand=(root:string,actor:GovernanceActorContext,id:string)=>runStore(root,store=>store.status(actor,id))
