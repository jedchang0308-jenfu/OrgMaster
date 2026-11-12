import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createAdministrativeHumanFixture,
  drainAdministrationFixtureEvents,
  prepareAdministrationInitializationFixture,
  withAdministrationPostgresFixture,
} from './lib/dev070-administration-postgres-fixture.mjs'

const platformRoot = resolve(process.env.DEV070_PLATFORM_ROOT ?? 'C:/VIBE CODING/Jenfu-Platform')
const {
  createAdministrationLifecycleFixtureDispatch,
  initializePrincipalForAdministrationFixture,
} = await import(pathToFileURL(resolve(platformRoot, 'scripts/lib/dev022-administration-lifecycle-fixture.mjs')).href)

const applicationId = 'financial-management-system'
const principalId = 'principal-legacy'
const employeeId = 'employee-legacy'
const sameEmployeePrincipal = 'principal-fms-authority-peer'
const validFrom = '2026-01-01T00:00:00.000Z'
const definitionHash = 'c7c3f66834213b986dd02b9eb6c785c1c4a9d27f7df1d41c8481bcfd116a392d'
const catalogBinding = {
  catalogVersion: 'financial-management-system.administration.2026-11-08.v1',
  contentSha256: definitionHash,
  stableRoleId: 'fms-full-catalog-administration',
  roleDefinitionHash: definitionHash,
}
const catalogOperations = ['catalog.read', 'catalog.edit', 'catalog.publish', 'catalog.import', 'catalog.activate']
const businessCatalog = {
  applicationId,
  sourceKind: 'application-contract',
  validationState: 'valid',
  effectState: 'not-synchronized',
  catalogVersion: 'isolated-business-v1',
  contentSha256: 'a'.repeat(64),
  artifactSha256: 'b'.repeat(64),
  publishedByPrincipalId: principalId,
  publishedByEmployeeId: employeeId,
  roles: [{
    stableRoleId: 'role-viewer',
    status: 'active',
    subjectKind: 'employee',
    assignmentTier: 'app_admin',
    allowedScopeKinds: ['workspace'],
  }],
}
const baselineSql = `SELECT * FROM orgmaster_contract.v_fms_authority_v4
  WHERE principal_id=$1 AND application_id=$2 LIMIT 2`
const pointSql = 'SELECT * FROM orgmaster_contract.read_fms_authority_for_principal_v4($1,$2) LIMIT 2'

async function installPointReader({ admin, handle }) {
  assert.equal(handle.targetClass, 'task-owned-local')
  assert.equal(handle.host, '127.0.0.1')
  assert.match(handle.databaseName, /^dev014_[a-f0-9]{20}$/)
  for (const migration of ['051_dev070_scoped_portal_orgmaster_visibility.sql', '052_dev070_fms_authority_point_v4.sql']) {
    await admin.query(await readFile(new URL('../db/migrations/' + migration, import.meta.url), 'utf8'))
  }
  console.log(JSON.stringify({ scope: 'LOCAL_SYNTHETIC_ONLY', pid: handle.process.pid, port: handle.port }))
}

async function editPublishedFixture(admin, edit) {
  const activeArtifact = `batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)
    AND artifact_key='orgmaster-governance.v3.json'`
  const { rows: [artifact] } = await admin.query(`SELECT payload FROM orgmaster_core.persistence_artifacts WHERE ${activeArtifact}`)
  const publication = artifact.payload.publishedVersions.find(version => version.id === artifact.payload.activePolicyVersionId)
  edit(publication)
  const update = await admin.query(`UPDATE orgmaster_core.persistence_artifacts
    SET payload=$1, canonical_sha256=orgmaster_core.administration_sha256_v1($1::jsonb)
    WHERE ${activeArtifact}`, [JSON.stringify(artifact.payload)])
  assert.equal(update.rowCount, 1)
}

// Compare every column, including read_at, in the same database snapshot.
async function compareReads(client, targetPrincipal, expectedCount, targetApplication = applicationId) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const values = [targetPrincipal, targetApplication]
    const started = performance.now()
    const point = await client.query(pointSql, values)
    const pointMs = performance.now() - started
    const baselineStarted = performance.now()
    const baseline = await client.query(baselineSql, values)
    const baselineMs = performance.now() - baselineStarted
    const columns = result => result.fields.map(field => [field.name, field.dataTypeID])
    assert.deepEqual(columns(point), columns(baseline))
    assert.equal(baseline.rows.length, expectedCount)
    assert.deepEqual(point.rows, baseline.rows)
    return { rows: point.rows, pointMs: Math.round(pointMs), baselineMs: Math.round(baselineMs) }
  } finally {
    await client.query('ROLLBACK')
  }
}

await withAdministrationPostgresFixture(async fixture => {
  const { admin, connect, handle } = fixture
  await installPointReader(fixture)
  const fms = await connect('fms_runtime')
  await fms.query("SET statement_timeout='20s'")
  const platform = await connect('platform-prod-runtime@jenfu-platform-prod.iam')
  await admin.query('CREATE ROLE fms_authority_unrelated_fixture LOGIN; GRANT USAGE ON SCHEMA orgmaster_contract TO fms_authority_unrelated_fixture')
  const unrelated = await connect('fms_authority_unrelated_fixture')
  await assert.rejects(unrelated.query(pointSql, [principalId, applicationId]), { code: '42501' })
  await assert.rejects(fms.query('SELECT 1 FROM orgmaster_core.persistence_artifacts LIMIT 1'), { code: '42501' })

  await editPublishedFixture(admin, ({ policy }) => {
    const link = {
      id: 'fms-authority-peer-link',
      principalId: sameEmployeePrincipal,
      employeeId,
      issuer: 'issuer-fms-authority-peer',
      subject: 'subject-fms-authority-peer',
      status: 'active',
      validFrom,
      validTo: null,
    }
    policy.identityLinks.push(link)
    policy.principalAdmissions.push({ identityLinkId: link.id, status: 'active', accountType: 'human_personal' })
  })
  const initialization = await prepareAdministrationInitializationFixture(fixture, { acceptedCatalogs: [businessCatalog] })
  assert.equal((await initialization.initialize()).result, 'applied')
  const dispatch = createAdministrationLifecycleFixtureDispatch({ database: platform, handle })
  await drainAdministrationFixtureEvents(fixture, dispatch)
  await initializePrincipalForAdministrationFixture({ database: platform, handle, principalId })
  const typedPeer = await admin.query(`SELECT employee_id FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE principal_id=$1 AND employee_status='active' AND account_type='human_personal'`, [sameEmployeePrincipal])
  assert.deepEqual(typedPeer.rows, [{ employee_id: employeeId }])
  await compareReads(fms, principalId, 0)

  const human = await createAdministrativeHumanFixture(fixture)
  const receipt = await human.commit(await human.command('grant_application_administrator', {
    target: { principalId, employeeId, applicationId, validFrom, validTo: null },
    catalogBindings: { [applicationId]: catalogBinding },
  }))
  assert.equal(receipt.result, 'applied')
  assert.equal(receipt.grantIds.length, 1)
  const [grantId] = receipt.grantIds
  await drainAdministrationFixtureEvents(fixture, dispatch)

  const { rows: [administrator] } = await compareReads(fms, principalId, 1)
  assert.equal(administrator.employee_id, employeeId)
  assert.deepEqual(administrator.assignments, [])
  assert.deepEqual(administrator.protected_grants, catalogOperations.map(operation => ({
    grantId: grantId + ':' + operation,
    applicationId,
    principalId,
    operation,
    revision: String(receipt.administrationVersion),
    validFrom,
    validUntil: null,
  })))
  await compareReads(fms, sameEmployeePrincipal, 0)
  await compareReads(fms, 'principal-fms-authority-missing', 0)
  await compareReads(fms, principalId, 0, 'ai-pdm')

  const refreshed = await createAdministrativeHumanFixture(fixture)
  const revoke = await refreshed.commit(await refreshed.command('revoke_application_administrator', { grantId }))
  assert.equal(revoke.result, 'applied')
  assert.deepEqual(revoke.grantIds, [grantId])
  await drainAdministrationFixtureEvents(fixture, dispatch)
  await compareReads(fms, principalId, 0)
  console.log('PASS FMS exact Principal catalog grant, no business assignments, same-Employee isolation, and committed revocation on next read')
}, { platformRoot })

await withAdministrationPostgresFixture(async fixture => {
  const { admin, connect } = fixture
  await installPointReader(fixture)
  const fms = await connect('fms_runtime')
  await fms.query("SET statement_timeout='60s'")
  const principals = (await admin.query(`SELECT principal_id, min(employee_id) AS employee_id
    FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE employee_status='active' AND account_type IN ('human_personal','human_privileged')
    GROUP BY principal_id HAVING count(*)=1 ORDER BY principal_id`)).rows
  assert.equal(principals.length, 501)
  const denied = principals.find(row => row.employee_id !== employeeId)
  const eligible = principals.filter(row => row !== denied).slice(0, 40)
  assert.ok(eligible.some(row => row.principal_id === principalId))
  const assigned = new Set(eligible.map(row => row.principal_id))
  await editPublishedFixture(admin, publication => {
    publication.externalRoleCatalogs = [businessCatalog]
    publication.policy.roleAssignments = principals.map(row => {
      const forFms = assigned.has(row.principal_id) || row === denied
      return {
        id: 'capacity-assignment-' + row.employee_id,
        applicationId: forFms ? applicationId : 'ai-pdm',
        employeeId: row.employee_id,
        roleId: forFms ? 'role-viewer' : 'role-unrelated-viewer',
        catalogVersion: forFms ? businessCatalog.catalogVersion : 'isolated-unrelated-v1',
        scope: { kind: 'workspace', value: 'company-jenfu' },
        status: row === denied ? 'revoked' : 'active',
        subjectKind: 'employee',
        validFrom,
        validTo: null,
        targetPrincipalId: null,
      }
    })
  })
  await admin.query('ANALYZE')

  const allowedTimings = []
  for (const row of [eligible[0], eligible[1], eligible.at(-1)]) {
    const { rows: [allowed], ...timing } = await compareReads(fms, row.principal_id, 1)
    assert.equal(allowed.assignments.length, 1)
    assert.equal(allowed.assignments[0].stableRoleId, 'role-viewer')
    assert.equal(allowed.assignments[0].sourceAssignmentId, 'capacity-assignment-' + row.employee_id)
    assert.deepEqual(allowed.protected_grants, [])
    allowedTimings.push(timing)
  }
  const { rows: deniedRows, ...deniedTiming } = await compareReads(fms, denied.principal_id, 0)
  assert.deepEqual(deniedRows, [])
  console.log(JSON.stringify({
    result: 'PASS',
    workMem: (await fms.query('SHOW work_mem')).rows[0].work_mem,
    principalCount: principals.length,
    activeBusinessAssignments: eligible.length,
    revokedBusinessAssignments: 1,
    unrelatedAssignments: principals.length - eligible.length - 1,
    allowed: allowedTimings,
    denied: deniedTiming,
  }))
}, { platformRoot, capacityPopulation: 500 })
