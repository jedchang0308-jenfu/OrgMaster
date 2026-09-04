import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { clampWorkspaceSplitRatio, collectLayoutModules, moduleMinimum } from '../../workspace/layout'
import { getWorkspaceModule, isWorkspaceModuleId } from '../../workspace/moduleRegistry'
import type { WorkspaceAction } from '../../workspace/state'
import type {
  LayoutDropTarget,
  RequestPanelClose,
  WorkspaceOpenIntent,
  WorkspaceLayoutNodeV1,
  WorkspaceLayoutV1,
  WorkspaceModuleId,
  WorkspaceSessionState,
  WorkspaceSurfaceVisibility,
} from '../../workspace/types'
import { WorkspacePanelFrame } from './WorkspacePanelFrame'
import { useWorkspacePanelDrag } from './WorkspacePanelDragContext'

export const WORKSPACE_PANEL_DRAG_MIME = 'application/x-orgmaster-panel-layout'

interface Props {
  layout: WorkspaceLayoutV1
  session: WorkspaceSessionState
  mobileSingleSurface: boolean
  dispatch: (action: WorkspaceAction) => void
  requestClose: RequestPanelClose
  renderPanel: (moduleId: WorkspaceModuleId, visibility: WorkspaceSurfaceVisibility) => React.ReactNode
}

function parsePanelDrag(event: DragEvent) {
  try {
    const value = JSON.parse(event.dataTransfer.getData(WORKSPACE_PANEL_DRAG_MIME)) as { moduleId?: unknown }
    return typeof value.moduleId === 'string' && isWorkspaceModuleId(value.moduleId) ? value.moduleId : null
  } catch {
    return null
  }
}

function minimumForNode(node: WorkspaceLayoutNodeV1, axis: 'horizontal' | 'vertical'): number {
  if (node.kind === 'stack') return Math.max(...node.tabs.map((moduleId) => moduleMinimum(moduleId, axis)))
  if (node.axis === axis) return minimumForNode(node.first, axis) + minimumForNode(node.second, axis)
  return Math.max(minimumForNode(node.first, axis), minimumForNode(node.second, axis))
}

function updateDropPreview(event: DragEvent) {
  const target = event.currentTarget as HTMLElement
  const zoneContainer = target.parentElement
  if (!zoneContainer) return
  zoneContainer.querySelectorAll(':scope > .is-preview').forEach((zone) => zone.classList.remove('is-preview'))
  target.classList.add('is-preview')
}

function clearDropPreview(region: HTMLElement | null) {
  region?.querySelectorAll('.workspace-region__drop-zones > .is-preview').forEach((zone) => zone.classList.remove('is-preview'))
}

function PanelRegion({
  node,
  path,
  session,
  mobileSingleSurface,
  draggingModuleId,
  setDraggingModuleId,
  dispatch,
  requestClose,
  renderPanel,
}: {
  node: Extract<WorkspaceLayoutNodeV1, { kind: 'stack' }>
  path: number[]
  session: WorkspaceSessionState
  mobileSingleSurface: boolean
  draggingModuleId: WorkspaceModuleId | null
  setDraggingModuleId: (moduleId: WorkspaceModuleId | null) => void
  dispatch: Props['dispatch']
  requestClose: RequestPanelClose
  renderPanel: Props['renderPanel']
}) {
  const regionRef = useRef<HTMLElement>(null)
  const [regionSize, setRegionSize] = useState({ width: 0, height: 0 })
  const activeTab = mobileSingleSurface && session.focusedPanel && node.tabs.includes(session.focusedPanel)
    ? session.focusedPanel
    : node.activeTab
  const drop = (event: DragEvent, target: LayoutDropTarget) => {
    const moduleId = parsePanelDrag(event)
    if (!moduleId) {
      clearDropPreview(regionRef.current)
      return
    }
    event.preventDefault()
    if (session.panels[moduleId]) {
      dispatch({ type: 'MOVE_PANEL', moduleId, target })
    } else {
      dispatch({ type: 'OPEN_OR_FOCUS', intent: { moduleId, source: 'launcher' } as WorkspaceOpenIntent, target })
    }
    clearDropPreview(regionRef.current)
    setDraggingModuleId(null)
  }
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !regionRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setRegionSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(regionRef.current)
    return () => observer.disconnect()
  }, [])
  const canSplit = (moduleId: WorkspaceModuleId, edge: 'left' | 'right' | 'top' | 'bottom') => {
    if (mobileSingleSurface || (node.tabs.length === 1 && node.tabs[0] === moduleId)) return false
    const axis = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical'
    const available = axis === 'horizontal' ? regionSize.width : regionSize.height
    if (!available) return true
    return moduleMinimum(moduleId, axis) + minimumForNode(node, axis) + 6 <= available
  }
  return (
    <section ref={regionRef} className="workspace-region" aria-label="工作台區域">
      <div className="workspace-region__tabs" role="tablist" aria-label="已開啟功能">
        {node.tabs.map((moduleId) => {
          const active = moduleId === activeTab
          const pinned = session.panels[moduleId]?.pinned ?? false
          const closePending = session.closePendingModuleId === moduleId
          return (
            <div key={moduleId} className={`workspace-region__tab-wrap${active ? ' is-active' : ''}`}>
              <button
                id={`workspace-tab-${moduleId}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`workspace-panel-${moduleId}`}
                tabIndex={active ? 0 : -1}
                draggable={!mobileSingleSurface}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(WORKSPACE_PANEL_DRAG_MIME, JSON.stringify({ moduleId }))
                  setDraggingModuleId(moduleId)
                }}
                onDragEnd={() => { clearDropPreview(regionRef.current); setDraggingModuleId(null) }}
                onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', stackPath: path, moduleId })}
              >
                <span>{getWorkspaceModule(moduleId).label}</span>
              </button>
              {!mobileSingleSurface && <button type="button" className={`workspace-region__pin${pinned ? ' is-pinned' : ''}`} aria-label={pinned ? `取消固定${getWorkspaceModule(moduleId).label}` : `固定${getWorkspaceModule(moduleId).label}`} onClick={() => dispatch({ type: 'SET_PINNED', moduleId, pinned: !pinned })}>{pinned ? <PinOff size={14} strokeWidth={1.65} aria-hidden="true" /> : <Pin size={14} strokeWidth={1.65} aria-hidden="true" />}</button>}
              <button id={`workspace-close-${moduleId}`} type="button" className="workspace-region__close" aria-label={`關閉${getWorkspaceModule(moduleId).label}`} disabled={closePending} onClick={() => { void requestClose(moduleId) }}><X size={14} strokeWidth={1.7} aria-hidden="true" /></button>
            </div>
          )
        })}
      </div>
      <div className="workspace-region__content" aria-busy={session.closePendingModuleId ? 'true' : undefined}>
        {node.tabs.map((moduleId) => {
          const active = moduleId === activeTab
          if (mobileSingleSurface && !active) return null
          return (
            <div
              key={moduleId}
              id={`workspace-panel-${moduleId}`}
              role="tabpanel"
              aria-labelledby={`workspace-tab-${moduleId}`}
              aria-hidden={!active}
              hidden={!active}
              tabIndex={active ? 0 : -1}
            >
              <WorkspacePanelFrame moduleId={moduleId} visibility={active ? 'active' : 'hidden'}>
                {renderPanel(moduleId, active ? 'active' : 'hidden')}
              </WorkspacePanelFrame>
            </div>
          )
        })}
      </div>
      {draggingModuleId && !(node.tabs.length === 1 && node.tabs.includes(draggingModuleId)) && (
        <div className="workspace-region__drop-zones" aria-hidden="true">
          {(['left', 'right', 'top', 'bottom'] as const).map((edge) => {
            const target = { kind: 'edge', stackPath: path, edge } as const
            const available = canSplit(draggingModuleId, edge)
            return <div key={edge} className={`is-${edge}${available ? '' : ' is-unavailable'}`} aria-disabled={!available} onDragOver={available ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; updateDropPreview(event) } : undefined} onDrop={available ? (event) => drop(event, target) : undefined}>
              {available && <span className="workspace-region__drop-preview"><span>{getWorkspaceModule(draggingModuleId).label}</span></span>}
            </div>
          })}
          {(() => {
            const target = { kind: 'stack', stackPath: path } as const
            return <div className="is-center" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; updateDropPreview(event) }} onDrop={(event) => drop(event, target)}><span className="workspace-region__drop-preview"><span>{getWorkspaceModule(draggingModuleId).label}</span></span></div>
          })()}
        </div>
      )}
    </section>
  )
}

function SplitSeparator({
  node,
  path,
  dispatch,
}: {
  node: Extract<WorkspaceLayoutNodeV1, { kind: 'split' }>
  path: number[]
  dispatch: Props['dispatch']
}) {
  const move = (separator: HTMLDivElement, client: number) => {
    const rectangle = separator.parentElement?.getBoundingClientRect()
    if (!rectangle) return
    const size = node.axis === 'horizontal' ? rectangle.width : rectangle.height
    const offset = node.axis === 'horizontal' ? client - rectangle.left : client - rectangle.top
    const ratio = clampWorkspaceSplitRatio(offset / size, size, minimumForNode(node.first, node.axis), minimumForNode(node.second, node.axis))
    if (ratio !== null) dispatch({ type: 'RESIZE_SPLIT', splitPath: path, ratio })
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const separator = event.currentTarget
    separator.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const separator = event.currentTarget
    if (!separator.hasPointerCapture(event.pointerId)) return
    move(separator, node.axis === 'horizontal' ? event.clientX : event.clientY)
  }
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const separator = event.currentTarget
    if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrease = node.axis === 'horizontal' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
    const increase = node.axis === 'horizontal' ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
    if (!decrease && !increase) return
    event.preventDefault()
    const rectangle = event.currentTarget.parentElement?.getBoundingClientRect()
    const size = node.axis === 'horizontal' ? rectangle?.width ?? 0 : rectangle?.height ?? 0
    const step = event.shiftKey ? 0.1 : 0.02
    const requested = node.ratio + (decrease ? -step : step)
    const ratio = size > 0 ? clampWorkspaceSplitRatio(requested, size, minimumForNode(node.first, node.axis), minimumForNode(node.second, node.axis)) : Math.min(0.95, Math.max(0.05, requested))
    if (ratio !== null) dispatch({ type: 'RESIZE_SPLIT', splitPath: path, ratio })
  }
  return <div className="workspace-split__separator" role="separator" aria-label="調整工作台區域大小" aria-orientation={node.axis === 'horizontal' ? 'vertical' : 'horizontal'} aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(node.ratio * 100)} tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onKeyDown} />
}

export function WorkspaceLayout({ layout, session, mobileSingleSurface, dispatch, requestClose, renderPanel }: Props) {
  const panelDrag = useWorkspacePanelDrag()
  const [localDraggingModuleId, setLocalDraggingModuleId] = useState<WorkspaceModuleId | null>(null)
  const setDraggingModuleId = (moduleId: WorkspaceModuleId | null) => {
    setLocalDraggingModuleId(moduleId)
    if (moduleId) panelDrag?.beginDragging(moduleId)
    else panelDrag?.endDragging()
  }
  const draggingModuleId = panelDrag?.draggingModuleId ?? localDraggingModuleId
  const mobileNode = useMemo<WorkspaceLayoutNodeV1 | null>(() => {
    if (!mobileSingleSurface) return null
    const openPanels = collectLayoutModules(layout)
    const activeTab = session.focusedPanel && openPanels.includes(session.focusedPanel) ? session.focusedPanel : openPanels[0]
    return activeTab ? { kind: 'stack', tabs: openPanels, activeTab } : null
  }, [layout, mobileSingleSurface, session.focusedPanel])
  const root = mobileSingleSurface ? mobileNode : layout.root
  const renderNode = (node: WorkspaceLayoutNodeV1, path: number[]): React.ReactNode => {
    if (node.kind === 'stack') return <PanelRegion key={path.join('.') || 'root'} node={node} path={path} session={session} mobileSingleSurface={mobileSingleSurface} draggingModuleId={draggingModuleId} setDraggingModuleId={setDraggingModuleId} dispatch={dispatch} requestClose={requestClose} renderPanel={renderPanel} />
    return (
      <div key={path.join('.') || 'root'} className={`workspace-split is-${node.axis}`} style={node.axis === 'horizontal' ? { gridTemplateColumns: `${node.ratio}fr auto ${1 - node.ratio}fr` } : { gridTemplateRows: `${node.ratio}fr auto ${1 - node.ratio}fr` }}>
        {renderNode(node.first, [...path, 0])}
        <SplitSeparator node={node} path={path} dispatch={dispatch} />
        {renderNode(node.second, [...path, 1])}
      </div>
    )
  }

  return <div className="workspace-layout">{root ? renderNode(root, []) : <div className="workspace-empty"><strong>工作台目前沒有開啟功能</strong><span>請從上方「功能」選單開啟需要的模組。</span></div>}</div>
}
