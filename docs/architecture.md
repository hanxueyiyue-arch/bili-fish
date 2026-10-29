# BiliFish V0.2 内部架构与 BrainMem 说明

## 分层

- `lib/bilibili.js`：仅限 B站公开 GET 路径的网络适配层；限速、日配额、响应大小、超时与重定向拦截沿用 V0.1.1。
- `lib/automation.js`：手动授权控制的定时器、睡眠时段跳过、限流停机、异常退避。
- `lib/life.js`：本地规则式作息、热门视频筛选、兴趣变化与日记/观察记忆生成。
- `lib/memory.js`：兼容 V0.1.1 的基础强度与检索，保持原工具行为。
- `lib/brainmem.js`：新增的 BrainMem 高仿生记忆实验层；只读检索与非破坏性重组。
- `lib/storage.js`：旧状态 `version: 1` 保持、原子持久化、敏感操作前备份。
- `lib/dashboard.js` / `lib/client.js`：通过 DSH 鉴权 + CSRF 令牌保护的本地 API 与官方 Harness 原生设置页面可视化。

## 自主循环

明确 `start` → 完整时间间隔 → 判断醒着或休息 → 醒着才请求 5 条公开热门元数据 → 本地兴趣与新颖度打分 → 选最多 3 条 → 保存观察 → 兴趣得分更新 → 对感兴趣且未重复的 BV 建立**元数据观察记忆** → 每当地日期最多一篇自动日记 → 记录日志 → 安排下一次运行。

兴趣以关键词识别，无网络模型或文本嵌入。每命中一次类别微量加分；不接触的类别按天回到 50 的中性分；活力随时间恢复、探索消耗，低活力可能延长下一轮间隔。所有进展由用户可以停止的单一调度器驱动。

## BrainMem 仿生记忆设计

- 双时间尺度遗忘：`R = 0.60 * 2^(-t/H_fast) + 0.40 * 2^(-t/H_slow)`，`H_fast`、`H_slow` 依重要度与回忆次数延长。
- 细节强度独立衰减，比“有这么一件事”的概览记忆衰减更快。
- 联想评分：`A = 0.45 * T + 0.35 * Q + 0.20 * G`，其中 T 为关键词匹配、Q 为其他命中记忆经共享标签的二跳传播、G 为当前痕迹强度。V0.2 尚未加入精确的抑制项 I 或随机概率抽样；检索仍保持确定性和可复核性。
- 模糊回忆分 `details`、`overview`、`trace` 三层；强度弱时不凭空补齐正文。
- 重组规则：生成 `unverified-candidate` 候选，包含多个原始记忆 ID、来源与警告；**不自动写入**。人工核实后才可通过 `brain_confirm` 新增一条 `human-reviewed-reconstruction` 版本，保留 parent IDs 并备份，不修改旧记录。

## 记忆来源类型

- 旧记录缺少 `kind` 时，返回 `legacy-unclassified`，不得擅自声明它是事实。
- 主动输入的普通记忆：`user-entry`；想象：`imagination`；测试：`test`。
- 公开 B站观察：`observation`，来源包含 `bvid`、`url`、时间和 `public-metadata`。
- 用户核实的重组：`human-reviewed-reconstruction`，来源保留 `parentIds` 和 `user-confirmed`；该确认仅表示用户核实，不等于系统通过第三方证实了事件。

## 知识边界与已知限制

- 本版不会分析视频帧、音轨、完整弹幕或完整字幕；对兴趣的推断可能偏差。
- 定时行为的决策是规则式自主模拟，不是 AI Agent 在后台发起自主模型调用；用户主动与 DSH Agent 对话仍能产生更丰富的文字。
- 自动日记只引用本次观察到的公开标题和主题，不生成虚构观看体验。
- 生物学拟真系数是经验型参数，不应当作经过心理学研究验证的记忆模型。
- 未提供任何 B站账户的操作权限。

## V0.2.1 配置与取消处理

`defaultRoutine` 来自插件 Schema 配置，经 `apply()` 传入 `lifeSummary()`、`developFromObservation()` 和 `registerDashboard()`。只有 `life` 不存在或 `routine` 缺失时才使用配置默认值；原已持久化的用户作息优先。

`readPublicVideo()` 在 `view`、`comments`、持久化前检查 AbortSignal；独立的取消错误直接抛出。`updateState(...,{signal})` 在最终的原子 rename 前检查取消，避免将已取消的请求认定为成功操作；提交完成后无法撤销既有磁盘状态。

对于测试数据：新记录必须有 `memory.kind=test` 或 `isTest=true`，只有 V0.1 已知教学示例可以经过完整字段精确匹配清理。历史列表限制（100 条观察、80 条经历）仍在，长期归档未实现。


## V0.3 BrainMem V2：四层记忆与预算检索

- `lib/brainmem-v2.js`: `memoryLayer` 对旧记录进行只读层级推断，支持情景 / 语义 / 自传 / 偏好；`buildMemoryIndex` 在内存构建倒排表（词项 → 记录 ID）及局部频率/文档频率，`searchIndex` 使用轻量 BM25 风格排序；有限词表扩展不能代替完整语义模型。
- `compactContext` 按实际序列化的紧凑 JSON 字符总数封顶，返回 `id, title, layer, source, recallLevel, excerpt`；`maxTokens` 作为保守字符预算，非精确 Token 计量。只返回部分证据，原始记忆仍留本地。
- `brainmem.js` 原有双尺度遗忘保留；两跳联想从全部两两对比改为最多 12 个关键词相关 seed 的有界传播。复杂度更低，但并不保证语义召回总是准确。
- `lib/memory-archive.js`: 按 UUID 逐条复制为独立原文 JSON；在 `updateState()` 原子写事务中核验副本，再从活跃数组移除，且自动完整备份原状态。它是**显式归档**，没有自动整理或删除。每次只处理最多 25 条。
- 查询档案先加载至内存并用 UUID 去重，然后建立索引。上限 5000 条归档；当前没有 SQLite/FTS 的磁盘级持久索引，也没有 LLM embedding，作为 V0.4+ 的扩展方向。
- `state.json` 的 version 继续为 1；原有自动浏览/作息/活动历史不会在只读访问时强制迁移。人工核实的重组记忆另存时标注 `layer: semantic`。
- 注意原 `observations.slice(-100)`、`life.experiences.slice(-80)` 仍是滚动窗口，不等于长期归档，本版只对 `memories` 提供用户选择的归档。

- 如果恢复后的记忆被强化，重新归档会保留先前的归档历史版本，避免静默覆盖不同证据内容。历史文件不会参与当前记忆检索，但仍需纳入备份和隐私管理。
