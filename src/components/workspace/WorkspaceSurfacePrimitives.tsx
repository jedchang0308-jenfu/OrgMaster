import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getWorkbenchWidthPolicy, workbenchDualPaneMinWidth, WORKBENCH_LIST_WIDTH_MAX } from '../../workspace/workbenchWidthPolicy'
import { WorkbenchListSeparator } from './WorkbenchListSeparator'
import { workbenchWidthStyle } from './WorkbenchPresentationPrimitives'
import { useListDetailWorkbenchInteraction } from './useListDetailWorkbenchInteraction'

export interface WorkspaceListDetailSurfaceProps {
  ariaLabel?: string
  className?: string
  dataLayout?: 'adjacent-list-detail' | 'list-only'
  dataVisibility?: string
  dataMode?: string
  dataModule?: string
  detailVisible?: boolean
  listClassName?: string
  detailClassName?: string
  listLabel: string
  detailLabel: string
  list: ReactNode
  detail: ReactNode | null
  emptyDetail?: ReactNode
  listWidthPx?: number | null
  onDetailWidthTransition?: (visible: boolean) => boolean | Promise<boolean>
  onListWidthChange?: (width: number) => void
  onListWidthCommit?: (width: number) => void
  onListRowNavigate?: (rowId: string, direction: 'up' | 'down') => void | { kind: 'allow' | 'keep-open' } | Promise<{ kind: 'allow' | 'keep-open' }>
}

export interface WorkspaceListOnlySurfaceProps {
  className?: string
  dataMode?: string
  dataVisibility?: string
  label: string
  children: ReactNode
}

export function WorkspaceListDetailSurface({ ariaLabel, className = '', dataLayout = 'adjacent-list-detail', dataVisibility, dataMode, dataModule, detailVisible = true, listClassName = '', detailClassName = '', listLabel, detailLabel, list, detail, emptyDetail, listWidthPx = null, onDetailWidthTransition, onListWidthChange, onListWidthCommit, onListRowNavigate }: WorkspaceListDetailSurfaceProps) {
  const surfaceRef = useRef<HTMLElement>(null)
  const mountedRef = useRef(false)
  const widthTransitionPendingRef = useRef(false)
  const widthCloseAttemptedRef = useRef(false)
  const autoClosedForWidthRef = useRef(false)
  const previousDetailVisibleRef = useRef(detailVisible)
  const policy = dataModule ? getWorkbenchWidthPolicy(dataModule) : undefined
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const [transitionRevision, setTransitionRevision] = useState(0)
  const narrow = Boolean(policy && availableWidth !== null && availableWidth < workbenchDualPaneMinWidth(policy))
  const widthMode = policy ? narrow ? detailVisible ? 'detail-only' : 'list-only' : 'dual' : undefined
  const [internalWidth, setInternalWidth] = useState<number | null>(listWidthPx)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? (listWidthPx === null ? internalWidth : listWidthPx)
  const handleListKeyDownCapture = useListDetailWorkbenchInteraction({ onNavigate: onListRowNavigate })
  const changeWidth = (next: number) => {
    setDragWidth(next)
    setInternalWidth(next)
  }
  const commitWidth = (next: number) => {
    setDragWidth(null)
    setInternalWidth(next)
    if (onListWidthCommit) onListWidthCommit(next)
    else onListWidthChange?.(next)
  }
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useLayoutEffect(() => {
    if (!policy || dataVisibility !== 'active') return
    const surface = surfaceRef.current
    if (!surface) return
    const checkWidth = (width: number) => {
      if (width > 0) setAvailableWidth(width)
    }
    checkWidth(surface.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => checkWidth(surface.getBoundingClientRect().width)
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) checkWidth(entry.contentRect.width)
    })
    observer.observe(surface)
    return () => observer.disconnect()
  }, [dataVisibility, policy])

  useEffect(() => {
    if (previousDetailVisibleRef.current !== detailVisible) {
      if (detailVisible) {
        autoClosedForWidthRef.current = false
        widthCloseAttemptedRef.current = false
      }
      previousDetailVisibleRef.current = detailVisible
    }
    if (!narrow) widthCloseAttemptedRef.current = false
    if (!policy || availableWidth === null || dataVisibility !== 'active' || !onDetailWidthTransition || widthTransitionPendingRef.current) return
    const closing = narrow && detailVisible && !widthCloseAttemptedRef.current
    const restoring = !narrow && !detailVisible && autoClosedForWidthRef.current
    if (!closing && !restoring) return
    if (closing) widthCloseAttemptedRef.current = true
    widthTransitionPendingRef.current = true
    const detailHadFocus = surfaceRef.current?.querySelector('[data-workspace-slot="detail"]')?.contains(document.activeElement)
    void Promise.resolve().then(() => mountedRef.current ? onDetailWidthTransition(restoring) : false).then((allowed) => {
      if (!mountedRef.current) return
      widthTransitionPendingRef.current = false
      if (closing) autoClosedForWidthRef.current = allowed
      else if (allowed) autoClosedForWidthRef.current = false
      if (closing && allowed && detailHadFocus) {
        window.requestAnimationFrame(() => {
          if (!mountedRef.current) return
          const selected = surfaceRef.current?.querySelector<HTMLElement>('[data-workbench-row-id].is-selected, [data-workbench-row-id].is-active, [data-workbench-row-id][data-selected="true"], [data-workbench-row-id][aria-selected="true"]')
          const target = selected ?? document.getElementById(`workspace-tab-${dataModule}`)
          target?.focus({ preventScroll: true })
        })
      }
      setTransitionRevision((revision) => revision + 1)
    }).catch(() => {
      if (!mountedRef.current) return
      widthTransitionPendingRef.current = false
      autoClosedForWidthRef.current = false
      setTransitionRevision((revision) => revision + 1)
    })
  }, [availableWidth, dataModule, dataVisibility, detailVisible, narrow, onDetailWidthTransition, policy, transitionRevision])
  return (
    <section
      ref={surfaceRef}
      className={`workspace-list-detail-surface${className ? ` ${className}` : ''}`}
      style={workbenchWidthStyle(width, policy)}
      data-workspace-surface="list-detail"
      data-layout={dataLayout}
      data-detail-state={detailVisible ? 'open' : 'closed'}
      data-width-mode={widthMode}
      data-list-width-mode={width === null ? 'intrinsic' : 'preferred'}
      data-mode={dataMode}
      data-module={dataModule}
      data-visibility={dataVisibility}
      aria-label={ariaLabel}
      onKeyDownCapture={handleListKeyDownCapture}
    >
      <div className={`workspace-list-detail-surface__slot workspace-list-detail-surface__list${listClassName ? ` ${listClassName}` : ''}`} data-workspace-slot="list" aria-label={listLabel}>
        {list}
      </div>
      <WorkbenchListSeparator value={width} min={policy?.listMinWidthPx} max={WORKBENCH_LIST_WIDTH_MAX} onChange={changeWidth} onCommit={commitWidth} />
      <div className={`workspace-list-detail-surface__slot workspace-list-detail-surface__detail${detailClassName ? ` ${detailClassName}` : ''}`} data-workspace-slot="detail" aria-label={detailLabel}>
        {detailVisible ? detail ?? emptyDetail : emptyDetail}
      </div>
    </section>
  )
}

export function WorkspaceListOnlySurface({ className = '', dataMode, dataVisibility, label, children }: WorkspaceListOnlySurfaceProps) {
  return (
    <section className={`workspace-list-only-surface${className ? ` ${className}` : ''}`} data-workspace-surface="list-only" data-layout="list-only" data-mode={dataMode} data-visibility={dataVisibility} aria-label={label}>
      <div className="workspace-list-only-surface__slot" data-workspace-slot="list">
        {children}
      </div>
    </section>
  )
}
