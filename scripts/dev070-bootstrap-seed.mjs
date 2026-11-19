import vm from 'node:vm'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
const root=process.cwd(),source=await readFile(resolve(root,'src/governance/aiPdmCatalog.ts'),'utf8')
const initializer=source.match(/export const ORGMASTER_PERMISSIONS[^=]*=\s*(\[[\s\S]*?\r?\n\])/u)?.[1]
if(!initializer)throw new Error('ORGMASTER_SOURCE_PERMISSION_REGISTRY_INVALID')
const permissions=vm.runInNewContext(`(${initializer})`,Object.freeze({}),{timeout:1000})
if(!Array.isArray(permissions)||permissions.some(value=>value.applicationId!=='orgmaster'))throw new Error('ORGMASTER_SOURCE_PERMISSION_REGISTRY_INVALID')
const seed={applications:[{id:'orgmaster',name:'OrgMaster',status:'active'},{id:'ai-pdm',name:'AI-PDM',status:'active'},{id:'financial-management-system',name:'FMS',status:'active'}],identityLinks:[],principalAdmissions:[],applicationRoles:[{id:'role-orgmaster-admin',applicationId:'orgmaster',code:'orgmaster_admin',name:'OrgMaster 系統管理員',status:'active',systemDefined:true}],permissions,rolePermissionGrants:permissions.map(value=>({id:`grant-orgmaster-admin-${value.id}`,roleId:'role-orgmaster-admin',permissionId:value.id,effect:'allow'})),roleAssignments:[],roleDelegations:[],positionRolePolicies:[],applicationPositionAdoptions:[],managementGrants:[]}
const path=resolve(root,'contracts/orgmaster-administration-bootstrap/v1/source-seed.json'),bytes=`${JSON.stringify(seed,null,2)}\n`
await mkdir(resolve(root,'contracts/orgmaster-administration-bootstrap/v1'),{recursive:true})
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==bytes)throw new Error('ADMINISTRATION_BOOTSTRAP_SEED_DRIFT')}
else await writeFile(path,bytes)
const sqlPath=resolve(root,'db/migrations/045_dev070_administration_commands_v1.sql'),sql=await readFile(sqlPath,'utf8')
const fragment=`-- BEGIN DEV070 GENERATED SOURCE SEED\nCREATE FUNCTION orgmaster_core.administration_bootstrap_seed_v1() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $seed$ SELECT $json$${JSON.stringify(seed)}$json$::jsonb; $seed$;\nREVOKE ALL ON FUNCTION orgmaster_core.administration_bootstrap_seed_v1() FROM PUBLIC;\n-- END DEV070 GENERATED SOURCE SEED`
if(process.argv.includes('--check')){if(!sql.includes(fragment))throw new Error('ADMINISTRATION_BOOTSTRAP_SQL_DRIFT')}
else await writeFile(sqlPath,sql.replace(/-- BEGIN DEV070 GENERATED SOURCE SEED[\s\S]*?-- END DEV070 GENERATED SOURCE SEED/u,fragment))
console.log('DEV070 source-owned bootstrap seed checked')
