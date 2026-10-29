import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

// Isolation is mandatory: these tests never read/write the user's real DSH_HOME.
const home = await mkdtemp(join(tmpdir(), 'bili-fish-harness-csrf-'));
process.env.DSH_HOME = home;
const { registerDashboard } = await import('../lib/dashboard.js');
after(async () => rm(home, { recursive: true, force: true }));

function mount(auth = undefined) {
  const routes = new Map();
  const actions = [];
  const dispose = registerDashboard({
    get: key => key === 'connection' ? { requestRejection: () => auth } : null,
    webServer: { register({ path, handler }) { routes.set(path, handler); return () => routes.delete(path); } },
  }, { async control(action) { actions.push(action); return { enabled: action === 'start' }; } });
  return { routes, actions, dispose };
}
function noAuthMount() {
  const routes = new Map();
  const dispose = registerDashboard({
    webServer: { register({ path, handler }) { routes.set(path, handler); return () => routes.delete(path); } },
  }, { async control() { throw Error('should not run'); } });
  return { routes, dispose };
}
async function invoke(m, path, { method='GET', headers={}, body='' }={}) {
  const req=Readable.from(body ? [Buffer.from(body)] : []);
  req.method=method;
  req.headers=headers;
  const res = { statusCode:200, headers:{}, data:'',
    setHeader(k,v){ this.headers[k.toLowerCase()] = v; },
    end(v=''){ this.data+=v; },
  };
  assert.ok(m.routes.has(path), 'route must be registered');
  await m.routes.get(path)(req,res);
  return {status:res.statusCode, headers:res.headers, json:res.data ? JSON.parse(res.data):null};
}
const API='/bili-fish/api';
const payload=action=>JSON.stringify({action});
const headers=(token, extra={})=>({'content-type':'application/json','x-bili-fish-csrf':token,...extra});

test('官方 Electron dsh-app://app Origin + 不同 Host：授权并携带令牌可以启动/停止',async()=>{
  const m=mount();
  try {
    const initial=await invoke(m,API+'/state',{headers:{origin:'dsh-app://app',host:'127.0.0.1:12345'}});
    assert.equal(initial.status,200);
    assert.match(initial.json.csrfToken,/^[a-f0-9]{64}$/);
    const token=initial.json.csrfToken;
    const desktop={origin:'dsh-app://app',host:'127.0.0.1:12345'};
    const start=await invoke(m,API+'/control',{method:'POST',headers:headers(token,desktop),body:payload('resume')});
    assert.equal(start.status,200);
    assert.equal(start.json.automation.enabled,true);
    const stop=await invoke(m,API+'/control',{method:'POST',headers:headers(token,desktop),body:payload('pause')});
    assert.equal(stop.status,200);
    assert.equal(stop.json.automation.enabled,false);
    assert.deepEqual(m.actions,['start','stop']);
  }finally{m.dispose();}
});

test('官方 IPC 请求的 Origin 缺失或 null 仍可在授权 + 有效令牌情况下操作',async()=>{
  const m=mount();
  try {
    const t=(await invoke(m,API+'/state')).json.csrfToken;
    for(const o of [undefined,'null']) {
      const hdr=headers(t,{host:'localhost:8888'});
      if(o) hdr.origin=o;
      assert.equal((await invoke(m,API+'/control',{method:'POST',headers:hdr,body:payload('resume')})).status,200);
    }
    assert.deepEqual(m.actions,['start','start']);
  }finally{m.dispose();}
});

test('无令牌、错误令牌、Unicode 畸形令牌都不能触发写入（返回 403 而非 503）',async()=>{
  const m=mount();
  try {
    const t=(await invoke(m,API+'/state')).json.csrfToken;
    for(const hdr of [
      {'content-type':'application/json'},
      headers('f'.repeat(64)===t?'e'.repeat(64):'f'.repeat(64)),
      headers('🐟'.repeat(64)),
      headers('a'.repeat(63)),
      headers('A'.repeat(64)),
    ]) {
      const result=await invoke(m,API+'/control',{method:'POST',headers:hdr,body:payload('resume')});
      assert.equal(result.status,403);
      assert.match(result.json.error,/CSRF/);
    }
    assert.deepEqual(m.actions,[]);
  }finally{m.dispose();}
});

test('未认证或宿主缺失鉴权服务，GET/POST 均失败且不泄露 CSRF 令牌',async()=>{
  for(const m of [mount(401),noAuthMount()]) {
    try {
      const g=await invoke(m,API+'/state');
      assert.ok([401,503].includes(g.status));
      assert.equal(g.json?.csrfToken,undefined);
      const p=await invoke(m,API+'/control',{method:'POST',headers:headers('f'.repeat(64)),body:payload('resume')});
      assert.ok([401,503].includes(p.status));
      assert.deepEqual(m.actions||[],[]);
    }finally{m.dispose();}
  }
});

test('重载插件后旧令牌失效，新令牌只在授权的本次实例有效',async()=>{
  const a=mount(),b=mount();
  try {
    const old=(await invoke(a,API+'/state')).json.csrfToken;
    const fresh=(await invoke(b,API+'/state')).json.csrfToken;
    assert.notEqual(old,fresh);
    assert.equal((await invoke(b,API+'/control',{method:'POST',headers:headers(old),body:payload('resume')})).status,403);
    assert.equal((await invoke(b,API+'/control',{method:'POST',headers:headers(fresh),body:payload('resume')})).status,200);
    assert.deepEqual(b.actions,['start']);
  }finally{a.dispose();b.dispose();}
});

test('CSRF 保护覆盖 set-routine 与 delete-test，状态 JSON 不缓存/不设置跨域响应头',async()=>{
  const m=mount();
  try {
    const g=await invoke(m,API+'/state');
    assert.equal(g.headers['cache-control'],'no-store');
    assert.equal(g.headers['access-control-allow-origin'],undefined);
    for(const action of [
      {action:'set-routine',timeZone:'Asia/Shanghai',wakeHour:9,sleepHour:23},
      {action:'delete-test',kind:'memory',id:'made-up',confirmation:'DELETE_TEST_DATA'},
    ]) {
      const res=await invoke(m,API+'/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(action)});
      assert.equal(res.status,403);
    }
    const routine=await invoke(m,API+'/control',{method:'POST',headers:headers(g.json.csrfToken),body:JSON.stringify({action:'set-routine',timeZone:'Asia/Tokyo',wakeHour:8,sleepHour:22})});
    assert.equal(routine.status,200);
    assert.equal(routine.json.routine.timeZone,'Asia/Tokyo');
  }finally{m.dispose();}
});

test('客户端面板携带控制令牌发出 POST，并将其与状态 GET 分离',async()=>{
  const client=await readFile(new URL('../lib/client.js',import.meta.url),'utf8');
  assert.match(client, /setCsrfToken\(typeof j\.csrfToken/);
  assert.match(client, /'x-bili-fish-csrf':csrfToken/);
  assert.match(client, /credentials:'same-origin'/);
  assert.match(client, /if\(!csrfToken\)/);
  assert.doesNotMatch(client, /[?&]csrfToken=/);
});
