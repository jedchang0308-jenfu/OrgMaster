#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = (relative) => readFile(join(root, relative), 'utf8')
const checks = []
async function check(name, task) {
  try { await task(); checks.push({ name, status: 'PASS' }) }
  catch (error) { checks.push({ name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }) }
}
function includesAll(text, values) { for (const value of values) assert.ok(text.includes(value), `missing ${value}`) }

const [migrationBytes, managedSessionMigrationBytes, principalProjectionMigrationBytes, auth, service, repository, admission, client, gate, bridgeExists] = await Promise.all([
  readFile(join(root, 'db', 'migrations', '014_dev050_orgmaster_session_admission.sql')),
  readFile(join(root, 'db', 'migrations', '022_dev014_managed_login_session_admission.sql')),
  readFile(join(root, 'db', 'migrations', '023_dev014_authority_principal_projection_contract.sql')),
  source('server/orgmasterAuthApi.ts'),
  source('server/orgmasterManagedIdentityService.ts'),
  source('server/orgmasterManagedIdentityRepository.ts'),
  source('server/orgmasterPrincipalAdmissionRepository.ts'),
  source('src/auth/authApiClient.ts'),
  source('src/auth/AuthGate.tsx'),
  readFile(join(root, 'server', 'orgmasterManagedIdentityAuthBridge.ts')).then(() => true).catch(() => false),
])
const migration = migrationBytes.toString('utf8').replaceAll('\r\n', '\n')
const managedSessionMigration = managedSessionMigrationBytes.toString('utf8').replaceAll('\r\n', '\n')
const principalProjectionMigration = principalProjectionMigrationBytes.toString('utf8').replaceAll('\r\n', '\n')

await check('forward-only app-local admission view and least privilege', () => {
  assert.match(migration, /^-- DB-CHANGE\n-- owner: orgmaster\n-- schemas: orgmaster_core, orgmaster_contract[\s\S]*-- governance-review: DEV-050/mu)
  includesAll(migration, ['BEGIN;', 'SET LOCAL ROLE jenfu_orgmaster_migrator', 'v_orgmaster_session_principals_v1', 'v_active_principal_mappings_v1', "'orgmaster.session-principal.v1'", 'security_barrier', 'REVOKE ALL', 'jenfu_orgmaster_runtime', 'COMMIT;'])
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|SCHEMA|VIEW)\b/iu)
  assert.doesNotMatch(migration, /CREATE\s+OR\s+REPLACE\s+VIEW\s+orgmaster_contract\.v_active_principal_mappings_v1/iu)
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+orgmaster_contract\.v_orgmaster_session_principals_v1\s+TO\s+(?:jenfu_platform_runtime|jenfu_ai_pdm_runtime)/iu)
})

await check('managed-login bridge admits published AI-PDM employees without granting OrgMaster roles', () => {
  assert.match(managedSessionMigration, /^-- DB-CHANGE\n-- owner: orgmaster\n-- schemas: orgmaster_core, orgmaster_contract[\s\S]*-- governance-review: DEV-014/mu)
  includesAll(managedSessionMigration, ['v_orgmaster_session_principals_v2', "'orgmaster.session-principal.v2'", "IN ('orgmaster', 'ai-pdm')", 'v_active_principal_mappings_v1', 'REVOKE ALL', 'jenfu_orgmaster_runtime'])
  assert.doesNotMatch(managedSessionMigration, /\bDROP\s+(?:TABLE|COLUMN|SCHEMA|VIEW)\b/iu)
  assert.doesNotMatch(managedSessionMigration, /CREATE\s+OR\s+REPLACE\s+VIEW\s+orgmaster_contract\.v_orgmaster_session_principals_v1/iu)
})

await check('authority switch consumes the published managed-principal mapping contract', () => {
  assert.match(principalProjectionMigration, /^-- DB-CHANGE\n-- owner: orgmaster[\s\S]*-- governance-review: DEV-014/mu)
  includesAll(principalProjectionMigration, [
    'orgmaster_contract.v_active_principal_links_v1',
    'orgmaster_contract.v_active_principal_mappings_v1',
    'access_governance.v_active_principal_links_v1',
    'CREATE OR REPLACE VIEW',
    'account_type',
  ])
  assert.doesNotMatch(principalProjectionMigration, /DROP\s+(?:TABLE|COLUMN|SCHEMA|VIEW)/iu)
  assert.doesNotMatch(principalProjectionMigration, /INSERT\s+INTO\s+(?:orgmaster_core|access_governance)\./iu)
})

await check('mandatory verifier has no email-search fallback and preserves one retry fence', () => {
  includesAll(service, ['verifyManagedLoginIdentifier', 'readManagedLoginSnapshot', 'managedLoginRequestDigest', 'MANAGED_IDENTITY_REVISION_CONFLICT', 'expectedManagedLoginIdentityMatches'])
  assert.doesNotMatch(service, /resolveFirebaseIdentity|resolveLoginAlias/iu)
  assert.match(service, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/u)
  const retry = service.indexOf('if (attempt === 0 && code ===')
  assert.ok(retry >= 0, 'retry fence missing')
})

await check('auth API freezes identifier, uses canonical-first admission and rereads epoch', () => {
  includesAll(auth, ['managedIdentifierProvided', 'verifyManagedLoginIdentifier', 'resolveActivePrincipal', "error.code !== 'principal_not_active'", 'const stateAfter = await epochs.readState', 'randomUUID()'])
  assert.doesNotMatch(auth, /resolveFirebaseIdentity|resolveLoginAlias/iu)
  const firstEpoch = auth.indexOf('const state = await epochs.readState')
  const canonical = auth.indexOf('principal = await principals.resolveActivePrincipal(identity.issuer, identity.subject)')
  const verifier = auth.indexOf('runtime.managedIdentity.verifyManagedLoginIdentifier')
  const canonicalAfterBind = auth.indexOf('principal = await principals.resolveActivePrincipal(identity.issuer, identity.subject)', canonical + 1)
  const secondEpoch = auth.indexOf('const stateAfter = await epochs.readState')
  assert.ok(firstEpoch >= 0 && canonical > firstEpoch && verifier > canonical && canonicalAfterBind > verifier && secondEpoch > canonicalAfterBind, 'auth ordering changed')
  assert.match(auth, /Buffer\.byteLength\(body\.managedIdentifier, 'utf8'\) > 254/u)
})

await check('private same-snapshot repository and app-scoped admission repository', () => {
  includesAll(repository, ['readManagedLoginSnapshot', 'WITH login AS MATERIALIZED', 'read_managed_login_identity_v1', 'read_employee_managed_identity_v1', 'MANAGED_LOGIN_READ_FAILED'])
  includesAll(admission, ['v_orgmaster_session_principals_v2', 'orgmaster.session-principal.v2'])
  assert.doesNotMatch(admission, /v_active_principal_mappings_v1/u)
})

await check('client and UI expose dual identifier without production Firebase port', () => {
  includesAll(client, ['exchangeFirebaseToken', 'managedIdentifier', 'idToken'])
  includesAll(gate, ['以 JFS 員工編號或公司 Email 登入', 'JFS0001 或 jfs0001@jenfu.com.tw', '既有帳號登入', 'getFirebaseGoogleIdToken'])
  assert.equal(bridgeExists, false, 'obsolete auth bridge remains')
  assert.doesNotMatch(gate, /firebase-admin|productionPort|devIdentityEnabled/iu)
})

await check('legacy public alias route is deny-by-default', async () => {
  includesAll(auth, ['managed/alias', 'auth_request_invalid'])
  const route = auth.slice(auth.indexOf("/managed/alias"))
  assert.match(route, /sendJson\(response, 404/u)
})

const failed = checks.filter((entry) => entry.status === 'FAIL')
const evidence = {
  contract: 'DEV-050', evidenceScope: 'LOCAL_ISOLATED', status: failed.length ? 'FAIL' : 'PASS',
  generatedAt: new Date().toISOString(), migrationSha256: createHash('sha256').update(migrationBytes).digest('hex'), checks,
  source: { gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/u).filter(Boolean) },
}
const output = join(root, 'qa', 'dev-050', 'contract', 'manifest.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (failed.length) process.exitCode = 1
