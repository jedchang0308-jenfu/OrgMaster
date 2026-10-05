import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canonicalize, sha256, releasePaths, buildRuntimeConfig } from './dev012-owner-release-runtime.mjs'
import { createMigrationBundle } from './dev012-production-migration-runner.mjs'
import { unwrapMigrationTransaction } from './dev040-orgmaster-independent-release.mjs'
import { readPublishedLifecycleOwner, assertLifecycleSchedulerReadback,
  transitionLifecycleScheduler, LIFECYCLE_SCHEDULER_NAME } from './dev014-lifecycle-activation-prerequisites.mjs'
import { readLifecycleActivationPrerequisites } from './dev014-lifecycle-activation-prerequisites.mjs'
import { assertDev014PrincipalLifecycleEnablement } from './dev014-principal-lifecycle-release.mjs'
import { assertPreparePrerequisites } from './dev012-owner-stage-executor.mjs'
import { parseDeployProductionArgs } from '../dev040-deploy-production.mjs'
import { parseLifecycleSchedulerArgs, runLifecycleSchedulerOperation } from '../dev014-lifecycle-scheduler.mjs'

const proof = {repository:'jedchang0308-jenfu/OrgMaster',branch:'master',sourceRevision:'a'.repeat(40),
  sourceTree:'e'.repeat(40),status:'OFFICIAL_MERGED_PR_VERIFIED',branchProtected:true,rulesetId:24077876,
  reviewMode:'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED',requiredChecks:['Production Source QC']}
const scheduler = {name:LIFECYCLE_SCHEDULER_NAME,state:'PAUSED',
  description:'DEV-014 managed identity lifecycle worker trigger',schedule:'* * * * *',timeZone:'Asia/Taipei',attemptDeadline:'60s',
  httpTarget:{httpMethod:'POST',uri:'https://orgmaster-prod-9536592944.asia-east1.run.app/api/internal/managed-identity-lifecycle/v2',
    oidcToken:{serviceAccountEmail:'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
      audience:'https://orgmaster-prod-9536592944.asia-east1.run.app'}},retryConfig:{retryCount:0,maxRetryDuration:'0s'}}
const platformEntry=JSON.parse(fs.readFileSync(new URL('./dev014-platform-011-consumer-entry.fixture.json',import.meta.url)))
const orgSql=fs.readFileSync(fileURLToPath(new URL('../../db/migrations/031_dev014_principal_lifecycle_v2.sql',import.meta.url)))
const orgBody=Buffer.from(unwrapMigrationTransaction(orgSql.toString('utf8')))

function harness({enabled=true}={}) {
  const objects=new Map(), services=new Map(), revisions=new Map(),calls=[], owners={}
  let job=structuredClone(scheduler), serviceReads=0
  const put=(uri,value)=>{const bytes=Buffer.from(canonicalize(value)+'\n');const row={value,bytes,ref:{uri,sha256:sha256(bytes)},metadata:{generation:'1'}};objects.set(uri,row);return row}
  const seal=(value,field='receiptSha256')=>({...value,[field]:sha256(canonicalize(value))})
  for(const owner of ['orgmaster','platform']) {
    const count=owner==='orgmaster'?31:11,base=owner==='orgmaster'?10:5
    const service=owner==='orgmaster'?'orgmaster-prod':'jenfu-platform-prod'
    const bucket=`jenfu-platform-prod-${owner}-release`, source=owner==='orgmaster'?proof.sourceRevision:'b'.repeat(40)
    const profile={application:{id:owner},artifact:{releaseBucket:bucket}}
    const last=owner==='platform'?platformEntry:{order:31,version:'dev014-orgmaster-031',name:'principal-lifecycle-v2',
      path:'db/migrations/031_dev014_principal_lifecycle_v2.sql',sourceSha256:sha256(orgSql),appliedSha256:sha256(orgBody),sqlBase64:orgBody.toString('base64')}
    const entries=Array.from({length:count},(_,i)=>i===count-1?last:{order:i+1,version:`fixture-${owner}-${i+1}`,name:'fixture',path:`db/migrations/${String(i+1).padStart(3,'0')}_fixture.sql`,
      sourceSha256:sha256('SELECT 1;\n'),appliedSha256:sha256('SELECT 1;\n'),sqlBase64:Buffer.from('SELECT 1;\n').toString('base64')})
    const bundle=createMigrationBundle({target:{ownerApplicationId:owner,ledger:`${owner}_core.schema_migrations`,baselineCount:base},sourceRevision:source,entries})
    const bundleRecord=put(`gs://${bucket}/source/migration-bundles/${source}/bundle.json`,bundle.bundle)
    const plainEnvironment=owner==='orgmaster'?{ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED:String(enabled)}:{NODE_ENV:'production'}
    const runtimeServiceAccount=`${owner}-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com`
    const template={serviceAccount:runtimeServiceAccount,containers:[{name:owner,env:Object.entries(plainEnvironment).map(([name,value])=>({name,value}))}]}
    const runtime=put(`gs://${bucket}/receipts/runtime/${source}.json`,{runtimeConfig:{plainEnvironment,secretVersions:{},runtimeServiceAccount,template,serviceTemplateSha256:sha256(canonicalize(template))}})
    const intent={schemaVersion:`jenfu.${owner==='orgmaster'?'dev040.orgmaster':'dev011.platform'}-release-intent.v2`,ownerApplicationId:owner,
      sourceRevision:source,releaseId:`LIFECYCLE-${owner.toUpperCase()}-000001`,sourceLockRef:{uri:`gs://${bucket}/receipts/source.json`,sha256:'d'.repeat(64)},
      runtimeConfigRef:runtime.ref,migrationManifestSha256:bundle.bundle.manifestSha256}
    const intentRecord=put(`gs://${bucket}/receipts/releases/${intent.releaseId}/release-intent.json`,intent)
    const paths=releasePaths(profile,intent,intentRecord.ref.sha256)
    const image=`asia-east1-docker.pkg.dev/jenfu-platform-prod/${owner}-release/${owner}@sha256:${'c'.repeat(64)}`
    const revision=`${service}-fixture000001`
    const migrate=put(paths.migrate,seal({schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:owner,
      sourceRevision:source,database:'jenfu_prod',ledger:`${owner}_core.schema_migrations`,manifestSha256:bundle.bundle.manifestSha256,
      baselineCount:base,minimumLedgerCount:base,ledgerCount:count,applied:1,replayed:count-1,
      ...(owner==='platform'?{ledgerBootstrap:{enabled:false,created:false}}:{}),status:'PASS',boundaryStatus:'PASS',
      crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]}))
    const deployment=put(paths.deployment,{schemaVersion:`jenfu.${owner==='orgmaster'?'dev040.orgmaster':'dev011.platform'}-deployment-capsule.v2`,
      releaseIntentRef:intentRecord.ref,sourceRevision:source,artifactDigest:image,migrationBundleRef:bundleRecord.ref})
    const stage=(stage,facts)=>seal({schemaVersion:'jenfu.dev012.stage-receipt.v1',stage,status:'PASS',ownerApplicationId:owner,sourceRevision:source,releaseId:intent.releaseId,facts})
    put(paths.candidate,stage('candidate',{candidateRevision:revision,artifactDigest:image,deploymentCapsuleRef:deployment.ref,migrationReceiptRef:migrate.ref}))
    const terminalFacts={result:'RELEASED',remainingHumanAction:0,candidateRevision:revision,artifactDigest:image}
    if(owner==='platform') {
      const entryDenial={id:'dev014-principal-lifecycle-v2-unauthenticated',status:401,code:'lifecycle_caller_invalid'}
      const canonical=put(paths.canonical,stage('canonical',{artifactDigest:image,smoke:{status:'PASS',observations:[entryDenial]}}))
      terminalFacts.dev014PrincipalLifecycleConformanceRef=put(`${paths.root.startsWith('gs:')?'':`gs://${bucket}/`}${paths.root}/dev014-principal-lifecycle-conformance.json`,seal({
        schemaVersion:'platform.principal-lifecycle-consumer-conformance.v1',appId:'platform',sourceRevision:source,releaseId:intent.releaseId,artifactDigest:image,
        producerContract:'orgmaster.principal-lifecycle.v2',receiptContract:'platform.principal-lifecycle-receipt.v2',endpoint:'/api/internal/principal-lifecycle/v2',method:'POST',
        migrationReceiptRef:migrate.ref,canonicalReceiptRef:canonical.ref,entryDenial,verificationScope:'PRODUCTION_ROUTE_PRESENCE_AND_CALLER_DENIAL',status:'PASS'})).ref
    }
    put(paths.terminal,stage('terminal',terminalFacts))
    const control=put(paths.control,seal({schemaVersion:'jenfu.dev012.owner-control-head.v1',ownerApplicationId:owner,service,controlBucket:bucket,
      state:'FINALIZED',result:'RELEASED',sourceRevision:source,releaseId:intent.releaseId,candidateRevision:revision,sourceLockSha256:intent.sourceLockRef.sha256},'controlSha256'))
    const name=`projects/jenfu-platform-prod/locations/asia-east1/services/${service}`
    const value={name,uid:owner==='orgmaster'?'90eaf86d-c93a-4d03-9a34-fdd2d223f59e':'05ae786d-c93a-4d03-9a34-fdd2d223f59e',etag:'stable',generation:'8',observedGeneration:'8',
      terminalCondition:{state:'CONDITION_SUCCEEDED'},scaling:{scalingMode:'AUTOMATIC'},traffic:[{revision,percent:100}],trafficStatuses:[{revision,percent:100}]}
    services.set(service,value)
    revisions.set(revision,{name:`${name}/revisions/${revision}`,serviceAccount:runtimeServiceAccount,conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}],
      containers:[{name:owner,image,env:Object.entries(runtime.value.runtimeConfig.plainEnvironment).map(([name,value])=>({name,value}))}]})
    owners[owner]={intent,intentRecord,paths,control,migrate,bundleRecord,deployment,profile,stage,service,revision,runtime}
  }
  const transport={
    now:()=> '2026-10-06T01:00:00.000Z',
    async putJson(uri,value,options) {assert.equal(options.ifGenerationMatch,'0');return put(uri,value)},
    async readBytes(uri){if(!objects.has(uri))throw new Error('MISSING');return objects.get(uri)},
    async readJson(ref){const r=await this.readBytes(ref.uri);assert.equal(r.ref.sha256,ref.sha256);return r},
    async getService(p){serviceReads++;return structuredClone(services.get(p.target.serviceName))},
    async getRevision(_p,rev){return structuredClone(revisions.get(rev))},
    async request(uri,options={}) {calls.push([uri,options.method??'GET']);
      assert.ok(uri.startsWith(`https://cloudscheduler.googleapis.com/v1/${LIFECYCLE_SCHEDULER_NAME}`))
      if(options.method==='POST') {assert.ok([':pause',':resume'].some(s=>uri.endsWith(s)));assert.equal(options.body,'{}');job.state=uri.endsWith(':pause')?'PAUSED':'ENABLED'}
      return structuredClone(job)},
  }
  return{transport,objects,put,seal,owners,services,revisions,calls,getJob:()=>job,getServiceReads:()=>serviceReads}
}

test('operator joins published 031/011 owners, native ledger seals and actual ready revisions',async()=>{
  const h=harness({enabled:false})
  for(const owner of ['orgmaster','platform']) {const r=await readPublishedLifecycleOwner({owner,transport:h.transport});assert.equal(r.nativeMigrationRef.sha256,h.owners[owner].migrate.ref.sha256);assert.equal(r.owner,owner)}
  await assert.rejects(readPublishedLifecycleOwner({owner:'ai-pdm',transport:h.transport}),/OWNER_INVALID/)
})

test('native readback rejects stale ledger, repeated denial database, altered migration, runtime switch and serving artifact',async()=>{
  for(const kind of ['ledger','denials','migration','flag','image','generation','control']) {
    const h=harness(),o=h.owners.orgmaster
    if(kind==='ledger'||kind==='denials') {const core={...o.migrate.value};delete core.receiptSha256
      if(kind==='ledger')core.ledgerCount=30;else core.crossDatabaseDenials=[{database:'jenfu_dev',denied:true},{database:'jenfu_dev',denied:true}]
      const row=h.put(o.paths.migrate,h.seal(core));const c=h.objects.get(o.paths.candidate).value;const cv={...c,facts:{...c.facts,migrationReceiptRef:row.ref}};delete cv.receiptSha256;h.put(o.paths.candidate,h.seal(cv))}
    if(kind==='migration') {const v={...o.bundleRecord.value,entries:o.bundleRecord.value.entries.slice(0,-1)};delete v.manifestSha256;v.manifestSha256=sha256(canonicalize(v));h.put(o.bundleRecord.ref.uri,v)}
    if(kind==='flag')h.revisions.get(o.revision).containers[0].env[0].value='false'
    if(kind==='image')h.revisions.get(o.revision).containers[0].image='wrong'
    if(kind==='generation')h.services.get(o.service).observedGeneration='7'
    if(kind==='control')h.owners.orgmaster.control.value.controlSha256='0'.repeat(64)
    await assert.rejects(readPublishedLifecycleOwner({owner:'orgmaster',transport:h.transport,lifecycleEnabled:true}))
  }
})

test('unchanged migration joins a checksum-identical published native predecessor and rejects cycles or a missing native join',async()=>{
  const h=harness(),o=h.owners.orgmaster
  const nextIntent={...o.intent,releaseId:'LIFECYCLE-ORGMASTER-000002',sourceRevision:'f'.repeat(40),baselineIntentRef:o.intentRecord.ref}
  const bundle={...o.bundleRecord.value,sourceRevision:nextIntent.sourceRevision};delete bundle.manifestSha256;bundle.manifestSha256=sha256(canonicalize(bundle))
  nextIntent.migrationManifestSha256=bundle.manifestSha256
  const br=h.put(o.bundleRecord.ref.uri.replace(o.intent.sourceRevision,nextIntent.sourceRevision),bundle)
  const ir=h.put(`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/${nextIntent.releaseId}/release-intent.json`,nextIntent)
  const p=releasePaths(o.profile,nextIntent,ir.ref.sha256)
  const st=(name,facts)=>h.seal({schemaVersion:'jenfu.dev012.stage-receipt.v1',stage:name,status:'PASS',ownerApplicationId:'orgmaster',sourceRevision:nextIntent.sourceRevision,releaseId:nextIntent.releaseId,facts})
  const mr=h.put(p.migrate,st('migrate',{disposition:'UNCHANGED_VERIFIED',manifestSha256:bundle.manifestSha256,migrationsExecuted:0,baselineIntentRef:o.intentRecord.ref,baselineMigrationRef:o.migrate.ref}))
  const dr=h.put(p.deployment,{...o.deployment.value,releaseIntentRef:ir.ref,sourceRevision:nextIntent.sourceRevision,migrationBundleRef:br.ref})
  h.put(p.candidate,st('candidate',{...h.objects.get(o.paths.candidate).value.facts,deploymentCapsuleRef:dr.ref,migrationReceiptRef:mr.ref}))
  h.put(p.terminal,st('terminal',h.objects.get(o.paths.terminal).value.facts))
  h.put(p.control,h.seal({...o.control.value,releaseId:nextIntent.releaseId,sourceRevision:nextIntent.sourceRevision,controlSha256:undefined},'controlSha256'))
  // Do not include an undefined field in the signed core.
  const current=h.objects.get(p.control).value;const core={...current};delete core.controlSha256;h.put(p.control,h.seal(core,'controlSha256'))
  const r=await readPublishedLifecycleOwner({owner:'orgmaster',transport:h.transport,lifecycleEnabled:true})
  assert.deepEqual(r.nativeMigrationRef,o.migrate.ref)
  const m={...mr.value,facts:{...mr.value.facts,baselineMigrationRef:{...o.migrate.ref,sha256:'0'.repeat(64)}}};delete m.receiptSha256
  const changed=h.put(p.migrate,h.seal(m));const c={...h.objects.get(p.candidate).value,facts:{...h.objects.get(p.candidate).value.facts,migrationReceiptRef:changed.ref}};delete c.receiptSha256;h.put(p.candidate,h.seal(c))
  await assert.rejects(readPublishedLifecycleOwner({owner:'orgmaster',transport:h.transport,lifecycleEnabled:true}),/MIGRATION_CHAIN_INVALID/)
})

test('Scheduler readback admits only the bodyless v2 own job and exact workload OIDC configuration',()=>{
  assert.equal(assertLifecycleSchedulerReadback(scheduler).name,LIFECYCLE_SCHEDULER_NAME)
  for(const changed of [{name:scheduler.name.replace('orgmaster','platform')},{schedule:'*/5 * * * *'},
    {httpTarget:{...scheduler.httpTarget,body:'e30='}}, {retryConfig:{retryCount:1}},
    {httpTarget:{...scheduler.httpTarget,oidcToken:{...scheduler.httpTarget.oidcToken,audience:'https://wrong'}}}]) {
    assert.throws(()=>assertLifecycleSchedulerReadback({...scheduler,...changed}),/SCHEDULER_READBACK_INVALID/)
  }
})

test('pause/check are exact-job scoped; unverified source cannot start provider reads',async()=>{
  const h=harness()
  assert.deepEqual(parseLifecycleSchedulerArgs(['--pause','--check']),{action:'pause',check:true})
  for(const args of [[],['--pause','--resume'],['--resume','--project=other']])assert.throws(()=>parseLifecycleSchedulerArgs(args))
  await assert.rejects(transitionLifecycleScheduler({action:'pause',sourceProof:{...proof,branchProtected:false},transport:h.transport}),/OFFICIAL_SOURCE_REQUIRED/)
  assert.equal(h.calls.length,0)
  assert.equal((await transitionLifecycleScheduler({action:'pause',check:true,sourceProof:proof,transport:h.transport})).status,'CHECKED_NOT_MUTATED')
  assert.equal(h.calls.some(c=>c[1]==='POST'),false)
  assert.equal(h.getServiceReads(),0)
})

test('resume requires both actual ledger chains and an active true flag; duplicate resume is idempotent',async()=>{
  const h=harness()
  const input={action:'resume',sourceProof:proof,transport:h.transport}
  const r=await transitionLifecycleScheduler(input)
  assert.equal(r.status,'ENABLED_PROVIDER_READ_BACK');assert.equal(r.nativeMigrationRefs.length,2)
  assert.equal(h.calls.filter(c=>c[1]==='POST').length,1)
  assert.equal((await transitionLifecycleScheduler(input)).changed,false)
  assert.equal(h.calls.filter(c=>c[1]==='POST').length,1)
  const off=harness({enabled:false})
  await assert.rejects(transitionLifecycleScheduler({...input,transport:off.transport}),/RUNTIME_SWITCH_INVALID/)
  assert.equal(off.calls.some(c=>c[1]==='POST'),false)
})

test('post-resume owner drift or malformed readback pauses the exact job before reporting failure',async()=>{
  for(const kind of ['owner','scheduler']) {
    const h=harness(),base=h.transport.request
    h.transport.request=async(uri,options={})=>{const r=await base(uri,options)
      if(uri.endsWith(':resume')) {if(kind==='owner')h.services.get('jenfu-platform-prod').etag='changed';else h.getJob().schedule='*/5 * * * *'}
      return r}
    await assert.rejects(runLifecycleSchedulerOperation({action:'resume',sourceProof:proof,transport:h.transport}),error=>{
      assert.equal(error.transitionResult.status,'RECOVERED_PAUSED')
      assert.equal(error.transitionResult.receiptPublished,true)
      assert.ok(error.transitionResult.receiptRef.uri.includes('/DEV014-LIFECYCLE-SCHEDULER/'))
      return true
    })
    assert.equal(h.getJob().state,'PAUSED')
    assert.ok(h.calls.some(c=>c[0].endsWith(':pause')&&c[1]==='POST'))
  }
})

test('resume timeout after provider mutation is contained and recorded; pause failure keeps unknown outcome explicit',async()=>{
  for (const pauseFails of [false,true]) {
    const h=harness(),request=h.transport.request
    h.transport.request=async(uri,options={})=>{
      if (uri.endsWith(':pause') && pauseFails) throw new Error('secret-bearing upstream error must not enter receipt')
      const value=await request(uri,options)
      if(uri.endsWith(':resume'))throw new Error('timeout bearer-token must not enter receipt')
      return value
    }
    await assert.rejects(runLifecycleSchedulerOperation({action:'resume',sourceProof:proof,transport:h.transport}),error=>{
      const value=error.transitionResult
      assert.equal(value.status,pauseFails?'MANUAL_READBACK_REQUIRED':'RECOVERED_PAUSED')
      assert.equal(value.receiptPublished,true)
      assert.equal(value.recoveryReadback.state,pauseFails?'ENABLED':'PAUSED')
      assert.equal(JSON.stringify(value).includes('bearer-token'),false)
      const receipt=h.objects.get(value.receiptRef.uri).value
      const {receiptSha256,...core}=receipt
      assert.equal(receiptSha256,sha256(canonicalize(core)))
      return true
    })
  }
})

test('receipt upload failure pauses a newly enabled job; failed recovery upload never claims durable evidence',async()=>{
  for(const uploadsAlwaysFail of [false,true]) {
    const h=harness(),put=h.transport.putJson
    let attempts=0
    h.transport.putJson=async(...args)=>{attempts++;if(attempts===1||uploadsAlwaysFail)throw new Error('UPLOAD_FAILED');return put(...args)}
    await assert.rejects(runLifecycleSchedulerOperation({action:'resume',sourceProof:proof,transport:h.transport}),error=>{
      assert.equal(error.transitionResult.status,'RECOVERED_PAUSED')
      assert.equal(error.transitionResult.receiptPublished,!uploadsAlwaysFail)
      assert.equal(Boolean(error.transitionResult.receiptRef),!uploadsAlwaysFail)
      return true
    })
    assert.equal(h.getJob().state,'PAUSED')
    assert.equal(attempts,2)
  }
})

test('enablement reads both published owners and a stable paused trigger without mutating provider state',async()=>{
  const h=harness({enabled:false})
  const value=await readLifecycleActivationPrerequisites({sourceProof:proof,transport:h.transport})
  assert.equal(value.status,'PROVIDER_PREREQUISITES_READ_BACK')
  assert.equal(value.scheduler.state,'PAUSED')
  assert.deepEqual(value.owners.map(row=>row.ledgerCount),[31,11])
  assert.equal(h.calls.some(row=>row[1]==='POST'),false)
  h.getJob().state='ENABLED'
  await assert.rejects(readLifecycleActivationPrerequisites({sourceProof:proof,transport:h.transport}),/SCHEDULER_NOT_PAUSED/)
})

test('owner prepare admits only attested false-to-true enablement, unchanged secrets and exact active baseline',async()=>{
  const h=harness({enabled:false}),enablement=await readLifecycleActivationPrerequisites({sourceProof:proof,transport:h.transport})
  const profile=JSON.parse(fs.readFileSync(new URL('../../config/release/dev040-orgmaster-independent-production-v3.json',import.meta.url)))
  const plainEnvironment=Object.fromEntries(profile.environment.requiredPlainEnvironmentNames.map(name=>
    [name,profile.environment.fixedValues?.[name]??profile.environment.controlledValues?.[name]?.defaultValue??'fixture-value']))
  const secretVersions=Object.fromEntries(profile.environment.requiredSecretNames.map(name=>[name,'1']))
  const before=buildRuntimeConfig(profile,{plainEnvironment,secretVersions})
  const after=buildRuntimeConfig(profile,{plainEnvironment:{...plainEnvironment,ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED:'true'},secretVersions})
  const baselineIntentRef=h.owners.orgmaster.intentRecord.ref
  const common={ownerApplicationId:'orgmaster',projectId:'jenfu-platform-prod',sourceRevision:proof.sourceRevision,
    releaseId:'DEV014-LIFECYCLE-ENABLE-0001',environment:'production',baselineIntentRef,expiresAt:'2999-01-01T00:00:00Z',
    status:'PASS',releaseAuthority:true,evidenceScope:'PRODUCTION_BOUND',remainingHumanAction:0,
    devId:'DEV-014',slice:'014-PRINCIPAL-LIFECYCLE-ENABLE',enablement}
  const readiness={...common,schemaVersion:'orgmaster.routine-release-readiness.v1'}
  const authorization={...common,schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION'}
  const intent={...common,previousRevision:h.owners.orgmaster.revision}
  const input={profile,intent,readiness,authorization,before,after}
  assert.equal(assertDev014PrincipalLifecycleEnablement(input).releaseMode,'DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT')
  const prepared=assertPreparePrerequisites({profile,intent,values:{readiness,authorization,
    sourceLock:{...common,status:'SOURCE_FROZEN',clean:true},runtimeConfig:{...common,status:'VERIFIED',runtimeConfig:after},
    foundation:{...common,status:'APPLIED'},infra:{...common,status:'APPLIED',migrationRunnerDigest:`${profile.artifact.migrationRunnerUri}@sha256:${'f'.repeat(64)}`}}})
  assert.equal(prepared.controlledEnvironmentAuthority.releaseMode,'DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT')
  for(const kind of ['baseline','secret','flag','source','scheduler']) {
    const x={...input,intent:structuredClone(intent),after:structuredClone(after),readiness:structuredClone(readiness),authorization:structuredClone(authorization)}
    if(kind==='baseline')x.intent.previousRevision='orgmaster-prod-different'
    if(kind==='secret')x.after.secretVersions[Object.keys(secretVersions)[0]]='2'
    if(kind==='flag')x.after.plainEnvironment.ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED='false'
    if(kind==='source')x.readiness.enablement.sourceProof.branchProtected=false
    if(kind==='scheduler')x.readiness.enablement.scheduler.config.schedule='*/5 * * * *'
    assert.throws(()=>assertDev014PrincipalLifecycleEnablement(x))
  }
  assert.equal(parseDeployProductionArgs(['--dev014-principal-lifecycle-enable','--check']).dev014PrincipalLifecycleEnable,true)
  for(const args of [['--dev014-principal-lifecycle-enable','--dev014-principal-lifecycle-v2-remediation'],
    ['--dev014-principal-lifecycle-enable','--dev014-infra-ref=gs://bucket/x#sha256='+ 'a'.repeat(64)]])
    assert.throws(()=>parseDeployProductionArgs(args))
})

test('native 011 plus a generic admission receipt cannot replace deployed lifecycle capability proof; extra runtime env is rejected',async()=>{
  const h=harness({enabled:false}),o=h.owners.platform
  const terminal={...h.objects.get(o.paths.terminal).value};delete terminal.receiptSha256
  terminal.facts={...terminal.facts};delete terminal.facts.dev014PrincipalLifecycleConformanceRef
  h.put(o.paths.terminal,h.seal(terminal))
  await assert.rejects(readLifecycleActivationPrerequisites({sourceProof:proof,transport:h.transport}))
  const extra=harness({enabled:false})
  extra.revisions.get(extra.owners.orgmaster.revision).containers[0].env.push({name:'UNREVIEWED_AUTH_FALLBACK',value:'true'})
  await assert.rejects(readLifecycleActivationPrerequisites({sourceProof:proof,transport:extra.transport}),/REVISION_READBACK_INVALID/)
})
