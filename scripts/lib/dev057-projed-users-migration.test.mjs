import {canonicalize,sha256} from './dev012-production-migration-runner.mjs'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {buildOrgmasterPackage} from '../dev010-n1c-orgmaster-package.mjs'
import {buildDev040MigrationBundle,sourceSha256,unwrapMigrationTransaction} from './dev040-orgmaster-independent-release.mjs'
import {assertDev057UsersAppend,assertDev057UsersMigrationEntries,assertDev057UsersReleaseAuthority,DEV057_USERS_MIGRATIONS,DEV057_USERS_REMEDIATION,DEV057_USERS_RELEASE_MODE} from './dev057-projed-users-migration.mjs'
import {assertReviewedOrgmasterMigrationEntries} from './dev057-projed-principal-migration.mjs'
import {parseDeployProductionArgs} from '../dev040-deploy-production.mjs'
import {assertMigrationReceipt} from './dev012-owner-stage-executor.mjs'
const profile=JSON.parse(readFileSync('config/release/dev040-orgmaster-independent-production-v3.json','utf8'))
const n1c=JSON.parse(readFileSync('config/dev-010/n1c-orgmaster.json','utf8'))
const files=new Map(profile.migrations.entries.map(row=>[row.path,readFileSync(row.path)]))
const after=buildDev040MigrationBundle(profile,buildOrgmasterPackage(n1c),files,'a'.repeat(40)).bundle
const before={...after,entries:after.entries.slice(0,65)}
test('user directory pins its real SQL and appends only after exact released 65 entries',()=>{
 for(const migration of DEV057_USERS_MIGRATIONS){const bytes=files.get(migration.path)
 assert.equal(sourceSha256(bytes),migration.sourceSha256)
 assert.equal(sourceSha256(unwrapMigrationTransaction(bytes)),migration.appliedSha256)}
 assert.equal(assertReviewedOrgmasterMigrationEntries(after.entries),after.entries)
 assert.equal(assertDev057UsersAppend(before,after).pendingMigrationCount,2)
 assert.equal(assertDev057UsersAppend({...before,entries:after.entries.slice(0,66)},after).pendingMigrationCount,1)
 for(const count of [0,60,64,67])assert.throws(()=>assertDev057UsersAppend({...before,entries:after.entries.slice(0,count)},after))
 for(const index of [0,30,64,65,66]){const changed=structuredClone(after);changed.entries[index].appliedSha256='0'.repeat(64);assert.throws(()=>assertDev057UsersMigrationEntries(changed.entries))}
 assert.throws(()=>assertDev057UsersAppend({...before,ledger:'foreign'},after))
})
test('user directory authority and CLI require its distinct recipe without predecessor overrides',()=>{
 const intent={ownerApplicationId:'orgmaster',sourceRevision:'a'.repeat(40),releaseId:'DIRECTORY-TEST',baselineIntentRef:{uri:'gs://fixture/baseline',sha256:'b'.repeat(64)}}
 const common={...intent,devId:'DEV-057',slice:'057-PROJED-USERS',remediation:DEV057_USERS_REMEDIATION}
 const ready={...common,schemaVersion:'orgmaster.routine-release-readiness.v1'}
 const auth={...common,schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION'}
 assert.equal(assertDev057UsersReleaseAuthority(ready,auth,intent).releaseMode,DEV057_USERS_RELEASE_MODE)
 for(const delta of [{slice:'057-PROJED-EXTERNAL'},{sourceRevision:'c'.repeat(40)},{remediation:{}},{schemaPredecessorRef:intent.baselineIntentRef}])assert.throws(()=>assertDev057UsersReleaseAuthority(ready,{...auth,...delta},intent))
 const infra=`--dev057-infra-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/tool-rotations/${'a'.repeat(40)}/app-infra.json#sha256=${'d'.repeat(64)}`
 assert.equal(parseDeployProductionArgs(['--check','--dev057-projed-users-append',infra]).dev057ProjedUsersAppend,true)
 assert.throws(()=>parseDeployProductionArgs(['--dev057-projed-users-append','--dev057-projed-external-append',infra]))
})
test('user directory owner receipt requires 67 exact entries and isolated databases',()=>{
 const intent={ownerApplicationId:'orgmaster',sourceRevision:'a'.repeat(40),migrationManifestSha256:after.manifestSha256}
 const plan={releaseMode:DEV057_USERS_RELEASE_MODE,pendingMigrationCount:2}
 const core={baselineCount:10,minimumLedgerCount:10,schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:intent.sourceRevision,manifestSha256:after.manifestSha256,status:'PASS',boundaryStatus:'PASS',applied:2,replayed:65,ledgerCount:67,database:'jenfu_prod',ledger:'orgmaster_core.schema_migrations',crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]}
 const seal=core=>({...core,receiptSha256:sha256(canonicalize(core))})
 const value=seal(core)
 assert.doesNotThrow(()=>assertMigrationReceipt(value,profile,intent,{allowForward:true,forwardPlan:plan}))
 for(const delta of [{ledgerCount:66},{applied:3,replayed:64},{crossDatabaseDenials:[]},{database:'jenfu_dev'}])assert.throws(()=>assertMigrationReceipt(seal({...core,...delta}),profile,intent,{allowForward:true,forwardPlan:plan}))
})
