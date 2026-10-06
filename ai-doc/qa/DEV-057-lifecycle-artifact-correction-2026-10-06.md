# DEV-057：lifecycle 發布的 source-map-js 修正（2026-10-06）

本批承接 JENFU/DEV-014#principal-lifecycle，不新增主任務。OrgMaster owner run [37414607113](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/37414607113)／source `45bc6ce5fdf6511b03848715ace2a91b7d67f01b` 在 build 的 artifact policy 安全停止，FINALIZED／PRE_ACTIVATION_ABORTED。Cloud Build `ac14089e-8f42-416e-b55a-96f9876aa786` 本身 SUCCESS；immutable app image `sha256:bff3829eb71d7f21ed8d33033856ec776d0c336a96132dc7e0d306b7793f0e32` 的 NPM finding `CVE-2026-93749`／source-map-js 1.2.1 超過既有 MEDIUM gate。兩項 GCC HIGH 仍須既有 source-bound 適用性證據；本批不擴大例外。

官方 [修正 commit](https://github.com/7rulnik/source-map-js/commit/cf76580) 與 [1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) 確認 indexed source-map offset 驗證修正。此套件由既有 jsdom／css 依賴進入 production node_modules。本批只 pin 1.2.2 並更新該 lock entry 的版本、tarball 與 registry integrity，保留其他套件與原 grpc override。五項實際 parser regression 保留正常 indexed map／拒絕巨大、不合法及 nested offset；不在舊版執行耗時展開。

目前：五項實際 patched parser 聚焦驗證通過，使用 integrity 核對的官方小型隔離套件，未重裝既有本機依賴；DB boundary／diff check 通過。[原失敗與修正後報告](evidence/DEV057-LIFECYCLE-SOURCE-MAP-20261006/index.json) 保留各自 bytes、測例修正與層級。尚未通過 required CI／合併／重新發布。CI 保留既有 required checks。package-lock 改變 runner dependency inputs，故新 protected merge 後須重新 source-bind runner build、native image-only rotation、Principal-only recovery 與 fresh owner intent；不能直接重跑過期 R4 capsule。原 031 applied bytes 不改寫，後續 false-state release 仍須 native applied=0/replayed=31，再另行 runtime-only enable、Scheduler resume、正向 lifecycle／L4。此為發布缺陷，留在 DEV-057／DEV-014 主線；DEV-122 一般業務不受影響。

原 revision `orgmaster-prod-a48a05dc0080` 保持100% traffic；本次未執行 migration、candidate 或 activate。Scheduler 維持 PAUSED。原失敗、terminal 與歷史收據保留，不宣稱本批或 DEV-014 完成。
