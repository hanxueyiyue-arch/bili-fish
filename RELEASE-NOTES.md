# BiliFish v0.3.0 发布说明（待官方 Harness 实机验收）

- 升级自已经通过用户实机验证的 v0.2.1，保留旧的 17 个工具与配置。
- 新增 5 个工具：分层概览、低预算上下文、巩固建议、归档、恢复；总计 22 个工具。
- 原有 36 项 + 新增 15 项，本地 Node.js 22.16.0 运行 51/51 项通过。
- 原 `state.json` version 1 无需迁移；新增的归档文件位于 `DSH_HOME/bili-fish/memory-archive/`，备份应覆盖整个 BiliFish 数据目录。
- 新增本地索引，最大上下文预算为“紧凑 JSON 字符数”，不是精确 Token 数；没有增加第三方依赖/账号权限或后台 LLM 调用。
- 明确未完成：官方 Harness Windows 24.x 真实加载与 UI 操作验收、SQLite/FTS、长期观察归档。

## 回退

保留 v0.2.1 的整个 profile 与整个 `DSH_HOME/bili-fish/` 数据目录备份。需要回退时使用旧版本的固定 tag 或旧 package，恢复对应 profile；不要仅恢复 `state.json` 后删除新归档文件。
