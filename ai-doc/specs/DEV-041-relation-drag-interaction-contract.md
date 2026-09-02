# DEV-041：跨面板關係拖曳互動一致化契約

> **2026-09-02 final acceptance override — Chromium native behavior accepted**：使用者依 RD Technical Lead 建議正式接受 Chromium 在 `dropEffect=none` 時不派送 terminal `drop` 的原生行為。本決策只替換 noop／rejected 的驗收定義，不修改 production effect policy：合法拖放仍必須有 terminal `drop`、恰好一次正確 mutation 與 revision change；noop／rejected 則必須有 terminal `dragend`、zero mutation、revision unchanged、session cleanup 與 0 console/pageerror，不強迫瀏覽器產生 `drop`。既有 aggregate 已滿足上述條件，因此 Browser native QA／QC=`Pass`，DEV-041 現行狀態為 `RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`。本段優先於下方仍保留的 gap／Partial 歷史文字；未授權 freeze、commit、merge、deploy或release。

> **2026-09-02 current override — fresh native aggregate completed with one browser-policy gap**：依 RD Technical Lead 審查，`effectAllowed` 已由各 caller 選填收斂至 `relationEffectAllowedFor(payload)`：Employee=`copyMove`、Duty=`all`（同時涵蓋 Position 的 copy／move 與 ProcessNode 的 link）、ProcessNode=`link`；target 仍由既有 resolver 投影實際 `dropEffect`，且只有 `active && available && onPreview && onCommit` 才宣告可接收。ProcessNode 關係來源明確使用 `data-relation-drag-handle="true"`，保留整個非互動區可拖與內層控制項排除。最新 targeted `7 files／37 tests`、typecheck 與 build 通過。以四個全新 fixture 由正常產品入口及 system Chrome 完成四向 native：`EMP-POS`、`DUT-POS`、`PROC-DUT`、`DUT-PROC` 均觀察 strict MIME、正確 `effectAllowed／dropEffect`、terminal `drop／dragend`、revision 變更及對應 canonical relation readback；aggregate=`output/playwright/dev041/F041-QA-QC-native-aggregate.json`。另以全新 fixture 驗證 Organization 與 Process owner canvas 四邊 auto-pan：兩個 owner 的 left／right／top／bottom viewport translation 均改變、zoom 維持不變、取消後 revision 不變；console/pageerror sweep 均為 0。`NOOP-EMP-POS` 與 `REJECT-PROC-POS` 均證明 strict MIME、terminal `dragend`、revision 不變及 zero mutation，但 Chromium 在 `dropEffect=none` 時不發出 terminal `drop`；此為 effect policy 與瀏覽器原生事件的待決策差距，見 aggregate 的 `browserGap`，因此 Browser native QA／QC 仍為 `Partial / Open`，不得冒充全數通過。所有 fresh fixture cleanup 均以 `archived` readback 完成；task-owned `5080` 在本輪結束後釋放，user-owned `5000` 未觸碰。

> **2026-09-02 targeted-count correction**：本輪於文件更新後重新執行同一組 7 個 DEV-041 targeted test files，最新結果為 `36 tests passed`；先前記錄的 `37 tests` 視為較早計數 provenance，不覆寫本次測試輸出。

狀態：`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`

日期：`2026-09-02`

父交付點：`DEV-039`

決策來源：`USER-2026-09-01-RELATION-DRAG-INTERACTION-TEMPLATE`、`USER-2026-09-01-DEV041-HCS-R1-1A-2B-3A`、`USER-2026-09-01-DEV041-HCS-R2-4A-5A-6A`、`USER-2026-09-01-DEV041-HCS-R3-7A-8A-9C`、`USER-2026-09-01-DEV041-HCS-R4-10A-11A-12A`、`USER-2026-09-01-DEV041-HCS-R5-13A`、`USER-2026-09-01-DEV041-RD-IMPLEMENTATION-READY`

風險等級：`Medium`（跨多個可見來源、兩個 React Flow 畫布與關係配置狀態機；不改資料、API、權限或持久化權威）

## 0.1 現行決策登錄（唯一狀態來源）

本節是 DEV-041 的冷啟動判定；`dev_task.md` 與 `documentation_map.md` 只保留摘要與連結，不得自行推導另一套狀態。日期較早的 runner、截圖與 QA／QC 段落均為 provenance，除非明確標示為 current override，否則不覆寫本節或第20節。

| Gate | 現行判定 | 可採用依據 |
| --- | --- | --- |
| Contract／architecture | `Pass after contract optimization` | 第20節 TL-1～TL-11；single MIME／resolver／session／App mutation owner維持不變 |
| RD implementation | `Complete` | shared source effect policy 已修正並以 reverse-direction RD probe 驗證；P1 implementation blocker 已關閉，見第11.4節 current correction record |
| Automated gate | `Pass` | 第11.4節：latest targeted 7 files／36 tests；required regression baseline 170 files／693 tests（1 skipped）；typecheck、build |
| Browser native QA／QC | `Pass` | 四向 fresh native、兩個 owner canvas 四邊 auto-pan、console sweep、fixture cleanup及zero-mutation均已有aggregate；使用者已接受 noop／rejected 在 `dropEffect=none` 時以terminal `dragend`、zero mutation與revision unchanged作為成功條件，不要求Chromium派送terminal `drop` |
| Candidate freeze／commit／release | `Ready / Authorization Pending` | QA／QC gate已關閉，但尚未取得使用者／PM對freeze、commit、merge、deploy或release的明確授權 |

**最小化原則**：本輪只修正共用互動邊界與文件判定一致性；不得因 native runner 限制新增第二輸入路徑、fallback、resolver、mutation owner、schema、API 或 dependency。

## 1. 目的與成功定義

DEV-041 將目前「員工整列可拖、組織圖邊緣可即時平移」的理想互動，統一套用到 DEV-039 已登錄的關係配置。成功不是建立新的拖曳系統，而是讓下列關係共用同一使用者語法與既有商業權威：

- `Employee → Position`
- `Duty → Position`
- `ProcessNode → Duty`
- `Duty → ProcessNode`

使用者在桌面可編輯狀態下，從來源物件的非互動區域拖曳；系統以同一候選提示、三態落點、owner-canvas auto-pan、成功／失敗回饋與完成後脈絡處理所有方向。合法關係仍只由既有 `resolveRegisteredDrop()` 判斷，合法 mutation 仍只由 App composition root 轉交既有 Command／domain authority。

## 2. 現行架構事實

以下是 RD 進場時必須保留的 existing truth：

- `workspace/entityDrag.ts` 擁有唯一 strict MIME、typed source／target、registered resolver 與 drop effect；不得複製。
- `workspace/relationPlacement.ts` 擁有唯一 `idle／placing／committing` session、payload equality、candidate snapshot 與 auto-pan calculation；不得另建平行 drag state。
- App composition root 擁有唯一 placement reducer、latest-state revalidation、capability revalidation、mutation commit、notice 與 focus restoration。
- Employee directory 的整列 native drag 已作為 reference；Employee、Duty、ProcessNode 四向來源／落點均已收斂至同一 headless binding與App owner。
- 組織圖 auto-pan 已使用 Organization React Flow instance；流程圖必須使用自己的 instance，不能借用組織圖 instance。
- 現行鍵盤 placement 是 DEV-039 已完成能力與歷史證據的一部分。DEV-041 本階段只標準化滑鼠，不刪除或降級既有鍵盤能力，也不把鍵盤改造列入本輪交付；若實作無法保留既有鍵盤行為，必須停止回 PM。

## 3. Intentional Replacement 與權威優先序

DEV-041 是 DEV-039 candidate freeze 後的 follow-on。它只對「關係拖曳來源表面與滑鼠互動」做 intentional replacement：

1. DEV-039 的「列尾把手開始 native placement」由「整個來源物件／卡片的非互動區域可拖」取代。
2. DEV-039 的 single session、strict MIME、registered resolver、mutation authority、Undo／Redo、autosave、CAS、permission 與 readonly 邊界全部保留。
3. DEV-041 第一版驗收只涵蓋滑鼠一致化；DEV-039 既有鍵盤路徑保留為相容基線，不因本輪未重新設計就移除。
4. DEV-039 已完成的 evidence 是回歸基線，不是 DEV-041 新互動的通過證據；DEV-041 實作後必須取得 fresh evidence。

衝突時，以本文件處理來源表面、滑鼠拖曳、三態回饋與 owner-canvas auto-pan；其他 domain、workspace shell 與 persistence 仍以 DEV-039、ADR-009 及各領域 active spec 為準。

## 4. Current Phase Scope

### 4.1 In scope

- 在同一 DEV 內完成四個 registered relation direction 的共用滑鼠互動；先遷移 Employee reference，再遷移其餘來源，全部 parity 後才交付。
- 整個來源物件／卡片為 native drag surface；內嵌互動控制保留原 click、focus、keyboard 與 command，不啟動拖曳。
- 沿用瀏覽器原生 drag promotion／movement threshold；短按仍是原選取或開啟，不新增 pointerdown 立即抓取或長按計時器。
- drag begin 時只為目前 payload 可接受的 registered targets 顯示低強度候選；hovered target 顯示完整 valid／noop／rejected 三態與原因。
- auto-pan 只操作游標所在 owner canvas 的四邊；保持 zoom 與 viewport，不 center、fit view 或跨 canvas 控制。
- valid drop 走單一 canonical mutation path；noop／rejected 為零 mutation、零 modal並顯示非阻斷原因。
- 成功後保留來源選取、來源清單 scroll offset、workspace focus、canvas viewport／zoom；短暫強調實際落點並顯示非阻斷成功狀態。
- 解除被取代的舊 mouse-only relation handles／raw bindings，避免新舊兩套滑鼠入口長期並存；既有鍵盤相容路徑不得誤刪。

### 4.2 Out of scope

- 新增 payload kind、target kind、關係類型或未登錄 resolver 規則。
- 修改 schema、API、permission、OrganizationDocument、version、autosave、CAS、Undo／Redo 或 domain Command。
- 職位階層重排、工作台 panel 排列、舊職掌矩陣／異常修復拖曳、檔案拖曳或任意物件關聯。
- 新增手機／觸控 mutation；手機維持專案最高原則唯讀。
- 新建鍵盤 placement UX、快捷鍵提示、ARIA drag pattern 或落點循環；這些保留 future capsule。既有 DEV-039 keyboard path 只作相容保留。
- 引入第三方 DnD 套件、global event bus、跨畫布共用 React Flow instance或第二個 drag coordinator。

## 5. 共用元件責任

共用層必須是 headless binding／adapter，不擁有領域畫面或商業規則。

### 5.1 Relation Drag Source Binding

責任：

- 接受既有 typed payload factory 與 capability；只在可編輯、可配置時輸出 native source props。
- `effectAllowed` 必須涵蓋該 source 在目前產品入口可到達的所有 registered target effect；source 不得宣告比 target resolver 可能回傳的 `dropEffect` 更窄的集合。此規則由 shared adapter 的 `relationEffectAllowedFor(payload)` 實作：Employee=`copyMove`、Duty=`all`、ProcessNode=`link`；target 仍以 resolver 結果投影實際 `dropEffect`，不得由各 caller 自行覆寫。
- 在來源根節點套用一致 `draggable`、`dragstart`、`dragend` 與 source identity。
- 使用唯一 interactive-descendant policy 排除 `button`、`input`、`textarea`、`select`、`option`、`a`、menu、contenteditable 與等價互動節點。
- 保留 click／double click／focus／selection；不得在 `pointerdown` 建立 placement session。
- 只呼叫 App 提供的 begin／cancel boundary，不持有 resolver、candidate、mutation、API 或 domain state。

禁止：每個 domain 自建 selector 白名單、第二 MIME、第二 session、專用計時器，或以 overlay 阻擋卡片內控制項。

### 5.2 Relation Drop Target Binding

責任：

- 接受 registered target identity 與 App 提供的 preview／commit／leave boundary。
- 只把 resolver 結果投影為 `available／valid／noop／rejected` 可見狀態，不自行判定商業合法性。
- valid 使用藍色、noop 使用黃色、rejected 使用紅色；每一態須同時具備文字、圖示、ARIA description或等價非色彩訊號。
- active session遇到strict MIME及registered target時，`dragover`先同步preview，再`preventDefault()`並設定該candidate的dropEffect；即使noop／rejected也要允許`drop`事件抵達，才能發布具體零mutation原因。`dragover`不得`stopPropagation()`，owner canvas必須收到同一事件做auto-pan。
- `drop`辨識strict MIME後可`stopPropagation()`避免巢狀target重複commit，但必須重新parse payload並以最新state／capability重算；不得沿用preview intent。
- candidate沒變時不得重複dispatch；`dragleave`只有在`relatedTarget`已離開整個target root時清hover candidate，不取消session或owner auto-pan。dragend／cancel才清整段placement。

禁止：在 target component 直接寫入 API、Command、history、dirty、autosave 或 version。

### 5.3 Canvas Auto-pan Adapter

責任：

- 每個 owner canvas 建立自己的 adapter，持有自己的 React Flow instance與可視容器 boundary。
- 只在 active mouse placement、游標位於該 canvas 且接近四邊時運作。
- owner canvas surface本身接收`dragover`並排程平移，因此游標在畫布空白區也能定位；target binding不得把auto-pan綁死在node target，也不得阻止owner surface取得同一事件。
- 以 `requestAnimationFrame` 合併高頻 `dragover`；同一 canvas 同時最多一個 pending frame。
- 依既有純函式計算 delta，再從 owner instance讀取並更新 viewport；保持 zoom，不 center／fit view。
- placement結束、surface關閉、capability loss、owner unmount時取消 pending frame並釋放引用。

禁止：document-level永久 listener、用 Organization instance 操作 Process canvas、同一事件同時平移兩個 canvas，或把 auto-pan 寫進 domain resolver。

### 5.4 Feedback Projector

共用層可提供 effect／reason 到短文字、icon與 CSS state 的純投影，但不得把提示文字反向作為商業判斷。App 仍是 notice owner；source／target只呈現由 App／resolver提供的狀態。

## 6. 狀態與事件契約

1. `idle`：沒有 active placement，registered targets不顯示候選。
2. native browser確認 dragstart後，Source Binding寫入 strict MIME並要求 App `beginPlacement`；不得在 pointerdown或短按時先進入 `placing`。
3. `placing`：App以目前 payload與capability取得可接受 target類型；registered targets只顯示低強度 available提示。
4. `dragenter／dragover`：Target Binding要求 App以 latest canonical state呼叫唯一 resolver，hover target投影 valid／noop／rejected；同時由owner canvas surface（包含空白區）依事件座標排入一個auto-pan frame，target不得吞掉該owner事件。
5. `drop`：重新 parse `DataTransfer`，核對 session payload，重新讀 latest capability與latest canonical state，再呼叫同一 resolver。
6. valid：App進入 `committing`並只呼叫一次既有 canonical mutation authority；成功後回 `idle`，保留工作脈絡並發布成功狀態。
7. noop／rejected：不進入 domain mutation，不建立 history／dirty／autosave／revision，回 `idle`並顯示原因。
8. `dragend`、Escape既有相容路徑、source／target unmount、surface關閉、capability loss或payload失效：fail closed回 `idle`、清除候選、取消 auto-pan並恢復可預期焦點。

同一拖曳中只允許一個 active session、一個 hovered candidate及每個 owner canvas一個 pending animation frame。

## 7. 來源與目標矩陣

| Direction | Source root | Target | Owner canvas／surface | 成功 effect |
| --- | --- | --- | --- | --- |
| Employee → Position | Employee directory整列、組織圖內Employee row整列 | Organization Position card | Organization canvas | assign／assign-additional／move |
| Duty → Position | Duty directory／responsibility lane整個項目 | Organization Position card | Organization canvas | configure／transfer-primary／replace |
| ProcessNode → Duty | Process node card整體非互動區 | Process-Duty bridge Duty item | Process workspace | link |
| Duty → ProcessNode | Process-Duty bridge Duty item整體非互動區 | Process node card | Process canvas | link |

同一 source root 可以同時保留 click／selection；只有 nested interactive descendant 不啟動 mouse drag。若來源包含既有 keyboard action，其相容功能不得因移除永久 mouse handle而消失。

## 8. 資料、API、權限與依賴影響

- Data：`None`；不新增欄位、entity、relation或migration。
- API：`None`；沿用既有 workspace/version endpoint及 Command commit結果。
- Permission：`None`；沿用 App 已計算的 editable／capability intersection，readonly不輸出可拖能力。
- Persistence：`None`；placement session、candidate、auto-pan frame與短暫 feedback皆為UI暫態，不進URL、draft或version document。
- Dependency：`None expected`；不得新增 DnD library或改 lockfile。若原生事件無法滿足契約，停止回 PM，不得自行引入套件。

## 9. 正常入口與 UI 狀態

### 9.1 Canonical normal entry

桌面使用者由 `/` 進入產品，透過頂部「功能」開啟來源模組與目標模組到工作台；不可只用測試直達URL或元件sandbox宣稱功能完成。

最小真實任務：

1. 在可編輯草稿中開啟「員工」與「組織架構圖」。
2. 從員工清單整列非互動區拖向組織圖職位。
3. 接近畫布邊緣時確認只平移組織圖；hover落點顯示正確三態。
4. valid drop後確認關係、脈絡保留、短暫回饋與canonical readback。
5. 再依矩陣由正常入口重演 Duty→Position及ProcessNode↔Duty。

### 9.2 必備狀態

- Loading：來源／目標尚未載入時不建立 placement；不得出現幽靈target。
- Empty：清單或畫布無資料時顯示既有空狀態，無拖曳提示。
- Error：載入或commit失敗時保留原畫面與資料，顯示可理解非阻斷錯誤；不得假成功。
- Readonly：不提供 draggable、候選高亮或mutation提示；閱讀與既有選取仍可用。
- Narrow／mobile：依最高原則唯讀；不以隱藏提示暗示可拖。
- Surface close／unmount：立即取消active placement及owner rAF，不殘留全域樣式或listener。

## 10. Acceptance Contract

### 10.1 互動一致性

- 矩陣內所有source的標題、文字及可用空白區皆可用主要滑鼠鍵拖曳；nested interactive controls不會啟動drag，且原操作不回歸。
- 短按只執行原click／select，輕微手抖不建立session；不存在長按、pointerdown立即抓取或專用mouse-only把手。
- 所有direction共用同一 strict MIME、session、resolver、latest-state revalidation與App mutation owner。

### 10.2 回饋與畫布

- begin只有相容registered targets低強度提示；hovered target才有藍／黃／紅強狀態及非色彩原因。
- Organization與Process canvas四邊auto-pan皆使用自己的instance；不跨canvas、不改zoom、不center／fit view，且高頻dragover無明顯抖動。
- valid成功只短暫強調落點與發出非阻斷成功狀態；不開明細、不改workspace focus、不跳來源scroll或canvas viewport。

### 10.3 Mutation與復原

- valid drop恰好一次canonical mutation，Undo／Redo、autosave、CAS與reload readback維持既有結果。
- noop／rejected／stale／capability loss／surface close皆為零Command、零history、零dirty、零autosave、零revision變化，且顯示具體原因或取消結果。
- success後來源仍維持選取；resolver允許時可把同一來源再拖到另一target，不允許時正確顯示noop／rejected。

### 10.4 相容與技術邊界

- DEV-039既有keyboard placement若仍可由產品入口觸發，不得因DEV-041 source migration失效；本輪不新增或宣傳新的keyboard UX。
- source scan證明沒有第二MIME、resolver、mutation owner、global drag store、document-level永久listener或長期雙binding。
- 不新增dependency、schema、API、permission或持久化欄位。

## 11. QA／QC 與證據契約

DEV-041 為 Medium risk。RD完成後至少要交付以下 fresh evidence，不能只引用DEV-039歷史證據：

### 11.1 Automated gate

- pure tests：interactive-descendant policy、candidate state mapping、auto-pan delta／rAF lifecycle、cancel與payload equality。
- component tests：每種source root整體可拖、nested controls不拖、每種target三態、unmount cleanup、readonly fail closed。
- architecture policy：唯一 MIME／resolver／session／mutation owner；禁止raw relation drag binding重新散落、第二resolver及document永久listener。
- regression：既有domain relation、Undo／Redo、autosave／reload、readonly、panel lifecycle及鍵盤相容基線。
- `typecheck`、targeted tests、full regression與production build全數通過；exact commands以第18.1節為準，實際輸出與數量由RD實作後回填。

### 11.2 Browser evidence

- 以正常產品入口、真實滑鼠及真實 HTML5 `DataTransfer` 重演四個direction；synthetic event或直接API mutation不可代替。
- 桌面最少 `1440×900`與`1024×768`；窄版最少 `1023×768`與手機 `390×844`驗證唯讀不提供drag。
- 每一direction記錄：source／target、strict MIME、完整事件鏈、候選態、effect、UI結果、API status、revision before／after、canonical relation readback、history／dirty／autosave、viewport／zoom before／after、source selection／scroll、console與cleanup。
- valid至少一案證明terminal `drop`、恰好一次mutation與revision change；noop與rejected各至少一案證明terminal `dragend`、zero mutation、revision unchanged與session cleanup。當候選為`dropEffect=none`時，不要求Chromium派送terminal `drop`；另覆蓋capability loss、target unmount或surface close的fail-closed case。
- Organization與Process canvas各自四邊auto-pan至少有一份可觀察證據；需證明owner正確、zoom不變、沒有跨canvas移動。
- 執行visible error sweep：重疊、截斷、水平溢出、幽靈高亮、殘留notice／overlay、React warning／error及資料 sanity。

fixture可由既有API建立初始資料，但不得透過API直接製造預期拖曳結果。task-owned runtime須依AGENTS.md記錄並在完成後清理；user-owned `localhost:5000`不得擅自停止。

### 11.3 判定與交付

- Automated gate通過但正常入口native evidence不足：`Partial / Open`，不得宣稱UI交付。
- 任一source仍用不同觸發、任一canvas用錯owner、noop／rejected產生mutation或舊binding仍並存：`Fail`。
- 合法候選必須有terminal `drop`與恰好一次mutation；noop／rejected在`dropEffect=none`時，只要有terminal `dragend`、zero mutation、revision unchanged、session cleanup且無visible／console error，即可判定`Pass`，不得為取得`drop`事件而偽裝成可放置。
- 全矩陣與failure seeking通過後，才能進入candidate freeze；commit、merge、deploy、release仍需各自授權。

### 11.4 本輪實作驗證紀錄

- 純互動／binding／auto-pan／OrgNode與architecture policy targeted：`11 files／52 tests passed`（含本輪新增 OrgNode source／target parity、shared-adapter source policy、React Flow mousedown isolation、factory重建後pointer-origin及terminal cancel regression）。
- Required regression：`170 files／693 tests passed，1 skipped`。
- Full regression rerun（2026-09-01，current worktree）：`171 files／695 tests passed，1 skipped`；此 broad run包含目前工作樹的 supplemental／未追蹤測試，僅作回歸觀察，不改變第19節 selective allowlist、candidate freeze或QA／QC判定。
- TypeScript：`npx tsc --noEmit --pretty false` 通過。
- Production build：`npm run build` 通過；僅保留既有 Vite extension與bundle size warning，未新增錯誤。
- Latest targeted correction rerun（2026-09-02）：`7 files／36 tests passed`；涵蓋 shared effect policy（Employee／Duty／ProcessNode）、inactive target fail-closed、ProcessNode relation-handle admission、OrgNode relation target在`editingEnabled=false`時仍可接收，以及既有 ProcessPlanning／bridge lifecycle regression。
- Browser smoke：既有 `localhost:5000` 草稿正常入口確認 `33` 個 Position target、`40` 個 Employee source、舊 mouse handle `0`；未改動或停止 user-owned runtime。
- Fresh runner recheck（2026-09-01）：以全新 task-owned fixture `draft-1cb47aab-c736-49fd-bfcb-909d131b7114`、`127.0.0.1:5080`及正常入口重新確認 Employee drawer／Organization Position geometry，再嘗試 Organization employee row→Position與Employee drawer→Position的原生 CUA；未取得可採用的完整 strict `dragstart→drop`／`DataTransfer` trace，且API／revision未變。此筆只作 runner capability provenance，判定為 `blocked / not-run`，不推論產品失效；fixture cleanup已取得`archived` readback（manifestRevision=`664f641673c6807aa867011d07f347b30834541f68320e166a98bc2ed11e083e`），`5080`已釋放，`localhost:5000`未觸碰。除非取得可讀取真實`DataTransfer`的新 harness，停止同類重試，不新增第二輸入路徑、fallback、resolver、mutation owner或第二 evidence manifest。
- Fresh system-Chrome source-boundary recheck（2026-09-01）：以全新 task-owned fixture `draft-46162633-cbd0-4c72-b543-9599da78ea6c`、`127.0.0.1:5080`及正常入口，從流程節點卡片的非互動區域拖向職掌 target；觀察到真實`dragstart`、strict `application/x-orgmaster-entity`、`effectAllowed=link`及target `dragenter／dragover`，但本次桌面自動化未產生terminal `drop`／`dragend`後的API mutation，revision與既有link IDs維持不變。此筆只作 source/runner provenance，判定為`blocked / not-run`，不推論產品失效；fixture cleanup已取得`archived` readback（manifestRevision=`7f25dbf5a69dd3dd5d6a73db004d1e23d57b382c43fc872a30e5107809d48cf5`），`5080`已釋放，`localhost:5000`未觸碰。依停止條件不再為同一 runner增加fallback或第二證據清冊。
- Valid-target identity recheck（2026-09-01）：以全新 fixture `draft-dfa1b3a8-89d6-4be0-91e9-9966e51e7b75`先由 fixture API確認`process-node-dev039-b16-open`尚未連結`duty-dev039-b16-new`，再以正常入口嘗試同一張流程節點卡非互動區→該合法職掌；runner於terminal事件輸出前逾時，未取得可採用的`drop`／mutation trace，cleanup前API readback亦未出現新增link。此筆只作 target identity／runner provenance，判定為`blocked / not-run`，不推論產品失效；fixture cleanup已取得`archived` readback（manifestRevision=`4ff84ffbfd1a62463003f20c9726d82e9da45cc518053f6235e9e0058be13f95`），`5080`已釋放，`localhost:5000`未觸碰。依停止條件不再重試同一runner或新增fallback／第二證據清冊。
- Browser-plugin CUA observation（2026-09-02）：以全新 task-owned fixture `draft-4c97fb76-bff9-44a2-b743-de86eeb0501d`、`127.0.0.1:5080`及正常流程規劃入口，確認 `process-node-dev039-b16-open` 與合法 target `duty-dev039-b16-new` 均可見；從流程節點卡片非互動區執行跨面板 CUA drag，transport-level drag call completed，但未觀察到 terminal `drop`／domain mutation。API readback維持唯一既有 link `process-link-dev039-b16-linked-primary`，未新增關係；此筆只作 runner capability provenance，判定為`blocked / not-run`，不推論產品失效，也不作 revision change evidence。fixture cleanup應以同一 version id 完成 `archived` readback，`5080` task-owned runtime須釋放，`localhost:5000`不得觸碰；依停止條件不再為同一runner增加fallback、synthetic drop、第二resolver或第二證據清冊。
- 本輪隔離 `5080` runtime 已以 system Chrome 取得 Employee source 的真實 `dragstart→dragenter／dragover→drop→dragend`；ProcessNode source 另確認 React Flow 的 ancestor `mousedown` 會阻斷 native promotion，已由 shared source adapter 的 `stopMouseDownPropagation` 窄接線修正，並以 targeted adapter／composition tests 鎖定。其後以全新 fixture 從正常入口完成一條 `ProcessNode→Duty` 真實 native path：strict MIME、`dragstart→dragenter／dragover→drop→dragend`、`link` effect、revision 變更與 canonical link 均讀回一致，證據=`output/playwright/dev041/F041-S7-PROC-DUT-native-rd-probe.json`。本輪另實際重演 Employee directory→Position（revision 變更、canonical assignment readback）及 Organization employee row 的 keyboard→Position（revision 變更、既有 assignment 結束日與新 assignment readback）；browser CUA 對 Organization employee row→Position 與 Duty lane→Position 未產生可觀察 mutation，已記錄於`output/playwright/dev041/F041-QA-QC-partial-native-evidence.json`，不以鍵盤或API結果冒充native通過。該 partial record 的 B16 fixture 已依 cleanup command 完成 `archived` readback（manifestRevision=`2f83ad7d801f9c8644f81531d1326b2c9177e59a9cf8ade0dab69cb371b1b375`），`5080` task-owned runtime亦已釋放；user-owned `localhost:5000`未觸碰。此為RD probe／partial observation，不等於QA／QC通過；其餘方向、zero-mutation、console、四邊auto-pan仍由QA／QC gate保留。partial artifact保留歷史React `key` warning；本輪補上`OrgNode`員工映射的穩定`employee.id` key後，targeted component rerun已不再出現該warning；Vite extension／bundle-size advisory、act環境提示及瀏覽器擴充套件非同步回應錯誤仍是baseline，QA／QC console sweep必須分類是否為新回歸。
- Native Playwright recheck（2026-09-02）：以全新 task-owned fixture `draft-5069a060-3786-40f6-874c-4e87434e6ba2`、`127.0.0.1:5080`及正常流程規劃入口，從職掌抽屜已選取的 `duty-dev039-b16-primary`／`primary-execute` lane 拖向尚未連結的 `process-node-dev039-b16-open`。source／target均確認為 shared binding（source為 duty lane；target為可同時作為 process-node source 的節點根），實際事件到 `dragstart→dragenter／dragover→dragleave→dragend`，沒有 terminal `drop`；API readback未新增 `processNodeDutyLink`，因此 `matched=false`。此為可重現的 native reverse-direction P1 observation，不能歸因為僅有 runner 不支援，也不能用既有 link、鍵盤或 API 直寫替代；在修正並取得 fresh evidence 前，Browser native QA／QC 維持 `Partial / Open`，不得進 candidate freeze。fixture cleanup需以同一 version id 完成 `archived` readback，`5080` task-owned runtime需釋放，`localhost:5000`不得觸碰。
- P1 correction verification（2026-09-02）：依上項 observation 將 per-caller `effectAllowed` 收斂至 `relationEffectAllowedFor(payload)`；全新 task-owned fixture `draft-2e844948-3bec-4d3e-a2eb-824c26453bdf` 以 system Chrome 正常入口重演同一 Duty lane→ProcessNode。source `effectAllowed=all`、strict `application/x-orgmaster-entity`、target `dropEffect=link`、`dragenter／dragover` `preventDefault=true`、terminal `dragend` 及 API revision 變更均可觀察，canonical `process-duty-2` readback成立；runner輸出未單獨列出`drop` listener，故只作 RD correction probe，不計入四向 QA／QC aggregate。fixture cleanup=`archived` readback（manifestRevision=`cdb021ae3122fd708fda8aebbaea07ea96db5d910a97d428d928e740437a7a0b`），`5080`已釋放，`localhost:5000`未觸碰；P1 implementation blocker關閉，剩餘browser gate仍依第11.2節執行。
- Shared target-admission follow-up（2026-09-02）：target adapter現同時要求 session `active`、既有 capability `available` 與 owner `onPreview`／`onCommit`；inactive target不再 preview／preventDefault／攔截候選。ProcessNode source的明確 relation handle只負責在React Flow ancestor互動層中保留native promotion，不建立第二輸入路徑。latest targeted `7 files／36 tests`與typecheck/build均通過；架構仍維持 single MIME／resolver／session／App mutation owner。
- Native correction probe（2026-09-02，fixture `draft-da566d65-2b97-472c-9d42-abe4000b1cd5`）：system Chrome正常入口完成 Duty lane→ProcessNode的strict MIME與`all→link` effect negotiation；target `dragenter／dragover`可preventDefault、terminal `drop` capture與`dragend`可觀察、API revision變更及canonical `process-duty-2` readback成立。target adapter依契約停止`drop`向上冒泡，runner不另建bubble listener；本筆只作RD correction probe，fixture需以`archived` readback清理，不提升四向QA／QC aggregate。
- Fresh four-way native aggregate（2026-09-02）：使用四個彼此隔離的全新 DEV-039 S7 fixture、task-owned `127.0.0.1:5080`、system Chrome 與正常產品入口完成 `EMP-POS`、`DUT-POS`、`PROC-DUT`、`DUT-PROC`。四案均有 strict `application/x-orgmaster-entity`、矩陣對應的 `effectAllowed／dropEffect`、terminal `drop／dragend`、revision 變更及 canonical relation readback；四案 console/pageerror 均為 0，cleanup 均為 `archived`。逐案證據與 cleanup manifest 已收斂至 `output/playwright/dev041/F041-QA-QC-native-aggregate.json`。
- Fresh zero-mutation probes（2026-09-02）：`NOOP-EMP-POS` 與 `REJECT-PROC-POS` 均以全新 fixture 及正常入口驗證 strict MIME、terminal `dragend`、revision before／after 相同、console/pageerror 為 0；candidate effect為`dropEffect=none`時Chromium原生不派送terminal `drop`。使用者已接受此原生行為，aggregate狀態更新為`pass`，其成功條件為terminal `dragend`、zero mutation、revision unchanged及session cleanup，不以偽造drop補事件。fixture=`draft-f25270c5-ce49-4c44-b61b-70b5e731939e`，cleanup=`archived`。
- Fresh owner-canvas auto-pan probes（2026-09-02）：Organization `canvas-wrap`（fixture `draft-fcf4bc2e-21cc-4bee-9cc8-daa6990c2f62`）與 Process `process-planning-canvas`（fixture `draft-44ca72d8-6511-4008-bb89-ecdc8feed6c2`）均以真實 native drag 在 left／right／top／bottom 四邊觀察到 owner viewport translation 改變、zoom 維持不變、取消後 revision 不變；兩案 console/pageerror 均為 0，cleanup 均為 `archived`。詳見 aggregate auto-pan records。
- Fresh console／error sweep（2026-09-02）：四向 valid、兩筆 zero-mutation 與兩筆 auto-pan browser records 的 console error／warning 及 pageerror 均為 0；Vite extension／bundle advisory 不在該 native scope 內。使用者已接受 noop／rejected 的 Chromium 原生行為，Browser native QA／QC=`Pass`；candidate freeze已達ready但freeze、commit、merge、deploy、release均未授權。

## 12. RD 停止條件

若實作需要或觀察到下列任一情況，立即停止並回 PM，不得用局部patch繞過：

- 新增第二 MIME、resolver、mutation owner、placement store、global event bus或第三方DnD dependency。
- 需要修改schema、API、permission、version document或domain relation語意。
- 無法讓Organization與Process使用各自React Flow instance，或需要跨canvas共享instance。
- 整卡drag與nested controls／React Flow pan存在無法在共用policy內解決的gesture衝突。
- 為達成9C而必須刪除DEV-039既有keyboard能力，或現有keyboard相容與整卡source無法同時保留。
- 無法在正常入口取得真實native DataTransfer evidence，或只能靠synthetic／API直寫證明。
- 需要長期並存新舊binding、domain-specific例外持續增加，或共用層開始承擔商業規則。

## 13. Future Phase Capsule：鍵盤等價配置

狀態：`Future Phase Captured / Not Requested`

目的：在共用滑鼠核心穩定後，重新定義可發現、完整且符合輔助科技需要的keyboard placement UX；沿用同一session、resolver與mutation owner。此future phase不是恢復已刪能力的藉口，因此Current Phase必須保留DEV-039現有鍵盤相容基線。

未來範圍才包含抓取入口、target循環、狀態宣告、commit、cancel、focus restoration、normal-entry提示與獨立無滑鼠QC。未收到使用者要求前，不在Current Phase新增快捷鍵或宣稱完整鍵盤等價。

## 14. Exact implementation contract

### 14.1 保留的權威與新增邊界

RD 不重寫 `src/workspace/entityDrag.ts` 或 `src/workspace/relationPlacement.ts`。前者持續擁有 `WORKSPACE_ENTITY_DRAG_MIME`、`WorkspaceEntityDragPayloadV1`、`RegisteredDropTarget`、`resolveRegisteredDrop()` 與 effect；後者持續擁有唯一 `RelationPlacementSession`、capability resolver及純 auto-pan delta。新增程式只能投影互動、接線 React event與管理 owner-canvas rAF，不得建立第二套商業判斷。

新增 `src/workspace/relationDragInteraction.ts`，固定輸出下列純契約：

- `RELATION_INTERACTIVE_DESCENDANT_SELECTOR`：唯一 nested interactive selector；含 button、form control、link、menu、contenteditable及等價角色。
- `isRelationDragInteractiveDescendant(target, sourceRoot)`：只判斷指標起點是否位於 source root 內的互動後代；source root 本身即使是 button仍可作已登錄來源。
- `RelationPlacementVisualState = 'idle' | 'available' | 'valid' | 'noop' | 'rejected'`。
- `RelationPlacementTargetPresentation`：至少含 `state`、`message`、`icon`、`dropEffect`；由 active session、target、candidate及短暫outcome作純投影。
- `projectRelationPlacementTarget(...)`、`describeRelationPlacementFeedback(...)`與`relationDropEffectFor(...)`：將App提供的既有capability結果、candidate／effect／issue code轉成非色彩文字、圖示及native `dropEffect`，不得自行重建payload／target pair矩陣或反向影響resolver結果。
- `RelationPlacementOutcome`：只含 target、state、message與token的UI暫態型別；不得持久化或形成第二placement state machine。
- `RelationPlacementBegin／Preview／Commit／Cancel`：下述唯一callback aliases，供App、binding及所有surface Props共用。

低強度`available`的唯一來源是App用既有`resolveRelationPlacementCapability()`對active payload與target求得的結果；新純模組只接受`available: boolean`並投影。禁止在DEV-041新增`isRegisteredPair()`、pair table、switch或其他平行compatibility判斷，避免未來新增relation時兩份矩陣漂移。

新增 `src/components/workspace/relationPlacementBindings.ts`，採headless factory而非視覺wrapper或在map內呼叫hook：

- `createRelationDragSourceProps(options)` 回傳來源根節點所需 `draggable`、pointer／mouse capture cleanup、`onDragStart`、`onDragEnd`與data attributes。module-local `WeakMap<HTMLElement, EventTarget | null>`只用source root作key記錄pointer origin；`pointerup／pointercancel／dragstart／dragend`都清除，不掛window／document listener。`stopMouseDownPropagation`只供嵌在React Flow owner內的source root使用，並同步隔離該root的pointer／mouse capture，避免ancestor手勢在browser `dragstart`前取消promotion；Organization employee row與ProcessNode root均由此窄接線接入，不改變其他surface的事件流。pointerdown不得begin placement；browser確認`dragstart`後才檢查nested control、寫入既有strict MIME並呼叫App `beginRelationPlacement`。
- `createRelationDropTargetProps(options)` 回傳 `onDragEnter`、`onDragOver`、`onDragLeave`、`onDrop`、ARIA與presentation data attributes。dragover先preview再設定由resolver投影的dropEffect；drop仍由App重新parse、重新驗證並commit。
- adapter只接App callbacks與typed identity，不得import domain Command、API client、history、autosave或version store。

共用callback contract固定如下，所有surface直接復用，不得各自縮窄成`void`或改成非同步preview：

```ts
type RelationPlacementBegin = (
  payload: WorkspaceEntityDragPayloadV1,
  inputMode: RelationPlacementInputMode,
  source?: HTMLElement | null,
) => boolean

type RelationPlacementPreview = (
  target: RegisteredDropTarget,
) => RelationPlacementCandidate | null

type RelationPlacementCommit = (
  target: RegisteredDropTarget,
  dataTransfer?: DataTransfer,
) => boolean

type RelationPlacementCancel = () => void
```

`createRelationDragSourceProps()`的required options為`enabled／payload／onBegin／onCancel`；`effectAllowed`不得由caller傳入，native source由`relationEffectAllowedFor(payload)`推導，避免多目標source漂移。native source若缺任一必要callback，production surface不得輸出draggable，形成fail-closed。dragstart先確認origin，再設定推導出的`effectAllowed`與strict MIME並呼叫begin；dragend一律呼叫onCancel清理terminal lifecycle。begin回`false`時必須`clearData(WORKSPACE_ENTITY_DRAG_MIME)`、`preventDefault()`並確保沒有session。`createRelationDropTargetProps()`的required options為`active／available／target`；`candidate／outcome／onPreview／onCommit／onEnter／onLeave`依target情境可選，但writable且宣告`available`的production target必須同時提供`onPreview`與`onCommit`。adapter內部以`projectRelationPlacementTarget()`產生presentation，preview必須同步回傳本次latest-state candidate，讓同一個`dragover`設定正確`dropEffect`，React dispatch只負責下一次render。兩個factory只產生props，不建立hook、provider、context或第二controller。

`RelationPlacementPreview`不再接收React `DragEvent`；target binding擁有DOM event，App只接typed target並同步解析candidate。Organization／Process auto-pan也不再藏在preview callback內，而由owner canvas `onCanvasDragOver`獨立處理。所有Props需import同一組callback type aliases，禁止各component重複手寫不同return type。

新增 `src/components/workspace/useRelationCanvasAutoPan.ts`：

- 每個owner canvas只呼叫一次hook並傳入自己的React Flow `getViewport／setViewport`及container boundary。
- 回傳`onCanvasDragOver(event)`、`cancel()`及必要的surface props；owner React Flow／canvas root負責掛載`onCanvasDragOver`，使游標在node或空白區都能平移。handler只在`native-drag` placing且pointer位於owner boundary時排程，不做target preview、mutation、`preventDefault()`或設定`dropEffect`；只有registered target binding能宣告可放置。
- 內部`schedule(point, rect)`以一個pending `requestAnimationFrame`合併高頻事件，frame內呼叫既有`getRelationPlacementAutoPanDelta()`；只更新`x／y`並保留`zoom`。target event可正常bubble到canvas owner，不得由target adapter停止傳遞。
- `cancel()`及effect cleanup在placement結束、capability loss、surface關閉或unmount時取消pending frame並清除最後point；不得掛document-level永久listener。

App composition root新增一個約`900ms`的`RelationPlacementOutcome | null`與timer，作成功／noop／rejected落點短暫回饋。新drag、cancel、surface close、capability loss或unmount都清除outcome與timer；它不得進reducer、URL、draft、history或API。全域`assignmentNotice`仍是唯一`role=status`訊息owner，target badge只提供就地、非色彩回饋。

輸入模式不得共用誤導提示：`native-drag`只顯示「拖到可用落點」類訊息，不提Enter；`keyboard`維持Enter放置／Escape取消。Native mouse begin／finish不主動改focus，只保留既有selection與scroll；keyboard才記錄source focus並在cancel／finish依既有雙rAF策略復原。fallback selector改查新的source-root data attributes與entity identity，不得繼續依賴被移除的`.process-canvas-node__relation-handle`或mouse handle。

### 14.2 來源 effectAllowed 與鍵盤相容

| Source surface | Exact draggable root | `effectAllowed` | Current phase mouse | DEV-039 keyboard compatibility |
| --- | --- | --- | --- | --- |
| Employee directory row | `article.directory-card--employee` | `copyMove` | article整列共用binding | 保留現有Space入口 |
| Organization employee row | 單一`button.org-node__employee-row`；以此取代現行row內「姓名button＋mouse handle」雙控制 | `copyMove` | 姓名、徽章與可用空白皆在同一source root；短按仍開員工明細 | 不新增本輪鍵盤UX；Enter仍執行開明細 |
| Duty directory active responsibility lane | 現行`button.duty-directory-lane__select`本身；只有已選定lane且writable時draggable | `all`（由payload kind推導） | 同一button短按選責任、拖曳配置；移除旁邊handle與custom ghost | 既有placement Enter／Space保留在獨立focus-only action，不覆寫lane select的原鍵盤語意 |
| Process node card | `div.process-canvas-node` role button root | `link` | node card非互動區共用binding；由adapter隔離React Flow ancestor mousedown | card Enter／Space仍選節點；既有placement Enter／Space保留在獨立focus-only action |
| Process-Duty responsibility lane | 現行`div.process-lane-buttons > button` | `all`（由Duty payload推導） | lane button root共用binding | 保留既有Enter／Space placement入口 |

interactive-descendant policy只排除「source root內部」的互動後代，不排除source root本身；因此上表以button作root的來源仍能從文字區拖曳。不得把draggable掛在含主要內容button的外層wrapper，否則主要文字區會被policy排除，只剩狹小空白可拖。

focus-only keyboard action必須留在DOM及tab order，採visually-minimized樣式並在`:focus-visible`顯示；禁止`display:none`、`visibility:hidden`、負`tabIndex`或只靠pointer出現。它保留DEV-039既有placement語意但不再是mouse drag surface。若無法同時移除mouse handle並保留既有keyboard path，依第12節停止回PM。

### 14.3 Target presentation contract

所有target使用`data-relation-placement-state`與`data-relation-placement-feedback`，由shared CSS產生一致邊界與短文字：`available`低強度藍色虛線；`valid`明確藍色；`noop`黃色及「關係已存在／不需變更」；`rejected`紅色及具體原因。只有active source相容target顯示available，只有hover candidate或約900ms outcome顯示強態。不得增加永久說明面板、modal、滿畫布警示色或只靠顏色的狀態。

## 15. Repo／module／file impact

### 15.1 新增檔案

- `src/workspace/relationDragInteraction.ts`
- `src/workspace/relationDragInteraction.test.ts`
- `src/components/workspace/relationPlacementBindings.ts`
- `src/components/workspace/relationPlacementBindings.test.tsx`
- `src/components/workspace/useRelationCanvasAutoPan.ts`
- `src/components/workspace/useRelationCanvasAutoPan.test.tsx`
- `src/components/OrgNode.relation-drag.test.tsx`

### 15.2 修改檔案與責任

| File | Required change | 不得帶入 |
| --- | --- | --- |
| `src/App.tsx` | outcome lifecycle；移除organization-specific preview auto-pan；`begin`回boolean、`preview`同步回candidate、`commit`回boolean；依input mode發布提示與focus策略；unassign target改共用binding；提供Organization owner adapter；只把每個Org node自己的presentation投影進node data | 第二resolver、domain rule、持久化outcome或把full session塞入所有OrgNode |
| `src/components/DirectoryDock.tsx` | Employee reference、Duty lane source、Duty card target改共用binding；移除raw mouse handlers與custom drag ghost | domain-specific interactive selector |
| `src/components/OrgNode.tsx` | Position target與Organization employee row改共用binding；接收memo-friendly `RelationPlacementTargetPresentation`；移除mouse-only employee handle | full session store、全圖廣播高頻candidate或API call |
| `src/components/ProcessPlanningCanvas.tsx` | Process node source／target改共用binding；以自己的React Flow instance啟用auto-pan | Organization React Flow instance |
| `src/components/ProcessPlanningWorkbench.tsx` | 傳遞session／presentation／owner callbacks給Canvas與Bridge | 第二placement coordinator |
| `src/components/ProcessDutyBridge.tsx` | Duty source及Duty targets改共用binding，保留keyboard compatibility | 直接Command或API mutation |
| `src/index.css` | 共用data-state樣式、feedback badge、focus-only keyboard action；刪除被取代mouse handle樣式 | 新永久helper panel或高密度警示 |

Exact既有測試修改清單：`src/components/ProcessDutyBridge.test.tsx`、`src/components/ProcessPlanningWorkbench.test.tsx`、`src/components/ProcessPlanningCanvas.lifecycle.test.tsx`、`src/components/workspace/WorkspaceArchitecturePolicy.test.ts`及新增`src/components/OrgNode.relation-drag.test.tsx`。前三者補source／target parity、cleanup、readonly及keyboard regression；architecture policy固定`writeWorkspaceEntityDrag()`只可由共用binding呼叫、relation source components不得再持有raw native mouse binding、App仍是唯一commit owner，並禁止DEV-041 pure／component層出現新的payload-target pair switch／table。不得以synthetic component test冒充browser evidence。Employee／Duty directory的正式互動覆蓋由shared adapter tests、既有Process tests、OrgNode parity test與source policy共同承接；未追蹤`DirectoryDock.employee-drag.test.tsx`僅作supplemental observation，不列入required gate。

現有`src/components/DirectoryDock.employee-drag.test.tsx`在工作樹為未追蹤、來源未定檔案；DEV-041不得修改、刪除、暫存或依賴它作required gate。若檔案仍存在，可另行作supplemental observation，但正式Employee契約由shared adapter tests、既有Process tests、`OrgNode.relation-drag.test.tsx` parity test與source policy共同承接，不建立不存在的平行DirectoryDock required test。`src/App.tsx`、`src/components/DirectoryDock.tsx`及`src/index.css`已有其他未提交修改，實作與候選暫存都必須做hunk-level provenance分類。

### 15.3 明確維持不變

- `src/workspace/entityDrag.ts`與`src/workspace/entityDrag.test.ts`
- `src/workspace/relationPlacement.ts`與`src/workspace/relationPlacement.test.ts`（只復用，不為DEV-041新增平行狀態；若確需更動純型別或helper，先回PM更新impact）
- domain Commands、server routes、schema、migration、permission、package manifest與lockfile
- `scripts/dev039-s7-fixture.mjs`及其既有測試；DEV-041只以fresh instance重用，不複製fixture builder

## 16. 實作分片與遷移順序

1. `S0 Contract-red tests`：先建立純mapping、nested control、rAF lifecycle與architecture policy的失敗測試，凍結既有keyboard baseline與四個direction。
2. `S1 Pure interaction`：完成`relationDragInteraction.ts`與純測試；不接UI、不改mutation。
3. `S2 Shared adapters`：完成source／target factory及owner auto-pan hook；以fake DataTransfer、fake rAF及fake React Flow instance驗證cleanup、zoom保留與單frame合併。
4. `S3 Employee reference migration`：Directory Employee與Org Employee source、Position與employee-unassign target改共用接線；比較遷移前後Command結果、source selection／scroll及keyboard baseline。
5. `S4 Duty→Position migration`：Duty directory lane與card target遷移；移除custom ghost及被取代mouse handler，保留lane keyboard action。
6. `S5 ProcessNode↔Duty migration`：Process Canvas與ProcessDutyBridge雙向遷移，流程圖取得自己owner auto-pan；補齊四邊及跨canvas隔離測試。
7. `S6 Convergence`：App outcome lifecycle、shared CSS、ARIA／feedback、readonly／mobile fail-closed；source scan刪除被取代raw relation handlers與永久mouse handles。
8. `S7 Verification`：targeted、typecheck、full regression、build、fresh fixture normal-entry browser QA／QC、證據封存與文件收斂。

每個slice可獨立review與測試，但不得在S3～S5任一中間態候選交付；只有四個direction parity完成且舊mouse binding移除後才能進S7。失敗回復以逐slice revert DEV-041 hunk為主，不回退DEV-039 data或candidate commit，不執行破壞性Git命令。

## 17. Failure recovery 與 lifecycle

- nested interactive descendant或無strict payload：不begin／不prevent default，原click／focus照常。
- target `dragleave`：只在真正離開target root時清hover candidate；不取消placement、不清outcome，也不取消owner canvas rAF。游標移到同一canvas空白區後，auto-pan仍可繼續。
- owner canvas `dragleave`：只取消該owner pending rAF；session與其他canvas不受影響。
- dragend、Escape相容路徑、surface close、source／target unmount或capability loss：清candidate、所有owner pending rAF、outcome timer與source refs並回idle；未commit不得改revision。
- valid commit失敗：回idle、保留canonical舊資料與工作脈絡，發布錯誤notice；不得留下success target state。
- noop／rejected／stale：零Command、零history、零dirty、零autosave、零revision；短暫顯示resolver原因後回idle。
- browser重新整理或panel重開：只從canonical data重建；placement／outcome一律不還原。
- owner canvas消失時auto-pan hook cleanup必須可重入且idempotent；晚到的rAF callback不得操作unmounted instance。

## 18. QA／QC implementation matrix

### 18.1 Targeted automated command

```powershell
npx vitest run src/workspace/entityDrag.test.ts src/workspace/relationPlacement.test.ts src/workspace/relationDragInteraction.test.ts src/components/workspace/relationPlacementBindings.test.tsx src/components/workspace/useRelationCanvasAutoPan.test.tsx src/components/OrgNode.relation-drag.test.tsx src/components/ProcessDutyBridge.test.tsx src/components/ProcessPlanningWorkbench.test.tsx src/components/ProcessPlanningCanvas.lifecycle.test.tsx src/components/workspace/WorkspaceArchitecturePolicy.test.ts scripts/dev039-s7-fixture.test.ts
npx tsc --noEmit --pretty false
npm test -- --testTimeout=30000
npm run build
```

若repo script或測試路徑在實作前已被其他授權工作變更，RD須把實際命令、差異原因及完整輸出寫回本節，不能靜默跳過。測試必須斷言DOM state、resolver effect、callback次數及cleanup，不能只做snapshot。

### 18.2 FMEA／fail-seeking

| Failure mode | Detection | Required mitigation／evidence |
| --- | --- | --- |
| nested button啟動ancestor drag | pointer origin component test＋真實click/drag | common selector阻擋drag，原控制仍可操作 |
| source root選錯，主要文字區被interactive policy排除 | 五個exact roots逐一從文字座標做真實drag | button本身作root時不視為descendant；不得掛外層wrapper |
| 短按被promotion成placement | session/callback count | pointerdown不得begin；只有native dragstart建立session |
| pointer origin殘留到下一次gesture | pointerup／cancel／dragend fake event sequence | WeakMap在所有terminal event清除，下一次drag重新取樣 |
| DEV-041另建pair matrix與既有capability漂移 | architecture source scan | available只消費`resolveRelationPlacementCapability()`結果，不得新增pair switch/table |
| rejected hover因未preventDefault而收不到drop | component＋真實rejected release | strict registered target的dragover同步preview且preventDefault；drop零mutation並顯示原因 |
| wrong canvas或兩個canvas同時pan | fake instances＋雙panel browser record | owner-only instance；另一viewport完全不變 |
| rAF/listener在unmount後存活 | fake timers/unmount | pending frame取消、晚到callback no-op、無document永久listener |
| noop／rejected仍mutation | Command/API/revision counters | 四種counter皆為0並有可見原因 |
| capability/data變更後提交stale candidate | preview後改latest state/capability | drop重新resolve並fail closed |
| 所有targets高強度或只靠顏色 | DOM state＋visual sweep | 非hover只available；hover/outcome有文字或icon |
| 移除handle連帶刪除keyboard baseline | keyboard regression normal entry | 既有Enter／Space路徑仍走相同session／resolver |
| success重設scroll／selection／viewport | before/after browser record | source與owner viewport保持；只relation及短暫target outcome改變 |

### 18.3 Fresh fixture 與證據 provenance

- 重用`scripts/dev039-s7-fixture.mjs`的`prepare／inspect／cleanup`建立fresh、隔離版本；fixture只建立前置資料，不直接建立預期drop結果。
- Exact lifecycle command為`node scripts/dev039-s7-fixture.mjs prepare --origin http://127.0.0.1:5080`，取得輸出的fresh `versionId`後以`node scripts/dev039-s7-fixture.mjs inspect --origin http://127.0.0.1:5080 --version-id <versionId>`讀回，結束一律執行`node scripts/dev039-s7-fixture.mjs cleanup --origin http://127.0.0.1:5080 --version-id <versionId>`並以cleanup readback確認該版本狀態為`archived`。fixture cleanup是可恢復封存，不是刪除；不得以「版本不存在」作為成功條件。若task-owned runtime使用不同已記錄port，只替換同一origin，不改fixture語意。
- evidence namespace固定為`output/playwright/dev041/`；每次record含fixture ID、runtime owner、commit／worktree hash、viewport、source／target ID、strict MIME、event chain、`effectAllowed／dropEffect`、candidate／outcome、API status、revision before／after、canonical readback、history／dirty／autosave、canvas viewport／zoom、source selection／scroll、console與cleanup。
- normal entry固定由`/`及頂部「功能」開啟來源與target panel；不得以direct URL、component sandbox、synthetic event或API直寫代替真實HTML5滑鼠路徑。
- valid fresh paths至少：Employee directory→Position assign、Org Employee→Position move、Duty lane→Position、ProcessNode→Duty、ProcessDuty lane→ProcessNode。另取duplicate/noop、unsupported/rejected、nested control、surface close／unmount或capability loss、Organization與Process各四邊auto-pan及keyboard baseline。
- Desktop至少`1440×900`、`1024×768`；Readonly至少`1023×768`及`390×844`。QC要做重疊、截斷、水平溢出、幽靈高亮、殘留notice／overlay、console warning／error與資料sanity sweep。
- 若需task-owned runtime，預設可用`5080`但啟動前先確認free並記錄project、purpose、process tree、port及cleanup condition；完成後停止該process tree並確認port釋放。user-owned`localhost:5000`不得觸碰。

### 18.4 RD／QA／QC handoff

- RD：依S0～S7實作、維護allowlist、提交targeted／aggregate輸出與source scan；不得以自行操作畫面取代QC結論，也不得宣稱release。
- QA：在S0確認本文件的正常入口、四向矩陣、failure cases、fixture隔離、證據欄位與停止條件可驗；實作變更契約時先更新validation plan，不接受完成後補寫。
- QC：使用fresh fixture及正常入口獨立重演真實HTML5 mouse路徑，核對UI、API、revision、canonical readback、console及cleanup；證據不足只能標`Partial／Open`。
- PM：只依權威spec、QA計畫與QC證據更新`dev_task`狀態；RD自測通過不等於QA／QC Passed，candidate freeze與commit仍需使用者授權。

## 19. Git boundary 與 exact allowlist

DEV-041候選allowlist僅限第15.1、15.2列出的產品／測試檔，加上本spec、`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、DEV-039主spec／parity follow-on note及ADR-009 amendment。`output/playwright/dev041/**`為evidence，不預設進產品commit。

目前工作樹含DEV-037／040、auth、DB、backend、package、環境與其他未提交內容；全部排除。對`src/App.tsx`、`src/components/DirectoryDock.tsx`與`src/index.css`只能selective／hunk staging；未追蹤`src/components/DirectoryDock.employee-drag.test.tsx`明確排除。候選前須輸出`git diff --name-status`、`git diff --check`、allowlist manifest與staged diff provenance。allowlist是候選邊界，不是commit授權；commit、merge、deploy、release仍需使用者另行授權。

## 20. RD readiness gate

- 本次 RD Technical Lead review（2026-09-01）先以第一性原理檢查「拖曳失敗」的因果鏈：分散來源觸發與錯誤畫布 owner → 相同關係在不同面板產生不同 promotion／preview／auto-pan → 使用者無法預期操作，RD 被迫以局部 patch 疊加。最小修正是維持既有 domain authority，只共用 source／target binding 與 owner-canvas auto-pan；不新增 business state、pair matrix、API 或 drag library。文件亦已修正 automated gate 數量與 fixture cleanup 語意，避免證據與實際工具行為漂移。
- Review result：`Pass after contract optimization; P1 implementation correction closed`。shared boundary仍維持單一MIME／resolver／session／mutation owner；`effectAllowed`已由`relationEffectAllowedFor(payload)`統一推導，Duty source使用`all`以涵蓋Position的copy／move與ProcessNode的link，target仍由既有resolver投影`dropEffect`。第11.4節的全新 reverse-direction RD probe 已驗證 strict MIME、`all→link`、target default prevention、revision變更與canonical readback；該筆不取代四向 QA／QC aggregate。

- RD Technical Lead verdict：`Pass after contract optimization`。核心因果鏈為「分散raw binding與錯誤owner事件 → 同relation在不同surface產生不同觸發／回饋／pan → 使用者無法形成肌肉記憶且RD重複修補」；本contract以一個既有domain authority加三個薄互動責任切斷因果鏈，未建立第二商業模型。

| Review ID | 阻擋風險 | 最小修正 | 狀態 |
| --- | --- | --- | --- |
| `TL-1` | 新pair matrix與既有capability漂移 | available只消費既有resolver capability結果 | Closed |
| `TL-2` | 外層draggable＋內層主button使文字區不可拖 | 固定五個exact source roots，root本身不算interactive descendant | Closed |
| `TL-3` | preview return、preventDefault與event bubbling未定，造成錯誤dropEffect或無rejected drop | 統一callback aliases、同步preview及target／canvas事件所有權 | Closed |
| `TL-4` | target leave誤清canvas rAF、mouse focus被強制改變、input notice混用 | 分開target／owner／terminal cleanup，mouse與keyboard各自focus／notice | Closed |
| `TL-5` | required gate依賴未追蹤測試檔 | 新tracked parity test承接，未追蹤檔排除於gate／allowlist | Closed |
| `TL-6` | source adapter可省略`onBegin`，造成契約宣告可拖但runtime必然取消 | 將`onBegin`收斂為必要callback；ProcessNode缺callback時不輸出draggable，其他surface維持既有guard | Closed |
| `TL-7` | pointer origin位於factory closure，source props重建後可能遺失，造成原生drag promotion誤判 | 改為module-local `WeakMap<HTMLElement, EventTarget | null>`，並加入factory重建後仍保留origin的regression test | Closed |
| `TL-8` | spec將部分adapter callback誤述為一律required，造成實作／契約漂移 | 對齊實際TypeScript options；source的`onCancel`改為required，production writable target明確要求`onPreview`與`onCommit`，其他target presentation callback保留optional | Closed |
| `TL-9` | source缺少terminal cancel callback時，dragend可能遺留placement session | `onCancel`改為source adapter required option；所有production source缺callback時不輸出draggable，並以TypeScript／targeted tests鎖定 | Closed |
| `TL-10` | target被標成available但缺owner callback時，可能攔截native drop後靜默失敗 | target adapter以`available && onPreview && onCommit`重新計算可接收狀態；不滿足時不preventDefault、不設dropEffect並補fail-closed regression | Closed |
| `TL-11` | per-caller `effectAllowed` 漂移，Duty source的`copyMove`無法涵蓋ProcessNode target的`link` | 由shared adapter依payload kind統一推導：Employee=`copyMove`、Duty=`all`、ProcessNode=`link`；target仍由resolver決定實際`dropEffect` | Closed |

- Product decisions：`Complete through 13A`；current phase無待確認P0／P1產品決策。
- Architecture：`Ready`；新增三個薄層，唯一MIME／resolver／session／mutation owner維持不變，無新ADR需求；ADR-009 amendment已足夠。
- Spec governance：`Intentional Replacement / In sync`；只取代DEV-039永久mouse handle與分散raw mouse binding，DEV-039其他權威保持相容；主spec、parity、ADR-009、`dev_task`與`documentation_map`已同步。
- Data／API／permission／dependency／migration：`None`；不需要schema或資料migration。
- Repo impact／slice／recovery／test／fixture／evidence／Git boundary：`Specified`。
- Dirty overlap：`Known implementation hazard`，以hunk provenance處理，不阻擋RD開工；不得據此覆寫使用者變更。
- Technical debt：`No hidden debt accepted`；完整keyboard UX明確留在第13節future capsule，不以暫時mouse handle、第二pair table或雙binding墊檔。若Current Phase無法保留既有keyboard baseline，依停止條件退回PM。
- P0／P1 specification gap：`0`；implementation blocker：`0`（原 Duty lane→ProcessNode source effect capability mismatch 已由 shared policy correction 關閉）。
- Verdict：`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`。shared S0～S7 implementation、自動化 gate、四向 fresh native、兩個 owner canvas 四邊 auto-pan、zero-mutation revision guard、console sweep與fixture archive均已取得；使用者已接受noop／rejected在`dropEffect=none`時不要求Chromium派送terminal `drop`，並以terminal `dragend`、zero mutation、revision unchanged及session cleanup作為成功條件。產品程式與effect policy不變；未授權freeze、commit、merge、deploy或release。

## 21. 執行邊界與下一步

本輪已依第16節完成S0～S6與S7 automated implementation，並關閉第11.4節記錄的P1 effect capability blocker；修改僅落在第15節allowlist的產品、測試與文件檔；未修改schema、API、permission、dependency或fixture，不觸碰user-owned `localhost:5000`。四向 native、兩個 owner canvas 四邊 auto-pan、zero-mutation revision guard、console sweep及fixture cleanup aggregate已完成並索引於`output/playwright/dev041/F041-QA-QC-native-aggregate.json`。使用者已接受noop／rejected的Chromium原生行為，Browser native QA／QC=`Pass`；DEV-041已達`Candidate Freeze Ready / Authorization Pending`。下一步只有在取得明確授權後才能freeze或commit；merge、deploy與release仍各自受原有gate約束。若觸發第12節停止條件，回PM而非局部繞過。

## 22. 變更紀錄

- 2026-09-01：依引導決策 `1A～12A` 建立產品Brief。
- 2026-09-01：依 `13A` 升級為 `RD Contract Ready`；完成現行架構盤點、intentional replacement、共用元件責任、狀態／事件、相容、資料／API／權限、正常入口、驗收、QA／QC及停止條件。未進入實作。
- 2026-09-01：依使用者要求升級為`RD Implementation Ready`；以當下repo盤點exact module／file impact、共用adapter API、owner-canvas rAF、來源遷移與keyboard相容策略、S0～S7順序、failure recovery、targeted commands、fresh fixture／evidence、FMEA及dirty-worktree allowlist。P0／P1 spec gap=0；未進入產品實作。
- 2026-09-01：完成RD Technical Lead Review並直接優化contract：移除第二payload-target pair矩陣、固定五個exact draggable roots、補齊同步preview／drop冒泡與callback signatures、拆開target leave與owner-canvas lifecycle、區分mouse／keyboard notice及focus，並將未追蹤employee test移出required gate與allowlist。判定`Pass after contract optimization`。
- 2026-09-01：依本契約完成S0～S6及S7 automated implementation：新增純互動、headless source／target binding與owner auto-pan；完成Employee／Duty／ProcessNode四向surface migration、outcome lifecycle、shared CSS、keyboard compatibility與source policy；新增OrgNode parity test。targeted `11 files／48 tests`、full `170 files／689 tests（1 skipped）`、typecheck與build均通過；browser smoke確認正常入口 selectors及舊handle移除。狀態更新為`RD Implementation Complete / Automated Gate Passed / Browser Native Evidence Pending`，native DataTransfer QA／QC仍開放，未授權candidate freeze或commit。
- 2026-09-01：RD Technical Lead follow-up定位ProcessNode在React Flow內的native promotion阻斷：ancestor `mousedown`會在瀏覽器`dragstart`前攔截。未新增第二拖曳路徑，僅在共用source adapter加入明確的`stopMouseDownPropagation`選項並由ProcessNode root啟用；補shared adapter regression，保留其他surface事件流。targeted adapter／composition／policy tests、typecheck均通過；ProcessNode完整terminal drop與四向native evidence仍維持QA／QC open。
- 2026-09-01：以全新隔離fixture及system Chrome正常入口完成一條`ProcessNode→Duty` native RD probe；觀察到strict MIME、完整terminal event chain、`link` effect、revision變更及`process-duty-2` canonical readback，artifact=`output/playwright/dev041/F041-S7-PROC-DUT-native-rd-probe.json`。另將shared source adapter的`onBegin`收斂為必要callback，ProcessNode缺callback時fail-closed；targeted `11 files／49 tests`、full `170 files／690 tests（1 skipped）`、typecheck與build均通過。四向aggregate、failure cases、console與cleanup仍未由QA／QC獨立通過，狀態維持`RD Implementation Complete / Automated Gate Passed / Browser Native Evidence Pending`。
- 2026-09-01：RD Technical Lead review再收斂source／target lifecycle：將pointer origin移至module-local WeakMap，避免factory／React props重建造成gesture狀態遺失；將source `onCancel`收斂為required，缺callback時fail-closed；target若缺`onPreview`／`onCommit`則不宣告可接收、不preventDefault，並補factory重建／terminal cancel／target fail-closed regression tests；同步修正文檔callback契約。targeted `11 files／52 tests`、full regression `170 files／693 tests（1 skipped）`、typecheck與build均通過；現有console／Vite advisories列為baseline observation，仍由QA／QC分類，不升格為本DEV新阻擋項。
- 2026-09-01：RD Technical Lead final document audit：修正第11.4節過期的`51／692`測試數字為`52／693`，並將第18.3節fixture cleanup成功條件由「版本不存在」改為工具實際提供的`archived` readback；統一task-owned runtime示例使用`127.0.0.1:5080`。架構判定維持`Pass after contract optimization`，瀏覽器四向fresh evidence仍為唯一開放gate。
- 2026-09-01：依 fresh Chrome CUA 觀察補強 React Flow source 邊界：Organization employee row 同樣啟用 shared adapter 的 `stopMouseDownPropagation`（含pointer／mouse capture），避免與 ProcessNode 各自維護例外；targeted adapter／OrgNode tests與typecheck通過。Employee directory→Position及Organization keyboard→Position可讀回mutation；Organization native row→Position與Duty lane→Position在本次 CUA 未產生mutation，已封存`F041-QA-QC-partial-native-evidence.json`並維持`Browser Native Evidence Pending`，不得將partial observation視為QA／QC通過。
- 2026-09-01：RD Technical Lead console-noise closure：補上`OrgNode`員工映射的穩定`key={employee.id}`，不改變拖曳／資料契約；targeted DEV-041 component／adapter rerun `7 files／32 tests`通過，React key warning不再出現。Vite extension／bundle-size advisory與測試環境`act`提示仍列為baseline，native四向QA／QC gate不變。
- 2026-09-01：重跑既定 full regression，current worktree 結果為`171 files／695 tests passed，1 skipped`；因包含 supplemental／未追蹤測試，文件保留前一 required gate 數字作 provenance，並明確將本次 broad run標為 observation，不提升native QA／QC或candidate freeze狀態。
- 2026-09-01：第三次 fresh runner recheck 以 fixture `draft-1cb47aab-c736-49fd-bfcb-909d131b7114` 重演正常入口與可見 geometry；原生 CUA仍未提供可採用的完整 strict `DataTransfer` event chain，未產生API／revision變更。fixture以`archived` readback清理、`5080`釋放；依停止條件記為`blocked / not-run` provenance，不再重試同類runner，也不新增fallback或第二證據清冊。
- 2026-09-01：以全新 fixture `draft-46162633-cbd0-4c72-b543-9599da78ea6c`及system Chrome重測流程節點卡非互動區來源；確認strict `dragstart`／MIME／target `dragover`邊界，但未取得terminal `drop`或mutation，記為`blocked / not-run` runner provenance。fixture以`archived` readback清理、`5080`釋放；維持`Browser Native Evidence Pending`，不新增fallback或第二輸入路徑。
- 2026-09-01：以新 fixture `draft-dfa1b3a8-89d6-4be0-91e9-9966e51e7b75`確認流程節點→職掌測試目標為合法未連結職掌；system-Chrome runner於terminal事件輸出前逾時且cleanup前未見新增link，記為`blocked / not-run` target identity／runner provenance。fixture以`archived` readback清理、`5080`釋放；維持同一single-path設計與`Browser Native Evidence Pending`。
- 2026-09-02：以 browser-plugin CUA 及全新 fixture `draft-4c97fb76-bff9-44a2-b743-de86eeb0501d`確認 ProcessNode source／合法 Duty target 可見；drag transport call完成但未觀察到terminal `drop`／domain mutation，API readback未新增link，記為`blocked / not-run` runner provenance。fixture以`archived` readback清理、`5080`釋放；依停止條件不新增fallback、synthetic drop、第二resolver或第二證據清冊。
- 2026-09-02：Native Playwright recheck以全新 fixture `draft-5069a060-3786-40f6-874c-4e87434e6ba2`重演職掌抽屜 `duty-dev039-b16-primary／primary-execute` → 尚未連結 `process-node-dev039-b16-open`；source／target均為 shared binding，但真實事件止於 `dragstart→dragenter／dragover→dragleave→dragend`，API未新增link。source目前宣告 `effectAllowed=copyMove`，而 link target 由 resolver要求 `dropEffect=link`，集合不相容；登錄為可重現 P1 implementation blocker，先依第5.1節修正多目標 source effect capability，再重跑四向native QA／QC。fixture cleanup已取得`archived` readback（manifestRevision=`da8390e42a73d0e6944297e01930d16d2b500e5151200f77bc8dbfda800834c1`），`5080`已釋放；未授權freeze／commit。
- 2026-09-02：依 RD Technical Lead review 將`effectAllowed`集中由`relationEffectAllowedFor(payload)`推導（Employee=`copyMove`、Duty=`all`、ProcessNode=`link`），移除 caller 自行指定，並補 shared-adapter regression。全新 fixture `draft-2e844948-3bec-4d3e-a2eb-824c26453bdf` 的正常入口 reverse-direction RD probe 取得 strict MIME、`all→link`、target `preventDefault`、terminal `dragend`、revision變更與canonical `process-duty-2` readback；fixture以`archived` readback清理（manifestRevision=`cdb021ae3122fd708fda8aebbaea07ea96db5d910a97d428d928e740437a7a0b`），5080已釋放、5000未觸碰。P1 implementation blocker關閉；四向native／failure／auto-pan／console／cleanup QA／QC仍開放，未授權freeze／commit。
- 2026-09-02：RD Technical Lead follow-up將target admission收斂為`active && available && onPreview && onCommit`，避免inactive或缺owner callback的target攔截native drop；ProcessNode source補`data-relation-drag-handle="true"`以明確保留React Flow內native promotion。latest targeted `7 files／37 tests`、typecheck與build通過。全新 fixture `draft-da566d65-2b97-472c-9d42-abe4000b1cd5`的Duty lane→ProcessNode correction probe觀察到strict MIME、`effectAllowed=all`、`dropEffect=link`、target default prevention、terminal `drop` capture／`dragend`、revision變更與canonical `process-duty-2` readback；此筆仍只作RD probe，不升格四向QA／QC aggregate，fixture須以`archived` readback清理。
- 2026-09-02：完成 DEV-041 fresh browser aggregate：四向 `EMP-POS`／`DUT-POS`／`PROC-DUT`／`DUT-PROC` 各以獨立 fixture 及正常 system Chrome 入口通過 strict MIME、effect negotiation、terminal drop／dragend、revision change、canonical readback、console/pageerror sweep；Organization 與 Process owner canvas 四邊 auto-pan 亦確認 viewport translation 改變且 zoom 不變，取消不改 revision。`NOOP-EMP-POS`／`REJECT-PROC-POS` 確認 zero mutation 與 terminal dragend，但 Chromium 在 `dropEffect=none` 不發 terminal drop，列為 effect policy browser gap；aggregate=`output/playwright/dev041/F041-QA-QC-native-aggregate.json`。所有 fixture cleanup 均為 `archived`，5080 task-owned runtime已釋放，5000未觸碰。Browser native QA／QC維持`Partial / Open`，待 PM／產品決定 effect policy；未授權candidate freeze／commit／merge／deploy／release。
- 2026-09-02：使用者依RD Technical Lead建議接受Chromium在`dropEffect=none`時不派送terminal `drop`的原生行為；合法拖放仍要求terminal `drop`與恰好一次mutation，noop／rejected改以terminal `dragend`、zero mutation、revision unchanged、session cleanup及0 console/pageerror判定。aggregate增加`contractDecision`並將zero-mutation disposition更新為`pass`；產品程式、effect policy、MIME、resolver與mutation owner均未修改。DEV-041升級為`Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`，未授權freeze／commit／merge／deploy／release。
