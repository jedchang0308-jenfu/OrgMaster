import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createAdministrativeHumanFixture,
  createAdditionalAdministrationTargetFixture,
  drainAdministrationFixtureEvents,
  prepareAdministrationInitializationFixture,
  withAdministrationPostgresFixture,
} from './lib/dev070-administration-postgres-fixture.mjs'
import { publishAfterOrgmasterPdmRevocation, reconcileOrgmasterPdmPublications } from './lib/orgmaster-pdm-publication.mts'
import { executeOrgMasterAdmission, executeOrgMasterQuarantine } from './lib/dev049-production-admission.mjs'

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
const previousPointSql = 'SELECT * FROM orgmaster_contract.read_fms_authority_for_principal_baseline_v4($1,$2) LIMIT 2'
const admissionSql = 'SELECT * FROM orgmaster_contract.read_fms_principal_admission_v2($1,$2) LIMIT 2'
const displaySql = 'SELECT * FROM orgmaster_contract.read_fms_principal_display_profile_v1($1,$2) LIMIT 2'
const sessionDisplaySql = 'SELECT * FROM orgmaster_contract.read_fms_session_display_profile_v1($1,$2,$3,$4) LIMIT 2'
const publicationStatusSql = 'SELECT orgmaster_contract.is_fms_authority_publication_ready_v1() AS ready'
const sessionBoundarySql = 'SELECT * FROM orgmaster_contract.read_fms_authority_session_boundary_v1($1,$2,$3,$4,$5)'
const revocationCallerSql = 'SELECT orgmaster_contract.is_fms_revocation_platform_caller_v1($1,$2) AS admitted'
const sessionImpactSql = 'SELECT * FROM orgmaster_core.read_fms_session_impact_v1($1,$2)'
const fmsPublicationSql = 'SELECT * FROM orgmaster_contract.read_fms_session_publication_v1($1,$2)'
const reviewerSnapshotSql = 'SELECT * FROM orgmaster_contract.read_fms_reviewer_snapshot_v1()'
const boundaryInput = row => [row.principal_id, row.employee_id, row.principal_binding_version, row.governance_revision, row.read_at]

async function installPointReader({ admin, handle }) {
  assert.equal(handle.targetClass, 'task-owned-local')
  assert.equal(handle.host, '127.0.0.1')
  assert.match(handle.databaseName, /^dev014_[a-f0-9]{20}$/)
  for (const migration of ['051_dev070_scoped_portal_orgmaster_visibility.sql', '052_dev070_fms_authority_point_v4.sql']) {
    await admin.query(await readFile(new URL('../db/migrations/' + migration, import.meta.url), 'utf8'))
  }
  const { rows: [{ definition }] } = await admin.query(`SELECT pg_get_functiondef(
    'orgmaster_contract.read_fms_authority_for_principal_v4(text,text)'::regprocedure
  ) AS definition`)
  await admin.query(definition.replace('read_fms_authority_for_principal_v4', 'read_fms_authority_for_principal_baseline_v4'))
  await admin.query('REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_authority_for_principal_baseline_v4(text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_authority_for_principal_baseline_v4(text,text) TO fms_runtime')
  await admin.query(await readFile(new URL('../db/migrations/053_dev070_fms_indexed_authority.sql', import.meta.url), 'utf8'))
  await admin.query(await readFile(new URL('../db/migrations/054_dev070_fms_authority_publication_status.sql', import.meta.url), 'utf8'))
  await admin.query(await readFile(new URL('../db/migrations/055_dev070_fms_session_display_profile.sql', import.meta.url), 'utf8'))
  for (const migration of ['056_dev057_ai_pdm_session_authority.sql', '057_dev057_pdm_session_publication.sql',
    '058_dev059_fms_authority_session_boundary.sql', '059_dev059_fms_revocation_platform_caller.sql',
    '060_dev059_fms_publication_impact.sql', '061_dev059_fms_publication_receipts.sql', '062_dev059_fms_reviewer_snapshot.sql',
    '063_dev059_fms_publication_control.sql']) {
    await admin.query(await readFile(new URL('../db/migrations/' + migration, import.meta.url), 'utf8'))
  }
  console.log(JSON.stringify({ scope: 'LOCAL_SYNTHETIC_ONLY', pid: handle.process.pid, port: handle.port }))
}

async function nameFixtureEmployee(admin, employeeId, name) {
  const source = await admin.query(`SELECT artifact.batch_id,artifact.artifact_key,artifact.payload
    FROM orgmaster_core.v_fms_fact_source_v1 current
    JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=current.batch_id
      AND artifact.artifact_key=current.workspace_artifact_key`)
  assert.equal(source.rowCount, 1)
  const { batch_id: batchId, artifact_key: artifactKey, payload } = source.rows[0]
  const employee = payload.state.employees.find(row => row.id === employeeId)
  assert.ok(employee)
  employee.name = name
  const update = await admin.query(`UPDATE orgmaster_core.persistence_artifacts
    SET payload=$1, canonical_sha256=orgmaster_core.administration_sha256_v1($1::jsonb)
    WHERE batch_id=$2 AND artifact_key=$3`, [JSON.stringify(payload), batchId, artifactKey])
  assert.equal(update.rowCount, 1)
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
    const previousStarted = performance.now()
    const previous = await client.query(previousPointSql, values)
    const previousPointMs = performance.now() - previousStarted
    const baselineStarted = performance.now()
    const baseline = await client.query(baselineSql, values)
    const baselineMs = performance.now() - baselineStarted
    const columns = result => result.fields.map(field => [field.name, field.dataTypeID])
    assert.deepEqual(columns(point), columns(previous))
    assert.deepEqual(columns(point), columns(baseline))
    assert.deepEqual(point.rows, previous.rows)
    assert.equal(baseline.rows.length, expectedCount)
    assert.deepEqual(point.rows, baseline.rows)
    return { rows: point.rows, pointMs: Number(pointMs.toFixed(2)), previousPointMs: Number(previousPointMs.toFixed(2)), baselineMs: Math.round(baselineMs) }
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
  await assert.rejects(unrelated.query(publicationStatusSql), { code: '42501' })
  await assert.rejects(unrelated.query(reviewerSnapshotSql), { code: '42501' })
  await assert.rejects(unrelated.query(pointSql, [principalId, applicationId]), { code: '42501' })
  await assert.rejects(unrelated.query(admissionSql, ['issuer-fms-authority-peer', 'subject-fms-authority-peer']), { code: '42501' })
  await assert.rejects(unrelated.query(displaySql, [principalId, employeeId]), { code: '42501' })
  await assert.rejects(unrelated.query(sessionDisplaySql, [principalId, employeeId, 'issuer', 'subject']), { code: '42501' })
  await unrelated.end()
  await assert.rejects(fms.query('SELECT 1 FROM orgmaster_core.persistence_artifacts LIMIT 1'), { code: '42501' })
  await assert.rejects(fms.query('SELECT 1 FROM orgmaster_core.fms_artifact_facts LIMIT 1'), { code: '42501' })

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
  const employeeName = 'FMS Display Fixture'
  await nameFixtureEmployee(admin, employeeId, '  ' + employeeName + '  ')
  const peer = ['issuer-fms-authority-peer', 'subject-fms-authority-peer']
  await fms.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const admission = await fms.query(admissionSql, peer)
    const previous = await fms.query(`SELECT * FROM orgmaster_contract.v_fms_principal_admissions_v2
      WHERE identity_issuer=$1 AND identity_subject=$2`, peer)
    assert.deepEqual(admission.fields.map(field => [field.name, field.dataTypeID]), previous.fields.map(field => [field.name, field.dataTypeID]))
    assert.equal(admission.rowCount, 1)
    assert.deepEqual(admission.rows, previous.rows)
  } finally {
    await fms.query('ROLLBACK')
  }
  assert.equal((await fms.query(displaySql, [principalId, employeeId])).rowCount, 0)

  const peerDisplay = [sameEmployeePrincipal, employeeId, ...peer]
  assert.equal((await fms.query(sessionDisplaySql, peerDisplay)).rows[0]?.employee_name, employeeName)
  assert.equal((await fms.query(sessionDisplaySql, [principalId, employeeId, ...peer])).rowCount, 0)
  assert.equal((await fms.query(sessionDisplaySql, [sameEmployeePrincipal, 'employee-two', ...peer])).rowCount, 0)
  assert.equal((await fms.query(sessionDisplaySql, [sameEmployeePrincipal, employeeId, peer[0], 'other-subject'])).rowCount, 0)

  const human = await createAdministrativeHumanFixture(fixture)
  const grantOptions = {
    target: { principalId, employeeId, applicationId, validFrom, validTo: null },
    catalogBindings: { [applicationId]: catalogBinding },
  }
  const grant = await human.command('grant_application_administrator', grantOptions)
  assert.equal((await fms.query(reviewerSnapshotSql)).rowCount, 0, 'cannot seed while owner publication control is off')
  const delivery = await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
  const commandCount = async id => (await admin.query(
    'SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=$1', [id])).rowCount
  const fmsReceipts = new Map()
  let failPrepare = true
  let expectedAffectedPrincipal = principalId
  const phases = []
  const fmsClient = {
    async readback(command) { return fmsReceipts.get(command.digest) ?? null },
    async dispatch(command) {
      phases.push(command)
      assert.deepEqual(command.principalIds, [expectedAffectedPrincipal])
      if (command.phase === 'prepare' && failPrepare) throw new Error('isolated FMS unreachable')
      if (command.phase !== 'prepare') {
        const read = await fms.query(fmsPublicationSql, [command.operationId, command.eventId])
        if (!read.rowCount) throw new Error('FMS owner terminal not yet visible')
        assert.deepEqual(read.rows[0].principal_ids, command.principalIds)
        assert.equal(read.rows[0].decision, command.phase)
        assert.equal(read.rows[0].prepare_receipt_id, command.prepareReceiptId)
        assert.equal(read.rows[0].observed_version, command.phase === 'published' ? command.targetVersion : command.baselineVersion)
      }
      const result = fmsReceipts.get(command.digest) ?? { operationId: command.operationId, eventId: command.eventId,
        phase: command.phase, digest: command.digest, receiptId: randomUUID(), appliedAt: new Date().toISOString(),
        contractVersion: 'jf-fms.session-revocation-receipt.v1' }
      fmsReceipts.set(command.digest, result)
      return result
    },
  }
  const pdmClient = { async readback() { assert.fail('unexpected PDM readback') }, async dispatch() { assert.fail('unexpected PDM dispatch') } }
  const coordinate = (actor, request) => publishAfterOrgmasterPdmRevocation({
    actor: actor.principalId, commandKey: request.commandId, request, enabled: true, client: pdmClient,
    fms: { enabled: true, client: fmsClient },
    async transaction(run) {
      await actor.runtime.query('BEGIN')
      try { const result = await run(); await actor.runtime.query('COMMIT'); return result }
      catch (error) { await actor.runtime.query('ROLLBACK'); throw error }
    },
    database: () => actor.runtime, deliveryDatabase: () => delivery,
    write: () => actor.commit(request), replay: () => actor.status(request.commandId),
  })
  const managed = await createAdditionalAdministrationTargetFixture(fixture)
  const remaining = await createAdditionalAdministrationTargetFixture(fixture, { employeeId: 'employee-three' })
  await drainAdministrationFixtureEvents(fixture, dispatch)
  const controlSql = `SELECT orgmaster_core.transition_fms_session_publication_v1($1,$2,$3,$4) AS state`
  const enableHash = 'a'.repeat(64)
  const disableHash = 'b'.repeat(64)
  const control = async (expected, enabled, operation, deadline = new Date(Date.now() + 60_000)) =>
    (await admin.query(controlSql, [expected, enabled, operation, deadline])).rows[0].state
  await assert.rejects(delivery.query(controlSql, [0, true, enableHash, new Date(Date.now() + 60_000)]), { code: '42501' })
  await assert.rejects(control(0, true, enableHash, new Date(0)), /FMS_PUBLICATION_CONTROL_INPUT_INVALID/)
  const activated = await control(0, true, enableHash)
  assert.equal(activated.revision, '1')
  assert.equal(activated.enabled, true)
  assert.deepEqual(await control(0, true, enableHash), activated)
  await assert.rejects(control(0, false, disableHash), /FMS_PUBLICATION_CONTROL_CONFLICT/)
  await assert.rejects(human.commit(grant), /FMS_PUBLICATION_WRITER_REQUIRED/)
  await assert.rejects(coordinate(human, grant), /PDM_PUBLICATION_PENDING/)
  await assert.rejects(control(1, false, disableHash), /FMS_PUBLICATION_CONTROL_PENDING_DELIVERY/)
  assert.equal((await fms.query(reviewerSnapshotSql)).rowCount, 0, 'cannot seed while an owner operation is pending')
  assert.equal(await commandCount(grant.commandId), 0)
  assert.equal((await fms.query(fmsPublicationSql, [phases[0].operationId, phases[0].terminalEventId])).rowCount, 0)
  const competing = await human.command('grant_application_administrator', grantOptions)
  await assert.rejects(coordinate(human, competing), /PDM_PUBLICATION_PENDING/)
  assert.equal(phases.length, 1, 'an overlapping operation cannot dispatch a second prepare')
  assert.equal(await commandCount(competing.commandId), 0)
  failPrepare = false
  const receipt = await coordinate(human, grant)
  assert.equal(phases[0].eventId, phases[1].eventId)
  assert.equal(await commandCount(grant.commandId), 1)
  assert.equal(receipt.result, 'applied')
  assert.equal(receipt.grantIds.length, 1)
  const [grantId] = receipt.grantIds
  await drainAdministrationFixtureEvents(fixture, dispatch)
  assert.equal((await fms.query(reviewerSnapshotSql)).rowCount, 0, 'cannot seed while terminal delivery is outstanding')
  await assert.rejects(control(1, false, disableHash), /FMS_PUBLICATION_CONTROL_PENDING_DELIVERY/)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  const { rows: [reviewerBaseline] } = await fms.query(reviewerSnapshotSql)
  assert.deepEqual(reviewerBaseline.principal_ids, [principalId])
  assert.equal(reviewerBaseline.source_version, phases.at(-1).targetVersion)
  assert.deepEqual(reviewerBaseline.authority_timeline[0].intervals[0].authorities[0].assignments, [])
  await human.runtime.end()
  const refreshed = await createAdministrativeHumanFixture(fixture)
  assert.equal((await coordinate(refreshed, grant)).grantIds[0], grantId)
  assert.equal(await commandCount(grant.commandId), 1)

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
  const display = await fms.query(displaySql, [principalId, employeeId])
  assert.deepEqual(display.fields.map(field => field.name), ['principal_id', 'employee_id', 'employee_name'])
  assert.equal(display.rowCount, 1)
  assert.equal(display.rows[0].employee_id, employeeId)
  assert.equal(display.rows[0].employee_name, employeeName)
  assert.equal((await fms.query(displaySql, [sameEmployeePrincipal, employeeId])).rowCount, 0)
  assert.equal((await fms.query(displaySql, [principalId, 'employee-two'])).rowCount, 0)
  await compareReads(fms, sameEmployeePrincipal, 0)
  await compareReads(fms, 'principal-fms-authority-missing', 0)
  await compareReads(fms, principalId, 0, 'ai-pdm')

  const revoke = await coordinate(refreshed, await refreshed.command('revoke_application_administrator', { grantId }))
  assert.equal(revoke.result, 'applied')
  assert.deepEqual(revoke.grantIds, [grantId])
  await drainAdministrationFixtureEvents(fixture, dispatch)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  await refreshed.runtime.end()
  console.log('PASS the native OrgMaster administration writer requires the FMS prepare receipt, rejects direct writes, and exposes the committed terminal once')
  await compareReads(fms, principalId, 0)
  assert.equal((await fms.query(displaySql, [principalId, employeeId])).rowCount, 0)
  assert.equal((await fms.query(sessionDisplaySql, peerDisplay)).rows[0]?.employee_name, employeeName)
  await editPublishedFixture(admin, ({ policy }) => {
    policy.identityLinks.find(link => link.principalId === sameEmployeePrincipal).status = 'inactive'
  })
  assert.equal((await fms.query(sessionDisplaySql, peerDisplay)).rowCount, 0)
  console.log('PASS FMS catalog grant and committed revocation; self-display ignores financial grants and rejects mismatched or withdrawn identity')

  expectedAffectedPrincipal = managed.principalId
  const maintainer = await createAdministrativeHumanFixture(fixture)
  const managedGrant = await maintainer.command('grant_application_administrator', {
    ...grantOptions, target: { ...grantOptions.target, principalId: managed.principalId, employeeId: managed.employeeId },
  })
  assert.equal((await coordinate(maintainer, managedGrant)).result, 'applied')
  await drainAdministrationFixtureEvents(fixture, dispatch)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  await compareReads(fms, managed.principalId, 1)
  const identity = async () => (await admin.query(
    'SELECT revision::text, link_state FROM orgmaster_core.managed_daily_identities WHERE identity_record_id=$1',
    [managed.identityId],
  )).rows[0]
  const quarantine = { operationId: 'DEV049-ISOLATED-FMS-QUARANTINE', identityRecordId: managed.identityId,
    expectedRevision: (await identity()).revision, incidentRef: 'isolated/fms-publication', reasonCode: 'fixture' }
  const writer = await connect('postgres')
  const executeQuarantine = () => executeOrgMasterQuarantine({
    operation: quarantine, database: writer, fmsPublicationInstalled: true,
  })
  await assert.rejects(executeQuarantine(), /PDM_PUBLICATION_PENDING/)
  assert.equal((await identity()).link_state, 'active')
  const prepareCount = phases.length
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  assert.equal(phases.length, prepareCount + 1)
  assert.equal(phases.at(-1).phase, 'prepare')
  assert.equal((await identity()).link_state, 'active')
  assert.equal((await executeQuarantine()).disposition, 'APPLIED')
  assert.equal((await identity()).link_state, 'conflict')
  await compareReads(fms, managed.principalId, 0)
  assert.equal((await executeQuarantine()).disposition, 'REPLAY')
  await drainAdministrationFixtureEvents(fixture, dispatch)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  assert.equal(phases.at(-1).phase, 'published')
  console.log('PASS OrgMaster owner quarantine waits for the existing scheduler to deliver the FMS receipt, then applies once')

  expectedAffectedPrincipal = remaining.principalId
  const remainingGrant = await maintainer.command('grant_application_administrator', {
    ...grantOptions, target: { ...grantOptions.target, principalId: remaining.principalId, employeeId: remaining.employeeId },
  })
  assert.equal((await coordinate(maintainer, remainingGrant)).result, 'applied')
  await drainAdministrationFixtureEvents(fixture, dispatch)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  await compareReads(fms, remaining.principalId, 1)
  const admissionState = async () => (await admin.query(
    'SELECT revision::text, admission_enabled FROM orgmaster_core.managed_identity_admission_authority',
  )).rows[0]
  const { rows: activeConsumers } = await admin.query(
    "SELECT application_id FROM orgmaster_core.managed_identity_invalidation_applications WHERE status='active'",
  )
  const admission = { operationId: 'DEV049-ISOLATED-FMS-ADMISSION', action: 'deactivate',
    expected: { enabled: true, admissionRevision: (await admissionState()).revision },
    consumers: [...new Set(['platform', 'orgmaster', ...activeConsumers.map(row => row.application_id)])].sort()
      .map(applicationId => ({ applicationId })) }
  const executeAdmission = () => executeOrgMasterAdmission({
    operation: admission, database: writer, fmsPublicationInstalled: true,
  })
  await assert.rejects(executeAdmission(), /PDM_PUBLICATION_PENDING/)
  assert.equal((await admissionState()).admission_enabled, true)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  assert.equal(phases.at(-1).phase, 'prepare')
  assert.equal((await admissionState()).admission_enabled, true)
  assert.equal((await executeAdmission()).disposition, 'APPLIED')
  assert.equal((await admissionState()).admission_enabled, false)
  assert.equal((await executeAdmission()).disposition, 'REPLAY')
  await drainAdministrationFixtureEvents(fixture, dispatch)
  assert.deepEqual(await reconcileOrgmasterPdmPublications(delivery, pdmClient, fmsClient), { selected: 1, completed: 1 })
  assert.equal(phases.at(-1).phase, 'published')
  console.log('PASS OrgMaster admission control waits for the original FMS prepare, then commits and replays safely')
  const disabled = await control(1, false, disableHash)
  assert.equal(disabled.revision, '2')
  assert.equal(disabled.enabled, false)
  assert.deepEqual(await control(1, false, disableHash), disabled)
  await assert.rejects(control(0, true, enableHash), /FMS_PUBLICATION_CONTROL_CONFLICT/)
  assert.equal((await fms.query(reviewerSnapshotSql)).rowCount, 0)
  console.log('PASS OrgMaster publication transition restricts access and drains pending FMS revocations before disabling')
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
  const allowed = eligible[0]
  const impactAt = new Date()
  const orgRuntime = await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
  const impact = async (database = orgRuntime, ids = null) => (await database.query(sessionImpactSql, [impactAt, ids])).rows
  const baselineImpact = await impact()
  assert.deepEqual(new Set(baselineImpact.map(row => row.principal_id)), assigned)
  assert.deepEqual(await impact(orgRuntime, [allowed.principal_id, denied.principal_id]),
    baselineImpact.filter(row => row.principal_id === allowed.principal_id))
  await assert.rejects(impact(fms), { code: '42501' })
  await admin.query('BEGIN')
  try {
    await editPublishedFixture(admin, ({ policy }) => {
      policy.roleAssignments.find(assignment => assignment.employeeId === allowed.employee_id).status = 'revoked'
    })
    assert.equal((await admin.query(pointSql, [allowed.principal_id, applicationId])).rowCount, 0)
    assert.equal((await fms.query(pointSql, [allowed.principal_id, applicationId])).rowCount, 1)
    assert.deepEqual(await impact(admin), baselineImpact.filter(row => row.principal_id !== allowed.principal_id))
    assert.deepEqual(await impact(), baselineImpact)
  } finally {
    await admin.query('ROLLBACK')
  }
  assert.equal((await fms.query(pointSql, [allowed.principal_id, applicationId])).rowCount, 1)

  const { rows: [unbounded] } = await fms.query(pointSql, [allowed.principal_id, applicationId])
  assert.deepEqual((await fms.query(sessionBoundarySql, boundaryInput(unbounded))).rows, [{
    contract_version: 'jenfu.orgmaster.fms-authority-session-boundary.v1',
    governance_revision: unbounded.governance_revision,
    next_transition_at: null,
  }])
  const futureFrom = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const laterUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  await admin.query('BEGIN')
  try {
    await editPublishedFixture(admin, publication => {
      publication.versionNumber += 1
      publication.publishedAt = new Date().toISOString()
      const assignment = publication.policy.roleAssignments.find(row => row.employeeId === allowed.employee_id)
      publication.policy.roleAssignments.push({ ...assignment, id: 'non-effective-future', roleId: 'role-never-defined', validFrom: futureFrom })
    })
    assert.deepEqual(await impact(admin), baselineImpact, 'audit counters and a never-effective role do not revoke')
  } finally {
    await admin.query('ROLLBACK')
  }
  await editPublishedFixture(admin, ({ policy }) => {
    const assignment = policy.roleAssignments.find(row => row.employeeId === allowed.employee_id)
    assignment.validTo = laterUntil
    policy.roleAssignments.push({ ...assignment, id: assignment.id + '-scheduled', validFrom: futureFrom, validTo: null })
  })
  const { rows: [bounded] } = await fms.query(pointSql, [allowed.principal_id, applicationId])
  assert.equal(bounded.assignments.length, 1, 'scheduled assignment is not yet effective')
  const { rows: [bound] } = await fms.query(sessionBoundarySql, boundaryInput(bounded))
  assert.equal(bound.next_transition_at.toISOString(), futureFrom)
  const scheduledImpact = await impact()
  const changedPrincipalIds = scheduledImpact.filter((row, index) => JSON.stringify(row) !== JSON.stringify(baselineImpact[index]))
    .map(row => row.principal_id)
  assert.deepEqual(changedPrincipalIds, [allowed.principal_id])
  const { effect: timeline } = scheduledImpact.find(row => row.principal_id === allowed.principal_id)
  assert.equal(new Date(timeline[0][1]).toISOString(), futureFrom)
  assert.equal(new Date(timeline[1][1]).toISOString(), laterUntil)
  await admin.query('UPDATE orgmaster_core.fms_session_publication_control_v1 SET enabled=true')
  const { rows: [reviewerBaseline] } = await fms.query(reviewerSnapshotSql)
  assert.deepEqual(new Set(reviewerBaseline.principal_ids), assigned)
  assert.equal(reviewerBaseline.authority_timeline.length, assigned.size)
  const scheduledReviewer = reviewerBaseline.authority_timeline.find(row => row.principal_id === allowed.principal_id)
  assert.equal(new Date(scheduledReviewer.intervals[1].valid_from).toISOString(), futureFrom)
  assert.equal((await fms.query(sessionBoundarySql, boundaryInput(unbounded))).rowCount, 0, 'drift invalidates the login snapshot')
  assert.equal((await fms.query(sessionBoundarySql, [bounded.principal_id, denied.employee_id, ...boundaryInput(bounded).slice(2)])).rowCount, 0)
  assert.equal((await fms.query(sessionBoundarySql, [...boundaryInput(bounded).slice(0, 4), new Date(0)])).rowCount, 0)
  await admin.query('BEGIN')
  try {
    await admin.query('CREATE ROLE dev059_boundary_unprivileged NOLOGIN; GRANT USAGE ON SCHEMA orgmaster_contract TO dev059_boundary_unprivileged; SET LOCAL ROLE dev059_boundary_unprivileged')
    await assert.rejects(admin.query(sessionBoundarySql, boundaryInput(bounded)), { code: '42501' })
  } finally {
    await admin.query('ROLLBACK')
  }
  await editPublishedFixture(admin, ({ policy }) => {
    policy.roleAssignments = policy.roleAssignments.filter(row => !row.id.endsWith('-scheduled'))
    policy.roleAssignments.find(row => row.employeeId === allowed.employee_id).validTo = null
  })
  console.log('PASS FMS sign-in boundary uses the next scheduled assignment and rejects drift, wrong employee, stale snapshot, and unauthorized database callers')
  assert.deepEqual(await impact(), baselineImpact)
  console.log('PASS FMS publication impact matches exact active and scheduled changes, respects rollback, and excludes unrelated/non-effective changes')

  const { rows: workloads } = await admin.query(`SELECT owner, provider_subject, db_session_user || '.gserviceaccount.com' AS email
    FROM orgmaster_core.workload_principal_bindings WHERE purpose IN ('managed-identity-lifecycle','principal-lifecycle-invalidation') ORDER BY owner`)
  const [orgCaller, platformCaller] = workloads
  assert.deepEqual(workloads.map(row => row.owner), ['orgmaster', 'platform'])
  const platformBinding = [platformCaller.provider_subject, platformCaller.email]
  assert.deepEqual((await fms.query(revocationCallerSql, platformBinding)).rows, [{ admitted: true }])
  assert.deepEqual((await fms.query(revocationCallerSql, [platformCaller.provider_subject, orgCaller.email])).rows, [{ admitted: false }])
  assert.deepEqual((await fms.query(revocationCallerSql, [orgCaller.provider_subject, orgCaller.email])).rows, [{ admitted: false }])
  await admin.query('BEGIN')
  try {
    await admin.query(`UPDATE orgmaster_core.workload_principal_bindings SET enabled=false
      WHERE owner='platform' AND purpose='principal-lifecycle-invalidation'`)
    await admin.query('SET LOCAL ROLE fms_runtime')
    assert.deepEqual((await admin.query(revocationCallerSql, platformBinding)).rows, [{ admitted: false }])
    await admin.query('RESET ROLE')
    await admin.query('CREATE ROLE dev059_caller_unprivileged NOLOGIN; GRANT USAGE ON SCHEMA orgmaster_contract TO dev059_caller_unprivileged; SET LOCAL ROLE dev059_caller_unprivileged')
    await assert.rejects(admin.query(revocationCallerSql, platformBinding), { code: '42501' })
  } finally {
    await admin.query('ROLLBACK')
  }
  console.log('PASS only FMS runtime can test the active and exact Platform service caller binding')

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
  const benchmark = { projected: [], previous: [] }
  for (let repeat = 0; repeat < 10; repeat += 1) {
    const calls = [['projected', pointSql], ['previous', previousPointSql]]
    if (repeat % 2) calls.reverse()
    for (const [key, sql] of calls) {
      const started = performance.now()
      const result = await fms.query(sql, [allowed.principal_id, applicationId])
      benchmark[key].push(performance.now() - started)
      assert.equal(result.rowCount, 1)
    }
  }
  const summarize = samples => {
    const sorted = samples.toSorted((left, right) => left - right)
    return { sampleCount: sorted.length, medianMs: Number(((sorted[4] + sorted[5]) / 2).toFixed(2)),
      maxMs: Number(sorted.at(-1).toFixed(2)) }
  }
  const now = Date.now()
  await editPublishedFixture(admin, ({ policy }) => {
    const assignment = policy.roleAssignments.find(row => row.employeeId === denied.employee_id)
    assignment.status = 'active'
    assignment.validFrom = new Date(now + 86_400_000).toISOString()
  })
  await compareReads(fms, denied.principal_id, 0)
  await editPublishedFixture(admin, ({ policy }) => {
    const assignment = policy.roleAssignments.find(row => row.employeeId === denied.employee_id)
    assignment.validFrom = validFrom
    assignment.validTo = new Date(now - 60_000).toISOString()
  })
  await compareReads(fms, denied.principal_id, 0)
  await editPublishedFixture(admin, publication => {
    publication.policy.roleAssignments = []
  })
  assert.equal((await fms.query(pointSql, [allowed.principal_id, applicationId])).rowCount, 0)
  assert.equal((await fms.query(publicationStatusSql)).rows[0].ready, true)
  await editPublishedFixture(admin, publication => {
    publication.externalRoleCatalogs = [businessCatalog, { ...businessCatalog, catalogVersion: 'duplicate-catalog' }]
  })
  assert.equal((await fms.query(publicationStatusSql)).rows[0].ready, false)
  await editPublishedFixture(admin, publication => {
    publication.externalRoleCatalogs = []
  })
  assert.equal((await fms.query(publicationStatusSql)).rows[0].ready, false)
  console.log(JSON.stringify({
    result: 'PASS',
    workMem: (await fms.query('SHOW work_mem')).rows[0].work_mem,
    principalCount: principals.length,
    activeBusinessAssignments: eligible.length,
    revokedBusinessAssignments: 1,
    unrelatedAssignments: principals.length - eligible.length - 1,
    allowed: allowedTimings,
    denied: deniedTiming,
    warmAllowed: { projected: summarize(benchmark.projected), previous: summarize(benchmark.previous) },
  }))
}, { platformRoot, capacityPopulation: 500 })
