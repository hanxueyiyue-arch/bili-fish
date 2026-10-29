import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const home=await mkdtemp(join(tmpdir(),'bilifish-v02-'));
process.env.DSH_HOME=home;
const {readState,updateState}=await import('../lib/storage.js');
const {classifyVideo,selectVideos,developFromObservation,awake,lifeSummary,normalizeRoutine}=await import('../lib/life.js');
const {brainStrength,brainRecall,reconstructionCandidate}=await import('../lib/brainmem.js');
const {newMemory}=await import('../lib/memory.js');
const {createAutomation}=await import('../lib/automation.js');
const {safeSummary}=await import('../lib/dashboard.js');
after(async()=>rm(home,{recursive:true,force:true}));
const video=(bvid,title,description='')=>({bvid,title,description,owner:'公开UP主',url:`https://www.bilibili.com/video/${bvid}`});
const V1=video('BV1JYsd6sE4k','崩坏：星穹铁道 新版本');
const V2=video('BV1AAaa11AAa','小猫的日常生活');

test('0.1.1 风格 state.json 懒迁移，旧数据保持',async()=>{
  const original={version:1,bornAt:'2026-10-29T13:18:36.262Z',observations:[{method:'manual',videos:[V1]}],
    memories:[newMemory({title:'珊瑚',content:'旧记忆'})],diary:[{at:'2026-10-29T13:00:00.000Z',text:'旧日记'}],drafts:[{id:'old',text:'草稿'}],quota:{day:'2026-10-29',used:3},activity:[],
    automation:{enabled:false,nextRunAt:null,lastRunAt:null,lastError:null}};
  await mkdir(join(home,'bili-fish'),{recursive:true});
  await writeFile(join(home,'bili-fish','state.json'),JSON.stringify(original));
  const s=await readState();
  assert.equal(s.memories.length,1);assert.equal(s.observations.length,1);assert.equal(s.bornAt,original.bornAt);
  assert.equal(s.diary.length,1);assert.equal(s.drafts.length,1);
  assert.equal(lifeSummary(s).mood,'好奇');
  assert.equal(s.life,undefined,'只读加载不会强制迁移磁盘状态');
});

test('作息跨日与白天模式都正确',()=>{
  const cn=normalizeRoutine({timeZone:'Asia/Shanghai',wakeHour:9,sleepHour:23});
  assert.equal(awake(Date.parse('2026-10-29T05:00:00Z'),cn),true); // 13:00 +08
  assert.equal(awake(Date.parse('2026-10-29T18:00:00Z'),cn),false); // 02:00 +08
  const night=normalizeRoutine({timeZone:'UTC',wakeHour:22,sleepHour:6});
  assert.equal(awake(Date.parse('2026-10-29T23:00:00Z'),night),true);
  assert.equal(awake(Date.parse('2026-10-29T12:00:00Z'),night),false);
});

test('热门元数据推动兴趣和心情，自动日记有来源且不声称看过完整视频',()=>{
  const s={life:null,memories:[],diary:[]};
  const result=developFromObservation(s,[V1,V2],{method:'scheduled',now:Date.parse('2026-10-29T10:00:00Z')});
  assert.equal(result.developed,true);assert.ok(s.life.interests['游戏']>50);
  assert.equal(s.memories.length,1);assert.equal(s.memories[0].kind,'observation');
  assert.equal(s.life.interestHistory.length,1);
  assert.equal(s.memories[0].source.bvid,V1.bvid);assert.equal(s.diary.length,1);
  assert.match(s.diary[0].text,/并不是我已经完整观看/);
  assert.deepEqual(s.diary[0].sourceBvids,[V1.bvid,V2.bvid]);
  developFromObservation(s,[V1],{method:'scheduled',now:Date.parse('2026-10-29T11:00:00Z')});
  assert.equal(s.diary.length,1,'每天只自动写一篇');assert.equal(s.memories.length,1,'相同 BV 不重复存观察记忆');
});

test('手动观察会发展兴趣但不自写日记/观察记忆',()=>{
  const s={life:null,memories:[],diary:[]};
  developFromObservation(s,[V2],{method:'manual',now:Date.parse('2026-10-29T10:00:00Z')});
  assert.ok(s.life.interests['动物']>50);assert.equal(s.diary.length,0);assert.equal(s.memories.length,0);
});

test('依兴趣选择视频并控制最多取 3 条',()=>{
  const s={interests:{动物:95,游戏:10},experiences:[],routine:{timeZone:'UTC',wakeHour:9,sleepHour:23}};
  const selected=selectVideos([V1,V2],s,1,Date.parse('2026-10-29T12:00:00Z'));
  assert.equal(selected.length,1);assert.equal(selected[0].bvid,V2.bvid);
  assert.deepEqual(classifyVideo(V2),['动物']);
});

test('BrainMem 双尺度遗忘、细节比概览衰减快、回忆增强',()=>{
  const m=newMemory({title:'小猫',content:'可爱',importance:4});
  const born=Date.parse(m.createdAt);
  const early=brainStrength(m,born),later=brainStrength(m,born+40*86400000);
  assert.ok(later.strength<early.strength);
  assert.ok(later.detailStrength<later.strength);
  m.recallCount=3;m.lastRecalledAt=new Date(born+40*86400000).toISOString();
  assert.ok(brainStrength(m,born+40*86400000).strength>later.strength);
});

test('两跳标签唤醒与记忆重组均不修改原始证据',()=>{
  const a=newMemory({title:'猫咪',content:'猫咪视频',tags:'猫咪 动物',importance:5});
  const b=newMemory({title:'宠物医院',content:'一次咨询',tags:'动物 宠物',importance:4});
  const memories=[a,b],before=JSON.stringify(memories);
  const hits=brainRecall(memories,'猫咪');
  assert.equal(hits[0].title,'猫咪');
  assert.ok(hits.some(x=>x.id===b.id && x.awakened),'动物标签应支持两跳关联');
  const rec=reconstructionCandidate(memories,'猫咪');
  assert.equal(rec.persisted,false);assert.equal(rec.status,'unverified-candidate');
  assert.equal(JSON.stringify(memories),before);
});

test('睡眠时间不触发联网，仅记录延迟，并能停止调度',async()=>{
  let calls=0;
  const automation=createAutomation({swim:async()=>{calls++},hours:6,canBrowse:()=>false,log:()=>{}});
  await automation.control('start');
  await updateState(s=>{s.automation.nextRunAt=new Date(Date.now()-1000).toISOString();});
  assert.equal(await automation.tick(),false);assert.equal(calls,0);
  const s=await readState();assert.ok(s.activity.some(x=>x.type==='routine-rest'));
  assert.ok(Date.parse(s.automation.nextRunAt)>Date.now());
  await automation.control('stop');assert.equal((await automation.tick()),false);
  automation.dispose();
});

test('仪表盘包含养成状态和历史记录，旧字段保持',async()=>{
  const summary=safeSummary(await readState());
  assert.ok(summary.life);assert.ok(Array.isArray(summary.life.interests));
  assert.ok(Array.isArray(summary.life.interestHistory));
  assert.ok(summary.counters);assert.ok(summary.automation);
});
