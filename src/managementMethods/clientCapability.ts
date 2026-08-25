export interface CapabilityEnvironment { matchMedia: (query: string) => MediaQueryList }

export function canMutateManagementMethods(environment: CapabilityEnvironment = { matchMedia: (query) => window.matchMedia(query) }) {
  return environment.matchMedia('(min-width: 1024px)').matches
    && environment.matchMedia('(hover: hover)').matches
    && environment.matchMedia('(pointer: fine)').matches
}

export function observeManagementMethodCapability(onChange: (allowed: boolean) => void, environment: CapabilityEnvironment = { matchMedia: (query) => window.matchMedia(query) }) {
  const queries = ['(min-width: 1024px)', '(hover: hover)', '(pointer: fine)'].map((query) => environment.matchMedia(query))
  const update = () => onChange(queries.every((query) => query.matches))
  queries.forEach((query) => query.addEventListener?.('change', update))
  update()
  return () => queries.forEach((query) => query.removeEventListener?.('change', update))
}
