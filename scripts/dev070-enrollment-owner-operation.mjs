#!/usr/bin/env node
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {readGitAuthority} from './lib/dev012-owner-prerequisite-producer.mjs'
import {readGitBlob} from './lib/dev012-owner-stage-executor.mjs'
import {createOwnerTransport,canonicalize,sha256} from './lib/dev012-owner-release-runtime.mjs'
import {readRoutineBaseline} from './lib/dev040-routine-release.mjs'
import {verifyOfficialMergedSource} from './lib/dev012-official-source-review.mjs'
import {assertEnrollmentIntentInput} from './dev070-production-enrollment-intent-runner.mjs'
import {assertDev070MigrationEntries} from './lib/dev070-administration-migration.mjs'
export function parseEnrollmentOwnerOperationArgs(argv){
 const keys=['--action','--intent-file','--release-capsule-ref'],options={}
 for(let index=0;index<argv.length;index+=2){if(!keys.includes(argv[index])||!argv[index+1]||options[argv[index]])throw new Error('DEV070_OWNER_INTENT_ARGUMENT_INVALID');options[argv[index]]=argv[index+1]}
 if(Object.keys(options).length!==3||!['plan','admit','revoke','status'].includes(options['--action']))throw new Error('DEV070_OWNER_INTENT_ARGUMENT_INVALID')
 const match=/^(gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/[A-Za-z0-9._/-]+)#sha256=([a-f0-9]{64})$/.exec(options['--release-capsule-ref'])
 if(!match||match[1].includes('..'))throw new Error('DEV070_OWNER_INTENT_REF_INVALID')
 return {action:options['--action'],intentFile:options['--intent-file'],releaseIntentRef:{uri:match[1],sha256:match[2]}}
}
export async function executeEnrollmentOwnerOperation({profile,transport,sourceRevision,releaseIntentRef,intent,action}){
 const allowed=['contractVersion','commandId','environmentKey','sourceRevision','employeeId','directoryKey','principalId','expiresAt','expected','reason','admittingWorkload'].sort()
 if(Object.keys(intent??{}).sort().join(',')!==allowed.join(',')||intent.contractVersion!=='orgmaster.administration-enrollment-intent.v1'||intent.sourceRevision!==sourceRevision||intent.environmentKey!=='jenfu_prod')throw new Error('DEV070_OWNER_INTENT_INPUT_INVALID')
 assertEnrollmentIntentInput(intent,action)
 const baseline=await readRoutineBaseline({profile,transport,baselineIntentRef:releaseIntentRef})
 if(baseline.repair||baseline.intent.sourceRevision!==sourceRevision||baseline.terminal.value.facts.result!=='RELEASED')throw new Error('DEV070_OWNER_INTENT_RELEASE_NOT_READY')
 assertDev070MigrationEntries(baseline.bundle.value.entries)
 const manifest={schemaVersion:'orgmaster.administration-enrollment-owner-operation.v1',ownerApplicationId:'orgmaster',action,sourceRevision,releaseIntentRef,terminalRef:baseline.terminal.ref,deploymentRef:baseline.deployment.ref,migrationBundleRef:baseline.deployment.value.migrationBundleRef,intent}
 const hash=sha256(canonicalize(manifest)),bucket=profile.artifact.releaseBucket
 const input=await transport.putJson(`gs://${bucket}/source/migration-bundles/enrollment-intents/${intent.commandId}/${action}-${hash}.json`,manifest,{bucket,prefix:'source/migration-bundles',ifGenerationMatch:'0'})
 // Status is a fresh observation of mutable native state. Keep its sealed
 // input/intent unchanged while retaining each immutable output separately.
 const observation=action==='status'?`-${randomUUID()}`:''
 const outputUri=`gs://${bucket}/receipts/administration-enrollment/${intent.commandId}/${action}-${hash}${observation}.json`
 // The normal job guard checks its exact sealed image, SA, socket, env,
 // task count and no-retry template before dispatching these typed args.
 let receipt=await transport.readBytes(outputUri,{prefixes:['receipts']}).catch(error=>{if(error.code==='MISSING'&&error.detail==='404')return null;throw error})
 if(!receipt){await transport.runMigrationJob({profile,deployment:baseline.deployment.value,outputUri,deadlineAt:new Date(Date.now()+120000).toISOString(),enrollmentIntentOperation:{action,ref:input.ref}});receipt=await transport.readBytes(outputUri,{prefixes:['receipts']})}
 const value=JSON.parse(receipt.bytes),{receiptSha256,...core}=value
 if(receiptSha256!==sha256(canonicalize(core))||value.sourceRevision!==sourceRevision||value.commandId!==intent.commandId||value.action!==action||canonicalize(value.inputRef)!==canonicalize(input.ref)||value.status!=='PASS')throw new Error('DEV070_OWNER_INTENT_RECEIPT_INVALID')
 return {receiptRef:receipt.ref,...value}
}
async function main(){
 const options=parseEnrollmentOwnerOperationArgs(process.argv.slice(2)),root=resolve(fileURLToPath(new URL('../',import.meta.url)))
 const command=(name,args)=>{const r=spawnSync(name,args,{cwd:root,encoding:'utf8',windowsHide:true});if(r.error||r.status!==0)throw new Error('DEV070_OWNER_INTENT_AUTHORITY_UNAVAILABLE');return r.stdout.trim()}
 const profile=JSON.parse(readGitBlob(root,'config/release/dev040-orgmaster-independent-production-v3.json')),git=readGitAuthority(root,profile)
 await verifyOfficialMergedSource({repository:profile.application.repository,branch:profile.application.branch,revision:git.sourceRevision,sourceTree:git.sourceTree,rulesetId:24077876,token:process.env.GITHUB_TOKEN||command('gh',['auth','token'])})
 const token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN||(process.platform==='win32'?command('pwsh',['-NoProfile','-Command','gcloud auth print-access-token']):command('gcloud',['auth','print-access-token']))
 const result=await executeEnrollmentOwnerOperation({...options,profile,sourceRevision:git.sourceRevision,transport:createOwnerTransport({token}),intent:JSON.parse(await readFile(options.intentFile,'utf8'))})
 process.stdout.write(JSON.stringify(result)+'\n')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write((error.code??error.message)+'\n');process.exitCode=1})
