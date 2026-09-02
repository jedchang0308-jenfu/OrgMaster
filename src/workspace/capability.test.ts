import { describe, expect, it } from 'vitest'
import { resolveModuleCapability, resolveWorkspaceCompositionCapability } from './capability'
import type { WorkspaceEnvironment } from './types'

const environment: WorkspaceEnvironment = {
  viewportWidth: 1440,
  hoverCapable: true,
  finePointer: true,
  mobileReadOnly: false,
  serverReady: true,
  recoveryState: 'none',
  workspaceMode: 'draft-edit',
}

describe('workspace capability', () => {
  it('keeps fine-pointer desktop composition independent from viewport width', () => {
    expect(resolveWorkspaceCompositionCapability(environment)).toEqual({ canCompose: true, mobileReadOnly: false })
    expect(resolveWorkspaceCompositionCapability({ ...environment, viewportWidth: 946, mobileReadOnly: true })).toEqual({ canCompose: true, mobileReadOnly: true })
    expect(resolveWorkspaceCompositionCapability({ ...environment, finePointer: false })).toMatchObject({ canCompose: false, mobileReadOnly: true })
    expect(resolveWorkspaceCompositionCapability({ ...environment, hoverCapable: false })).toMatchObject({ canCompose: false, mobileReadOnly: true })
  })

  it('intersects recovery, device, workspace mode and domain capability', () => {
    const writable = { canRead: true, canMutate: true }
    expect(resolveModuleCapability('organization', environment, writable)).toEqual(writable)
    expect(resolveModuleCapability('organization', { ...environment, serverReady: false }, writable)).toMatchObject({ canRead: true, canMutate: false })
    expect(resolveModuleCapability('organization', { ...environment, workspaceMode: 'current-view' }, writable)).toMatchObject({ canRead: true, canMutate: false })
    expect(resolveModuleCapability('organization', environment, { canRead: false, canMutate: false, reason: 'forbidden' })).toEqual({ canRead: false, canMutate: false, reason: 'forbidden' })
  })
})
