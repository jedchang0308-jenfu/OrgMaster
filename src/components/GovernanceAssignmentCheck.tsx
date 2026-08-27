import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export type GovernanceAssignmentCheckResult = {
  status: string
  issues: Array<{ code: string; message: string }>
  checkedAt?: string
}

type Props = {
  result: GovernanceAssignmentCheckResult | null
  busy: boolean
  canCheck: boolean
  onCheck: () => void
}

export function GovernanceAssignmentCheck({ result, busy, canCheck, onCheck }: Props) {
  return <>
    <p className="governance-muted">使用角色指派表單目前的候選值驗證 identity、catalog、scope 與期間，不模擬外部權限。</p>
    <button type="button" className="button button--primary" onClick={onCheck} disabled={busy || !canCheck}>檢查目前候選</button>
    {result && <div className={`governance-check-result ${result.status === 'valid' ? 'is-valid' : 'is-invalid'}`} role="status">
      {result.status === 'valid' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <div>
        <strong>{result.status === 'valid' ? '指派候選有效' : '指派候選無效'}</strong>
        {result.issues.map((issue) => <p key={`${issue.code}-${issue.message}`}>{issue.code}：{issue.message}</p>)}
        {result.checkedAt && <small>檢查時間 {result.checkedAt}</small>}
      </div>
    </div>}
  </>
}
