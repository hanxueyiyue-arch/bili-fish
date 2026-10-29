import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readState, updateState, activity, testRecordList, cleanTestRecord } from './storage.js';
import { lifeSummary, normalizeLife, normalizeRoutine, DEFAULT_ROUTINE } from './life.js';
import { brainStrength } from './brainmem.js';

function respond(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(JSON.stringify(value));
}
async function body(req) {
  let count = 0; const chunks = [];
  for await (const chunk of req) {
    count += chunk.length;
    if (count > 8_192) throw new Error('请求体超过 8 KiB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function safeSummary(s, defaultRoutine = DEFAULT_ROUTINE) {
  return {
    bornAt: s.bornAt,
    counters: { memories: s.memories.length, observations: s.observations.length, diary: s.diary.length, drafts: s.drafts.length },
    quota: s.quota,
    automation: s.automation,
    life: lifeSummary(s,Date.now(),defaultRoutine),
    memories: s.memories.slice(-30).map(x => ({ id:x.id, title:x.title, content:x.content, tags:x.tags, createdAt:x.createdAt, recallCount:x.recallCount,
      kind:x.kind||'legacy-unclassified', source:x.source||null, brainStrength:Number(brainStrength(x).strength.toFixed(3)) })),
    diary: s.diary.slice(-15),
    drafts: s.drafts.slice(-15),
    activity: s.activity.slice(-80),
    tests: testRecordList(s),
  };
}
// The official DeepSeek Harness Electron desktop loads its UI at dsh-app://app/.
// Host API fetches may traverse Electron IPC and use an Origin that differs from
// an HTTP Host header (or omit Origin entirely). Comparing Origin === Host causes
// false 403 errors. We keep Harness authorization and require an unpredictable,
// process-local CSRF token on every mutation. No cross-origin CORS headers are set.
function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || !/^[0-9a-f]{64}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}
export function registerDashboard(ctx, automation, {defaultRoutine = DEFAULT_ROUTINE} = {}) {
  const csrfToken = randomBytes(32).toString('hex');
  const handlers = [];
  const route = (path, handler) => handlers.push(ctx.webServer.register({ kind:'exact', path, handler: async (req,res) => {
    // No fail-open fallback if the DSH authentication/trust gate is absent.
    try {
      const connection = ctx.get?.('connection') || ctx.connection;
      if (typeof connection?.requestRejection !== 'function') return respond(res,503,{error:'DSH 权限验证不可用'});
      const rejected = connection.requestRejection(req);
      if (rejected !== undefined && rejected !== null && rejected !== false) {
        res.statusCode = typeof rejected === 'number' ? rejected : 403; res.end(); return;
      }
      if (req.method !== 'GET' && !tokenMatches(req.headers['x-bili-fish-csrf'], csrfToken))
        return respond(res,403,{error:'CSRF 验证失败：请刷新小鱼控制台后重试'});
      try { await handler(req,res); } catch(e) { respond(res,400,{error:String(e?.message||e)}); }
    } catch { return respond(res,503,{error:'权限检查失败'}); }
  }}));
  route('/bili-fish/api/state', async (req,res) => {
    if (req.method !== 'GET') return respond(res,405,{error:'仅允许 GET'});
    respond(res,200,{ok:true,data:safeSummary(await readState(),defaultRoutine),csrfToken});
  });
  route('/bili-fish/api/control', async(req,res) => {
    if (req.method !== 'POST') return respond(res,405,{error:'仅允许 POST'});
    if (!String(req.headers['content-type']||'').startsWith('application/json')) return respond(res,415,{error:'只接受 JSON'});
    const input = await body(req);
    if (input.action === 'pause') return respond(res,200,{ok:true,automation:await automation.control('stop')});
    if (input.action === 'resume') return respond(res,200,{ok:true,automation:await automation.control('start')});
    if (input.action === 'delete-test') return respond(res,200,{ok:true,result:await cleanTestRecord(input.kind,input.id,input.confirmation)});
    if (input.action === 'set-routine') {
      if (!['Asia/Shanghai','Asia/Tokyo','UTC'].includes(input.timeZone)
        || !Number.isInteger(input.wakeHour) || !Number.isInteger(input.sleepHour)
        || input.wakeHour < 0 || input.wakeHour > 23 || input.sleepHour < 0 || input.sleepHour > 23
        || input.wakeHour === input.sleepHour) return respond(res,400,{error:'无效的作息时间或时区'});
      const routine=normalizeRoutine(input);
      await updateState(s=>{s.life=normalizeLife(s.life,defaultRoutine);s.life.routine=routine;activity(s,'routine-change','在可视化面板修改小鱼的作息');});
      return respond(res,200,{ok:true,routine});
    }
    respond(res,400,{error:'不支持的操作'});
  });
  return () => { for (const dispose of handlers) try { dispose?.(); } catch {} };
}
