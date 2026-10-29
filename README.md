# BiliFish V0.2.1 — 官方 DeepSeek Harness 兼容修复版

在 **已经通过 DeepSeek 官方 Harness（desktop profile）V0.1.1 核心功能验证** 的 BiliFish 源码上升级的版本：保留已有工具、数据与 DSH「设置 → BiliFish · 小鱼」面板，加入**自主作息、兴趣成长、观察记忆、元数据日记、BrainMem B 型联想记忆**和成长轨迹。

> **重要区分：** 本版的无人值守自主生活使用可检查的本地规则和 B 站公开元数据，不是在后台偷偷启动 LLM。其“心情”是软件状态标签，并不是意识或真实感受。它没有观看视频画面、播放声音或理解完整字幕。用户明确让 DSH Agent 写更丰富的日记时，可调用 `bili_fish_reflection_context` 获取有来源的线索，再由 Agent 撰写并在用户确认后写入。

## 新版功能

| 功能 | V0.2 行为 |
| --- | --- |
| 自主作息 | 用户设置时区、起床/休息小时；到定时浏览时间如果在休息时段，仅记录 `routine-rest` 日志并顺延一小时；不会联网 |
| 自主探索 | 开启自动浏览后，从最多 5 条公开热门元数据中按兴趣、新颖程度与探索因子选最多 3 条；继续使用原版 6–48h 间隔、日配额、风控停机和手动停止 |
| 兴趣成长 | 按标题和简介中的有限关键词推断兴趣；每次观察微调分数、记录最近 60 次兴趣快照；长期不接触的偏好逐渐回到中性 |
| 心情与活力 | 兴趣命中后调整“好奇/兴致勃勃”等状态标签；经过时间恢复活力，探索消耗活力，低活力可能延长下一轮间隔 |
| 自主记忆 | 仅**定时观察**时从有类别的元数据生成最多一条带 BV 来源的观察记忆；同 BV 去重，不冒充完整观看；旧记忆不被自动删除 |
| 日记 | 每个生活日首次定时探索，依据真实返回的公开标题/来源生成至多一篇 `kind=auto-metadata` 的本地日记，不发 B 站 |
| BrainMem | 双时间尺度遗忘 + 独立细节衰减；中英文短语检索 + 两跳标签唤醒；`brain_reconstruct` 仅生成未经核实候选，不写入状态 |
| 人工核实 | `brain_confirm` 必须输入核实内容、旧记忆 ID 和明确口令；操作前备份并**另存**一条有来源的新版本，绝不覆盖原始记忆 |
| 可视化 | DSH 原生控制台新增活力、心情、兴趣分数、兴趣历史、最近经历、作息时区与保存按钮；保留记忆、日记、草稿、日志和启动/停止 |

## 兼容性及数据迁移

- `package.json` 为 `dsh-bili-fish@0.2.1`；保留 `exports["."]`、`exports["./client"]`，保留相同 `settings.section` 挂载点和原有路由。
- **`state.json` 的 version 保持 1**。旧 `bornAt`、`observations`、`memories`、`diary`、`drafts`、`quota`、`automation`、`activity` 原样保留。新增 `life` 数据采用懒初始化；只读状态不会强制改写硬盘。
- 旧版 `bili_fish_recall` 的 `readOnly` 行为不变；BrainMem 是独立的新工具，不替代原检索逻辑。
- 原有 11 个工具继续存在，新增 6 个工具，总共 **17 个**。
- Node 要求 `>=22`，`packageManager` 为 `pnpm@11.28.5`，开发环境 `.nvmrc=24.21.0`。

## 新增工具

```
bili_fish_life_status           不联网，查看小鱼作息/心情/活力/兴趣/经历
bili_fish_routine               action=status 或 set（时区及起床、睡觉时间）
bili_fish_brain_recall          只读模糊回忆、遗忘评分、两跳联想
bili_fish_brain_reconstruct     只读生成未核实重组候选
bili_fish_brain_confirm         人工确认后另存新版本记忆（原记录保留，自动备份）
bili_fish_reflection_context    提供来源可追溯的线索，供当前 Agent 经用户请求撰写日记
```

### 典型使用方法

在 DSH 对话框中：

1. 「调用 `bili_fish_life_status`，告诉我小鱼的兴趣、心情和作息。」
2. 「调用 `bili_fish_routine`，action=set，timeZone=Asia/Shanghai，wakeHour=9，sleepHour=23。」
3. 「调用 `bili_fish_swim`，count=3，让小鱼积累一点兴趣。注意这只是公开视频信息，不代表看完内容。」
4. 「调用 `bili_fish_brain_recall`，query=游戏，展示原始来源及回忆层级。」
5. 「调用 `bili_fish_brain_reconstruct`，query=游戏；不要把重组当成事实。」
6. 「我想让小鱼写一篇个性化日记。先调用 `bili_fish_reflection_context`，区分真实元数据和想象内容，生成**草稿供我确认**，不直接保存。」

### 自主浏览启动

**默认关闭。** 用户必须在 DSH 控制台点击「开启自动浏览」，或显式调用：

```
bili_fish_automation action=start
```

首次自动浏览仍需等待配置的完整间隔（默认 12 小时）；每分钟只检查**本地**计划。到期如果小鱼处于休息时段，顺延一小时，不访问 B 站。遇到 B站 HTTP 403 / 412 / 429 等限流情况立即关闭，需用户手动重新启用；其他错误会退避重试。停止操作 `action=stop` 会取消正在等待的可取消请求。

作息支持 `Asia/Shanghai`、`Asia/Tokyo` 和 `UTC`，默认 09:00 起床、23:00 休息，默认时区 `Asia/Shanghai`。**请按实际所在地设置时区**。每日 API 配额依然按 UTC 日期重置（延续 V0.1.1 行为）。

## 安全边界

- 无 B站登录，无 Cookie、密码、API Key、浏览器凭据或 SSH 密钥读取。
- 唯一的外部请求仍是 `https://api.bilibili.com` 的三个公开 GET API；没有评论、私信、点赞、关注、发布或投币接口；禁止 HTTP 重定向。
- 不安装第三方运行时依赖、不新增 install/postinstall 钩子、不运行 shell / PowerShell / 子进程、不创建子 Agent。
- 自动兴趣与日记 **仅使用公开元数据**；来源保留 BV 号和观察时间。未验证重组不会被保存成事实。
- 数据都在 `DSH_HOME/bili-fish/state.json`，测试自动使用临时 DSH_HOME。状态写入仍采用临时文件 + rename；人确认的重组保存前会备份。原有旧记忆不会被自动删除，500 条容量限制时拒绝继续保存。
- 管理 API 依赖官方 Harness connection 鉴权和每次插件启动随机生成的 CSRF 令牌（POST 请求需要）；不再要求 Electron 的 Origin 与 HTTP Host 一致。限制 JSON 请求体为 8 KiB；无鉴权或令牌错误均拒绝请求。不添加跨源 CORS 响应头。
- B站标题、简介、评论是不可信外部文本，不能被用作系统指令。公开数据的关键词分类可能不准确；记忆“重要性”只是启发式估分。

## 安装升级（Windows 11 / 没有 Git）

先完全退出 **DeepSeek 官方 Harness Windows 客户端**（它使用 `desktop` profile），备份：

- `D:\AI-Data\dsh-data\profiles\desktop` 整个文件夹（含 package.json 与 pnpm-lock.yaml）
- `D:\AI-Data\dsh-data\bili-fish\state.json` 用户数据

将本 ZIP **内部的文件**上传到 [GitHub 仓库](https://github.com/hanxueyiyue-arch/bili-fish) `main` 根目录，不要额外套 `BiliFish-v0.2/` 文件夹，不要上传真实 `state.json`。本地使用 `node --test` 测试后，因你已经确认 tarball 地址受 pnpm lockfile integrity 锁定，升级应先按 DSH 的 remove 流程移除旧依赖，再重新 add：

```powershell
$env:CI = 'true'
dsh plugin --profile desktop remove dsh-bili-fish
dsh plugin --profile desktop add 'https://github.com/hanxueyiyue-arch/bili-fish/tarball/main'
```

**先确认仓库更新成功再执行。** `remove/add` 会影响 Desktop profile，不能在正在执行重要任务时操作；数据目录不应在这一步被手动删除。重新打开官方 Harness 客户端并按 Ctrl+R 刷新，核对 17 个工具、旧数据计数、设置页和自动浏览开关。之后可使用固定 GitHub Release tag 替代可变的 `main`。

## 版本测试与限制

运行：`node --test`。测试仅使用合成的 B站元数据，自动创建临时目录，不访问网络，不写用户生产 `state.json`。本次修复版保留原有 27 项测试，并新增 9 项作息初始化、请求取消和测试数据精确识别的回归测试；已在 Node.js 22.16.0 运行，36/36 通过。**官方 DeepSeek Harness 的真实客户端、设置页面交互和定时执行仍需在你的 Windows 环境验收**。

此版本的规则式成长是可控的自主模拟，**没有实现无人监管的 LLM 长链推理**。如果将来需要基于大模型自主写作或选择行为，应在用户明示同意后接入受限代理，并专门审查提示注入、费用和发送权限。具体算法与迁移设计见 `docs/architecture.md`。


## 官方 DeepSeek Harness 控制面板修复（V0.2.0 Harness fix）

原 V0.1.1 与 V0.2.0 控制面板的 `Origin === Host` 校验无法兼容部分官方 Electron `dsh-app://app/` 请求，点击「开启自动浏览」会提示 **Origin 不匹配**。本版在 **V0.2.0 完整功能代码** 上修复：

- 仍然先执行 `connection.requestRejection(req)` 宿主鉴权；鉴权模块不存在时拒绝请求（503）。
- 已授权的 `GET /bili-fish/api/state` 返回 64 位十六进制的每次启动随机 CSRF 令牌，令牌只存于当前进程内存，不写到 `state.json`、URL 或日志。
- 客户端使用 `X-Bili-Fish-CSRF` 请求头提交令牌，控制、作息修改、测试数据清理等 **全部 POST 操作** 均需要令牌。错误令牌返回 403；界面会提示刷新再试，不会自动重放危险操作。
- 为适配官方 Harness 桌面 IPC，移除了 Origin/Host 字符串相等的要求。**这不是取消安全校验**：令牌、宿主鉴权、无跨域 CORS、JSON 限制及请求体大小限制仍然生效。
- 首次加载控制台或插件重新加载后，请在官方 Harness 界面按 `Ctrl+R`，然后测试「刷新状态 → 开启自动浏览 → 立即停止」。开启后默认延迟完整周期才进行首次访问，不会立刻发 B 站请求。
- 若仍出现 403/503，**不要关闭 Harness 的鉴权或信任机制**。请收集接口返回状态和错误消息。此版本尚未在你的官方 Harness 实例中完成真实 UI 操作验收。

参考： [DeepSeek Harness 官方 Desktop 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)（桌面入口 `dsh-app://app/`）、[官方 HTTP Server 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md)（Electron 与 HTTP 网关差异）。


## V0.2.1 补丁：在 V0.2.0 官方 Harness 版上修复

- **首次初始化作息**：当尚未产生 `life` 数据时，插件 `timeZone`、`wakeHour`、`sleepHour` 的配置会贯穿状态工具、仪表盘、手动观察、自动探索及首次创建的生活记录；**已经保存在 `state.json` 中的个性化作息保持优先**。仅改变插件配置不会悄悄覆盖既有用户选择。
- **取消手动读取视频**：中止信号或 `AbortError` 不再当成普通评论错误继续保存观察；原子写入在最终 rename 前检查中止。已经实际完成提交的操作不能事后撤销，不能把“停止”视为历史记录回滚。
- **测试清理避免误判**：新记忆用 `kind=test`、新日记/草稿用 `isTest=true` 显式标记。除精准匹配的三条 V0.1 教程示例外，不再凭“标题里有测试”“正文含蓝色珊瑚”等宽松条件将普通记录列为可删除。执行删除仍需 ID + `DELETE_TEST_DATA` 且自动备份。
- **保留控制接口安全**：使用官方 Harness 连接鉴权 + CSRF 令牌；无法替代宿主实际运行验收。
- **变更范围**：状态格式仍为 `version: 1`；未删除既有记录；无新增外部运行依赖、安装钩子或自动外发接口。版本升级到 `0.2.1`，以便辨别安装缓存中的旧 0.2.0 构建。

### V0.2.1 旧数据兼容性注意

旧的 V0.1 教程测试记录会继续被精准识别。新建测试日记和草稿时必须主动传 `isTest=true`；一般记录不会因为文字碰巧出现“测试”而被清理。

近期观察仍只保留 100 条、近期经历仍只保留 80 条；**长期冷数据归档尚未实现**，计划留给后续版本，不应把这两个最近记录列表当作永久历史归档。
