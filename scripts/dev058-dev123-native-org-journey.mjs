import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { withDev058Dev123Database } from './dev058-dev123-native-bootstrap.mjs'
import { makeManagerEligible, activeGovernanceArtifact, publishGovernance as seedGovernance } from './dev058-dev123-native-fixtures.mjs'

// Real owner migrations, runtime sessions, HTTP auth middleware and transactions.
// Platform auth-state and session issuance are explicit disposable fixtures,
// so none of these results represents normal SSO or a deployed integration.
const cases = []
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const governor = 'C:/Users/user/.codex/skills/ai-dev-resource-governor/scripts/resource_governor.py'
async function check(id, run, requires = []) {
  const missing = requires.filter(required => !cases.some(value => value.id === required && value.status === 'PASS'))
  if (missing.length) {
    cases.push({ id, status: 'BLOCKED', requires: missing })
    console.log(JSON.stringify({ orgNativeCase: cases.at(-1) }))
    return
  }
  try { await run(); cases.push({ id, status: 'PASS' }) }
  catch (error) {
    cases.push({ id, status: 'FAIL', code: String(error.code ?? error.message).slice(0, 300),
      message: String(error.message).slice(0, 1200), at: String(error.stack).split('\n').map(line => line.trim()).filter(line => line.startsWith('at ')).slice(0, 3) })
  }
  console.log(JSON.stringify({ orgNativeCase: cases.at(-1) }))
}
async function waitForLock(observer, applicationName, queryFragment, blockerPid = null) {
  const deadline = Date.now() + 7000
  while (Date.now() < deadline) {
    await observer.query('SELECT pg_stat_clear_snapshot()')
    const result = await observer.query(`SELECT pid,pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1
        AND state='active' AND wait_event_type='Lock' AND position($2 in query)>0`, [applicationName, queryFragment])
    const row = result.rows.find(value => blockerPid === null || value.blockers.includes(blockerPid))
    if (row) return row.pid
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('EXPECTED_NATIVE_LOCK_NOT_OBSERVED:' + applicationName)
}
async function portReleased(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('error', error => resolve(error.code === 'ECONNREFUSED'))
  })
}

await withDev058Dev123Database(async ({ admin, pdmRuntime, orgRuntime, handle, pdmRoot, orgRoot }) => {
  const directInputs = [
    ...['scripts/dev058-dev123-native-org-journey.mjs', 'scripts/dev058-dev123-native-bootstrap.mjs',
      'scripts/dev058-dev123-native-loader.mjs',
      'scripts/dev058-dev123-native-fixtures.mjs', 'server/orgmasterGovernanceApi.ts', 'server/orgmasterGovernanceStore.ts',
      'server/orgmasterGovernanceWriteActor.ts', 'server/orgmasterPersistenceRepository.ts',
      'server/governanceReduction.ts', 'server/aiPdmRoleCatalogRepository.ts',
      'server/aiPdmRoleCapabilityStore.ts', 'server/privilegedAssignmentStore.ts', 'server/orgmasterWorkspaceStore.ts',
      'src/governance/aiPdmRoleCapability.ts', 'src/governance/privilegedAssignments.ts',
      'src/governance/validation.ts'].map(file => [orgRoot, 'orgmaster', file]),
    ...['src/lib/role-policy-service.ts', 'src/lib/role-policy-editor.ts', 'src/lib/jenfu-principal-request-guard.ts',
      'src/lib/jenfu-principal-published-grant-validation.ts',
      'src/lib/jenfu-principal-permission-service.ts', 'src/lib/repositories/jenfu-entitlement-repository.ts',
      'src/app/api/submissions/route.ts', 'src/lib/principal-submission-access.ts',
      'src/lib/repositories/submission-list-async-repository.ts', 'src/lib/repositories/dashboard-async-repository.ts',
      'src/lib/jenfu-principal-http.ts', 'src/lib/auth-config.ts', 'src/lib/platform-session-key-ring.ts',
      'src/lib/db-async-provider.ts', 'src/lib/company-context.ts',
      'config/access-control/ai-pdm-role-policy-contract-v2.manifest.json'].map(file => [pdmRoot, 'ai-pdm', file]),
  ]
  const inputHashes = () => directInputs.map(([root, owner, file]) => ({ owner, file, sha256: digest(readFileSync(path.join(root, file))) }))
  const testedInputs = inputHashes()
  console.log(JSON.stringify({ nativeSources: { scope: 'direct-execution-inputs',
    orgHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: orgRoot, encoding: 'utf8', windowsHide: true }).trim(),
    pdmHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: pdmRoot, encoding: 'utf8', windowsHide: true }).trim(), inputs: testedInputs } }))
  const imp = (root, file) => import(pathToFileURL(path.join(root, file)).href)
  const [service, dbProvider, pdmSessions, catalogReader, orgCatalog, store, persistence,
    documentStorage, workspace, seed, migration, screenshot, validation, commands, admission,
    auth, cookies, sessionRepository, principals, epochs, financial] = await Promise.all([
    imp(pdmRoot, 'src/lib/role-policy-service.ts'), imp(pdmRoot, 'src/lib/db-async-provider.ts'),
    imp(pdmRoot, 'src/lib/jenfu-principal-session-registry.ts'), imp(orgRoot, 'server/aiPdmRoleCatalogRepository.ts'),
    imp(orgRoot, 'src/governance/aiPdmCatalog.ts'), imp(orgRoot, 'server/orgmasterGovernanceStore.ts'),
    imp(orgRoot, 'server/orgmasterPersistenceRepository.ts'), imp(orgRoot, 'src/documentStorage.ts'),
    imp(orgRoot, 'src/versionWorkspace.ts'), imp(orgRoot, 'src/governance/migrateGovernanceV1ToV2.ts'),
    imp(orgRoot, 'src/governance/migrateGovernanceV2ToV3.ts'), imp(orgRoot, 'src/screenshotData.ts'),
    imp(orgRoot, 'src/governance/validation.ts'), imp(orgRoot, 'src/governance/commands.ts'),
    imp(orgRoot, 'src/governance/identityAdmission.ts'), imp(orgRoot, 'server/orgmasterAuthApi.ts'),
    imp(orgRoot, 'server/orgmasterAuthCookies.ts'), imp(orgRoot, 'server/orgmasterSessionRepository.ts'),
    imp(orgRoot, 'server/orgmasterPrincipalAdmissionRepository.ts'), imp(orgRoot, 'server/orgmasterAuthEpochRepository.ts'),
    imp(orgRoot, 'server/financialRoleCatalogRepository.ts'),
  ])
  const manager = await makeManagerEligible(admin)
  await admin.query('INSERT INTO platform_contract.task_owned_principal_auth_state(principal_id) VALUES($1)', [manager.link.principalId])
  const account = (await admin.query('SELECT * FROM ai_pdm_core.principal_accounts WHERE principal_id=$1', [manager.link.principalId])).rows[0]
  const now = new Date(Date.now() - 1000).toISOString(), expiresAt = new Date(Date.now() + 3600000).toISOString()
  const pdmSessionId = crypto.randomUUID(), pdmSessionHash = pdmSessions.hashJenfuPrincipalSessionId(pdmSessionId)
  await pdmRuntime.query(`INSERT INTO ai_pdm_core.principal_session_records(principal_id,session_id_hash,
    principal_auth_epoch,lifecycle_version,profile_version,authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
    VALUES($1,$2,0,$3,$4,$5,$5,$6,'aal2',$7)`,
  [account.principal_id, pdmSessionHash, account.lifecycle_version, account.profile_version, now, expiresAt, 'a'.repeat(64)])
  await pdmRuntime.end()
  const verified = { profile: { pdmUserId: account.pdm_user_id, companyId: account.company_id }, session: {
    contractVersion: 'jenfu.ai-pdm-session.v2', appId: 'ai-pdm', sessionId: pdmSessionId,
    identityIssuer: manager.link.issuer, identitySubject: manager.link.subject, principalId: account.principal_id,
    employeeId: account.employee_id, authEpoch: 0, profileVersion: Number(account.profile_version),
    accountLifecycleVersion: Number(account.lifecycle_version), authenticatedAt: now, issuedAt: now, expiresAt, assuranceLevel: 'aal2' } }
  const client = new dbProvider.PostgresAsyncDatabaseClient({ kind: 'postgres',
    connectionString: `postgresql://jenfu_ai_pdm_runtime@${handle.host}:${handle.port}/${handle.databaseName}`,
    searchPath: 'ai_pdm_core,pg_catalog', maxConnections: 1, applicationName: 'dev058-org-pdm-apply',
    queryTimeoutMillis: 15000, statementTimeoutMillis: 12000 })
  const tx = fn => client.transaction(fn, { isolationLevel: 'read_committed' })
  const [sessionTokens, requestGuard, permissionService, assurance] = await Promise.all([
    imp(pdmRoot, 'src/lib/jenfu-principal-session.ts'), imp(pdmRoot, 'src/lib/jenfu-principal-request-guard.ts'),
    imp(pdmRoot, 'src/lib/jenfu-principal-permission-service.ts'), imp(pdmRoot, 'src/lib/jenfu-principal-assurance.ts'),
  ])
  const tuple = async () => {
    const catalog = await catalogReader.readPublishedAiPdmRoleCatalogFromDatabase(orgRuntime)
    return { catalogVersion: catalog.catalogVersion, catalogSha256: catalog.catalogSha256 }
  }
  async function prepare(roleChanges, changes = []) {
    const draft = await tx(c => service.createRolePolicyDraft(c, verified, { draftId: crypto.randomUUID(), expectedActive: currentTuple }))
    const saved = await tx(c => service.saveRolePolicyDraft(c, verified, draft.draftId, { expectedRevision: draft.revision, roleChanges, changes }))
    const preview = await tx(c => service.previewRolePolicyDraft(c, draft.draftId, saved.revision))
    return { requestId: crypto.randomUUID(), confirmation: preview.confirmation, reason: 'task-owned Org native journey' }
  }
  let currentTuple = await tuple()
  const customRequest = await prepare([{ type: 'create', clientRoleId: 'client-native-org-custom', displayName: '隔離任用時序' }],
    [{ roleRef: { clientRoleId: 'client-native-org-custom' }, groupId: 'drawing', actionId: 'view', enabled: true }])
  await tx(c => service.applyRolePolicy(c, verified, customRequest))
  currentTuple = await tuple()
  const activeCatalog = await catalogReader.readPublishedAiPdmRoleCatalogFromDatabase(orgRuntime)
  const custom = activeCatalog.roles.find(role => role.displayName === '隔離任用時序' && role.stableRoleId.startsWith('role-custom-'))
  assert.ok(custom, 'ACTUAL_PDM_CUSTOM_CREATION_REQUIRED')

  const runtimeUrl = `postgresql://jenfu_orgmaster_runtime@${handle.host}:${handle.port}/${handle.databaseName}`
  const names = ['ORGMASTER_PERSISTENCE_MODE', 'ORGMASTER_POSTGRES_URL', 'ORGMASTER_POSTGRES_POOL_MAX', 'DEV010_N2_RUN_ID', 'ORGMASTER_GOVERNANCE_DATA_DIR']
  const previousEnvironment = Object.fromEntries(names.map(name => [name, process.env[name]]))
  process.env.ORGMASTER_PERSISTENCE_MODE = 'cloud-sql'
  process.env.ORGMASTER_POSTGRES_URL = runtimeUrl
  process.env.ORGMASTER_POSTGRES_POOL_MAX = '1'
  process.env.DEV010_N2_RUN_ID = 'dev058-org-http-writer'
  process.env.ORGMASTER_GOVERNANCE_DATA_DIR = path.join(handle.taskRoot, 'role-capability-state')
  const observer = admin
  let server, httpPort, httpStartToken, httpRegistered=false
  try {
    const catalog = orgCatalog.createAiPdmRoleCatalog('valid', activeCatalog.publishedAt, activeCatalog)
    const financialCatalog = await financial.readFinancialRoleCatalog('valid', orgRoot)
    // Required pre-existing PDM configuration, not a desired permission result.
    // Use the producer's builtin order; the real consumer appends custom roles.
    await admin.query(`INSERT INTO ai_pdm_core.role_priority_versions(id,version_code,priority_json,status)
      VALUES('native-priority','native-priority.v1',$1,'active')`,
    [JSON.stringify(activeCatalog.roles.filter(role => !role.stableRoleId.startsWith('role-custom-')).map(role => role.roleCode))])
    const target = { id: 'native-target-link', employeeId: 'employee-native-target', principalId: 'principal-native-target', issuer: 'https://securetoken.google.com/task-owned-native', subject: 'subject-native-target', status: 'active', validFrom: now, validTo: null }
    const delegatedTarget = { ...target, id: 'native-delegate-link', employeeId: 'employee-native-delegate',
      principalId: 'principal-native-delegate', issuer: 'issuer-native-delegate', subject: 'subject-native-delegate' }
    const privilegedTarget = { ...target, id: 'native-privileged-link', employeeId: 'employee-native-privileged',
      principalId: 'principal-native-privileged', issuer: 'issuer-native-privileged', subject: 'subject-native-privileged' }
    const links = [{ ...manager.link, validTo: null }, target, delegatedTarget, privilegedTarget]
    const accountTypeByPrincipal = new Map([[manager.link.principalId, 'human_privileged'], [privilegedTarget.principalId, 'human_privileged'],
      [target.principalId, 'human_personal'], [delegatedTarget.principalId, 'human_personal']])
    const state = structuredClone(screenshot.screenshotOrganizationState)
    for (const link of links) state.employees.push({ ...structuredClone(state.employees[0]), id: link.employeeId, name: '隔離驗證人員', status: 'active', departmentIds: [], primaryAssignmentId: null })
    const delegationSourceEmployeeId = 'employee-native-delegation-source'
    state.employees.push({ ...structuredClone(state.employees[0]), id: delegationSourceEmployeeId,
      name: '隔離代理來源', status: 'active', departmentIds: [], primaryAssignmentId: null })
    const workspaceDocument = documentStorage.createOrgDocumentFile(state, 'document', now)
    const manifest = workspace.createWorkspaceManifest('current', now)
    const governance = migration.migrateGovernanceV2ToV3(seed.createSeedDocumentV2(now), 'native-v2-fixture', catalog, now)
    governance.draft.identityLinks = links
    governance.draft.principalAdmissions = links.map((link, index) => ({ id: 'native-admission-' + index,
      identityLinkId: link.id, principalFingerprintSha256: admission.principalFingerprintSha256(link.issuer, link.subject),
      issuerFingerprintSha256: admission.issuerFingerprintSha256(link.issuer), accountType: accountTypeByPrincipal.get(link.principalId),
      sharedRetirementState: 'not_applicable', status: 'active', recordedAt: now, evidenceRefSha256: digest('task-owned-native-admission-' + index) }))
    const old = await activeGovernanceArtifact(admin)
    const oldActive = old.payload.publishedVersions.find(version => version.id === old.payload.activePolicyVersionId)
    const managerGrant = structuredClone(oldActive.policy.roleAssignments.find(row => row.id === 'assignment-dev058-manager-system-admin'))
    // Bootstrap only: the current privileged contract requires a direct,
    // non-expiring Principal grant. The tested custom assignment is created
    // later through the authenticated product API, never seeded here.
    assert.equal(managerGrant.targetPrincipalId, manager.link.principalId)
    governance.draft.roleAssignments = [{ ...managerGrant, catalogVersion: currentTuple.catalogVersion, validTo: null },
      { id: 'native-org-manager', employeeId: manager.link.employeeId, applicationId: 'orgmaster', roleId: 'role-orgmaster-admin',
        roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null, scope: { kind: 'global' },
        status: 'active', validFrom: now, validTo: null, effectState: 'orgmaster-enforced', basis: 'manual', sources: [],
        subjectKind: 'employee', targetPrincipalId: null, createdByPrincipalId: manager.link.principalId }]
    governance.draft.managementGrants = [{
      id: 'native-org-manager-cross-app-override', principalId: manager.link.principalId, employeeId: manager.link.employeeId,
      applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: now, validTo: null,
      grantedByPrincipalId: 'bootstrap-fixture', reason: 'native dedicated privileged operator baseline',
    }]
    await admin.query('BEGIN')
    for (const [key, payload] of [['orgmaster-workspace.v1.json', manifest], ['orgmaster-versions/current.json', workspaceDocument]]) {
      const hash = digest(commands.canonicalJson(payload))
      assert.equal((await admin.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb,
        source_sha256=$2,canonical_sha256=$2,source_bytes=$3 WHERE artifact_key=$4
          AND batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)`,
      [JSON.stringify(payload), hash, Buffer.byteLength(JSON.stringify(payload)), key])).rowCount, 1)
    }
    for (const link of [target, delegatedTarget, privilegedTarget]) {
      await admin.query(`INSERT INTO orgmaster_core.principal_ownership_reservations(principal_id,employee_id,account_type,first_seen_at,source_revision)
        VALUES($1,$2,$3,$4,'native-target-baseline')`, [link.principalId, link.employeeId, accountTypeByPrincipal.get(link.principalId), now])
      await admin.query(`INSERT INTO orgmaster_core.principal_identity_reservations(principal_issuer,principal_subject,employee_id,first_seen_at,source_kind,source_revision,principal_id)
        VALUES($1,$2,$3,$4,'legacy','native-target-baseline',$5)`, [link.issuer, link.subject, link.employeeId, now, link.principalId])
      await admin.query('INSERT INTO platform_contract.task_owned_principal_auth_state(principal_id) VALUES($1)', [link.principalId])
    }
    await admin.query('COMMIT')
    const source = await store.loadOrganizationSource(orgRoot)
    const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = governance.draft
    const payload = { kind: 'assignment-governance-v3', policy, externalRoleCatalogs: [catalog, financialCatalog], organizationSnapshot: validation.buildOrganizationSnapshot(source), effectState: 'not-synchronized' }
    governance.publishedVersions = [{ ...payload, id: 'native-org-baseline', versionNumber: 1, publishedAt: now,
      publishedByPrincipalId: manager.link.principalId, publishReason: 'task-owned baseline', hashFormat: commands.GOVERNANCE_PUBLICATION_HASH_FORMAT,
      snapshotHash: commands.publicationSnapshotHash(payload) }]
    governance.activePolicyVersionId = 'native-org-baseline'
    governance.draft.basePolicyVersionId = 'native-org-baseline'
    const issues = validation.validateDocumentV3(governance, source, [catalog, financialCatalog])
    assert.deepEqual(issues.map(issue => ({ code: issue.code, path: issue.path })), [], 'NATIVE_ORG_BASELINE_MUST_VALIDATE')
    await seedGovernance(admin, governance, old.canonical_sha256, 'org-http-baseline')
    const pepper = crypto.randomBytes(32).toString('hex'), token = cookies.createOpaqueSessionToken()
    const sessions = sessionRepository.createOrgmasterSessionRepository(orgRuntime)
    const orgSession = await sessions.create({ sessionIdHash: cookies.hashSessionToken(pepper, token), identityIssuer: manager.link.issuer,
      identitySubject: manager.link.subject, principalId: manager.link.principalId, employeeId: manager.link.employeeId, authEpoch: 0,
      sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0, authenticatedAt: now, issuedAt: now, expiresAt, assuranceLevel: 'aal2' })
    const runtime = { configResult: { configured: true, config: { publicBaseUrl: new URL('http://127.0.0.1'), postgresUrl: runtimeUrl,
      sessionHashPepper: pepper, secureCookie: false } }, sessions, principals: principals.createPrincipalAdmissionRepository(orgRuntime),
      epochs: epochs.createAuthEpochRepository(orgRuntime), firebase: { verifyIdToken() { assert.fail('No IdP verification in this fixture') } } }
    const authenticate = auth.createOrgmasterAuthMiddleware(() => runtime, false)
    const { createOrgmasterGovernanceMiddleware } = await imp(orgRoot, 'server/orgmasterGovernanceApi.ts')
    const governanceMiddleware = createOrgmasterGovernanceMiddleware(orgRoot, false)
    let dropNext = false
    server = createServer((request, response) => {
      if (dropNext && request.method === 'PATCH') {
        dropNext = false
        response.end = function () { response.destroy(); return response }
      }
      authenticate(request, response, () => governanceMiddleware(request, response, () => { response.statusCode = 404; response.end() }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    httpPort = server.address().port
    const startToken = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${process.pid}).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`], { encoding: 'utf8', windowsHide: true }).trim()
    httpStartToken=startToken
    execFileSync('python', [governor, '--agent-host', 'codex', '--format', 'json', 'session', 'runtime', 'register',
      '--session', process.env.ORGMASTER_DEV058_GOVERNOR_SESSION, '--pid', String(process.pid), '--start-token', startToken,
      '--executable', process.execPath, '--purpose', 'DEV058 native HTTP transaction journey', '--port', String(httpPort),
      '--cleanup-condition', 'task HTTP closed, port released and node process exited'], { encoding: 'utf8', windowsHide: true })
    httpRegistered=true
    console.log(JSON.stringify({ orgHttpRuntime: { pid: process.pid, startToken, port: httpPort } }))
    const origin = `http://127.0.0.1:${httpPort}`
    runtime.configResult.config.publicBaseUrl = new URL(origin)
    async function call(method, suffix, body) {
      const response = await fetch(origin + '/api/orgmaster/governance' + suffix, { method,
        headers: { cookie: 'orgmaster_session=' + token, origin, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) })
      return { status: response.status, body: await response.json() }
    }
    const sessionRead = await call('GET', '/session')
    assert.equal(sessionRead.status, 200, 'REAL_COOKIE_SESSION_MUST_AUTHENTICATE')
    assert.equal(sessionRead.body.capabilities.manage, true)
    assert.equal(sessionRead.body.capabilities.publish, true)
    const effects = async () => (await admin.query(`SELECT authority_version::text,active_batch_id::text,
      (SELECT jsonb_agg(jsonb_build_array(artifact_key,trim(canonical_sha256)) ORDER BY artifact_key)
        FROM orgmaster_core.persistence_artifacts WHERE batch_id=active_batch_id) AS artifacts,
      (SELECT count(*)::int FROM orgmaster_core.entitlement_change_outbox) AS outbox
      FROM orgmaster_core.persistence_authority WHERE singleton`)).rows[0]
    const binding = async () => ({ expectedRevision: (await store.readExistingGovernanceStore(orgRoot)).revision,
      expectedOrganizationRevision: (await store.loadOrganizationSource(orgRoot)).workspaceRevision, expectedCatalog: await tuple() })
    const assignment = { id: 'native-org-custom-assignment', employeeId: target.employeeId, applicationId: 'ai-pdm', roleId: custom.stableRoleId,
      roleCodeSnapshot: custom.roleCode, roleNameSnapshot: custom.displayName, catalogVersion: currentTuple.catalogVersion,
      scope: { kind: 'workspace', value: 'company-jenfu' }, status: 'active', validFrom: now, validTo: expiresAt, effectState: 'not-synchronized' }
    // Cases append below. Product writes, never owner-DML seeding, create this assignment.
    await check('QA058-16-real-http-commit-drop-query-replay', async () => {
      const body = { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT', commandId: crypto.randomUUID(), reason: 'native command recovery', value: assignment } }
      dropNext = true
      await assert.rejects(() => call('PATCH', '/draft', body))
      const result = await call('GET', '/commands/' + encodeURIComponent(body.command.commandId))
      assert.equal(result.status, 200)
      assert.equal(result.body.status, 'committed')
      assert.equal(result.body.result.outcome, 'applied')
      const beforeReplay = await effects()
      const replay = await call('PATCH', '/draft', body)
      assert.equal(replay.status, 200)
      assert.equal(replay.body.status, 'replayed')
      assert.deepEqual(await effects(), beforeReplay)
      const read = await store.readExistingGovernanceStore(orgRoot)
      assert.equal(read.document.auditEvents.filter(event => event.commandId === body.command.commandId).length, 1)
      const changed = await call('PATCH', '/draft', { ...body, command: { ...body.command, reason: 'different' } })
      assert.equal(changed.status, 409)
      assert.deepEqual(await effects(), beforeReplay)
      // Own command evidence must remain queryable without the producer view.
      await admin.query('REVOKE SELECT ON ai_pdm_contract.v_application_role_catalog_v2 FROM jenfu_orgmaster_runtime')
      try {
        assert.equal((await orgRuntime.query("SELECT has_table_privilege(current_user,'ai_pdm_contract.v_application_role_catalog_v2','SELECT') AS allowed")).rows[0].allowed, false)
        await assert.rejects(() => catalogReader.readPublishedAiPdmRoleCatalogFromDatabase(orgRuntime))
        const offline = await call('GET', '/commands/' + encodeURIComponent(body.command.commandId))
        assert.equal(offline.status, 200)
        assert.deepEqual(offline.body, result.body)
      } finally {
        await admin.query('GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v2 TO jenfu_orgmaster_runtime')
      }
      assert.deepEqual(await effects(), beforeReplay)
    })

    const qa16 = 'QA058-16-real-http-commit-drop-query-replay'
    const baselineId = 'actual-http-publication-and-admitted-pdm-target-positive'
    const targetSessions = new Map()
    const trustPolicy = { enabled: false, domains: [], allowAal1PrivilegedPilot: false }
    const decisionFor = (link, permissionCode = 'pdm.drawing.view') => requestGuard.withVerifiedJenfuPrincipalRequest({ ...targetSessions.get(link.principalId),
      identityIssuer: link.issuer, trustPolicy, database: client },
    (snapshot, actor) => permissionService.evaluatePrincipalResourcePermissionsInSnapshot(snapshot, actor,
      [{ permissionKind: 'action', permissionCode }], { workspaceCode: 'company-jenfu' }))
    const targetDecision = () => decisionFor(target)
    const privilegedAdminDecision = () => decisionFor(privilegedTarget, 'settings.admin_matrix')
    const { JenfuEntitlementRepositoryError } = await imp(pdmRoot, 'src/lib/repositories/jenfu-entitlement-repository.ts')
    const assertNoPublishedGrant = link => assert.rejects(() => decisionFor(link), error =>
      error instanceof JenfuEntitlementRepositoryError && error.code === 'permission_not_granted')
    const targetGrants = async () => (await orgRuntime.query(`SELECT assignment_id,assignment_version_id,
      assignment_version::text,role_code,catalog_version,scope_kind,scope_key,valid_from,valid_until
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
      WHERE principal_id=$1 AND assignment_id=$2`, [target.principalId, assignment.id])).rows
    async function admitPdmTarget(link, email, accountType = 'human_personal', assuranceLevel = 'aal1') {
      const typed = (await admin.query(`SELECT mapping_version::text,published_at
        FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1`, [link.principalId])).rows[0]
      assert.ok(typed)
      await tx(c => c.queryOne(`SELECT ai_pdm_core.ensure_authorized_first_login_account_v1(
        :issuer,:subject,:principal,:employee,:accountType,CAST(:mapping AS bigint),
        CAST(:published AS timestamptz),:email) AS account`, { issuer: link.issuer, subject: link.subject,
        principal: link.principalId, employee: link.employeeId, mapping: typed.mapping_version,
        published: new Date(typed.published_at).toISOString(), email, accountType }))
      const profile = (await admin.query('SELECT * FROM ai_pdm_core.principal_accounts WHERE principal_id=$1', [link.principalId])).rows[0]
      const keyRing = { issuer: 'task-owned-native', audience: 'ai-pdm', currentKeyId: 'native-key',
        keys: { 'native-key': crypto.randomBytes(32).toString('hex') } }
      const issuedAt = Math.floor(Date.now() / 1000)
      const token = sessionTokens.issueJenfuPrincipalSession({ principalId: link.principalId,
        employeeId: link.employeeId, identityIssuer: link.issuer, identitySubject: link.subject,
        authEpoch: 0, accountLifecycleVersion: Number(profile.lifecycle_version), profileVersion: Number(profile.profile_version),
        companyId: profile.company_id, authenticatedAt: issuedAt, assuranceLevel, secondFactor: assuranceLevel === 'aal2' ? 'totp' : null,
        assurancePolicyHash: assurance.principalAssurancePolicyHash(trustPolicy), maxAgeSeconds: 3600 }, keyRing, issuedAt)
      const claims = sessionTokens.verifyJenfuPrincipalSession(token, keyRing)
      await tx(c => new pdmSessions.JenfuPrincipalSessionRegistry(c).register(claims))
      targetSessions.set(link.principalId, { token, keyRing })
    }
    await check(baselineId, async () => {
      assert.equal(custom.delegationAllowed, true)
      // Keep the delegated source independent from the assignment whose
      // validity/catalog is deliberately expanded in the separate race case.
      const sourceAssignmentId = 'native-delegation-source'
      const sourceAssignment = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT',
        commandId: crypto.randomUUID(), reason: 'task-owned actual delegation source', value: {
          ...assignment, id: sourceAssignmentId, employeeId: delegationSourceEmployeeId,
        } } })
      assert.equal(sourceAssignment.status, 200, JSON.stringify(sourceAssignment.body))
      const delegated = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_DELEGATION',
        commandId: crypto.randomUUID(), reason: 'task-owned actual delegation', value: {
          id: 'native-custom-delegation', sourceAssignmentId, fromEmployeeId: delegationSourceEmployeeId,
          toEmployeeId: delegatedTarget.employeeId, applicationId: 'ai-pdm', roleId: custom.stableRoleId,
          catalogVersion: currentTuple.catalogVersion, scope: assignment.scope, status: 'active', validFrom: now,
          validTo: new Date(Date.parse(expiresAt) - 60000).toISOString(), reason: 'task-owned delegation', effectState: 'not-synchronized',
        } } })
      assert.equal(delegated.status, 200, JSON.stringify(delegated.body))
      const published = await call('POST', '/versions', { ...await binding(), commandId: crypto.randomUUID(),
        reason: 'task-owned actual target publication', organizationVersionId: source.workspaceVersionId })
      assert.equal(published.status, 201, JSON.stringify(published.body))
      await admitPdmTarget(target, 'native-target@example.test')
      await admitPdmTarget(delegatedTarget, 'native-delegate@example.test')
      assert.equal((await targetGrants()).length, 1)
      const [decision] = await targetDecision()
      assert.equal(decision.allowed, true, decision.decisionCode)
      assert.equal(decision.assignmentId, assignment.id)
      assert.equal(decision.roleCode, custom.roleCode)
      const [delegatedDecision] = await decisionFor(delegatedTarget)
      assert.equal(delegatedDecision.allowed, true, delegatedDecision.decisionCode)
      assert.equal(delegatedDecision.roleCode, custom.roleCode)
    }, [qa16])

    const qa14 = 'QA058-14-native-role-capability-source-invalidation'
    await check(qa14, async () => {
      const roleId = 'role-rd-manager'
      const rolePath = '/applications/ai-pdm/role-capabilities/' + encodeURIComponent(roleId)
      const expected = async () => {
        const roleWorkspace = await call('GET', '/applications/ai-pdm/role-capabilities')
        assert.equal(roleWorkspace.status, 200, JSON.stringify(roleWorkspace.body))
        return { expectedCatalogVersion: roleWorkspace.body.catalogVersion, expectedCatalogPayloadHash: roleWorkspace.body.catalogPayloadHash,
          expectedGovernanceRevision: roleWorkspace.body.governanceRevision, expectedOrganizationRevision: roleWorkspace.body.organizationRevision }
      }
      const initial = await call('GET', rolePath)
      assert.equal(initial.status, 200, JSON.stringify(initial.body))
      const adoptedPositionIds = ['position-management-manager', 'position-marketing-specialist']
      const adoption = { ...await expected(), operation: 'set_position_adoptions', adoptedPositionIds,
        baseProjectionCursor: initial.body.changeCursor, reason: 'native QA058-14 position adoption' }
      const adoptionPreview = await call('POST', rolePath + '/preview', adoption)
      assert.equal(adoptionPreview.status, 200, JSON.stringify(adoptionPreview.body))
      const adoptionPublish = await call('POST', rolePath + '/publish', { ...adoption, commandId: crypto.randomUUID() })
      assert.equal(adoptionPublish.status, 200, JSON.stringify(adoptionPublish.body))
      assert.equal(adoptionPublish.body.receipt.receiptStatus, 'applied')
      const afterAdoption = await call('GET', rolePath)
      assert.deepEqual(afterAdoption.body.positions.filter(position => position.adopted).map(position => position.positionId).sort(), [...adoptedPositionIds].sort())

      const sourceChange = { ...await expected(), operation: 'set_assignment_sources', changes: [{ employeeId: 'employee-youhao', positionId: 'position-management-manager', selected: true }],
        baseProjectionCursor: afterAdoption.body.changeCursor, reason: 'native QA058-14 assignment source selection' }
      const sourcePreview = await call('POST', rolePath + '/preview', sourceChange)
      assert.equal(sourcePreview.status, 200, JSON.stringify(sourcePreview.body))
      const sourcePublish = await call('POST', rolePath + '/publish', { ...sourceChange, commandId: crypto.randomUUID() })
      assert.equal(sourcePublish.status, 200, JSON.stringify(sourcePublish.body))
      const selectedProjection = await call('GET', rolePath)
      const selectedEmployee = selectedProjection.body.positions.find(position => position.positionId === 'position-management-manager')?.employees.find(employee => employee.employeeId === 'employee-youhao')
      assert.deepEqual(selectedEmployee && { sourceSelected: selectedEmployee.sourceSelected, effectiveHolder: selectedEmployee.effectiveHolder, sourceCount: selectedEmployee.sourceCount },
        { sourceSelected: true, effectiveHolder: true, sourceCount: 1 })

      const workspaceStore = await imp(orgRoot, 'server/orgmasterWorkspaceStore.ts')
      const currentWorkspace = await workspaceStore.getWorkspaceVersion(orgRoot, 'current')
      const expiredState = structuredClone(currentWorkspace.document.state)
      const expired = expiredState.assignments.find(value => value.id === 'assignment-management-manager-youhao')
      assert.ok(expired, 'QA058-14-SOURCE_ASSIGNMENT_MUST_EXIST')
      expired.validTo = '2026-01-02'
      expiredState.employees.find(employee => employee.id === 'employee-youhao').primaryAssignmentId = 'assignment-marketing-specialist-youhao'
      const expiredDocument = documentStorage.createOrgDocumentFile(expiredState, 'document', currentWorkspace.document.savedAt)
      await workspaceStore.saveWorkspaceVersion(orgRoot, 'current', expiredDocument, currentWorkspace.version.revision, 'current-maintenance', manager.link.principalId)

      const afterSourceExpiry = await call('GET', rolePath)
      const survivingEmployee = afterSourceExpiry.body.positions.find(position => position.positionId === 'position-marketing-specialist')?.employees.find(employee => employee.employeeId === 'employee-youhao')
      assert.deepEqual(survivingEmployee && { sourceSelected: survivingEmployee.sourceSelected, effectiveHolder: survivingEmployee.effectiveHolder, sourceCount: survivingEmployee.sourceCount },
        { sourceSelected: false, effectiveHolder: false, sourceCount: 0 })
      const configuredStateDirectory = process.env.ORGMASTER_GOVERNANCE_DATA_DIR?.trim()
      const statePath = path.resolve(orgRoot, configuredStateDirectory || 'data', 'ai-pdm-role-capability.v1.json')
      const persisted = JSON.parse(readFileSync(statePath, 'utf8'))
      assert.deepEqual(persisted.assignmentSourcesByRole[roleId], [{ employeeId: 'employee-youhao', positionId: 'position-management-manager' }])
    }, [baselineId])

    const qa22 = 'QA058-22-native-dedicated-system-admin-exact-principal'
    await check(qa22, async () => {
      const current = await store.readExistingGovernanceStore(orgRoot)
      const privilegedAdmission = current.document.draft.principalAdmissions.find(value => value.identityLinkId === privilegedTarget.id)
      assert.ok(privilegedAdmission, 'QA058-22-PRIVILEGED_ADMISSION_MUST_EXIST')
      const bound = await binding()
      const expected = { catalogVersion: bound.expectedCatalog.catalogVersion, catalogPayloadHash: bound.expectedCatalog.catalogSha256,
        governanceRevision: bound.expectedRevision, organizationRevision: bound.expectedOrganizationRevision }
      const request = { contractVersion: 'orgmaster.privileged-assignment-operation.v1', phase: 'preview', operation: 'grant_system_admin',
        applicationId: 'ai-pdm', stableRoleId: 'role-system-admin',
        payload: { employeeId: privilegedTarget.employeeId, principalAdmissionId: privilegedAdmission.id }, expected,
        reason: 'native QA058-22 exact Principal dedicated grant' }
      const preview = await call('POST', '/privileged-assignments/preview', request)
      assert.equal(preview.status, 200, JSON.stringify(preview.body))
      assert.equal(preview.body.operation, 'grant_system_admin')
      const commandId = crypto.randomUUID()
      const published = await call('POST', '/privileged-assignments/publish', { ...request, phase: 'publish', commandId,
        requestHash: preview.body.requestHash, preview: preview.body.preview })
      assert.equal(published.status, 200, JSON.stringify(published.body))
      assert.equal(published.body.receiptStatus, 'applied')

      const orgReadback = await call('GET', '/privileged-assignments?applicationId=ai-pdm&stableRoleId=role-system-admin')
      assert.equal(orgReadback.status, 200, JSON.stringify(orgReadback.body))
      assert.ok(orgReadback.body.assignments.some(value => value.employeeId === privilegedTarget.employeeId && value.status === 'active'))
      const grants = (await orgRuntime.query(`SELECT principal_id,grant_kind,assignment_id,role_code,scope_kind,scope_key
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
        WHERE principal_id=$1 AND role_code='system_admin'`, [privilegedTarget.principalId])).rows
      assert.equal(grants.length, 1)
      assert.deepEqual(grants[0], { principal_id: privilegedTarget.principalId, grant_kind: 'direct', assignment_id: grants[0].assignment_id,
        role_code: 'system_admin', scope_kind: 'global', scope_key: null })

      await admitPdmTarget(privilegedTarget, 'native-privileged@example.test', 'human_privileged', 'aal2')
      const [allowed] = await privilegedAdminDecision()
      assert.equal(allowed.allowed, true, allowed.decisionCode)
      assert.equal(allowed.roleCode, 'system_admin')
      assert.equal(allowed.assignmentId, grants[0].assignment_id)
      const [differentPrincipal] = await decisionFor(target, 'settings.admin_matrix')
      assert.equal(differentPrincipal.allowed, false, differentPrincipal.decisionCode)
      assert.equal(differentPrincipal.decisionCode, 'permission_not_granted')
      assert.equal(differentPrincipal.roleCode, null)
    }, [baselineId])

    await check('QA058-24-org-http-outage-pdm-business-read', async () => {
      const profile = (await admin.query('SELECT pdm_user_id FROM ai_pdm_core.principal_accounts WHERE principal_id=$1', [target.principalId])).rows[0]
      // Business data is a prerequisite; the permission and assignment were
      // produced by the real PDM apply and Org API above, never seeded here.
      // The shared manager fixture uses a deliberately noncanonical company
      // code; this real business route requires the existing JENFU binding.
      assert.equal((await admin.query(`UPDATE ai_pdm_core.companies SET company_code='JENFU'
        WHERE id='company-jenfu' AND company_code='DEV058-TASK-FIXTURE' AND company_kind='business'`)).rowCount, 1)
      await admin.query("INSERT INTO ai_pdm_core.items(id,part_number,part_name) VALUES('native-outage-item','native-outage-part','隔離停機前置零件')")
      await admin.query(`INSERT INTO ai_pdm_core.drawings(id,company_id,drawing_number,owner_id,created_by)
        VALUES('native-outage-drawing','company-jenfu','native-outage-drawing',$1,$1)`, [profile.pdm_user_id])
      await admin.query(`INSERT INTO ai_pdm_core.submissions(id,item_id,drawing_number,revision,material,surface_finish,
        document_type,change_description,status,submitted_by,source_entity_type,source_entity_id)
        VALUES('native-outage-submission','native-outage-item','native-outage-drawing','A','fixture','fixture',
        'drawing','task-owned read prerequisite','Pending',$1,'drawing','native-outage-drawing')`, [profile.pdm_user_id])
      const session = targetSessions.get(target.principalId)
      const environment = {
        PDM_DB_PROVIDER: 'postgres', PDM_POSTGRES_URL: `postgresql://jenfu_ai_pdm_runtime@${handle.host}:${handle.port}/${handle.databaseName}`,
        PDM_POSTGRES_MAX_CONNECTIONS: '1', DEV010_N2_DATABASE_BOUNDARY: 'required',
        PDM_AUTH_MODE: 'firebase_bff', PDM_JENFU_PLATFORM_AUTH_MODE: 'on', PDM_JENFU_ENTITLEMENT_MODE: 'enforce',
        JENFU_FIREBASE_PROJECT_ID: 'task-owned-native', PDM_FIREBASE_PROJECT_ID: 'task-owned-native',
        JENFU_IDENTITY_AUDIENCE: 'task-owned-native', JENFU_IDENTITY_ISSUER: target.issuer,
        PDM_SESSION_ISSUER: session.keyRing.issuer, PDM_SESSION_AUDIENCE: session.keyRing.audience,
        PDM_SESSION_CURRENT_KEY_ID: session.keyRing.currentKeyId,
        PDM_SESSION_CURRENT_SECRET: session.keyRing.keys[session.keyRing.currentKeyId],
        PDM_SESSION_PREVIOUS_KEY_ID: '', PDM_SESSION_PREVIOUS_SECRET: '',
        PDM_TRUST_GOOGLE_WORKSPACE_MFA: 'false', PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED: 'false', PDM_GOOGLE_WORKSPACE_DOMAINS: '',
      }
      const previous = Object.fromEntries(Object.keys(environment).map(name => [name, process.env[name]]))
      Object.assign(process.env, environment)
      let stopped = false
      try {
        const route = await imp(pdmRoot, 'src/app/api/submissions/route.ts')
        const routeDatabase = dbProvider.getAsyncDatabaseClient()
        const transaction = routeDatabase.transaction.bind(routeDatabase)
        routeDatabase.transaction = async (run, options) => {
          try { return await transaction(run, options) }
          catch (error) {
            // Retain the real dependency failure before the HTTP handler maps
            // it to 503. No session token, key, query parameters or payload.
            console.log(JSON.stringify({ pdmBusinessReadFailure: { code: error.code ?? error.name,
              at: String(error.stack).split('\n').map(line => line.trim()).filter(line => line.startsWith('at ')).slice(0, 7) } }))
            throw error
          }
        }
        const readBusiness = async () => {
          const response = await route.GET(new Request('http://127.0.0.1/api/submissions', {
            headers: { cookie: 'pdm_session=' + session.token },
          }))
          const body = await response.json()
          assert.equal(response.status, 200, JSON.stringify(body))
          const row = body.submissions.find(value => value.id === 'native-outage-submission')
          assert.ok(row, 'AUTHORIZED_NONEMPTY_BUSINESS_READ_REQUIRED')
          assert.equal(row.drawing_number, 'native-outage-drawing')
          return row.id
        }
        assert.equal(await readBusiness(), 'native-outage-submission')
        const before = await effects(), grants = await targetGrants()
        const idpState = (await admin.query('SELECT * FROM platform_contract.task_owned_principal_auth_state ORDER BY principal_id')).rows
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
        stopped = true
        assert.equal(await portReleased(httpPort), true, 'ORG_HTTP_MUST_ACTUALLY_STOP')
        await assert.rejects(() => call('GET', '/session'), error => error.cause?.code === 'ECONNREFUSED')
        assert.equal((await orgRuntime.query('SELECT 1 AS ready')).rows[0].ready, 1)
        assert.equal(await readBusiness(), 'native-outage-submission')
        assert.equal((await targetDecision())[0].allowed, true)
        assert.deepEqual(await targetGrants(), grants)
        assert.deepEqual(await effects(), before)
        assert.deepEqual((await admin.query('SELECT * FROM platform_contract.task_owned_principal_auth_state ORDER BY principal_id')).rows, idpState)
        console.log(JSON.stringify({ orgHttpOutage: { listenerClosed: true, assignmentApi: 'ECONNREFUSED',
          pdmActualSubmissionRoute: 200, businessRow: 'native-outage-submission', databaseAvailable: true,
          fixtureIdpStateUnchanged: true, assignmentsAndAuditUnchanged: true, normalSso: false } }))
      } finally {
        await dbProvider.closeAsyncDatabaseClient()
        if (stopped) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(httpPort, '127.0.0.1', resolve) })
        for (const [name, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[name]; else process.env[name] = value
        }
      }
      assert.equal((await call('GET', '/session')).status, 200, 'ORG_HTTP_RECOVERY_REQUIRED')
    }, [baselineId])

    const qa17 = 'QA058-17-producer-commits-before-consumer-read'
    await check(qa17, async () => {
      const stale = { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT', commandId: crypto.randomUUID(),
        reason: 'preflight before producer change', value: { ...assignment, validTo: new Date(Date.parse(expiresAt) + 600000).toISOString() } } }
      const pdmRequest = await prepare([], [{ roleRef: { stableRoleId: custom.stableRoleId },
        groupId: 'drawing', actionId: 'edit', enabled: true }])
      const applied = await tx(c => service.applyRolePolicy(c, verified, pdmRequest))
      currentTuple = await tuple()
      assert.equal(currentTuple.catalogVersion, applied.catalogVersion)
      assert.notEqual(currentTuple.catalogVersion, stale.expectedCatalog.catalogVersion)
      const before = await effects()
      const response = await call('PATCH', '/draft', stale)
      assert.equal(response.status, 409, JSON.stringify(response.body))
      assert.equal(response.body.error, 'EXTERNAL_CATALOG_VERSION_CONFLICT')
      assert.deepEqual(await effects(), before)
      assert.equal((await store.readExistingGovernanceStore(orgRoot)).document.auditEvents.some(event => event.commandId === stale.command.commandId), false)
    }, [baselineId])

    const qa18 = 'QA058-18-consumer-frozen-before-producer-inactive-commit'
    await check(qa18, async () => {
      const frozenTuple = await tuple()
      const updated = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT',
        commandId: crypto.randomUUID(), reason: 'native overlap extension',
        value: { ...assignment, catalogVersion: frozenTuple.catalogVersion,
          validTo: new Date(Date.parse(expiresAt) + 1200000).toISOString() } } })
      assert.equal(updated.status, 200, JSON.stringify(updated.body))
      assert.equal((await targetDecision())[0].allowed, true)
      const publishBody = { ...await binding(), commandId: crypto.randomUUID(),
        reason: 'native frozen snapshot overlap', organizationVersionId: source.workspaceVersionId }
      const pdmRequest = await prepare([{ type: 'deactivate', stableRoleId: custom.stableRoleId }])
      let pdmPending, orgPending
      await admin.query('BEGIN')
      try {
        await admin.query("SELECT 1 FROM ai_pdm_core.active_role_catalog WHERE application_id='ai-pdm' FOR UPDATE")
        pdmPending = tx(c => service.applyRolePolicy(c, verified, pdmRequest))
          .then(value => ({ value }), error => ({ error }))
        const pdmPid = await waitForLock(observer, 'dev058-org-pdm-apply', 'role_policy_lock_apply_v1')
        orgPending = call('POST', '/versions', publishBody).then(value => ({ value }), error => ({ error }))
        const orgPid = await waitForLock(observer, 'dev010-n2-orgmaster-dev058-org-http-writer',
          'write_active_persistence_artifacts_with_identity_fence_v2', pdmPid)
        console.log(JSON.stringify({ overlapLocksObserved: { pdmPid, orgPid, frozenCatalogVersion: frozenTuple.catalogVersion } }))
        await admin.query('COMMIT')
        const producer = await pdmPending, consumer = await orgPending
        if (producer.error) throw producer.error
        if (consumer.error) throw consumer.error
        assert.equal(consumer.value.status, 201, JSON.stringify(consumer.value.body))
        currentTuple = await tuple()
        assert.equal(currentTuple.catalogVersion, producer.value.catalogVersion)
        assert.notEqual(currentTuple.catalogVersion, frozenTuple.catalogVersion)
        const committed = await store.readExistingGovernanceStore(orgRoot)
        const version = committed.document.publishedVersions.find(value => value.id === committed.document.activePolicyVersionId)
        assert.equal(version.externalRoleCatalogs.find(value => value.applicationId === 'ai-pdm').catalogVersion, frozenTuple.catalogVersion)
        assert.equal(version.policy.roleAssignments.find(value => value.id === assignment.id).status, 'active')
        const grants = await targetGrants()
        assert.equal(grants.length, 1, 'INACTIVE_MUST_NOT_ERASE_OWN_ASSIGNMENT')
        assert.equal(grants[0].scope_kind, 'workspace')
        assert.equal(grants[0].scope_key, 'company-jenfu')
        assert.equal(grants[0].assignment_version_id, version.id)
        const status = (await orgRuntime.query(`SELECT role_status FROM ai_pdm_contract.v_application_role_catalog_v2
          WHERE stable_role_id=$1`, [custom.stableRoleId])).rows
        assert.deepEqual(status, [{ role_status: 'inactive' }])
        const [decision] = await targetDecision()
        assert.equal(decision.allowed, false)
        assert.equal(decision.decisionCode, 'permission_not_granted')
        assert.equal(decision.roleCode, null)
      } finally {
        await admin.query('ROLLBACK').catch(() => undefined)
        await Promise.allSettled([pdmPending, orgPending].filter(Boolean))
      }
    }, [qa17])

    const qa10 = 'QA058-10-unpublished-draft-history-after-producer-change'
    await check(qa10, async () => {
      currentTuple = await tuple()
      const reactivateRequest = await prepare([{ type: 'reactivate', stableRoleId: custom.stableRoleId }])
      await tx(c => service.applyRolePolicy(c, verified, reactivateRequest))
      currentTuple = await tuple()
      const draftVersion = currentTuple.catalogVersion
      const updated = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT',
        commandId: crypto.randomUUID(), reason: 'unpublished draft provenance', value: { ...assignment,
          catalogVersion: draftVersion, validTo: new Date(Date.parse(expiresAt) + 1800000).toISOString() } } })
      assert.equal(updated.status, 200, JSON.stringify(updated.body))
      const inactiveRequest = await prepare([{ type: 'deactivate', stableRoleId: custom.stableRoleId }])
      await tx(c => service.applyRolePolicy(c, verified, inactiveRequest))
      currentTuple = await tuple()
      assert.notEqual(currentTuple.catalogVersion, draftVersion)
      const read = await call('GET', '/')
      assert.equal(read.status, 200, JSON.stringify(read.body))
      assert.equal(read.body.document.draft.roleAssignments.find(value => value.id === assignment.id).catalogVersion, draftVersion)
      const grant = await targetGrants()
      assert.equal(grant.length, 1)
      assert.notEqual(grant[0].catalog_version, draftVersion, 'UNPUBLISHED_DRAFT_MUST_NOT_CHANGE_EFFECTIVE_GRANT')
      assert.equal((await targetDecision())[0].allowed, false)
    }, [qa18])

    await check('QA058-12-inactive-direct-delegated-and-active-sibling', async () => {
      assert.equal((await targetDecision())[0].allowed, false)
      const [delegatedDecision] = await decisionFor(delegatedTarget)
      assert.equal(delegatedDecision.allowed, false)
      assert.equal(delegatedDecision.decisionCode, 'permission_not_granted')
      const delegatedGrants = (await orgRuntime.query(`SELECT grant_kind,delegation_id,stable_role_id,
        assignment_id,role_code,scope_kind,scope_key
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1`, [delegatedTarget.principalId])).rows
      assert.deepEqual(delegatedGrants, [{ grant_kind: 'delegated', delegation_id: 'native-custom-delegation',
        stable_role_id: custom.stableRoleId, assignment_id: 'native-custom-delegation', role_code: custom.roleCode,
        scope_kind: 'workspace', scope_key: 'company-jenfu' }])
      const active = await catalogReader.readPublishedAiPdmRoleCatalogFromDatabase(orgRuntime)
      const sibling = active.roles.find(role => role.stableRoleId === 'role-rd')
      assert.equal(sibling.roleStatus, 'active')
      const added = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT',
        commandId: crypto.randomUUID(), reason: 'active sibling remains usable', value: { ...assignment,
          id: 'native-active-sibling', roleId: sibling.stableRoleId, roleCodeSnapshot: sibling.roleCode,
          roleNameSnapshot: sibling.displayName, catalogVersion: active.catalogVersion } } })
      assert.equal(added.status, 200, JSON.stringify(added.body))
      const published = await call('POST', '/versions', { ...await binding(), commandId: crypto.randomUUID(),
        reason: 'native mixed active and inactive roles', organizationVersionId: source.workspaceVersionId })
      assert.equal(published.status, 201, JSON.stringify(published.body))
      const [allowed] = await targetDecision()
      assert.equal(allowed.allowed, true, allowed.decisionCode)
      assert.equal(allowed.roleCode, 'rd')
      assert.equal(allowed.assignmentId, 'native-active-sibling')
      assert.equal((await decisionFor(delegatedTarget))[0].allowed, false)
      assert.equal((await targetGrants()).length, 1, 'INACTIVE_DIRECT_GRANT_MUST_REMAIN_VISIBLE')
    }, [qa10])

    const qa10Alias = 'QA058-10-producer-procurement-alias-reactivate'
    await check(qa10Alias, async () => {
      const aliasIds = ['role-procurement', 'role-production-planning']
      const readAliases = async () => (await orgRuntime.query(`SELECT stable_role_id,role_code,display_name,
        permission_role_id,presentation_name,presentation_order,assignment_disposition,role_status
        FROM ai_pdm_contract.v_application_role_catalog_v2
        WHERE stable_role_id=ANY($1) ORDER BY stable_role_id`, [aliasIds])).rows
      const readPriority = async () => {
        const row = await client.queryOne('SELECT priority_json FROM role_priority_versions WHERE status=\'active\' LIMIT 1')
        assert.ok(row, 'PDM_ROLE_PRIORITY_MUST_EXIST')
        return JSON.parse(row.priority_json)
      }
      const before = await readAliases()
      assert.deepEqual(before.map(row => row.stable_role_id), [...aliasIds].sort())
      assert.deepEqual(before.find(row => row.stable_role_id === 'role-procurement'), {
        stable_role_id: 'role-procurement', role_code: 'procurement', display_name: '採購',
        permission_role_id: 'role-procurement', presentation_name: '採購／生管', presentation_order: 4,
        assignment_disposition: 'selectable', role_status: 'active'
      })
      assert.deepEqual(before.find(row => row.stable_role_id === 'role-production-planning'), {
        stable_role_id: 'role-production-planning', role_code: 'production_planning', display_name: '生管人員',
        permission_role_id: 'role-procurement', presentation_name: '採購／生管（舊生管指派）', presentation_order: 4,
        assignment_disposition: 'legacy-only', role_status: 'active'
      })
      const priority = await readPriority()
      assert.ok(priority.includes('procurement') && priority.includes('production_planning'))

      const deactivate = await prepare([{ type: 'deactivate', stableRoleId: 'role-procurement' }])
      await tx(c => service.applyRolePolicy(c, verified, deactivate))
      currentTuple = await tuple()
      const inactive = await readAliases()
      assert.deepEqual(inactive.map(row => row.role_status), ['inactive', 'inactive'])
      assert.deepEqual(inactive.map(({ role_status: _status, ...row }) => row), before.map(({ role_status: _status, ...row }) => row))
      assert.deepEqual(await readPriority(), priority, 'ALIAS_STATUS_MUST_NOT_CREATE_OR_REORDER_PRIORITY')

      const reactivate = await prepare([{ type: 'reactivate', stableRoleId: 'role-procurement' }])
      await tx(c => service.applyRolePolicy(c, verified, reactivate))
      currentTuple = await tuple()
      const active = await readAliases()
      assert.deepEqual(active.map(row => row.role_status), ['active', 'active'])
      assert.deepEqual(active.map(({ role_status: _status, ...row }) => row), before.map(({ role_status: _status, ...row }) => row))
      assert.deepEqual(await readPriority(), priority, 'ALIAS_REACTIVATION_MUST_PRESERVE_ROLECODE_PRIORITY')
    }, ['QA058-12-inactive-direct-delegated-and-active-sibling'])

    const qa13 = 'QA058-13-revoked-source-not-revived-by-role-restore'
    await check(qa13, async () => {
      const revokedDelegation = await call('PATCH', '/draft', { ...await binding(), command: {
        type: 'REVOKE_ROLE_DELEGATION', commandId: crypto.randomUUID(), reason: 'native revoked source delegation', id: 'native-custom-delegation'
      } })
      assert.equal(revokedDelegation.status, 200, JSON.stringify(revokedDelegation.body))
      const revokedSource = await call('PATCH', '/draft', { ...await binding(), command: {
        type: 'REVOKE_ROLE_ASSIGNMENT', commandId: crypto.randomUUID(), reason: 'native revoked delegation source', id: 'native-delegation-source'
      } })
      assert.equal(revokedSource.status, 200, JSON.stringify(revokedSource.body))
      const published = await call('POST', '/versions', { ...await binding(), commandId: crypto.randomUUID(),
        reason: 'native revoked source projection', organizationVersionId: source.workspaceVersionId })
      assert.equal(published.status, 201, JSON.stringify(published.body))
      const read = await call('GET', '/')
      assert.equal(read.body.document.draft.roleAssignments.find(value => value.id === 'native-delegation-source').status, 'revoked')
      assert.equal(read.body.document.draft.roleDelegations.find(value => value.id === 'native-custom-delegation').status, 'revoked')
      const revokedRows = (await orgRuntime.query(`SELECT grant_kind,delegation_id,assignment_id
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1`, [delegatedTarget.principalId])).rows
      assert.deepEqual(revokedRows, [])
      await assertNoPublishedGrant(delegatedTarget)

      // The real PDM role restore must not recreate an Org source or delegation.
      const restore = await prepare([{ type: 'reactivate', stableRoleId: custom.stableRoleId }])
      await tx(c => service.applyRolePolicy(c, verified, restore))
      currentTuple = await tuple()
      const restoredCatalog = await catalogReader.readPublishedAiPdmRoleCatalogFromDatabase(orgRuntime)
      assert.equal(restoredCatalog.roles.find(role => role.stableRoleId === custom.stableRoleId).roleStatus, 'active')
      const afterRestoreRows = (await orgRuntime.query(`SELECT grant_kind,delegation_id,assignment_id
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1`, [delegatedTarget.principalId])).rows
      assert.deepEqual(afterRestoreRows, [])
      await assertNoPublishedGrant(delegatedTarget)
    }, ['QA058-12-inactive-direct-delegated-and-active-sibling'])

    const qa15 = 'QA058-15-expired-source-not-revived-by-role-restore'
    await check(qa15, async () => {
      const expiredSourceFrom = new Date(Date.now() - 5 * 3600000).toISOString()
      const expiredSourceTo = new Date(Date.now() - 3 * 3600000).toISOString()
      const expiredDelegationTo = new Date(Date.now() - 4 * 3600000).toISOString()
      const expiredSource = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_ASSIGNMENT',
        commandId: crypto.randomUUID(), reason: 'native expired delegation source', value: { ...assignment,
          id: 'native-expired-delegation-source', employeeId: delegationSourceEmployeeId,
          catalogVersion: currentTuple.catalogVersion,
          validFrom: expiredSourceFrom, validTo: expiredSourceTo } } })
      assert.equal(expiredSource.status, 200, JSON.stringify(expiredSource.body))
      const expiredDelegation = await call('PATCH', '/draft', { ...await binding(), command: { type: 'UPSERT_ROLE_DELEGATION',
        commandId: crypto.randomUUID(), reason: 'native expired delegation', value: {
          id: 'native-expired-delegation', sourceAssignmentId: 'native-expired-delegation-source',
          fromEmployeeId: delegationSourceEmployeeId, toEmployeeId: delegatedTarget.employeeId,
          applicationId: 'ai-pdm', roleId: custom.stableRoleId, catalogVersion: currentTuple.catalogVersion,
          scope: assignment.scope, status: 'active', validFrom: expiredSourceFrom, validTo: expiredDelegationTo,
          reason: 'native expired delegation', effectState: 'not-synchronized'
        } } })
      assert.equal(expiredDelegation.status, 200, JSON.stringify(expiredDelegation.body))
      const published = await call('POST', '/versions', { ...await binding(), commandId: crypto.randomUUID(),
        reason: 'native expired source projection', organizationVersionId: source.workspaceVersionId })
      assert.equal(published.status, 201, JSON.stringify(published.body))
      const read = await call('GET', '/')
      assert.equal(read.body.document.draft.roleAssignments.find(value => value.id === 'native-expired-delegation-source').validTo, expiredSourceTo)
      assert.equal(read.body.document.draft.roleDelegations.find(value => value.id === 'native-expired-delegation').validTo, expiredDelegationTo)
      const expiredRows = (await orgRuntime.query(`SELECT grant_kind,delegation_id,assignment_id
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1`, [delegatedTarget.principalId])).rows
      assert.deepEqual(expiredRows, [])
      await assertNoPublishedGrant(delegatedTarget)

      const deactivate = await prepare([{ type: 'deactivate', stableRoleId: custom.stableRoleId }])
      await tx(c => service.applyRolePolicy(c, verified, deactivate))
      currentTuple = await tuple()
      const reactivate = await prepare([{ type: 'reactivate', stableRoleId: custom.stableRoleId }])
      await tx(c => service.applyRolePolicy(c, verified, reactivate))
      currentTuple = await tuple()
      const afterRestoreRows = (await orgRuntime.query(`SELECT grant_kind,delegation_id,assignment_id
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1`, [delegatedTarget.principalId])).rows
      assert.deepEqual(afterRestoreRows, [])
      await assertNoPublishedGrant(delegatedTarget)
    }, [qa13])

    await check('QA058-19-org-writer-post-lock-session-revocation', async () => {
      const body = { ...await binding(), command: { type: 'REVOKE_ROLE_ASSIGNMENT',
        commandId: crypto.randomUUID(), reason: 'native actor post-wait revocation', id: assignment.id } }
      const before = await effects()
      let pending
      await admin.query('BEGIN')
      try {
        await admin.query('SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE')
        pending = call('PATCH', '/draft', body).then(value => ({ value }), error => ({ error }))
        const orgPid = await waitForLock(observer, 'dev010-n2-orgmaster-dev058-org-http-writer',
          'write_active_persistence_artifacts_with_identity_fence_v2')
        await sessions.revokeByHash(cookies.hashSessionToken(pepper, token), 'task-owned native wait revocation')
        assert.equal((await orgRuntime.query('SELECT revoked_at IS NOT NULL AS revoked FROM orgmaster_core.app_sessions WHERE id=$1', [orgSession.id])).rows[0].revoked, true)
        console.log(JSON.stringify({ orgWriterRevocationWhileLocked: { orgPid, revocationCommitted: true } }))
        await admin.query('COMMIT')
        const result = await pending
        if (result.error) throw result.error
        assert.equal(result.value.status, 401, JSON.stringify(result.value.body))
        assert.equal(result.value.body.error, 'IDENTITY_CONTEXT_REQUIRED')
        assert.deepEqual(await effects(), before)
        const read = await store.readExistingGovernanceStore(orgRoot)
        assert.equal(read.document.auditEvents.some(event => event.commandId === body.command.commandId), false)
      } finally {
        await admin.query('ROLLBACK').catch(() => undefined)
        await Promise.allSettled([pending].filter(Boolean))
      }
    }, [qa10])
    await check('direct-execution-inputs-unchanged', async () => assert.deepEqual(inputHashes(), testedInputs))
    console.log(JSON.stringify({ status: cases.every(value => value.status === 'PASS') ? 'PASS' : 'FAIL', cases, identityEvidence: 'synthetic-issuance-real-cookie-auth-and-db', production: false }))
  } finally {
    await admin.query('ROLLBACK').catch(() => undefined)
    if (server) {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      console.log(JSON.stringify({ orgHttpCleanup: { serverClosed: true, portReleased: await portReleased(httpPort) } }))
      // The parent releases the registered Node fingerprint after this process
      // has exited; a closed HTTP listener does not mean its process has exited.
      if (httpRegistered) console.log(JSON.stringify({ orgHttpRuntimeReleaseRequired: { pid: process.pid, startToken: httpStartToken } }))
    }
    await persistence.closeOrgmasterPersistencePool()
    await client.close()
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value
    }
  }
})
if (cases.some(value => value.status !== 'PASS')) throw new Error('ORG_NATIVE_JOURNEY_FAILED')
