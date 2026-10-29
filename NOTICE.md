# Reference and attribution

BiliFish v0.1.1 is an independently implemented DSH plugin. Its architecture and native settings-panel approach were studied with the public source archive of:

- **Alterssss / dsh-bili-whale**: https://github.com/Alterssss/dsh-bili-whale
- License: **MIT License**, copyright (c) 2026 ALTERSSSS.
- Upstream license: https://github.com/Alterssss/dsh-bili-whale/blob/main/LICENSE

The BiliFish implementation does not incorporate upstream account-login, direct-message, auto-publishing, command-execution or ffmpeg code. The `settings.section` integration pattern and webServer API use the same publicly demonstrated DSH extension interfaces.

If later versions copy substantial code from dsh-bili-whale, keep the required upstream copyright and license notice with that copied code, in accordance with MIT terms.


V0.2.0 Harness fix：此构建使用现有 V0.2.0 原创源码修复官方 Harness 客户端的 Origin 校验兼容性，不包含此前 V0.1.2 的独立版本包。未在用户的官方 Electron 实例执行安装或测试；本地模拟测试不等于真实宿主验收。
