import { readState, testRecordList, cleanTestRecord } from './storage.js';

function respond(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
export function safeSummary(s) {
  return {
    bornAt: s.bornAt,
    counters: { memories: s.memories.length, observations: s.observations.length, diary: s.diary.length, drafts: s.drafts.length },
    quota: s.quota,
    automation: s.automation,
    memories: s.memories.slice(-30).map(x => ({ id:x.id, title:x.title, content:x.content, tags:x.tags, createdAt:x.createdAt, recallCount:x.recallCount })),
    diary: s.diary.slice(-15),
    drafts: s.drafts.slice(-15),
    activity: s.activity.slice(-80),
    tests: testRecordList(s),
  };
}
// Strictly validate host+origin for writes. DSH's authentication is still required.
function originMatches(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase() && /^https?:$/.test(new URL(origin).protocol); }
  catch { return false; }
}
export function registerDashboard(ctx, automation) {
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
      if (req.method !== 'GET' && !originMatches(req)) return respond(res,403,{error:'Origin 不匹配'});
      try { await handler(req,res); } catch(e) { respond(res,400,{error:String(e?.message||e)}); }
    } catch { return respond(res,503,{error:'权限检查失败'}); }
  }}));
  route('/bili-fish/api/state', async (req,res) => {
    if (req.method !== 'GET') return respond(res,405,{error:'仅允许 GET'});
    respond(res,200,{ok:true,data:safeSummary(await readState())});
  });
  route('/bili-fish/api/control', async(req,res) => {
    if (req.method !== 'POST') return respond(res,405,{error:'仅允许 POST'});
    if (!String(req.headers['content-type']||'').startsWith('application/json')) return respond(res,415,{error:'只接受 JSON'});
    const input = await body(req);
    if (input.action === 'pause') return respond(res,200,{ok:true,automation:await automation.control('stop')});
    if (input.action === 'resume') return respond(res,200,{ok:true,automation:await automation.control('start')});
    if (input.action === 'delete-test') return respond(res,200,{ok:true,result:await cleanTestRecord(input.kind,input.id,input.confirmation)});
    respond(res,400,{error:'不支持的操作'});
  });
  return () => { for (const dispose of handlers) try { dispose?.(); } catch {} };
}
