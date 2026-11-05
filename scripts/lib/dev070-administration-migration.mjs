import {canonicalize,sha256} from './dev012-production-migration-runner.mjs'
import {DEV059_MIGRATION_ENTRY_COUNT,assertDev059MigrationEntries} from './dev059-fms-authority-migration.mjs'

export const DEV070_RELEASE_MODE='DEV070_ADMINISTRATION_APPEND'
export const DEV070_MIGRATION_PREFIX_COUNT=DEV059_MIGRATION_ENTRY_COUNT
export const DEV070_MIGRATION_ENTRIES=Object.freeze([
 Object.freeze({order:40,version:'dev057-orgmaster-042',path:'db/migrations/042_dev057_principal_display_profiles.sql',sourceSha256:'84955e2aa6f5223c3f8559335204742b034d45cb857823bbf97d75713de75ada',appliedSha256:'19e676787f9b6cc2f0cd0eb603b0271b36a7f6c52c406337b2f579146df39cf9'}),
 Object.freeze({order:41,version:'dev070-orgmaster-044',path:'db/migrations/044_dev070_administration_projection_v1.sql',sourceSha256:'e065b940f224589b8ed7e0c2f73abba510e40b543c6f76f0f4e53f4af0f60042',appliedSha256:'5740964348ddab2ec834ccb17d041fde0a1e831cdf80d764c420cb13996d383f'}),
 Object.freeze({order:42,version:'dev070-orgmaster-045',path:'db/migrations/045_dev070_administration_commands_v1.sql',sourceSha256:'74e5032d801f3e6bae8c24cb6572dc822a921878663ef6bec5b49f5b48410605',appliedSha256:'20cdbd5957bb999ea56b0433cc45b86d627e17ea84a504cb9ba31fd0d5a37f49'}),
])
export const DEV070_MIGRATION_ENTRY_COUNT=DEV070_MIGRATION_PREFIX_COUNT+DEV070_MIGRATION_ENTRIES.length
// 31–39 are the previously accepted DEV-059 exact ledger prefixes. 40–42
// permit readback/retry after a partial forward append, with every row/hash
// still checked by the shared runner. No unknown ledger layout is admitted.
export const DEV070_ACCEPTED_LEDGER_COUNTS=Object.freeze(Array.from({length:DEV070_MIGRATION_ENTRY_COUNT-30},(_,index)=>index+31))
export const DEV070_ADMINISTRATION_REMEDIATION=Object.freeze({kind:'PLATFORM_ADMINISTRATION_AUTHORITY',migrationEntries:DEV070_MIGRATION_ENTRIES,contractVersion:'orgmaster.administration-policy.v1',consumerApplicationIds:Object.freeze(['platform','ai-pdm','financial-management-system'])})
const identity=({order,version,path,sourceSha256,appliedSha256})=>({order,version,path,sourceSha256,appliedSha256})
const same=(a,b)=>canonicalize(a)===canonicalize(b)
const fail=code=>{throw Object.assign(new Error(code),{code})}

export function assertDev070MigrationEntries(entries){
 if(!Array.isArray(entries)||entries.length!==DEV070_MIGRATION_ENTRY_COUNT)fail('DEV070_MIGRATION_APPEND_INVALID')
 assertDev059MigrationEntries(entries.slice(0,DEV070_MIGRATION_PREFIX_COUNT))
 if(!same(entries.slice(DEV070_MIGRATION_PREFIX_COUNT).map(identity),DEV070_MIGRATION_ENTRIES))fail('DEV070_MIGRATION_APPEND_INVALID')
 for(const entry of entries.slice(DEV070_MIGRATION_PREFIX_COUNT))if(Object.hasOwn(entry,'sqlBase64')&&entry.name!==entry.path.split('/').at(-1).replace(/^\d{3}_/u,'').replace(/\.sql$/u,''))fail('DEV070_MIGRATION_APPEND_INVALID')
 return entries
}
export function assertDev070AdministrationAppend(before,after){
 const staticInputs=({sourceRevision,manifestSha256,entries,...inputs})=>inputs
 const migrationInputs=({sourceRevision,manifestSha256,...inputs})=>inputs
 assertDev070MigrationEntries(after.entries)
 const count=before.entries?.length
 if(before.baselineCount!==10||!DEV070_ACCEPTED_LEDGER_COUNTS.includes(count)||count>=DEV070_MIGRATION_ENTRY_COUNT
  ||!same(staticInputs(before),staticInputs(after))||!same(before.entries,after.entries.slice(0,count)))fail('DEV070_MIGRATION_APPEND_INVALID')
 return{migrationDisposition:'FORWARD_APPLY',pendingMigrationCount:DEV070_MIGRATION_ENTRY_COUNT-count,migrationInputsSha256:sha256(canonicalize(migrationInputs(after)))}
}
export function assertDev070AdministrationReleaseAuthority(readiness,authorization,intent=null){
 if(readiness?.schemaVersion!=='orgmaster.routine-release-readiness.v1'||authorization?.schemaVersion!=='orgmaster.routine-release-authorization.v1'
  ||authorization.authorizationBasis!=='OPERATOR_INVOKED_DEPLOY_PRODUCTION'
  ||[readiness,authorization].some(row=>row.ownerApplicationId!=='orgmaster'||row.devId!=='DEV-070'||row.slice!=='070-ADMINISTRATION'
   ||!same(row.remediation,DEV070_ADMINISTRATION_REMEDIATION)||row.toolRotationRef||row.appArtifactReuse
   ||(intent&&(row.sourceRevision!==intent.sourceRevision||row.releaseId!==intent.releaseId||!intent.baselineIntentRef||!same(row.baselineIntentRef,intent.baselineIntentRef)))))fail('DEV070_ADMINISTRATION_AUTHORITY_INVALID')
 return{releaseMode:DEV070_RELEASE_MODE,remediation:DEV070_ADMINISTRATION_REMEDIATION}
}
