# BiliFish V0.2.1 — 本地测试报告

- 源码基线：已上传的 V0.2.0 官方 Harness 修复版 GitHub 仓库快照（`bili-fish-main (2).zip`），保留原有代码并作修复。
- 测试环境：Linux 构建容器 Node.js 22.16.0（**不是**用户的 Windows 官方 Harness Electron 运行时）。
- 执行命令：`node --test`
- 结果：**36 tests / 36 passed / 0 failed**，包含原有 27 项与新增的 9 项修复回归测试。
- 原有安全测试涵盖：官方 `dsh-app://app` 来源、Origin `null`/缺失、有效/错误/畸形 CSRF 令牌、未授权拒绝、鉴权服务缺失、重启令牌轮换、作息/清理写操作保护、前端是否携带令牌。
- 新增回归测试涵盖：配置作息在生活数据初始化、仪表盘、手动读取及成长中的一致性，保留既有个性化作息，取消/AbortError 不落盘，普通评论错误仍明确警告，原子提交前中止，测试数据显式标记与旧教程精准识别。
- 测试期间使用临时 `DSH_HOME`，不连接 B站，不触碰真实养鱼状态。
- 限制：**尚未在用户的官方 DeepSeek Harness Windows 客户端中安装并实测。** 实际设置页的 POST 按钮、IPC 请求转发、定时浏览需要用户验收。

## 安装后的人工验收

1. 备份 `D:\AI-Data\dsh-data\profiles\desktop` 和 `D:\AI-Data\dsh-data\bili-fish\state.json`。
2. 上传源码到 GitHub `main`，确认 `package.json` 版本 `0.2.1` 及本次 `lib/dashboard.js`、`lib/client.js` 代码已经更新。
3. 按之前实测成功的方法先 `remove` 后 `add`，避免 tarball lockfile 复用旧版本。
4. 打开 **官方** DeepSeek Harness Windows 客户端，按 Ctrl+R，进入设置 → BiliFish。
5. 点击「刷新状态」，确认原记忆/日记/草稿未变。
6. 点击「开启自动浏览」，检查开关变为 `enabled: true`、`nextRunAt` 为未来时间；随后立即点击「立即停止」，检查 `enabled: false`。此过程不会立即访问 B站。
7. 修改作息时间并保存，确认不报 CSRF / Origin 错误；不要进行测试数据删除，除非确实打算删除。
8. 如遇 401/403/503，记录请求状态、错误文字和官方 Harness 版本；不要关闭宿主鉴权或启用完全访问权限。
