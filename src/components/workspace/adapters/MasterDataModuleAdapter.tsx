import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface, WorkspaceListOnlySurface } from '../WorkspaceSurfacePrimitives'

export type MasterDataModuleId = 'employees' | 'positions' | 'departments' | 'levels'

interface Props {
  moduleId: MasterDataModuleId
  visibility: WorkspaceSurfaceVisibility
  list: ReactNode
  detail?: ReactNode
  detailVisible?: boolean
}

const labels: Record<MasterDataModuleId, string> = {
  employees: '員工',
  positions: '職位',
  departments: '部門',
  levels: '層級',
}

export function MasterDataModuleAdapter({ moduleId, visibility, list, detail, detailVisible = Boolean(detail) }: Props) {
  const detailSupported = moduleId !== 'levels'
  const className = `master-data-workspace master-data-workspace--${moduleId}${detailVisible ? '' : ' is-detail-less'}`
  if (!detailSupported || !detailVisible) return <WorkspaceListOnlySurface label={`${labels[moduleId]}完整工作台`} className={className} dataVisibility={visibility}>{list}</WorkspaceListOnlySurface>
  return (
    <WorkspaceListDetailSurface
      ariaLabel={`${labels[moduleId]}完整工作台`}
      className={className}
      dataVisibility={visibility}
      detailVisible={detailVisible}
      listClassName="master-data-workspace__list"
      detailClassName="master-data-workspace__detail"
      listLabel={`${labels[moduleId]}清單`}
      detailLabel={`${labels[moduleId]}明細`}
      list={list}
      detail={detail ?? null}
      emptyDetail={<div className="master-data-workspace__empty" data-workspace-focus-fallback tabIndex={-1}><strong>選擇一筆{labels[moduleId]}資料</strong><span>明細會顯示在這裡，清單與編輯內容可同時保留。</span></div>}
    />
  )
}
