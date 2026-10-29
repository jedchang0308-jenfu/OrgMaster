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

/** Exact server-side ownerport readState projection; browser payloads are not an input. */
export type PlatformLocalGenerationFence = Readonly<{
  sandboxId: string
  resetId: string
  sourceGeneration: string
  generation: string
  status: 'resetting' | 'ready' | 'failed'
  sessionsRevoked: boolean
  registryRetained: boolean
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
  unrevokedSourceBindingCount: number
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
  unrevokedSourceBindingCount: number
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
  /** Server-side Platform ownerport closure bound to readState, not browser-supplied state. */
  readPlatformFence(scope: OrgmasterLocalGenerationFenceScope): Promise<PlatformLocalGenerationFence>
}): Readonly<{
  rebindAndFenceSessions(scope: OrgmasterLocalGenerationFenceScope): Promise<OrgmasterLocalGenerationFenceResult>
  readGenerationFence(scope: OrgmasterLocalGenerationFenceScope): Promise<OrgmasterLocalGenerationFenceSnapshot>
  readiness(scope: OrgmasterLocalGenerationFenceScope): Promise<OrgmasterLocalGenerationFenceReadiness>
}>
