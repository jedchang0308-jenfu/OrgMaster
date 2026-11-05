import {createHash,randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)
export const ownerHash=value=>createHash('sha256').update(canonical(value)).digest('hex')
export function parseAdministrationOwnerArguments(args){
 const [action,...rest]=args
 if(!['plan','verify','commit','status'].includes(action))throw new Error('ADMINISTRATION_OWNER_ACTION_INVALID')
 const options={action}
 for(let index=0;index<rest.length;index+=2){const key=rest[index];if(!['--request','--plan','--output'].includes(key)||!rest[index+1]||rest[index+1].startsWith('--'))throw new Error('ADMINISTRATION_OWNER_ARGUMENT_INVALID');if(options[key.slice(2)])throw new Error('ADMINISTRATION_OWNER_ARGUMENT_INVALID');options[key.slice(2)]=rest[index+1]}
 if(action==='plan'?!options.request||!options.output:!options.plan)throw new Error('ADMINISTRATION_OWNER_ARGUMENT_INVALID')
 return options
}
export async function planAdministrationOwner({database,request,identity,directory,ownerProviderFacts,root=process.cwd()}){
 if(Object.keys(request).some(key=>!['environmentKey','employeeNumber','directoryKey','applications','plannedProtectedOperations','reason','commandId'].includes(key)))throw new Error('ADMIN_TARGET_INVALID')
 const target=(await database.query(`SELECT current_database() AS environment,SESSION_USER::text AS db_user,pg_has_role(SESSION_USER,'jenfu_orgmaster_migrator','MEMBER') AS migrator`)).rows[0]
 if(!target?.migrator||target.environment!==request.environmentKey||ownerProviderFacts.dbSessionUser!==target.db_user||!/^[0-9]{18,24}$/.test(ownerProviderFacts.providerSubject))throw new Error('PLATFORM_ADMIN_REQUIRED')
 if(identity.signInProvider!=='google.com'||!identity.emailVerified||identity.googleUserId!==directory.userId||directory.directoryState!=='present'||identity.email!==directory.primaryEmail||directory.customerId!==request.directoryKey.customerId||directory.userId!==request.directoryKey.userId)throw new Error('ADMIN_TARGET_INVALID')
 const age=Date.now()-Date.parse(identity.authenticatedAt??'');if(!Number.isFinite(age)||age<0||age>300000||!['aal1','aal2'].includes(identity.assuranceLevel))throw new Error('AUTH_RECENT_REQUIRED')
 const employees=(await database.query(`SELECT number.employee_id,employee.workspace_revision FROM orgmaster_core.employee_number_assignments number JOIN orgmaster_core.v_current_workspace_employees_v1 employee ON employee.employee_id=number.employee_id AND employee.employee_status='active' WHERE number.employee_number=$1`,[request.employeeNumber])).rows
 if(employees.length!==1)throw new Error('ADMIN_TARGET_INVALID')
 const employee=employees[0]
 const pair=(await database.query(`SELECT principal_id,employee_id FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer=$1 AND principal_subject=$2`,[identity.issuer,identity.subject])).rows
 if(pair.length>1||pair.some(value=>value.employee_id!==employee.employee_id||!value.principal_id))throw new Error('ADMIN_TARGET_INVALID')
 const managed=(await database.query(`SELECT principal_id,employee_id FROM orgmaster_core.managed_daily_identities WHERE directory_customer_id=$1 AND directory_user_id=$2`,[directory.customerId,directory.userId])).rows
 if(managed.length>1||managed.some(value=>value.employee_id!==employee.employee_id)||pair[0]&&managed[0]&&pair[0].principal_id!==managed[0].principal_id)throw new Error('ADMIN_TARGET_INVALID')
 const principalId=pair[0]?.principal_id??managed[0]?.principal_id??`principal-managed:${randomUUID()}`
 const artifact=(await database.query(`SELECT artifact.payload,trim(artifact.canonical_sha256) revision FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' WHERE authority.singleton`)).rows[0]
 if(!artifact)throw new Error('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
 const publication=artifact.payload.publishedVersions.find(value=>value.id===artifact.payload.activePolicyVersionId&&value.kind==='assignment-governance-v3')
 const policy=publication?.policy??JSON.parse(await readFile(resolve(root,'contracts/orgmaster-administration-bootstrap/v1/source-seed.json'),'utf8'))
 if(policy.administration?.initializedByCommandId)throw new Error('ADMINISTRATION_ALREADY_INITIALIZED')
 const permissionIds=new Set(policy.rolePermissionGrants.filter(value=>value.roleId==='role-orgmaster-admin'&&value.effect==='allow').map(value=>value.permissionId))
 const definition={stableRoleId:'role-orgmaster-admin',permissionCodes:policy.permissions.filter(value=>value.applicationId==='orgmaster'&&value.status==='active'&&permissionIds.has(value.id)).map(value=>value.code).sort()}
 const catalogBindings={orgmaster:{catalogVersion:'orgmaster.system-admin.v1',contentSha256:ownerHash({catalogVersion:'orgmaster.system-admin.v1',definition}),stableRoleId:'role-orgmaster-admin',roleDefinitionHash:ownerHash(definition)}}
 for(const applicationId of request.applications??[]){
  if(!['ai-pdm','financial-management-system'].includes(applicationId))throw new Error('ADMIN_TARGET_INVALID')
  const catalog=publication?.externalRoleCatalogs.find(value=>value.applicationId===applicationId&&value.validationState==='valid')
  const role=catalog?.roles.find(value=>value.stableRoleId===(applicationId==='ai-pdm'?'role-application-system-admin':'role-system-admin')&&value.status==='active')
  if(!role?.roleDefinitionHash)throw new Error('CATALOG_BINDING_CONFLICT')
  if(applicationId==='financial-management-system'){if(catalog.sourceKind!=='application-contract'||role.roleDefinitionHash!=='2a8ab5c084e00f9cd1f9a87e193d1269ea85c80eb66fba78c1b6ab2ab467ce11')throw new Error('CATALOG_BINDING_CONFLICT');catalogBindings[applicationId]={catalogVersion:catalog.catalogVersion,contentSha256:catalog.contentSha256??catalog.payloadHash,stableRoleId:role.stableRoleId,roleDefinitionHash:role.roleDefinitionHash}}else catalogBindings[applicationId]={catalogVersion:catalog.catalogVersion,contentSha256:catalog.contentSha256??catalog.payloadHash,stableRoleId:role.stableRoleId,roleDefinitionHash:role.roleDefinitionHash}
 }
 const nativeFacts={principalId,employeeId:employee.employee_id,directoryCustomerId:directory.customerId,directoryUserId:directory.userId,issuer:identity.issuer,subject:identity.subject,primaryEmail:directory.primaryEmail}
 const now=new Date().toISOString(),reason=request.reason?.normalize('NFC').trim();if(!reason||[...reason].length>240)throw new Error('ADMIN_TARGET_INVALID')
 const payload={contractVersion:'orgmaster.administration-owner-plan.v1',commandId:request.commandId??randomUUID(),environmentKey:request.environmentKey,owner:{principalId:'principal-workload:orgmaster-administration-initialize',dbSessionUser:target.db_user,providerSubject:ownerProviderFacts.providerSubject},target:{principalId,employeeId:employee.employee_id,directoryKey:request.directoryKey,identityFactsHash:ownerHash(nativeFacts)},expected:{governanceRevision:artifact.revision,organizationRevision:employee.workspace_revision,administrationVersion:policy.administration?.version??0},catalogBindings,grants:[{roleCode:'platform_super_admin',applicationId:null,validFrom:now,validTo:null},...Object.keys(catalogBindings).map(applicationId=>({roleCode:'application_system_admin',applicationId,validFrom:now,validTo:null}))],plannedProtectedOperations:request.plannedProtectedOperations??[],reason}
 return {...payload,planHash:ownerHash(payload)}
}
