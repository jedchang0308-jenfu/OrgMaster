import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { withDev058Dev123Database } from './dev058-dev123-native-bootstrap.mjs'
import { makeManagerEligible, activeGovernanceArtifact, appendGovernanceVersion, writeGovernanceOwnerFixture } from './dev058-dev123-native-fixtures.mjs'

// This journey executes actual owner migrations, PDM service functions and the
// OrgMaster decoder. Identity/session/Platform rows are explicit local fixtures.
// It does not prove normal SSO, a browser journey, or a deployed consumer.
const passed = []
function pass(id) { passed.push(id); console.log(JSON.stringify({nativeCase:id,status:'PASS'})) }
async function rejects(work, code) {
  await assert.rejects(work, error => error?.code === code || error?.message?.includes(code))
}

await withDev058Dev123Database(async ({admin,pdmRuntime,orgRuntime,handle,pdmRoot,orgRoot}) => {
  const imp = name => import(pathToFileURL(path.join(pdmRoot,'src/lib',name)).href)
  const service = await imp('role-policy-service.ts')
  const editor = await imp('role-policy-editor.ts')
  const {PostgresAsyncDatabaseClient} = await imp('db-async-provider.ts')
  const {hashJenfuPrincipalSessionId} = await imp('jenfu-principal-session-registry.ts')
  const {decodeDynamicAiPdmRoleCatalog} = await import(pathToFileURL(path.join(orgRoot,'server/aiPdmDynamicRoleCatalog.ts')).href)
  const {readPublishedAiPdmRoleCatalog} = await import(pathToFileURL(path.join(orgRoot,'server/aiPdmRoleCatalogRepository.ts')).href)
  assert.equal((await pdmRuntime.query('SELECT session_user')).rows[0].session_user,'jenfu_ai_pdm_runtime')
  assert.equal((await orgRuntime.query('SELECT session_user')).rows[0].session_user,'jenfu_orgmaster_runtime')
  const absent = await admin.query(`SELECT to_regclass('ai_pdm_core.role_policy_state') AS policy_state,
    to_regclass('orgmaster_core.ai_pdm_role_policy_compatibility') AS readiness`)
  assert.deepEqual(absent.rows,[{policy_state:null,readiness:null}])
  const baseline = await readPublishedAiPdmRoleCatalog(orgRoot,'ai-pdm.role-catalog.2026-10-10.v7')
  pass('owner-migrations-runtime-identities-no-retired-state')

  const manager = await makeManagerEligible(admin)
  await admin.query(`INSERT INTO platform_contract.task_owned_principal_auth_state(principal_id,auth_epoch) VALUES($1,0)`,[manager.link.principalId])
  const account = (await admin.query('SELECT * FROM ai_pdm_core.principal_accounts WHERE principal_id=$1',[manager.link.principalId])).rows[0]
  const now = new Date(Date.now()-1000).toISOString(), expires = new Date(Date.now()+3600000).toISOString()
  const sessionId = crypto.randomUUID(), sessionHash = hashJenfuPrincipalSessionId(sessionId)
  await pdmRuntime.query(`INSERT INTO ai_pdm_core.principal_session_records(principal_id,session_id_hash,
    principal_auth_epoch,lifecycle_version,profile_version,authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
    VALUES($1,$2,0,$3,$4,$5,$5,$6,'aal2',$7)`,[account.principal_id,sessionHash,account.lifecycle_version,account.profile_version,now,expires,'a'.repeat(64)])
  const verified = {profile:{pdmUserId:account.pdm_user_id,companyId:account.company_id},session:{
    contractVersion:'jenfu.ai-pdm-session.v2',appId:'ai-pdm',sessionId,identityIssuer:manager.link.issuer,
    identitySubject:manager.link.subject,principalId:account.principal_id,employeeId:account.employee_id,authEpoch:0,
    profileVersion:Number(account.profile_version),accountLifecycleVersion:Number(account.lifecycle_version),
    authenticatedAt:now,issuedAt:now,expiresAt:expires,assuranceLevel:'aal2'}}
  const client = new PostgresAsyncDatabaseClient({kind:'postgres',
    connectionString:`postgresql://jenfu_ai_pdm_runtime@${handle.host}:${handle.port}/${handle.databaseName}`,
    searchPath:'ai_pdm_core,pg_catalog',maxConnections:2,applicationName:'dev123-native-policy',
    queryTimeoutMillis:15000,statementTimeoutMillis:12000})
  const tx = fn => client.transaction(fn,{isolationLevel:'read_committed'})
  const snapshot = async () => (await admin.query(`SELECT jsonb_build_object(
    'pointer',(SELECT to_jsonb(a) FROM ai_pdm_core.active_role_catalog a),
    'publications',(SELECT jsonb_agg(to_jsonb(p) ORDER BY catalog_version) FROM ai_pdm_core.role_catalog_publications p),
    'entries',(SELECT jsonb_agg(to_jsonb(e) ORDER BY catalog_version,display_order) FROM ai_pdm_core.role_catalog_entries e),
    'identities',(SELECT jsonb_agg(to_jsonb(i) ORDER BY stable_role_id) FROM ai_pdm_core.role_policy_role_identities i),
    'drafts',(SELECT jsonb_agg(to_jsonb(d) ORDER BY draft_id) FROM ai_pdm_core.role_policy_drafts d),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY request_id) FROM ai_pdm_core.role_policy_commands c)) AS data`)).rows[0].data
  try {
    const workspace = await tx(c=>service.readRolePolicyWorkspace(c,null,verified))
    assert.equal(workspace.publicationFormat,'legacy-static-v1')
    assert.equal(workspace.roleProfiles.filter(p=>p.assignmentDisposition==='selectable').length,7)
    assert.deepEqual(workspace.roles[0].permissions,editor.rolePolicySource().baseCatalog.roles[0].permissions)
    const active = workspace.active, draftId = crypto.randomUUID()
    const create = {draftId,expectedActive:active}
    const draft = await tx(c=>service.createRolePolicyDraft(c,verified,create))
    assert.deepEqual(await tx(c=>service.createRolePolicyDraft(c,verified,create)),draft)
    await rejects(()=>tx(c=>service.createRolePolicyDraft(c,verified,{...create,expectedActive:{...active,catalogSha256:'0'.repeat(64)}})),'DRAFT_ID_REUSE')
    pass('legacy-truth-seven-profiles-create-binding-readback')

    const saved = await tx(c=>service.saveRolePolicyDraft(c,verified,draftId,{expectedRevision:1,
      roleChanges:[{type:'create',clientRoleId:'client-native',displayName:'隔離驗證協作'}],
      changes:[{roleRef:{clientRoleId:'client-native'},groupId:'drawing',actionId:'view',enabled:true}]}))
    assert.equal(saved.revision,2)
    assert.equal(saved.roleBindings.length,1)
    const customId = saved.roleBindings[0].stableRoleId
    assert.equal((await tx(c=>service.readRolePolicyDraft(c,draftId))).roleBindings[0].stableRoleId,customId)
    await rejects(()=>tx(c=>service.saveRolePolicyDraft(c,verified,draftId,{expectedRevision:1,roleChanges:[],changes:[]})),'DRAFT_CONFLICT')
    const beforePreview = await snapshot()
    const preview = await tx(c=>service.previewRolePolicyDraft(c,draftId,2))
    assert.deepEqual(await snapshot(),beforePreview)
    assert.equal(preview.diff.policyTransition,'legacy-to-dynamic')
    pass('mixed-save-server-identity-revision-cas-readonly-preview')

    const body = {requestId:crypto.randomUUID(),confirmation:preview.confirmation,reason:'隔離 native apply'}
    const beforeFailure = await snapshot()
    await admin.query(`CREATE FUNCTION ai_pdm_core.task_dev123_fault() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.catalog_version LIKE 'ai-pdm.role-policy.%' AND NEW.display_order=3 THEN
        RAISE EXCEPTION 'TASK_ATOMICITY_FAULT'; END IF; RETURN NEW; END $f$;
      CREATE TRIGGER task_dev123_fault BEFORE INSERT ON ai_pdm_core.role_catalog_entries
        FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.task_dev123_fault()`)
    await rejects(()=>tx(c=>service.applyRolePolicy(c,verified,body)),'TASK_ATOMICITY_FAULT')
    assert.deepEqual(await snapshot(),beforeFailure)
    await admin.query('DROP TRIGGER task_dev123_fault ON ai_pdm_core.role_catalog_entries; DROP FUNCTION ai_pdm_core.task_dev123_fault()')
    pass('mid-publication-fault-rolls-back-all-domain-and-command-effects')

    const result = await tx(c=>service.applyRolePolicy(c,verified,body))
    assert.equal(result.status,'ACTIVE')
    assert.deepEqual(await tx(c=>service.applyRolePolicy(c,verified,body)),result)
    await rejects(()=>tx(c=>service.applyRolePolicy(c,verified,{...body,reason:'different'})),'REQUEST_ID_REUSE')
    const command = await tx(c=>service.readRolePolicyCommand(c,body.requestId,verified))
    assert.deepEqual(command.result,result)
    const receipt = (await admin.query('SELECT request_hash,diff_json FROM ai_pdm_core.role_policy_commands WHERE request_id=$1',[body.requestId])).rows[0]
    assert.deepEqual(receipt.diff_json,preview.diff)
    const publication = await tx(c=>service.readRolePolicyPublication(c,result.catalogVersion,verified))
    assert.equal(publication.audit.reason,body.reason)
    pass('atomic-apply-db-derived-audit-idempotent-lost-response-readback')

    const currentRows = (await orgRuntime.query('SELECT * FROM ai_pdm_contract.v_application_role_catalog_v2 ORDER BY display_order')).rows
    const consumer = decodeDynamicAiPdmRoleCatalog(currentRows,[baseline])
    assert.equal(consumer.catalogSha256,result.catalogSha256)
    assert.ok(consumer.roles.some(r=>r.stableRoleId===customId))
    const orgHistory = (await orgRuntime.query('SELECT * FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE catalog_version=$1 ORDER BY display_order',[result.catalogVersion])).rows
    assert.equal(decodeDynamicAiPdmRoleCatalog(orgHistory,[baseline]).catalogSha256,result.catalogSha256)
    pass('actual-orgmaster-runtime-current-history-decoder-contract-pair')

    // The DB entry itself refuses a missing/forged session independently of HTTP.
    const nextId = crypto.randomUUID()
    const next = await tx(c=>service.createRolePolicyDraft(c,verified,{draftId:nextId,expectedActive:{catalogVersion:result.catalogVersion,catalogSha256:result.catalogSha256}}))
    const beforeDirect = await snapshot()
    await rejects(()=>pdmRuntime.query(`SELECT ai_pdm_core.role_policy_apply_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(),account.principal_id,'0'.repeat(64),manager.link.issuer,manager.link.subject,nextId,next.revision,result.catalogVersion,result.catalogSha256,'forged']),'DEV123_MANAGER_REQUIRED')
    assert.deepEqual(await snapshot(),beforeDirect)
    for (const sql of ["UPDATE ai_pdm_core.role_policy_commands SET reason='tamper'",
      "UPDATE ai_pdm_core.role_catalog_entries SET role_status='inactive'",
      "UPDATE ai_pdm_core.active_role_catalog SET catalog_version=catalog_version",
      "UPDATE ai_pdm_core.role_policy_role_identities SET display_name='tamper'"]) {
      await rejects(()=>pdmRuntime.query(sql),'42501')
    }
    pass('runtime-acl-and-direct-entry-session-denial-zero-effects')

    const statusDraft = await tx(c=>service.saveRolePolicyDraft(c,verified,nextId,{expectedRevision:next.revision,
      roleChanges:[{type:'deactivate',stableRoleId:'role-procurement'},{type:'deactivate',stableRoleId:customId}],changes:[]}))
    const statusPreview = await tx(c=>service.previewRolePolicyDraft(c,nextId,statusDraft.revision))
    const statusResult = await tx(c=>service.applyRolePolicy(c,verified,{requestId:crypto.randomUUID(),confirmation:statusPreview.confirmation,reason:'停用角色 native'}))
    const inactive = (await orgRuntime.query('SELECT stable_role_id,role_status FROM ai_pdm_contract.v_application_role_catalog_v2 WHERE stable_role_id=ANY($1)',[['role-procurement','role-production-planning',customId]])).rows
    assert.equal(inactive.length,3); assert.ok(inactive.every(r=>r.role_status==='inactive'))
    assert.deepEqual(await tx(c=>service.applyRolePolicy(c,verified,body)),result)
    assert.notEqual(statusResult.catalogVersion,result.catalogVersion)
    const restored = await tx(c=>service.createRolePolicyDraft(c,verified,{draftId:crypto.randomUUID(),
      expectedActive:{catalogVersion:statusResult.catalogVersion,catalogSha256:statusResult.catalogSha256},sourceHistoryVersion:result.catalogVersion}))
    assert.equal(restored.candidate.roles.find(r=>r.stableRoleId===customId).roleStatus,'inactive')
    pass('alias-inactive-tombstones-history-clone-current-base-old-command-replay')

    const currentTuple = {catalogVersion:statusResult.catalogVersion,catalogSha256:statusResult.catalogSha256}
    const concurrent = await tx(c=>service.createRolePolicyDraft(c,verified,{draftId:crypto.randomUUID(),expectedActive:currentTuple}))
    const saveResults = await Promise.allSettled([1,2].map(()=>tx(c=>service.saveRolePolicyDraft(c,verified,concurrent.draftId,
      {expectedRevision:1,roleChanges:[{type:'reactivate',stableRoleId:customId}],changes:[]}))))
    assert.equal(saveResults.filter(r=>r.status==='fulfilled').length,1)
    assert.equal(saveResults.filter(r=>r.status==='rejected' && r.reason.code==='DRAFT_CONFLICT').length,1)
    const rival = await tx(c=>service.createRolePolicyDraft(c,verified,{draftId:crypto.randomUUID(),expectedActive:currentTuple}))
    const rivalSaved = await tx(c=>service.saveRolePolicyDraft(c,verified,rival.draftId,{expectedRevision:1,
      roleChanges:[{type:'reactivate',stableRoleId:'role-procurement'}],changes:[]}))
    const confirmations = await Promise.all([concurrent.draftId,rival.draftId].map(id=>tx(c=>service.previewRolePolicyDraft(c,id,2))))
    const applyResults = await Promise.allSettled(confirmations.map(p=>tx(c=>service.applyRolePolicy(c,verified,
      {requestId:crypto.randomUUID(),confirmation:p.confirmation,reason:'concurrent native'}))))
    assert.equal(applyResults.filter(r=>r.status==='fulfilled').length,1)
    assert.equal(applyResults.filter(r=>r.status==='rejected' && r.reason.code==='ACTIVE_CONFLICT').length,1)
    pass('concurrent-save-and-apply-cas-have-one-winner-with-no-partial-loser')

    const allDrafts = [], allPublications = []
    for (const [list,fn] of [[allDrafts,service.listRolePolicyDrafts],[allPublications,service.listRolePolicyPublications]]) {
      let cursor = null
      do { const page = await tx(c=>fn(c,1,cursor)); list.push(...page.items); cursor=page.nextCursor } while (cursor)
    }
    assert.equal(allDrafts.length,(await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.role_policy_drafts')).rows[0].n)
    assert.equal(new Set(allDrafts.map(d=>d.draftId)).size,allDrafts.length)
    assert.equal(allPublications.length,(await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.role_catalog_publications')).rows[0].n)
    pass('keyset-pagination-reads-complete-draft-and-publication-history')

    const currentActive = (await tx(c=>service.readRolePolicyWorkspace(c,null,verified))).active
    const invalid = await tx(c=>service.createRolePolicyDraft(c,verified,{draftId:crypto.randomUUID(),expectedActive:currentActive}))
    const invalidPreview = await tx(c=>service.previewRolePolicyDraft(c,invalid.draftId,invalid.revision))
    await admin.query('UPDATE platform_contract.task_owned_principal_auth_state SET auth_epoch=1 WHERE principal_id=$1',[account.principal_id])
    await rejects(()=>tx(c=>service.applyRolePolicy(c,verified,{requestId:crypto.randomUUID(),confirmation:invalidPreview.confirmation,reason:'stale epoch'})),'ROLE_POLICY_MANAGER_REQUIRED')
    await rejects(()=>pdmRuntime.query(`SELECT ai_pdm_core.role_policy_apply_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(),account.principal_id,sessionHash,manager.link.issuer,manager.link.subject,invalid.draftId,invalid.revision,currentActive.catalogVersion,currentActive.catalogSha256,'stale epoch']),'DEV123_MANAGER_REQUIRED')
    await admin.query('UPDATE platform_contract.task_owned_principal_auth_state SET auth_epoch=0 WHERE principal_id=$1',[account.principal_id])
    pass('service-and-direct-db-entry-reject-stale-canonical-auth-epoch')
    const eligibilityBefore = await activeGovernanceArtifact(admin)
    const changed = appendGovernanceVersion(eligibilityBefore.payload,'gov-native-manager-revoked')
    changed.version.policy.roleAssignments.find(a=>a.id==='assignment-dev058-manager-system-admin').status='revoked'
    const deniedBefore = await snapshot()
    await admin.query('BEGIN')
    await admin.query('SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE')
    const waiting = tx(c=>service.applyRolePolicy(c,verified,{requestId:crypto.randomUUID(),confirmation:invalidPreview.confirmation,reason:'revoked during wait'}))
      .then(value=>({value}),error=>({error}))
    let blocked = false
    for (let attempt=0;attempt<100;attempt++) {
      blocked = (await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='dev123-native-policy' AND wait_event_type='Lock'")).rows[0].n>0
      if (blocked) break
      await new Promise(resolve=>setTimeout(resolve,25))
    }
    assert.ok(blocked,'apply must actually wait on the OrgMaster owner fence')
    await admin.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    await writeGovernanceOwnerFixture(admin,changed.payload,eligibilityBefore.canonical_sha256,'native-revoke-during-wait')
    await admin.query('COMMIT')
    const denied = await waiting
    assert.equal(denied.error?.code,'ROLE_POLICY_MANAGER_REQUIRED')
    assert.deepEqual(await snapshot(),deniedBefore)
    pass('manager-revoked-during-real-lock-wait-denies-zero-effects')
    console.log(JSON.stringify({status:'PASS',nativeCases:passed.length,cases:passed,identityEvidence:'synthetic-local-only',production:false}))
  } finally { await client.close() }
})
