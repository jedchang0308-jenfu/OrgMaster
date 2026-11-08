import source from '../../contracts/orgmaster-administration/v2/administrative-definitions.json' with { type: 'json' }
import type { AdministrativeApplicationId, AdministrativeCatalogBindingV1 } from './types'

type Definition = Readonly<{
  applicationId: AdministrativeApplicationId
  definitionVersion: string
  definitionSha256: string
  profileId: string
}>

function definition(value: unknown): Definition {
  if (!value || typeof value !== 'object') throw new Error('ADMINISTRATIVE_DEFINITION_INVALID')
  const row = value as Record<string, unknown>
  if (!['orgmaster', 'ai-pdm', 'financial-management-system'].includes(String(row.applicationId))
    || typeof row.definitionVersion !== 'string' || !row.definitionVersion
    || typeof row.definitionSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.definitionSha256)
    || typeof row.profileId !== 'string' || !row.profileId) throw new Error('ADMINISTRATIVE_DEFINITION_INVALID')
  return Object.freeze(row as Definition)
}

export const administrativeDefinitions = Object.freeze(
  Object.fromEntries(source.definitions.map(value => {
    const parsed = definition(value)
    return [parsed.applicationId, parsed]
  })),
) as Readonly<Record<AdministrativeApplicationId, Definition>>

export function administrativeDefinitionBinding(applicationId: AdministrativeApplicationId): AdministrativeCatalogBindingV1 {
  const current = administrativeDefinitions[applicationId]
  return Object.freeze({
    catalogVersion: current.definitionVersion,
    contentSha256: current.definitionSha256,
    stableRoleId: current.profileId,
    roleDefinitionHash: current.definitionSha256,
  })
}

export const administrativeDefinitionBindings = Object.freeze({
  orgmaster: administrativeDefinitionBinding('orgmaster'),
  'ai-pdm': administrativeDefinitionBinding('ai-pdm'),
  'financial-management-system': administrativeDefinitionBinding('financial-management-system'),
})
