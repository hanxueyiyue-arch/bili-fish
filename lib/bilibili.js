import { updateState, dateKey, clipped } from './storage.js';

// 全部外联点仅此一个根域名；不使用 Cookie、不支持自定义 URL、不跟随重定向。
export const API_ORIGIN = 'https://api.bilibili.com';
const PATHS = new Set([
  '/x/web-interface/popular',
  '/x/web-interface/view',
  '/x/v2/reply',
]);

export function createBiliClient({ dailyRequestLimit = 24 } = {}) {
  let queue = Promise.resolve();
  let nextTime = 0;

  async function request(path, params, signal) {
    if (!PATHS.has(path)) throw new Error('未获准的接口路径');
    const run = queue.then(async () => {
      const waitMs = Math.max(0, nextTime - Date.now());
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      if (signal?.aborted) throw new Error('请求已取消');
      await updateState(state => {
        const day = dateKey();
        if (state.quota?.day !== day) state.quota = { day, used: 0 };
        if (state.quota.used >= dailyRequestLimit) throw new Error('今日 B站 API 请求额度已用完');
        state.quota.used++;
      });
      nextTime = Date.now() + 3000;
      const url = new URL(path, API_ORIGIN);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetch(url, {
          method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { 'Accept': 'application/json', 'User-Agent': 'BiliFish/0.1 (read-only)' },
        });
        if (!response.ok) throw new Error(`B站 HTTP ${response.status}`);
        const length = Number(response.headers.get('content-length'));
        if (length > 1_000_000) throw new Error('响应超过安全大小限制');
        if (!response.body) throw new Error('无响应体');
        const reader = response.body.getReader();
        let bytes = 0;
        const parts = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1_000_000) { await reader.cancel(); throw new Error('响应超过安全大小限制'); }
          parts.push(value);
        }
        const merged = new Uint8Array(bytes);
        let pos = 0;
        for (const part of parts) { merged.set(part, pos); pos += part.length; }
        const json = JSON.parse(new TextDecoder().decode(merged));
        if (json.code !== 0) throw new Error(`B站接口返回 ${json.code}: ${clipped(json.message, 100)}`);
        return json.data;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function popular(count = 5, signal) {
    const size = Math.max(1, Math.min(5, Math.floor(count) || 5));
    const data = await request('/x/web-interface/popular', { pn: 1, ps: size }, signal);
    return (data?.list || []).slice(0, size).map(item => ({
      bvid: clipped(item.bvid, 20), title: clipped(item.title, 140),
      owner: clipped(item.owner?.name, 60), description: clipped(item.desc, 200),
      url: `https://www.bilibili.com/video/${clipped(item.bvid, 20)}`,
    }));
  }

  async function view(bvid, signal) {
    if (!/^BV[A-Za-z0-9]{10}$/.test(bvid)) throw new Error('只支持合法格式的 BV 号');
    const data = await request('/x/web-interface/view', { bvid }, signal);
    return {
      bvid, aid: data.aid, title: clipped(data.title, 160),
      owner: clipped(data.owner?.name, 80), description: clipped(data.desc, 1200),
      durationSeconds: data.duration, playCount: data.stat?.view,
      pages: (data.pages || []).slice(0, 20).map(p => clipped(p.part, 80)),
      url: `https://www.bilibili.com/video/${bvid}`,
      // 元数据不等于完整观看了视频，也没有读取画面和音频。
    };
  }

  async function comments(aid, signal) {
    if (!Number.isSafeInteger(aid) || aid <= 0) throw new Error('非法的 av 号');
    const data = await request('/x/v2/reply', { type: 1, oid: aid, pn: 1, ps: 5, sort: 2 }, signal);
    return (data?.replies || []).slice(0, 5).map(item => ({
      author: clipped(item.member?.uname, 40), text: clipped(item.content?.message, 400),
    }));
  }

  return { popular, view, comments };
}
