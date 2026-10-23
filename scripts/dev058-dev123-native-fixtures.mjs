import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
// Owner DML fixtures in disposable native PostgreSQL only; no real login or production evidence.
export async function activeGovernanceArtifact(client) {
  const result = await client.query(`SELECT artifact.batch_id::text AS batch_id, artifact.payload,
      trim(artifact.canonical_sha256) AS canonical_sha256
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id=authority.active_batch_id
    WHERE authority.singleton=true AND artifact.artifact_key='orgmaster-governance.v3.json'
      AND artifact.artifact_kind='governance'`);
  assert.equal(result.rowCount, 1, 'ACTIVE_GOVERNANCE_ARTIFACT_CARDINALITY');
  return result.rows[0];
}
export function appendGovernanceVersion(payload, id) {
  const next = structuredClone(payload);
  const active = next.publishedVersions.find(version => version.id === next.activePolicyVersionId);
  assert.ok(active, 'ACTIVE_GOVERNANCE_VERSION_MISSING');
  const versionNumber = Math.max(...next.publishedVersions.map(version => Number(version.versionNumber) || 0)) + 1;
  const version = { ...structuredClone(active), id, versionNumber, publishedAt:new Date().toISOString() };
  next.publishedVersions.push(version);
  next.activePolicyVersionId = id;
  return { payload:next, version };
}
function governanceChange(payload, expectedCanonicalSha256) {
  const bytes = Buffer.from(JSON.stringify(payload));
  const digest = sha256(bytes);
  return [{ artifactKey:'orgmaster-governance.v3.json', artifactKind:'governance',
    expectedCanonicalSha256, nextCanonicalSha256:digest, sourceSha256:digest,
    sourceBytes:bytes.length, payload }];
}
export async function writeGovernanceOwnerFixture(client,payload,expectedCanonicalSha256,label,managerIdentity=null) {
  const admission=await client.query(`SELECT singleton FROM orgmaster_core.managed_identity_admission_authority
    WHERE singleton=true FOR UPDATE`);
  assert.equal(admission.rowCount,1,'TASK_FIXTURE_ADMISSION_AUTHORITY_MISSING');
  const authority=await client.query(`SELECT active_batch_id::text AS active_batch_id,authority_version
    FROM orgmaster_core.persistence_authority WHERE singleton=true FOR UPDATE`);
  assert.equal(authority.rowCount,1,'TASK_FIXTURE_PERSISTENCE_AUTHORITY_MISSING');
  assert.ok(authority.rows[0].active_batch_id,'TASK_FIXTURE_PERSISTENCE_NOT_ACTIVE');
  const activeBatch=await client.query(`SELECT source_revision,media_count FROM orgmaster_core.persistence_batches
    WHERE id=$1::uuid AND status='active' FOR UPDATE`,[authority.rows[0].active_batch_id]);
  assert.equal(activeBatch.rowCount,1,'TASK_FIXTURE_ACTIVE_BATCH_MISSING');
  const oldGovernance=await client.query(`SELECT trim(canonical_sha256) AS canonical_sha256
    FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1::uuid
      AND artifact_key='orgmaster-governance.v3.json' AND artifact_kind='governance'`,[authority.rows[0].active_batch_id]);
  assert.equal(oldGovernance.rowCount,1,'TASK_FIXTURE_ACTIVE_GOVERNANCE_MISSING');
  assert.equal(oldGovernance.rows[0].canonical_sha256,expectedCanonicalSha256,'TASK_FIXTURE_GOVERNANCE_CAS_MISMATCH');

  if(managerIdentity) {
    const version=payload.publishedVersions.find(item=>item.id===payload.activePolicyVersionId);
    assert.ok(version,'TASK_FIXTURE_MANAGER_VERSION_MISSING');
    const identityLink=version.policy.identityLinks.find(item=>item.id===managerIdentity.id);
    const admissionRow=version.policy.principalAdmissions.find(item=>item.identityLinkId===managerIdentity.id);
    assert.ok(identityLink && admissionRow,'TASK_FIXTURE_MANAGER_TYPED_ADMISSION_MISSING');
    await client.query(`INSERT INTO orgmaster_core.principal_ownership_reservations(
        principal_id,employee_id,account_type,first_seen_at,source_revision)
      VALUES($1,$2,'human_privileged',$3::timestamptz,$4)
      ON CONFLICT(principal_id) DO NOTHING`,
      [identityLink.principalId,identityLink.employeeId,version.publishedAt,version.id]);
    await client.query(`INSERT INTO orgmaster_core.principal_identity_reservations(
        principal_issuer,principal_subject,employee_id,first_seen_at,source_kind,source_revision,principal_id)
      VALUES($1,$2,$3,$4::timestamptz,'legacy',$5,$6)
      ON CONFLICT(principal_issuer,principal_subject) DO NOTHING`,
      [identityLink.issuer,identityLink.subject,identityLink.employeeId,version.publishedAt,version.id,identityLink.principalId]);
  }

  const now=(await client.query('SELECT clock_timestamp() AS value')).rows[0].value;
  const newBatchId=crypto.randomUUID();
  const sourceRevision=sha256(Buffer.from(`DEV058 task-owned governance artifact fixture ${label} ${newBatchId}`));
  const serialized=JSON.stringify(payload);
  const digest=sha256(Buffer.from(serialized));
  const sourceBytes=Buffer.byteLength(serialized);
  await client.query(`INSERT INTO orgmaster_core.persistence_batches(
      id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,
      imported_at,verified_at,activated_at)
    VALUES($1::uuid,$2,'jenfu.orgmaster-persistence.v1',$3::jsonb,0,$4,0,'shadow',$5,$5,$5)`,
    [newBatchId,sourceRevision,JSON.stringify({contractVersion:'jenfu.orgmaster-persistence.v1',
      origin:'dev058-task-owned-owner-fixture',previousSourceRevision:activeBatch.rows[0].source_revision,
      changedArtifactKeys:['orgmaster-governance.v3.json']}),activeBatch.rows[0].media_count,now]);
  await client.query(`INSERT INTO orgmaster_core.persistence_artifacts(
      batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
    SELECT $1::uuid,artifact.artifact_key,artifact.artifact_kind,artifact.payload,artifact.source_sha256,
      artifact.canonical_sha256,artifact.source_bytes,$3
    FROM orgmaster_core.persistence_artifacts artifact WHERE artifact.batch_id=$2::uuid
      AND artifact.artifact_key<>'orgmaster-governance.v3.json'`,[newBatchId,authority.rows[0].active_batch_id,now]);
  await client.query(`INSERT INTO orgmaster_core.persistence_artifacts(
      batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
    VALUES($1::uuid,'orgmaster-governance.v3.json','governance',$2::jsonb,$3,$3,$4,$5)`,
    [newBatchId,serialized,digest,sourceBytes,now]);
  await client.query(`INSERT INTO orgmaster_core.persistence_media_inventory(batch_id,media_key,source_sha256,source_bytes)
    SELECT $1::uuid,media_key,source_sha256,source_bytes FROM orgmaster_core.persistence_media_inventory
    WHERE batch_id=$2::uuid`,[newBatchId,authority.rows[0].active_batch_id]);
  const counts=await client.query(`SELECT
      (SELECT count(*)::integer FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1::uuid) AS artifact_count,
      (SELECT COALESCE(sum(source_bytes),0)::bigint FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1::uuid) AS artifact_bytes,
      (SELECT count(*)::integer FROM orgmaster_core.persistence_media_inventory WHERE batch_id=$1::uuid) AS media_count,
      (SELECT COALESCE(sum(source_bytes),0)::bigint FROM orgmaster_core.persistence_media_inventory WHERE batch_id=$1::uuid) AS media_bytes`,[newBatchId]);
  const summary=counts.rows[0];
  await client.query(`UPDATE orgmaster_core.persistence_batches SET artifact_count=$2,media_count=$3,
      source_bytes=$4,status='active' WHERE id=$1::uuid`,
    [newBatchId,summary.artifact_count,summary.media_count,Number(summary.artifact_bytes)+Number(summary.media_bytes)]);
  await client.query(`UPDATE orgmaster_core.persistence_batches SET status='retired',retired_at=$2
    WHERE id=$1::uuid AND status='active'`,[authority.rows[0].active_batch_id,now]);
  await client.query(`UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1::uuid,
      authority_version=authority_version+1,updated_at=$2,updated_by='dev058-native-task-fixture',reason_code=$3
    WHERE singleton=true`,[newBatchId,now,`manager-fence-${label}`]);
  process.stdout.write(`FIXTURE OrgMaster owner-DML published governance=${label} batch=${newBatchId} sourceRevision=${sourceRevision}\n`);
}
export async function publishGovernance(client,payload,expectedCanonicalSha256,label,managerIdentity=null) {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE jenfu_orgmaster_migrator');
    await writeGovernanceOwnerFixture(client,payload,expectedCanonicalSha256,label,managerIdentity);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; }
}
export async function makeManagerEligible(client) {
  const before = await activeGovernanceArtifact(client);
  const appended = appendGovernanceVersion(before.payload, 'gov-dev058-manager-active');
  const link = { id:'identity-link-dev058-manager', employeeId:'employee-legacy',
    issuer:'issuer-dev058-manager', subject:'subject-dev058-manager',
    principalId:'principal-dev058-manager', status:'active', validFrom:'2026-01-01T00:00:00.000Z' };
  appended.version.policy.identityLinks.push(link);
  appended.version.policy.principalAdmissions.push({ identityLinkId:link.id,
    status:'active', accountType:'human_privileged' });
  if (!appended.version.policy.applicationRoles.some(role => role.id==='role-system-admin')) {
    appended.version.policy.applicationRoles.push({ id:'role-system-admin', applicationId:'ai-pdm', status:'active' });
  }
  appended.version.policy.roleAssignments.push({ id:'assignment-dev058-manager-system-admin',
    employeeId:'employee-legacy', applicationId:'ai-pdm', roleId:'role-system-admin',
    roleCodeSnapshot:'system_admin', roleNameSnapshot:'系統管理員',
    catalogVersion:'ai-pdm.role-catalog.2026-10-10.v7', scope:{kind:'global'},
    status:'active', validFrom:'2026-01-01T00:00:00.000Z', validTo:'2099-01-01T00:00:00.000Z',
    effectState:'not-synchronized', basis:'manual', subjectKind:'principal',
    targetPrincipalId:'principal-dev058-manager', sources:[],
    metadata:{sponsorEmployeeId:null,reviewDueAt:null},
    createdByPrincipalId:'bootstrap-fixture', createdReason:'task-owned native manager fence fixture' });
  await publishGovernance(client, appended.payload, before.canonical_sha256, 'manager-bootstrap',link);
  const typed = await client.query(`SELECT principal_issuer,principal_subject,principal_id,employee_id,
      account_type,mapping_version::text AS mapping_version,published_at
    FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE principal_id='principal-dev058-manager'`);
  assert.equal(typed.rowCount,1,'MANAGER_TYPED_PRINCIPAL_FIXTURE_MISSING');
  assert.deepEqual(typed.rows[0], {
    principal_issuer:link.issuer, principal_subject:link.subject, principal_id:link.principalId,
    employee_id:link.employeeId, account_type:'human_privileged',
    mapping_version:typed.rows[0].mapping_version, published_at:typed.rows[0].published_at
  });
  const reservations = await client.query(`SELECT pair.employee_id,pair.source_kind,pair.principal_id,
      owner.employee_id AS owner_employee_id,owner.account_type
    FROM orgmaster_core.principal_identity_reservations pair
    JOIN orgmaster_core.principal_ownership_reservations owner USING(principal_id)
    WHERE pair.principal_issuer=$1 AND pair.principal_subject=$2`,[link.issuer,link.subject]);
  assert.deepEqual(reservations.rows,[{employee_id:link.employeeId,source_kind:'legacy',
    principal_id:link.principalId,owner_employee_id:link.employeeId,account_type:'human_privileged'}],
    'MANAGER_TYPED_RESERVATION_FIXTURE_MISSING');
  process.stdout.write('PASS DEV058-SQL-MANAGER-TYPED-RESERVATIONS source=task-owned-owner-DML\n');
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator');
    await client.query(`INSERT INTO ai_pdm_core.companies(id,company_code,company_kind,display_name)
      VALUES('company-jenfu','DEV058-TASK-FIXTURE','business','task-owned DEV058 manager fixture')
      ON CONFLICT(id) DO NOTHING`);
    const company=await client.query(`SELECT id,company_code FROM ai_pdm_core.companies WHERE id='company-jenfu'`);
    assert.deepEqual(company.rows,[{id:'company-jenfu',company_code:'DEV058-TASK-FIXTURE'}],
      'TASK_FIXTURE_COMPANY_READBACK_MISMATCH');
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; }
  process.stdout.write('FIXTURE PDM owner-DML company=company-jenfu scope=task-owned-scratch-only\n');
  const accountClient = client;
  await accountClient.query('BEGIN');
  let account;
  try {
    await accountClient.query('SET LOCAL ROLE jenfu_ai_pdm_runtime');
    account = await accountClient.query(`SELECT ai_pdm_core.ensure_authorized_first_login_account_v1(
      $1,$2,$3,$4,$5,$6::bigint,$7::timestamptz,$8::text) AS account`,
      [link.issuer,link.subject,link.principalId,link.employeeId,'human_privileged',
        typed.rows[0].mapping_version,typed.rows[0].published_at,'dev058-manager@example.test']);
    await accountClient.query('COMMIT');
  } catch(error) { await accountClient.query('ROLLBACK').catch(()=>undefined); throw error; }
  const sessionHash = sha256(Buffer.from('DEV058 native manager session fixture v1'));
  await client.query(`INSERT INTO ai_pdm_core.principal_session_records(
      principal_id,session_id_hash,session_schema_version,principal_auth_epoch,lifecycle_version,
      profile_version,authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
    VALUES($1,$2,2,0,1,1,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour','aal2',$3)`,
    [link.principalId,sessionHash,'a'.repeat(64)]);
  const eligibility = await client.query(`SELECT orgmaster_contract.ai_pdm_role_policy_manager_eligible_v1(
    $1,$2,$3,$4) AS eligible`,[link.principalId,link.employeeId,link.issuer,link.subject]);
  assert.deepEqual(eligibility.rows,[{eligible:true}],'MANAGER_BASELINE_NOT_ELIGIBLE');
  process.stdout.write(`FIXTURE PDM firstLogin=${JSON.stringify(account.rows[0].account)} principal=${link.principalId} session=synthetic-task-fixture assurance=aal2\n`);
  process.stdout.write('PASS DEV058-SQL-MANAGER-ELIGIBLE baseline=true grant=direct-global role-system-admin identity=human_privileged\n');
  return {link,sessionHash};
}
