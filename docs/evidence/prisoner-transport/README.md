# 囚犯押送与收容回归（2026-09-26）

`season.json` 是 `node tests/season_soak.test.js` 的最终版本结果：固定种子 9301、6 游戏日、144000 帧；`passed=true`，袭击已出现并结算。共俘获 134 名不同 id 的人型，季末 121 名在不同收容格，13 名仍等待空闲押送员。季末统计并不等于“所有俘虏即时入点”。

`tests/prisoner_transport.test.js` 验证纯规划的独占、可达性、押送员替换和读档后高序号临时格稳定性。`tests/scenario.test.js` 验证居民实际接人、沿路送达建成点或临时区，单人连续押送多人，以及 #189 的释放出口。`tests/hostile_pawn.test.js` 验证家园快照与 meta 分开反序列化后，同 id 身体重新绑定权威俘虏记录。

本次运行前 `docs/evidence/colony-home/season.json` 已有未提交改动；长测运行后原文件按字节恢复，本目录保存新证据。
