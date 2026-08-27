export interface DutyConfigurationCapabilityEnvironment {
  editingEnabled: boolean
  serverReady: boolean
  recoveryOpen: boolean
  mobileReadOnly: boolean
  viewportWidth?: number
  hoverCapable?: boolean
  finePointer?: boolean
}

export function canMutateDutyConfiguration(environment: DutyConfigurationCapabilityEnvironment): boolean {
  return environment.editingEnabled
    && environment.serverReady
    && !environment.recoveryOpen
    && !environment.mobileReadOnly
    && (environment.viewportWidth ?? 1024) >= 1024
    && (environment.hoverCapable ?? true)
    && (environment.finePointer ?? true)
}

export function observeDutyConfigurationCapability(
  environment: DutyConfigurationCapabilityEnvironment,
  listener: (writable: boolean) => void,
): () => void {
  let previous = canMutateDutyConfiguration(environment)
  listener(previous)
  return () => {
    previous = false
  }
}

export function announceDutyConfigurationCapability(
  environment: DutyConfigurationCapabilityEnvironment,
  previous: boolean | undefined,
  listener: (writable: boolean) => void,
): boolean {
  const next = canMutateDutyConfiguration(environment)
  if (previous !== next) listener(next)
  return next
}
