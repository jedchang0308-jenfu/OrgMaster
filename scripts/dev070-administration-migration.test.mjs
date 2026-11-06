import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {buildOrgmasterPackage} from './dev010-n1c-orgmaster-package.mjs'
import {buildDev040MigrationBundle,assertDev040V3Profile,sourceSha256,unwrapMigrationTransaction} from './lib/dev040-orgmaster-independent-release.mjs'
import {assertDev059MigrationEntries} from './lib/dev059-fms-authority-migration.mjs'
import {DEV070_MIGRATION_ENTRIES,DEV070_MIGRATION_ENTRY_COUNT,DEV070_RELEASE_MODE,DEV070_ADMINISTRATION_REMEDIATION,assertDev070MigrationEntries,assertDev070AdministrationAppend,assertDev070AdministrationReleaseAuthority} from './lib/dev070-administration-migration.mjs'
import {parseDeployProductionArgs} from './dev040-deploy-production.mjs'
import {assertMigrationReceipt} from './lib/dev012-owner-stage-executor.mjs'
import {canonicalize,sha256} from './lib/dev012-production-migration-runner.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),read=path=>JSON.parse(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'))
const profile=read('config/release/dev040-orgmaster-independent-production-v3.json'),n1c=read('config/dev-010/n1c-orgmaster.json'),source='a'.repeat(40)
const files=new Map(profile.migrations.entries.map(entry=>[entry.path,readFileSync(new URL(`../${entry.path}`,import.meta.url))]))
const after=buildDev040MigrationBundle(profile,buildOrgmasterPackage(n1c,root),files,source).bundle
const before=count=>({...after,sourceRevision:'b'.repeat(40),manifestSha256:'c'.repeat(64),entries:after.entries.slice(0,count)})

test('DEV070 exact reviewed source packages only 042/044/045 after immutable 001–041 identity',()=>{
 assertDev040V3Profile(profile,n1c);assertDev070MigrationEntries(after.entries)
 assertDev059MigrationEntries(after.entries.slice(0,39))
 assert.equal(after.entries.length,42)
 assert.deepEqual(after.entries.slice(39).map(row=>row.path),DEV070_MIGRATION_ENTRIES.map(row=>row.path))
 assert.equal(after.entries.some(row=>row.path.includes('/043_')),false)
 for(const entry of DEV070_MIGRATION_ENTRIES){assert.equal(sourceSha256(files.get(entry.path)),entry.sourceSha256);assert.equal(sourceSha256(unwrapMigrationTransaction(files.get(entry.path))),entry.appliedSha256)}
})
test('DEV070 planner admits only previously known exact prefixes and source-controlled partial append readback',()=>{
 for(let count=31;count<42;count++)assert.equal(assertDev070AdministrationAppend(before(count),after).pendingMigrationCount,42-count)
 for(const count of[0,10,30,42,43])assert.throws(()=>assertDev070AdministrationAppend(before(count),after),/DEV070_MIGRATION_APPEND_INVALID/)
 for(const mutate of[
  bundle=>{bundle.entries[30].appliedSha256='0'.repeat(64)},bundle=>{bundle.entries[39].sourceSha256='0'.repeat(64)},
  bundle=>{bundle.entries[40].path='db/migrations/043_unrelated.sql'},bundle=>{bundle.entries.pop()},
  bundle=>{bundle.entries[41].name='unreviewed-sql'},bundle=>{bundle.database='jenfu_stg'},
 ]){const changed=structuredClone(after);mutate(changed);assert.throws(()=>assertDev070AdministrationAppend(before(39),changed))}
 const changed=before(39);changed.entries=structuredClone(changed.entries);changed.entries[10].sourceSha256='0'.repeat(64)
 assert.throws(()=>assertDev070AdministrationAppend(changed,after),/DEV070_MIGRATION_APPEND_INVALID/)
})
test('DEV070 authority binds only a separately applied direct tool basis without bootstrap or rotation execution authority',()=>{
 const intent={ownerApplicationId:'orgmaster',sourceRevision:source,releaseId:'DEV070-SOURCE-ONLY',baselineIntentRef:{uri:'gs://jenfu-platform-prod-orgmaster-release/intents/baseline.json',sha256:'b'.repeat(64)}}
 const common={...intent,devId:'DEV-070',slice:'070-ADMINISTRATION',remediation:DEV070_ADMINISTRATION_REMEDIATION}
 const readiness={...common,schemaVersion:'orgmaster.routine-release-readiness.v1'},authorization={...common,schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION'}
 assert.equal(assertDev070AdministrationReleaseAuthority(readiness,authorization,intent).releaseMode,DEV070_RELEASE_MODE)
 for(const key of['ownerApplicationId','sourceRevision','releaseId','baselineIntentRef','remediation','slice','devId'])assert.throws(()=>assertDev070AdministrationReleaseAuthority(readiness,{...authorization,[key]:'changed'},intent),/DEV070_ADMINISTRATION_AUTHORITY_INVALID/)
 for(const key of['toolRotationRef','appArtifactReuse'])assert.throws(()=>assertDev070AdministrationReleaseAuthority(readiness,{...authorization,[key]:{}},intent),/DEV070_ADMINISTRATION_AUTHORITY_INVALID/)
 const ref={uri:`gs://jenfu-platform-prod-orgmaster-release/receipts/tool-rotations/${source}/app-infra.json`,sha256:'c'.repeat(64)}
 assert.equal(assertDev070AdministrationReleaseAuthority({...readiness,toolRotationRef:ref},{...authorization,toolRotationRef:ref},{...intent,infraReceiptRef:ref}).releaseMode,DEV070_RELEASE_MODE)
 for(const changed of [{...ref,sha256:'d'.repeat(64)},{...ref,uri:ref.uri.replace('tool-rotations','other')},{}])assert.throws(()=>assertDev070AdministrationReleaseAuthority({...readiness,toolRotationRef:ref},{...authorization,toolRotationRef:changed},{...intent,infraReceiptRef:ref}),/DEV070_ADMINISTRATION_AUTHORITY_INVALID/)
 assert.throws(()=>assertDev070AdministrationReleaseAuthority({...readiness,toolRotationRef:ref},{...authorization,toolRotationRef:ref},{...intent,infraReceiptRef:{...ref,sha256:'d'.repeat(64)}}),/DEV070_ADMINISTRATION_AUTHORITY_INVALID/)
 assert.throws(()=>assertDev070AdministrationReleaseAuthority(readiness,authorization,{...intent,baselineIntentRef:null}),/DEV070_ADMINISTRATION_AUTHORITY_INVALID/)
})
test('DEV070 normal deploy CLI selects one exact append and rejects mixed operation/infra/credential inputs',()=>{
 for(const mode of['--check','--prepare-only'])assert.equal(parseDeployProductionArgs([mode,'--dev070-administration-append']).dev070AdministrationAppend,true)
 const rotation=`gs://jenfu-platform-prod-orgmaster-release/receipts/tool-rotations/${'c'.repeat(40)}/app-infra.json#sha256=${'d'.repeat(64)}`
 assert.equal(parseDeployProductionArgs(['--dev070-administration-append',`--tool-image-rotation-ref=${rotation}`]).toolRotationRef.uri,rotation.split('#')[0])
 for(const flag of['--dev070-administration-append','--dev058-role-policy-append','--dev059-fms-authority-append','--dev060-fms-catalog-activation-append','--dev014-activate','--dev057-writer-fence-remediation','--reuse-aborted-app-artifact',`--dev060-infra-ref=${rotation}`,'--migration-mode=arbitrary','--sql=SELECT-1'])assert.throws(()=>parseDeployProductionArgs(['--dev070-administration-append',flag]))
})
test('DEV070 stage receipt requires exact source manifest, count/progress and cross-database denials',()=>{
 const intent={sourceRevision:source,migrationManifestSha256:after.manifestSha256},owner={application:{id:'orgmaster'}}
 const core={schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:source,manifestSha256:after.manifestSha256,status:'PASS',boundaryStatus:'PASS',database:'jenfu_prod',ledger:'orgmaster_core.schema_migrations',baselineCount:10,minimumLedgerCount:10,ledgerCount:42,applied:3,replayed:39,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]}
 const check=(value,plan={releaseMode:DEV070_RELEASE_MODE,pendingMigrationCount:3})=>assertMigrationReceipt({...value,receiptSha256:sha256(canonicalize(value))},owner,intent,{allowForward:true,forwardPlan:plan})
 assert.doesNotThrow(()=>check(core));assert.doesNotThrow(()=>check({...core,applied:0,replayed:42}))
 for(const changed of[{ledgerCount:41},{applied:4,replayed:38},{sourceRevision:'0'.repeat(40)},{manifestSha256:'0'.repeat(64)},{database:'jenfu_stg'},{crossDatabaseDenials:[{database:'jenfu_dev',denied:true}]},{crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_dev',denied:true}]}])assert.throws(()=>check({...core,...changed}),/MIGRATION_RECEIPT_INVALID/)
 for(const pendingMigrationCount of[0,12,-1,1.5])assert.throws(()=>check(core,{releaseMode:DEV070_RELEASE_MODE,pendingMigrationCount}),/MIGRATION_RECEIPT_INVALID/)
})
