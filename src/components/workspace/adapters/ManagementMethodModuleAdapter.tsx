import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface, WorkspaceListOnlySurface } from '../WorkspaceSurfacePrimitives'

interface Props {
  mode: 'list' | 'draft' | 'readable'
  visibility: WorkspaceSurfaceVisibility
  children?: ReactNode
  list?: ReactNode
  detail?: ReactNode
  detailVisible?: boolean
}

export function ManagementMethodModuleAdapter({ mode, visibility, children, list, detail, detailVisible = Boolean(detail) }: Props) {
  if (!list) return <section className="management-method-module-adapter" data-mode={mode} data-visibility={visibility} aria-label="管理辦法完整工作台">{children}</section>
  if (!detailVisible) return <WorkspaceListOnlySurface className="management-method-module-adapter" dataMode={mode} dataVisibility={visibility} label="管理辦法完整工作台">{list}</WorkspaceListOnlySurface>
  return <WorkspaceListDetailSurface
    className="management-method-module-adapter"
    dataVisibility={visibility}
    detailVisible={detailVisible}
    ariaLabel="管理辦法完整工作台"
    listLabel="管理辦法清單"
    detailLabel="管理辦法明細"
    list={list}
    detail={detail ?? null}
    emptyDetail={<div className="master-data-workspace__empty" data-workspace-focus-fallback tabIndex={-1}><strong>選擇一份管理辦法</strong><span>文件會顯示在這裡，清單脈絡會保留。</span></div>}
  />
}
