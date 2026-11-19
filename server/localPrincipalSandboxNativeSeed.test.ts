import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalJson, readLocalSandboxConfig, sha256 } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { assertLocalPrincipalNativeSeedRole, assertLocalPrincipalNativeSeedTarget, assertLocalSeedBatchProof } from './localPrincipalSandboxNativeSeed'

const config = readLocalSandboxConfig({ NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1',
  JENFU_LOCAL_SANDBOX_ID: 'seed-test', JENFU_LOCAL_SANDBOX_ORIGIN: 'http://localhost:12010',
  JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://localhost:12000', JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
  JENFU_LOCAL_SANDBOX_DATABASE_URL: 'postgresql://local_org_runtime:private@127.0.0.1:15439/jenfu_local_seed_test',
  JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_org_runtime' }, 'orgmaster')
const target = { port: 15439, dataDirectory: path.resolve('owned-task', 'postgres-data'),
  sessionUser: 'local_org_seed_0123456789abcdef' }
const row = { database_name: config.databaseName, address: '127.0.0.1', port: target.port,
  session_user: target.sessionUser }

describe('owner-only native synthetic initialization target', () => {
  it('requires the actual isolated database, loopback port and newly scoped owner login', () => {
    expect(() => assertLocalPrincipalNativeSeedTarget(config, target, row)).not.toThrow()
    for (const changed of [{ database_name: 'jenfu_production' }, { address: '10.1.2.3' },
      { port: 5432 }, { session_user: config.runtimeRole }]) {
      expect(() => assertLocalPrincipalNativeSeedTarget(config, target, { ...row, ...changed })).toThrow('TARGET_MISMATCH')
    }
    expect(() => assertLocalPrincipalNativeSeedTarget(config, { ...target, sessionUser: 'postgres' }, row)).toThrow('TARGET_MISMATCH')
    expect(() => assertLocalPrincipalNativeSeedTarget(config, { ...target, dataDirectory: 'relative' }, row)).toThrow('TARGET_MISMATCH')
  })
  it('cannot turn a runtime or different App config into an owner initializer', () => {
    expect(() => assertLocalPrincipalNativeSeedTarget({ ...config, applicationId: 'ai-pdm' }, target, row)).toThrow()
    expect(() => assertLocalPrincipalNativeSeedTarget({ ...config, databaseName: 'formal' }, target, { ...row, database_name: 'formal' })).toThrow()
  })
  it('requires the one-use seed login to assume only the OrgMaster migrator role', () => {
    expect(() => assertLocalPrincipalNativeSeedRole(target, {
      session_user: target.sessionUser, current_user: 'jenfu_orgmaster_migrator',
    })).not.toThrow()
    for (const actual of [
      { session_user: 'postgres', current_user: 'jenfu_orgmaster_migrator' },
      { session_user: target.sessionUser, current_user: target.sessionUser },
      { session_user: target.sessionUser, current_user: 'jenfu_platform_migrator' },
    ]) expect(() => assertLocalPrincipalNativeSeedRole(target, actual)).toThrow('ROLE_SCOPE_MISMATCH')
    expect(() => assertLocalPrincipalNativeSeedRole({ ...target, sessionUser: 'postgres' }, {
      session_user: 'postgres', current_user: 'jenfu_orgmaster_migrator',
    })).toThrow('ROLE_SCOPE_MISMATCH')
  })
  it('accepts retirement or reuse only for the exact owner factory publication', () => {
    const payload = { version: 3, employees: [], assignments: [] }
    const artifact = { artifactKey: 'governance', artifactKind: 'governance', payload,
      sourceSha256: 'a'.repeat(64), canonicalSha256: sha256(canonicalJson(payload)), sourceBytes: 100 }
    const expected = { sourceRevision: 'b'.repeat(64), manifest: { format: 'orgmaster.local-empty-bootstrap.v1', sandboxId: 'seed-test' }, artifacts: [artifact] }
    const batch = { status: 'active', source_revision: expected.sourceRevision, source_manifest: expected.manifest,
      artifact_count: 1, media_count: 0, source_bytes: '100' }
    const row = { artifact_key: artifact.artifactKey, artifact_kind: artifact.artifactKind, payload,
      source_sha256: artifact.sourceSha256, canonical_sha256: artifact.canonicalSha256, source_bytes: '100' }
    expect(() => assertLocalSeedBatchProof(batch, expected, [row])).not.toThrow()
    for (const drift of [{ source_manifest: { ...expected.manifest, sandboxId: 'another-task' } },
      { source_revision: 'c'.repeat(64) }, { status: 'retired' }, { media_count: 1 }]) {
      expect(() => assertLocalSeedBatchProof({ ...batch, ...drift }, expected, [row])).toThrow('EXISTING_BATCH_MISMATCH')
    }
    expect(() => assertLocalSeedBatchProof(batch, expected, [{ ...row, payload: { ...payload, employees: ['unexpected'] } }])).toThrow('EXISTING_ARTIFACT_MISMATCH')
    expect(() => assertLocalSeedBatchProof(batch, expected, [row, row])).toThrow('EXISTING_BATCH_MISMATCH')
  })
})
