# ADR-004：權限政策治理與審核交易執行分離

狀態：Accepted  
日期：2026-08-18  
決策來源：使用者在 HCS `#引導模式` 回覆 `1B 2A`  
適用範圍：DEV-027 與後續 OrgMaster／AI-PDM 權限及審核串接

相關決策：`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`

## Context

OrgMaster 目前擁有人員、組織、職位、任職與組織版本，但沒有正式 authentication、application permission 或 approval-policy service。AI-PDM 已有自己的使用者、權限與審核交易實作。若兩套系統同時編輯角色／政策、工作項、核駁決策或稽核，將產生雙重權威、版本不一致與無法證明的核准結果。

本階段又有明確限制：只能修改 OrgMaster，不修改 AI-PDM。因此必須先固定長期責任邊界，而不能把 current implementation 誤寫成已完成整合。

## Options considered

1. OrgMaster 擁有 principal mapping、角色／權限／scope、審核政策、工作項、核駁決策與全部 audit；AI-PDM 只保留領域資料與 apply。集中程度最高，但會大幅搬移既有 approval runtime，且超出目前授權。
2. OrgMaster 擁有 principal mapping、角色／權限／scope、delegation 與審核規則；AI-PDM 保存工作項、核駁決策、審核交易 audit 與 domain apply。可保持單一 policy authority，同時保留領域交易一致性，但需要清楚區分 policy evaluation 與 approval decision。
3. OrgMaster 連 AI-PDM 領域狀態與 apply 都接管。單一系統範圍最大，但耦合、遷移與營運風險最高，也不符合 OrgMaster 的組織治理定位。

身分另比較：

- A. 共用 IAM 提供不可變 provider UID；OrgMaster 只保存 identity link，不保存 password／MFA secret。
- B. OrgMaster 自建帳號、密碼與 MFA authority。
- C. 永久維持本機帳號與單機使用。

## Decision

採治理 Option 2（使用者選擇 `1B`）與身分 Option A（使用者選擇 `2A`）。

- 共用 IAM 是 authentication authority。跨系統授權 key 使用不可變 `issuer + subject UID`；OrgMaster 不保存密碼、MFA secret 或 recovery secret。
- OrgMaster 是 principal mapping、Application Role、Permission、Scope、Delegation 與 Approval Policy 的唯一可編輯 policy authority。
- OrgMaster 可產生版本化 permission evaluation 與 reviewer-policy resolution；這些是 policy result，不是 approval transaction decision。
- AI-PDM 未來仍是 permission enforcement point 與 approval runtime，保存 request、work item、target snapshot、approve／reject decision、transaction audit、idempotency 及 apply result。
- OrgMaster 保存自身 governance-change audit；AI-PDM 保存 approval-transaction audit。雙方不得鏡像或雙寫同一交易事實。
- OrgMaster 不直接操作 AI-PDM database，也不執行圖面、BOM、檔案、發布或狀態機副作用。

## Consequences

- Application Role／Permission 必須與 OrgMaster 既有組織職務 `Role` 分開，禁止同名即授權。
- AI-PDM 未來每個敏感操作仍需在自己的 server boundary enforcement；不能只靠 OrgMaster UI 隱藏按鈕。
- AI-PDM 未來建立工作項時需保存 OrgMaster policy／organization version 與 resolution receipt；進行中交易的重新驗證時點由 future integration ADR 定義。
- identity、policy、scope、version 或 resolver 發生缺漏／衝突時必須 fail closed，不回退到 email、姓名、職稱或部門猜測。
- OrgMaster-only simulator 只能使用 fixture／ephemeral request，不得演變為第二套 approval persistence。
- Current local implementation profile、store與snapshot boundary由ADR-005及DEV-027 spec固定；production IAM／database、service route、cache／revocation、availability與release topology仍待Phase 3／4 gate，不得反向改變本ADR。

## Migration / compatibility impact

- 本 ADR 當下不修改 AI-PDM，沒有跨 repo migration、雙寫或 cutover。
- DEV-021 已完成的主職、兼任與直屬主管路徑保持有效；本 ADR 只取代其「Auth／簽核交易暫緩」之後的 future direction。
- 未來要修改 AI-PDM 時，必須由使用者另行授權，新增 integration ADR，至少固定 adapter version、authentication、failure mode、shadow／compatibility window、policy receipt、rollback 與 cutover gate。
- 若未來需求改為 OrgMaster 保存 approval work item／核駁 decision，或改為自建 credential authority，必須修訂或 supersede 本 ADR，不能作為一般 RD 細節直接變更。
