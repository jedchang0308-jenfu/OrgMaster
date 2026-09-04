import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface, WorkspaceListOnlySurface } from '../WorkspaceSurfacePrimitives'

interface Props {
  mode: 'configuration' | 'audit' | 'distribution'
  visibility: WorkspaceSurfaceVisibility
  children: ReactNode
  detail?: ReactNode
  detailVisible?: boolean
}

export function DutyModuleAdapter({ mode, visibility, children, detail, detailVisible = Boolean(detail) }: Props) {
  if (mode !== 'configuration') return <WorkspaceListOnlySurface className={`duty-module-adapter duty-module-adapter--${mode}`} dataMode={mode} dataVisibility={visibility} label="工作職掌完整工作台"><div data-visibility={visibility}>{children}</div></WorkspaceListOnlySurface>

  return (
    <WorkspaceListDetailSurface
      ariaLabel="工作職掌完整工作台"
      className="duty-module-adapter duty-module-adapter--configuration duty-configuration-workspace"
      dataLayout={detailVisible && detail ? 'adjacent-list-detail' : 'list-only'}
      dataVisibility={visibility}
      detailVisible={detailVisible}
      listClassName="duty-configuration-workspace__list"
      detailClassName={detail ? 'duty-configuration-workspace__detail' : ''}
      listLabel="工作職掌清單"
      detailLabel="工作職掌明細"
      list={<div data-visibility={visibility} className="duty-configuration-workspace__list">{children}</div>}
      detail={detail ?? null}
      emptyDetail={<div className="master-data-workspace__empty" data-workspace-focus-fallback tabIndex={-1}><strong>選擇一筆工作職掌</strong><span>明細會顯示在這裡，清單與配置內容可同時保留。</span></div>}
    />
  )
}
