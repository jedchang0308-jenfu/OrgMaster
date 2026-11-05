import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import { withAdministrationPostgresFixture,prepareAdministrationInitializationFixture,drainAdministrationFixtureEvents,createAdministrativeHumanFixture,createAdditionalAdministrationTargetFixture } from './lib/dev070-administration-postgres-fixture.mjs'

const platformFixtureModule=process.env.DEV070_PLATFORM_FIXTURE_MODULE
if(!platformFixtureModule)throw new Error('DEV070_PLATFORM_OWNER_FIXTURE_MODULE_REQUIRED')
const {createAdministrationLifecycleFixtureDispatch,initializePrincipalForAdministrationFixture}=await import(pathToFileURL(platformFixtureModule).href)

await withAdministrationPostgresFixture(async fixture=>{
 const {admin,connect,handle}=fixture
 console.log(JSON.stringify({scope:'ISOLATED_ONLY',pid:handle.process.pid,port:handle.port,database:handle.databaseName}))
 const state = (await admin.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows
 assert.equal(state.length,1);assert.equal(state[0].contract_version,'orgmaster.administration-state.v1');assert.equal(Number(state[0].administration_version),0)
 const runtime=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
 const platform=await connect('platform-prod-runtime@jenfu-platform-prod.iam')
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows.length,0)
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.v_portal_app_visibility_v1')).rows.length>=0,true)
 await assert.rejects(platform.query('SELECT orgmaster_core.read_administration_publication_v1()'),/permission denied/)
 await assert.rejects(platform.query('SELECT * FROM orgmaster_contract.v_application_administrator_grants_v1'),/permission denied/)
 await runtime.query('SELECT * FROM orgmaster_contract.v_application_administrator_grants_v1')
 const fms=await connect('fms_runtime');await fms.query('SELECT * FROM orgmaster_contract.v_fms_authority_v3')
 const fmsInitialization=(principalId,employeeId)=>fms.query('SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1($1,$2)',[principalId,employeeId])
 assert.equal((await fmsInitialization('principal-legacy','employee-legacy')).rows.length,0)
 await assert.rejects(fms.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1'),/permission denied/)
 await assert.rejects(fms.query('SELECT * FROM orgmaster_contract.v_application_administrator_grants_v1'),/permission denied/)
 const pdm=await connect('pdm-display-fixture') .catch(async()=>{await admin.query('CREATE ROLE "pdm-display-fixture" LOGIN; GRANT jenfu_ai_pdm_runtime TO "pdm-display-fixture"');return connect('pdm-display-fixture')})
 for(const reader of[platform,fms,pdm])await reader.query('SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1')
 for(const reader of[platform,pdm,runtime])await assert.rejects(reader.query("SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1('principal-legacy','employee-legacy')"),/permission denied/)
 await assert.rejects(runtime.query('SELECT * FROM orgmaster_core.administrative_command_receipts_v1'),/permission denied/)
 await assert.rejects(runtime.query("SELECT orgmaster_core.initialize_administration_owner_v1('{}')"),/permission denied/)
 const privileges=(await admin.query(`SELECT has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(jsonb,text,text,text,text,jsonb)','EXECUTE') AS legacy,has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)','EXECUTE') AS current`)).rows[0]
 assert.equal(privileges.legacy,false);assert.equal(privileges.current,true)
 await assert.rejects(runtime.query("SELECT orgmaster_core.apply_administration_command_v1('{}','{\"kind\":\"owner_workload\"}')"))
 const initialization=await prepareAdministrationInitializationFixture(fixture)
 const competingOwner=await connect('orgmaster-owner-fixture')
 const concurrent=await Promise.all([initialization.initialize(),competingOwner.query('SELECT orgmaster_core.initialize_administration_owner_v1($1::jsonb) receipt',[JSON.stringify(initialization.package)]).then(result=>result.rows[0].receipt)])
 const initialized=concurrent[0];assert.deepEqual(concurrent[1],initialized)
 assert.equal(initialized.result,'applied');assert.equal(initialized.administrationVersion,1);assert.equal(initialized.grantIds.length,2)
 const roots=(await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows
 assert.equal(roots.length,0)
 assert.equal(initialized.activation,'pending')
 assert.equal((await fmsInitialization('principal-legacy','employee-legacy')).rows.length,0)
 const alerts=(await admin.query('SELECT actor,actor_principal_id,operation FROM orgmaster_core.privileged_security_alert_intents')).rows
 assert.equal(alerts.length,1);assert.equal(alerts[0].actor.kind,'owner_workload');assert.equal(alerts[0].actor_principal_id,null)
 const claimedAlerts=(await runtime.query("SELECT * FROM orgmaster_core.claim_privileged_security_alerts_v2('dev070-isolated-alert-worker',20,60)")).rows
 assert.equal(claimedAlerts.length,1);assert.deepEqual(claimedAlerts[0].actor,alerts[0].actor)
 await runtime.query('SELECT orgmaster_core.complete_privileged_security_alert_v1($1,$2,$3)',[claimedAlerts[0].alert_reference,'dev070-isolated-alert-worker','a'.repeat(64)])
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows[0].recovery_required,false)
 assert.equal((await admin.query("SELECT count(*) count FROM orgmaster_core.principal_lifecycle_events_v2 WHERE reason_code='administration_changed'")).rows[0].count,'1')
 const terminalBefore=(await admin.query('SELECT result FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=$1',[initialized.commandId])).rows[0].result
 const dispatched=await drainAdministrationFixtureEvents(fixture,createAdministrationLifecycleFixtureDispatch({database:platform,handle}))
 assert.equal(dispatched.length,1)
 const activatedRoots=(await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows
 assert.equal(activatedRoots.length,1);assert.equal(activatedRoots[0].principal_id,'principal-legacy')
 const initialProof=(await fmsInitialization('principal-legacy','employee-legacy')).rows
 assert.equal(initialProof.length,1);assert.equal(initialProof[0].contract_version,'orgmaster.fms-administration-initialization.v1')
 assert.deepEqual(Object.keys(initialProof[0]),['contract_version','administration_version','root_grant_id','principal_id','employee_id','published_policy_id','published_at','read_at'])
 assert.equal(initialProof[0].root_grant_id,activatedRoots[0].grant_id);assert.equal(initialProof[0].administration_version,activatedRoots[0].administration_version)
 assert.equal(initialProof[0].published_policy_id,activatedRoots[0].published_policy_id);assert.ok(initialProof[0].read_at>=initialProof[0].published_at)
 assert.equal((await fmsInitialization('principal-other','employee-legacy')).rows.length,0)
 assert.equal((await fmsInitialization('principal-legacy','employee-other')).rows.length,0)
 const readback=(await admin.query('SELECT orgmaster_core.read_administration_publication_v1() publication')).rows[0].publication
 assert.equal(readback.policy.unpublishedBusinessMarker,undefined)
 const saved=(await admin.query(`SELECT payload FROM orgmaster_core.persistence_artifacts WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0].payload
 assert.equal(saved.draft.unpublishedBusinessMarker,'preserve-only-in-draft')
 const replay=(await initialization.owner.query('SELECT orgmaster_core.initialize_administration_owner_v1($1::jsonb) receipt',[JSON.stringify(initialization.package)])).rows[0].receipt
 assert.deepEqual({...replay,activation:'pending'},initialized);assert.equal(replay.activation,'acknowledged')
 assert.deepEqual((await admin.query('SELECT result FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=$1',[initialized.commandId])).rows[0].result,terminalBefore)
 assert.equal((await admin.query('SELECT count(*) count FROM orgmaster_core.administrative_command_receipts_v1')).rows[0].count,'1')
 await assert.rejects(initialization.owner.query('SELECT orgmaster_core.initialize_administration_owner_v1($1::jsonb)',[JSON.stringify({...initialization.package,command:{...initialization.command,commandId:crypto.randomUUID()}})]),/ADMINISTRATION_COMMAND_CONFLICT/)
 await initializePrincipalForAdministrationFixture({database:platform,handle,principalId:'principal-legacy'})
 const human=await createAdministrativeHumanFixture(fixture)
 const root=readback.policy.administration.grants.find(value=>value.roleCode==='platform_super_admin'),entry=readback.policy.administration.grants.find(value=>value.applicationId==='orgmaster')
 const beforeFailure=(await admin.query('SELECT count(*) count FROM orgmaster_core.administrative_command_receipts_v1')).rows[0].count
 for(const grant of[root,entry]){
  const mutation=await human.command(grant===root?'revoke_platform_administrator':'revoke_application_administrator',{grantId:grant.id})
  await assert.rejects(human.commit(mutation),/LAST_PLATFORM_ADMIN/)
  await assert.rejects(human.status(mutation.commandId),/COMMAND_NOT_COMMITTED/)
 }
 assert.equal((await admin.query('SELECT count(*) count FROM orgmaster_core.administrative_command_receipts_v1')).rows[0].count,beforeFailure)
 const noChange=await human.command('grant_application_administrator',{target:{principalId:human.principalId,employeeId:human.employeeId,applicationId:'orgmaster',validFrom:entry.validFrom,validTo:entry.validTo},catalogBindings:{orgmaster:entry.catalogBinding}})
 const noChangeReceipt=await human.commit(noChange);assert.equal(noChangeReceipt.result,'no_change');assert.equal(noChangeReceipt.administrationVersion,1);assert.deepEqual(noChangeReceipt.outboxIds,[])
 assert.deepEqual(await human.status(noChange.commandId),noChangeReceipt)
 await assert.rejects(human.commit({...noChange,reason:'相同命令換內容'}),/ADMINISTRATION_COMMAND_CONFLICT/)
 await assert.rejects(human.commit({...noChange,commandId:crypto.randomUUID(),bootstrap:true}),/ADMIN_TARGET_INVALID/)
 await admin.query('BEGIN')
 try{
  await admin.query('ALTER TABLE orgmaster_core.persistence_artifacts RENAME TO dev070_fault_injected_artifacts')
  await admin.query('SET LOCAL ROLE fms_runtime')
  await assert.rejects(admin.query("SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1('principal-legacy','employee-legacy')"),/does not exist/)
 }finally{await admin.query('ROLLBACK')}
 console.log('PASS DEV070 FMS point-only root initialization proof/zero/pending/exact Principal/ACL/dependency fault')
 console.log('PASS DEV070 concurrent initialize/last root and entry rejection/rollback/no_change/command recovery')
 console.log('PASS DEV070 owner initialization/replay/one checkpoint/draft preservation/typed epoch consumption/derived acknowledgment')
 console.log('PASS DEV070 state/ACL/old-writer/runtime-owner rejection')
})

await withAdministrationPostgresFixture(async fixture=>{
 const {admin,connect,handle}=fixture,platform=await connect('platform-prod-runtime@jenfu-platform-prod.iam')
 const initialization=await prepareAdministrationInitializationFixture(fixture,{freshNative:true,noPublication:true})
 assert.equal(initialization.prepareReceipt.result,'prepared')
 assert.equal((await admin.query('SELECT count(*) count FROM orgmaster_core.administrative_command_receipts_v1')).rows[0].count,'0')
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows[0].initialized_by_command_id,null)
 const receipt=await initialization.initialize();assert.equal(receipt.result,'applied')
 const published=(await admin.query('SELECT orgmaster_core.read_administration_publication_v1() policy')).rows[0].policy
 assert.deepEqual(published.policy.roleAssignments,[])
 assert.ok(published.policy.permissions.some(value=>value.code==='orgmaster.governance.manage'))
 assert.ok(published.policy.permissions.some(value=>value.code==='orgmaster.identity.link'))
 assert.equal((await admin.query(`SELECT artifact.payload#>>'{draft,unpublishedBusinessMarker}' marker FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id WHERE artifact_key='orgmaster-governance.v3.json'`)).rows[0].marker,'preserve-only-in-draft')
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows[0].recovery_required,false)
 await drainAdministrationFixtureEvents(fixture,createAdministrationLifecycleFixtureDispatch({database:platform,handle}))
 const roots=(await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows
 assert.equal(roots.length,1);assert.equal(roots[0].principal_id,initialization.facts.principalId)
 await initializePrincipalForAdministrationFixture({database:platform,handle,principalId:initialization.facts.principalId})
 await createAdministrativeHumanFixture(fixture,{principalId:initialization.facts.principalId})
 const admission=(await admin.query('SELECT revision FROM orgmaster_core.managed_identity_admission_authority WHERE singleton')).rows[0]
 await assert.rejects(admin.query("SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,false,'dev070-fixture','voluntary-disable')",[admission.revision]),/LAST_PLATFORM_ADMIN/)
 const native=(await admin.query('SELECT identity_record_id,revision FROM orgmaster_core.managed_daily_identities WHERE principal_id=$1',[initialization.facts.principalId])).rows[0]
 await assert.rejects(admin.query("SELECT orgmaster_core.quarantine_managed_identity_v1($1,$2,'test-incident','dev070-fixture','voluntary-quarantine')",[native.identity_record_id,native.revision]),/LAST_PLATFORM_ADMIN/)
 assert.equal((await admin.query('SELECT admission_enabled FROM orgmaster_core.managed_identity_admission_authority WHERE singleton')).rows[0].admission_enabled,true)
 const worker=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam'),executor='principal-workload:orgmaster-managed-identity-lifecycle',leaseId=crypto.randomUUID()
 await worker.query("SELECT * FROM orgmaster_core.enqueue_managed_identity_refresh_v1($1,'manual',$2,$3)",[initialization.facts.employeeId,crypto.randomUUID(),initialization.facts.principalId])
 const refresh=(await worker.query('SELECT * FROM orgmaster_core.claim_managed_identity_refresh_v2($1,$2::uuid,1)',[executor,leaseId])).rows.find(value=>value.claim_kind==='leased')
 assert.ok(refresh)
 assert.equal((await worker.query("SELECT orgmaster_core.complete_managed_identity_refresh_v2($1,$2::uuid,$3::uuid,$4,'missing',NULL,NULL) result",[executor,leaseId,refresh.request_id,refresh.lease_generation])).rows[0].result,'applied')
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows.length,0)
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.read_administration_state_v1()')).rows[0].recovery_required,true)
 assert.equal((await admin.query("SELECT count(*) count FROM orgmaster_core.principal_lifecycle_events_v2 WHERE reason_code='managed_directory_observation_changed'")).rows[0].count,'1')
 await drainAdministrationFixtureEvents(fixture,createAdministrationLifecycleFixtureDispatch({database:platform,handle}))
 console.log('PASS DEV070 voluntary native withdrawal rollback, external Directory disable persists and requires recovery with typed invalidation')
 console.log('PASS DEV070 missing native provider mapping/partial prepare/no prior publication/source-owned admin permissions/normal session admission')
})

await withAdministrationPostgresFixture(async fixture=>{
 const {admin,connect,handle}=fixture,initialization=await prepareAdministrationInitializationFixture(fixture)
 const target=await createAdditionalAdministrationTargetFixture(fixture)
 await initialization.initialize()
 const platform=await connect('platform-prod-runtime@jenfu-platform-prod.iam'),dispatch=createAdministrationLifecycleFixtureDispatch({database:platform,handle})
 await drainAdministrationFixtureEvents(fixture,dispatch)
 await initializePrincipalForAdministrationFixture({database:platform,handle,principalId:'principal-legacy'})
 const first=await createAdministrativeHumanFixture(fixture)
 const entry=initialization.plan.catalogBindings.orgmaster
 for(const [operation,applicationId]of[['grant_application_administrator','orgmaster'],['grant_platform_administrator',null]]){
  const command=await first.command(operation,{target:{principalId:target.principalId,employeeId:target.employeeId,applicationId,validFrom:'2026-01-01T00:00:00.000Z',validTo:null},catalogBindings:applicationId?{orgmaster:entry}:{}})
  assert.equal((await first.commit(command)).result,'applied');await drainAdministrationFixtureEvents(fixture,dispatch)
  if(applicationId==='orgmaster'){
   const fms=await connect('fms_runtime')
   try{assert.equal((await fms.query('SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1($1,$2)',[target.principalId,target.employeeId])).rows.length,0)}finally{await fms.end()}
  }
 }
 await initializePrincipalForAdministrationFixture({database:platform,handle,principalId:target.principalId})
 const second=await createAdministrativeHumanFixture(fixture,{principalId:target.principalId})
 const roots=(await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows
 assert.equal(roots.length,2)
 const commands=await Promise.all([first.command('revoke_platform_administrator',{grantId:roots.find(value=>value.principal_id===first.principalId).grant_id}),second.command('revoke_platform_administrator',{grantId:roots.find(value=>value.principal_id===second.principalId).grant_id})])
 const results=await Promise.allSettled([first.commit(commands[0]),second.commit(commands[1])])
 assert.equal(results.filter(value=>value.status==='fulfilled').length,1)
 assert.match(results.find(value=>value.status==='rejected').reason.message,/ADMINISTRATION_CONFLICT/)
 await drainAdministrationFixtureEvents(fixture,dispatch)
 const remaining=(await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows
 assert.equal(remaining.length,1)
 const survivor=remaining[0].principal_id===first.principalId?first:second
 await assert.rejects(survivor.commit(await survivor.command('revoke_platform_administrator',{grantId:remaining[0].grant_id})),/LAST_PLATFORM_ADMIN/)
 console.log('PASS DEV070 two-root concurrent revoke serializes, one CAS conflict, survivor last-root protected')
 const removed=roots.find(value=>value.principal_id!==survivor.principalId)
 await survivor.commit(await survivor.command('grant_platform_administrator',{target:{principalId:removed.principal_id,employeeId:removed.employee_id,applicationId:null,validFrom:'2026-01-01T00:00:00.000Z',validTo:null}}))
 await drainAdministrationFixtureEvents(fixture,dispatch)
 const legacy=await createAdministrativeHumanFixture(fixture),competing=await connect('orgmaster-owner-fixture')
 const legacyRoot=(await platform.query("SELECT grant_id FROM orgmaster_contract.v_platform_administrator_grants_v1 WHERE principal_id='principal-legacy'")).rows[0]
 const native=(await admin.query('SELECT revision FROM orgmaster_core.managed_daily_identities WHERE identity_record_id=$1',[target.identityId])).rows[0]
 const outcomes=await Promise.allSettled([
  legacy.commit(await legacy.command('revoke_platform_administrator',{grantId:legacyRoot.grant_id})),
  competing.query("SELECT orgmaster_core.quarantine_managed_identity_v1($1,$2,'isolated-concurrency-incident','dev070-fixture','voluntary-quarantine')",[target.identityId,native.revision]),
 ])
 assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1)
 assert.match(outcomes.find(value=>value.status==='rejected').reason.message,/LAST_PLATFORM_ADMIN/)
 assert.equal((await platform.query('SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1')).rows.length,1)
 console.log('PASS DEV070 concurrent root revoke/native quarantine cannot both remove the final usable root')
})

await withAdministrationPostgresFixture(async fixture=>{
 await assert.rejects(prepareAdministrationInitializationFixture(fixture,{freshNative:true,noPublication:true,freshEmployeeId:'employee-one'}),/ADMIN_TARGET_INVALID/)
 assert.equal((await fixture.admin.query("SELECT count(*) count FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-one'")).rows[0].count,'0')
 assert.equal((await fixture.admin.query('SELECT count(*) count FROM orgmaster_core.administrative_command_receipts_v1')).rows[0].count,'0')
 console.log('PASS DEV070 unresolved historical pair blocks native prepare without rewriting history')
})
