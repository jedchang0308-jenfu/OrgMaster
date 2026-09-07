import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface } from '../WorkspaceSurfacePrimitives'
import { WorkbenchDetailFrame } from '../WorkbenchPresentationPrimitives'

interface Props {
  mode: 'list' | 'draft' | 'readable'
  visibility: WorkspaceSurfaceVisibility
  children?: ReactNode
  list?: ReactNode
  detail?: ReactNode
  detailVisible?: boolean
  listWidthPx?: number | null
  onListWidthChange?: (width: number) => void
  onListWidthCommit?: (width: number) => void
  onListRowNavigate?: (rowId: string, direction: 'up' | 'down') => void | Promise<{ kind: 'allow' | 'keep-open' }>
}

export function ManagementMethodModuleAdapter({ mode, visibility, children, list, detail, detailVisible = Boolean(detail), listWidthPx, onListWidthChange, onListWidthCommit, onListRowNavigate }: Props) {
  const resolvedList = list ?? children ?? null
  return <WorkspaceListDetailSurface
    className={`management-method-module-adapter management-method-module-adapter--${mode}`}
    dataMode={mode}
    dataModule="management-methods"
    dataVisibility={visibility}
    detailVisible={detailVisible}
    ariaLabel="管理辦法完整工作台"
    listLabel="管理辦法清單"
    detailLabel="管理辦法明細"
    list={resolvedList}
    detail={detail ?? null}
    listWidthPx={listWidthPx}
    onListWidthChange={onListWidthChange}
    onListWidthCommit={onListWidthCommit}
    onListRowNavigate={onListRowNavigate}
    emptyDetail={<WorkbenchDetailFrame className="master-data-workspace__empty"><div data-workspace-focus-fallback tabIndex={-1} aria-hidden="true" /></WorkbenchDetailFrame>}
  />
}
