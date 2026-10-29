export type OrgmasterLocalGenerationFenceScope = Readonly<{
  sandboxId: string
  resetId: string
  sourceGeneration: string
  generation: string
}>

export type OrgmasterLocalGenerationFenceTarget = Readonly<{
  contractVersion: 'orgmaster.local-generation-fence-target.v1'
  applicationId: 'orgmaster'
  sandboxId: string
  databaseName: string
  dataDirectory: string
  port: number
  operatorRole: string
  databaseOwnerRole: string
  runtimeRoles: readonly ['jenfu_platform_runtime', 'jenfu_orgmaster_runtime', 'jenfu_ai_pdm_runtime', 'fms_runtime']
}>

/** Typed read-only projection supplied by the Platform owner adapter. */
export type PlatformLocalGenerationFence = Readonly<{
  sandboxId: string
  resetId: string
  sourceGeneration: string
  generation: string
  generationState: 'resetting' | 'ready' | 'failed'
  sourceGenerationState: 'active' | 'revoked'
}>

export type OrgmasterLocalGenerationFenceClient = {
  query(sql: string, values?: unknown[]): Promise<{
    rows?: Record<string, unknown>[]
    rowCount?: number | null
  }>
}

export type OrgmasterLocalGenerationFenceSnapshot = Readonly<{
  sandboxId: string
  resetId: string
  sourceGeneration: string
  generation: string
  targetGeneration: string
  platformFence: PlatformLocalGenerationFence
  activePriorSessionCount: number
  activeSourceSessionCount: number
  activeTargetSessionCount: number
  activePriorGenerations: readonly string[]
  activeApplicationConnectionCount: number
  lifecycleEventCount: number
  lifecycleSessionBindingCount: number
  registrationBindingCount: number
}>

export type OrgmasterLocalGenerationFenceReadiness = Readonly<{
  ready: boolean
  reasons: readonly string[]
  targetGeneration: string
  activePriorSessionCount: number
  activeSourceSessionCount: number
  activeTargetSessionCount: number
  activeApplicationConnectionCount: number
  platformFence: PlatformLocalGenerationFence
  preserved: Readonly<{
    lifecycleEventCount: number
    lifecycleSessionBindingCount: number
    registrationBindingCount: number
  }>
}>

export type OrgmasterLocalGenerationFenceResult = Readonly<{
  status: 'rebound' | 'replayed'
  sandboxId: string
  resetId: string
  sourceGeneration: string
  generation: string
  revokedSessionCount: number
  revokedBindingCount: number
  readiness: OrgmasterLocalGenerationFenceReadiness
}>

export function createOrgmasterLocalGenerationFenceOwner(input: {
  client: OrgmasterLocalGenerationFenceClient
  target: OrgmasterLocalGenerationFenceTarget
  readPlatformFence(scope: OrgmasterLocalGenerationFenceScope): Promise<PlatformLocalGenerationFence>
}): Readonly<{
  rebindAndFenceSessions(scope: OrgmasterLocalGenerationFenceScope): Promise<OrgmasterLocalGenerationFenceResult>
  readGenerationFence(scope: OrgmasterLocalGenerationFenceScope): Promise<OrgmasterLocalGenerationFenceSnapshot>
  readiness(scope: OrgmasterLocalGenerationFenceScope): Promise<OrgmasterLocalGenerationFenceReadiness>
}>
