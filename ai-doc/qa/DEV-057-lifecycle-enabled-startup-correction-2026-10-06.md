# DEV-057／DEV-014 R7：enabled worker 啟動與未封存候選清理

CURRENT_CONTINUATION，來源 JENFU/DEV-014 remaining lifecycle slice；沿 ORGMASTER/DEV-057，不新增主 DEV。

正式基線：R6 default-off ORGMASTER-REL-20261006054155079-DEDA9F1、orgmaster-prod-e3d1b46d16bf 100%、031 native applied=0/replayed=31；Platform R38 RELEASED、011 native applied=0/replayed=11。enablement ORGMASTER-REL-20261006055619947-DEDA9F1 / run 37421063518 的 candidate orgmaster-prod-8773c61d48e7 為 Ready FAILED，stderr 有精確 target guard exception；migrate UNCHANGED_VERIFIED/zero DDL。terminal PRE_ACTIVATION_ABORTED 保留原結果，不把 candidate 失敗算為 Principal 契約失敗。

共同根因及處置：
1. source-owned release profile 未提供 enabled worker 的七個 target 欄位。補 required+fixed 與 profile validator；現有 false-state correction 只准補缺漏精確值，before 有錯值即拒絕。target server guard 完整保留。實際 profile fixed values 建立 enabled runtime 的測試，加上各欄位缺漏/錯值拒絕。
2. unsealed rollback 以 trafficStatuses 判定 tag，未 Ready candidate 缺 status row時漏清 configured traffic。新單用途 helper 要求 exact deterministic sole zero-percent tag、非 reconciling、observed generation、合法一致 active 100%、FAILED candidate Ready 證據，僅 traffic/etag CAS；after 必須 SUCCEEDED、兩種 traffic 無 tag、active/其他 traffic 不變，否則不得 terminal/FINALIZED。一般 transport guard 不放寬。
3. UNCHANGED_VERIFIED enablement abort 未更動 infra，不應落入已套用新 runner 的 build-abort lineage。CLI 只有 aborted infra ref 與成功基線不同才建立該 lineage；歷史異常 image-only rotation 的完整驗證保留。

聚焦證據：[受控 index](evidence/DEV014-LIFECYCLE-R7-20261006/index.json)。owner Node 354/354、本機 actual-profile startup 17/17、db-boundary PASS；新 cleanup 封存整合與拒絕共 33/33（與 owner suite 重疊，不加總）。首次新 integration fixture 錯誤與修正原始 log 保留在 JENFU 工作紀錄，不當成產品或正式契約失敗。

正式驗證 PENDING：本批 CI/merge、失敗候選安全清理、fresh source-bound native release、exact Scheduler resume、JFS9014 正常 Employee status writer→immutable event/Platform receipt/epoch→舊 session拒絕→正常 activation-check恢复→fresh login。QA01407–10/16/20 保留 ID 与 pending；R7 本機 PASS 不替代 Production positive lifecycle。終態必須記錄 actual source/image/revision/receipts，原停用及未核實帳號不變。一般業務留 AIPDM/DEV-122；DEV-016 不開發。

PR121 首輪 required CI run 37424272238 / job 112140258801：full tests、build、lifecycle readback、abort、DB-boundary 成功；唯一失败是固定 27 檔 QC 脚本仍要求历史 337，实际 339/339、fail=0。本批增加 exact false-state target guard 与 unsealed-cleanup 两个选定案例，将同一 PR 的明确分母改为 339；未删案例、跳过案例或放宽来源、CI、发布规则。本机同一选定清单 339/339、skipped=0；任务 helper 首次误用 TAP 格式解析而退出，原始 spec 输出保留，不重跑测试。新的 required CI 仍须通过后才能合并。
