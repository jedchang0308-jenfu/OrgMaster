import type { ReactNode } from 'react'

export interface WorkspaceListDetailSurfaceProps {
  ariaLabel?: string
  className?: string
  dataLayout?: 'adjacent-list-detail' | 'list-only'
  dataVisibility?: string
  detailVisible?: boolean
  listClassName?: string
  detailClassName?: string
  listLabel: string
  detailLabel: string
  list: ReactNode
  detail: ReactNode | null
  emptyDetail?: ReactNode
}

export interface WorkspaceListOnlySurfaceProps {
  className?: string
  dataMode?: string
  dataVisibility?: string
  label: string
  children: ReactNode
}

export function WorkspaceListDetailSurface({ ariaLabel, className = '', dataLayout = 'adjacent-list-detail', dataVisibility, detailVisible = true, listClassName = '', detailClassName = '', listLabel, detailLabel, list, detail, emptyDetail }: WorkspaceListDetailSurfaceProps) {
  return (
    <section className={`workspace-list-detail-surface${className ? ` ${className}` : ''}`} data-workspace-surface="list-detail" data-layout={detailVisible ? dataLayout : 'list-only'} data-visibility={dataVisibility} aria-label={ariaLabel}>
      <div className={`workspace-list-detail-surface__slot workspace-list-detail-surface__list${listClassName ? ` ${listClassName}` : ''}`} data-workspace-slot="list" aria-label={listLabel}>
        {list}
      </div>
      {detailVisible && <div className={`workspace-list-detail-surface__slot workspace-list-detail-surface__detail${detailClassName ? ` ${detailClassName}` : ''}`} data-workspace-slot="detail" aria-label={detailLabel}>
        {detail ?? emptyDetail}
      </div>}
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
