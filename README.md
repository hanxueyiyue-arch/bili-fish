# BiliFish V0.3.0 — BrainMem V2（官方 DeepSeek Harness）

BiliFish 是运行在 **DeepSeek 官方 Harness（desktop profile）** 的本地 AI 小鱼养成插件。基于已经由用户验收的 V0.2.1，保留原有的 B站公开视频探索、兴趣/活力/心情模拟、作息、自动日记、评论草稿、日志及设置页，新增 **BrainMem V2 分层记忆、预算化本地检索、候选巩固、人工归档与恢复**。

**请勿误解能力：** 自动探索仅通过 B站公开 GET API 读取视频标题/简介/统计/部分评论，不播放音视频，也不会在后台自主调用大模型。兴趣和心情由可解释规则模拟。插件不登录 B站、不读取 Cookie、不具备发布/点赞/私信/关注能力。

## V0.3 变化概览

| 项目 | 行为 |
| --- | --- |
| 四层记忆 | `episodic`（情景）、`semantic`（语义）、`autobiographical`（自传）、`preference`（偏好）；旧版未分类记忆**只在读取时推断层级**，不批量修改旧文件 |
| 遗忘 | 沿用双时间尺度强度模型；失去细节不等于删除原文，来源事实和想象/测试数据仍分离 |
| 检索 | 本地倒排索引 + BM25 风格排序 + 少量固定的概念词扩展；只对候选记忆评分，避免向模型提供全部历史 |
| 上下文预算 | `bili_fish_memory_context` 限制序列化后**紧凑 JSON 字符数**，默认 800，范围 200–1600。这是保守的 token 代理指标，**并非精确分词器计数或绝对 Token 保证** |
| 重组 | 只读提出带来源 UUID 的候选。经人工核实后可用原 `bili_fish_brain_confirm` 另存一条语义记忆，不覆盖原文 |
| 归档 | 人工指定 UUID，先预览、再确认；每条保存为 `memory-archive/<uuid>.json`，完整状态自动备份，成功后从活跃 `state.json` 中移出 |
| 恢复 | 需确认口令，归档副本仍保留；若恢复后强化再归档，旧归档会保存为历史副本；检索通过 UUID 合并去重，避免崩溃重试时重复返回 |
| 管理界面 | 设置 → BiliFish 增加活跃/归档数量、记忆层级及遗忘阶段统计 |
| 性能优化 | 原 BrainMem 两跳联想限制参与的种子集合，避免对全部记忆做 O(n²) 逐对比较 |

## 向后兼容

- `state.json` 的 `version` 仍是 **1**。旧版 `bornAt`、记忆、日记、草稿、浏览记录与配置不必迁移；只读访问不会主动改写文件。
- 旧 V0.2.1 的 **17 个工具保持原名和主要行为**；新增 5 个记忆工具，总计 **22 个**。
- `bili_fish_remember` 新增可选 `layer` 参数；原先 `kind` 与 `isTest` 清理逻辑不变。
- 原始记忆仍最多保留 **500 条活跃记录**。可以先归档指定旧记录再添加新的记忆；归档不是自动执行的。
- 归档是**独立的文件式 JSON 存储**，不是 SQLite。当前每次检索会读取归档并在内存构建倒排索引（最多 5000 条归档）；未来如果需要万级以上记录，可另行引入 SQLite/FTS 并做可回滚迁移。
- 原先的观察历史仍只保留最近 100 条、成长经历最近 80 条，**这两类记录还没有实现长期归档**。不要把这两个列表当作永久档案。

## 新增的 5 个工具

```
bili_fish_memory_overview       查看各层级活跃记忆、归档量及遗忘阶段；只读
bili_fish_memory_context        query, maxTokens=800, limit=6；预算化本地证据检索；只读
bili_fish_memory_consolidate    query；提出带 UUID 的未核实候选；只读
bili_fish_memory_archive        action=status / preview / archive；归档需 ARCHIVE_MEMORIES
bili_fish_memory_restore        id, confirmation=RESTORE_MEMORY；恢复并自动备份
```

以前的 `bili_fish_brain_recall` / `bili_fish_brain_reconstruct` 和 `bili_fish_recall(readOnly=true)` 也能**查询归档**；`readOnly=false` 仍只强化活跃记忆，不改变归档副本。推荐在普通对话中优先使用 `memory_context`，减少上下文体积。

### 在 Harness 聊天中试用

1. 「调用 `bili_fish_memory_overview`，显示四层记忆与归档统计，不修改任何数据。」
2. 「调用 `bili_fish_memory_context`，`query=珊瑚`、`maxTokens=500`、`limit=3`，只返回工具实际结果。」
3. 「调用 `bili_fish_memory_consolidate`，`query=游戏`，列出可整合的原始记忆 UUID；不要保存。」
4. 「先调用 `bili_fish_memory_archive`，`action=preview`、`ids=<你要归档的UUID>`。预览并核对后才可用 `action=archive` 加确认口令 `ARCHIVE_MEMORIES`。」
5. 「如确实需要恢复，调用 `bili_fish_memory_restore`，填入精确 UUID 和口令 `RESTORE_MEMORY`。」

归档/恢复会实际改写 `state.json`，请**先确认备份和 ID**，不要把“只读查询”和“强化记忆”混在一起。

## 安全原则

- 自动浏览默认关闭；用户显式开启后才按 6–48 小时间隔读取 B站公开元数据；休息时间不发送网络请求。
- 不需要 API Key、B站 Cookie、浏览器登录信息，不会访问额外的外部网站，也不会向外部服务上报记忆。
- DSH 本地设置页仍要求官方连接鉴权，并以每进程随机 CSRF 令牌保护写入 API；不为了绕过 `dsh-app://app` 兼容性禁用鉴权。
- 原有 `bili_fish_cleanup_test` 只清理明确标记或历史精确匹配的测试记录；**归档不是删除**，不应作为清理敏感数据的手段。
- 本地档案/备份可能包含私人记录；不要上传到公开 GitHub、分享给陌生人或让高权限插件随意访问。
- 用户只使用一个 DSH 进程读写同一 `DSH_HOME`；跨进程并发不是当前版本支持场景。

完整限制见 `SECURITY.md` 与 `docs/architecture.md`。

## Windows 11 更新官方 Harness 插件

1. 完全退出官方 Harness，并备份 `D:\AI-Data\dsh-data\profiles\desktop` 和整个 `D:\AI-Data\dsh-data\bili-fish` 文件夹（**包括 state.json、backups 和 memory-archive**）。
2. 将这个 ZIP 根目录里的文件更新到 [GitHub 仓库](https://github.com/hanxueyiyue-arch/bili-fish) 的根目录，确认 `package.json` 版本为 `0.3.0`。不要上传个人 `state.json`、密钥、日志、归档目录。
3. 由于你此前环境里 `github.com` 主站 tarball 请求超时，而 `codeload.github.com` 可访问，可以继续用 codeload。先 remove 再 add，避免 pnpm 对旧 URL 锁定：

```powershell
$env:CI = 'true'
dsh plugin --profile desktop remove dsh-bili-fish
dsh plugin --profile desktop add 'https://codeload.github.com/hanxueyiyue-arch/bili-fish/tar.gz/refs/heads/main'
```

只有在确认 GitHub `main` 已经更新后才执行；**主分支地址不是固定版本**。建议通过 GitHub Release `v0.3.0` 的固定标签来减少升级不可复现问题。

4. 打开官方 Harness、按 `Ctrl+R`，进入「设置 → BiliFish」，核对旧数据数量、分层统计、归档数，以及自动浏览是否仍按你之前的设置运行。
5. 手动测试 `memory_overview` 和 `memory_context` 的只读功能；不要为了验收直接归档现有的重要记忆。

## 测试与已知限制

- `node --test`，在 Node.js 22.16.0 的隔离环境中 **51/51 项通过**（原有 36 项 + 新增 15 项）。测试自动设置独立临时 `DSH_HOME`，不联网，不执行 DSH 宿主安装，不会修改你的真实记忆。
- 仍需要在你的**官方 DeepSeek Harness Windows 客户端**上验证真实加载、22 个工具注册、归档 UI 统计、以及旧数据在升级后的读取。
- 概念扩展是有限词表，不是语义嵌入模型；未接入云端向量 API。
- 原始长记忆保存在磁盘时会随时间积累；基于按需归档与预算检索抑制上下文 Token 消耗，但不保证存储增长永远停止。
