import {canonicalize,sha256} from './dev012-production-migration-runner.mjs'
import {assertDev057UsersMigrationEntries} from './dev057-projed-users-migration.mjs'

// A separate reviewed owner forward, never an extension of PROJED_USERS.
export const FMS_PROJECTION_CURRENT = Object.freeze({order:69,version:'dev070-orgmaster-073',path:'db/migrations/073_dev070_fms_administrative_projection_current.sql',sourceSha256:'fc9e25f992cb89d33407529310bec66517954d253afde9a37cb9d782c5f905d4',appliedSha256:'a69451fc36c82d081dbbc4c171d5417cec41beb01e89d3fc8909372b47703e55'})
export function assertFmsProjectionCurrentEntries(entries) {
 if(!Array.isArray(entries)||entries.length!==69)throw Object.assign(new Error('MIGRATION_SET_DRIFT'),{code:'MIGRATION_SET_DRIFT'})
 assertDev057UsersMigrationEntries(entries.slice(0,68))
 const {order,version,path,sourceSha256,appliedSha256}=entries[68]
 if(canonicalize({order,version,path,sourceSha256,appliedSha256})!==canonicalize(FMS_PROJECTION_CURRENT))throw new Error('FMS_PROJECTION_FORWARD_ENTRIES_INVALID')
 return entries
}
export const FMS_PROJECTION_CURRENT_RELEASE_MODE='DEV070_FMS_PROJECTION_CURRENT_APPEND'
export const FMS_PROJECTION_CURRENT_REMEDIATION=Object.freeze({kind:'FMS_ADMINISTRATIVE_PROJECTION_CURRENT',migrationEntries:Object.freeze([FMS_PROJECTION_CURRENT]),consumerApplicationId:'financial-management-system',contractVersion:'orgmaster.application-administrator-grants.v1'})
export function assertFmsProjectionCurrentAppend(before,after) {
 assertDev057UsersMigrationEntries(before?.entries);assertFmsProjectionCurrentEntries(after?.entries)
 const inputs=({sourceRevision,manifestSha256,entries,...rest})=>rest
 if(before.baselineCount!==10||canonicalize(inputs(before))!==canonicalize(inputs(after))||canonicalize(before.entries)!==canonicalize(after.entries.slice(0,68)))throw new Error('FMS_PROJECTION_FORWARD_APPEND_INVALID')
 const {sourceRevision,manifestSha256,...body}=after
 return {migrationDisposition:'FORWARD_APPLY',pendingMigrationCount:1,migrationInputsSha256:sha256(canonicalize(body))}
}
export function assertFmsProjectionCurrentReleaseAuthority(readiness,authorization,intent=null) {
 const toolRef=readiness?.toolRotationRef??null
 if(readiness?.schemaVersion!=='orgmaster.routine-release-readiness.v1'||authorization?.schemaVersion!=='orgmaster.routine-release-authorization.v1'||authorization.authorizationBasis!=='OPERATOR_INVOKED_DEPLOY_PRODUCTION'
  ||[readiness,authorization].some(value=>value.ownerApplicationId!=='orgmaster'||value.devId!=='DEV-070'||value.slice!=='070-FMS-PROJECTION-CURRENT'||canonicalize(value.remediation)!==canonicalize(FMS_PROJECTION_CURRENT_REMEDIATION)||value.appArtifactReuse||value.schemaPredecessorRef!==undefined
   ||intent&&(value.sourceRevision!==intent.sourceRevision||value.releaseId!==intent.releaseId||!intent.baselineIntentRef||canonicalize(value.baselineIntentRef)!==canonicalize(intent.baselineIntentRef)))
  ||canonicalize(toolRef)!==canonicalize(authorization.toolRotationRef??null)
  ||toolRef&&(!intent||canonicalize(toolRef)!==canonicalize(intent.infraReceiptRef)||Object.keys(toolRef).sort().join(',')!=='sha256,uri'||!/^gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/tool-rotations\/[a-f0-9]{40}\/app-infra\.json$/u.test(toolRef.uri??'')||!/^[a-f0-9]{64}$/u.test(toolRef.sha256??'')))throw new Error('FMS_PROJECTION_FORWARD_AUTHORITY_INVALID')
 return {releaseMode:FMS_PROJECTION_CURRENT_RELEASE_MODE,remediation:FMS_PROJECTION_CURRENT_REMEDIATION}
}
export function buildFmsProjectionCurrentForward({predecessorEntries,sourceRevision,sqlBytes}) {
 assertDev057UsersMigrationEntries(predecessorEntries)
 if(!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||!Buffer.isBuffer(sqlBytes)||sqlBytes.includes(13)
  ||sha256(sqlBytes)!==FMS_PROJECTION_CURRENT.sourceSha256)throw new Error('FMS_PROJECTION_FORWARD_SOURCE_INVALID')
 // This exact migration's envelope is source pinned above. Avoid importing
 // the current-generation bundler back into its own manifest validator.
 const normalized=sqlBytes.toString('utf8'),envelope=/^(?<leading>(?:(?:--[^\n]*)?\n)*)BEGIN;\s*\n(?<body>[\s\S]*?)\nCOMMIT;\s*$/u.exec(normalized)
 if(!envelope)throw new Error('FMS_PROJECTION_FORWARD_APPLIED_INVALID')
 const sql=`${envelope.groups.leading}${envelope.groups.body}\n`
 if(sha256(sql)!==FMS_PROJECTION_CURRENT.appliedSha256)throw new Error('FMS_PROJECTION_FORWARD_APPLIED_INVALID')
 const entry={...FMS_PROJECTION_CURRENT,owner:'orgmaster',name:'dev070_fms_administrative_projection_current',sql}
 const body={format:'orgmaster.fms-administrative-projection-forward.v1',owner:'orgmaster',sourceRevision,
  predecessorEntriesSha256:sha256(canonicalize(predecessorEntries)),predecessorVersion:'dev057-orgmaster-072',
  ledger:'orgmaster_core.schema_migrations',entry}
 return Object.freeze({...body,manifestSha256:sha256(canonicalize(body))})
}
