import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
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
  const snapshotSql = `SELECT contract_version,source_version,as_of::text,next_after_principal_id,principals
    FROM orgmaster_contract.read_ai_pdm_reviewer_snapshot_v1($1,$2,$3,$4)`
  const terminalSql = 'SELECT * FROM orgmaster_contract.read_ai_pdm_reviewer_publication_v1($1,$2)'
  const snapshot = (version = null, at = null, cursor = null, limit = 128) => pdm.query(snapshotSql,
    [version, at, cursor, limit])
  const empty = await snapshot()
  assert.equal(empty.rowCount, 1)
  assert.equal(empty.rows[0].contract_version, 'orgmaster.ai-pdm-reviewer-authority.v1')
  assert.equal(empty.rows[0].next_after_principal_id, null)
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
  const readAt = async (p, e, at) => (await admin.query(
    'SELECT * FROM orgmaster_core.read_ai_pdm_principal_grants_at_v1($1,$2,false,$3)', [p,e,at],
  )).rows
  const impactAt = async (p, at) => (await admin.query(
    'SELECT effect FROM orgmaster_core.read_pdm_session_impact_v1($1) WHERE principal_id=$2', [at,p],
  )).rows[0]?.effect
  assert.deepEqual((await readAt(principal, employee, before.evaluated_at)).map(row => row.assignment_id),
    legacy.map(row => row.assignment_id))
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
  assert.deepEqual(await readAt(principal, employee, '2099-01-31T23:59:59.999Z'), [])
  assert.equal((await readAt(principal, employee, next))[0].assignment_id, role.id)
  const horizon = '2098-01-01T00:00:00.000Z'
  const initialSchedule = await impactAt(principal, horizon)
  assert.deepEqual(initialSchedule[0][3], [])
  assert.equal(new Date(initialSchedule[1][0]).toISOString(), next)
  const writeDocument = () => admin.query(`
    UPDATE orgmaster_core.persistence_artifacts artifact SET payload=$1::jsonb
    FROM orgmaster_core.persistence_authority owner
    WHERE owner.active_batch_id = artifact.batch_id AND artifact.artifact_key = 'orgmaster-governance.v3.json'
  `, [JSON.stringify(document)])
  const secondRole = { ...role, id: 'scheduled-later-role', validFrom: '2099-04-01T00:00:00.000Z',
    scope: { kind: 'workspace', value: 'scheduled-company' } }
  publication.policy.roleAssignments.push(secondRole)
  await writeDocument()
  const firstBoundary = (await read()).next_boundary
  const scopeBefore = await impactAt(principal, horizon)
  secondRole.scope = { ...secondRole.scope, value: 'changed-scheduled-company' }
  await writeDocument()
  assert.equal((await read()).next_boundary.toISOString(), firstBoundary.toISOString())
  assert.notDeepEqual(await impactAt(principal, horizon), scopeBefore, 'Future scope changes even with the same next boundary')
  assert.equal((await readAt(principal, employee, secondRole.validFrom)).find(row => row.assignment_id === secondRole.id).scope_key,
    'changed-scheduled-company')
  publication.policy.roleAssignments.pop()
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
  const delegateTimeline = await impactAt(delegate.principalId, horizon)
  assert.equal(new Date(delegateTimeline[0][1]).toISOString(), sourceEnds)
  assert.equal(delegateTimeline[0][3][0][8], 'delegated')
  assert.deepEqual(delegateTimeline[1][3], [])
  assert.equal((await readAt(delegate.principalId, delegate.employeeId, '2098-12-31T23:59:59.999Z')).length, 1)
  assert.deepEqual(await readAt(delegate.principalId, delegate.employeeId, sourceEnds), [])
  const first = (await snapshot(null, null, null, 1)).rows[0]
  assert.ok(first.next_after_principal_id)
  assert.equal(first.next_after_principal_id, first.principals[0].principal_id)
  const second = (await snapshot(first.source_version, first.as_of, first.next_after_principal_id, 1)).rows[0]
  assert.equal(second.as_of, first.as_of, 'PostgreSQL microseconds round-trip as text')
  assert.equal(second.source_version, first.source_version)
  assert.ok(second.principals[0].principal_id > first.principals[0].principal_id)
  const full = (await snapshot(first.source_version, first.as_of)).rows[0]
  const delegateIntervals = full.principals.find(row => row.principal_id === delegate.principalId).intervals
  assert.equal(new Date(delegateIntervals[0].valid_until).toISOString(), sourceEnds)
  assert.deepEqual(delegateIntervals[0].accounts, [{ employee_id:delegate.employeeId, account_type:'human_personal' }])
  assert.equal(delegateIntervals[0].grants[0].grant_kind, 'delegated')
  assert.deepEqual(delegateIntervals[1].grants, [])
  assert.equal(delegateIntervals[1].valid_from, delegateIntervals[0].valid_until)
  assert.equal(delegateIntervals.at(-1).valid_until, null)
  assert.ok(!JSON.stringify(full.principals).includes('issuer-legacy'))
  assert.equal((await snapshot(null, null, first.next_after_principal_id)).rowCount, 0, 'Unbound cursor rejected')
  assert.equal((await snapshot(first.source_version, first.as_of, 'unknown-cursor')).rowCount, 0)
  assert.equal((await snapshot(first.source_version, first.as_of, '非法游標')).rowCount, 0)
  assert.equal((await snapshot('0' + first.source_version, first.as_of, first.next_after_principal_id)).rowCount, 0)
  assert.equal((await snapshot(null, null, null, 129)).rowCount, 0)
  await admin.query('UPDATE orgmaster_core.persistence_authority SET authority_version=authority_version+1 WHERE singleton')
  assert.equal((await snapshot(first.source_version, first.as_of, first.next_after_principal_id)).rowCount, 0, 'Old version cannot resume')
  assert.equal((await snapshot(first.source_version, first.as_of)).rowCount, 0, 'Final snapshot recheck also detects drift')
  const newest = (await snapshot()).rows[0]
  assert.notEqual(newest.source_version, first.source_version)
  assert.deepEqual((await snapshot(newest.source_version, newest.as_of, newest.principals.at(-1).principal_id)).rows[0].principals, [])
  assert.equal((await pdm.query(terminalSql, [randomUUID(), newest.source_version])).rowCount, 0)
  const mapping = publication.policy.identityLinks.find(link => link.principalId === principal)
  mapping.validFrom = next
  mapping.validTo = delegateEnds
  role.validTo = null
  await writeDocument()
  assert.deepEqual(await readAt(principal, employee, '2099-01-31T23:59:59.999Z'), [])
  assert.equal((await readAt(principal, employee, next)).length, 1)
  assert.deepEqual(await readAt(principal, employee, delegateEnds), [])
  mapping.validFrom = '2000-01-01T00:00:00.000Z'
  mapping.validTo = null
  role.validTo = sourceEnds
  await writeDocument()
  const nativeReader = 'SELECT * FROM orgmaster_contract.read_ai_pdm_session_authority_v1($1,$2)'
  await admin.query('CREATE ROLE pdm_first_login_owner_qc LOGIN; GRANT jenfu_ai_pdm_migrator TO pdm_first_login_owner_qc')
  const firstLoginOwner = await connect('pdm_first_login_owner_qc')
  await firstLoginOwner.query('SET ROLE jenfu_ai_pdm_migrator')
  assert.deepEqual((await firstLoginOwner.query(nativeReader, [principal, employee])).rows[0].grants, directExpiry.grants)
  const deniedRoles = ['jenfu_platform_runtime', 'jenfu_platform_migrator', 'jenfu_orgmaster_runtime', 'jenfu_r1_verifier', 'fms_runtime']
  for (const role of deniedRoles) {
    await admin.query('BEGIN')
    try {
      await admin.query(`SET LOCAL ROLE ${role}`)
      await assert.rejects(admin.query(nativeReader, [principal, employee]), error => error.code === '42501', role)
    } finally {
      await admin.query('ROLLBACK')
    }
  }
  const reviewerSignatures = ['orgmaster_contract.read_ai_pdm_reviewer_snapshot_v1(text,timestamptz,text,integer)',
    'orgmaster_contract.read_ai_pdm_reviewer_publication_v1(uuid,text)']
  for (const signature of reviewerSignatures) {
    const { rows } = await admin.query(`
      SELECT rolname, has_function_privilege(rolname,$1,'EXECUTE') AS allowed FROM pg_roles
      WHERE rolname=ANY($2::text[])`, [signature,['jenfu_ai_pdm_runtime','jenfu_ai_pdm_migrator', ...deniedRoles]])
    assert.equal(rows.length, deniedRoles.length+2)
    assert.deepEqual(rows.filter(row => row.allowed).map(row => row.rolname), ['jenfu_ai_pdm_runtime'])
    const { rows: publicAcl } = await admin.query(`SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(p.proacl) acl
      WHERE p.oid=$1::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'`, [signature])
    assert.deepEqual(publicAcl, [])
  }
  await assert.rejects(firstLoginOwner.query(snapshotSql,[null,null,null,1]), { code:'42501' })
  await assert.rejects(firstLoginOwner.query(terminalSql,[randomUUID(),'0']), { code:'42501' })
  console.log('DEV-057 PDM authority SQL: V6 parity, intervals, pagination, stale cursor/versions and exact runtime ACL PASS')
})
