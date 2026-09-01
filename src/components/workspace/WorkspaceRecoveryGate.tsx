import type { WorkspaceHydrationState } from '../../workspace/types'

interface Props {
  state: WorkspaceHydrationState
  onRetry: () => void
  onDownloadCopy?: () => void
  onSwitchToCurrent?: () => void
  children: React.ReactNode
}

export function WorkspaceRecoveryGate({ state, onRetry, onDownloadCopy, onSwitchToCurrent, children }: Props) {
  if (state.kind === 'ready') return <>{children}</>
  if (state.kind === 'loading') return <main className="workspace-recovery" aria-busy="true"><strong>正在載入版本工作區</strong></main>
  const title = state.kind === 'index-unavailable' ? '無法讀取版本工作區'
    : state.kind === 'workspace-invalid' ? '版本工作區資料無效'
      : state.kind === 'version-invalid' ? (state.isCurrent ? '現行版本無法載入' : '選取的草稿無法載入')
        : '版本已在其他地方更新'
  return (
    <main className="workspace-recovery" role="alert">
      <strong>{title}</strong>
      <p>{state.message}</p>
      <div className="workspace-recovery__actions">
        {state.kind === 'conflict' && onDownloadCopy && <button type="button" onClick={onDownloadCopy}>下載目前副本</button>}
        {state.kind === 'version-invalid' && !state.isCurrent && onSwitchToCurrent && <button type="button" onClick={onSwitchToCurrent}>回到現行版本</button>}
        <button type="button" onClick={onRetry}>{state.kind === 'conflict' ? '重新載入' : '重試'}</button>
      </div>
    </main>
  )
}
