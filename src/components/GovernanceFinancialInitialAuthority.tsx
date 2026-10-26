import { useState } from 'react'
import {
  GovernanceApiError,
  loadFinancialInitialAuthorityReceipt,
  previewFinancialInitialAuthority,
  publishFinancialInitialAuthority,
  type FinancialInitialAuthorityPreview,
  type FinancialInitialAuthorityRequest,
} from '../governance/apiClient'

const ROLE_IDS = ['role-finance-manager', 'role-owner']
const REASON = '建立 JF-FMS 初始角色治理權限'

type Props = {
  employeeId: string
  employeeName: string
  governanceRevision: string
  organizationRevision: string
  disabled?: boolean
  onChanged?: () => void
}

function failureMessage(error: unknown) {
  if (error instanceof SyntaxError) return 'release JSON 無法解析。'
  if (error instanceof GovernanceApiError) return `無法完成初始權限設定：${error.code}`
  return '無法完成初始權限設定，請重新載入後再試。'
}

function releaseFromText(value: string) {
  const parsed = JSON.parse(value) as Record<string, unknown>
  const release = parsed.release
  return release && typeof release === 'object' && !Array.isArray(release) ? release as Record<string, unknown> : parsed
}

export function GovernanceFinancialInitialAuthority({ employeeId, employeeName, governanceRevision, organizationRevision, disabled = false, onChanged }: Props) {
  const [releaseText, setReleaseText] = useState('')
  const [preview, setPreview] = useState<{ input: FinancialInitialAuthorityRequest; result: FinancialInitialAuthorityPreview } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  async function runPreview() {
    if (busy || disabled) return
    setBusy(true); setFailure(''); setPreview(null)
    try {
      const input: FinancialInitialAuthorityRequest = {
        employeeId,
        stableRoleIds: [...ROLE_IDS],
        scope: { kind: 'workspace', value: 'company-jenfu' },
        validFrom: new Date().toISOString(),
        validUntil: null,
        reason: REASON,
        release: releaseFromText(releaseText),
        expectedGovernanceRevision: governanceRevision,
        expectedOrganizationRevision: organizationRevision,
      }
      const result = await previewFinancialInitialAuthority(input)
      setPreview({ input, result: result.payload })
    } catch (error) { setFailure(failureMessage(error)) }
    finally { setBusy(false) }
  }

  async function publish() {
    if (busy || disabled || !preview) return
    setBusy(true); setFailure('')
    const commandId = crypto.randomUUID()
    try {
      await publishFinancialInitialAuthority(preview.input, commandId, preview.result.requestHash, preview.result.previewHash)
      onChanged?.()
    } catch (error) {
      if (error instanceof GovernanceApiError && error.status < 500) setFailure(failureMessage(error))
      else {
        try {
          const receipt = await loadFinancialInitialAuthorityReceipt(commandId)
          if (receipt.payload.receiptStatus === 'applied') onChanged?.()
          else setFailure('發布結果尚未確認；系統不會自動重送，請重新載入查明目前狀態。')
        } catch { setFailure('發布結果尚未確認；系統不會自動重送，請重新載入查明目前狀態。') }
      }
    }
    finally { setBusy(false) }
  }

  return <section className="governance-initial-authority" aria-labelledby="governance-initial-authority-title">
    <div>
      <small>JF-FMS initial authority</small>
      <h3 id="governance-initial-authority-title">建立財務系統初始權限</h3>
      <p>目標員工：<strong>{employeeName}</strong>（{employeeId}）。角色固定為「負責人」與「財務主管」，範圍固定為 company-jenfu。</p>
    </div>
    {!preview && <label>已簽署的 JF-FMS release JSON
      <textarea aria-label="已簽署的 JF-FMS release JSON" value={releaseText} onChange={(event) => setReleaseText(event.target.value)} spellCheck={false} disabled={busy || disabled} />
    </label>}
    {failure && <p className="governance-initial-authority__error" role="alert">{failure}</p>}
    {preview && <div className="governance-initial-authority__preview" role="status">
      <strong>Preview 已完成，尚未發布</strong>
      <span>目錄：{preview.result.catalogBinding.catalogVersion}</span>
      <span>角色：{preview.result.afterAssignments.map((assignment) => assignment.roleNameSnapshot).join('、')}</span>
      <span>管理權限：{preview.result.afterGrants.map((grant) => grant.capability).join('、')}</span>
    </div>}
    <div className="governance-initial-authority__actions">
      {preview ? <>
        <button type="button" className="button button--quiet" disabled={busy || disabled} onClick={() => setPreview(null)}>返回修改</button>
        <button type="button" className="button" disabled={busy || disabled} onClick={() => void publish()}>正式發布</button>
      </> : <button type="button" className="button" disabled={busy || disabled || !releaseText.trim()} onClick={() => void runPreview()}>預覽初始權限</button>}
    </div>
  </section>
}
