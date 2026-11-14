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
 Object.freeze({"order":46,"version":"dev070-orgmaster-050","path":"db/migrations/050_dev070_administrative_definitions_v2.sql","sourceSha256":"82a68daa71d4afcf97a687055e5a4cbe95dafd60e3c4af10fd2dee1dc6bb3cfd","appliedSha256":"3e892993172277ac4caf6694a52948839d99c257f4e6e1888de86d190fd116db"}),
 Object.freeze({order:47,version:'dev070-orgmaster-051',path:'db/migrations/051_dev070_scoped_portal_orgmaster_visibility.sql',sourceSha256:'c65540b4e7b97e7a3d91aa6c3f8b95bdd47f067addea90b6226312178a2c913a',appliedSha256:'4b77e7f4d07c08be67709e9c6bcc06e177f44fe8951adc91b342084b16c9776d'}),
 Object.freeze({order:48,version:'dev070-orgmaster-052',path:'db/migrations/052_dev070_fms_authority_point_v4.sql',sourceSha256:'39dda03076fe2b7a42ab661efdd40c2e0cded6565a6be79b8d116021d4ef5df0',appliedSha256:'22043040a65c436e1782afdb2c141677f8270cb17baf93421144a1d9759923ee'}),
 Object.freeze({"order":49,"version":"dev070-orgmaster-053","path":"db/migrations/053_dev070_fms_indexed_authority.sql","sourceSha256":"1de121b3661076463e0c08e44dc7f3e69f839dfe5e5f1e5d6b5d44ec5cabddf7","appliedSha256":"2e7641f09bb66455368ee9a3d652312a01305ceb4f04a3540e0aefa69bcbe327"}),
 Object.freeze({"order":50,"version":"dev070-orgmaster-054","path":"db/migrations/054_dev070_fms_authority_publication_status.sql","sourceSha256":"c588d52616f3be5dc436dc189e8e5c1ac9d3ae37adc6a6f1b5d58a7087f3d0d4","appliedSha256":"82ba01163be41b4b950462bc9840a0bf583eb6ec37886b4c7bc284a8c49aa0fe"}),
 Object.freeze({"order":51,"version":"dev070-orgmaster-055","path":"db/migrations/055_dev070_fms_session_display_profile.sql","sourceSha256":"fbc312828f6a820e666d7ea116877a5f6f597f76bd97dcbf6028fdec48f21fda","appliedSha256":"8a3c452c8b4bd353f1adcfac6bc84cd35eb9c4f05e7a0e56a36fe95310492bea"}),
 Object.freeze({"order":52,"version":"dev057-orgmaster-056","path":"db/migrations/056_dev057_ai_pdm_session_authority.sql","sourceSha256":"8879d2403145816d0188c166d27541f7242279f0069c46f7cb82927a4d554f43","appliedSha256":"3dccfac9b267d06b5eabb3219e21f5aff788fbce43affc6c6c5fe4e755962703"}),
 Object.freeze({"order":53,"version":"dev057-orgmaster-057","path":"db/migrations/057_dev057_pdm_session_publication.sql","sourceSha256":"c5f22d066a2c4d4b2629db88afd2baa4d0bedb259b743e9c3609fac545f85fee","appliedSha256":"646062e6f86bf976e1d7f0447321c191480fe869269104d76553766535028a6f"}),
])
export const DEV070_MIGRATION_ENTRY_COUNT=DEV070_MIGRATION_PREFIX_COUNT+DEV070_MIGRATION_ENTRIES.length
// 31–39 are the previously accepted DEV-059 exact ledger prefixes. 40–53
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
