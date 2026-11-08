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

test('DEV070 exact reviewed source packages only 042/044/045/047/048/049/050 after immutable 001–041 identity',()=>{
 assertDev040V3Profile(profile,n1c);assertDev070MigrationEntries(after.entries)
 assertDev059MigrationEntries(after.entries.slice(0,39))
 assert.equal(after.entries.length,46)
 assert.deepEqual(after.entries.slice(39).map(row=>row.path),DEV070_MIGRATION_ENTRIES.map(row=>row.path))
 assert.equal(after.entries.some(row=>row.path.includes('/043_')),false)
 for(const entry of DEV070_MIGRATION_ENTRIES){assert.equal(sourceSha256(files.get(entry.path)),entry.sourceSha256);assert.equal(sourceSha256(unwrapMigrationTransaction(files.get(entry.path))),entry.appliedSha256)}
})
test('DEV070 planner admits only previously known exact prefixes and source-controlled partial append readback',()=>{
 for(let count=31;count<46;count++)assert.equal(assertDev070AdministrationAppend(before(count),after).pendingMigrationCount,46-count)
 for(const count of[0,10,30,46,47])assert.throws(()=>assertDev070AdministrationAppend(before(count),after),/DEV070_MIGRATION_APPEND_INVALID/)
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
 const core={schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:source,manifestSha256:after.manifestSha256,status:'PASS',boundaryStatus:'PASS',database:'jenfu_prod',ledger:'orgmaster_core.schema_migrations',baselineCount:10,minimumLedgerCount:10,ledgerCount:46,applied:1,replayed:45,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]}
 const check=(value,plan={releaseMode:DEV070_RELEASE_MODE,pendingMigrationCount:1})=>assertMigrationReceipt({...value,receiptSha256:sha256(canonicalize(value))},owner,intent,{allowForward:true,forwardPlan:plan})
 assert.doesNotThrow(()=>check(core));assert.doesNotThrow(()=>check({...core,applied:0,replayed:46}))
 for(const changed of[{ledgerCount:45},{ledgerCount:47},{applied:2,replayed:44},{sourceRevision:'0'.repeat(40)},{manifestSha256:'0'.repeat(64)},{database:'jenfu_stg'},{crossDatabaseDenials:[{database:'jenfu_dev',denied:true}]},{crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_dev',denied:true}]}])assert.throws(()=>check({...core,...changed}),/MIGRATION_RECEIPT_INVALID/)
 for(const pendingMigrationCount of[0,17,-1,1.5])assert.throws(()=>check(core,{releaseMode:DEV070_RELEASE_MODE,pendingMigrationCount}),/MIGRATION_RECEIPT_INVALID/)
})


test('048 changes only the two reviewed scalar projections while preserving complete source bodies and attributes',()=>{
 const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
 const extract=(source,marker,end)=>{const start=source.indexOf(marker),last=source.indexOf(end,start);assert.ok(start>=0&&last>start);return source.slice(start,last+end.length)}
 const sql=text('db/migrations/048_dev070_governance_scalar_projection.sql')
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)??[]).length,2)
 assert.equal(/(?:ALTER FUNCTION|GRANT |REVOKE |SET (?:LOCAL )?jit)/i.test(sql),false)
 assert.equal(sql.includes('\r'),false)
 assert.ok(text('.gitattributes').split(/\r?\n/).includes('db/migrations/048_dev070_governance_scalar_projection.sql text eol=lf'))
 let admin=extract(sql,'CREATE OR REPLACE FUNCTION orgmaster_core.read_administration_publication_v1()','$fn$;').replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION')
 admin=admin.replace('DECLARE document jsonb; publication jsonb; active_policy_id text;','DECLARE document jsonb; publication jsonb;').replace("  active_policy_id := document->>'activePolicyVersionId';\n  IF active_policy_id IS NULL THEN RETURN NULL; END IF;","  IF document->>'activePolicyVersionId' IS NULL THEN RETURN NULL; END IF;").replace("WHERE value->>'id'=active_policy_id AND","WHERE value->>'id'=document->>'activePolicyVersionId' AND")
 assert.equal(admin,extract(text('db/migrations/044_dev070_administration_projection_v1.sql'),'CREATE FUNCTION orgmaster_core.read_administration_publication_v1()','$fn$;'))
 let accounts=extract(sql,'CREATE OR REPLACE FUNCTION orgmaster_core.read_ai_pdm_principal_accounts_v1(','$accounts$;').replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION')
 accounts=accounts.replace("  SELECT artifact.payload, artifact.payload->>'activePolicyVersionId' AS active_policy_id, artifact.payload->'publishedVersions' AS published_versions\n",'  SELECT artifact.payload\n').replaceAll('governance.published_versions',"governance.payload->'publishedVersions'").replace('governance.active_policy_id',"governance.payload->>'activePolicyVersionId'")
 assert.equal(accounts,extract(text('db/migrations/047_dev070_scoped_ai_pdm_principal_readers.sql'),'CREATE FUNCTION orgmaster_core.read_ai_pdm_principal_accounts_v1(','$accounts$;'))
 const extra=structuredClone(after);extra.entries.push({...extra.entries.at(-1),order:47,version:'unknown-051',path:'db/migrations/051_unknown.sql'})
 assert.throws(()=>assertDev070MigrationEntries(extra.entries),/DEV070_MIGRATION_APPEND_INVALID/)
})


test('049 keeps the existing manager function and all policy predicates, targeting only its effective grants lookup',()=>{
 const sqlPath='db/migrations/049_dev070_scoped_pdm_role_policy_manager.sql'
 const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replaceAll('\r\n','\n')
 const sql=text(sqlPath)
 const original=text('db/migrations/044_dev070_administration_projection_v1.sql')
  .match(/^CREATE FUNCTION orgmaster_contract\.ai_pdm_role_policy_manager_eligible_v2\([^\n]+\n[\s\S]*?^\$fn\$;$/m)[0]
 const candidate=sql.match(/^CREATE OR REPLACE FUNCTION [^\n]+\n[\s\S]*?^\$fn\$;$/m)[0]
 assert.equal(candidate.replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION')
  .replace('FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(p_principal,p_employee) effective',
   'FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 effective'),original)
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)??[]).length,1)
 assert.doesNotMatch(sql,/\b(?:ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/)
 assert.ok(text('.gitattributes').split('\n').includes(sqlPath+' text eol=lf'))
})
