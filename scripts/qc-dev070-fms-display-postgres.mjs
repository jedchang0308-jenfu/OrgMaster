import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createServer} from 'vite'
import {withAdministrationPostgresFixture,prepareAdministrationInitializationFixture,drainAdministrationFixtureEvents,createAdministrativeHumanFixture} from './lib/dev070-administration-postgres-fixture.mjs'

// Explicit owner artifacts/adapters; this runner never targets a persistent DB.
const artifactPath=process.env.DEV070_FMS_CATALOG_ARTIFACT,platformModule=process.env.DEV070_PLATFORM_FIXTURE_MODULE
if(!artifactPath||!platformModule)throw new Error('DEV070_FMS_DISPLAY_OWNER_FIXTURE_INPUTS_REQUIRED')
const {createAdministrationLifecycleFixtureDispatch,initializePrincipalForAdministrationFixture}=await import(pathToFileURL(platformModule).href)
const artifactUtf8=await readFile(artifactPath,'utf8'),catalog=JSON.parse(artifactUtf8),sha=value=>createHash('sha256').update(value).digest('hex')
const loader=await createServer({root:process.cwd(),configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
let snapshot
try{
 const {validateAndNormalizeFinancialCatalogRelease}=await loader.ssrLoadModule('/server/financialCatalogReleaseStore.ts')
 snapshot=validateAndNormalizeFinancialCatalogRelease({applicationId:catalog.applicationId,version:catalog.catalogVersion,contentSha256:sha(artifactUtf8.slice(0,-1)),artifactSha256:sha(artifactUtf8),artifactUtf8,sourceDraftId:'dev070-fms-display-isolated-source',sourceDraftRevision:1,createdBy:catalog.publishedBy,createdAt:catalog.publishedAt},{...catalog.publishedBy,issuer:'isolated-display-fixture',subject:'isolated-display-fixture',bootstrap:false})
}finally{await loader.close()}
const app='financial-management-system',adminRole=snapshot.roles.find(value=>value.stableRoleId==='role-system-admin')
assert.ok(adminRole)
const binding={catalogVersion:snapshot.catalogVersion,contentSha256:snapshot.contentSha256,stableRoleId:adminRole.stableRoleId,roleDefinitionHash:adminRole.roleDefinitionHash}
const nameSql='SELECT * FROM orgmaster_contract.v_fms_principal_display_profiles_v1 WHERE principal_id=$1 AND employee_id=$2'
async function seedFixtureDisplayName(admin){
 const workspace=(await admin.query(`SELECT artifact.artifact_key,artifact.payload FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_artifacts manifest ON manifest.batch_id=artifact.batch_id AND manifest.artifact_key='orgmaster-workspace.v1.json' WHERE artifact.artifact_key='orgmaster-versions/'||(manifest.payload->>'currentVersionId')||'.json'`)).rows[0]
 workspace.payload.state.employees.find(value=>value.id==='employee-legacy').name='中文管理測試員'
 await admin.query('UPDATE orgmaster_core.persistence_artifacts SET payload=$1,canonical_sha256=orgmaster_core.administration_sha256_v1($1::jsonb) WHERE artifact_key=$2',[JSON.stringify(workspace.payload),workspace.artifact_key])
}


await withAdministrationPostgresFixture(async fixture=>{
 const {admin,connect,handle}=fixture
 console.log(JSON.stringify({scope:'ISOLATED_ONLY_FMS_DISPLAY',pid:handle.process.pid,port:handle.port,database:handle.databaseName}))
 await admin.query('CREATE ROLE "fms-display-pdm-fixture" LOGIN; GRANT jenfu_ai_pdm_runtime TO "fms-display-pdm-fixture"')
 const fms=await connect('fms_runtime'),platform=await connect('platform-prod-runtime@jenfu-platform-prod.iam'),runtime=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam'),pdm=await connect('fms-display-pdm-fixture')
 await seedFixtureDisplayName(admin)
 // A second real legacy-admission pair for the same Employee has no exact app
 // grant. Arrange only fixture policy identity data, preserving administration.
 const artifact=(await admin.query("SELECT payload FROM orgmaster_core.persistence_artifacts WHERE artifact_key='orgmaster-governance.v3.json'")).rows[0].payload
 const published=artifact.publishedVersions.find(value=>value.id===artifact.activePolicyVersionId)
 const cloneLink={id:'display-clone-link',principalId:'principal-display-clone',employeeId:'employee-legacy',issuer:'issuer-display-clone',subject:'subject-display-clone',status:'active',validFrom:'2026-01-01T00:00:00.000Z',validTo:null}
 published.policy.identityLinks.push(cloneLink)
 published.policy.principalAdmissions.push({identityLinkId:cloneLink.id,status:'active',accountType:'human_personal'})
 await admin.query("UPDATE orgmaster_core.persistence_artifacts SET payload=$1,canonical_sha256=orgmaster_core.administration_sha256_v1($1::jsonb) WHERE artifact_key='orgmaster-governance.v3.json'",[JSON.stringify(artifact)])
 const initialization=await prepareAdministrationInitializationFixture(fixture,{acceptedCatalogs:[snapshot]})
 await initialization.initialize()
 const dispatch=createAdministrationLifecycleFixtureDispatch({database:platform,handle})
 await drainAdministrationFixtureEvents(fixture,dispatch)
 assert.equal((await fms.query("SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1('principal-legacy','employee-legacy')")).rows.length,1)
 assert.deepEqual((await fms.query(nameSql,['principal-legacy','employee-legacy'])).rows,[])
 const expected=(await platform.query("SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id='principal-legacy' AND employee_id='employee-legacy'")).rows
 assert.equal(expected.length,1);assert.ok(expected[0].employee_name)
 assert.deepEqual((await pdm.query("SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id='principal-legacy' AND employee_id='employee-legacy'")).rows,expected)

 assert.equal((await platform.query("SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id='principal-display-clone' AND employee_id='employee-legacy'")).rows.length,1)
 assert.equal((await runtime.query("SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id='principal-display-clone' AND employee_id='employee-legacy' AND account_type='human_personal'")).rows.length,1)
 assert.deepEqual((await fms.query(nameSql,['principal-display-clone','employee-legacy'])).rows,[])
 await initializePrincipalForAdministrationFixture({database:platform,handle,principalId:'principal-legacy'})
 const human=await createAdministrativeHumanFixture(fixture)
 const grant=await human.command('grant_application_administrator',{target:{principalId:'principal-legacy',employeeId:'employee-legacy',applicationId:app,validFrom:'2026-01-01T00:00:00.000Z',validTo:null},catalogBindings:{[app]:binding}})
 const receipt=await human.commit(grant)
 assert.equal(receipt.result,'applied')
 assert.deepEqual((await fms.query(nameSql,['principal-legacy','employee-legacy'])).rows,[])
 await drainAdministrationFixtureEvents(fixture,dispatch)
 assert.deepEqual((await fms.query(nameSql,['principal-legacy','employee-legacy'])).rows,expected)
 assert.deepEqual((await fms.query(nameSql,['principal-display-clone','employee-legacy'])).rows,[])
 assert.deepEqual((await fms.query('SELECT * FROM orgmaster_contract.read_fms_principal_display_profiles_v1()')).rows,expected)
 assert.deepEqual((await fms.query('SELECT * FROM orgmaster_contract.v_fms_principal_display_profiles_v1')).rows,expected)
 assert.deepEqual((await fms.query(nameSql,['principal-legacy','employee-other'])).rows,[])

 const definition=(await admin.query("SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner FROM pg_proc p WHERE p.oid='orgmaster_contract.read_fms_principal_display_profiles_v1()'::regprocedure")).rows[0]
 assert.equal(definition.prosecdef,true);assert.deepEqual(definition.proconfig,['search_path=pg_catalog']);assert.equal(definition.owner,'jenfu_orgmaster_migrator')
 assert.deepEqual((await admin.query("SELECT attname,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid='orgmaster_contract.v_fms_principal_display_profiles_v1'::regclass AND attnum>0 ORDER BY attnum")).rows,[{attname:'principal_id',type:'text'},{attname:'employee_id',type:'text'},{attname:'employee_name',type:'text'}])
 for(const sql of['SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1','SELECT * FROM orgmaster_contract.read_principal_display_profiles_administration_v1()','SELECT orgmaster_core.read_administration_publication_v1()'])await assert.rejects(fms.query(sql),error=>error.code==='42501')
 for(const reader of[platform,runtime,pdm])await assert.rejects(reader.query('SELECT * FROM orgmaster_contract.read_fms_principal_display_profiles_v1()'),error=>error.code==='42501')
 assert.equal((await admin.query("SELECT has_function_privilege('public','orgmaster_contract.read_fms_principal_display_profiles_v1()','EXECUTE') allowed")).rows[0].allowed,false)

 await admin.query('BEGIN')
 try{
  await admin.query('ALTER TABLE orgmaster_core.persistence_artifacts RENAME TO dev070_display_fault_artifacts')
  await admin.query('SET LOCAL ROLE fms_runtime')
  await assert.rejects(admin.query('SELECT * FROM orgmaster_contract.v_fms_principal_display_profiles_v1'),error=>error.code==='42P01')
 }finally{await admin.query('ROLLBACK')}
 assert.deepEqual((await fms.query('SELECT * FROM orgmaster_contract.v_fms_principal_display_profiles_v1')).rows,expected)
 await assert.rejects(fms.query('SELECT * FROM orgmaster_contract.read_principal_display_profiles_administration_v1()'),error=>error.code==='42501')
 const refreshed=await createAdministrativeHumanFixture(fixture)
 const grantId=(await runtime.query("SELECT grant_id FROM orgmaster_contract.v_application_administrator_grants_v1 WHERE application_id=$1 AND principal_id='principal-legacy'",[app])).rows[0].grant_id
 assert.equal((await refreshed.commit(await refreshed.command('revoke_application_administrator',{grantId}))).result,'applied')
 await drainAdministrationFixtureEvents(fixture,dispatch)
 assert.deepEqual((await fms.query('SELECT * FROM orgmaster_contract.v_fms_principal_display_profiles_v1')).rows,[])
 assert.equal((await fms.query("SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1('principal-legacy','employee-legacy')")).rows.length,1)
 console.log('PASS FMS display exact app-admin/pending/revoke/root-only optional name/clone same Employee/ACL/definer/dependency fault rollback')
})

await withAdministrationPostgresFixture(async fixture=>{
 const {connect,handle}=fixture
 console.log(JSON.stringify({scope:'ISOLATED_ONLY_FMS_ORDINARY_DISPLAY',pid:handle.process.pid,port:handle.port,database:handle.databaseName}))
 await seedFixtureDisplayName(fixture.admin)
 await prepareAdministrationInitializationFixture(fixture,{acceptedCatalogs:[snapshot],ordinaryFinancialViewer:true})
 const fms=await connect('fms_runtime'),platform=await connect('platform-prod-runtime@jenfu-platform-prod.iam')
 const expected=(await platform.query("SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1 WHERE principal_id='principal-legacy' AND employee_id='employee-legacy'")).rows
 assert.equal(expected.length,1)
 const authority=(await fms.query("SELECT * FROM orgmaster_contract.v_fms_authority_v3 WHERE principal_id='principal-legacy' AND employee_id='employee-legacy'")).rows
 assert.equal(authority.length,1);assert.ok(authority[0].assignments.every(value=>value.stableRoleId==='role-viewer'))
 assert.deepEqual((await fms.query(nameSql,['principal-legacy','employee-legacy'])).rows,expected)
 await assert.rejects(fms.query('SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1'),error=>error.code==='42501')
 console.log('PASS FMS ordinary qualified readonly viewer retains Chinese display through app-scoped contract')
})
