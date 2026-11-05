import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {createOrgmasterDatabase,assertOrgmasterProductionTarget,type OrgmasterDatabase} from './orgmasterDatabase'
import {createOrgmasterPrincipalLifecycleClient} from './orgmasterPrincipalLifecycleClient'
import type {LifecycleClaimV2,LifecycleCycleControl,LifecycleReceiptV2} from './orgmasterManagedIdentitySync'

type Database=Pick<OrgmasterDatabase,'query'>
export type AdministrationLifecycleDispatcher=ReturnType<typeof createAdministrationLifecycleDispatcher>
export function createAdministrationLifecycleDispatcher(input:{database:Database;dispatch:(claim:LifecycleClaimV2,control:LifecycleCycleControl)=>Promise<LifecycleReceiptV2>}){
 const controllers=new Set<AbortController>();let closed=false;let running:Promise<{completed:number;pending:boolean}>|null=null
 async function cycle(resumeBlocked=false){
  if(closed)throw new Error('ADMINISTRATION_LIFECYCLE_CLOSED')
  const controller=new AbortController();controllers.add(controller)
  const control={signal:controller.signal,deadlineAt:performance.now()+12_000},lease=randomUUID()
  let timer:ReturnType<typeof setTimeout>|undefined
  const deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('ADMINISTRATION_LIFECYCLE_DEADLINE'))},12000)})
  const query:Database['query']=(async(sql:unknown,values?:unknown[])=>{if(controller.signal.aborted)throw new Error('ADMINISTRATION_LIFECYCLE_DEADLINE');const result=await input.database.query(sql as string,values);if(controller.signal.aborted)throw new Error('ADMINISTRATION_LIFECYCLE_DEADLINE');return result}) as Database['query']
  let completed=0,pending=false
  const work=async()=>{try{
   const executorRows=(await query('SELECT orgmaster_core.assert_lifecycle_executor_v2(NULL) executor')).rows
   if(executorRows.length!==1)throw new Error('MANAGED_LIFECYCLE_EXECUTOR_INVALID')
   const executor=executorRows[0].executor
   if(resumeBlocked)await query('SELECT orgmaster_core.resume_administration_lifecycle_v1($1)',[executor])
   const claims=(await query('SELECT * FROM orgmaster_core.claim_administration_lifecycle_v1($1,$2::uuid,2)',[executor,lease])).rows
   if(claims.length>2||new Set(claims.map(row=>row.event_id)).size!==claims.length)throw new Error('MANAGED_LIFECYCLE_CLAIM_INVALID')
   for(const row of claims){
    if(controller.signal.aborted){pending=true;break}
    const claim={eventId:row.event_id,operationId:row.operation_id,sourceRevision:row.source_revision,snapshotHash:row.snapshot_hash,leaseGeneration:Number(row.lease_generation)}
    try{
     const receipt=await input.dispatch(claim,control)
     if(receipt.eventId!==claim.eventId||receipt.snapshotHash!==claim.snapshotHash||receipt.deliveryPrincipalId!==executor)throw new Error('MANAGED_LIFECYCLE_RECEIPT_INVALID')
     await query('SELECT orgmaster_core.complete_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,$5::uuid)',[executor,lease,claim.eventId,claim.leaseGeneration,receipt.receiptId])
     completed++
    }catch{
     pending=true
     await query("SELECT orgmaster_core.retry_principal_lifecycle_v2($1,$2::uuid,$3::uuid,$4,'DISPATCH_UNAVAILABLE')",[executor,lease,claim.eventId,claim.leaseGeneration]).catch(()=>undefined)
    }
   }
   return {completed,pending}
  }finally{clearTimeout(timer);controllers.delete(controller);controller.abort()}}
  try{return await Promise.race([work(),deadline])}finally{clearTimeout(timer);controllers.delete(controller);controller.abort()}
 }
 return {runOnce(resumeBlocked=false){if(running)return running;running=cycle(resumeBlocked).finally(()=>{running=null});return running},close(){closed=true;for(const controller of controllers)controller.abort()}}
}

let production:AdministrationLifecycleDispatcher|undefined
export function productionAdministrationLifecycle(environment:NodeJS.ProcessEnv=process.env){
 if(environment.ORGMASTER_DEPLOYMENT_ENV!=='production')return undefined
 assertOrgmasterProductionTarget(environment,'runtime')
 if(environment.ORGMASTER_PUBLIC_BASE_URL!=='https://orgmaster-prod-9536592944.asia-east1.run.app'||!environment.ORGMASTER_POSTGRES_URL)throw new Error('ADMINISTRATION_LIFECYCLE_TARGET_INVALID')
 production??=createAdministrationLifecycleDispatcher({database:createOrgmasterDatabase(environment.ORGMASTER_POSTGRES_URL,environment),dispatch:createOrgmasterPrincipalLifecycleClient().dispatch})
 return production
}
