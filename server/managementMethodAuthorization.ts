import type { IncomingMessage } from 'node:http'
import { evaluatePermission } from '../src/governance/evaluatePermission'
import type { GovernanceActorContext } from '../src/governance/types'
import { DEV_ISSUER, DEV_PRINCIPAL_ID, DEV_SUBJECT, developmentPermissionForActor, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { readGovernanceStore } from './orgmasterGovernanceStore'
import type { ManagementMethodCapability } from '../src/managementMethods/types'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'

export const managementMethodPermissionCodes: Record<ManagementMethodCapability, string> = {
  create: 'orgmaster.management_method.create',
  readReadable: 'orgmaster.management_method.read_readable',
  readDraft: 'orgmaster.management_method.read_draft',
  editDraft: 'orgmaster.management_method.edit_draft',
  manageReadable: 'orgmaster.management_method.manage_read_availability',
  manageMetadata: 'orgmaster.management_method.manage_metadata',
}

export function actorFromRequest(request: IncomingMessage, enabled: boolean) {
  // In local development the fixed loopback identity is the bootstrap actor.
  // Auth middleware also attaches a short-lived verified dev session to the
  // same request, but that session intentionally has bootstrap=false. Prefer
  // the explicit dev identity here; production (enabled=false) still uses the
  // verified session exclusively.
  return resolveDevelopmentIdentity(request, enabled) ?? verifiedGovernanceActor(request)
}

export async function capabilityFor(root: string, actor: GovernanceActorContext, capability: ManagementMethodCapability) {
  const development = developmentPermissionForActor(actor, managementMethodPermissionCodes[capability])
  if (development !== null) return development
  const governance = await readGovernanceStore(root)
  if (actor.bootstrap && !governance.document.activePolicyVersionId) return true
  return evaluatePermission(governance.document, { applicationId: 'orgmaster', issuer: actor.issuer, subject: actor.subject, permissionCode: managementMethodPermissionCodes[capability], scope: { kind: 'global' } }).status === 'allowed'
}

export async function capabilitiesFor(root: string, actor: GovernanceActorContext) {
  const entries = await Promise.all((Object.keys(managementMethodPermissionCodes) as ManagementMethodCapability[]).map(async (capability) => [capability, await capabilityFor(root, actor, capability)] as const))
  return Object.fromEntries(entries) as Record<ManagementMethodCapability, boolean>
}

export function defaultDevActor(): GovernanceActorContext { return { principalId: DEV_PRINCIPAL_ID, issuer: DEV_ISSUER, subject: DEV_SUBJECT, employeeId: null, bootstrap: true } }
