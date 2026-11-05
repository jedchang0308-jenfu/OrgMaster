import { useEffect, useState } from 'react'
import { loadFmsCatalogActivationWorkspace, type FmsCatalogActivationWorkspace } from '../governance/fmsCatalogActivationApiClient'

export function GovernanceFinancialCatalogInitialization() {
  const [workspace, setWorkspace] = useState<FmsCatalogActivationWorkspace | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => { let active = true; void loadFmsCatalogActivationWorkspace().then(value => { if (active) setWorkspace(value) }).catch(() => { if (active) setFailed(true) }); return () => { active = false } }, [])
  if (workspace && !workspace.initializationAdoption) return null
  return <section aria-label="FMS 首次管理目錄"><h3>FMS 管理資格尚待目錄就緒</h3>
    <p>先由本人安裝並採用固定管理目錄，再在此頁授予 FMS 系統管理員；生效後明示設定五項目錄操作權限。</p>
    {workspace?.fmsOrigin && <a href={`${workspace.fmsOrigin}/administration/catalog-initialization`} target="_blank" rel="noreferrer">開啟 FMS 首次管理目錄</a>}
    {workspace?.initializationAdoption?.status === 'owner_readback_unavailable' && <p role="status">目錄來源驗證連線尚未就緒，請待 owner 完成連線後再採用。</p>}
    {failed && <p role="status">目前無法讀取首次管理目錄狀態，請重新載入後再試。</p>}
  </section>
}
