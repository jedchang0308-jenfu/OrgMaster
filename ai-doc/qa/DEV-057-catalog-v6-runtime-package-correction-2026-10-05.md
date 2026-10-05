# DEV-057 active v6 最終映像包裝矯正（2026-10-05）

本批屬既有 ORGMASTER/DEV-057#identity-grants，來源 AIPDM/DEV-121#system-admin-capabilities／JENFU/DEV-015。狀態：本機 package regression 已修正；required CI、修正版 owner release 與 v6 正式治理／畫面驗收待完成。不得以 AI-PDM 已 RELEASED 推定共同 L4 完成。

## 實際失敗與共同因果

AI-PDM protected source 90b0d1dc0ba6f832d984938d2acbffb989c70e52 的 DEV121-ADMIN-V6-20261005-R3／run 37315626649 已 RELEASED，081 ledger31，正式 ai-pdm-prod-f227b5cbefc8 100%／零 tags。Jed 的 real-provider refresh→Platform session→兩系統 native SSO 已核對相同 exact Principal。

第一次追加治理 probe 使用錯誤 /api/governance 前綴，2026-10-05T13:37:56.244684Z 為404，是驗證器缺陷；修正到實際 /api/orgmaster/governance 後，2026-10-05T13:43:11.638823Z 的 /session 為500，事件 GOVERNANCE_READ_FAILED，是另一項產品包裝缺口。兩次原始 FAIL 均保留，沒有原樣重跑或重綁員工。

正式 OrgMaster source cfdc683d5ec14deb3441b513a1c54b318b1bd766／revision orgmaster-prod-42c2e2cc2f93 的最終 runner Dockerfile 只 COPY v5。正常 PG reader 從 active version 選取 independently validated source JSON；v6 發布後需要 config/catalogs/ai-pdm-role-catalog.v6.json。缺檔的 EXTERNAL_CATALOG_UNAVAILABLE 經 registry／治理 store 包裝為 GOVERNANCE_READ_FAILED。日誌證明當次500與泛化碼，沒有直接提供 ENOENT；根因依 exact serving source／build recipe及 reader 呼叫鏈判定，未冒稱已抽查既有 image layers。

## 最小修正與防止再發

- 保留 v5，同一最終 runner 補 COPY v6；用 distroless Node 執行檔在最終建置階段讀兩個 JSON，檢查 application、九角色、version suffix與 hash格式。native reader仍完整驗 approved hash／values，未知或 tamper不放行。
- 修改既有 required owner test dev040-routine-release.test.mjs：由實際 APPROVED_CATALOGS 的 artifact檔名辨識完整依賴，僅驗最終 application stage，防止 builder checkout有檔而runner漏檔。先對未修正Dockerfile得到 v6 COPY assertion FAIL，補檔後同案PASS。
- 不新增 CI／人工 gate；既有 source QC與 owner build執行此邊界。原本 v5-only readback operator屬歷史工具，本批不用它宣稱v6可用；現行正式HTTP／native reader驗收使用最終app image。
- 無新migration、catalog重新發布、Employee／grant／IAM／Secret改動。維持active v6；普通owner重發OrgMaster，候選必须證明governance與role-capabilities讀回成功，再切流。回復不得恢復 UID授權或回寫AI-PDM active pointer。

## 證據與待驗

安全日誌：[第一次404](evidence/DEV057-CATALOG-PACKAGE-20261005/verifier-prefix-404.json)、[實際500](evidence/DEV057-CATALOG-PACKAGE-20261005/governance-runtime-500.json)。本機與required CI、protected merge／exact newsource/image、普通migration unchanged／zeroDDL、正式v6 session／catalog GET及Jed drawings／settings畫面，各按实际層級追加；目前不得標L4 PASS。未發布的 Directory deadline改動在已合併 master b52e94f，但不將它列成本500根因。

## Source QC 與本機驗證（發布前）

獨立 QC `/root/dev121_qc_batch_v6`：PASS，無 P1／P2；核對 final runner 路徑、distroless JSON exec 與全部 approved artifacts。這是唯讀 source QC，未代替最終映像或正式驗收。程式 raw SHA256：Dockerfile `928092dfb262f20c757f486bff4b7325c258b5eaff299dcb1b82bec9d0e44e32`；required test `83dbab7a8c8eeccb20f100d6e11aee39537fcd81ab873baade373d5485302c5f`。

本機既有 routine tests 77/77 PASS。QC wrapper 的 Node cases 221/221 PASS 後，直接 node invocation 因 `NPM_EXEC_PATH_REQUIRED` 結束；原 FAIL 保留，沒有進入後續 synthetic fixture／build。完整 `npm run qc:dev-040:r2` 及 required checks 仍須由正常 CI 執行；不把前置 PASS 冒稱完整 QC 通過。
## Persistence source 矯正與已發布狀態（現行續點）

前述 packaging 已由 PR111／protected source `5b1084f7ff200bde8529c228a6df4496acbab1fb`、required CI `37322092546`／master CI `37322394583` 及 owner run `37324055606` 完成。terminal RELEASED，正式 `orgmaster-prod-43d174f14e7c` 100%／零 tag；ordinary migration UNCHANGED_VERIFIED／zero DDL。正常 Principal SSO 後 governance/session 已由500恢復200。此結果取代上方「packaging待發布」進度，但不能推論角色工作區或整批L4通過。

追加正常 role-capabilities GET仍為503／ORGMASTER_SOURCE_UNAVAILABLE。14:35原驗證只有拒絕斷言，14:47補記安全metadata後確認確切native error；兩個FAIL保留。實際 `readOrganizationSource → stat(local manifest) → getWorkspaceIndex/getWorkspaceVersion` 混用local存在性與CloudSQL persistence：前置stat在有效PG artifact可讀前即拒絕。改為既有 `persistenceArtifactExists` port，false仍拒絕；current entry、revision、document驗證完整保留，不自動seed／本機fallback。所有 `readSynchronized` caller共用修正，無新角色、migration、Employee或grant改動。

Unit正向缺local案在修正前為ORGMASTER_SOURCE_UNAVAILABLE，修正後8案PASS；普通unit invocation的兩個PG案SKIPPED，不能算PASS。最終來源真實PG R13要求v6兩案實際執行，證明無local manifest讀回9角色/v6/hash/current document成功；存在local檔也不能救missing/corrupt PG。沿既有producer/consumer harness的24案通過，own cluster/PID/port/temp及capacity lease清理已確認。獨立source QC無P1/P2；其發現的測試URL query覆蓋已補強。參見[凍結checkpoint](evidence/DEV057-CATALOG-PACKAGE-20261005/workspace-source-correction-checkpoint.json)與[原生結果](evidence/DEV057-CATALOG-PACKAGE-20261005/workspace-native-postgres-r13.json)。新PR required CI／ordinary owner release及正常HTTP/UI仍待完成；不以這次PG PASS宣稱Production完成。
