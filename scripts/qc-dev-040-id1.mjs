import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(process.cwd())
const fixture = await mkdtemp(join(tmpdir(), 'orgmaster-dev040-id1-'))
const artifact = await mkdtemp(join(tmpdir(), 'orgmaster-dev040-artifact-'))
const crashFixture = await mkdtemp(join(tmpdir(), 'orgmaster-dev040-crash-'))
const crashArtifact = await mkdtemp(join(tmpdir(), 'orgmaster-dev040-crash-artifact-'))
const oldEmployee = 'employee-fixture-semantic-001'
const workspace = { app: 'OrgMaster', version: 7, kind: 'document', savedAt: '2026-09-01T00:00:00.000Z', state: { employees: [{ id: oldEmployee, name: 'Fixture', status: 'active', departmentIds: [], primaryAssignmentId: 'assignment-1', administrativeApproverOverrideEmployeeId: null }], assignments: [{ id: 'assignment-1', employeeId: oldEmployee, positionId: 'position-1', assignmentType: 'regular', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }] } }
const governance = { app: 'OrgMaster', schemaVersion: 2, draft: { identityLinks: [{ id: 'link-1', employeeId: oldEmployee, issuer: 'fixture', subject: 'fixture', status: 'active' }], roleAssignments: [{ id: 'role-assignment-1', employeeId: oldEmployee }], roleDelegations: [{ id: 'delegation-1', fromEmployeeId: oldEmployee, toEmployeeId: oldEmployee }], principalAdmissions: [] }, publishedVersions: [{ kind: 'assignment-governance-v2', id: 'active-policy-v7', versionNumber: 7, policy: {}, externalRoleCatalogs: [], effectState: 'not-synchronized', organizationSnapshot: {} }, { kind: 'assignment-governance-v2', id: 'historical-policy-v1', versionNumber: 6, policy: {}, organizationSnapshot: {} }], activePolicyVersionId: 'active-policy-v7', auditEvents: [{ id: 'historical-audit', commandId: 'old', commandHash: 'old', occurredAt: '2025-01-01T00:00:00.000Z', actorPrincipalId: 'old', action: 'OLD', entityType: 'governance', entityId: null, reason: 'old', beforeHash: null, afterHash: null, previousEventHash: null, eventHash: 'old' }], migration: { unresolvedAssignments: [], unresolvedDelegations: [] } }
const methods = { methods: [{ id: 'method-1', ownerEmployeeId: oldEmployee, readableSnapshot: { ownerEmployeeId: oldEmployee } }] }
const initialManifestRaw = JSON.stringify({ currentVersionId: 'current-1', entries: [{ id: 'current-1', kind: 'current', status: 'active' }] })
const initialWorkspaceRaw = JSON.stringify(workspace)
const initialGovernanceRaw = JSON.stringify(governance)
const initialMethodsRaw = JSON.stringify(methods)
await mkdir(join(fixture, 'data', 'orgmaster-versions'), { recursive: true })
await writeFile(join(fixture, '.dev040-id1-fixture-root'), JSON.stringify({ contractVersion: 'jenfu.dev040.employee-rekey.v1', purpose: 'isolated-qc' }))
await writeFile(join(fixture, 'data', 'orgmaster-workspace.v1.json'), initialManifestRaw)
await writeFile(join(fixture, 'data', 'orgmaster-versions', 'current-1.json'), initialWorkspaceRaw)
await writeFile(join(fixture, 'data', 'orgmaster-governance.v2.json'), initialGovernanceRaw)
await writeFile(join(fixture, 'data', 'orgmaster-management-methods.v1.json'), initialMethodsRaw)

function run(args) { return new Promise((resolveRun, reject) => { const child = spawn(process.execPath, ['scripts/dev040-rekey-employee-ids.mjs', ...args], { cwd: root }); let output = ''; let error = ''; child.stdout.on('data', (chunk) => { output += chunk }); child.stderr.on('data', (chunk) => { error += chunk }); child.on('close', (code) => { if (code === 0) resolveRun(JSON.parse(output)); else reject(new Error(error)) }) }) }
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
try {
  const planReceipt = await run(['--mode', 'plan', '--source-root', fixture, '--artifact-root', artifact])
  const planPath = join(artifact, 'OrgMaster', 'dev040-id1', planReceipt.planId, 'execution-plan.json')
  const governancePath = join(fixture, 'data', 'orgmaster-governance.v2.json')
  const governanceRaw = await readFile(governancePath, 'utf8')
  const blockedGovernance = JSON.parse(governanceRaw)
  blockedGovernance.draft.employeeAuthorityOverrides = [{ employeeId: oldEmployee, status: 'active' }]
  await writeFile(governancePath, JSON.stringify(blockedGovernance))
  let blocked = false
  try { await run(['--mode', 'plan', '--source-root', fixture, '--artifact-root', artifact]) } catch { blocked = true }
  await writeFile(governancePath, governanceRaw)
  if (!blocked) throw new Error('ID1A runtime-state fail-closed assertion failed')
  const noActiveGovernance = JSON.parse(governanceRaw)
  noActiveGovernance.activePolicyVersionId = null
  await writeFile(governancePath, JSON.stringify(noActiveGovernance))
  const noActivePlan = await run(['--mode', 'plan', '--source-root', fixture, '--artifact-root', artifact])
  const noActivePlanDocument = JSON.parse(await readFile(join(artifact, 'OrgMaster', 'dev040-id1', noActivePlan.planId, 'execution-plan.json'), 'utf8'))
  const noActiveGovernanceTarget = noActivePlanDocument.targets.find((target) => target.key === 'data/orgmaster-governance.v2.json')?.payload
  await writeFile(governancePath, governanceRaw)
  if (noActiveGovernanceTarget?.activePolicyVersionId !== null || noActiveGovernanceTarget?.publishedVersions?.length !== 0) throw new Error('ID1A no-active-policy baseline assertion failed')
  const unknownWorkspace = JSON.parse(initialWorkspaceRaw)
  unknownWorkspace.state.assignments[0].employeeId = 'unknown-employee-reference'
  const workspacePath = join(fixture, 'data', 'orgmaster-versions', 'current-1.json')
  await writeFile(workspacePath, JSON.stringify(unknownWorkspace))
  let unknownReferenceBlocked = false
  try { await run(['--mode', 'plan', '--source-root', fixture, '--artifact-root', artifact]) } catch { unknownReferenceBlocked = true }
  await writeFile(workspacePath, initialWorkspaceRaw)
  if (!unknownReferenceBlocked) throw new Error('ID1A unknown-reference fail-closed assertion failed')
  const driftedWorkspace = JSON.parse(initialWorkspaceRaw)
  driftedWorkspace.state.employees[0].name = 'Drifted'
  await writeFile(workspacePath, JSON.stringify(driftedWorkspace))
  let sourceDriftBlocked = false
  try { await run(['--mode', 'apply-fixture', '--source-root', fixture, '--plan', planPath, '--artifact-root', artifact, '--allow-fixture-write']) } catch { sourceDriftBlocked = true }
  await writeFile(workspacePath, initialWorkspaceRaw)
  if (!sourceDriftBlocked) throw new Error('ID1A source-drift fail-closed assertion failed')
  const applied = await run(['--mode', 'apply-fixture', '--source-root', fixture, '--plan', planPath, '--artifact-root', artifact, '--allow-fixture-write'])
  const noop = await run(['--mode', 'apply-fixture', '--source-root', fixture, '--plan', planPath, '--artifact-root', artifact, '--allow-fixture-write'])
  const migrated = JSON.parse(await readFile(join(fixture, 'data', 'orgmaster-versions', 'current-1.json'), 'utf8'))
  const migratedGovernance = JSON.parse(await readFile(join(fixture, 'data', 'orgmaster-governance.v2.json'), 'utf8'))
  if (migrated.version !== 8 || migrated.state.employees[0].id === oldEmployee || applied.status !== 'APPLIED' || noop.status !== 'NOOP' || migratedGovernance.publishedVersions.length !== 1 || migratedGovernance.publishedVersions[0].versionNumber !== 1 || migratedGovernance.activePolicyVersionId !== 'active-policy-v7' || migratedGovernance.publishedVersions[0].organizationSnapshot.workspaceVersionId !== 'current-1' || migratedGovernance.auditEvents.length !== 1 || migratedGovernance.migration.sourceRevision !== null) throw new Error(`ID1A fixture apply assertion failed: ${JSON.stringify({ version: migrated.version, employee: migrated.state.employees[0].id, status: applied.status, noop: noop.status, publishedVersions: migratedGovernance.publishedVersions.length, auditEvents: migratedGovernance.auditEvents.length })}`)
  await mkdir(join(crashFixture, 'data', 'orgmaster-versions'), { recursive: true })
  await writeFile(join(crashFixture, '.dev040-id1-fixture-root'), JSON.stringify({ contractVersion: 'jenfu.dev040.employee-rekey.v1', purpose: 'isolated-qc' }))
  await writeFile(join(crashFixture, 'data', 'orgmaster-workspace.v1.json'), initialManifestRaw)
  await writeFile(join(crashFixture, 'data', 'orgmaster-versions', 'current-1.json'), initialWorkspaceRaw)
  await writeFile(join(crashFixture, 'data', 'orgmaster-governance.v2.json'), initialGovernanceRaw)
  await writeFile(join(crashFixture, 'data', 'orgmaster-management-methods.v1.json'), initialMethodsRaw)
  const crashPlanReceipt = await run(['--mode', 'plan', '--source-root', crashFixture, '--artifact-root', crashArtifact])
  const crashPlanPath = join(crashArtifact, 'OrgMaster', 'dev040-id1', crashPlanReceipt.planId, 'execution-plan.json')
  const crashPlan = JSON.parse(await readFile(crashPlanPath, 'utf8'))
  const crashRollbackDir = join(crashArtifact, 'OrgMaster', 'dev040-id1', crashPlan.planId, 'rollback')
  await mkdir(crashRollbackDir, { recursive: true })
  const initialByKey = new Map([['data/orgmaster-workspace.v1.json', initialManifestRaw], ['data/orgmaster-versions/current-1.json', initialWorkspaceRaw], ['data/orgmaster-governance.v2.json', initialGovernanceRaw], ['data/orgmaster-management-methods.v1.json', initialMethodsRaw]])
  const crashJournal = { contractVersion: 'jenfu.dev040.employee-rekey.v1', planId: crashPlan.planId, state: 'applying', files: [] }
  for (const target of crashPlan.targets) {
    const original = initialByKey.get(target.key)
    const rollbackPath = join(crashRollbackDir, target.key.replaceAll('/', '__'))
    await writeFile(rollbackPath, original, 'utf8')
    crashJournal.files.push({ key: target.key, rollbackPath, beforeSha256: sha256(original), afterSha256: target.sha256 })
  }
  await writeFile(join(crashArtifact, 'OrgMaster', 'dev040-id1', crashPlan.planId, 'migration-journal.json'), `${JSON.stringify(crashJournal, null, 2)}\n`)
  await writeFile(join(crashFixture, 'data', '.dev040-id1-migration-in-progress.json'), '{}\n')
  await writeFile(join(crashFixture, 'data', 'orgmaster-versions', 'current-1.json'), `${JSON.stringify(crashPlan.targets.find((target) => target.key === 'data/orgmaster-versions/current-1.json').payload, null, 2)}\n`)
  const recovered = await run(['--mode', 'recover-local', '--source-root', crashFixture, '--plan', crashPlanPath, '--artifact-root', crashArtifact, '--action', 'rollback'])
  const recoveredWorkspace = await readFile(join(crashFixture, 'data', 'orgmaster-versions', 'current-1.json'), 'utf8')
  if (recovered.status !== 'ROLLED_BACK' || recoveredWorkspace !== initialWorkspaceRaw) throw new Error('ID1A crash recovery assertion failed')
  process.stdout.write(JSON.stringify({ status: 'PASS', planId: planReceipt.planId, applied: applied.status, idempotent: noop.status, version: migrated.version, cleanBaseline: true, sessions: applied.sessions.status, crashRecovery: recovered.status, rollback: 'prepared' }, null, 2) + '\n')
} finally {
  await rm(fixture, { recursive: true, force: true }); await rm(artifact, { recursive: true, force: true }); await rm(crashFixture, { recursive: true, force: true }); await rm(crashArtifact, { recursive: true, force: true })
}
