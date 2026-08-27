# ADR-008：流程規劃資料隨 Organization Version 共用單一文件權威

狀態：Accepted

日期：2026-08-27

決策來源：`USER-2026-08-27-PROCESS-DUTY-RESPONSIBILITY-WORKBENCH`、`USER-2026-08-27-MINDMAP-FLOWCHART-OSS-DESIGN`、DEV-038 RD Contract 升級

適用範圍：DEV-038 Current Phase 的 Process、ProcessNode、ProcessEdge、ProcessNodeDutyLink，以及它們與既有 Duty、DutyPositionRelation、Position、workspace version／revision 的權威關係

關聯決策：ADR-002（版本工作區）、ADR-006（Duty／relation 隨組織版本保存）

## Context

使用者要讓總經理與主管先從工作全貌建立流程，再連結穩定 Duty，最後把責任配置到 Position。這要求 ProcessNode、Duty 與 DutyPositionRelation 在同一規劃 session 中保持一致，並讓 DEV-034、DEV-036 與 DEV-038 讀取同一份公司事實。

現行 OrgMaster 已由 ADR-002 固定為 workspace manifest＋每個 organization version 一份獨立 `OrgDocumentFile`，並由 ADR-006 固定 Duty 與 DutyPositionRelation 存在 OrganizationDocument V6。所有組織異動共用 `OrganizationCommand`、單一 Undo／Redo、同一 dirty state、500ms autosave、workspace mode 與 version revision CAS。

若流程資料另存一份 ProcessPlanningDocument，建立節點與連 Duty 只改流程 revision，但從同頁配置 Duty→Position 又會改 organization revision；版本切換、Undo、autosave、下載、衝突與失敗恢復因此必須跨兩份文件協調。這對目前小公司一人操作、多人討論的階段增加了沒有直接使用者價值的交易複雜度。

## Options considered

### Option 1：Process 物件進入 OrganizationDocument V7

Process、ProcessNode、ProcessEdge、ProcessNodeDutyLink 與 Duty／Position 共用 organization version、revision、history 與保存。優點是單一資料權威、單一 CAS、草稿複製與下載一致；代價是需要 V6→V7 migration，且流程資料不能在 Current Phase 擁有獨立生命週期。

### Option 2：獨立 ProcessPlanningDocument，引用 organizationVersionId

流程領域可獨立演進、對 V6 文件侵入較小；但同頁操作會產生雙 revision、雙 autosave、跨文件 referential integrity、partial success、版本切換及 crash recovery 問題。若沒有多人流程共編或獨立流程發布需求，複雜度大於效益。

### Option 3：只保存圖形 JSON／React Flow nodes 與 edges

實作快速，但畫布座標與 library schema 會成為領域權威；ProcessNode identity、Duty stable link、版本 migration、資料驗證與其他投影都會綁死在 UI framework，無法支援可靠整合。

### Option 4：把流程節點直接等同 Duty

資料量最少，但流程情境中的一次工作發生與公司可重用職掌被混成同一物件；相同 Duty 出現在多個流程、原則型節點或尚未沉澱成 Duty 的草稿節點都無法表達。

## Decision

採 Option 1：DEV-038 Current Phase 將 Process 規劃物件加入 OrganizationDocument V7，與既有 organization state 共用單一版本權威。

### 資料權威

- OrganizationDocument V7 的 `OrgDirectoryState` 增加 `processes`、`processNodes`、`processEdges`、`processNodeDutyLinks`。
- ProcessNode、ProcessEdge 與 ProcessNodeDutyLink 只保存 stable IDs 與領域語意；不保存 React Flow node／edge、畫布 `x/y`、viewport、zoom、selection、hover、drag 或 panel state。
- ProcessNode 不複製 Duty title、Position 或 Employee；ProcessNodeDutyLink 只引用既有 Duty ID，不保存責任 lane。
- Duty→Position 的全域責任事實仍由既有 DutyPositionRelation 擁有；DEV-038 不建立 process-scoped relation。
- 一個 organization draft 建立時，V7 Process 與既有 Duty／Position 一起完整複製；之後各 version 獨立。

### 保存與交易

- Process commands、Duty commands 與 relation commands 全部更新同一 `OrgDirectoryState`，共用一個 history commit、dirty state、500ms autosave、手動儲存與 version revision CAS。
- 不新增 Process store、Process autosave、第二個 revision、第二個 API 或跨文件 journal。
- 建立新 Duty 並連到 ProcessNode 必須是單一原子 organization command；任一步 validation 失敗時兩者都不建立。
- 刪除 ProcessNode 的 Current Phase 契約只允許 leaf node；成功時在同一 history commit 移除該 node、其 ProcessEdges 與 ProcessNodeDutyLinks，不刪除 Duty 或 DutyPositionRelation。
- Duty 尚被任何 ProcessNodeDutyLink 引用時，Duty 刪除必須 fail closed；使用者先解除 link，再依既有 Duty delete contract 處理。

### 版本與 migration

- V6 合法文件 migration 到 V7 時只加入四個空集合，不從 Duty、Position、管理辦法文字或畫面推測流程。
- 原始 V6 bytes 不覆寫；合法版本只在下一次成功保存時寫回 V7。
- Workspace manifest 維持 V1，organization version ID 與 document schema version 分離。
- 現行版本比較器在 Current Phase 明確忽略四個 Process 集合；流程差異比較另列 Future Phase，不得因 schema spread 意外顯示。
- Governance snapshot builder 繼續 explicit field selection，不得把 Process 集合自動帶入治理發布快照。
- 管理辦法 Current Phase 不引用 Process；DEV-032 的文件 store、snapshot、editor schema 與 permission 不受 V7 migration 影響。

### UI projection

- 心智圖與流程圖是相同 ProcessNode 的兩種純投影：parent-child 與 next-step edge 分別來自不同欄位／集合。
- 圖形位置由 deterministic layout 計算；切換視角、重載或換 viewport 可重新排版，不影響領域資料。
- 同頁的流程 canvas 與組織圖 canvas 使用獨立 React Flow provider／viewport store，共用上層 organization state 與 selection context。

## Consequences

### Positive

- 使用者在同一工作台的流程、Duty 連結與 Position 配置只有一個保存狀態，不會看到「流程已存但責任未存」的雙重結果。
- Undo／Redo、autosave、Ctrl+S、版本切換、下載備份與 CAS 可以沿用現有模型。
- DEV-034、DEV-036 與 DEV-038 可依 stable IDs 投影同一份資料，不需要同步程序。
- Current Phase 不新增 provider、正式資料庫、帳號、lease 或跨文件 transaction。

### Negative

- OrganizationDocument 需升為 V7，parser、validator、commands、seed、backup、workspace migration 與 regression 都會受影響。
- Process 暫時不能獨立於 organization version 發布、鎖定或共編。
- Organization version 文件可能變大；需要在 RD Implementation Readiness Review 固定合理的 Current Phase graph size 與 performance gate。
- Duty 刪除新增 Process link 阻擋條件，必須更新可見失敗與 recovery path。

## Compatibility impact

- ADR-002 的 manifest＋每版本文件權威維持不變；只提升內層 document schema。
- ADR-006 的 Duty／DutyPositionRelation 單一權威維持不變；本 ADR 只擴充同一 organization document，不恢復已撤銷的獨立 plan store。
- DEV-034 空 Process fixture 的既有 relation 行為不變；新 link 阻擋只在 Duty 真正被 ProcessNode 引用時生效。
- DEV-036 仍是唯讀 Duty／Position 投影，不必理解 Process schema 才能顯示既有盤點／分布。
- DEV-032 不建立 Process reference；未來若管理辦法要穩定引用 Process／ProcessNode，須另案定義跨 store identity、刪除與 snapshot 契約。

## Re-entry trigger

2026-08-27 implementation-readiness note：DEV-038 已依本 ADR 完成 repo mapping，固定 OrganizationDocument V7 exact types、V6→V7 non-destructive migration、whole-document API、Duty delete guard、雙 React Flow provider、file allowlist及 S0→S6；P0／P1 readiness blocker 為 0。詳細 implementation contract 由 `ai-doc/specs/DEV-038-process-duty-responsibility-planning-workbench.md` 第 14 節擁有，本 ADR 不重複短期檔案配置。

若真實使用出現下列任一需求，重新評估是否由新 ADR 分離 Process authority：

- 流程需要獨立於 organization version 的發布、核准、封存或比較生命週期。
- 不同使用者必須同時編輯流程與組織，且需要 lease、merge 或細粒度 ACL。
- Process graph 大小使 organization whole-document CAS／autosave 無法達成可接受效能。
- 外部流程系統成為正式 Process authority，OrgMaster 只應保存 stable reference 或 snapshot。

在上述條件未出現前，不得另建 Process store、同步 worker 或雙寫相容層。
