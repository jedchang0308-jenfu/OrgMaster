import {canonicalize,sha256} from './dev012-production-migration-runner.mjs'
import {DEV059_MIGRATION_ENTRY_COUNT,assertDev059MigrationEntries} from './dev059-fms-authority-migration.mjs'

export const DEV070_RELEASE_MODE='DEV070_ADMINISTRATION_APPEND'
export const DEV070_MIGRATION_PREFIX_COUNT=DEV059_MIGRATION_ENTRY_COUNT
export const DEV070_MIGRATION_ENTRIES=Object.freeze([
 Object.freeze({order:40,version:'dev057-orgmaster-042',path:'db/migrations/042_dev057_principal_display_profiles.sql',sourceSha256:'84955e2aa6f5223c3f8559335204742b034d45cb857823bbf97d75713de75ada',appliedSha256:'19e676787f9b6cc2f0cd0eb603b0271b36a7f6c52c406337b2f579146df39cf9'}),
 Object.freeze({order:41,version:'dev070-orgmaster-044',path:'db/migrations/044_dev070_administration_projection_v1.sql',sourceSha256:'e065b940f224589b8ed7e0c2f73abba510e40b543c6f76f0f4e53f4af0f60042',appliedSha256:'5740964348ddab2ec834ccb17d041fde0a1e831cdf80d764c420cb13996d383f'}),
 Object.freeze({order:42,version:'dev070-orgmaster-045',path:'db/migrations/045_dev070_administration_commands_v1.sql',sourceSha256:'2cdbd914251c8874cfafbcae108ffb4a8b8c6f8c1c8db381db2ca845802d7f7f',appliedSha256:'334c287a8f038e1b33cf934642bd724f7d3939b09c41f95c213800c82889d663'}),
 Object.freeze({"order":43,"version":"dev070-orgmaster-047","path":"db/migrations/047_dev070_scoped_ai_pdm_principal_readers.sql","sourceSha256":"b6837188519c403004c1bbbd4e70e91af35b9f366842707f115f7f6dcac251ce","appliedSha256":"7dd50c0485301bf8c58a36ac630b467152fdc2a456459dc586e1e87e902974bf"}),
 Object.freeze({"order":44,"version":"dev070-orgmaster-048","path":"db/migrations/048_dev070_governance_scalar_projection.sql","sourceSha256":"75c56c01a50c9aec50c6fc6cba25d3c01993631ad48aff9300182aa23891e1c2","appliedSha256":"e817ca52e4e52c67fa3f43885fbfb99334067dc6e670ab129752933b38ea7179"}),
 Object.freeze({"order":45,"version":"dev070-orgmaster-049","path":"db/migrations/049_dev070_scoped_pdm_role_policy_manager.sql","sourceSha256":"ae4f3730525417b638cb65175606f7d6d8589c1a89cf61125ffbdd629f4f0e9b","appliedSha256":"3c4a56696e2f224a7911fd45d2e2d3579657a8a941ac9de39c20c87f4f2212f1"}),
])
export const DEV070_MIGRATION_ENTRY_COUNT=DEV070_MIGRATION_PREFIX_COUNT+DEV070_MIGRATION_ENTRIES.length
// 31–39 are the previously accepted DEV-059 exact ledger prefixes. 40–45
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
 const toolRef=readiness?.toolRotationRef??null
 if(!same(toolRef,authorization?.toolRotationRef??null)||toolRef&&(!intent||!same(toolRef,intent.infraReceiptRef)
  ||Object.keys(toolRef).sort().join(',')!=='sha256,uri'||!/^gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/tool-rotations\/[a-f0-9]{40}\/app-infra\.json$/u.test(toolRef.uri??'')||!/^[a-f0-9]{64}$/u.test(toolRef.sha256??'')))fail('DEV070_ADMINISTRATION_AUTHORITY_INVALID')
 if(readiness?.schemaVersion!=='orgmaster.routine-release-readiness.v1'||authorization?.schemaVersion!=='orgmaster.routine-release-authorization.v1'
  ||authorization.authorizationBasis!=='OPERATOR_INVOKED_DEPLOY_PRODUCTION'
  ||[readiness,authorization].some(row=>row.ownerApplicationId!=='orgmaster'||row.devId!=='DEV-070'||row.slice!=='070-ADMINISTRATION'
   ||!same(row.remediation,DEV070_ADMINISTRATION_REMEDIATION)||row.appArtifactReuse
   ||(intent&&(row.sourceRevision!==intent.sourceRevision||row.releaseId!==intent.releaseId||!intent.baselineIntentRef||!same(row.baselineIntentRef,intent.baselineIntentRef)))))fail('DEV070_ADMINISTRATION_AUTHORITY_INVALID')
 return{releaseMode:DEV070_RELEASE_MODE,remediation:DEV070_ADMINISTRATION_REMEDIATION}
}
