# ADR-005：治理政策獨立保存並在發布時固定組織快照

狀態：Accepted  
日期：2026-08-18  
決策來源：DEV-027 `RD Implementation Ready` engineering decision  
適用範圍：DEV-027 OrgMaster local governance MVP 與後續 policy persistence

## Context

OrgMaster 現有組織資料使用 V5 document 與 workspace manifest。Draft 與 current version各自保存文件，但 current version仍可進入 maintenance 並覆寫相同 version file。權限與審核規則必須能證明某次 evaluation 使用哪一組人員、職位、任職與主管事實；若 published policy 只保存 mutable current version ID，日後維護組織資料會改變歷史政策的解析結果。

另一方面，把 governance draft、Application Role、Permission、Delegation、Approval Policy、published versions 與 audit 直接加入 `OrgDirectoryState`，會讓組織 Undo／redo、localStorage、草稿比較與文件版本同時承擔安全政策生命週期，形成錯誤耦合。

目前 stack 只有 Vite local middleware 與 JSON persistence；本 ADR 只固定資料責任和 local implementation profile，不將 JSON 宣稱為 production database。

## Options considered

1. 將 governance 欄位加入 organization document V6：可以重用既有 save／workspace flow，但 organization Undo、draft、current maintenance、backup 與 policy publication 混成同一 transaction，也可能讓一般組織草稿意外成為正式權限。
2. 使用獨立 governance store，但 published version只保存 `currentVersionId`：模組分離較好，但 current version bytes 可被維護，無法重現歷史 reviewer／permission 結果。
3. 使用獨立 governance store，published policy version內保存最小 immutable organization snapshot：寫入與生命週期清楚，evaluation 可重現，但會複製 resolver 必要的 organization IDs／relationships，且正式環境仍需 durable database migration。
4. 目前直接導入 production relational database 與 IAM：長期較完整，但 provider、hosting、credential、availability與 release target尚未確認，超出 OrgMaster-only local implementation scope。

## Decision

採 Option 3。

- Governance source of truth 與 `OrgDirectoryState`／V5 workspace分離；local檔案為 `data/orgmaster-governance.v1.json`。
- Organization document維持 V5，不加入 identity link、Application Role、Permission、Delegation、Approval Policy、published version或 governance audit。
- Publish 必須驗證 workspace manifest 的 current version，並把 evaluator／reviewer resolver所需的最小 organization snapshot放入 immutable policy version。
- Snapshot保存 IDs、parent／role／department references、assignment type與有效期間，不保存 employee name、email或 layout。
- Published snapshot不得 in-place mutation；新發布建立新 version，reactivate只切換 active reference。
- Governance write使用 whole-document CAS、command idempotency、process-local serialization、atomic temporary write、previous snapshot與tamper-evident audit hash chain。
- Local V1 store是可驗證的 development profile，不是 production persistence決策。Phase 3／4再決定 durable database、service authentication、append-only enforcement、backup／restore與 availability。

## Consequences

- Organization editor的 Undo／redo、autosave、draft compare與current maintenance不會直接改變 active authorization policy。
- Reviewer resolver可依 published snapshot重現當時組織事實；AI-PDM future receipt可引用 policy version／hash與organization revision。
- 同一人員、職位或任職資料會在 published snapshot中重複，但只有 resolver需要的最小欄位，且 published version不可變。
- Policy draft不自動跟著 organization draft更新；publish時才驗證並捕捉 current organization。若 current organization有衝突，publish fail closed。
- Governance UI與API有自己的 revision／dirty／publish lifecycle，不得綁定 organization workspace mode。
- Cross-repo integration不得直接讀 organization V5或governance JSON；必須透過future versioned adapter。

## Migration / compatibility impact

- DEV-020／ADR-002 的 organization workspace storage保持有效；本 ADR不修改manifest、version file或V5 parser。
- DEV-021／ADR-001 的主職與職位階層語意保持有效，snapshot只複製發布時必要欄位。
- V1 first-run只建立新的governance file與safe seed；不掃描、不匯入、不修改AI-PDM資料。
- Unsupported／invalidgovernance file不得自動reset；所有evaluation與write fail closed，保留current及previous bytes供focused recovery。
- 若未來改為把policy嵌回organization document，或published version不再保存immutable facts，必須supersede本ADR並提供歷史receipt／migration相容策略。
