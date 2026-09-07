import { useState } from 'react'
import type { ReactNode } from 'react'
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

export function WorkspaceListDetailSurface({ ariaLabel, className = '', dataLayout = 'adjacent-list-detail', dataVisibility, dataMode, dataModule, detailVisible = true, listClassName = '', detailClassName = '', listLabel, detailLabel, list, detail, emptyDetail, listWidthPx = null, onListWidthChange, onListWidthCommit, onListRowNavigate }: WorkspaceListDetailSurfaceProps) {
  const [internalWidth, setInternalWidth] = useState<number | null>(listWidthPx)
  const width = listWidthPx === null ? internalWidth : listWidthPx
  const handleListKeyDownCapture = useListDetailWorkbenchInteraction({ onNavigate: onListRowNavigate })
  const changeWidth = (next: number) => {
    setInternalWidth(next)
    onListWidthChange?.(next)
  }
  return (
    <section
      className={`workspace-list-detail-surface${className ? ` ${className}` : ''}`}
      style={workbenchWidthStyle(width)}
      data-workspace-surface="list-detail"
      data-layout={dataLayout}
      data-detail-state={detailVisible ? 'open' : 'closed'}
      data-mode={dataMode}
      data-module={dataModule}
      data-visibility={dataVisibility}
      aria-label={ariaLabel}
      onKeyDownCapture={handleListKeyDownCapture}
    >
      <div className={`workspace-list-detail-surface__slot workspace-list-detail-surface__list${listClassName ? ` ${listClassName}` : ''}`} data-workspace-slot="list" aria-label={listLabel}>
        {list}
      </div>
      <WorkbenchListSeparator value={width} onChange={changeWidth} onCommit={onListWidthCommit} />
      <div className={`workspace-list-detail-surface__slot workspace-list-detail-surface__detail${detailClassName ? ` ${detailClassName}` : ''}`} data-workspace-slot="detail" aria-label={detailLabel}>
        {detail ?? emptyDetail}
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
