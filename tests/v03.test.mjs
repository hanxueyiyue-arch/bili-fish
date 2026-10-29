import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const home=await mkdtemp(join(tmpdir(),'bili-fish-v03-'));
process.env.DSH_HOME=home;
const {readState,updateState,STATE_FILE} = await import('../lib/storage.js');
const {newMemory}=await import('../lib/memory.js');
const {LAYERS,memoryLayer,queryTerms,buildMemoryIndex,searchIndex,compactContext,memoryOverview,consolidationSuggestion} = await import('../lib/brainmem-v2.js');
const {ARCHIVE_DIR,archiveMemoryIds,restoreArchivedMemory,listArchives,mergeMemories}=await import('../lib/memory-archive.js');
const {brainStrength}=await import('../lib/brainmem.js');
const {safeSummary}=await import('../lib/dashboard.js');
after(async()=>rm(home,{recursive:true,force:true}));
const m=(title,content,tags='',importance=4)=>newMemory({title,content,tags,importance});

test('V0.3 分层记忆兼容未迁移的旧记录，且不修改原文',()=>{
  const old=m('旧珊瑚记忆','来自过去的文字','珊瑚');
  old.kind='legacy-unclassified';const before=JSON.stringify(old);
  assert.equal(memoryLayer(old),'episodic');
  assert.deepEqual(LAYERS,['episodic','semantic','autobiographical','preference']);
  const preference=m('喜欢音乐','经常寻找音乐视频');preference.layer='preference';
  assert.equal(memoryLayer(preference),'preference');
  assert.equal(JSON.stringify(old),before);
});

test('V0.3 倒排索引优先返回相关记忆，不返回无关联记录',()=>{
  const a=m('天文科普','讲述恒星的演化和宇宙','科学 宇宙');
  const b=m('烹饪记录','如何制作番茄炒蛋','美食');
  const hits=searchIndex(buildMemoryIndex([a,b]),'宇宙');
  assert.equal(hits[0].memory.id,a.id);
  assert.ok(!hits.some(x=>x.memory.id===b.id));
});

test('V0.3 轻量概念扩展可以召回近义主题，但不凭空补充内容',()=>{
  const a=m('宇宙空间','星系天文知识','科普');
  const hits=searchIndex(buildMemoryIndex([a]),'太空');
  assert.equal(hits[0].memory.id,a.id);
  assert.ok(queryTerms('太空').expansions.size>0);
});

test('V0.3 上下文大小受 maxTokens 预算约束，且有 provenance',()=>{
  const rows=Array.from({length:100},(_,i)=>m(`宇宙星系第${i}集`,'公开资料里的天文内容'.repeat(30),'宇宙 天文'));
  rows[0].kind='observation';rows[0].source={platform:'bilibili',level:'public-metadata',bvid:'BV1JYsd6sE4k'};
  for(const budget of [200,500,800,1600]){
    const ctx=compactContext(rows,'宇宙',{maxTokens:budget,limit:10});
    assert.ok(JSON.stringify(ctx).length<=budget,`budget=${budget}`);
    assert.ok(ctx.items.length<=10);
    assert.equal(ctx.readOnly,true);
    assert.equal(ctx.evidenceOnly,true);
  }
  const output=compactContext([rows[0]],'宇宙',{maxTokens:1000});
  assert.equal(output.items[0].source.bvid,'BV1JYsd6sE4k');
});

test('V0.3 回忆强度仅逻辑衰减，原始证据不被删除或更改',()=>{
  const memory=m('一件小事','真实证据', '',1),before=JSON.stringify(memory);
  const now=Date.parse(memory.createdAt);
  const late=brainStrength(memory,now+365*86400000);
  assert.ok(late.strength<brainStrength(memory,now).strength);
  const ctx=compactContext([memory],'小事',{now:now+365*86400000});
  assert.ok(ctx.items.every(x=>!x.excerpt||!x.excerpt.includes('虚构')));
  assert.equal(JSON.stringify(memory),before);
});

test('V0.3 巩固建议只引用源 UUID，绝不自动保存',()=>{
  const a=m('星星','我看到星星','天文'),b=m('天文学','相关故事','天文');
  const original=JSON.stringify([a,b]);
  const c=consolidationSuggestion([a,b],'天文');
  assert.equal(c.persisted,false);assert.equal(c.status,'unverified');
  assert.ok(c.sourceIds.includes(a.id));
  assert.equal(JSON.stringify([a,b]),original);
});

test('V0.3 归档预览只读，未确认不能删除',async()=>{
  const a=m('测试归档','保存的事实');
  await updateState(s=>s.memories.push(a));
  const before=await readFile(STATE_FILE,'utf8');
  const preview=await archiveMemoryIds([a.id],null,{dryRun:true});
  assert.equal(preview.willBackup,true);
  assert.equal(before,await readFile(STATE_FILE,'utf8'));
  await assert.rejects(archiveMemoryIds([a.id],'wrong'),/确认口令/);
  assert.equal((await readState()).memories.length,1);
});

test('V0.3 归档为独立原始文件，活跃区移除，状态备份存在',async()=>{
  const id=(await readState()).memories[0].id;
  const result=await archiveMemoryIds([id],'ARCHIVE_MEMORIES');
  assert.equal(result.archived,1);
  assert.equal((await readState()).memories.length,0);
  const archived=await listArchives();assert.equal(archived.length,1);assert.equal(archived[0].id,id);
  const files=await readdir(join(home,'bili-fish','backups'));
  assert.ok(files.some(x=>x.endsWith('.json')));
  const merged=mergeMemories([archived[0]],archived);
  assert.equal(merged.length,1,'碰到中途崩溃产生的重复 UUID 也不得重复展示');
});

test('V0.3 归档后的记忆可再次检索，保留全文',async()=>{
  const archived=await listArchives();
  const hits=compactContext(mergeMemories((await readState()).memories,archived),'归档',{maxTokens:800});
  assert.equal(hits.items.length,1);
  assert.equal(hits.items[0].id,archived[0].id);
});

test('V0.3 恢复需要确认，恢复后保留归档副本',async()=>{
  const archived=await listArchives();const id=archived[0].id;
  await assert.rejects(restoreArchivedMemory(id,'NO'),/确认口令/);
  assert.equal((await readState()).memories.length,0);
  const result=await restoreArchivedMemory(id,'RESTORE_MEMORY');
  assert.equal(result.restored,true);
  assert.equal((await readState()).memories[0].id,id);
  assert.equal((await listArchives())[0].id,id);
});

test('V0.3 非法 ID 拒绝路径穿越，失败前无文件副作用',async()=>{
  await assert.rejects(archiveMemoryIds(['../../private.json'],'ARCHIVE_MEMORIES'),/UUID/);
  await assert.rejects(restoreArchivedMemory('../danger','RESTORE_MEMORY'),/UUID/);
});

test('V0.3 旧的 state.json 结构和 Dashboard 已有字段保持兼容',async()=>{
  const s=await readState();
  assert.equal(s.version,1);
  const d=safeSummary(s);
  assert.ok(d.counters&&d.life&&d.automation&&d.memoryV3);
  assert.equal(d.memoryV3.active,1);
  assert.equal(d.memoryV3.layers.episodic,1);
});

test('V0.3 整合统计反映多类层级及记忆阶段',()=>{
  const rows=[m('清晰的记忆','日常'),m('科学知识','知识'),m('我成长了','过去'),m('喜欢动画','兴趣')];
  for(const [i,layer] of LAYERS.entries())rows[i].layer=layer;
  const summary=memoryOverview(rows);
  assert.equal(summary.active,4);
  for(const layer of LAYERS)assert.equal(summary.layers[layer],1);
  assert.equal(Object.values(summary.stages).reduce((a,b)=>a+b,0),4);
});


test('V0.3 超长查询仍遵守最小上下文预算',()=>{
  const result=compactContext([], '珊'.repeat(150),{maxTokens:200});
  assert.ok(JSON.stringify(result).length<=200);
  assert.equal(result.readOnly,true);
});

test('V0.3 恢复并强化后的同 UUID 可再次归档，旧归档版本保留',async()=>{
  const row=(await readState()).memories[0];
  await updateState(s=>{s.memories.find(x=>x.id===row.id).recallCount+=1;});
  const result=await archiveMemoryIds([row.id],'ARCHIVE_MEMORIES');
  assert.equal(result.archived,1);
  assert.equal((await listArchives())[0].recallCount,1);
  const files=await readdir(ARCHIVE_DIR);
  assert.ok(files.some(x=>x.startsWith(row.id+'.history-')));
  assert.equal((await readState()).memories.length,0);
});
