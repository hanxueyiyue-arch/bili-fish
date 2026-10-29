import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// storage.js derives its data path at import time. Set the test root FIRST.
// This ensures `npm test` / `pnpm test` will never write to a real DSH_HOME.
const testHome = await mkdtemp(join(tmpdir(), 'bili-fish-v011-test-'));
process.env.DSH_HOME = testHome;
const { createAutomation, retryDelay, isRateLimited } = await import('../lib/automation.js');
const { readState, updateState, cleanTestRecord, testRecordList } = await import('../lib/storage.js');
const { newMemory, findMemories } = await import('../lib/memory.js');
const { safeSummary } = await import('../lib/dashboard.js');
after(async () => { await rm(testHome, { recursive: true, force: true }); });
test('查询匹配本身不会修改记忆对象', () => {
  const original = newMemory({title:'V0.1测试-蓝色珊瑚',content:'这是一条测试记忆，珊瑚',importance:4,tags:'珊瑚'});
  const before=JSON.stringify(original);
  const results=findMemories([original],'珊瑚',5);
  assert.equal(results.length,1);
  assert.equal(JSON.stringify(original),before);
});

test('只允许删除标记明确的测试数据，且删除前备份', async () => {
  const m=newMemory({title:'V0.1测试-蓝色珊瑚',content:'这是一条测试记忆。'});
  const real=newMemory({title:'正式记忆',content:'保留内容'});
  await updateState(s=>{s.memories.push(m,real);});
  let before=await readState();
  assert.equal(testRecordList(before).length,1);
  await assert.rejects(cleanTestRecord('memory',m.id,'wrong'));
  await assert.rejects(cleanTestRecord('memory',real.id,'DELETE_TEST_DATA'));
  const result=await cleanTestRecord('memory',m.id,'DELETE_TEST_DATA');
  assert.equal(result.deleted,true);
  const after=await readState();
  assert.deepEqual(after.memories.map(x=>x.title),['正式记忆']);
  assert.ok((await readdir(join(process.env.DSH_HOME,'bili-fish','backups'))).length>=1);
});

test('自动浏览默认关闭；显式开启后仅按完整周期安排；停止保留关闭状态', async () => {
  let calls=0;
  const automation=createAutomation({swim:async()=>{calls++;},hours:6,log:()=>{}});
  assert.equal(await automation.tick(),false);
  assert.equal(calls,0);
  const enabled=await automation.control('start');
  assert.equal(enabled.enabled,true);
  assert.ok(Date.parse(enabled.nextRunAt)>Date.now()+5*3600_000);
  assert.equal(await automation.tick(),false);
  await updateState(s=>{s.automation.nextRunAt=new Date(Date.now()-1000).toISOString();});
  assert.equal(await automation.tick(),true);
  assert.equal(calls,1);
  assert.equal((await automation.control('stop')).enabled,false);
  assert.equal(await automation.tick(),false);
  assert.equal(calls,1);
  automation.dispose();
});

test('风控立即停机而其他错误退避', async () => {
  assert.ok(isRateLimited('B站接口返回 -412'));
  assert.equal(retryDelay(1),15*60000);
  assert.equal(retryDelay(3),60*60000);
  const a=createAutomation({swim:async()=>{throw Error('B站 HTTP 412')},hours:6,log:()=>{}});
  await a.control('start');
  await updateState(s=>{s.automation.nextRunAt=new Date(Date.now()-1000).toISOString();});
  assert.equal(await a.tick(),false);
  const s=await readState();
  assert.equal(s.automation.enabled,false);
  assert.equal(s.automation.pausedByRisk,true);
  a.dispose();
});

test('可视化摘要只提取本地状态，不含密钥字段', async () => {
  const state=await readState();
  const summary=safeSummary(state);
  assert.ok(Array.isArray(summary.activity));
  assert.equal(Object.hasOwn(summary,'credentials'),false);
});
