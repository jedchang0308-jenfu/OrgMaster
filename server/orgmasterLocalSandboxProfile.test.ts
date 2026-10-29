import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { contractDigest, LOCAL_FIXTURE_VERSION, LOCAL_IDENTITY_ISSUER } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { readAiPdmRoleCatalogV7 } from './localPrincipalSandboxFixture.mjs'
import { AI_PDM_ROLE_CATALOG_V7_SHA256, AI_PDM_ROLE_CATALOG_V7_VERSION, LOCAL_PRINCIPAL_FIXTURE_VERSION } from './localPrincipalSandboxFixture.mjs'
import { readOrgmasterLocalRuntimeProfile } from './orgmasterLocalSandboxProfile'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function fixture() {
  const payload = {
    contractVersion: LOCAL_FIXTURE_VERSION,
    fixtureVersion: LOCAL_PRINCIPAL_FIXTURE_VERSION,
    scenarios: [{
      scenarioId: 'active', label: 'active test scenario', principalId: 'local-test-admin',
      employeeId: 'employee-local-test-admin', identityIssuer: LOCAL_IDENTITY_ISSUER,
      identitySubject: 'local-test-admin', accountType: 'human_privileged', principalStatus: 'active',
      employeeStatus: 'active', accountLifecycleVersion: 1, profileVersion: 1, grants: [],
    }],
  }
  return { ...payload, fixtureHash: contractDigest(payload) }
}

async function writeProfile(value: Record<string, unknown> = validProfile()) {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-local-profile-'))
  roots.push(root)
  const control = join(root, 'control')
  await mkdir(control)
  const path = join(control, 'orgmaster-runtime.json')
  await writeFile(path, JSON.stringify(value), { mode: 0o600 })
  if (process.platform !== 'win32') await chmod(path, 0o600)
  return root
}

function validProfile() {
  const catalog = readAiPdmRoleCatalogV7().catalog
  return {
    profileVersion: 'orgmaster.local-principal-runtime.v1',
    applicationId: 'orgmaster',
    sandboxId: 'orgmaster-test',
    generation: '65d57913-024b-449f-a6b9-62166404447b',
    key: 'a'.repeat(64),
    nativeSessionContractVersion: 'jenfu.orgmaster-session.v2',
    catalogBinding: {
      applicationId: 'ai-pdm',
      sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2',
      catalogVersion: AI_PDM_ROLE_CATALOG_V7_VERSION,
      catalogSha256: AI_PDM_ROLE_CATALOG_V7_SHA256,
      roles: catalog.roles.map(({ stableRoleId, roleDefinitionHash }) => ({ stableRoleId, roleDefinitionHash })),
    },
    fixture: fixture(),
  }
}

describe('OrgMaster private local runtime profile', () => {
  it('reads the exact private profile and freezes the validated fixture and bindings', async () => {
    const root = await writeProfile()
    const result = await readOrgmasterLocalRuntimeProfile(root, 'orgmaster-test')
    expect(result.profileVersion).toBe('orgmaster.local-principal-runtime.v1')
    expect(result.catalogBinding.roles).toHaveLength(9)
    expect(result.allowSyntheticAal2).toBeUndefined()
    expect(result.assurancePolicyHash).toBeUndefined()
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.fixture.scenarios[0])).toBe(true)
  })

  it('accepts synthetic AAL2 only with an explicit true flag and a paired policy hash', async () => {
    const assurancePolicyHash = 'c'.repeat(64)
    const root = await writeProfile({ ...validProfile(), allowSyntheticAal2: true, assurancePolicyHash })
    const result = await readOrgmasterLocalRuntimeProfile(root, 'orgmaster-test')
    expect(result.allowSyntheticAal2).toBe(true)
    expect(result.assurancePolicyHash).toBe(assurancePolicyHash)

    const invalidProfiles = [
      { ...validProfile(), assurancePolicyHash },
      { ...validProfile(), allowSyntheticAal2: true },
      { ...validProfile(), allowSyntheticAal2: false, assurancePolicyHash },
      { ...validProfile(), allowSyntheticAal2: true, assurancePolicyHash: 'not-a-sha256' },
    ]
    for (const invalidProfile of invalidProfiles) {
      const invalidRoot = await writeProfile(invalidProfile)
      await expect(readOrgmasterLocalRuntimeProfile(invalidRoot, 'orgmaster-test'))
        .rejects.toThrow('local_runtime_profile_unavailable')
    }
  })

  it('fails closed for sandbox mismatch, extra fields, or a changed fixture digest', async () => {
    const mismatch = await writeProfile({ ...validProfile(), unexpected: true })
    await expect(readOrgmasterLocalRuntimeProfile(mismatch, 'orgmaster-test')).rejects.toThrow('local_runtime_profile_unavailable')
    await expect(readOrgmasterLocalRuntimeProfile(mismatch, 'orgmaster-other')).rejects.toThrow('local_runtime_profile_unavailable')

    const changedFixture = validProfile()
    changedFixture.fixture.scenarios[0].principalId = 'local-changed'
    const invalid = await writeProfile(changedFixture)
    await expect(readOrgmasterLocalRuntimeProfile(invalid, 'orgmaster-test')).rejects.toThrow('local_runtime_profile_unavailable')
  })

  it('fails closed when the private profile is missing or oversized', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-local-profile-'))
    roots.push(root)
    await mkdir(join(root, 'control'))
    await expect(readOrgmasterLocalRuntimeProfile(root, 'orgmaster-test')).rejects.toThrow('local_runtime_profile_unavailable')
    await writeFile(join(root, 'control', 'orgmaster-runtime.json'), ' '.repeat(256 * 1024 + 1))
    await expect(readOrgmasterLocalRuntimeProfile(root, 'orgmaster-test')).rejects.toThrow('local_runtime_profile_unavailable')
  })
})
