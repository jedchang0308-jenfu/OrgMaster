# ADR-007：外部應用角色目錄與角色指派治理分離

狀態：Accepted
日期：2026-08-27
決策來源：使用者確認「各系統權限細節應由該系統設定，OrgMaster 只負責分配角色」
適用範圍：DEV-027、DEV-035、DEV-037 與後續 OrgMaster／外部應用權限串接
取代：`ai-doc/adr/ADR-004-authorization-approval-policy-boundary.md` 的外部應用角色／權限／審核政策權威條款
保留：ADR-004 的共用 IAM `2A`、AI-PDM approval transaction／domain apply 邊界；ADR-005 的獨立治理 store 與不可變發布快照原則

## Context

DEV-027 local MVP 依原 `1B` 把 OrgMaster 建成 Application Role、Permission、Role-Permission mapping、Scope、Delegation 與 Approval Policy 的可編輯 policy authority。這可以在單一 local sandbox 驗證授權與 reviewer resolver，但若 OrgMaster 未來連接多個應用，每個應用的 action、risk、permission code、角色組成與領域審核語意都不同。

讓 OrgMaster 人工定義外部應用的 Permission 或 Role-Permission mapping，會造成下列問題：

- 外部應用改版時，OrgMaster catalog 可能過期或錯誤擴權。
- OrgMaster 必須理解每個外部系統的內部功能與敏感操作，形成跨產品耦合。
- 外部應用仍必須在自己的 server boundary enforcement，卻可能與 OrgMaster 的角色定義產生雙重權威。
- 「角色分配審核」與「AI-PDM 領域文件／BOM／發布審核」容易被混為同一種 approval。

目前仍有明確限制：只修訂及後續修改 OrgMaster；AI-PDM 尚未授權修改。因此本 ADR 固定目標責任邊界，不宣稱 live catalog sync 或實際授權已完成。

## Options considered

1. **OrgMaster 集中定義所有外部角色與權限**：單一 UI 最集中，但 OrgMaster 必須跟著每個系統的權限細節改版，並形成雙重權威。
2. **外部系統擁有角色／權限目錄，OrgMaster 集中治理角色指派**：各系統保有領域語意與 enforcement，OrgMaster 統一回答誰在何種範圍與期間取得哪個角色，責任清楚且可擴充。
3. **外部系統同時擁有角色定義與人員指派**：耦合最低，但每個系統重複維護員工／組織對應、到離職撤權與指派稽核，失去 OrgMaster 的組織治理價值。

## Decision

採 Option 2：**角色目錄聯邦、角色指派集中治理**。

### 外部應用（包含 AI-PDM）擁有

- Application Role 定義、穩定 role code／ID、說明、狀態與可指派性。
- Permission catalog、Permission 的操作語意與風險等級。
- Role-Permission mapping。
- 該應用的領域審核政策、工作項、核駁決策、交易 audit、冪等與 domain apply。
- 所有敏感 API／資料操作的最終 authorization enforcement。

### OrgMaster 擁有

- 共用 IAM `issuer + subject UID` 與 OrgMaster employee／principal mapping。
- 員工到外部 Application Role 的 assignment。
- assignment 的 scope、有效期間、撤銷／重新啟用與角色代理；這些都是角色指派治理資料，不改寫外部 Permission 語意。
- 高風險角色指派的申請／核准、發布版本與 governance-change audit。
- 組織異動、到離職與角色指派之間的可追溯治理，但不得用職稱、部門或同名字串自動授權。

### 目錄與整合契約

- OrgMaster 對外部 Application Role 目錄只讀；UI 不提供新增、刪除或 Permission Matrix 編輯。
- 外部目錄必須帶來源 application、catalog version、stable role ID／code、display name、status、assignable 與必要風險提示。未知、停用、不可指派或版本無法確認時 fail closed。
- OrgMaster 可以保存具來源與版本的唯讀 catalog snapshot／manifest，但它是同步快照，不是第二份可編輯權威。
- OrgMaster 自己是 `orgmaster` application 的 owner，因此 OrgMaster 內部系統角色／權限仍由 OrgMaster 定義及 enforcement；外部角色目錄規則不反向移除自我治理能力。
- live integration 必須使用版本化 API／manifest／event adapter，不得直接跨資料庫讀寫。assignment 採 push、pull 或 token claim 的方式留待 future integration ADR 決定。
- AI-PDM 未修改前，OrgMaster 可使用明確標示來源／版本的本機唯讀 fixture 驗證指派 UI，但不得宣稱角色已同步或在 AI-PDM 生效。

## Consequences

- OrgMaster 的 Application Role 畫面改為「外部角色目錄唯讀＋角色指派」，不再是外部權限設計器。
- OrgMaster 的「審核」只涵蓋角色指派／撤權等治理變更；AI-PDM 文件、BOM、發布或其他領域審核仍由 AI-PDM 定義與執行。
- DEV-027 現有 AI-PDM role／permission seed、Permission evaluator、reviewer resolver 與 Permission Matrix domain commands保留為已完成 local MVP 的歷史實作證據，但不再代表 future target authority。
- DEV-027／035 的既有 QA/QC 只能證明當時 local V1 delivery path，不能作為新責任邊界已實作的證據。
- 後續 OrgMaster-only 產品重整由 DEV-037 追蹤；其 `RD Implementation Ready / RD Not Started` 契約已固定於 `ai-doc/specs/DEV-037-external-role-catalog-assignment-governance.md`，QA／QC 位於 `ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md`。RD 只可依 V2 非破壞 migration／recovery 與 file allowlist 修改 OrgMaster，不直接刪除既有 V1 bytes、歷史 published snapshot或 audit。

## Migration / compatibility impact

- 本 ADR 當下只修改 OrgMaster 開發文件，不修改產品程式、local governance store 或 AI-PDM。
- 既有 published policy／audit／snapshot 不可重寫或實體刪除；未來 migration 必須保留歷史可讀性，並明確區分 `local-v1-authoritative` 與 `external-catalog-snapshot` 來源。
- 未來 OrgMaster 重整至少需處理：external catalog source metadata、唯讀 UI、禁止外部 role／permission mutation、assignment reference validation、catalog stale／missing recovery 與現有 draft／published version 相容策略。
- 要開始 live AI-PDM integration，仍須使用者另行授權修改 AI-PDM，並建立跨 repo integration ADR 固定 catalog delivery、assignment consumption、service authentication、failure mode、compatibility window 與 cutover／rollback gate。
