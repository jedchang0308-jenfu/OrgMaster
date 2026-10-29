import { constants as fsConstants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  assertFixtureEnvelope,
  LOCAL_FIXTURE_VERSION,
  type LocalFixture,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import {
  AI_PDM_ROLE_CATALOG_V7_SHA256,
  AI_PDM_ROLE_CATALOG_V7_VERSION,
} from './localPrincipalSandboxFixture.mjs'

const PROFILE_VERSION = 'orgmaster.local-principal-runtime.v1'
const NATIVE_SESSION_CONTRACT_VERSION = 'jenfu.orgmaster-session.v2'
const HASH = /^[a-f0-9]{64}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,63}$/u
const MAX_PROFILE_BYTES = 256 * 1024

type OrgmasterLocalRuntimeProfileBase = {
  profileVersion: typeof PROFILE_VERSION
  applicationId: 'orgmaster'
  sandboxId: string
  generation: string
  key: string
  nativeSessionContractVersion: typeof NATIVE_SESSION_CONTRACT_VERSION
  catalogBinding: Readonly<{
    applicationId: 'ai-pdm'
    sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2'
    catalogVersion: typeof AI_PDM_ROLE_CATALOG_V7_VERSION
    catalogSha256: typeof AI_PDM_ROLE_CATALOG_V7_SHA256
    roles: readonly Readonly<{ stableRoleId: string; roleDefinitionHash: string }>[]
  }>
  fixture: LocalFixture
}

export type OrgmasterLocalRuntimeProfile = Readonly<OrgmasterLocalRuntimeProfileBase & (
  | { allowSyntheticAal2?: never; assurancePolicyHash?: never }
  | { allowSyntheticAal2: true; assurancePolicyHash: string }
)>

function fail(): never {
  throw new Error('local_runtime_profile_unavailable')
}

function exactRecord(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) fail()
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child)
  return Object.freeze(value)
}

function normalizedPath(value: string) {
  const path = resolve(value)
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function validateProfile(input: unknown, sandboxId: string): OrgmasterLocalRuntimeProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail()
  const hasSyntheticAal2 = Object.hasOwn(input, 'allowSyntheticAal2')
  const hasAssurancePolicyHash = Object.hasOwn(input, 'assurancePolicyHash')
  if (hasSyntheticAal2 !== hasAssurancePolicyHash) fail()
  exactRecord(input, ['profileVersion', 'applicationId', 'sandboxId', 'generation', 'key',
    'nativeSessionContractVersion', 'catalogBinding', 'fixture',
    ...(hasSyntheticAal2 ? ['allowSyntheticAal2', 'assurancePolicyHash'] : [])])
  if (input.profileVersion !== PROFILE_VERSION || input.applicationId !== 'orgmaster' ||
    input.sandboxId !== sandboxId || !UUID.test(String(input.generation)) ||
    typeof input.key !== 'string' || !HASH.test(input.key) ||
    input.nativeSessionContractVersion !== NATIVE_SESSION_CONTRACT_VERSION) fail()
  if (hasSyntheticAal2 && (input.allowSyntheticAal2 !== true || typeof input.assurancePolicyHash !== 'string' ||
    !HASH.test(input.assurancePolicyHash))) fail()

  exactRecord(input.catalogBinding, ['applicationId', 'sourcePath', 'catalogVersion', 'catalogSha256', 'roles'])
  const binding = input.catalogBinding
  if (binding.applicationId !== 'ai-pdm' ||
    binding.sourcePath !== 'postgres:ai_pdm_contract.v_application_role_catalog_v2' ||
    binding.catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION ||
    binding.catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256 ||
    !Array.isArray(binding.roles) || binding.roles.length !== 9) fail()
  const stableRoleIds = new Set<string>()
  for (const role of binding.roles) {
    exactRecord(role, ['stableRoleId', 'roleDefinitionHash'])
    if (typeof role.stableRoleId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,159}$/u.test(role.stableRoleId) ||
      stableRoleIds.has(role.stableRoleId) || typeof role.roleDefinitionHash !== 'string' || !HASH.test(role.roleDefinitionHash)) fail()
    stableRoleIds.add(role.stableRoleId)
  }
  if (stableRoleIds.size !== 9) fail()

  const fixture = assertFixtureEnvelope(input.fixture)
  if (fixture.contractVersion !== LOCAL_FIXTURE_VERSION) fail()
  return freezeDeep(input as unknown as OrgmasterLocalRuntimeProfile)
}

async function assertPlainPath(path: string, directory: boolean) {
  const details = await lstat(path)
  if (details.isSymbolicLink() || (directory ? !details.isDirectory() : !details.isFile())) fail()
  const resolved = await realpath(path)
  if (normalizedPath(resolved) !== normalizedPath(path)) fail()
  return details
}

/** Read the one private runtime profile without following links or trusting a file snapshot. */
export async function readOrgmasterLocalRuntimeProfile(rootValue: string | undefined, sandboxId: string): Promise<OrgmasterLocalRuntimeProfile> {
  if (!rootValue || !isAbsolute(rootValue) || !SANDBOX_ID.test(sandboxId)) fail()
  const root = resolve(rootValue)
  const control = join(root, 'control')
  const file = join(control, 'orgmaster-runtime.json')
  const relative = file.slice(root.length).replace(/^[/\\]+/u, '')
  if (!relative || relative.includes('..') || dirname(control) !== root) fail()
  try {
    await assertPlainPath(root, true)
    await assertPlainPath(control, true)
    const before = await assertPlainPath(file, false)
    if (before.size < 2 || before.size > MAX_PROFILE_BYTES ||
      (process.platform !== 'win32' && (before.mode & 0o077) !== 0)) fail()
    const noFollow = process.platform === 'win32' ? 0 : (fsConstants.O_NOFOLLOW ?? 0)
    const handle = await open(file, fsConstants.O_RDONLY | noFollow)
    try {
      const opened = await handle.stat()
      if (!opened.isFile() || opened.size !== before.size ||
        (before.ino !== 0 && opened.ino !== before.ino) || opened.size > MAX_PROFILE_BYTES) fail()
      const buffer = Buffer.alloc(opened.size + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead !== opened.size) fail()
      const after = await assertPlainPath(file, false)
      if (after.size !== opened.size || (opened.ino !== 0 && after.ino !== opened.ino)) fail()
      const parsed: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
      return validateProfile(parsed, sandboxId)
    } finally {
      await handle.close()
    }
  } catch {
    return fail()
  }
}
