# BiliFish v0.1.1 — B站 AI 小鱼（DSH 插件）

一个独立实现的 DeepSeek Harness Bundle 插件。小鱼可以读取 B站公开热门视频信息、保留记忆、写私人日记、起草评论；V0.1.1 加入 **DSH 设置页可视化面板**、**默认只读回忆**、**测试记录安全清理**、**自动浏览控制与失败日志**。

> **版本状态：** 源码静态检查及 8 项本地单元测试通过；**尚未在用户的 DSH Desktop 中实际运行此版本**。V0.1.0 曾在用户的 DSH Desktop 中成功运行，但新版页面 / API 需要单独验收。

## 相对于 V0.1.0 的变化

| 功能 | V0.1.1 |
| --- | --- |
| `bili_fish_recall` | `readOnly` 默认 `true`：不修改 `recallCount`/`lastRecalledAt`；明确 `readOnly:false` 才强化记忆 |
| Node 下限 | `>=22`：避免误排除已验证的 Node 22.15.1；不表示所有 22.x 小版本均已验证 |
| pnpm 版本 | `packageManager: pnpm@11.28.5` 与本机 DSH 工具链对齐 |
| 本地开发版本 | `.nvmrc` 为 `24.21.0`，与实际 Desktop 宿主一致，不限制插件运行时 |
| 测试隔离 | `npm test` 或 `pnpm test` 会自动使用临时 `DSH_HOME`，不覆盖真实养鱼记录 |
| 清理测试记录 | 新增 `bili_fish_cleanup_test`；`list` 预览，`delete` 按 ID 删除，仅匹配明确标记的测试数据；自动备份到 `bili-fish/backups/` |
| 自动浏览 | 新增 `bili_fish_automation`：`status`、`start`、`stop`；启动后延迟完整周期，不自动唤醒模型。对 412/429/403 触发停机，其他错误退避后重试 |
| 日志 | 新增 `bili_fish_logs`，本地保存最近 150 条活动，界面显示最近 80 条 |
| 可视化界面 | DSH「设置」中尝试注册「BiliFish · 小鱼」，显示状态、记忆、日记、草稿、活动日志和自动浏览开关 |

## 安全边界

- **不登录 B站，不读取 Cookie / SSH 密钥 / 浏览器登录信息。**
- B站通信仅使用 `https://api.bilibili.com` 上三个白名单 GET 接口，拒绝重定向。
- 不提供发送评论、私信、点赞、关注、投币、发布动态等接口。
- 后台定时器始终只读本地状态；只有通过工具或设置页 **明确 start** 才会周期性访问 B站。
- 不运行 shell、Node 子进程、ffmpeg、PowerShell；不创建子智能体。
- 面板后端仅通过 DSH 同源接口提供，必须通过宿主 connection 的请求鉴权；没有鉴权服务时拒绝访问（fail-closed）。
- 所有数据仍在 `DSH_HOME/bili-fish/state.json`，不会迁移或覆盖其他插件的数据。

## 开发环境与运行环境

- Windows PATH 上的 `node`（先前实测 `22.15.1`）用于终端脚本、单元测试；DSH Desktop 宿主运行时由 Electron 提供（实测 `24.21.0`）。
- `engines.node` 写为 `>=22` 是兼容性范围声明，已实测范围以测试报告为准，不能推断所有 Node 22.x 版本均通过验证。
- `.nvmrc` 用于开发者选择 `24.21.0`，不会强制改变系统 Node，也不会更改 DSH 内置 Node。
- `packageManager` 标明推荐 pnpm 版本；Corepack 等管理器可能按配置下载该版本，使用前请自行确认。
- 在源码目录执行 `npm test` 或 `pnpm test`；测试自动创建并清理临时目录，不写入当前 DSH 的真实 `state.json`。

## 安装升级 — Windows 11 / 无 Git

**先备份现有已验证版本及用户数据。** 备份时先停止 DSH，避免正在写入：

- 已验证源码快照：保存原 V0.1.0 ZIP 和在 GitHub 上创建 `v0.1.0` tag；
- 用户状态：复制 `D:\AI-Data\dsh-data\bili-fish\state.json` 至你自己控制的备份文件夹。

将此压缩包**解压到项目目录**，再在 GitHub 的 `main` 分支根目录提交所有文件（特别是 `lib/client.js`、`lib/dashboard.js`、`lib/automation.js`）。不要上传用户 `state.json`、备份、凭据。

GitHub 更新后，用你已验证过的 HTTPS tarball 安装方式：

```powershell
# 用正常 PowerShell；无需 Git
$env:CI = 'true'
dsh plugin --profile desktop add 'https://github.com/hanxueyiyue-arch/bili-fish/tarball/main'
```

`main` 可能变化，因此更稳妥的方式是先创建 `v0.1.1` tag 再从固定版本安装，或先将 ZIP 解压到本地目录并使用你已验证的 `link:` 安装模式。**上传仓库和创建 GitHub Release 需要仓库拥有者亲自在 GitHub 操作**，本包不代表已经推送到 GitHub。

更新后重载 DSH Desktop。先确认原有 8 个工具仍可用，再检查新增 3 个工具是否注册，最后打开「设置」寻找 **BiliFish · 小鱼**。**若面板显示 403/503，请勿关闭 DSH 信任栅栏来绕过**；收集 DSH 版本及日志，按宿主实际接口修正兼容性。

## 新工具用法

```text
调用 bili_fish_recall，query="珊瑚"，readOnly=true；确认回忆次数不变化。
调用 bili_fish_recall，query="珊瑚"，readOnly=false；这次明确强化回忆。
调用 bili_fish_cleanup_test，action="list"；先查看可清理记录。
调用 bili_fish_cleanup_test，action="delete"，kind="draft"，id="<从 list 得到的 ID>"，confirmation="DELETE_TEST_DATA"。
调用 bili_fish_automation，action="status"。
调用 bili_fish_automation，action="start"；自动浏览只在 6～48 小时间隔到期后执行。
调用 bili_fish_automation，action="stop"；暂停下一轮并取消当前可取消的网络请求。
调用 bili_fish_logs；查看最近的本地活动。
```

### 数据兼容与清理

旧 V0.1.0 的 `state.json` 保持 version 1。首次写入会补齐 `activity` 和 `automation` 字段，不删除已有记忆/日记/草稿。**删除指定测试数据前，插件在 `bili-fish/backups/` 自动保留完整旧状态**。清理仅针对测试内容具备明确标记的条目，不支持删除真实生活记录。

### 自动浏览机制

- 默认关闭，只有显式启动才安排下一轮（不会启动即访问 B站）；
- 每分钟检查一次本地计划，只在到期时抓取 3 条公开视频元数据；
- 每次尝试记录 `automation-run` / `automation-success` / `automation-error` 等日志；
- 遇到被拒绝或限流自动停机，必须再次人工启动；
- 其他错误在 15/30/60/120/360 分钟逐级退避；
- 停止后**不会**执行后续定时任务；若请求已经完成则无法追回已经产生的公开 GET 请求。

### 可视化界面

参考 `dsh-bili-whale` 原生设置页的**公开扩展接口思路**：通过 DSH 的 `settings.section` 插槽挂载 React 页面；通过 `ctx.webServer.register()` 暴露同源、鉴权的本地 API。实现代码为 BiliFish 自己编写。页面不需要额外的公网服务、Node 运行命令或外部脚本。

可视化面板是否在你当前 DSH 版本出现，必须通过桌面版实测。若宿主客户端接口变更，**核心 11 个工具仍是主要兼容目标**。

## 发布到 GitHub

1. 在仓库创建 tag `v0.1.0` 指向已验证的旧版提交，并创建 Release（标题：`BiliFish v0.1.0 — tested baseline`）。
2. 将 V0.1.1 文件提交到 `main`，不要覆盖用户状态文件。
3. 等 DSH Desktop 实测 UI、只读检索和暂停功能后，创建 tag `v0.1.1`、GitHub Release，并附上 ZIP 作为 Source archive 之外的安装包。
4. 不要直接依赖可变的 `main` 作为长期生产版本；需要回退时可安装固定 tag 的 tarball。

原版参考项目：[Alterssss/dsh-bili-whale](https://github.com/Alterssss/dsh-bili-whale)（MIT）。本插件借鉴其设计模块划分和 DSH 原生设置扩展方式，不直接移植其账号登录、自动发布、私信或命令执行实现。详情见 `NOTICE.md`。
