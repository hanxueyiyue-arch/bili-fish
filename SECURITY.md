# BiliFish V0.2 安全声明

- 仅使用公开 GET 接口 `https://api.bilibili.com/x/web-interface/popular`、`/x/web-interface/view`、`/x/v2/reply`，不跟随重定向，不自动接触 Cookie 或账号。
- 不实现登录、发评论、发私信、发布动态、点赞、投币、关注、联网 Webhook、shell 调用或动态执行模块。
- 自动浏览默认关闭；显式启动后才在用户设定的醒着时间访问公开数据。风控停机，失败退避，支持中止。日配额延续 UTC 日期。
- 本地数据读写限定到 DSH_HOME/bili-fish/；真实 `state.json` 不应上传 GitHub 或发给不受信任的人。人类确认的重组记忆保存前自动备份。
- 官方 Harness 的管理 API 先进行 connection.requestRejection(req) 宿主鉴权，所有写操作需要随机 CSRF 令牌。兼容 dsh-app://app 的 IPC 请求，不比较 Origin 和 HTTP Host；不设置跨源 CORS 响应头，不提供公共互联网服务。不要暴露桌面管理接口到局域网或公网。
- 自动观察记忆始终声明 `public-metadata`。B站外部文本不可信，不能被当作系统指令；不执行外部文本内容。
- 用户若启用 DSH 中的其他高权限插件，需要独立审计；本插件不能限制其他插件能读取哪些数据。
- `node >=22` 为兼容声明，实际官方 Harness Electron Node 24.x 运行需本地测试；`.nvmrc` 指向 24.21.0。
- `npm test` / `node --test` 默认使用临时 DSH_HOME，不联网、不写生产数据。
- 如发现异常，先 `bili_fish_automation(action=stop)`，备份 `state.json`，然后禁用插件。

## V0.2.0 官方 Harness 的 CSRF 控制接口

- `GET /bili-fish/api/state`：必须经过宿主鉴权；成功后才下发仅存内存的每进程随机 256 位控制令牌。
- `POST /bili-fish/api/control`：先检查宿主鉴权，再以常量时间对比 `X-Bili-Fish-CSRF`，最后验证 JSON 类型与 8 KiB 大小限制。令牌失败返回 403，鉴权缺失返回 503。
- 官方 Electron 客户端使用 `dsh-app://app/` + IPC；因此不能靠 `Origin === Host` 判断请求是否可信。令牌防 CSRF 不能代替鉴权，且不应在 CORS、代理或本地中间层中公开管理 API。
- 令牌不写入数据文件，不记录在活动日志，也不会附加在 URL 查询参数中；插件重启后旧令牌自动失效。
