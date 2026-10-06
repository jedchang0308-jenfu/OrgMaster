
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Task-owned PostgreSQL only: native catalog publication DDL and migrations, never JSON catalog views. */
export async function prepareNativeAiPdmCatalog(database, consumerRoot, verifyBaselineCatalog) {
 const read = p => fs.readFileSync(path.join(consumerRoot,p),'utf8')
 const catalog = JSON.parse(read('config/access-control/jenfu-role-catalog.v1.json'))
 // The DEV-057 placeholder has the native select-list, so applied 055 is executed byte-for-byte.
 const ddl = read('db/postgres/055_jenfu_role_catalog_publication.sql')
 await database.query(ddl)
 // Exact catalog-only prerequisites of applied 062; not a full business-schema rehearsal.
 await database.query(`CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
   ALTER SCHEMA ai_pdm_contract OWNER TO jenfu_ai_pdm_migrator;
   ALTER TABLE ai_pdm_contract.role_catalog_entries SET SCHEMA ai_pdm_core;
   ALTER TABLE ai_pdm_contract.active_role_catalog SET SCHEMA ai_pdm_core;
   ALTER TABLE ai_pdm_contract.role_catalog_publications SET SCHEMA ai_pdm_core;
   ALTER TABLE ai_pdm_core.role_catalog_entries OWNER TO jenfu_ai_pdm_migrator;
   ALTER TABLE ai_pdm_core.active_role_catalog OWNER TO jenfu_ai_pdm_migrator;
   ALTER TABLE ai_pdm_core.role_catalog_publications OWNER TO jenfu_ai_pdm_migrator;
   ALTER VIEW ai_pdm_contract.v_application_role_catalog_v1 OWNER TO jenfu_ai_pdm_migrator;
   GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator,jenfu_ai_pdm_runtime;
   GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO jenfu_orgmaster_migrator,jenfu_ai_pdm_runtime;`)
 await database.query('INSERT INTO ai_pdm_core.role_catalog_publications(catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by) VALUES($1,$2,$3,$4,$5,\'active\',\'task-owned-v3-baseline\')',[catalog.catalogVersion,catalog.contractVersion,catalog.applicationId,catalog.publishedAt,catalog.catalogSha256])
 for(const [order,r] of catalog.roles.entries())await database.query('INSERT INTO ai_pdm_core.role_catalog_entries(catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)',[catalog.catalogVersion,order,r.stableRoleId,r.roleCode,r.displayName,r.assignable,r.risk,r.subjectKind,r.recommendationAllowed,r.delegationAllowed,JSON.stringify(r.allowedScopeKinds),r.assignmentTier,JSON.stringify(r.permissions),JSON.stringify(r.metadata??null),r.roleDefinitionHash])
 await database.query('INSERT INTO ai_pdm_core.active_role_catalog(application_id,catalog_version,activated_at,activated_by,activation_reason) VALUES($1,$2,now(),\'task-owned-fixture\',\'native publication baseline\')',[catalog.applicationId,catalog.catalogVersion])
 for(const p of ['db/postgres/066_dev121_principal_role_catalog_v4.sql','db/postgres/070_dev121_principal_role_catalog_v5.sql'])await database.query(read(p))
 const v5=JSON.parse(read('config/access-control/jenfu-role-catalog.v5.json'))
 if (verifyBaselineCatalog) await verifyBaselineCatalog(v5.catalogVersion)
 const v6=JSON.parse(read('config/access-control/jenfu-role-catalog.v6.json'))
 const sql=read('db/postgres/080_dev121_principal_role_catalog_v6.sql')
 const migrationPaths = ['055_jenfu_role_catalog_publication.sql', '066_dev121_principal_role_catalog_v4.sql', '070_dev121_principal_role_catalog_v5.sql', '080_dev121_principal_role_catalog_v6.sql']
 const evidence = { target: 'task-owned-disposable-postgresql', catalogPrerequisiteScope: '055 + catalog-only ownership changes from 062', migrationHashes: Object.fromEntries(migrationPaths.map(name => [name,createHash('sha256').update(read('db/postgres/'+name)).digest('hex')])), rejectionCases: [] }
 const snapshot = async () => { const rows={}; for(const name of ['role_catalog_publications','role_catalog_entries','active_role_catalog'])rows[name]=(await database.query('SELECT to_jsonb(t) AS row FROM ai_pdm_core.'+name+' t ORDER BY to_jsonb(t)::text')).rows;return rows }
 const entriesBefore = (await database.query('SELECT * FROM ai_pdm_core.role_catalog_entries ORDER BY catalog_version,display_order')).rows
 const reject = async (id,change,values,error,restore,restoreValues=values) => {
   await database.query(change,values)
   const before = await snapshot()
   try {
     await assert.rejects(database.query(sql),error)
     await database.query('ROLLBACK')
     assert.deepEqual(await snapshot(),before,'failed publication must leave all three catalog tables unchanged: '+id)
     evidence.rejectionCases.push({ id, rejected: true, atomicRollback: true })
   } finally { await database.query('ROLLBACK'); await database.query(restore,restoreValues) }
 }
 assert.equal((await database.query('SELECT count(*)::int AS n FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1',[v6.catalogVersion])).rows[0].n,0)
 await reject('v5-hash','UPDATE ai_pdm_core.role_catalog_publications SET catalog_sha256=$2 WHERE catalog_version=$1',[v5.catalogVersion,'0'.repeat(64)],/DEV121_CATALOG_V5_BASELINE_MISMATCH/,'UPDATE ai_pdm_core.role_catalog_publications SET catalog_sha256=$2 WHERE catalog_version=$1',[v5.catalogVersion,v5.catalogSha256])
 const rd5=v5.roles.find(r=>r.stableRoleId==='role-rd')
 await reject('v5-permissions',"UPDATE ai_pdm_core.role_catalog_entries SET permissions='[]'::jsonb WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v5.catalogVersion],/DEV121_CATALOG_V5_BASELINE_MISMATCH/,"UPDATE ai_pdm_core.role_catalog_entries SET permissions=$2::jsonb WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v5.catalogVersion,JSON.stringify(rd5.permissions)])
 await reject('v5-pointer','UPDATE ai_pdm_core.active_role_catalog SET catalog_version=$2 WHERE application_id=$1',['ai-pdm',catalog.catalogVersion],/DEV121_CATALOG_STATE_MISMATCH/,'UPDATE ai_pdm_core.active_role_catalog SET catalog_version=$2 WHERE application_id=$1',['ai-pdm',v5.catalogVersion])
 await database.query(sql)
 const first = await snapshot()
 await database.query(sql)
 await database.query(sql)
 assert.deepEqual(await snapshot(),first,'two replays must not duplicate or rewrite publication, entries or pointer')
 const result=await database.query('SELECT DISTINCT catalog_version,catalog_sha256 FROM ai_pdm_contract.v_application_role_catalog_v1')
 assert.deepEqual(result.rows,[{catalog_version:v6.catalogVersion,catalog_sha256:v6.catalogSha256}])
 const history=await database.query('SELECT catalog_version,status FROM ai_pdm_core.role_catalog_publications ORDER BY catalog_version')
 assert.deepEqual(history.rows.map(r=>r.status),['retired','retired','retired','active'])
 assert.deepEqual((await database.query('SELECT * FROM ai_pdm_core.role_catalog_entries WHERE catalog_version<>$1 ORDER BY catalog_version,display_order',[v6.catalogVersion])).rows,entriesBefore,'all pre-v6 role entries remain unchanged')
 await reject('v6-published-at',"UPDATE ai_pdm_core.role_catalog_publications SET published_at=published_at+interval '1 second' WHERE catalog_version=$1",[v6.catalogVersion],/DEV121_CATALOG_STATE_MISMATCH/,'UPDATE ai_pdm_core.role_catalog_publications SET published_at=$2 WHERE catalog_version=$1',[v6.catalogVersion,v6.publishedAt])
 const rd6=v6.roles.find(r=>r.stableRoleId==='role-rd')
 await reject('v6-role-name',"UPDATE ai_pdm_core.role_catalog_entries SET display_name='tampered' WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v6.catalogVersion],/DEV121_CATALOG_V6_READBACK_FAILED/,"UPDATE ai_pdm_core.role_catalog_entries SET display_name=$2 WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v6.catalogVersion,rd6.displayName])
 await reject('v6-permissions',"UPDATE ai_pdm_core.role_catalog_entries SET permissions='[]'::jsonb WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v6.catalogVersion],/DEV121_CATALOG_V6_READBACK_FAILED/,"UPDATE ai_pdm_core.role_catalog_entries SET permissions=$2::jsonb WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v6.catalogVersion,JSON.stringify(rd6.permissions)])
 await reject('v6-role-order',"UPDATE ai_pdm_core.role_catalog_entries SET display_order=999 WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v6.catalogVersion],/DEV121_CATALOG_V6_READBACK_FAILED/,"UPDATE ai_pdm_core.role_catalog_entries SET display_order=0 WHERE catalog_version=$1 AND stable_role_id='role-rd'",[v6.catalogVersion])
 assert.deepEqual(await snapshot(),first,'tamper probes restore only disposable fixture state')
 return { catalog: v6, evidence: { ...evidence, firstApply: true, replayCount: 2, immutableHistoricalEntries: entriesBefore.length, activeRoleCount: 9, catalogVersion: v6.catalogVersion, catalogSha256: v6.catalogSha256 } }
}
