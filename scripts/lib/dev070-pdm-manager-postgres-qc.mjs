import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const signature = 'orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text)'
const beforePath = 'db/migrations/044_dev070_administration_projection_v1.sql'
const afterPath = 'db/migrations/049_dev070_scoped_pdm_role_policy_manager.sql'

/** Actual 044/049 SQL; the shared account and grant projections are explicit
 * ABI fixtures. Run only inside the existing verified disposable CI service. */
export async function verifyPdmManagerEligibility({ admin, owner, root }) {
  const [beforeSql, afterSql] = await Promise.all([beforePath, afterPath]
    .map(filename => readFile(path.join(root, filename), 'utf8')))
  const start = beforeSql.indexOf('CREATE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(')
  const end = beforeSql.indexOf('$fn$;', start)
  assert.ok(start >= 0 && end > start)
  await owner.query(`
    CREATE TABLE orgmaster_core.dev070_qc_accounts(
      principal_id text, employee_id text, principal_issuer text, principal_subject text,
      employee_status text, account_type text);
    CREATE TABLE orgmaster_core.dev070_qc_grants(
      principal_id text, employee_id text, grant_kind text, delegation_id text,
      subject_kind text, target_principal_id text, scope_kind text,
      stable_role_id text, source_grant_id text, role_code text);
    CREATE VIEW orgmaster_contract.v_active_principal_accounts_v1 AS SELECT * FROM orgmaster_core.dev070_qc_accounts;
    CREATE VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 AS SELECT * FROM orgmaster_core.dev070_qc_grants;
    CREATE FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(p text,e text)
      RETURNS SETOF orgmaster_core.dev070_qc_grants LANGUAGE sql STABLE SET search_path=pg_catalog
      AS $$ SELECT * FROM orgmaster_core.dev070_qc_grants WHERE principal_id=p AND employee_id=e $$;
    GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_runtime,jenfu_ai_pdm_migrator;
  `)
  await owner.query(beforeSql.slice(start, end + '$fn$;'.length))
  await owner.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION ${signature} TO jenfu_ai_pdm_runtime,jenfu_ai_pdm_migrator`)
  const definition = async () => (await admin.query(`SELECT proowner,proacl::text,provolatile,prosecdef,proconfig,prorettype,
    pg_get_function_identity_arguments(oid) args FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows
  const principal = 'principal-qc', employee = 'employee-qc', issuer = 'https://fixture.invalid', subject = 'subject-qc'
  const direct = [principal, employee, 'direct', null, 'principal', principal, 'global',
    'role-application-system-admin', 'administrative-grant-qc', 'application_system_admin']
  const legacy = [...direct.slice(0, 7), 'role-system-admin', null, 'system_admin']
  const tests = [
    { id: 'application-admin', grant: direct, expected: true },
    { id: 'privileged-legacy', grant: legacy, account: 'human_privileged', expected: true },
    { id: 'personal-legacy', grant: legacy, expected: false },
    { id: 'root-without-app-grant', expected: false },
    { id: 'inactive-employee', grant: direct, status: 'inactive', expected: false },
    { id: 'not-human', grant: direct, account: 'service', expected: false },
    { id: 'other-provider-subject', grant: direct, subject: 'different', expected: false },
    { id: 'other-employee', grant: direct, employee: 'different', expected: false },
    { id: 'inherited-grant', grant: [...direct.slice(0, 2), 'delegated', 'delegate-qc', ...direct.slice(4)], expected: false },
    { id: 'different-scope', grant: [...direct.slice(0, 6), 'company', ...direct.slice(7)], expected: false },
    { id: 'missing-administration-grant', grant: [...direct.slice(0, 8), null, direct[9]], expected: false },
  ]
  const observe = async test => {
    await owner.query('TRUNCATE orgmaster_core.dev070_qc_accounts,orgmaster_core.dev070_qc_grants')
    await owner.query('INSERT INTO orgmaster_core.dev070_qc_accounts VALUES ($1,$2,$3,$4,$5,$6)',
      [principal, employee, issuer, subject, test.status ?? 'active', test.account ?? 'human_personal'])
    if (test.grant) await owner.query('INSERT INTO orgmaster_core.dev070_qc_grants VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', test.grant)
    await admin.query('BEGIN READ ONLY')
    try {
      await admin.query("SET LOCAL ROLE jenfu_ai_pdm_runtime; SET LOCAL statement_timeout='5s'")
      const { rows } = await admin.query('SELECT orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2($1,$2,$3,$4) eligible',
        [principal, test.employee ?? employee, issuer, test.subject ?? subject])
      assert.deepEqual(rows, [{ eligible: test.expected }], test.id)
    } finally { await admin.query('ROLLBACK') }
  }
  const original = await definition()
  for (const test of tests) await observe(test)
  await admin.query(afterSql)
  assert.deepEqual(await definition(), original, '049 must preserve eligibility function metadata and ACL')
  // The replacement must remain usable without the old broad lookup.
  await owner.query('DROP VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v5')
  for (const test of tests) await observe(test)
  return { scope: 'DEV070_049_ACTUAL_SQL_WITH_PROJECTION_ABI_FIXTURES', status: 'PASS',
    postgres: 18, cases: tests.length, observations: tests.length * 2, metadataPreserved: true, broadViewRequiredAfter: false }
}

/** Execute the complete 047/048/049 migrations in a separate CI-owned database.
 * Only prerequisite storage and sibling catalog projections are fixtures. */
export async function verifyPdmManagerWithScopedReaders({ admin, owner, root, database }) {
  assert.match(database, /^jenfu_local_dev070_ci_\d{1,20}_\d{1,4}_049$/u)
  assert.deepEqual((await admin.query('SELECT current_database() AS database')).rows, [{ database }])
  assert.deepEqual((await owner.query('SELECT current_database() AS database,current_user AS owner')).rows,
    [{ database, owner: 'jenfu_orgmaster_migrator' }])
  const filenames = [
    beforePath, 'db/migrations/045_dev070_administration_commands_v1.sql',
    'db/migrations/047_dev070_scoped_ai_pdm_principal_readers.sql',
    'db/migrations/048_dev070_governance_scalar_projection.sql', afterPath,
  ]
  const profile = JSON.parse(await readFile(path.join(root, 'config/release/dev040-orgmaster-independent-production-v3.json'), 'utf8'))
  const [sql044, sql045, sql047, sql048, sql049] = await Promise.all(filenames.map(async filename => {
    const bytes = await readFile(path.join(root, filename))
    assert.equal(createHash('sha256').update(bytes).digest('hex'),
      profile.migrations.entries.find(entry => entry.path === filename).sourceSha256, filename)
    return bytes.toString('utf8')
  }))
  const fn = (sql, prefix, ending = '$fn$;') => {
    const start = sql.indexOf(prefix), end = sql.indexOf(ending, start)
    assert.ok(start >= 0 && end > start && sql.indexOf(prefix, start + 1) < 0, prefix)
    return sql.slice(start, end + ending.length)
  }
  const broad = fn(sql047, 'CREATE OR REPLACE FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5()', '$reader$;')
  const columns = broad.match(/RETURNS TABLE\(([\s\S]+?)\)\nLANGUAGE sql/u)[1].split(',').map(column => {
    const [name, type] = column.trim().split(/\s+/u)
    assert.match(name, /^[a-z_][a-z0-9_]*$/u)
    assert.ok(['text', 'bigint', 'timestamptz'].includes(type))
    return 'NULL::' + type + ' AS ' + name
  })
  await admin.query(`
    CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA ai_pdm_contract;
    GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator;
    CREATE VIEW ai_pdm_contract.v_application_role_catalog_v3 AS SELECT
      'role-application-system-admin'::text stable_role_id,'application_system_admin'::text role_code,
      repeat('b',64) role_definition_hash,'active'::text role_status,'principal'::text subject_kind,false assignable;
    CREATE VIEW ai_pdm_contract.v_role_policy_publications_v1 AS SELECT
      'catalog-fixture'::text catalog_version,repeat('a',64) catalog_sha256,
      'role-application-system-admin'::text stable_role_id,repeat('b',64) role_definition_hash;
    CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS SELECT
      'ai-pdm'::text application_id,'role-system-admin'::text stable_role_id,'system_admin'::text role_code,
      'principal'::text subject_kind,true assignable,false delegation_allowed,'{"global":true}'::jsonb allowed_scope_kinds;
    GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1,ai_pdm_contract.v_application_role_catalog_v3,
      ai_pdm_contract.v_role_policy_publications_v1 TO jenfu_orgmaster_migrator;
  `)
  await owner.query(`
    CREATE TABLE orgmaster_core.persistence_batches(id text PRIMARY KEY,status text);
    CREATE TABLE orgmaster_core.persistence_authority(singleton boolean PRIMARY KEY,active_batch_id text);
    CREATE TABLE orgmaster_core.persistence_artifacts(batch_id text,artifact_key text PRIMARY KEY,artifact_kind text,payload jsonb,canonical_sha256 text);
    CREATE TABLE orgmaster_core.fixture_employees(employee_id text PRIMARY KEY,employee_status text);
    CREATE VIEW orgmaster_core.v_current_workspace_employees_v1 AS SELECT * FROM orgmaster_core.fixture_employees;
    CREATE TABLE orgmaster_core.managed_daily_identities(identity_record_id text,employee_id text,principal_id text,
      auth_issuer text,auth_subject text,link_state text,admission_revision bigint,admission_changed_at timestamptz);
    CREATE TABLE orgmaster_core.managed_identity_admission_authority(singleton boolean,admission_enabled boolean);
    CREATE TABLE orgmaster_core.managed_identity_observations(identity_record_id text,directory_state text);
    CREATE TABLE orgmaster_core.managed_identity_lifecycle_outbox(employee_id text,status text);
    CREATE TABLE orgmaster_core.principal_lifecycle_delivery_v2(event_id uuid,status text);
    CREATE TABLE orgmaster_core.fixture_lifecycle_targets(event_id text,principal_id text);
    CREATE VIEW orgmaster_contract.v_principal_lifecycle_targets_v2 AS SELECT * FROM orgmaster_core.fixture_lifecycle_targets;
    CREATE TABLE orgmaster_core.principal_ownership_reservations(principal_id text,employee_id text,account_type text);
    CREATE TABLE orgmaster_core.principal_identity_reservations(principal_id text,employee_id text);
    CREATE VIEW orgmaster_contract.v_active_principal_mappings_v1 AS SELECT principal_id FROM orgmaster_core.principal_ownership_reservations;
    CREATE VIEW orgmaster_contract.v_active_principal_accounts_v1 AS SELECT
      NULL::text contract_version,NULL::text principal_issuer,NULL::text principal_subject,NULL::text principal_id,
      NULL::text employee_id,NULL::text account_type,NULL::text employee_status,NULL::bigint mapping_version,
      NULL::timestamptz published_at WHERE false;
    CREATE VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 AS SELECT ${columns.join(',')} WHERE false;
    GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_runtime,jenfu_ai_pdm_migrator;
    INSERT INTO orgmaster_core.persistence_batches VALUES ('batch','active');
    INSERT INTO orgmaster_core.persistence_authority VALUES (true,'batch');
    INSERT INTO orgmaster_core.persistence_artifacts VALUES
      ('batch','orgmaster-governance.v3.json','governance','{}',repeat('d',64)),
      ('batch','orgmaster-workspace.v1.json','workspace-manifest','{"currentVersionId":"current"}',repeat('d',64)),
      ('batch','orgmaster-versions/current.json','workspace-version','{"kind":"document","state":{}}',repeat('d',64));
    INSERT INTO orgmaster_core.fixture_employees VALUES ('employee-qc','active'),('employee-other','active');
    INSERT INTO orgmaster_core.principal_ownership_reservations VALUES
      ('principal-qc','employee-qc','human_personal'),('principal-other','employee-other','human_personal');
  `)
  for (const [sql, name] of [[sql044, 'read_administration_publication_v1'], [sql044, 'administrative_catalog_current_v1'],
    [sql045, 'assert_administration_policy_v1']]) {
    await owner.query(fn(sql, 'CREATE FUNCTION orgmaster_core.' + name + '('))
  }
  await owner.query(`REVOKE ALL ON FUNCTION orgmaster_core.read_administration_publication_v1(),
    orgmaster_core.administrative_catalog_current_v1(text,jsonb),orgmaster_core.assert_administration_policy_v1(jsonb) FROM PUBLIC`)
  await admin.query(sql047)
  // Reproduce the pre-existing 044 view wiring around the actual 047 zero-arg reader.
  await owner.query(`CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 WITH (security_barrier=true) AS
    SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5();
    REVOKE ALL ON FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5() TO jenfu_ai_pdm_runtime`)
  await admin.query(sql048)
  await owner.query(fn(sql044, 'CREATE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2('))
  await owner.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION ${signature} TO jenfu_ai_pdm_runtime,jenfu_ai_pdm_migrator`)

  const principal = 'principal-qc', employee = 'employee-qc', issuer = 'https://fixture.invalid', subject = 'subject-qc'
  const past = '2000-01-01T00:00:00.000Z'
  const managerQuery = 'SELECT orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2($1,$2,$3,$4) AS eligible'
  const grant = {
    id: '00000000-0000-4000-8000-000000000049', principalId: principal, employeeId: employee,
    roleCode: 'application_system_admin', applicationId: 'ai-pdm', subjectKind: 'principal', basis: 'manual',
    scope: { kind: 'global' }, status: 'active', validFrom: past, validTo: null,
    createdBy: { kind: 'owner_workload', id: 'fixture' }, reason: 'Scoped eligibility QC',
    catalogBinding: { catalogVersion: 'catalog-fixture', contentSha256: 'a'.repeat(64),
      stableRoleId: 'role-application-system-admin', roleDefinitionHash: 'b'.repeat(64) },
  }
  const otherGrant = { ...grant, principalId: 'principal-other', employeeId: 'employee-other' }
  const tests = [
    { id: 'exact-current-app-admin', grants: [grant], expected: true },
    { id: 'wrong-identity', grants: [grant], subject: 'wrong-subject', expected: false },
    { id: 'wrong-employee', grants: [grant], employee: 'employee-other', expected: false },
    { id: 'different-principal-admin', grants: [otherGrant], expected: false },
    { id: 'root-only', grants: [{ ...grant, roleCode: 'platform_super_admin', applicationId: null,
      scope: { kind: 'platform' }, catalogBinding: null }], expected: false },
    { id: 'revoked', grants: [{ ...grant, status: 'revoked' }], expected: false },
    { id: 'expired', grants: [{ ...grant, validTo: '2001-01-01T00:00:00.000Z' }], expected: false },
    { id: 'catalog-provenance-drift', grants: [{ ...grant,
      catalogBinding: { ...grant.catalogBinding, contentSha256: 'c'.repeat(64) } }], expected: false },
    { id: 'lifecycle-blocked', grants: [grant], lifecyclePending: true, expected: false },
    { id: 'privileged-legacy', legacy: true, accountType: 'human_privileged', expected: true },
    { id: 'personal-legacy-denied', legacy: true, expected: false },
    { id: 'unrelated-corrupt-administration', grants: [{ ...otherGrant, basis: 'invalid' }],
      error: 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE' },
    { id: 'unrelated-eligible-catalog-dependency', grants: [otherGrant], deniedCatalog: true, code: '42501' },
  ]
  const observe = async (test, role = 'jenfu_ai_pdm_runtime') => {
    await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    try {
      assert.ok(['jenfu_ai_pdm_runtime', 'jenfu_platform_runtime'].includes(role))
      await admin.query("SET LOCAL ROLE " + role + "; SET LOCAL statement_timeout='5s'")
      const { rows } = await admin.query(managerQuery, [principal, test.employee ?? employee, issuer, test.subject ?? subject])
      assert.equal(rows.length, 1)
      assert.equal(typeof rows[0].eligible, 'boolean')
      return { eligible: rows[0].eligible }
    } catch (error) {
      if (typeof error.code !== 'string' || !/^[0-9A-Z]{5}$/u.test(error.code)) throw error
      return { code: error.code, message: error.message }
    } finally { await admin.query('ROLLBACK') }
  }
  const run = async () => {
    const observed = {}
    for (const test of tests) {
      const account = test.accountType ?? 'human_personal'
      const policy = {
        identityLinks: [
          { id: 'target-link', principalId: principal, employeeId: employee, issuer, subject, status: 'active', validFrom: past },
          { id: 'other-link', principalId: 'principal-other', employeeId: 'employee-other', issuer, subject: 'other-subject', status: 'active', validFrom: past },
        ],
        principalAdmissions: [
          { identityLinkId: 'target-link', accountType: account, status: 'active' },
          { identityLinkId: 'other-link', accountType: 'human_personal', status: 'active' },
        ],
        roleAssignments: test.legacy ? [{
          id: 'legacy', employeeId: employee, applicationId: 'ai-pdm', roleId: 'role-system-admin',
          roleCodeSnapshot: 'system_admin', catalogVersion: 'legacy-fixture', subjectKind: 'principal',
          targetPrincipalId: principal, basis: 'manual', sources: [], scope: { kind: 'global' }, status: 'active', validFrom: past,
        }] : [],
        administration: { contractVersion: 'orgmaster.administration-policy.v1', version: 1,
          initializedByCommandId: '00000000-0000-4000-8000-000000000044', grants: test.grants ?? [] },
      }
      await owner.query("UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb WHERE artifact_key='orgmaster-governance.v3.json'",
        [JSON.stringify({ schemaVersion: 3, activePolicyVersionId: 'current', publishedVersions: [
          { id: 'current', kind: 'assignment-governance-v3', versionNumber: 1, publishedAt: past, policy },
        ] })])
      await owner.query('UPDATE orgmaster_core.principal_ownership_reservations SET account_type=$1 WHERE principal_id=$2', [account, principal])
      await owner.query('TRUNCATE orgmaster_core.managed_identity_lifecycle_outbox')
      if (test.lifecyclePending) await owner.query('INSERT INTO orgmaster_core.managed_identity_lifecycle_outbox VALUES ($1,$2)', [employee, 'pending'])
      if (test.deniedCatalog) await admin.query('REVOKE SELECT ON ai_pdm_contract.v_application_role_catalog_v3 FROM jenfu_orgmaster_migrator')
      try {
        const result = await observe(test)
        if (test.error) assert.deepEqual(result, { code: 'P0001', message: test.error }, test.id)
        else if (test.code) assert.equal(result.code, test.code, test.id)
        else assert.deepEqual(result, { eligible: test.expected }, test.id)
        observed[test.id] = result
      } finally {
        if (test.deniedCatalog) await admin.query('GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v3 TO jenfu_orgmaster_migrator')
      }
    }
    return observed
  }
  const facts = async () => (await admin.query(`SELECT oid,proowner,proacl::text,provolatile,prosecdef,proconfig,prorettype,
    pg_get_function_arguments(oid) args FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows
  const original = await facts()
  const before = await run()
  await admin.query(sql049)
  assert.deepEqual(await facts(), original, '049 metadata and ACL must match installed 048 baseline')
  const after = await run()
  assert.deepEqual(after, before, 'actual 048/049 behavior')
  await owner.query('GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_platform_runtime')
  assert.equal((await observe({}, 'jenfu_platform_runtime')).code, '42501')
  assert.equal((await admin.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime',
    'orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)','EXECUTE') AS allowed`)).rows[0].allowed, false)
  return { scope: 'DEV070_048_049_ACTUAL_TYPED_READERS_WITH_PREREQUISITE_PROJECTION_FIXTURES', status: 'PASS',
    postgres: 18, cases: tests.length, observations: tests.length * 2, metadataPreserved: true,
    fixtureBoundaries: ['upstream-storage-shapes', 'sibling-catalog-projections'], nativeCapacityMeasured: false }
}
