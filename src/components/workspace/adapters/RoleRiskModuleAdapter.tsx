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

export function RoleRiskModuleAdapter({ visibility, children, list, detail, detailVisible = Boolean(detail), listWidthPx, onListWidthChange, onListWidthCommit, onListRowNavigate }: Props) {
  return <WorkspaceListDetailSurface
    className="role-risk-module-adapter"
    dataVisibility={visibility}
    dataModule="role-risks"
    ariaLabel="兼任風險完整工作台"
    listLabel="兼任風險清單"
    detailLabel="兼任風險明細"
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
