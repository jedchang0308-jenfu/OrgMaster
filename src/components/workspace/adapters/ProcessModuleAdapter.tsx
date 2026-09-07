import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface } from '../WorkspaceSurfacePrimitives'
import { WorkbenchDetailFrame } from '../WorkbenchPresentationPrimitives'

interface Props {
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

export function ProcessModuleAdapter({ visibility, children, list, detail, detailVisible = Boolean(detail), listWidthPx, onListWidthChange, onListWidthCommit, onListRowNavigate }: Props) {
  return <WorkspaceListDetailSurface
    className="process-module-adapter"
    dataVisibility={visibility}
    dataModule="processes"
    ariaLabel="流程規劃完整工作台"
    listLabel="流程清單"
    detailLabel="流程明細"
    list={list ?? children ?? null}
    detail={detail ?? null}
    detailVisible={detailVisible}
    listWidthPx={listWidthPx}
    onListWidthChange={onListWidthChange}
    onListWidthCommit={onListWidthCommit}
    onListRowNavigate={onListRowNavigate}
    emptyDetail={<WorkbenchDetailFrame className="master-data-workspace__empty"><div data-workspace-focus-fallback tabIndex={-1} aria-hidden="true" /></WorkbenchDetailFrame>}
  />
}
