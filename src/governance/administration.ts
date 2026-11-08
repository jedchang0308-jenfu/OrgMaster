import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ADMINISTRATION_BATCH_COMMAND_CONTRACT, ADMINISTRATION_COMMAND_CONTRACT, ADMINISTRATION_POLICY_CONTRACT, ADMINISTRATIVE_APPLICATION_IDS, ADMINISTRATIVE_ROLE_IDS } from './administrationContract.ts'
import type { AdministrativeApplicationId, AdministrativeCatalogBindingV1, AdministrativeGrantV1, AdministrationPolicyV1, GovernanceActorContext, GovernanceDocumentV3, GovernanceOrgSource, GovernancePolicyDataV3 } from './types'

export { ADMINISTRATION_BATCH_COMMAND_CONTRACT, ADMINISTRATION_COMMAND_CONTRACT, ADMINISTRATION_POLICY_CONTRACT, ADMINISTRATIVE_APPLICATION_IDS, ADMINISTRATIVE_ROLE_IDS } from './administrationContract.ts'
export class AdministrationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'AdministrationError' }
}
const opaque = z.string().trim().min(1).max(255)
const hash = z.string().regex(/^[a-f0-9]{64}$/u)
const instant = z.string().refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value)
const reason = z.string().refine(value => value === value.normalize('NFC').trim() && [...value].length > 0 && [...value].length <= 240)
const app = z.enum(ADMINISTRATIVE_APPLICATION_IDS)
export const administrativeCatalogBindingSchema = z.strictObject({ catalogVersion: opaque, contentSha256: hash, stableRoleId: opaque, roleDefinitionHash: hash })
export const administrativeGrantSchema = z.strictObject({
  id: z.uuid(), principalId: opaque, employeeId: opaque,
  roleCode: z.enum(['platform_super_admin', 'application_system_admin']), applicationId: app.nullable(),
  subjectKind: z.literal('principal'), basis: z.literal('manual'), scope: z.strictObject({ kind: z.enum(['platform', 'global']) }),
  status: z.enum(['active', 'revoked']), validFrom: instant, validTo: instant.nullable(),
  createdBy: z.strictObject({ kind: z.enum(['principal', 'owner_workload']), id: opaque }), reason, catalogBinding: administrativeCatalogBindingSchema.nullable(),
}).superRefine((value, context) => {
  const root = value.roleCode === 'platform_super_admin'
  if (root ? value.applicationId !== null || value.scope.kind !== 'platform' || value.catalogBinding !== null || value.validTo !== null
    : !value.applicationId || value.scope.kind !== 'global' || !value.catalogBinding || value.catalogBinding.stableRoleId !== ADMINISTRATIVE_ROLE_IDS[value.applicationId]) {
    context.addIssue({ code: 'custom', message: 'ADMIN_TARGET_INVALID' })
  }
  if (value.validTo !== null && value.validTo <= value.validFrom) context.addIssue({ code: 'custom', message: 'ADMIN_TARGET_INVALID' })
})
export const administrationPolicySchema = z.strictObject({ contractVersion: z.literal(ADMINISTRATION_POLICY_CONTRACT), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), initializedByCommandId: z.uuid().nullable(), grants: z.array(administrativeGrantSchema) }).superRefine((value, context) => {
  if (new Set(value.grants.map(grant => grant.id)).size !== value.grants.length) context.addIssue({ code: 'custom', message: 'DUPLICATE_GRANT_ID' })
  for (let index = 0; index < value.grants.length; index++) {
    const left = value.grants[index]
    if (left.status !== 'active') continue
    for (const right of value.grants.slice(index + 1)) {
      if (right.status === 'active' && left.principalId === right.principalId && left.roleCode === right.roleCode && left.applicationId === right.applicationId
        && left.validFrom < (right.validTo ?? '9999') && right.validFrom < (left.validTo ?? '9999')) context.addIssue({ code: 'custom', message: 'OVERLAPPING_ADMINISTRATIVE_GRANT' })
    }
  }
})
export function administrationPolicy(policy: Pick<GovernancePolicyDataV3, 'administration'>): AdministrationPolicyV1 {
  if (policy.administration === undefined) return { contractVersion: ADMINISTRATION_POLICY_CONTRACT, version: 0, initializedByCommandId: null, grants: [] }
  const parsed = administrationPolicySchema.safeParse(policy.administration)
  if (!parsed.success) throw new AdministrationError('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
  return parsed.data
}
export function administrationHash(value: unknown): string {
  const sorted = (item: unknown): unknown => Array.isArray(item) ? item.map(sorted) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted((item as Record<string, unknown>)[key])])) : item
  return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex')
}
export function publishedAdministrationPolicy(document: GovernanceDocumentV3) {
  const version = document.publishedVersions.find(value => value.id === document.activePolicyVersionId)
  return version?.kind === 'assignment-governance-v3' ? version.policy : null
}
export function administrativeGrantActive(grant: AdministrativeGrantV1, at: string) {
  return grant.status === 'active' && grant.validFrom <= at && (grant.validTo === null || at < grant.validTo)
}
/** All aliases must resolve to the same active human admission; they do not create additional grants. */
export function administrativeTargetEligible(policy: GovernancePolicyDataV3, source: GovernanceOrgSource, principalId: string, employeeId: string, at: string) {
  if (!source.state.employees.some(employee => employee.id === employeeId && employee.status !== 'inactive')) return false
  if(source.administrativePrincipals!==undefined){
    const native=source.administrativePrincipals.filter(value=>value.principalId===principalId)
    return native.length>0 && native.every(value=>value.employeeId===employeeId&&value.status==='active'&&['human_personal','human_privileged'].includes(value.accountType))&&new Set(native.map(value=>value.accountType)).size===1
  }
  const links = policy.identityLinks.filter(link => link.principalId === principalId && link.status === 'active' && link.validFrom <= at && (link.validTo === null || at < link.validTo))
  if (!links.length || links.some(link => link.employeeId !== employeeId)) return false
  const admissions = links.flatMap(link => (policy.principalAdmissions ?? []).filter(admission => admission.identityLinkId === link.id))
  return admissions.length === links.length && admissions.every(admission => admission.status === 'active' && ['human_personal', 'human_privileged'].includes(admission.accountType))
}
export function hasAdministrativeGrant(policy: GovernancePolicyDataV3, principalId: string, employeeId: string, applicationId: AdministrativeApplicationId | null, at: string) {
  return administrationPolicy(policy).grants.some(grant => grant.principalId === principalId && grant.employeeId === employeeId && grant.applicationId === applicationId && administrativeGrantActive(grant, at))
}
export function assertRecentAdministrativeAuthentication(actor: GovernanceActorContext, at: string) {
  const age = Date.parse(at) - Date.parse(actor.authenticatedAt ?? '')
  if (!actor.sessionId || !['aal1', 'aal2'].includes(actor.assuranceLevel ?? '') || !Number.isFinite(age) || age < 0 || age > 300_000) throw new AdministrationError('AUTH_RECENT_REQUIRED')
}
export function assertPlatformAdministrator(policy: GovernancePolicyDataV3, source: GovernanceOrgSource, actor: GovernanceActorContext, at: string) {
  if (!actor.employeeId || !administrativeTargetEligible(policy, source, actor.principalId, actor.employeeId, at)
    || !hasAdministrativeGrant(policy, actor.principalId, actor.employeeId, null, at)
    || !hasAdministrativeGrant(policy, actor.principalId, actor.employeeId, 'orgmaster', at)) throw new AdministrationError('PLATFORM_ADMIN_REQUIRED')
}
/** Evaluate all scheduled boundaries so an expiring entry grant cannot strand the last root. */
export function assertAdministrativeContinuity(before: GovernancePolicyDataV3, after: GovernancePolicyDataV3, source: GovernanceOrgSource, at: string) {
  if (administrationPolicy(before).initializedByCommandId === null) return
  const next = administrationPolicy(after)
  if (next.initializedByCommandId !== administrationPolicy(before).initializedByCommandId) throw new AdministrationError('ADMINISTRATION_CONFLICT')
  const instants = [at, ...next.grants.filter(grant => grant.validTo !== null && grant.validTo > at).map(grant => grant.validTo!)]
  for (const instant of instants) {
    const roots = next.grants.filter(grant => grant.roleCode === 'platform_super_admin' && administrativeGrantActive(grant, instant)
      && administrativeTargetEligible(after, source, grant.principalId, grant.employeeId, instant)
      && hasAdministrativeGrant(after, grant.principalId, grant.employeeId, 'orgmaster', instant))
    if (!roots.length) throw new AdministrationError('LAST_PLATFORM_ADMIN')
  }
}
export const administrationExpectedSchema = z.strictObject({ governanceRevision: opaque, organizationRevision: opaque, administrationVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) })
const targetSchema = z.strictObject({ principalId: opaque, employeeId: opaque, applicationId: app.nullable(), validFrom: instant, validTo: instant.nullable() })
export const administrationCommandV1Schema = z.strictObject({
  contractVersion: z.literal(ADMINISTRATION_COMMAND_CONTRACT), commandId: z.uuid(),
  operation: z.enum(['grant_platform_administrator', 'revoke_platform_administrator', 'grant_application_administrator', 'revoke_application_administrator', 'replace_application_administrator']),
  target: targetSchema.nullable(), grantId: z.uuid().nullable(), reason, expected: administrationExpectedSchema,
  catalogBindings: z.partialRecord(app, administrativeCatalogBindingSchema), previewHash: hash.optional(),
}).superRefine((value, context) => {
  const revoke = value.operation.startsWith('revoke_'), replace = value.operation === 'replace_application_administrator'
  const root = value.operation.includes('platform_')
  if (revoke ? !value.grantId || value.target !== null : !value.target || (replace ? !value.grantId : value.grantId !== null)) context.addIssue({ code: 'custom', message: 'ADMIN_TARGET_INVALID' })
  if (value.target && (root ? value.target.applicationId !== null || value.target.validTo !== null : value.target.applicationId === null)) context.addIssue({ code: 'custom', message: 'ADMIN_TARGET_INVALID' })
})
export const administrationBatchCommandSchema = z.strictObject({
  contractVersion: z.literal(ADMINISTRATION_BATCH_COMMAND_CONTRACT), commandId: z.uuid(),
  operation: z.literal('grant_application_administrators_batch'), target: targetSchema,
  grantId: z.null(), applications: z.array(app).min(1).max(3), reason, expected: administrationExpectedSchema,
  catalogBindings: z.partialRecord(app, administrativeCatalogBindingSchema), previewHash: hash.optional(),
}).superRefine((value, context) => {
  if (value.target.applicationId !== null || new Set(value.applications).size !== value.applications.length) context.addIssue({ code: 'custom', message: 'ADMIN_TARGET_INVALID' })
})
export const administrationCommandSchema = z.union([administrationCommandV1Schema,administrationBatchCommandSchema])
export type AdministrationCommand = z.infer<typeof administrationCommandSchema>
export type AdministrationCatalogBindings = Partial<Record<AdministrativeApplicationId, AdministrativeCatalogBindingV1>>
export function parseAdministrationCommand(value: unknown) {
  const parsed = administrationCommandSchema.safeParse(value)
  if (!parsed.success) throw new AdministrationError('ADMIN_TARGET_INVALID')
  return parsed.data
}
export function administrationRequestHash(command: AdministrationCommand, actorId: string, environmentKey: string) {
  const { previewHash: _previewHash, ...payload } = command
  return administrationHash({ actorId, environmentKey, payload })
}
export function applyAdministrativeGrantCommand(policy: GovernancePolicyDataV3, source: GovernanceOrgSource, command: AdministrationCommand, createdBy: AdministrativeGrantV1['createdBy'], catalogs: AdministrationCatalogBindings, at: string, newId = randomUUID()) {
  const current = administrationPolicy(policy)
  const grants = structuredClone(current.grants)
  const old = command.grantId ? grants.find(grant => grant.id === command.grantId) : undefined
  const revoke = command.operation.startsWith('revoke_')
  const root = command.operation.includes('platform_')
  if (command.grantId && (!old || (old.roleCode === 'platform_super_admin') !== root && command.operation !== 'replace_application_administrator')) throw new AdministrationError('ADMIN_TARGET_INVALID')
  if (command.operation === 'replace_application_administrator' && (!old || old.roleCode !== 'application_system_admin' || !command.target || old.principalId !== command.target.principalId || old.employeeId !== command.target.employeeId || old.applicationId !== command.target.applicationId)) throw new AdministrationError('ADMIN_TARGET_INVALID')
  if (revoke) {
    if (old!.status === 'revoked') return { administration: current, grantIds: [old!.id], noChange: true }
    old!.status = 'revoked'
  } else {
    const target = command.target!
    if (!administrativeTargetEligible(policy, source, target.principalId, target.employeeId, at)) throw new AdministrationError('ADMIN_TARGET_INVALID')
    let binding: AdministrativeCatalogBindingV1 | null = null
    if (target.applicationId) {
      binding = catalogs[target.applicationId] ?? null
      if (!binding || administrationHash(binding) !== administrationHash(command.catalogBindings[target.applicationId]) || binding.stableRoleId !== ADMINISTRATIVE_ROLE_IDS[target.applicationId]) throw new AdministrationError('CATALOG_BINDING_CONFLICT')
    }
    const existing = grants.find(grant => grant.principalId === target.principalId && grant.employeeId === target.employeeId && grant.applicationId === target.applicationId && grant.status === 'active' && grant.validFrom === target.validFrom && grant.validTo === target.validTo)
    if (existing && command.operation !== 'replace_application_administrator') return { administration: current, grantIds: [existing.id], noChange: true }
    if (old) old.status = 'revoked'
    grants.push({ id: newId, principalId: target.principalId, employeeId: target.employeeId, roleCode: root ? 'platform_super_admin' : 'application_system_admin', applicationId: target.applicationId, subjectKind: 'principal', basis: 'manual', scope: { kind: root ? 'platform' : 'global' }, status: 'active', validFrom: target.validFrom, validTo: target.validTo, createdBy, reason: command.reason, catalogBinding: binding })
  }
  const administration = { ...current, version: current.version + 1, grants }
  if (!administrationPolicySchema.safeParse(administration).success) throw new AdministrationError('ADMIN_TARGET_INVALID')
  assertAdministrativeContinuity(policy, { ...policy, administration }, source, at)
  return { administration, grantIds: revoke ? [old!.id] : old ? [old.id, newId] : [newId], noChange: false }
}

export function applyAdministrativeGrantBatchCommand(policy: GovernancePolicyDataV3, source: GovernanceOrgSource, command: AdministrationCommand, createdBy: AdministrativeGrantV1['createdBy'], catalogs: AdministrationCatalogBindings, at: string, newId = randomUUID) {
  if (command.operation !== 'grant_application_administrators_batch' || !command.target || !command.applications) throw new AdministrationError('ADMIN_TARGET_INVALID')
  if (!administrativeTargetEligible(policy, source, command.target.principalId, command.target.employeeId, at)) throw new AdministrationError('ADMIN_TARGET_INVALID')
  const current = administrationPolicy(policy)
  const grants = structuredClone(current.grants)
  const grantIds: string[] = []
  let changed = false
  for (const applicationId of command.applications) {
    const binding = catalogs[applicationId]
    if (!binding || administrationHash(binding) !== administrationHash(command.catalogBindings[applicationId])
      || binding.stableRoleId !== ADMINISTRATIVE_ROLE_IDS[applicationId]) throw new AdministrationError('CATALOG_BINDING_CONFLICT')
    const existing = grants.find(grant => grant.principalId === command.target!.principalId
      && grant.employeeId === command.target!.employeeId && grant.applicationId === applicationId && grant.status === 'active'
      && grant.validFrom <= command.target!.validFrom
      && (command.target!.validTo === null ? grant.validTo === null : grant.validTo === null || grant.validTo >= command.target!.validTo))
    if (existing) { grantIds.push(existing.id); continue }
    const id = newId()
    grantIds.push(id); changed = true
    grants.push({ id, principalId: command.target.principalId, employeeId: command.target.employeeId,
      roleCode: 'application_system_admin', applicationId, subjectKind: 'principal', basis: 'manual', scope: { kind: 'global' },
      status: 'active', validFrom: command.target.validFrom, validTo: command.target.validTo,
      createdBy, reason: command.reason, catalogBinding: binding })
  }
  if (!changed) return { administration: current, grantIds, noChange: true }
  const administration = { ...current, version: current.version + 1, grants }
  if (!administrationPolicySchema.safeParse(administration).success) throw new AdministrationError('ADMIN_TARGET_INVALID')
  assertAdministrativeContinuity(policy, { ...policy, administration }, source, at)
  return { administration, grantIds, noChange: false }
}
