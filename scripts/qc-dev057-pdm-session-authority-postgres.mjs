import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { withAdministrationPostgresFixture, createAdditionalAdministrationTargetFixture } from './lib/dev070-administration-postgres-fixture.mjs'

const principal = 'principal-legacy'
const employee = 'employee-legacy'

await withAdministrationPostgresFixture(async fixture => {
  const { admin, connect } = fixture
  const sql = await readFile(new URL('../db/migrations/056_dev057_ai_pdm_session_authority.sql', import.meta.url), 'utf8')
  await admin.query(sql)
  await admin.query(await readFile(new URL('../db/migrations/057_dev057_pdm_session_publication.sql', import.meta.url), 'utf8'))
  assert.ok((await admin.query('SELECT * FROM orgmaster_core.read_pdm_session_impact_v1()')).rowCount >= 1)
  await admin.query('CREATE ROLE pdm_session_qc LOGIN; GRANT jenfu_ai_pdm_runtime TO pdm_session_qc')
  const pdm = await connect('pdm_session_qc')
  await pdm.query('SET jit=off')
  const read = async (p = principal, e = employee) => {
    const result = await pdm.query(
      'SELECT * FROM orgmaster_contract.read_ai_pdm_session_authority_v1($1,$2)', [p, e],
    )
    assert.equal(result.rowCount, 1)
    return result.rows[0]
  }
  const before = await read()
  assert.equal(before.contract_version, 'orgmaster.ai-pdm-session-authority.v1')
  assert.match(before.source_version, /^\d+$/)
  assert.equal(before.accounts.length, 1)
  assert.ok(before.grants.length >= 1)
  assert.ok(before.grants.every(grant => grant.principal_id === principal && grant.employee_id === employee))
  const legacy = (await pdm.query(`
    SELECT to_jsonb(g) AS grant FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6($1,$2) g
    ORDER BY stable_role_id, assignment_id
  `, [principal, employee])).rows.map(row => row.grant)
  assert.deepEqual(before.grants, legacy)
  const absent = await read('unknown-principal', 'unknown-employee')
  assert.deepEqual(absent.accounts, [])
  assert.deepEqual(absent.grants, [])
  assert.equal(absent.source_version, before.source_version)
  assert.equal(absent.next_boundary, null)

  const next = '2099-02-01T00:00:00.000Z'
  const document = (await admin.query(`
    SELECT artifact.payload FROM orgmaster_core.persistence_artifacts artifact
    JOIN orgmaster_core.persistence_authority owner ON owner.active_batch_id = artifact.batch_id
    WHERE artifact.artifact_key = 'orgmaster-governance.v3.json'
  `)).rows[0].payload
  const publication = document.publishedVersions.find(version => version.id === document.activePolicyVersionId)
  const role = publication.policy.roleAssignments.find(value => value.applicationId === 'ai-pdm')
  role.validFrom = next
  role.validTo = null
  await admin.query(`
    UPDATE orgmaster_core.persistence_artifacts artifact
    SET payload = $1::jsonb
    FROM orgmaster_core.persistence_authority owner
    WHERE owner.active_batch_id = artifact.batch_id AND artifact.artifact_key = 'orgmaster-governance.v3.json'
  `, [JSON.stringify(document)])
  const scheduled = await read()
  assert.equal(scheduled.next_boundary.toISOString(), next)
  assert.deepEqual(scheduled.grants, [])
  const delegate = await createAdditionalAdministrationTargetFixture(fixture)
  const sourceEnds = '2099-01-01T00:00:00.000Z'
  const delegateEnds = '2099-03-01T00:00:00.000Z'
  role.validFrom = '2000-01-01T00:00:00.000Z'
  role.validTo = sourceEnds
  publication.policy.roleDelegations = [{
    id: 'scheduled-source-delegation', sourceAssignmentId: role.id, status: 'active',
    fromEmployeeId: employee, toEmployeeId: delegate.employeeId, roleId: role.roleId,
    catalogVersion: role.catalogVersion, scope: role.scope,
    validFrom: role.validFrom, validTo: delegateEnds,
  }]
  await admin.query(`
    UPDATE orgmaster_core.persistence_artifacts artifact SET payload=$1::jsonb
    FROM orgmaster_core.persistence_authority owner
    WHERE owner.active_batch_id=artifact.batch_id AND artifact.artifact_key='orgmaster-governance.v3.json'
  `, [JSON.stringify(document)])
  const directExpiry = await read()
  const delegationExpiry = await read(delegate.principalId, delegate.employeeId)
  assert.equal(directExpiry.next_boundary.toISOString(), sourceEnds)
  assert.equal(delegationExpiry.grants[0].grant_kind, 'delegated')
  assert.equal(new Date(delegationExpiry.grants[0].valid_until).toISOString(), delegateEnds)
  assert.equal(delegationExpiry.next_boundary.toISOString(), sourceEnds)
  await assert.rejects(
    admin.query(`
      SET ROLE jenfu_platform_runtime;
      SELECT * FROM orgmaster_contract.read_ai_pdm_session_authority_v1('principal-legacy','employee-legacy')
    `),
    error => error.code === '42501',
  )
  console.log('DEV-057 PDM login authority SQL: V6 equivalence, current/empty grants, future activation, delegated-source expiry and runtime isolation PASS')
})
