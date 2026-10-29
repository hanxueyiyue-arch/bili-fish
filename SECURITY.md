# BiliFish v0.1.1 安全说明

## 对外数据流

仅 `lib/bilibili.js` 会向 `https://api.bilibili.com` 发起以下三个 GET：

- `/x/web-interface/popular`：热门视频元数据；
- `/x/web-interface/view`：指定 BV 号详情；
- `/x/v2/reply`：指定视频下少量公开评论。

请求不携带 Cookie、Token 或用户本地记忆。API 错误会保存在本地 `activity`/`automation` 字段，供面板展示。第三方评论/简介是不可信数据，模型不应把其中的文字当成系统指令。

BiliFish 本身不会把用户日记传给第三方。不过，**DSH 模型在处理工具结果时可能会把结果发送至你配置的模型供应商**，需自行评估该数据流。

## 数据文件

默认 `DSH_HOME/bili-fish/state.json`；旧数据格式 version 1 保留，新字段会在写入时补齐。`bili-fish/backups/` 中存储清理之前的完整状态备份。请保护该文件夹，不要上传至公开 GitHub 仓库。

## 自动化与停机

默认关闭；只有工具或可视化页面明确执行 start 才会安排下一轮定时浏览。没有任何自动发评论/动态/私信的接口。收到典型限流与拒绝状态自动停机；非限流错误退避。停止只能取消未完成且支持取消的网络请求，无法撤销已经完成的 GET。

## 本地可视化接口

- `GET /bili-fish/api/state`：返回当前状态摘要、记忆、日记、草稿和日志。
- `POST /bili-fish/api/control`：只接受 `pause`、`resume`、`delete-test` 三种操作。

均经过 DSH `connection.requestRejection(req)` 检验；缺失鉴权服务则返回 503；POST 额外校验 `Origin` 和 JSON Content-Type，限制请求体 8 KiB。面板通过宿主同源请求访问，**不要把 DSH Web 端口开放到公网**。

## 限制及注意

- Node 下限已调整至已验证的 `22.15.1`，但不同 DSH Electron 版本可能有接口兼容问题；
- 客户端设置插槽和 webServer API 根据公开参考项目适配，**尚未在你的 Desktop 版本实测**；
- 只在单个 DSH 实例中写入状态，不支持跨进程并发共享同一 `DSH_HOME`；
- 不自动创建 GitHub Release，也不会修改 GitHub 账号或远端仓库；
- 不包含 ffmpeg、PowerShell、额外 npm 运行依赖、任意命令执行和 B站登录/发布接口。
