import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'
import { WorkspaceListDetailSurface } from '../WorkspaceSurfacePrimitives'
import { WorkbenchDetailFrame } from '../WorkbenchPresentationPrimitives'

interface Props {
  mode: 'configuration' | 'audit' | 'distribution'
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

export function DutyModuleAdapter({ mode, visibility, children, list, detail, detailVisible = Boolean(detail), listWidthPx, onListWidthChange, onListWidthCommit, onListRowNavigate }: Props) {
  return (
    <WorkspaceListDetailSurface
      ariaLabel="工作職掌完整工作台"
      className={`duty-module-adapter duty-module-adapter--${mode}${mode === 'configuration' ? ' duty-configuration-workspace' : ''}`}
      dataLayout="adjacent-list-detail"
      dataMode={mode}
      dataModule="duties"
      dataVisibility={visibility}
      detailVisible={detailVisible}
      listWidthPx={listWidthPx}
    onListWidthChange={onListWidthChange}
    onListWidthCommit={onListWidthCommit}
      onListRowNavigate={onListRowNavigate}
      listClassName={mode === 'configuration' ? 'duty-configuration-workspace__list' : ''}
      detailClassName={mode === 'configuration' ? 'duty-configuration-workspace__detail' : ''}
      listLabel="工作職掌清單"
      detailLabel="工作職掌明細"
      list={<div data-visibility={visibility} className={mode === 'configuration' ? 'duty-configuration-workspace__list' : undefined}>{list ?? children ?? null}</div>}
      detail={detail ?? null}
      emptyDetail={<WorkbenchDetailFrame className="master-data-workspace__empty"><div data-workspace-focus-fallback tabIndex={-1} aria-hidden="true" /></WorkbenchDetailFrame>}
    />
  )
}
