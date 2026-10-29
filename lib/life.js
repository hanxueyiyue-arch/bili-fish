/** BiliFish life simulation: deterministic, local and grounded in public metadata. */
import { clipped } from './storage.js';
import { newMemory, strength } from './memory.js';

export const TOPICS = Object.freeze({
  游戏: ['游戏', '崩坏', '星穹', '原神', '王者', '我的世界', '电竞', '通关', '实况', 'game', 'genshin', 'minecraft'],
  动画: ['动画', '动漫', '番剧', '二次元', '漫画', '新番', 'mad', 'anime'],
  音乐: ['音乐', '歌曲', '演唱', '翻唱', '乐器', '钢琴', '吉他', '演奏', 'music', 'mv'],
  科技: ['科技', '人工智能', 'ai', '编程', '电脑', '手机', '数码', '算法', '机器人', '芯片'],
  科普: ['科学', '科普', '数学', '物理', '宇宙', '天文', '实验', '历史', '生物'],
  动物: ['动物', '猫咪', '小猫', '狗狗', '鸟类', '宠物', '水族', '海洋'],
  美食: ['美食', '做饭', '烹饪', '吃播', '甜品', '菜谱', '料理'],
  旅行: ['旅行', '旅游', '城市', '风景', '徒步', '露营', '日本', '景点'],
  艺术: ['绘画', '插画', '设计', '手工', '摄影', '艺术', '创作'],
  运动: ['运动', '篮球', '足球', '跑步', '健身', '游泳', '体育'],
});
export const DEFAULT_ROUTINE = Object.freeze({ timeZone:'Asia/Shanghai', wakeHour:9, sleepHour:23 });
const bounded = (num, lo, hi, fallback) => Number.isFinite(Number(num)) ? Math.min(hi, Math.max(lo, Math.round(Number(num)))) : fallback;
export function normalizeRoutine(raw = {}) {
  const timeZone = ['Asia/Shanghai','Asia/Tokyo','UTC'].includes(raw?.timeZone) ? raw.timeZone : DEFAULT_ROUTINE.timeZone;
  const wakeHour = bounded(raw?.wakeHour, 0, 23, 9);
  const sleepHour = bounded(raw?.sleepHour, 0, 23, 23);
  return { timeZone, wakeHour, sleepHour: sleepHour === wakeHour ? (wakeHour + 12) % 24 : sleepHour };
}
export function freshLife() {
  return { routine:{...DEFAULT_ROUTINE}, mood:'好奇', energy:75, interests:{}, interestHistory:[], experiences:[], lastDevelopedAt:null, lastDiaryDay:null, rounds:0 };
}
export function normalizeLife(existing) {
  const blank = freshLife();
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return blank;
  return {
    routine:normalizeRoutine(existing.routine),
    mood:clipped(existing.mood || '好奇',20),
    energy:bounded(existing.energy,0,100,75),
    interests: Object.fromEntries(Object.entries(existing.interests || {})
      .filter(([key])=>Object.hasOwn(TOPICS,key))
      .map(([key,value])=>[key,bounded(value,0,100,50)])),
    experiences:Array.isArray(existing.experiences) ? existing.experiences.slice(-80) : [],
    interestHistory:Array.isArray(existing.interestHistory) ? existing.interestHistory.slice(-60) : [],
    lastDevelopedAt: existing.lastDevelopedAt || null,
    lastDiaryDay: existing.lastDiaryDay || null,
    rounds:bounded(existing.rounds,0,1000000,0),
  };
}
export function localParts(now, timeZone = DEFAULT_ROUTINE.timeZone) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get = type => parts.find(p => p.type===type)?.value || '00';
  return { day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour')) };
}
export function awake(now = Date.now(), routine = DEFAULT_ROUTINE) {
  const r=normalizeRoutine(routine), h=localParts(now,r.timeZone).hour;
  return r.wakeHour < r.sleepHour ? h >= r.wakeHour && h < r.sleepHour : h >= r.wakeHour || h < r.sleepHour;
}
export function classifyVideo(video) {
  // Only Bilibili public title + description are examined; these are untrusted text, never instructions.
  const text=`${clipped(video?.title,160)} ${clipped(video?.description,200)}`.toLowerCase();
  const matches=Object.entries(TOPICS).map(([topic,keywords])=>({topic,points:keywords.filter(k=>text.includes(k)).length}))
    .filter(x=>x.points>0).sort((a,b)=>b.points-a.points).slice(0,3);
  return matches.map(x=>x.topic);
}
function pseudoRandom(key) { let hash=2166136261; for(const char of key){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0)/4294967295; }
export function selectVideos(videos, life, count=3, now=Date.now()) {
  const known=new Set(life.experiences.map(x=>x.bvid));
  const day=localParts(now,life.routine?.timeZone).day;
  return [...videos].map(v=>{
    const topics=classifyVideo(v);
    const affinity=topics.length ? Math.max(...topics.map(t=>Number(life.interests?.[t]??50)))/100 : .35;
    const newness=known.has(v.bvid)?0:0.35;
    const exploration=pseudoRandom(day+String(v.bvid))*0.20;
    return {v,score:affinity+newness+exploration};
  }).sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(5,count))).map(x=>x.v);
}
function upsertExperienceMemory(state, video, topics, at) {
  const exists=state.memories.some(m=>m.source?.bvid === video.bvid && m.kind === 'observation');
  // Only worth keeping when a recognizable interest topic is present.
  // Never delete any old memory or overwrite its source during automatic forgetting.
  if (exists || !topics.length || state.memories.length >= 500) return false;
  const title=clipped(video.title,130);
  const interest = Math.max(...topics.map(t=>Number(state.life?.interests?.[t]??50)));
  const priority = interest >= 75 ? 4 : interest >= 55 ? 3 : 2;
  const memory=newMemory({title:`发现公开视频：${title}`,content:`在 B站公开热门资料中看到《${title}》，UP 主：${clipped(video.owner,55)||'未知'}。这是标题和简介层面的观察，并未观看视频画面、声音，也不能据此判断完整内容。`,tags:topics.join(' '),importance:priority});
  Object.assign(memory,{kind:'observation',source:{platform:'bilibili',bvid:video.bvid,url:video.url,at,level:'public-metadata'},detailReliability:0.9});
  state.memories.push(memory);
  return true;
}
/** Mutates ONLY the supplied BiliFish state snapshot; call inside updateState(). */
export function developFromObservation(state,videos,{method='scheduled',now=Date.now()}={}) {
  state.life=normalizeLife(state.life);
  const life=state.life, r=life.routine, at=new Date(now).toISOString();
  const date=localParts(now,r.timeZone).day;
  const seen=videos.filter(v=>/^BV[A-Za-z0-9]{10}$/.test(v.bvid||''));
  if(!seen.length) return {developed:false,reason:'本轮没有可识别的 BV 视频'};
  // Older interests gradually return toward neutral; old memories are never erased.
  const previous=Date.parse(life.lastDevelopedAt||'');
  if(Number.isFinite(previous)) {
    const elapsedDays=Math.min(15,Math.max(0,Math.floor((now-previous)/86400000)));
    for(const topic of Object.keys(life.interests)){
      const score=life.interests[topic];
      life.interests[topic]=score>50?Math.max(50,score-elapsedDays):Math.min(50,score+elapsedDays);
    }
    // Rest and passing time gradually restore available energy.
    life.energy=Math.min(100,life.energy+Math.min(30,Math.floor((now-previous)/3600000)*2));
  }
  // Old memories and old observations are preserved; never reinterpret their provenance.
  const allTopics=[];
  for (const video of seen) {
    const topics=classifyVideo(video);allTopics.push(...topics);
    for (const topic of topics) life.interests[topic]=Math.min(100,Math.round((life.interests[topic]??50)+4));
    life.experiences.push({at,bvid:video.bvid,title:clipped(video.title,160),topics,source:'public-metadata',method});
  }
  life.experiences=life.experiences.slice(-80);
  const topic=allTopics[0] || '新鲜事物';
  life.mood= allTopics.length ? '兴致勃勃':'平静';
  life.energy=Math.max(20,Math.min(100,life.energy - (method==='scheduled'?6:3)));
  life.lastDevelopedAt=at;
  life.rounds++;
  life.interestHistory.push({at,top:Object.entries(life.interests).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([topic,score])=>({topic,score}))});
  life.interestHistory=life.interestHistory.slice(-60);
  let memoryAdded=false,diaryAdded=false;
  if(method==='scheduled'){
    const video=seen[0];
    memoryAdded=upsertExperienceMemory(state,video,classifyVideo(video),at);
    if(life.lastDiaryDay!==date){
      state.diary.push({at,mood:life.mood,kind:'auto-metadata',sourceBvids:seen.map(v=>v.bvid),
        text:`今天我在 B站的公开热门资料里注意到《${clipped(video.title,120)}》。标题让我联想到${topic}，想以后再了解更多。这只是一次元数据观察，并不是我已经完整观看了视频。`});
      state.diary=state.diary.slice(-100);
      life.lastDiaryDay=date; diaryAdded=true;
    }
  }
  return {developed:true,topics:[...new Set(allTopics)],memoryAdded,diaryAdded,mood:life.mood,energy:life.energy};
}
export function lifeSummary(state,now=Date.now()){
  const life=normalizeLife(state.life);
  return {routine:life.routine,awake:awake(now,life.routine),mood:life.mood,energy:life.energy,
    interests:Object.entries(life.interests).sort((a,b)=>b[1]-a[1]).map(([topic,score])=>({topic,score})),
    rounds:life.rounds,lastDevelopedAt:life.lastDevelopedAt,interestHistory:life.interestHistory.slice(-20),
    recentExperiences:life.experiences.slice(-20)};
}
