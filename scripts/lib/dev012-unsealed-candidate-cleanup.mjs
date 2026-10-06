import {canonicalize} from './dev012-owner-release-runtime.mjs'
function fail(){throw Object.assign(new Error('UNSEALED_CANDIDATE_CLEANUP_INVALID'),{code:'UNSEALED_CANDIDATE_CLEANUP_INVALID'})}
/** Cleanup only an exact deterministic zero-traffic unsealed candidate. A
 * missing status projection must not hide a configured failed candidate. */
export async function cleanupUnsealedCandidateTag({transport,profile,tag,candidateRevision,allowedActiveRevisions,deadlineAt}) {
  if(!Number.isFinite(Date.parse(deadlineAt))||Date.now()>=Date.parse(deadlineAt)
    ||!Array.isArray(allowedActiveRevisions)||!allowedActiveRevisions.length
    ||allowedActiveRevisions.includes(candidateRevision)
    ||!/^candidate-[a-f0-9]{12}$/u.test(tag??'') || candidateRevision!==profile.target.serviceName+'-'+tag.slice(10))fail()
  const before=await transport.getService(profile)
  if(before.name!=='projects/'+profile.target.projectId+'/locations/'+profile.target.region+'/services/'+profile.target.serviceName
    ||!before.etag||before.reconciling===true||before.generation==null||String(before.generation)!==String(before.observedGeneration)
    ||!['CONDITION_SUCCEEDED','CONDITION_FAILED'].includes(before.terminalCondition?.state)
    ||!Array.isArray(before.traffic)||!Array.isArray(before.trafficStatuses))fail()
  const active=transport.effectiveRevision(before)
  if(!allowedActiveRevisions.includes(active))fail()
  const configured=before.traffic.filter(row=>row.tag), observed=before.trafficStatuses.filter(row=>row.tag)
  const matches=row=>row.tag===tag && row.revision===candidateRevision && Number(row.percent??0)===0 && row.latestRevision!==true
  if(!configured.length){
    if(observed.length)fail()
    transport.assertServiceSettled(before,'UNSEALED_CANDIDATE_CLEANUP_INVALID')
    return {changed:false,service:before}
  }
  if(configured.length!==1||!matches(configured[0])||observed.length>1||observed.some(row=>!matches(row))
    ||before.traffic.length!==2||before.trafficStatuses.length!==1+observed.length)fail()
  if(before.terminalCondition.state==='CONDITION_FAILED'){
    const candidate=await transport.getRevision(profile,candidateRevision)
    if(candidate.conditions?.find(row=>row.type==='Ready')?.state!=='CONDITION_FAILED')fail()
  }
  const traffic=before.traffic.filter(row=>!row.tag)
  const patch=await transport.patchService(profile,{name:before.name,etag:before.etag,traffic},'traffic',deadlineAt)
  const after=await transport.getService(profile)
  transport.assertServiceSettled(after,'UNSEALED_CANDIDATE_CLEANUP_INVALID')
  if(after.traffic?.some(row=>row.tag)||after.trafficStatuses?.some(row=>row.tag)
    ||canonicalize(after.traffic)!==canonicalize(traffic)||transport.effectiveRevision(after)!==active)fail()
  return {changed:true,service:after,providerOperationRef:patch.operationRef}
}
