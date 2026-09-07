import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface } from '../WorkspaceSurfacePrimitives'
import { WorkbenchDetailFrame } from '../WorkbenchPresentationPrimitives'

export type MasterDataModuleId = 'employees' | 'positions' | 'departments' | 'levels'

interface Props {
  moduleId: MasterDataModuleId
  visibility: WorkspaceSurfaceVisibility
  list: ReactNode
  detail?: ReactNode
  detailVisible?: boolean
  listWidthPx?: number | null
  onListWidthChange?: (width: number) => void
  onListWidthCommit?: (width: number) => void
}

const labels: Record<MasterDataModuleId, string> = {
  employees: '員工',
  positions: '職位',
  departments: '部門',
  levels: '層級',
}

export function MasterDataModuleAdapter({ moduleId, visibility, list, detail, detailVisible = Boolean(detail), listWidthPx, onListWidthChange, onListWidthCommit }: Props) {
  const className = `master-data-workspace master-data-workspace--${moduleId}${detailVisible ? '' : ' is-detail-less'}`
  return (
    <WorkspaceListDetailSurface
      ariaLabel={`${labels[moduleId]}完整工作台`}
      className={className}
      dataVisibility={visibility}
      dataModule={moduleId}
      detailVisible={detailVisible}
      listWidthPx={listWidthPx}
      onListWidthChange={onListWidthChange}
      onListWidthCommit={onListWidthCommit}
      listClassName="master-data-workspace__list"
      detailClassName="master-data-workspace__detail"
      listLabel={`${labels[moduleId]}清單`}
      detailLabel={`${labels[moduleId]}明細`}
      list={list}
      detail={detail ?? null}
      emptyDetail={<WorkbenchDetailFrame className="master-data-workspace__empty"><div data-workspace-focus-fallback tabIndex={-1} aria-hidden="true" /></WorkbenchDetailFrame>}
    />
  )
}
