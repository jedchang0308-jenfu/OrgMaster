import assert from 'node:assert/strict'
import test from 'node:test'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
const service='orgmaster-prod',container='orgmaster'
const name='projects/jenfu-platform-prod/locations/asia-east1/services/'+service
const profile={target:{projectId:'jenfu-platform-prod',region:'asia-east1',serviceName:service},runtime:{containerName:container}}
const old=service+'-legacy',candidate=service+'-abcdef123456',recovery=service+'-recovery',tag='candidate-abcdef123456'
const image='asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:'+'a'.repeat(64)
const traffic=[{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',revision:old,percent:100},{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',revision:candidate,tag}]
const before={name,uid:'own-service-uid',etag:'before',generation:'41',observedGeneration:'41',reconciling:false,terminalCondition:{state:'CONDITION_SUCCEEDED'},scaling:{scalingMode:'MANUAL',manualInstanceCount:0},template:{containers:[{name:container,image:'candidate-image'}]},traffic,trafficStatuses:traffic}
const nextTraffic=[{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',revision:candidate,percent:100},{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',revision:candidate,tag}]
const after={...before,etag:'after',generation:'42',observedGeneration:'42',scaling:{scalingMode:'AUTOMATIC',maxInstanceCount:1},traffic:nextTraffic,trafficStatuses:nextTraffic}
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}})
function harness({baseline=before,final=after,partial=false}={}){
 const mutations=[];let reads=0,polls=0
 const transport=createOwnerTransport({token:'x'.repeat(32),sleep:async()=>undefined,fetchImpl:async(url,options={})=>{
  if(String(url).endsWith('/revisions/'+recovery))return json({name:name+'/revisions/'+recovery,service:name,conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}],containers:[{name:container,image}]})
  if(options.method==='PATCH'){mutations.push({url:String(url),body:JSON.parse(options.body)});return json({name:'projects/jenfu-platform-prod/locations/asia-east1/operations/activation'})}
  reads+=1;if(reads===1)return json(baseline);polls+=1
  return json(partial&&polls===1?{...after,scaling:before.scaling}:final)
 }})
 return {transport,mutations,polls:()=>polls,activate:()=>transport.activatePrincipalOnly({profile,oldRevision:old,recovery:{revision:recovery,imageDigest:image,serviceUid:before.uid},candidateRevision:candidate,candidateTag:tag,deadlineAt:'2999-01-01T00:00:00.000Z'})}
}
test('real transport atomically resumes only the verified Principal candidate and waits for scaling readback',async()=>{
 const h=harness({partial:true});const result=await h.activate()
 assert.equal(h.mutations.length,1);assert.equal(new URL(h.mutations[0].url).searchParams.get('updateMask'),'scaling,traffic')
 assert.deepEqual(Object.keys(h.mutations[0].body).sort(),['etag','name','scaling','traffic'])
 assert.deepEqual(h.mutations[0].body.scaling,{scalingMode:'AUTOMATIC',manualInstanceCount:null,maxInstanceCount:1})
 assert.ok(h.mutations[0].body.traffic.every(row=>row.revision===candidate));assert.equal(h.polls(),2)
 assert.equal(h.transport.effectiveRevision(result),candidate)
})
for(const [reason,baseline] of [['already active',{...before,scaling:after.scaling}],['wrong service uid',{...before,uid:'sibling'}]])test('activation refuses '+reason+' before any provider mutation',async()=>{
 const h=harness({baseline});await assert.rejects(h.activate());assert.equal(h.mutations.length,0)
})
for(const [reason,final] of [['service uid drift',{...after,uid:'sibling'}],['template drift',{...after,template:{containers:[{name:container,image:'different-image'}]}}]])test('activation refuses '+reason+' after provider readback',async()=>{
 const h=harness({final});await assert.rejects(h.activate());assert.equal(h.mutations.length,1)
})
test('transport continues to reject unrelated fields and standalone scaling mutation',async()=>{
 const h=harness();const body={name,etag:before.etag,scaling:after.scaling,traffic:nextTraffic}
 await assert.rejects(h.transport.patchService(profile,{...body,template:before.template},'scaling,traffic','2999-01-01T00:00:00.000Z'),/RUN_MUTATION_INVALID/u)
 await assert.rejects(h.transport.patchService(profile,{name,etag:before.etag,scaling:after.scaling},'scaling','2999-01-01T00:00:00.000Z'),/RUN_MUTATION_INVALID/u)
 assert.equal(h.mutations.length,0)
})
