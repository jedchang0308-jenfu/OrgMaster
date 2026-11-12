import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { withAdministrationPostgresFixture } from './lib/dev070-administration-postgres-fixture.mjs'

const oldQuery = `SELECT application_id, assignment_version, visibility_state
  FROM orgmaster_contract.v_portal_app_visibility_v1
  WHERE principal_issuer = $1 AND principal_subject = $2 AND application_id = 'orgmaster'`
const scopedQuery = 'SELECT * FROM orgmaster_contract.read_portal_orgmaster_visibility_v1($1, $2)'
const legacyPair = ['issuer-legacy', 'subject-legacy']
const publication = document => document.publishedVersions.find(version => version.id === document.activePolicyVersionId)
const expected = [{ application_id: 'orgmaster', assignment_version: '2', visibility_state: 'visible' }]
const nowPast = '2000-01-01T00:00:00.000Z'
const nowFuture = '2099-01-01T00:00:00.000Z'

await withAdministrationPostgresFixture(async ({ admin, connect, handle }) => {
  console.log(JSON.stringify({ scope: 'DISPOSABLE_ONLY', pid: handle.process.pid, port: handle.port, database: handle.databaseName }))
  const sql = await readFile(new URL('../db/migrations/051_dev070_scoped_portal_orgmaster_visibility.sql', import.meta.url), 'utf8')
  const platform = await connect('platform-prod-runtime@jenfu-platform-prod.iam')
  await platform.query("SET jit = off; SET statement_timeout = '45s'")
  await admin.query("SET jit = off; SET statement_timeout = '45s'")
  const definition = async () => (await admin.query(`SELECT
    pg_get_viewdef('orgmaster_contract.v_portal_app_visibility_v1'::regclass, true) AS view,
    pg_get_functiondef('orgmaster_contract.read_portal_app_visibility_administration_v1()'::regprocedure) AS reader,
    pg_get_viewdef('orgmaster_core.v_effective_administrative_grants_v1'::regclass, true) AS admin_view`)).rows[0]
  const before = await definition()
  assert.match(before.admin_view, /administrative_catalog_current_legacy_v1/u)
  await admin.query(sql)
  assert.deepEqual(await definition(), before)
  const functionAcl = (await admin.query(`SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
    p.provolatile AS volatility, p.proconfig AS settings,
    ARRAY(SELECT CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee)::text END
      FROM aclexplode(p.proacl) WHERE privilege_type = 'EXECUTE' ORDER BY 1) AS execute_roles
    FROM pg_proc p WHERE p.oid = 'orgmaster_contract.read_portal_orgmaster_visibility_v1(text,text)'::regprocedure`)).rows[0]
  assert.deepEqual(functionAcl, { owner: 'jenfu_orgmaster_migrator', security_definer: true,
    volatility: 's', settings: ['search_path=pg_catalog'], execute_roles: ['jenfu_orgmaster_migrator', 'jenfu_platform_runtime'] })
  for (const user of ['orgmaster-prod-runtime@jenfu-platform-prod.iam', 'fms_runtime']) {
    const client = await connect(user)
    await assert.rejects(client.query(scopedQuery, legacyPair), error => error.code === '42501')
  }

  const observations = []
  const compare = async (name, client, pair, rows) => {
    const t0 = performance.now()
    const old = await client.query(oldQuery, pair)
    const t1 = performance.now()
    const scoped = await client.query(scopedQuery, pair)
    const t2 = performance.now()
    assert.deepEqual(scoped.rows, old.rows, name)
    assert.deepEqual(scoped.rows, rows, name)
    observations.push({ name, oldMs: Math.round(t1 - t0), scopedMs: Math.round(t2 - t1) })
  }
  const document = (await admin.query(`SELECT artifact.payload
    FROM orgmaster_core.persistence_artifacts artifact JOIN orgmaster_core.persistence_authority authority
    ON artifact.batch_id = authority.active_batch_id WHERE artifact.artifact_key = 'orgmaster-governance.v3.json'`)).rows[0].payload
  const sample = publication(document).policy.identityLinks.find(link => link.issuer === 'issuer-capacity-governance')
  assert.ok(sample, 'The disposable fixture must seed the representative population')
  await compare('active-employee-assignment', platform, legacyPair, expected)
  await compare('same-subject-wrong-issuer', platform, ['wrong-issuer', legacyPair[1]], [])
  await compare('historical-provider-pair', platform, ['issuer-historical', 'subject-historical'], [])
  await compare('capacity-account-without-OrgMaster-role', platform, [sample.issuer, sample.subject], [])
  await compare('null-issuer', platform, [null, legacyPair[1]], [])

  const source = JSON.parse(await readFile(new URL('../contracts/orgmaster-administration-bootstrap/v1/source-seed.json', import.meta.url), 'utf8'))
  const digest = async value => (await admin.query('SELECT orgmaster_core.administration_sha256_v1($1::jsonb) AS hash', [JSON.stringify(value)])).rows[0].hash
  const catalogVersion = 'orgmaster.system-admin.v1'
  const role = { stableRoleId: 'role-orgmaster-admin', permissionCodes: source.permissions.map(item => item.code).sort() }
  const binding = { catalogVersion, stableRoleId: role.stableRoleId, roleDefinitionHash: await digest(role),
    contentSha256: await digest({ catalogVersion, definition: role }) }
  const { definitions } = JSON.parse(await readFile(new URL('../contracts/orgmaster-administration/v2/administrative-definitions.json', import.meta.url), 'utf8'))
  const fixed = definitions.find(definition => definition.applicationId === 'orgmaster')
  const fixedBinding = { catalogVersion: fixed.definitionVersion, stableRoleId: fixed.profileId,
    roleDefinitionHash: fixed.definitionSha256, contentSha256: fixed.definitionSha256 }
  const adminGrant = {
    id: '00000000-0000-4000-8000-000000000051', principalId: 'principal-legacy', employeeId: 'employee-legacy',
    roleCode: 'application_system_admin', applicationId: 'orgmaster', subjectKind: 'principal', basis: 'manual',
    scope: { kind: 'global' }, status: 'active', validFrom: nowPast, validTo: null,
    createdBy: { kind: 'owner_workload', id: 'disposable-fixture' }, reason: 'Isolated visibility parity', catalogBinding: binding,
  }
  function addAdmin(policy, overrides = {}) {
    policy.permissions = source.permissions
    policy.rolePermissionGrants = source.rolePermissionGrants
    policy.administration = { contractVersion: 'orgmaster.administration-policy.v1', version: 1,
      initializedByCommandId: '00000000-0000-4000-8000-000000000052', grants: [{ ...adminGrant, ...overrides }] }
  }
  const scenarios = [
    ['active-exact-principal-assignment', expected, policy => Object.assign(policy.roleAssignments[0], { subjectKind: 'principal', targetPrincipalId: 'principal-legacy' })],
    ['different-target-principal', [], policy => Object.assign(policy.roleAssignments[0], { subjectKind: 'principal', targetPrincipalId: 'principal-other' })],
    ['expired-assignment', [], policy => { policy.roleAssignments[0].validTo = nowPast }],
    ['future-assignment', [], policy => { policy.roleAssignments[0].validFrom = nowFuture }],
    ['inactive-role', [], policy => { policy.applicationRoles.find(role => role.applicationId === 'orgmaster').status = 'inactive' }],
    ['inactive-provider-pair', [], policy => { policy.identityLinks[0].status = 'inactive' }],
    ['admin-and-ordinary-deduplicate', expected, policy => addAdmin(policy)],
    ['admin-only', expected, policy => { policy.roleAssignments.shift(); addAdmin(policy) }],
    ['expired-admin-only', [], policy => { policy.roleAssignments.shift(); addAdmin(policy, { validTo: '2001-01-01T00:00:00.000Z' }) }],
    ['wrong-admin-catalog', [], policy => { policy.roleAssignments.shift(); addAdmin(policy, { catalogBinding: { ...binding, contentSha256: '0'.repeat(64) } }) }],
    ['050-fixed-definition-retains-legacy-Portal-decision', [], policy => { policy.roleAssignments.shift(); addAdmin(policy, { catalogBinding: fixedBinding }) }],
  ]
  for (const [name, rows, edit] of scenarios) {
    const edited = structuredClone(document)
    edit(publication(edited).policy)
    await admin.query('BEGIN')
    try {
      // Test-only injections occur in the manager-owned disposable cluster.
      await admin.query('ALTER TABLE orgmaster_core.persistence_artifacts DISABLE TRIGGER administration_artifact_fence')
      await admin.query(`UPDATE orgmaster_core.persistence_artifacts SET payload = $1::jsonb
        WHERE batch_id = (SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)
        AND artifact_key = 'orgmaster-governance.v3.json'`, [JSON.stringify(edited)])
      await admin.query('ALTER TABLE orgmaster_core.persistence_artifacts ENABLE TRIGGER administration_artifact_fence')
      await admin.query('SET LOCAL ROLE jenfu_platform_runtime')
      await compare(name, admin, legacyPair, rows)
    } finally {
      await admin.query('ROLLBACK')
    }
  }
  console.log(JSON.stringify({ result: 'PASS', syntheticCapacityPopulation: 500, observations }))
}, { platformRoot: process.env.DEV070_PLATFORM_FIXTURE_ROOT ?? 'C:/VIBE CODING/Jenfu-Platform', capacityPopulation: 500 })
