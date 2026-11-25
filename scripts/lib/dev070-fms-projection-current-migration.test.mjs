import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {buildFmsProjectionCurrentForward,FMS_PROJECTION_CURRENT,FMS_PROJECTION_CURRENT_RELEASE_MODE,FMS_PROJECTION_CURRENT_REMEDIATION,assertFmsProjectionCurrentAppend,assertFmsProjectionCurrentReleaseAuthority,assertFmsProjectionCurrentEntries} from './dev070-fms-projection-current-migration.mjs'
import {assertDev057UsersMigrationEntries} from './dev057-projed-users-migration.mjs'
import {buildOrgmasterPackage} from '../dev010-n1c-orgmaster-package.mjs'
import {buildDev040MigrationBundle} from './dev040-orgmaster-independent-release.mjs'
import {canonicalize,sha256,createMigrationBundle,planMigration} from './dev012-production-migration-runner.mjs'
import {parseDeployProductionArgs} from '../dev040-deploy-production.mjs'
import {parseOrgmasterRunnerArgs,FMS_PROJECTION_CURRENT_TARGET} from '../dev040-production-migration-runner.mjs'
import {assertMigrationReceipt} from './dev012-owner-stage-executor.mjs'
const profile=JSON.parse(readFileSync('config/release/dev040-orgmaster-independent-production-v3.json','utf8'))
const bytes=readFileSync(FMS_PROJECTION_CURRENT.path)
test('073 is an independently pinned owner forward after the reviewed DEV057 generation',()=>{
 const input={predecessorEntries:profile.migrations.entries.slice(0,70),sourceRevision:'a'.repeat(40),sqlBytes:bytes}
 const bundle=buildFmsProjectionCurrentForward(input)
 assert.equal(bundle.entry.version,'dev070-orgmaster-073');assert.equal(bundle.predecessorVersion,'dev057-orgmaster-074')
 assert.equal(bundle.ledger,'orgmaster_core.schema_migrations');assert.equal(bundle.entry.owner,'orgmaster')
 assert.equal(profile.migrations.entries.length,71)
 for(const delta of [{sourceRevision:'bad'},{sqlBytes:Buffer.concat([bytes,Buffer.from(' ')] )},{predecessorEntries:profile.migrations.entries.slice(0,70).slice(0,67)}])assert.throws(()=>buildFmsProjectionCurrentForward({...input,...delta}))
 const changed=structuredClone(profile.migrations.entries);changed[67].appliedSha256='0'.repeat(64)
 assert.throws(()=>buildFmsProjectionCurrentForward({...input,predecessorEntries:changed}))
})

test('normal current owner bundle contains 073 and only its distinct 70-to-71 recipe can append it',()=>{
 const n1c=JSON.parse(readFileSync('config/dev-010/n1c-orgmaster.json','utf8')),files=new Map(profile.migrations.entries.map(row=>[row.path,readFileSync(row.path)])),source='a'.repeat(40)
 const after=buildDev040MigrationBundle(profile,buildOrgmasterPackage(n1c),files,source,{releaseMode:FMS_PROJECTION_CURRENT_RELEASE_MODE}).bundle
 const before=createMigrationBundle({target:{ownerApplicationId:'orgmaster',ledger:profile.migrations.ledger,baselineCount:10},sourceRevision:source,entries:after.entries.slice(0,70)}).bundle
 assertFmsProjectionCurrentEntries(after.entries);assertDev057UsersMigrationEntries(before.entries)
 assert.throws(()=>assertDev057UsersMigrationEntries(after.entries))
 assert.equal(assertFmsProjectionCurrentAppend(before,after).pendingMigrationCount,1)
 assert.deepEqual(planMigration(after,before.entries.map(row=>({version:row.version,name:row.name,checksum_sha256:row.appliedSha256}))).map(row=>row.version),['dev070-orgmaster-073'])
 for(const delta of [{entries:before.entries.slice(0,69)},{entries:after.entries},{ledger:'other.schema_migrations'}])assert.throws(()=>assertFmsProjectionCurrentAppend({...before,...delta},after))
 const changed=structuredClone(after);changed.entries[70].appliedSha256='0'.repeat(64);assert.throws(()=>assertFmsProjectionCurrentEntries(changed.entries))
 assert.deepEqual(FMS_PROJECTION_CURRENT_TARGET.allowedExistingLedgerCounts,[70,71]);assert.equal(FMS_PROJECTION_CURRENT_TARGET.entryCount,71)
 const args=['--bundle-ref','gs://jenfu-platform-prod-orgmaster-release/source/migration-bundles/source.json','--bundle-sha256','b'.repeat(64),'--source-revision',source,'--output-ref','gs://jenfu-platform-prod-orgmaster-release/receipts/test.json','--migration-mode',FMS_PROJECTION_CURRENT_RELEASE_MODE]
 assert.equal(parseOrgmasterRunnerArgs(args).migrationMode,FMS_PROJECTION_CURRENT_RELEASE_MODE)
 const intent={ownerApplicationId:'orgmaster',sourceRevision:source,releaseId:'FMS-PROJECTION-073',migrationManifestSha256:after.manifestSha256,baselineIntentRef:{uri:'gs://fixture/baseline',sha256:'b'.repeat(64)}}
 const core={schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:source,manifestSha256:after.manifestSha256,status:'PASS',boundaryStatus:'PASS',applied:1,replayed:70,ledgerCount:71,baselineCount:10,minimumLedgerCount:10,database:'jenfu_prod',ledger:'orgmaster_core.schema_migrations',crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]}
 const seal=value=>({...value,receiptSha256:sha256(canonicalize(value))}),options={allowForward:true,forwardPlan:{releaseMode:FMS_PROJECTION_CURRENT_RELEASE_MODE,pendingMigrationCount:1}}
 assert.doesNotThrow(()=>assertMigrationReceipt(seal(core),profile,intent,options))
 for(const delta of [{ledgerCount:70},{applied:2,replayed:69},{crossDatabaseDenials:[]},{database:'jenfu_dev'}])assert.throws(()=>assertMigrationReceipt(seal({...core,...delta}),profile,intent,options))
})

test('normal CLI and authority keep the new recipe exclusive without extending historical USERS authority',()=>{
 assert.equal(parseDeployProductionArgs(['--check','--dev070-fms-projection-current-append']).dev070FmsProjectionCurrentAppend,true)
 for(const extra of ['--dev070-administration-append','--dev057-projed-users-append','--dev059-fms-authority-append'])assert.throws(()=>parseDeployProductionArgs(['--check','--dev070-fms-projection-current-append',extra]))
 const intent={ownerApplicationId:'orgmaster',sourceRevision:'a'.repeat(40),releaseId:'FMS-PROJECTION-073',baselineIntentRef:{uri:'gs://fixture/baseline',sha256:'b'.repeat(64)}}
 const common={...intent,devId:'DEV-070',slice:'070-FMS-PROJECTION-CURRENT',remediation:FMS_PROJECTION_CURRENT_REMEDIATION}
 const ready={...common,schemaVersion:'orgmaster.routine-release-readiness.v1'},auth={...common,schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION'}
 assert.equal(assertFmsProjectionCurrentReleaseAuthority(ready,auth,intent).releaseMode,FMS_PROJECTION_CURRENT_RELEASE_MODE)
 for(const delta of [{slice:'057-PROJED-USERS'},{remediation:{}},{sourceRevision:'c'.repeat(40)},{schemaPredecessorRef:intent.baselineIntentRef},{toolRotationRef:{uri:'foreign',sha256:'d'.repeat(64)}}])assert.throws(()=>assertFmsProjectionCurrentReleaseAuthority(ready,{...auth,...delta},intent))
})
