import assert from 'node:assert/strict'
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
