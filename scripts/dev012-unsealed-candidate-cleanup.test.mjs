import assert from 'node:assert/strict'
import test from 'node:test'
import {createOwnerTransport} from './lib/dev012-owner-release-runtime.mjs'
import {cleanupUnsealedCandidateTag} from './lib/dev012-unsealed-candidate-cleanup.mjs'
const profile={target:{projectId:'jenfu-platform-prod',region:'asia-east1',serviceName:'orgmaster-prod'}}
const tag='candidate-0123456789ab',candidateRevision='orgmaster-prod-0123456789ab',active='orgmaster-prod-stable'
const name='projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod'
const activeRow={type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',revision:active,percent:100}
function fixture(mutateBefore=()=>{},mutateAfter=()=>{},patchStatus=200,revisionState='CONDITION_FAILED'){
  const before={name,etag:'e1',generation:'1',observedGeneration:'1',reconciling:false,terminalCondition:{state:'CONDITION_FAILED'},traffic:[activeRow,{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',tag,revision:candidateRevision,percent:0}],trafficStatuses:[activeRow]}
  const after={...structuredClone(before),etag:'e2',generation:'2',observedGeneration:'2',terminalCondition:{state:'CONDITION_SUCCEEDED'},traffic:[activeRow],trafficStatuses:[activeRow]}
  mutateBefore(before);mutateAfter(after);const calls=[];let patched=false
  const transport=createOwnerTransport({token:'synthetic-not-a-credential',fetchImpl:async(url,options={})=>{
    calls.push({url,method:options.method??'GET',body:options.body})
    if(options.method==='PATCH'){patched=true;return new Response(JSON.stringify({name:'operations/cleanup'}),{status:patchStatus,headers:{'content-type':'application/json'}})}
    if(url.includes('/revisions/'))return new Response(JSON.stringify({name:name+'/revisions/'+candidateRevision,service:name,conditions:[{type:'Ready',state:revisionState}]}),{headers:{'content-type':'application/json'}})
    return new Response(JSON.stringify(patched?after:before),{headers:{'content-type':'application/json'}})
  }})
  return {before,after,calls,run:()=>cleanupUnsealedCandidateTag({transport,profile,tag,candidateRevision,allowedActiveRevisions:[active],deadlineAt:new Date(Date.now()+250).toISOString()})}
}
test('configured failed candidate absent from status projection is cleaned with exact traffic CAS',async()=>{
  const h=fixture(),result=await h.run();assert.equal(result.changed,true);assert.equal(result.service.trafficStatuses[0].revision,active)
  const patches=h.calls.filter(c=>c.method==='PATCH');assert.equal(patches.length,1)
  assert.deepEqual(JSON.parse(patches[0].body),{name,etag:'e1',traffic:[activeRow]})
  assert.ok(patches[0].url.includes('updateMask=traffic&allowMissing=false'))
})
const negatives={
  statusOnly:b=>{b.traffic=[activeRow];b.trafficStatuses.push({tag,revision:candidateRevision,percent:0})},
  nonZero:b=>{b.traffic[1].percent=1},wrongRevision:b=>{b.traffic[1].revision='orgmaster-prod-unrelated'},
  duplicate:b=>{b.traffic.push({...b.traffic[1]})},otherStatusTag:b=>{b.trafficStatuses.push({tag:'candidate-aaaaaaaaaaaa',revision:candidateRevision,percent:0})},
  generationDrift:b=>{b.observedGeneration='0'},reconciling:b=>{b.reconciling=true},
  differentActive:b=>{b.trafficStatuses=[{...activeRow,revision:'orgmaster-prod-unrelated'}]},
}
for(const [caseId,mutate]of Object.entries(negatives))test('unsealed cleanup denies '+caseId+' before PATCH',async()=>{const h=fixture(mutate);await assert.rejects(h.run);assert.equal(h.calls.filter(c=>c.method==='PATCH').length,0)})
for(const [caseId,mutate]of Object.entries({configuredTag:a=>{a.traffic.push({tag,revision:candidateRevision,percent:0})},observedTag:a=>{a.trafficStatuses.push({tag,revision:candidateRevision,percent:0})},failed:a=>{a.terminalCondition.state='CONDITION_FAILED'},activeDrift:a=>{a.trafficStatuses=[{...activeRow,revision:'orgmaster-prod-unrelated'}]}}))test('cleanup does not succeed after '+caseId,async()=>{const h=fixture(()=>{},mutate);await assert.rejects(h.run)})
test('cleanup etag conflict is not retried',async()=>{const h=fixture(()=>{},()=>{},412);await assert.rejects(h.run);assert.equal(h.calls.filter(c=>c.method==='PATCH').length,1)})
test('already clean settled service is a no-op',async()=>{const h=fixture(b=>{b.traffic=[activeRow];b.terminalCondition.state='CONDITION_SUCCEEDED'});assert.equal((await h.run()).changed,false);assert.equal(h.calls.filter(c=>c.method==='PATCH').length,0)})

 test('a failed service cannot borrow a healthy candidate for cleanup',async()=>{const h=fixture(()=>{},()=>{},200,'CONDITION_SUCCEEDED');await assert.rejects(h.run);assert.equal(h.calls.filter(c=>c.method==='PATCH').length,0)})
