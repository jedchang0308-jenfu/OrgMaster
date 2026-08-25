# DEV-030：異常職掌卡片精簡與點擊／長按互動 RD Implementation Contract

狀態：`RD Implementation Complete / QA-QC Passed`  
文件成熟度：`RD Implementation Complete`  
日期：2026-08-19  
來源：`USER-2026-08-19-DUTY-ANOMALY-CARD-CLICK-LONG-PRESS`、使用者要求「補到 RD 可實作」  
父任務：DEV-029  
權威範圍：DEV-030 Current Phase 的右側異常卡片視覺、工作執掌明細入口、Pointer 長按、矩陣 pointer drop bridge、可及性、驗收與檔案邊界  
執行邊界：可執行 S0–S5 本機 RD／QA／QC；不包含 deploy、release、production、資料 migration 或外部系統操作

## 2026-08-21 Current Contract Replacement（最高優先）

本節依 `USER-2026-08-21-UNIFIED-SAVE-FLOW` 取代本文所有關於 plan intent 暫存、plan V2、600ms plan autosave、preview／apply、plan CAS／receipt 與 atomic apply 的 Current Phase 契約；後續相關敘述只保留為歷史設計脈絡。

- 異常卡片長按放置與明細修復會立即提交 `COMMIT_DUTY_PLANNING_CHANGE`，直接更新目前 organization `currentState`。
- 異常頁、工作台與樹狀圖共用 Undo／Redo、單一 `isDirty`、500ms autosave、`Ctrl+S`、`DocumentMenu` 與 organization version CAS。
- 所有 viewport 依版本狀態採同一編輯權限；不再以 `<1024px` 額外切成唯讀。
- 不再顯示或執行「預覽並套用」「確認套用」「捨棄規劃草案」「待套用」或「已規劃」。

## 1. 問題與交付目標

DEV-029 已完成左右合併的責任配置工作台，但右側異常來源仍由「Duty 外層卡＋異常內層列＋拖曳把手＋設定按鈕」組成。重複入口增加視覺噪音，也縮小真正可命中的操作區。

DEV-030 將右側異常來源收斂為低噪音的單一卡片表面：職掌名稱與異常 Badge 同列，單擊開啟「工作執掌明細」（與矩陣職掌卡相同），長按後移動至矩陣。所有放置仍只建立 DEV-029 plan intent，正式資料仍由「預覽並套用」接管。

完成後必須同時成立：

- 畫面不存在左側嚴重度色條、拖曳把手、可見「設定」CTA或空白操作框。
- 單擊與長按使用同一視覺表面，但不會在同一次 pointer sequence 同時觸發。
- 多重異常仍以明確 anomaly ID 操作，系統不猜測或整批搬動整個 Duty。
- DEV-029 的 validator、plan V2、projector、autosave、preview、CAS、receipt與atomic apply完全不變。

## 2. Human Decisions 與工程決策

### 2.1 Human Confirmed

- 右側卡片改為參考圖左側的緊湊配置。
- 刪除紅線標示的左側操作區與可見「設定」入口。
- 滑鼠單擊卡片開啟工作執掌明細，行為與職掌矩陣中的職掌卡一致。
- 滑鼠長按卡片啟動移動。

### 2.2 固定工程決策

- 長按使用 Pointer Events，不嘗試在 pointerdown 後動態啟動原生 HTML5 drag。
- `DUTY_ANOMALY_LONG_PRESS_MS = 450`。
- `DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX = 6`；達長按門檻前超過容差即取消本次 gesture並抑制click。
- Current Phase 只讓滑鼠左鍵啟動長按；touch／pen不啟動寫入型長按，窄版仍唯讀。
- 鍵盤不模擬長按：`Enter`與`Space`都開啟同一工作執掌明細，`Escape`依既有明細層行為關閉並回復焦點；卡片不再提供目標職位配置 Popover。
- Pointer drag採 `requestAnimationFrame` 節流做 hover hit-test；pointerup 必須以當下座標、正式 state與最新plan intents同步重算，禁止提交cached candidate。
- Pointer drag ghost使用portal、`pointer-events: none`與`aria-hidden="true"`，不得干擾`document.elementFromPoint`。
- 不新增runtime dependency。

## 3. Spec Impact Preflight

分類：`Intentional replacement`。

DEV-030只取代DEV-029以下右側來源入口：

- 第6.3節 anomaly item 的可見handle／設定按鈕呈現。
- 第7.1節右側anomaly以native drag啟動的方式，以及矩陣relation卡原生拖曳的相容入口。
- 第13.4節handle accessible name與keyboard入口描述。
- 第14.2節右anomaly→左matrix流程的啟動操作。

以下保持權威且不可改寫：

- 一 Duty 一外層卡；多個 anomaly 必須明確分流。
- `DutyPlacementSource`、`evaluateDutyDrop`、`createDutyDropIntent`與同責任欄規則。
- 主執行固定move、非主執行move／copy、pending reassignment repair與「不再指派」。
- plan V2、V1 lazy migration、projector、600ms autosave、plan／version CAS、receipt、idempotency、journal recovery與atomic apply。
- `>=1024 CSS px`可編輯、`<1024 CSS px`唯讀。

DEV-029 的完成證據不回寫；本文件是後續互動入口的權威來源。ADR-006不需修訂，因資料權威、schema與transaction未改變。ADR not needed。

## 4. Scope／Out of Scope

### 4.1 Current Scope

- `/duty-planning`右側`DutyAnomalyPanel`卡片視覺與操作入口。
- 頁首不再提供頁面切換導覽入口；`/duty-planning/matrix`與`/duty-planning/anomalies`兩個完整明細頁仍保留直接 URL。
- 2026-08-19後續修訂：新增單一`DutyCard` identity surface，供異常佇列、矩陣、完整異常頁與職位側欄共用；placement／drag行為由容器注入。
- 單擊開啟既有工作執掌明細，沿用矩陣職掌卡的`onSelectDuty`入口。
- 矩陣可編輯relation卡與異常卡共用450ms Pointer長按拖曳入口。
- 長按、pointer capture、drag ghost、矩陣hit-test、candidate highlighting與release revalidation。
- `pending-reassignment`與其他異常均由工作執掌明細查看；卡片不再提供「配置」按鈕、目標職位選擇或其專用 Popover。非主執行關係完成長按放置後，仍可使用既有 move／copy 決策 Popover。
- 多重異常的明確手勢區、planned／readonly靜態狀態、鍵盤與焦點恢復。
- 對應pure state tests、presentation regression、full tests、build與browser QC。

### 4.2 Out of Scope

- 左側矩陣的責任欄位限制與點擊明細語意；只替換其card renderer與拖曳入口。卡片級目標職位配置入口與 Popover 已由本次修訂移除。
- `/duty-planning/anomalies`修復表格資訊架構；只替換職掌欄card renderer並接回既有明細。
- touch／pen長按寫入、手機編輯、edge auto-scroll、多選或批次拖曳。
- Duty／relation／plan schema、API、server store、organization V6或runtime data。
- 送審、核准、權限、登入principal、版本ACL、跨裝置、lease／接手。
- deploy、release、production smoke與release rollback artifact。

## 5. Architecture Impact

變更只位於client presentation與ephemeral interaction state。正式domain與server contract不受影響，因此：

- 不新增migration、API route、storage key、environment variable或provider能力。
- 不在`OrgDirectoryState`、`DutyPlanIntent`或V6 document保存press／drag狀態。
- Pointer session只存在React memory／refs；reload、route change或component unmount後直接歸零。
- 唯一業務驗證仍是`evaluateDutyDrop`；Pointer hit-test只找候選，不得複製合法性規則。
- 唯一正式異動入口仍是既有plan staging與apply transaction。

## 6. 視覺與DOM契約

### 6.1 單一異常

單一異常的Duty以一個完整button surface呈現；常態不畫卡片外框，改由清單分隔線建立層級：

```text
治具設計與發包   [無執行職位]
────────────────────────────────
```

- 名稱與Badge同列；空間不足時Badge可換行，名稱不得被裁切成不可辨識。
- surface本身是click／long-press owner，不再包含巢狀button。
- `aria-label`至少包含Duty title、anomaly label與「開啟工作執掌明細」語意；長按移動提示可放`aria-description`或`title`，不得新增逐卡可見教學句。

### 6.2 多重異常

- 同一Duty仍只有一個`.duty-anomaly-card`外層，Duty title只出現一次。
- 每個anomaly渲染一個`.duty-anomaly-card__issue` button，並以anomaly ID作key與source。
- 每個issue surface可單擊／長按；不得讓整個Duty外層一次搬動所有異常。
- item已規劃或唯讀時仍可用button開啟明細，但不得掛載pointer寫入手勢或提供grab暗示。

### 6.3 刪除與保留

必須刪除或停止渲染：

- `.duty-anomaly-item__handle`與`⋮⋮`文字。
- `.duty-anomaly-item--high／medium／reminder`的左側inset severity rail。
- 卡片內可見`設定`button、空白action frame及其responsive grid補丁。

必須保留：

- `.duty-anomaly`文字Badge及高／中／提醒的非僅顏色語意。
- 待處理／已規劃分區、已規劃disclosure與distinct Duty count。
- `不再指派`功能，但移到Popover secondary action。

### 6.4 扁平化區塊層級

- 工作台左右外框、矩陣外框、異常群組外框與常態職掌卡片外框均不渲染；左右主區只由一條垂直分隔線區分。
- 矩陣列、同一責任欄內多筆職掌、待處理／已規劃群組與異常項目只使用水平分隔線，不以圓角容器套疊。
- 表單控制項、按鈕、異常Badge及狀態Badge仍保留自身邊界，避免失去操作或狀態辨識。
- hover可使用輕微底色；focus ring、pressed、picked-up、drop candidate與move source等暫態互動狀態仍須清楚且不可只靠顏色。
- 窄版堆疊時，左右垂直分隔線改為上下水平分隔線；不得產生document水平溢出。
- 矩陣採密集Y軸排版：欄名表頭維持7px上下留白，資料列縮至4px上下留白，矩陣內compact DutyCard最小高度24px；同一責任欄的相鄰執掌間距為0且不畫分隔線。不得縮小既有文字尺寸、裁切職掌名稱或改變右側異常佇列密度。

### 6.5 穩定狀態

| UI state | class／attribute | 可見要求 |
| --- | --- | --- |
| idle | default | 中性底色、單一邊框 |
| hover | `:hover` | 輕微邊框／陰影提升，不改尺寸 |
| focus | `:focus-visible` | 2px以上外框，不能被panel裁切 |
| pressing | `.is-pressing` | 漸進外框或輕微浮起，尚無drop target |
| picked-up | `.is-picked-up` | 來源保留、ghost出現、cursor為grabbing |
| candidate | matrix `.is-drop-candidate` | 比一般valid target更明確且非僅顏色 |
| planned／readonly | `.is-planned`／`.is-readonly` | 無pointer寫入暗示、無grab cursor |

## 7. Pointer State Machine Contract

### 7.1 Pure module

新增`src/dutyAnomalyPressInteraction.ts`，至少輸出：

```ts
export const DUTY_ANOMALY_LONG_PRESS_MS = 450
export const DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX = 6

export type DutyAnomalyPressPhase = 'idle' | 'pressing' | 'picked-up' | 'cancelled'

export interface DutyAnomalyPressState {
  phase: DutyAnomalyPressPhase
  anomalyId: string | null
  pointerId: number | null
  origin: { x: number; y: number } | null
  latest: { x: number; y: number } | null
  startedAt: number | null
}

export function createDutyAnomalyPressState(): DutyAnomalyPressState
export function startDutyAnomalyPress(...): DutyAnomalyPressState
export function updateDutyAnomalyPress(...): DutyAnomalyPressState
export function canActivateDutyAnomalyLongPress(...): boolean
export function activateDutyAnomalyLongPress(...): DutyAnomalyPressState
export function cancelDutyAnomalyPress(...): DutyAnomalyPressState
export function resetDutyAnomalyPress(): DutyAnomalyPressState
```

允許調整參數形狀，但constants、phases、threshold semantics與pure-testability不得改變。module不得import React、DOM或業務validator。

### 7.2 Transition matrix

| Current | Event | Guard | Next | Side effect |
| --- | --- | --- | --- | --- |
| idle | primary mouse pointerdown | editable、pending | pressing | 記錄source／pointer／origin／time並setPointerCapture |
| pressing | pointermove | 距origin `>6px`且未達450ms | cancelled | 清timer、抑制click |
| pressing | timer | elapsed `>=450ms`且距離`<=6px` | picked-up | 建立workbench pointer drag session |
| pressing | pointerup | 未取消且未達門檻 | idle | 允許隨後click開工作執掌明細 |
| picked-up | pointermove | same pointer | picked-up | 更新ghost與rAF candidate |
| picked-up | pointerup | same pointer | idle | 同步hit-test＋validator；stage或取消，抑制click |
| any active | pointercancel／lost capture／Escape／unmount | none | idle | 清timer、rAF、candidate、ghost、dragSource |
| cancelled | pointerup | same pointer | idle | 零變更且抑制click |

非primary button、touch／pen、planned item、readonly viewport、已有完整intent或Popover已接管時，不得進入pressing。

### 7.3 Click suppression

- `suppressNextClickRef`只在提前移動取消或picked-up後設為true。
- 對應的下一個pointer-generated click只清旗標並return；不得開啟明細以外的配置流程。
- 正常短按不設旗標，讓native button click開工作執掌明細。
- `event.detail === 0`的keyboard click不得被過期pointer旗標吞掉；取消／unmount時清理旗標。

## 8. Workbench Pointer Drag 與 Matrix Bridge

### 8.1 單一drag session

`DutyPlanningWorkbench`把現行`dragSource`收斂為單一session union：

```ts
type DutyWorkbenchDragSession =
  | { mode: 'native'; source: DutyPlacementSource }
  | {
      mode: 'pointer'
      source: Extract<DutyPlacementSource, { kind: 'anomaly' }>
      pointerId: number
      sourceAnchor: HTMLElement
      latest: { x: number; y: number }
      candidate: { target: DutyPlacementTarget; anchor: HTMLElement } | null
    }
  | null
```

`DutyMatrixView`接收的`dragSource`由`session?.source ?? null`衍生。不得同時維護另一份pointer drag source真相。

### 8.2 Matrix cell bridge

每個責任cell加入：

- `data-duty-drop-cell="true"`
- `data-position-id={position.id}`
- `data-responsibility-column={column.id}`
- candidate相符時`.is-drop-candidate`

Pointer move以`document.elementFromPoint(clientX, clientY)`取得最近的`[data-duty-drop-cell]`，讀取三個可見`data-matrix-column`之一，再由目前`DutyPlacementSource`還原五個精確責任lane之一，組成`DutyPlacementTarget`後呼叫既有`evaluateDutyDrop`。解析失敗、可見欄與來源精確lane不相容、target rejected或source stale時candidate為null。

### 8.3 rAF 與 release revalidation

- 每個animation frame最多一次hover hit-test；pointermove只更新latest point並排程rAF。
- ghost必須`pointer-events:none`，不影響hit-test。
- pointerup不得使用上一次candidate直接stage；必須以release座標重新`elementFromPoint`，再對current `state`與current `plan.intents`執行`evaluateDutyDrop`。
- release結果為`stage`才呼叫既有`handleDrop`／`createDutyDropIntent`；`reject`或null為零變更。
- anomaly source不會回傳`choose-move-copy`；若出現此結果視為contract drift並取消，不得猜測。

### 8.4 Relation card與共用Pointer surface

左矩陣relation card與右側anomaly card共用`DutyCardDragSurface`的單擊／長按狀態控制；矩陣卡與異常卡均以450ms Pointer長按啟動移動，不依賴原生HTML5 drag的啟動時機。兩種來源只由`DutyPlacementSource`區分，release一律重新執行同一validator；relation非主執行放置仍可進入既有move／copy chooser，anomaly source不得猜測該分流。

## 9. 明細入口與拖曳後決策 Popover Ownership

- 單擊任何 anomaly surface呼叫既有`onSelectDuty(duty.id)`，開啟與矩陣職掌卡相同的工作執掌明細；不再由 anomaly surface 開啟配置 Popover。
- 矩陣與異常卡片不再渲染或呼叫卡片級「配置」入口、目標職位選擇或`openPlacementMenu`。
- `DutyMoveCopyPopover`只保留非主執行關係長按放置後的`移動`／`複製`決策；它不是一般卡片設定入口，也不承擔目標職位挑選。
- `pending-reassignment`與缺口修復仍由中央異常明細頁的既有表格控制處理；本次卡片短按不觸發修復 Popover。
- 決策 Popover開啟時取消任何press／drag session；卡片不得同時保持picked-up。
- Popover以`role="dialog"`、可辨識label與initial focus接管；`Escape`或pointerdown outside取消，Tab／Shift+Tab留在popover可互動控制內。
- 關閉時若anchor仍`isConnected`則focus anchor；若stage後anchor移至planned／卸載，focus回到同Duty新位置、已規劃disclosure或異常panel heading，依可用順序選第一個。
- Move／Copy決策只在放置 validator 判定需要時出現；不顯示目標職位選擇欄位或空白目標提示。

## 10. Readonly、Planned 與多重異常

- `canEdit === false`、`itemPlanned === true`或viewport `<1024`時不掛pointerdown／long-press timer／drag callbacks。
- 唯讀與planned surface不得使用`cursor: pointer／grab`、`tabIndex=0`或會寫入的accessible action name。
- 矩陣`move-source`仍是來源位置的靜態投影；已是`pending-target`的主執行卡可再次拖曳以替換同一來源的既有plan intent，拖回原來源位置則明確移除該intent。非主執行複製產生的pending target維持靜態，避免在move／copy決策完成前猜測第二個來源。
- 一Duty多anomaly時，`groupDutyPlanningItems`仍是唯一group authority；view不得自行derive第二份planned規則。
- 每個 anomaly button都使用自身anomaly ID；長按與drop intent不得讀取「第一個異常」或severity排序作隱含來源，短按明細則以Duty ID開啟共用工作執掌明細。
- 一項規劃完成而同Duty仍有其他pending時，外層卡留在待處理區；僅對已規劃issue呈現靜態狀態。

## 11. Failure Recovery

| Failure／cancel | Required recovery |
| --- | --- |
| pointer在450ms前移動超過6px | 取消timer、抑制click、零plan變更 |
| 長按後未移到矩陣就放開 | 清session／ghost／candidate，零變更 |
| 無效cell或空白放開 | release validator拒絕，零變更 |
| source／target／plan在gesture期間變更 | release revalidation拒絕stale結果 |
| pointercancel／lost capture／window blur／Escape | 清timer、rAF、capture、session、candidate與ghost |
| component unmount／route change／panel collapse | cleanup全部ephemeral state，不保存gesture |
| 決策 Popover取消／外部點擊 | 零變更並回復來源或fallback focus |
| move／copy決策完成後來源移區 | 關閉Popover，focus到可解釋的fallback位置 |
| runtime exception | 不得留下`dragSource`或遮罩；顯示既有可恢復錯誤，不顯示raw stack／API route |

所有no-op／cancel路徑不得觸發plan autosave、dirty count、success toast或正式Undo。

## 12. RD File Boundary

目前workspace `C:\VIBE CODING\OrgMaster`沒有`.git` metadata；以本節allowlist作為實作邊界。不得清理或覆寫其他既有修改。

### 12.1 Required new files

| File | Responsibility |
| --- | --- |
| `src/dutyAnomalyPressInteraction.ts` | pure constants、state與transition helpers |
| `src/dutyAnomalyPressInteraction.test.ts` | threshold、movement、activation、cancel與reset tests |
| `src/components/DutyAnomalyCard.tsx` | single／multi anomaly card、pointer capture、click suppression與accessible surface |
| `src/components/DutyAnomalyDragPreview.tsx` | portal ghost；pointer-events none、aria-hidden與fixed geometry |
| `src/components/DutyCard.tsx` | 共用Duty identity surface；集中title、badge、status、density、tone與button semantics，不持有placement規則 |
| `src/components/DutyCardDragSurface.tsx` | 共用桌面 Pointer 長按／拖曳 surface；注入來源、編輯權限與單擊明細，不持有drop規則 |
| `src/components/DutyCardDragPreview.tsx` | 共用Pointer拖曳 ghost；以來源職掌與責任／異常標籤呈現，不持有placement決策 |

### 12.2 Required modified files

| File | Responsibility |
| --- | --- |
| `src/components/DutyAnomalyPanel.tsx` | 以DutyAnomalyCard取代handle／button列；提供group、dropPending與callbacks |
| `src/components/DutyPlanningWorkbench.tsx` | session union、pointer hit-test、rAF candidate、release revalidation、Popover ownership |
| `src/components/DutyMatrixView.tsx` | drop cell data attributes、pointer candidate class；保留native relation drop |
| `src/components/DutyPlanningView.tsx` | 完整異常頁以共用DutyCard顯示職掌並開啟同一明細 |
| `src/components/DutyCenter.tsx` | 將完整異常頁卡片selection接回既有DutyDetailDrawer |
| `src/components/PositionDutySection.tsx` | 職位側欄關係清單改用共用DutyCard compact density |
| `src/components/DutyMoveCopyPopover.tsx` | 拖曳後 move／copy 決策、outside cancel、focus containment與safe focus return；不含目標職位設定 |
| `src/index.css` | card states、ghost、candidate、移除obsolete handle／rail／action-row selectors及responsive補丁 |
| `src/dutyPlanningPresentation.test.ts` | multi-anomaly／mixed planned regression，確保一Duty一group |

### 12.3 Explicitly forbidden unless PM re-entry

- `src/dutyPlanning.ts`、`src/dutyPlacement.ts`、`src/types.ts`。
- `server/`、`data/`、`vite.config.*`、`package.json`或lockfile。
- DEV-020 comparison、DEV-027 governance、organization document schema或任何migration。

若實作發現必須修改forbidden file，先停止並回PM做impact review；不得用UI需求順帶改domain。

## 13. Delivery Slices

### S0 — Baseline／failing tests

- 確認required files存在、forbidden files未被需求觸及。
- 重跑latest baseline：`npm test -- --run`、`npm run build`。
- 先建立press pure tests，確認未實作前有預期失敗。

Gate：baseline若出現非DEV-029既知warning以外的失敗，停止；不得把baseline failure歸因於DEV-030後繼續。

### S1 — Pure gesture state

- 完成constants、pure state transitions與tests。
- 覆蓋449／450ms邊界、6／6.01px邊界、wrong pointer、cancel與reset。

Gate：pure tests通過且module無React／DOM／validator import。

### S2 — Card visual／click detail

- 建立DutyAnomalyCard，完成single／multi／planned／readonly markup。
- 刪除handle、rail、設定CTA與空白action frame。
- 單擊／Enter／Space開工作執掌明細；卡片不提供配置 Popover。

Gate：DOM不存在舊handle與卡片內設定CTA；短按前後plan intents不變。

### S3 — Pointer drag bridge

- 完成450ms activation、pointer capture、session union、ghost、rAF hit-test、matrix data attributes與release revalidation。
- relation與anomaly共用Pointer長按與chooser，所有來源沿用同一release validator。

Gate：有效anomaly drop stage；空白／invalid／stale／cancel零變更；long-press後不觸發click。

### S4 — Accessibility／recovery／responsive

- 完成Popover action ownership、focus containment／return、Escape、outside click、panel collapse／route cleanup。
- 驗證planned／readonly／narrow無write gesture。

Gate：keyboard明細入口可完成，主要cancel paths無stuck session或ghost；DOM不存在卡片配置入口與目標職位設定欄位。

### S5 — Regression／QC

- 執行targeted tests、full test與build。
- 完成五viewport browser QC、visible-error sweep、information-noise sweep與action ownership sweep。
- Spec Drift／Convergence判定必須為`In sync`才能標完成。

## 14. Automated Test Contract

### 14.1 Pure gesture tests

`src/dutyAnomalyPressInteraction.test.ts`至少覆蓋：

- 449ms不可activate，450ms可activate。
- 6px仍在容差，`>6px`於activate前cancel。
- wrong pointerId不更新／不release。
- picked-up後pointermove更新latest。
- pointercancel／Escape／reset回idle並清source。
- cancelled與picked-up都要求抑制下一個pointer click；正常短按不抑制。

### 14.2 Existing contract regression

- `src/dutyPlacement.test.ts`：anomaly有效／無效欄、stale、duplicate／conflict保持通過。
- `src/dutyPlanningPresentation.test.ts`：同Duty多anomaly只一group、個別planned狀態與整組status正確。
- DEV-029 full plan／API／store tests全部保持通過。

### 14.3 Commands

```powershell
npm test -- --run src/dutyAnomalyPressInteraction.test.ts src/dutyPlacement.test.ts src/dutyPlanningPresentation.test.ts
npm test -- --run
npm run build
```

目前沒有lint script，不得虛構lint evidence。Vite native config loader extension warning與bundle chunk size warning若與DEV-029 baseline相同可記為既知非阻擋；新增warning需判定來源。

## 15. Browser QC Contract

固定route：`http://localhost:5000/duty-planning`。回歸route：`/duty-planning/matrix`、`/duty-planning/anomalies`。

固定viewport：

- `1440×900`
- `1279×800`
- `1024×768`
- `1023×768`
- `390×844`

必測流程：

1. 單一異常卡顯示title＋Badge，舊handle／left rail／card-level設定CTA均不存在。
2. 短按開啟工作執掌明細；開啟前後plan count不變。
3. 按住449ms放開走短按並開啟明細；按住至少450ms後不移動放開為取消，且不開任何卡片配置 Popover。
4. 450ms後移至有效cell，候選高亮、ghost可見、放開後stage正確intent且不再開啟明細。
5. 提前移動超過6px、空白放開、無效cell、Escape、pointercancel與panel collapse都零變更且無stuck ghost。
6. 多重異常同Duty只一外層卡，選定的anomaly ID與stage intent一致。
7. `pending-reassignment`可由Popover執行「不再指派」；其他anomaly不顯示該動作。
8. Enter／Space開啟工作執掌明細、Tab循環、Escape依明細層關閉、focus回來源或fallback。
9. 左矩陣relation card可單擊開明細、長按顯示picked-up／ghost並移動到同責任欄；move／copy chooser、preview／discard與apply gate無回歸。
10. 1023與390為唯讀，無可成功寫入的pointer／keyboard gesture。
11. 頁首不顯示頁面切換導覽列或多餘佔位區；直接開啟兩個完整 URL 時，內容與既有頁面一致且無可見錯誤。

每個viewport記錄：URL、尺寸、時間、測試資料、plan count前後、DOM噪音掃描、console error、failed network、可見`.inline-error／[role=alert]`、overflow與截圖路徑。Evidence放在`output/playwright/dev-030/`。

本次實作證據：

- 定向測試：3 files／12 tests 通過；完整測試：39 files／207 tests 通過。
- `npm run build` 通過（既有 Vite native extension 與 bundle size warning，未新增且不阻擋）。
- localhost:5000 真實瀏覽器驗證：1440px 完成異常卡單擊開啟工作執掌明細、450ms 長按、矩陣候選高亮、ghost、有效放置與 plan count 還原；1279／1024／1023／390px 完成版面、唯讀邊界、overflow、visible error 與 console/network sweep。
- 證據截圖：`output/playwright/dev-030/wide-1440.png`、`medium-1279.png`、`desktop-boundary-1024.png`、`readonly-boundary-1023.png`、`readonly-mobile-390.png`、`readonly-1440.png`、`anomaly-click-duty-detail.png`。
- 使用既有 OrgMaster localhost:5000（PID 42456，非本任務建立，未停止）；本次未留下新的暫時 runtime。測試用 plan intent 已以 API 還原為原始 4 筆。

## 16. Stop Conditions

任一條件成立立即停止並回PM：

- 單擊與長按無法在Chrome穩定互斥，或long-press後仍會觸發配置click。
- Pointer release無法以current state／plan做final validation，只能信任cached candidate。
- Custom pointer path破壞左矩陣relation長按或move／copy chooser。
- 多重異常必須由系統猜測、整Duty搬移或改變DEV-029 `HD-029-03`才能完成。
- Planned／readonly／`<1024`仍存在成功寫入路徑。
- 需要修改Duty／plan schema、API、server、runtime dependency或forbidden file。
- 需要touch editing、edge auto-scroll或full anomalies detail redesign才能完成主要驗收。
- 任一required test／build失敗、主要viewport不可操作、Popover focus無法恢復，或畫面出現runtime-visible error。

## 17. RD Readiness Gate

- P0／P1產品決策：無未決。多重異常沿用DEV-029個別anomaly source，不視為新產品選項。
- Repo／module／file impact：第12節已固定。
- State machine／event race／release revalidation：第7、8節已固定。
- Data／API／permission／migration：不受影響，禁止修改。
- Failure recovery：第11節已固定。
- QA／QC／evidence／stop conditions：第14–16節已固定。
- Runtime／release feasibility：無新dependency、env、migration或hosting能力；本文件不是Release Ready，未產生deploy／rollback artifact。
- Readiness：`RD Implementation Complete / QA-QC Passed`。本地產品實作、定向／完整測試、build與瀏覽器QC已完成；未執行deploy或release，Human Confirmed仍待使用者確認。

## 18. Deferred Scope Audit

以下不影響Current Phase正確性，保持Out of Scope，不新增future contract：touch／pen寫入、edge auto-scroll、多選與批次拖曳。2026-08-19後續修訂已將異常佇列與矩陣關係卡共用同一Pointer長按／拖曳 surface；兩者仍依來源型別沿用既有placement語意與validator。

## 19. 變更紀錄

- 2026-08-19：依使用者後續指示新增共用`DutyCard`，以異常佇列的緊湊卡片為視覺與semantic authority；`DutyAnomalyCard`、`DutyMatrixView`、`DutyPlanningView`與`PositionDutySection`共用同一identity surface，各容器只注入Pointer長按、唯讀或導覽行為。完整異常頁卡片單擊亦開啟同一`DutyDetailDrawer`。完整39 files／207 tests、build、localhost:5000工作台／完整異常browser QC與console error sweep通過，未deploy／release。
- 2026-08-19：完成 DEV-030 S1–S5：新增純手勢狀態模組與測試、單一卡片／多異常呈現、單擊工作執掌明細、Pointer 長按拖放 bridge、ghost、rAF hit-test、release revalidation、拖曳後決策 Popover focus recovery、readonly／responsive gate與回歸測試；39 files／207 tests、build與五viewport browser QC通過，未deploy／release。
- 2026-08-19：依使用者後續指示，將異常卡片單擊入口改為與職掌矩陣一致的`onSelectDuty`工作執掌明細；保留長按移動，並讓planned／readonly異常也可點擊查看明細。完成 localhost:5000 snapshot驗證，未deploy／release。
- 2026-08-19：依使用者指示移除卡片級「配置」入口、目標職位選擇與其 Popover／專用樣式；保留卡片明細、Pointer 長按拖曳，以及非主執行放置後必要的 move／copy 決策 Popover，未改資料模型或套用邊界。
- 2026-08-19：依使用者後續指示補上工作執掌明細 Escape 關閉；關閉後回復原觸發卡片焦點，完成瀏覽器鍵盤驗證，未deploy／release。
- 2026-08-19：依使用者後續指示開放職掌矩陣卡片拖曳；矩陣關係卡與異常卡共用`DutyCardDragSurface`及`DutyCardDragPreview`，統一Pointer長按、非主執行move／copy chooser與同一release validator；補上矩陣pressed／picked-up視覺回饋，未改資料模型、API或套用邊界。
- 2026-08-20：依使用者指示移除頁首「完整職掌矩陣」與「完整異常」兩個導覽入口；保留`/duty-planning/matrix`與`/duty-planning/anomalies`直接 URL 及既有明細內容，未改工作台資料或規劃流程。
- 2026-08-20：依使用者後續版面指示，連同頁首剩餘的「責任配置工作台」導覽按鈕與其佔位列一併移除；頁首改為品牌、工具列與返回操作的單行排列，完整明細頁仍保留直接 URL。
- 2026-08-20：依版面比對結果，矩陣搜尋與部門篩選固定收斂在左側矩陣標題列；移除編輯狀態下仍會出現的「新增工作執掌」入口，避免頁首／矩陣工具列出現額外操作區塊。
- 2026-08-20：依最新左右圖方向校正版面：搜尋／部門篩選移至頁首，矩陣區移除標題工具列；刪除黃色唯讀提示與「職掌矩陣」標題佔位區，編輯模式的「新增工作執掌」入口改由頁首工具列承載。
- 2026-08-20：依使用者要求將工作台改為線性分區：移除左右主區、矩陣、異常群組及常態職掌卡片的外框／圓角／常駐底色，以單一主分欄線與水平列線分隔；保留表單控制、Badge、focus、pressed、picked-up與drop candidate等必要操作狀態。此為視覺契約的 intentional replacement，不改資料、API、規劃或套用流程；39 files／209 tests、build、1440×900／1024×768／390×844 browser QC與console error sweep通過。
- 2026-08-20：依使用者要求提高矩陣Y軸資訊密度；只縮減矩陣表頭／資料列上下留白與compact DutyCard高度，不縮小文字或壓縮右側異常佇列。1280×720實測平均列高由42.9px降至30.4px、同畫面完整可見列由15增至22；1024×768／390×844無document水平溢出、職掌文字裁切或可見錯誤；39 files／209 tests與build通過。
- 2026-08-20：依使用者後續要求再縮減同欄執掌間距；compact DutyCard最小高度由26px降至24px，相鄰卡片gap固定為0並移除中間分隔線。雙執掌列實測由61.6px降至56.8px，保留24px操作高度，無文字裁切、水平溢出、可見錯誤或console error；39 files／209 tests與build通過。
- 2026-08-19：依使用者回報「仍然無法拖曳」追查出原生HTML5 drag與按鈕／Pointer事件的啟動競爭，改為矩陣與異常卡統一450ms Pointer長按拖曳；同時修正待套用關係來源映射、可替換同一來源intent與拖回原位撤銷，完整保留validator與草案安全邊界。
- 2026-08-19：建立`RD Implementation Ready`契約；固定單一卡片視覺、450ms／6px Pointer state、click suppression、rAF hit-test、release revalidation、Popover secondary action、keyboard等價路徑、檔案allowlist、S0–S5與QA／QC gate。本輪未修改產品程式、runtime data、deploy或release。
