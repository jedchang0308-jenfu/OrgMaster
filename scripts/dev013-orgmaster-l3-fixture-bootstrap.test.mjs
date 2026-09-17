import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer as createViteModuleLoader } from 'vite'

import {
  DEV013_ORGMASTER_FIXTURE_APPROVAL,
  DEV013_ORGMASTER_FIXTURE_TARGET,
  assertDev013OrgmasterFixtureEnvironment,
  buildDev013OrgmasterFixture,
  summarizeDev013OrgmasterFixture,
} from './lib/dev013-orgmaster-l3-fixture-bootstrap.mjs'

const uid = 'SyntheticUidDev013PBoth1234567890'

test('DEV-013 OrgMaster fixture is deterministic and grants both applications', () => {
  const first = buildDev013OrgmasterFixture(uid)
  const second = buildDev013OrgmasterFixture(uid)
  assert.equal(first.sourceRevision, second.sourceRevision)
  assert.deepEqual(first.artifacts.map((item) => item.artifactKey), ['orgmaster-workspace.v1.json', 'orgmaster-versions/current-dev013-p-both-v1.json', 'orgmaster-governance.v3.json'])
  const governance = first.artifacts.find((item) => item.artifactKind === 'governance').payload
  assert.deepEqual(governance.publishedVersions[0].policy.roleAssignments.map((item) => [item.applicationId, item.roleId]), [['orgmaster', 'role-orgmaster-admin'], ['ai-pdm', 'role-rd']])
  assert.equal(governance.publishedVersions[0].policy.principalAdmissions[0].accountType, 'human_personal')
})

test('DEV-013 OrgMaster fixture passes the production workspace and governance validators', async () => {
  const loader = await createViteModuleLoader({ root: process.cwd(), configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const [{ parseOrgDocument }, { validateDocumentV3 }] = await Promise.all([
      loader.ssrLoadModule('/src/documentStorage.ts'),
      loader.ssrLoadModule('/src/governance/validation.ts'),
    ])
    const fixture = buildDev013OrgmasterFixture(uid)
    const workspace = fixture.artifacts.find((item) => item.artifactKind === 'workspace-version')
    const governance = fixture.artifacts.find((item) => item.artifactKind === 'governance').payload
    const parsed = parseOrgDocument(workspace.payload)
    assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.code)
    const source = {
      workspaceVersionId: 'current-dev013-p-both-v1',
      workspaceRevision: workspace.sourceSha256,
      sourceDataAt: workspace.payload.savedAt,
      state: workspace.payload.state,
    }
    assert.deepEqual(validateDocumentV3(governance, source, governance.publishedVersions[0].externalRoleCatalogs), [])
  } finally {
    await loader.close()
  }
})

test('DEV-013 OrgMaster fixture environment is exact-target and fail closed', () => {
  const env = {
    DEV013_L3_FIXTURE_APPROVAL: DEV013_ORGMASTER_FIXTURE_APPROVAL,
    DEV013_TARGET_PROJECT_ID: DEV013_ORGMASTER_FIXTURE_TARGET.projectId,
    DEV013_TARGET_REGION: DEV013_ORGMASTER_FIXTURE_TARGET.region,
    DEV013_TARGET_CLOUD_SQL_INSTANCE: DEV013_ORGMASTER_FIXTURE_TARGET.cloudSqlInstance,
    DEV013_TARGET_DATABASE: DEV013_ORGMASTER_FIXTURE_TARGET.database,
    DEV013_DATABASE_USER: DEV013_ORGMASTER_FIXTURE_TARGET.databaseUser,
    DEV013_FIXTURE_FIREBASE_UID: uid,
  }
  assert.equal(assertDev013OrgmasterFixtureEnvironment(env).identitySubject, uid)
  assert.throws(() => assertDev013OrgmasterFixtureEnvironment({ ...env, DEV013_TARGET_DATABASE: 'jenfu_prod' }), /DEV013_FIXTURE_TARGET_MISMATCH/u)
})

test('DEV-013 OrgMaster receipt excludes the raw identity subject', () => {
  const fixture = buildDev013OrgmasterFixture(uid)
  const receipt = summarizeDev013OrgmasterFixture(fixture, { replayed: false, authorityVersion: 1, principalCount: 1, visibleApplications: ['ai-pdm', 'orgmaster'], effectiveRoleCount: 1 })
  assert.equal(JSON.stringify(receipt).includes(uid), false)
  assert.equal(receipt.containsRawIdentity, false)
})
