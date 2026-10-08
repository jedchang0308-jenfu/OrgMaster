import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { recommendGovernanceEmployees } from '../governance/apiClient'
import { formatGovernanceDateTime } from '../governance/governancePresentation'
import type { EmployeeRecommendationRequest, EmployeeRecommendationResponse } from '../governance/employeeRecommendations'

type Props = { request: EmployeeRecommendationRequest | null; selectedEmployeeId: string; disabled: boolean; onSelect: (employeeId: string) => void }
function failureMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (['REVISION_CONFLICT', 'ORGANIZATION_REVISION_CONFLICT', 'CATALOG_BINDING_CONFLICT', 'EXTERNAL_CATALOG_STALE'].includes(String(code))) return '組織或角色資料已更新，請關閉彈窗並重新載入後再推薦。'
  if (code === 'GOVERNANCE_ADMIN_REQUIRED' || code === 'EMPLOYEE_RECOMMENDATION_FORBIDDEN') return '目前無法推薦此角色，請確認管理權限與角色設定。'
  if (code === 'EMPLOYEE_RECOMMENDATION_BUSY') return '推薦正在處理，請稍後重試。'
  if (code === 'ORGMASTER_SOURCE_UNAVAILABLE') return '無法讀取已儲存的組織資料，請稍後重試。'
  return '暫時無法取得推薦，可重試或手動選擇員工。'
}

export function GovernanceEmployeeRecommendations({ request, selectedEmployeeId, disabled, onSelect }: Props) {
  const [result, setResult] = useState<EmployeeRecommendationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const controller = useRef<AbortController | null>(null)
  const inputKey = JSON.stringify(request)
  const latestKey = useRef(inputKey)
  latestKey.current = inputKey
  useEffect(() => {
    controller.current?.abort()
    setResult(null); setFailure(''); setLoading(false)
    return () => { controller.current?.abort() }
  }, [inputKey, disabled])

  async function recommend() {
    if (!request || disabled || loading) return
    controller.current?.abort()
    const operation = new AbortController()
    controller.current = operation
    setLoading(true); setFailure(''); setResult(null)
    try {
      const response = await recommendGovernanceEmployees(request, operation.signal)
      if (operation.signal.aborted || latestKey.current !== inputKey) return
      if (response.payload.governanceRevision !== request.expectedRevision || response.payload.organizationVersionId !== request.expectedOrganizationVersionId || response.payload.organizationRevision !== request.expectedOrganizationRevision
        || response.payload.catalogVersion !== request.expectedCatalogVersion || response.payload.catalogPayloadHash !== request.expectedCatalogPayloadHash) throw new Error('stale recommendation')
      setResult(response.payload)
    } catch (error) { if (!operation.signal.aborted && latestKey.current === inputKey) setFailure(failureMessage(error)) }
    finally { if (controller.current === operation && !operation.signal.aborted) setLoading(false) }
  }

  return <section className="governance-recommendations" aria-label="員工推薦" aria-busy={loading}>
    <div className="governance-recommendations__heading">
      <button type="button" className="button button--quiet" disabled={disabled || !request || loading} onClick={() => void recommend()}><Sparkles size={14} aria-hidden="true" />{loading ? '辨識中…' : result || failure ? '重新推薦' : '智慧推薦'}</button>
      <span>{result ? `${result.method === 'ai-assisted' ? 'AI 輔助推薦' : '規則推薦'} · 組織更新 ${formatGovernanceDateTime(result.sourceDataAt)}` : request ? '依已儲存的現行組織推薦' : '請先儲存組織並完成範圍與生效期間'}</span>
    </div>
    {loading && <p className="governance-recommendations__message" role="status">正在比對職位與職掌…</p>}
    {failure && <p className="governance-recommendations__message governance-recommendations__message--error" role="alert">{failure}</p>}
    {result && <>
      {result.fallback && <p className="governance-recommendations__message" role="status">{result.fallback === 'not-configured' ? 'AI 尚未設定，使用職位與職掌規則推薦。' : result.fallback === 'context-limit' ? '組織資料較多，本次使用規則推薦。' : 'AI 暫時無法使用，本次改用規則推薦。'}</p>}
      {result.candidates.length ? <ul className="governance-recommendations__list">{result.candidates.map(candidate => <li key={candidate.employeeId}>
        <button type="button" disabled={disabled} aria-pressed={candidate.employeeId === selectedEmployeeId} onClick={() => onSelect(candidate.employeeId)}>
          <span className="governance-recommendations__identity"><strong>{candidate.name}</strong><span>{candidate.departmentName} · {candidate.positionTitle}</span></span>
          <span className="governance-recommendations__reason">{candidate.reason}</span>
          <span className="governance-recommendations__action">{candidate.employeeId === selectedEmployeeId ? '已選擇' : '選擇'}</span>
        </button>
      </li>)}</ul> : <p className="governance-recommendations__message" role="status">沒有找到符合職位或職掌的候選員工，請手動選擇。</p>}
    </>}
  </section>
}
