import type {
  ModuleCapability,
  WorkspaceCompositionCapability,
  WorkspaceEnvironment,
  WorkspaceModuleId,
} from './types'

export function resolveWorkspaceCompositionCapability(environment: WorkspaceEnvironment): WorkspaceCompositionCapability {
  // Workspace composition is a layout capability, not a domain mutation
  // capability. A narrow desktop with a mouse can still arrange tabs; the
  // layout resolver remains responsible for rejecting splits that cannot meet
  // the participating modules' minimum sizes.
  if (!environment.hoverCapable || !environment.finePointer) {
    return {
      canCompose: false,
      mobileReadOnly: true,
      reason: '此裝置使用單一觸控功能畫面',
    }
  }
  return { canCompose: true, mobileReadOnly: environment.mobileReadOnly }
}

export function resolveModuleCapability(
  _moduleId: WorkspaceModuleId,
  environment: WorkspaceEnvironment,
  domainCapability: ModuleCapability,
): ModuleCapability {
  if (!domainCapability.canRead) return { canRead: false, canMutate: false, reason: domainCapability.reason }
  if (environment.recoveryState === 'blocked' || !environment.serverReady) {
    return { canRead: true, canMutate: false, reason: '版本工作區尚未可安全編輯' }
  }
  if (environment.mobileReadOnly || environment.viewportWidth < 1024 || !environment.hoverCapable || !environment.finePointer) {
    return { canRead: true, canMutate: false, reason: '手機與觸控窄版僅提供唯讀' }
  }
  if (environment.workspaceMode === 'current-view') {
    return { canRead: true, canMutate: false, reason: '現行版目前為唯讀' }
  }
  return domainCapability
}

export function observeWorkspaceEnvironment(
  base: Omit<WorkspaceEnvironment, 'viewportWidth' | 'hoverCapable' | 'finePointer' | 'mobileReadOnly'>,
  listener: (environment: WorkspaceEnvironment) => void,
) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    const environment: WorkspaceEnvironment = {
      ...base,
      viewportWidth: 1024,
      hoverCapable: true,
      finePointer: true,
      mobileReadOnly: false,
    }
    listener(environment)
    return () => undefined
  }
  const hover = window.matchMedia('(hover: hover)')
  const pointer = window.matchMedia('(pointer: fine)')
  const update = () => {
    const viewportWidth = window.innerWidth
    const hoverCapable = hover.matches
    const finePointer = pointer.matches
    listener({
      ...base,
      viewportWidth,
      hoverCapable,
      finePointer,
      mobileReadOnly: viewportWidth < 1024 || !hoverCapable || !finePointer,
    })
  }
  update()
  window.addEventListener('resize', update)
  hover.addEventListener('change', update)
  pointer.addEventListener('change', update)
  return () => {
    window.removeEventListener('resize', update)
    hover.removeEventListener('change', update)
    pointer.removeEventListener('change', update)
  }
}
