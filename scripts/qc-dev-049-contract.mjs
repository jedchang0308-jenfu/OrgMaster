#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = join(root, 'db', 'migrations', '013_dev049_existing_google_primary_account_link.sql')
const migrationBytes = await readFile(migrationPath)
const migration = migrationBytes.toString('utf8').replaceAll('\r\n', '\n')
const source = (relative) => readFile(join(root, relative), 'utf8')
const checks = []
async function check(name, task) { try { await task(); checks.push({ name, status: 'PASS' }) } catch (error) { checks.push({ name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }) } }
function includesAll(text, values) { for (const value of values) assert.ok(text.includes(value), `missing ${value}`) }

await check('forward-only migration and exact ownership boundary', () => {
  assert.match(migration, /^-- DB-CHANGE\n-- owner: orgmaster\n-- schemas: orgmaster_core, orgmaster_contract[\s\S]*-- governance-review: DEV-049/mu)
  assert.match(migration, /BEGIN;[\s\S]*SET LOCAL ROLE jenfu_orgmaster_migrator[\s\S]*COMMIT;/u)
  assert.doesNotMatch(migration, /\b(?:CREATE\s+TABLE|ALTER\s+TABLE\s+[^;]+ADD\s+COLUMN|DROP\s+(?:TABLE|COLUMN|SCHEMA))\b/iu)
  includesAll(migration, ['read_managed_identity_candidate_v1', 'dev049.confirm.v1', 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT', 'directory_linked_pending_auth', 'REVOKE ALL ON FUNCTION', 'jenfu_orgmaster_runtime'])
})

await check('browser contract accepts explicit primary email and redacts provider identifiers', async () => {
  const [types, service, dialog] = await Promise.all([source('src/managedIdentity/types.ts'), source('server/orgmasterManagedIdentityService.ts'), source('src/components/ManagedIdentityLinkDialog.tsx')])
  includesAll(types, ['primaryEmail: string', 'directory: { primaryEmail: string }'])
  assert.doesNotMatch(types, /derivedUsername|expectedUsername|directory:\s*\{[^}]*customerId/su)
  includesAll(service, ['parseManagedPrimaryEmail', 'readCandidateForConfirmation', 'directory.readByDirectoryKey'])
  includesAll(dialog, ['Google 主帳號', '查詢帳號', '確認連結', '返回修改', 'sr-only'])
  assert.doesNotMatch(dialog, /directory\.userId|directory\.customerId|sourceEtag/u)
})

await check('Directory adapter is read-only and validates stable provider facts', async () => {
  const port = await source('server/orgmasterManagedDirectoryPort.ts')
  includesAll(port, ['admin.directory.user.readonly', "bodyCustomer = typeof value.customerId === 'string' ? value.customerId.trim() : ''", 'result.user.userId !== user', "result.user.directoryState !== 'present'"])
  assert.doesNotMatch(port, /[?&]customer=/u)
  assert.doesNotMatch(port, /users\.(?:insert|update|delete)|method:\s*['"](?:POST|PUT|PATCH|DELETE)/iu)
})

await check('receipt-first local store and canonical Firebase requery', async () => {
  const [store, auth] = await Promise.all([source('server/orgmasterManagedIdentityStore.ts'), source('server/orgmasterAuthApi.ts')])
  includesAll(store, ['managedIdentityConfirmFingerprint', "receipt.responsePayload.contractVersion !== 'dev049.confirm.v1'", "kind: 'replayed'", 'actorBindingSha256'])
  const epoch = auth.indexOf('const state = await epochs.readState')
  const fallback = auth.indexOf('await runtime.managedIdentity.resolveFirebaseIdentity')
  const canonical = auth.indexOf('principal = await principals.resolveActivePrincipal', fallback)
  assert.ok(epoch >= 0 && fallback > epoch && canonical > fallback, 'auth-time/epoch must precede managed bind and canonical requery')
  assert.doesNotMatch(auth, /mappingVersion:\s*1/u)
})

await check('managed-login owner API binds caller, Firebase, Directory stable key and CAS receipt', async () => {
  const [contract, api, service, repository, migrationSource] = await Promise.all([
    source('server/orgmasterManagedLoginContract.ts'),
    source('server/orgmasterManagedLoginApi.ts'),
    source('server/orgmasterManagedLoginService.ts'),
    source('server/orgmasterManagedIdentityRepository.ts'),
    source('db/migrations/013_dev049_existing_google_primary_account_link.sql'),
  ])
  includesAll(contract, ['jenfu.managed-login.v1', "action: 'resolveAlias'", "action: 'verifyIdentity'", 'googleUserId', 'authenticatedAt', 'expected'])
  includesAll(api, ['/api/internal/managed-login/v1', 'verifyIdToken', 'expectedEmail', 'expectedSubject', 'MAX_BODY_BYTES'])
  includesAll(service, ['token.googleUserId', 'readByDirectoryKey', 'readManagedLoginIdentity', 'managedLoginRequestDigest', 'incrementRevision(expected.identityRevision)', 'current.registryRevision === expected.registryRevision'])
  includesAll(repository, ['resolve_managed_login_alias_v1', 'read_managed_login_identity_v1', 'verify_managed_login_identity_v1'])
  includesAll(migrationSource, ['managed_login_identity_verified', 'verify_managed_login_identity_v1', 'jenfu.managed-login.v1', "l.status <> 'completed'"])
  assert.doesNotMatch(service, /readManagedLoginIdentity\([^,]+token\.email/u)
  const ownerRoutine = migrationSource.slice(migrationSource.indexOf('CREATE OR REPLACE FUNCTION orgmaster_core.verify_managed_login_identity_v1'), migrationSource.indexOf('CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_mappings_v1'))
  const ownerReceipt = ownerRoutine.slice(ownerRoutine.indexOf('INSERT INTO orgmaster_core.managed_identity_command_receipts'), ownerRoutine.indexOf('INSERT INTO orgmaster_core.managed_identity_audit_events'))
  assert.doesNotMatch(ownerReceipt, /(?:primaryEmail|idToken|last_verified_primary_email)/iu)
})

await check('DEV-047 runner exposes isolated DEV-049 suite without changing production release paths', async () => {
  const [runner, packageJson, agents, spec] = await Promise.all([
    source('scripts/qc-dev-047-postgres.mjs'),
    source('package.json'),
    source('AGENTS.md'),
    source('ai-doc/specs/DEV-049-existing-google-primary-account-link.md'),
  ])
  includesAll(runner, ["--suite=", "suite === 'dev049'", "'D49-01'", "'D49-06'", 'task-owned PostgreSQL cluster'])
  includesAll(packageJson, ['qc:dev-049:postgres', 'qc:dev-049:browser', 'test:dev-049'])
  assert.match(agents, /001–011 bundle/u)
  assert.match(agents, /DEV-047 migration 012[^\n]*remain separate from compatible application deployment/u)
  includesAll(spec, [
    'db/migrations/013_dev049_existing_google_primary_account_link.sql',
    '不能把 012／013 塞入該正常路徑',
  ])
})

const failed = checks.filter((entry) => entry.status === 'FAIL')
const evidence = { contract: 'DEV-049', evidenceScope: 'LOCAL_ISOLATED', status: failed.length ? 'FAIL' : 'PASS', generatedAt: new Date().toISOString(), migrationSha256: createHash('sha256').update(migrationBytes).digest('hex'), checks }
const output = join(root, 'qa', 'dev-049', 'contracts', 'manifest.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (failed.length) process.exitCode = 1
