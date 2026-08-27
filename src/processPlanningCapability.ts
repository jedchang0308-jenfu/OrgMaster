export interface ProcessPlanningCapabilityEnvironment {
  editingEnabled: boolean
  serverReady: boolean
  recoveryOpen: boolean
  mobileReadOnly: boolean
  viewportWidth?: number
  hoverCapable?: boolean
  finePointer?: boolean
}

export function canMutateProcessPlanning(environment: ProcessPlanningCapabilityEnvironment): boolean {
  return environment.editingEnabled
    && environment.serverReady
    && !environment.recoveryOpen
    && !environment.mobileReadOnly
    && (environment.viewportWidth ?? 1024) >= 1024
    && (environment.hoverCapable ?? true)
    && (environment.finePointer ?? true)
}

export function announceProcessPlanningCapability(
  environment: ProcessPlanningCapabilityEnvironment,
  previous: boolean | undefined,
  listener: (writable: boolean) => void,
): boolean {
  const next = canMutateProcessPlanning(environment)
  if (previous !== next) listener(next)
  return next
}

