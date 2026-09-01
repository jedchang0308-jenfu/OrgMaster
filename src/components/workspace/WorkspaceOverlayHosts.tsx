import { createContext, useCallback, useContext, useMemo, useState, type ReactNode, type RefCallback } from 'react'
import { createPortal } from 'react-dom'

export type WorkspaceOverlayScope = 'panel' | 'global'

export interface PanelAnchoredRect {
  width: number
  height: number
}

export interface PanelAnchoredPosition {
  left: number
  top: number
}

export class WorkspaceOverlayScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceOverlayScopeError'
  }
}

interface GlobalOverlayContextValue {
  globalHost: HTMLElement | null
  registerGlobalHost: RefCallback<HTMLElement>
}

interface PanelOverlayContextValue {
  moduleId: string
  panelHost: HTMLElement | null
  registerPanelHost: RefCallback<HTMLElement>
}

const GlobalOverlayContext = createContext<GlobalOverlayContextValue | undefined>(undefined)
const PanelOverlayContext = createContext<PanelOverlayContextValue | undefined>(undefined)

interface ProviderProps {
  children: ReactNode
}

export function WorkspaceOverlayProvider({ children }: ProviderProps) {
  const [globalHost, setGlobalHost] = useState<HTMLElement | null>(null)
  const registerGlobalHost = useCallback<RefCallback<HTMLElement>>((node) => setGlobalHost(node), [])
  const value = useMemo(() => ({ globalHost, registerGlobalHost }), [globalHost, registerGlobalHost])
  return <GlobalOverlayContext.Provider value={value}>{children}</GlobalOverlayContext.Provider>
}

interface PanelScopeProps extends ProviderProps {
  moduleId: string
}

export function WorkspacePanelOverlayScope({ moduleId, children }: PanelScopeProps) {
  const parent = useContext(GlobalOverlayContext)
  if (!parent) throw new WorkspaceOverlayScopeError(`WorkspacePanelOverlayScope「${moduleId}」必須位於WorkspaceOverlayProvider內`)
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null)
  const registerPanelHost = useCallback<RefCallback<HTMLElement>>((node) => setPanelHost(node), [])
  const value = useMemo(() => ({ moduleId, panelHost, registerPanelHost }), [moduleId, panelHost, registerPanelHost])
  return <PanelOverlayContext.Provider value={value}>{children}</PanelOverlayContext.Provider>
}

export function PanelOverlayHost() {
  const context = useContext(PanelOverlayContext)
  if (!context) throw new WorkspaceOverlayScopeError('PanelOverlayHost必須位於WorkspacePanelOverlayScope內')
  return <div ref={context.registerPanelHost} data-workspace-overlay-host="panel" data-module={context.moduleId} />
}

export function GlobalOverlayHost() {
  const context = useContext(GlobalOverlayContext)
  if (!context) throw new WorkspaceOverlayScopeError('GlobalOverlayHost必須位於WorkspaceOverlayProvider內')
  return <div ref={context.registerGlobalHost} data-workspace-overlay-host="global" />
}

export interface WorkspacePortalProps {
  scope: WorkspaceOverlayScope
  children: ReactNode
}

export function WorkspacePortal({ scope, children }: WorkspacePortalProps) {
  const global = useContext(GlobalOverlayContext)
  if (!global) throw new WorkspaceOverlayScopeError('WorkspacePortal必須位於WorkspaceOverlayProvider內')
  const panel = useContext(PanelOverlayContext)
  const host = scope === 'global' ? global.globalHost : panel?.panelHost
  if (scope === 'panel' && !panel) throw new WorkspaceOverlayScopeError('WorkspacePortal scope="panel"必須位於WorkspacePanelOverlayScope內')
  if (!host) return null
  return createPortal(children, host)
}

export function resolvePanelAnchoredPosition(
  anchorRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  hostRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  overlaySize: PanelAnchoredRect,
  gap = 8,
): PanelAnchoredPosition {
  const maxLeft = Math.max(gap, hostRect.width - overlaySize.width - gap)
  const maxTop = Math.max(gap, hostRect.height - overlaySize.height - gap)
  const preferredLeft = anchorRect.right - hostRect.left + gap
  const fallbackLeft = anchorRect.left - hostRect.left - overlaySize.width - gap
  const preferredTop = anchorRect.top - hostRect.top
  const fallbackTop = anchorRect.bottom - hostRect.top - overlaySize.height
  const left = preferredLeft + overlaySize.width <= hostRect.width - gap
    ? preferredLeft
    : fallbackLeft
  const top = preferredTop + overlaySize.height <= hostRect.height - gap
    ? preferredTop
    : fallbackTop
  return {
    left: Math.min(maxLeft, Math.max(gap, left)),
    top: Math.min(maxTop, Math.max(gap, top)),
  }
}
