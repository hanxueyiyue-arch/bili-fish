import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const home=await mkdtemp(join(tmpdir(),'bilifish-v021-fixes-'));
process.env.DSH_HOME=home;
const { readState, updateState, isTestRecord, testRecordList, cleanTestRecord }=await import('../lib/storage.js');
const { newMemory }=await import('../lib/memory.js');
const { normalizeRoutine, normalizeLife, lifeSummary, developFromObservation }=await import('../lib/life.js');
const { safeSummary, registerDashboard }=await import('../lib/dashboard.js');
const { readPublicVideo }=await import('../lib/video-observation.js');
const { Readable }=await import('node:stream');
after(async()=>rm(home,{recursive:true,force:true}));
const custom=normalizeRoutine({timeZone:'Asia/Tokyo',wakeHour:8,sleepHour:22});
const video={aid:123,bvid:'BV1JYsd6sE4k',title:'崩坏：星穹铁道 新版本',description:'游戏介绍',owner:'公开 UP 主',url:'https://www.bilibili.com/video/BV1JYsd6sE4k'};
const mockClient=comments=>({view:async()=>video,comments});

function mockDashboard(defaultRoutine){
  const routes=new Map();
  const ctx={get:key=>key==='connection'?{requestRejection:()=>undefined}:undefined,
    webServer:{register({path,handler}){routes.set(path,handler);return()=>routes.delete(path);}}};
  const dispose=registerDashboard(ctx,{control:async()=>({enabled:false})},{defaultRoutine});
  return {routes,dispose};
}
async function getRoute(routes,path){
  const req=Readable.from([]);req.method='GET';req.headers={};
  const res={statusCode:200,data:'',setHeader(){},end(value=''){this.data+=value;}};
  await routes.get(path)(req,res);
  return {status:res.statusCode,data:JSON.parse(res.data)};
}

test('V0.2.1 自定义作息在首次生命初始化、只读摘要、自动成长中保持一致',()=>{
  const s={life:null,memories:[],diary:[]};
  assert.deepEqual(lifeSummary(s,Date.now(),custom).routine,custom);
  assert.deepEqual(safeSummary({...s,observations:[],drafts:[],activity:[],quota:{},automation:{}},custom).life.routine,custom);
  developFromObservation(s,[video],{method:'scheduled',now:Date.parse('2026-10-29T12:00:00Z'),defaultRoutine:custom});
  assert.deepEqual(s.life.routine,custom);
  assert.equal(s.life.rounds,1);
});

test('V0.2.1 已保存的用户作息优先于新的插件默认值',()=>{
  const saved=normalizeRoutine({timeZone:'UTC',wakeHour:20,sleepHour:4});
  assert.deepEqual(normalizeLife({routine:saved,energy:55},custom).routine,saved);
  assert.deepEqual(normalizeLife(null,custom).routine,custom);
});

test('V0.2.1 Dashboard 的 GET 路由接收并使用插件配置默认作息',async()=>{
  const x=mockDashboard(custom);
  try {
    const res=await getRoute(x.routes,'/bili-fish/api/state');
    assert.equal(res.status,200);
    assert.deepEqual(res.data.data.life.routine,custom);
  }finally{x.dispose();}
});

test('V0.2.1 评论请求中取消：不得写入手动观察/兴趣成长',async()=>{
  const before=await readState();
  const signal=new AbortController();
  const client=mockClient(async()=>{signal.abort();throw new Error('模拟网络失败');});
  await assert.rejects(readPublicVideo({client,bvid:video.bvid,signal:signal.signal,defaultRoutine:custom}),/请求已取消/);
  const after=await readState();
  assert.deepEqual(after.observations,before.observations);
  assert.equal(after.life,before.life);
});

test('V0.2.1 AbortError 即使信号尚未置位也不得被转换为 commentsWarning',async()=>{
  const cancel=new Error('上游中断');cancel.name='AbortError';
  const client=mockClient(async()=>{throw cancel;});
  const before=await readState();
  await assert.rejects(readPublicVideo({client,bvid:video.bvid}),e=>e===cancel);
  assert.deepEqual((await readState()).observations,before.observations);
});

test('V0.2.1 普通评论错误允许保存元数据但明确返回警告，并采用配置作息',async()=>{
  const client=mockClient(async()=>{throw new Error('评论服务临时不可用');});
  const result=await readPublicVideo({client,bvid:video.bvid,defaultRoutine:custom});
  assert.match(result.commentsWarning,/评论服务临时不可用/);
  const state=await readState();
  assert.equal(state.observations.at(-1).method,'manual-video');
  assert.deepEqual(state.life.routine,custom);
});

test('V0.2.1 原子写入在提交前发现取消，磁盘数据不发生变化',async()=>{
  const before=await readState();
  const ctrl=new AbortController();
  await assert.rejects(updateState(state=>{
    state.observations.push({method:'should-not-commit'});
    ctrl.abort();
  },{signal:ctrl.signal}),/请求已取消/);
  assert.deepEqual((await readState()).observations,before.observations);
});

test('V0.2.1 仅显式标记的数据可清理；宽泛标题或正文相似不能误删',async()=>{
  const a=newMemory({title:'V0.1测试-蓝色珊瑚',content:'这是一条测试记忆，但我其实是真实记录'});
  const b=newMemory({title:'其他',content:'正常记录'});b.kind='test';
  const c=newMemory({title:'保留',content:'普通记忆'});
  await updateState(s=>{
    s.memories.push(a,b,c);
    s.diary.push({at:'2026-10-29T00:00:01Z',mood:'好奇',text:'蓝色珊瑚测试，不应被误删'});
    s.drafts.push({id:'draft-1',kind:'comment',text:'BiliFish V0.1 功能测试草稿的改写版',targetBvid:video.bvid});
    s.diary.push({at:'2026-10-29T00:00:02Z',text:'一条显式测试日记',isTest:true});
    s.drafts.push({id:'draft-2',kind:'comment',text:'明确的测试草稿',targetBvid:video.bvid,isTest:true});
  });
  const state=await readState();
  assert.equal(isTestRecord('memory',a),false);
  const tests=testRecordList(state);
  assert.equal(tests.length,3);
  assert.deepEqual(tests.map(x=>x.id).sort(),[b.id,'2026-10-29T00:00:02Z','draft-2'].sort());
  await assert.rejects(cleanTestRecord('memory',a.id,'DELETE_TEST_DATA'),/只能删除/);
  const did=await cleanTestRecord('draft','draft-2','DELETE_TEST_DATA');
  assert.equal(did.deleted,true);
  assert.equal((await readState()).drafts.some(x=>x.id==='draft-1'),true);
});

test('V0.2.1 旧版三条完全匹配的教学示例仍能识别，其他正式记录不会受影响',()=>{
  assert.equal(isTestRecord('memory',{
    title:'V0.1测试-蓝色珊瑚',content:'小鱼今天在想象中的海底发现了一片蓝色珊瑚，感到非常好奇。这是一条测试记忆，并非真实的 B站经历。',tags:'测试 珊瑚 海洋',
  }),true);
  assert.equal(isTestRecord('diary',{
    mood:'好奇',text:'今天我开始测试自己的记忆能力。我记下了一片想象中的蓝色珊瑚，还成功回忆起了它。这只是一次功能测试，但我很高兴自己能够保存经历。',
  }),true);
  assert.equal(isTestRecord('draft',{
    kind:'comment',targetBvid:video.bvid,text:'这是一条 BiliFish V0.1 功能测试草稿，仅用于验证本地存储，不需要实际发布。',
  }),true);
  assert.equal(isTestRecord('diary',{mood:'正常',text:'包含测试与蓝色珊瑚的正式日记'}),false);
});
