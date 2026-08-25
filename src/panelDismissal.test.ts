import { describe, expect, it } from 'vitest'
import { resolveEscapeDismissAction, type EscapeDismissContext } from './panelDismissal'

const baseContext: EscapeDismissContext = {
  recoveryOpen: false,
  deleteOpen: false,
  directoryDialogOpen: false,
  roleRiskOpen: false,
  editorBoundaryActive: false,
  focusedPanel: null,
  lastInteractedPanel: null,
  inspectorOpen: false,
  directoryOpen: false,
}

function context(overrides: Partial<EscapeDismissContext>): EscapeDismissContext {
  return { ...baseContext, ...overrides }
}

describe('resolveEscapeDismissAction', () => {
  it('does nothing while the recovery gate is open', () => {
    expect(resolveEscapeDismissAction(context({
      recoveryOpen: true,
      inspectorOpen: true,
      directoryOpen: true,
    }))).toBe('none')
  })

  it('closes only the highest priority dialog', () => {
    expect(resolveEscapeDismissAction(context({ deleteOpen: true, directoryDialogOpen: true }))).toBe('close-delete-dialog')
    expect(resolveEscapeDismissAction(context({ directoryDialogOpen: true }))).toBe('close-directory-dialog')
  })

  it('lets role-risk own Escape before primary panels', () => {
    expect(resolveEscapeDismissAction(context({ roleRiskOpen: true, inspectorOpen: true, directoryOpen: true }))).toBe('dismiss-role-risk')
  })

  it('leaves editor boundaries to their local owner', () => {
    expect(resolveEscapeDismissAction(context({ editorBoundaryActive: true, inspectorOpen: true }))).toBe('none')
  })

  it('closes the focused primary panel first', () => {
    expect(resolveEscapeDismissAction(context({ focusedPanel: 'directory', inspectorOpen: true, directoryOpen: true }))).toBe('close-directory')
    expect(resolveEscapeDismissAction(context({ focusedPanel: 'inspector', inspectorOpen: true, directoryOpen: true }))).toBe('close-inspector')
  })

  it('uses last interaction as the two-panel fallback', () => {
    expect(resolveEscapeDismissAction(context({ lastInteractedPanel: 'inspector', inspectorOpen: true, directoryOpen: true }))).toBe('close-inspector')
    expect(resolveEscapeDismissAction(context({ lastInteractedPanel: 'directory', inspectorOpen: true, directoryOpen: true }))).toBe('close-directory')
    expect(resolveEscapeDismissAction(context({ inspectorOpen: true, directoryOpen: true }))).toBe('close-directory')
  })

  it('closes the only remaining primary panel and otherwise does nothing', () => {
    expect(resolveEscapeDismissAction(context({ inspectorOpen: true }))).toBe('close-inspector')
    expect(resolveEscapeDismissAction(context({ directoryOpen: true }))).toBe('close-directory')
    expect(resolveEscapeDismissAction(context({}))).toBe('none')
  })
})
