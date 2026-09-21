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
  const candidateResponse = types.slice(types.indexOf('export interface ManagedIdentityCandidateResponseV1'), types.indexOf('export interface FindManagedIdentityCandidateRequestV1'))
  assert.doesNotMatch(types, /expectedUsername/u)
  assert.doesNotMatch(candidateResponse, /derivedUsername|customerId|userId|sourceEtag/u)
  includesAll(service, ['parseManagedPrimaryEmail', 'readCandidateForConfirmation', 'directory.readByDirectoryKey'])
  includesAll(dialog, ['Google 主帳號', '查詢帳號', '確認連結', '返回修改', 'sr-only'])
  assert.doesNotMatch(dialog, /directory\.userId|directory\.customerId|sourceEtag/u)
})

await check('Directory adapter is read-only and validates stable provider facts', async () => {
  const port = await source('server/orgmasterManagedDirectoryPort.ts')
  includesAll(port, [
    'admin.directory.user.readonly',
    'iamcredentials.googleapis.com',
    ':signJwt',
    'oauth2.googleapis.com/token',
    'ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID',
    'ORGMASTER_GOOGLE_DIRECTORY_DOMAIN',
    'ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT',
    'ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL',
    "bodyCustomer = typeof value.customerId === 'string' ? value.customerId.trim() : ''",
    'result.user.userId !== user',
    "result.user.directoryState !== 'present'",
  ])
  assert.doesNotMatch(port, /[?&]customer=/u)
  assert.doesNotMatch(port, /users\.(?:insert|update|delete)|admin\.googleapis\.com[^\n]+method:\s*['"](?:POST|PUT|PATCH|DELETE)/iu)
  assert.doesNotMatch(port, /ORGMASTER_(?:DIRECTORY_CUSTOMER_ID|DIRECTORY_DWD_SUBJECT|MANAGED_DOMAIN)/u)
})

await check('keyless DWD infrastructure owns only the exact signer-level boundary', async () => {
  const [main, variables, outputs, example] = await Promise.all([
    source('infra/google-cloud/dev-049-managed-directory/main.tf'),
    source('infra/google-cloud/dev-049-managed-directory/variables.tf'),
    source('infra/google-cloud/dev-049-managed-directory/outputs.tf'),
    source('.env.example'),
  ])
  includesAll(main, [
    'google_service_account" "directory_dwd',
    'roles/iam.serviceAccountTokenCreator',
    'prevent_destroy = true',
  ])
  includesAll(variables, ['jenfu-platform-prod', 'orgmaster-prod-runtime', 'orgmaster-prod-directory-dwd'])
  includesAll(outputs, ['oauth2_client_id', 'admin.directory.user.readonly'])
  includesAll(example, [
    'ORGMASTER_MANAGED_IDENTITY_ENABLED=false',
    'ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID=',
    'ORGMASTER_GOOGLE_DIRECTORY_DOMAIN=',
    'ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT=',
    'ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL=',
  ])
  assert.doesNotMatch(main + variables + outputs, /google_service_account_key|private_key|roles\/iam\.serviceAccountTokenCreator[\s\S]*google_project_iam/u)
})

await check('managed identifier verifier precedes canonical admission', async () => {
  const [store, auth] = await Promise.all([source('server/orgmasterManagedIdentityStore.ts'), source('server/orgmasterAuthApi.ts')])
  includesAll(store, ['managedIdentityConfirmFingerprint', "receipt.responsePayload.contractVersion !== 'dev049.confirm.v1'", "kind: 'replayed'", 'actorBindingSha256'])
  includesAll(auth, ['managedIdentifierProvided', 'verifyManagedLoginIdentifier', 'resolveActivePrincipal', 'stateAfter = await epochs.readState'])
  assert.doesNotMatch(auth, /resolveFirebaseIdentity/u)
  const epoch = auth.indexOf('const state = await epochs.readState')
  const verifier = auth.indexOf('verifyManagedLoginIdentifier')
  const canonical = auth.indexOf('const principal = await principals.resolveActivePrincipal(identity.issuer, identity.subject)')
  const secondEpoch = auth.indexOf('const stateAfter = await epochs.readState')
  assert.ok(epoch >= 0 && verifier > epoch && canonical > verifier && secondEpoch > canonical, 'epoch/verifier/canonical/second-epoch order changed')
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
  includesAll(repository, ['resolve_managed_login_alias_v1', 'read_managed_login_identity_v1', 'readManagedLoginSnapshot', 'verify_managed_login_identity_v1'])
  includesAll(migrationSource, ['managed_login_identity_verified', 'verify_managed_login_identity_v1', 'jenfu.managed-login.v1', "l.status <> 'completed'"])
  assert.doesNotMatch(service, /readManagedLoginIdentity\([^,]+token\.email/u)
  const ownerRoutine = migrationSource.slice(migrationSource.indexOf('CREATE OR REPLACE FUNCTION orgmaster_core.verify_managed_login_identity_v1'), migrationSource.indexOf('CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_mappings_v1'))
  const ownerReceipt = ownerRoutine.slice(ownerRoutine.indexOf('INSERT INTO orgmaster_core.managed_identity_command_receipts'), ownerRoutine.indexOf('INSERT INTO orgmaster_core.managed_identity_audit_events'))
  assert.doesNotMatch(ownerReceipt, /(?:primaryEmail|idToken|last_verified_primary_email)/iu)
})

await check('DEV-047 runner exposes isolated DEV-049 suite and current protected release boundary', async () => {
  const [runner, packageJson, agents, spec] = await Promise.all([
    source('scripts/qc-dev-047-postgres.mjs'),
    source('package.json'),
    source('AGENTS.md'),
    source('ai-doc/specs/DEV-049-existing-google-primary-account-link.md'),
  ])
  includesAll(runner, ["--suite=", "suite === 'dev049'", "'D49-01'", "'D49-06'", 'task-owned PostgreSQL cluster'])
  includesAll(packageJson, ['qc:dev-049:postgres', 'qc:dev-049:browser', 'test:dev-049'])
  assert.match(agents, /001–015 bundle/u)
  assert.match(agents, /DEV-013 production activation recovery slice[^\n]*012／013／014／015/u)
  includesAll(spec, [
    'db/migrations/013_dev049_existing_google_primary_account_link.sql',
    'Production activation amendment',
  ])
})

const failed = checks.filter((entry) => entry.status === 'FAIL')
const evidence = { contract: 'DEV-049', evidenceScope: 'LOCAL_ISOLATED', status: failed.length ? 'FAIL' : 'PASS', generatedAt: new Date().toISOString(), migrationSha256: createHash('sha256').update(migrationBytes).digest('hex'), checks }
const output = join(root, 'qa', 'dev-049', 'contracts', 'manifest.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (failed.length) process.exitCode = 1
