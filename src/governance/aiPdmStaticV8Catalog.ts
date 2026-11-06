import catalog from '../../config/catalogs/ai-pdm-role-catalog.v8.json' with { type: 'json' }
import v7 from '../../config/catalogs/ai-pdm-role-catalog.v7.json' with { type: 'json' }
import protectedSource from '../../contracts/ai-pdm-role-policy-catalog/v3/protected-policy-source.json' with { type: 'json' }
import registry from '../../contracts/ai-pdm-role-policy-catalog/v3/editor-registry.json' with { type: 'json' }
import type { AiPdmRoleProfile } from './aiPdmRoleSchema'

export const AI_PDM_STATIC_V8_VERSION = 'ai-pdm.role-catalog.2026-11-06.v8'
export const AI_PDM_STATIC_V8_SHA256 = '320b259f0f0b4a51f24227cff37313bcb5fa3834d7736df3c43a1e178b878a73'
export const AI_PDM_STATIC_V8_RAW_SHA256 = '799b6d138d614bd737b49818e02f6a31b1810c42e01801f845401fb7ad3146e1'
export const AI_PDM_STATIC_V8_PROFILE_SHA256 = '6cbc0346701146191fca929354883eb04a758daa7a695cc22c41c7bb5dfb5fe9'
export const AI_PDM_STATIC_V8_VIEW = 'ai_pdm_contract.v_application_role_catalog_v3'
type StaticV8Role = Omit<typeof catalog.roles[number], 'roleStatus'> & { roleStatus?: 'active' }
export const aiPdmStaticV8Catalog = catalog as Omit<typeof catalog, 'roles'> & { roles: StaticV8Role[] }

/** Structural JSON equality preserves array order and rejects unknown fields. */
export function sameStaticV8Value(actual: unknown, expected: unknown, depth = 0): boolean {
  if (actual === expected) return true
  if (depth > 32 || !actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false
  if (Array.isArray(actual) || Array.isArray(expected)) return Array.isArray(actual) && Array.isArray(expected) &&
    actual.length === expected.length && actual.every((value, index) => sameStaticV8Value(value, expected[index], depth + 1))
  const a = actual as Record<string, unknown>, b = expected as Record<string, unknown>
  return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(key =>
    Object.hasOwn(a, key) && sameStaticV8Value(a[key], b[key], depth + 1))
}

// The new static publication retains native legacy self bindings. Dynamic
// production-planning/procurement aliases are a different, unchanged contract.
export const aiPdmStaticV8Profiles: AiPdmRoleProfile[] = [
  ...v7.roles.map((role, index): AiPdmRoleProfile => ({ stableRoleId: role.stableRoleId,
    permissionRoleId: role.stableRoleId, presentationName: role.displayName, presentationOrder: index,
    assignmentDisposition: role.stableRoleId === 'role-system-admin' ? 'hidden-protected' : 'selectable' })),
  { ...registry.roleProfiles[9] } as AiPdmRoleProfile,
]

if (catalog.catalogVersion !== AI_PDM_STATIC_V8_VERSION || catalog.catalogSha256 !== AI_PDM_STATIC_V8_SHA256 ||
  catalog.roles.length !== 10 || !sameStaticV8Value(catalog.roles.slice(0, 9), v7.roles) ||
  !sameStaticV8Value(catalog.roles[9], protectedSource.applicationAdministratorRole)) throw new Error('EXTERNAL_CATALOG_INVALID')

/** Exact producer payload only; publication time and owning reader path vary. */
export function isExactAiPdmStaticV8Catalog(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const artifact = value as Record<string, unknown>
  return Object.keys(artifact).every(key => ['contractVersion', 'applicationId', 'catalogVersion', 'catalogSha256', 'publishedAt', 'roles', 'sourcePath'].includes(key)) &&
    artifact.contractVersion === catalog.contractVersion && artifact.applicationId === catalog.applicationId &&
    artifact.catalogVersion === AI_PDM_STATIC_V8_VERSION && artifact.catalogSha256 === AI_PDM_STATIC_V8_SHA256 &&
    typeof artifact.publishedAt === 'string' && Number.isFinite(Date.parse(artifact.publishedAt)) &&
    sameStaticV8Value(artifact.roles, catalog.roles)
}
