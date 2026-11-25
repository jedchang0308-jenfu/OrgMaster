import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {unwrapMigrationTransaction} from './dev040-orgmaster-independent-release.mjs'
import {buildFmsProjectionCurrentForward,FMS_PROJECTION_CURRENT} from './dev070-fms-projection-current-migration.mjs'

// PostgreSQL component regression using the actual 044 view/function and 050
// rename/wrapper SQL. Only their publication/account inputs are ABI fixtures;
// this is not provider, identity enrollment or cross-owner acceptance evidence.
export async function verifyFmsProjectionCurrent({admin,root}) {
 const target=(await admin.query("SELECT current_database() database,host(inet_server_addr()) host,current_setting('server_version_num')::int version")).rows[0]
 assert.match(target.database,/^(?:dev014_[a-f0-9]{20}|jenfu_local_dev070_ci_\d+_\d+_073)$/u)
 assert.equal(target.host,'127.0.0.1');assert.ok(target.version>=170000&&target.version<190000)
 for(const role of ['jenfu_orgmaster_migrator','jenfu_orgmaster_runtime','jenfu_platform_runtime']){
  if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)await admin.query('CREATE ROLE '+role+' NOLOGIN')
 }
 await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator; CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator; GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_platform_runtime')
 const source044=await readFile(path.join(root,'db/migrations/044_dev070_administration_projection_v1.sql'),'utf8')
 const source050=await readFile(path.join(root,'db/migrations/050_dev070_administrative_definitions_v2.sql'),'utf8')
 const source045=await readFile(path.join(root,'db/migrations/045_dev070_administration_commands_v1.sql'),'utf8')
 const section=(source,start,end)=>{const begin=source.indexOf(start),finish=source.indexOf(end,begin+start.length);assert.ok(begin>=0&&finish>begin);return source.slice(begin,finish)}
 const fn=(source,name,terminator='$fn$;')=>{const begin=source.indexOf('CREATE FUNCTION orgmaster_core.'+name);assert.ok(begin>=0);const end=source.indexOf(terminator,begin);assert.ok(end>begin);return source.slice(begin,end+terminator.length)}
 await admin.query('SET ROLE jenfu_orgmaster_migrator')
 await admin.query(`CREATE TABLE orgmaster_core.fixture_accounts(principal_id text,employee_id text,employee_status text,account_type text,principal_issuer text,principal_subject text);
 CREATE VIEW orgmaster_contract.v_active_principal_accounts_v1 AS SELECT * FROM orgmaster_core.fixture_accounts;
 CREATE TABLE orgmaster_core.v_current_workspace_employees_v1(employee_id text,employee_status text);
 CREATE TABLE orgmaster_core.persistence_authority(active_batch_id text,singleton boolean);
 CREATE TABLE orgmaster_core.persistence_artifacts(batch_id text,artifact_key text,payload jsonb);
 CREATE FUNCTION orgmaster_core.read_administration_publication_v1() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT payload->''publishedVersions''->0 FROM orgmaster_core.persistence_artifacts';`)
 await admin.query(fn(source045,'administration_canonical_json_v1(value jsonb)'))
 await admin.query(fn(source045,'administration_sha256_v1(value jsonb)'))
 await admin.query(fn(source044,'administrative_catalog_current_v1(p_application text,p_binding jsonb)'))
 await admin.query(section(source044,'CREATE VIEW orgmaster_core.v_effective_administrative_grants_v1','CREATE VIEW orgmaster_contract.v_platform_administrator_grants_v1'))
 await admin.query('REVOKE ALL ON orgmaster_core.v_effective_administrative_grants_v1 FROM PUBLIC')
 await admin.query(section(source044,'CREATE VIEW orgmaster_contract.v_application_administrator_grants_v1','CREATE FUNCTION orgmaster_contract.read_administration_state_v1'))
 await admin.query("CREATE VIEW orgmaster_core.v_portal_visibility_before_administration_v1 AS SELECT NULL::text application_id,NULL::text principal_issuer,NULL::text principal_subject,NULL::bigint assignment_version WHERE false")
 await admin.query(section(source044,'CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1','DO $session_projection$'))
 // Preserve 044's real SECURITY DEFINER narrow-reader composition, not just
 // its initial view definitions. Only the two relevant reader rows are used.
 const narrow=section(source044,' definition:=pg_get_viewdef',' END LOOP;')
 await admin.query(`DO $fixture_readers$ DECLARE item record;definition text;columns text;BEGIN
 FOR item IN SELECT * FROM(VALUES
 ('v_application_administrator_grants_v1','read_application_administrator_grants_v1','jenfu_orgmaster_runtime'),
 ('v_portal_app_visibility_v1','read_portal_app_visibility_administration_v1','jenfu_platform_runtime')) readers(view_name,function_name,readers)
 LOOP ${narrow} END LOOP;END; $fixture_readers$;`)
 await admin.query('GRANT SELECT ON orgmaster_contract.v_portal_app_visibility_v1 TO jenfu_platform_runtime')
 // Install exactly the source 050 definition+rename+compatibility prefix.
 await admin.query(section(source050,'CREATE FUNCTION orgmaster_core.administrative_definition_current_v2','DO $writer_definition$'))
 await admin.query('RESET ROLE')
 const bindings=JSON.parse(await readFile(path.join(root,'contracts/orgmaster-administration/v2/administrative-definitions.json'),'utf8')).definitions
 const binding=application=>{const d=bindings.find(d=>d.applicationId===application);return {catalogVersion:d.definitionVersion,stableRoleId:d.profileId,contentSha256:d.definitionSha256,roleDefinitionHash:d.definitionSha256}}
 const valid={id:'00000000-0000-4000-8000-000000000073',principalId:'p',employeeId:'e',roleCode:'application_system_admin',applicationId:'financial-management-system',status:'active',subjectKind:'principal',basis:'manual',scope:{kind:'global'},validFrom:'2000-01-01T00:00:00.000Z',validTo:null,catalogBinding:binding('financial-management-system')}
 const legacy={catalogVersion:'legacy-fms',stableRoleId:'role-system-admin',contentSha256:'b'.repeat(64),roleDefinitionHash:'2a8ab5c084e00f9cd1f9a87e193d1269ea85c80eb66fba78c1b6ab2ab467ce11'}
 const catalog={applicationId:'financial-management-system',validationState:'valid',catalogVersion:legacy.catalogVersion,contentSha256:legacy.contentSha256,roles:[{stableRoleId:legacy.stableRoleId,status:'active',roleDefinitionHash:legacy.roleDefinitionHash}]}
 const publish=async(grant=valid)=>{const publication={id:'same-published-policy',versionNumber:3,publishedAt:'2000-01-01T00:00:00.000Z',policy:{administration:{version:3,grants:[grant]}},externalRoleCatalogs:[catalog]};await admin.query('DELETE FROM orgmaster_core.persistence_artifacts');await admin.query("INSERT INTO orgmaster_core.persistence_artifacts VALUES('batch','orgmaster-governance.v3.json',$1)",[JSON.stringify({publishedVersions:[publication]})])}
 await admin.query("INSERT INTO orgmaster_core.fixture_accounts VALUES('p','e','active','human_personal','issuer','subject');INSERT INTO orgmaster_core.v_current_workspace_employees_v1 VALUES('e','active');INSERT INTO orgmaster_core.persistence_authority VALUES('batch',true)")
 await publish()
 const count=async()=>(await admin.query("SELECT count(*)::int count FROM orgmaster_contract.v_portal_app_visibility_v1 WHERE principal_issuer='issuer' AND principal_subject='subject' AND application_id='financial-management-system'")).rows[0].count
 const metadata=async()=>(await admin.query("SELECT c.oid,c.relowner,c.relacl::text,c.reloptions,ARRAY(SELECT a.attname||':'||format_type(a.atttypid,a.atttypmod) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) shape FROM pg_class c WHERE c.oid='orgmaster_core.v_effective_administrative_grants_v1'::regclass")).rows[0]
 const dependencies=async()=>(await admin.query("SELECT DISTINCT p.proname FROM pg_rewrite r JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid AND d.refclassid='pg_proc'::regclass JOIN pg_proc p ON p.oid=d.refobjid WHERE r.ev_class='orgmaster_core.v_effective_administrative_grants_v1'::regclass ORDER BY 1")).rows.map(r=>r.proname)
 const before=await metadata(),oldDeps=await dependencies();assert.ok(oldDeps.includes('administrative_catalog_current_legacy_v1'));assert.ok(!oldDeps.includes('administrative_catalog_current_v1'))
 assert.equal(await count(),0,'044 -> 050 retains the old OID and denies the valid fixed FMS definition')
 const bytes=await readFile(path.join(root,FMS_PROJECTION_CURRENT.path)),profile=JSON.parse(await readFile(path.join(root,'config/release/dev040-orgmaster-independent-production-v3.json'),'utf8'))
 const bundle=buildFmsProjectionCurrentForward({predecessorEntries:profile.migrations.entries.slice(0,68),sourceRevision:'a'.repeat(40),sqlBytes:bytes})
 await admin.query('BEGIN');await admin.query(bundle.entry.sql);await admin.query('COMMIT')
 assert.deepEqual(await metadata(),before)
 const newDeps=await dependencies();assert.ok(newDeps.includes('administrative_catalog_current_v1'));assert.ok(newDeps.includes('administrative_catalog_current_legacy_v1'))
 assert.equal(await count(),1,'The same existing publication becomes visible without another grant or publication')
 await admin.query('SET ROLE jenfu_platform_runtime');assert.equal(await count(),1);await admin.query('RESET ROLE')
 const cases=['old-OID-negative','same-publication-positive','native-dependencies-current-and-legacy','same-OID-shape-owner-ACL-security-barrier','runtime-Portal-reader']
 for(const [name,overrides] of [['expired',{validTo:'2001-01-01T00:00:00.000Z'}],['future',{validFrom:'2099-01-01T00:00:00.000Z'}],['inactive',{status:'revoked'}],['employee-subject',{subjectKind:'employee'}],['inherited',{basis:'inherited'}],['workspace-scope',{scope:{kind:'workspace'}}],['wrong-principal',{principalId:'other'}],['wrong-employee',{employeeId:'other'}],['wrong-binding',{catalogBinding:{...valid.catalogBinding,contentSha256:'0'.repeat(64)}}]]){
  await publish({...valid,...overrides});assert.equal(await count(),0,name);cases.push(name)
 }
 await publish({...valid,catalogBinding:legacy});assert.equal(await count(),1,'Existing FMS legacy catalog remains accepted');cases.push('FMS-legacy-compatibility')
 for(const type of ['human_personal','human_privileged']){await publish();await admin.query('UPDATE orgmaster_core.fixture_accounts SET account_type=$1',[type]);assert.equal(await count(),1);cases.push(type)}
 for(const type of ['service','legacy_shared']){await admin.query('UPDATE orgmaster_core.fixture_accounts SET account_type=$1',[type]);assert.equal(await count(),0);cases.push(type+'-denied')}
 await admin.query("UPDATE orgmaster_core.fixture_accounts SET account_type='human_personal';INSERT INTO orgmaster_core.fixture_accounts VALUES('p','e','active','human_privileged','issuer2','subject2')");assert.equal(await count(),0);cases.push('ambiguous-account-type-denied')
 await admin.query("DELETE FROM orgmaster_core.fixture_accounts WHERE principal_issuer='issuer2';UPDATE orgmaster_core.v_current_workspace_employees_v1 SET employee_status='inactive'");assert.equal(await count(),0);cases.push('inactive-workspace-employee-denied')
 await admin.query("UPDATE orgmaster_core.v_current_workspace_employees_v1 SET employee_status='active'")
 for(const app of ['orgmaster','ai-pdm']){await publish({...valid,applicationId:app,catalogBinding:binding(app)});assert.equal((await admin.query('SELECT count(*)::int count FROM orgmaster_core.v_effective_administrative_grants_v1')).rows[0].count,0);cases.push(app+'-unchanged-legacy-decision')}
 await publish({...valid,roleCode:'platform_super_admin',applicationId:null,scope:{kind:'platform'},catalogBinding:null});assert.equal((await admin.query('SELECT count(*)::int count FROM orgmaster_core.v_effective_administrative_grants_v1')).rows[0].count,1);cases.push('root-branch-unchanged')
 return {scope:'DEV070_FMS_ADMINISTRATIVE_PROJECTION_073_POSTGRES',status:'PASS',cases,claimsOfProviderOrCrossOwnerAcceptance:false}
}
