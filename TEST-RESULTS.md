# BiliFish v0.3.0 本地测试报告

- 基线：用户先前确认可运行的 V0.2.1 源码包。
- 构建环境：Linux 容器 Node.js 22.16.0，**不是用户的官方 DeepSeek Harness Windows 宿主**。
- `node --test`：**51 项通过 / 0 失败**，包含原有 36 项与新增 V0.3 的 15 项。
- 新增检查：旧版记忆分层推断不改原文、关键词索引和有限概念扩展、不同上下文预算的严格 JSON 字符限制、遗忘不修改证据、待核实巩固建议、归档预览不写入、未确认拒绝、备份并写档案、按 UUID 合并去重、归档后检索、恢复副本保留、非法 ID 拒绝路径穿越、旧 Dashboard 字段兼容及分层计数、极长查询预算边界、恢复后再次归档保留旧历史。
- 全部测试使用合成记录与临时 `DSH_HOME`，不会连接 B站，未安装插件，也未碰用户实际 `state.json`。

## 安装后需要实际验收

1. 完全退出 Harness 并备份整个 Desktop profile 与整个 `DSH_HOME/bili-fish/` 数据目录。
2. 确认 `package.json` 版本 0.3.0、`lib/brainmem-v2.js`、`lib/memory-archive.js` 和 `tests/v03.test.mjs` 在 GitHub 根目录相对路径中。
3. 更新插件、重启/刷新官方 Harness，确认旧的自动浏览设置、日志与数据计数未改变，22 个工具出现。
4. 打开「设置 → BiliFish」，确认新增四层记忆计数与归档数字；旧记忆应落入合理的推断层级。
5. 调用 `bili_fish_memory_context(query=珊瑚,maxTokens=500,limit=3)`，确认内容不编造、不修改旧记录。
6. 可选：在临时 DSH_HOME 中创建**合成**记忆，预览归档、确认、检索、恢复，再备份并检查；不要为验证功能随意归档生产记录。
7. 记录任何真实客户端 API 401/403/503 问题；不要关闭宿主权限检查或 CSRF 防护。

## 已知限制

- `maxTokens` 实为紧凑 JSON 字符预算，并不等于精确 tokenizer 计数。
- 文件式 archive 读取不是 SQLite/FTS，档案多时速度可能下降；最多 5000 条。
- 长期观察记录和兴趣历史仍按原配置滚动裁剪。
- 主动操作工具未在官方 Harness 实机调试，本地测试不能代表完全兼容。
