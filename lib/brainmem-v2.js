/** BrainMem V2: deterministic, locally indexed, evidence-first, bounded-context memory.
 * No remote embeddings, model calls, automatic deletion, or arbitrary file access.
 */
import { lexemes } from './memory.js';
import { brainStrength } from './brainmem.js';
import { clipped } from './storage.js';

export const LAYERS = Object.freeze(['episodic', 'semantic', 'autobiographical', 'preference']);
const CONCEPTS = Object.freeze([
  ['天文','宇宙','太空','星球','星系','星空','恒星','行星','astronomy','space'],
  ['游戏','电竞','通关','游玩','game','gaming'],
  ['猫','猫咪','小猫','喵','宠物猫'],
  ['科学','科普','知识','研究','science'],
  ['动画','动漫','番剧','anime'],
  ['音乐','歌曲','演奏','music'],
  ['美食','烹饪','做饭','料理'],
]);
const bounded = (v,lo,hi,d) => Number.isFinite(Number(v)) ? Math.max(lo,Math.min(hi,Math.floor(Number(v)))) : d;
export function memoryLayer(m) {
  if (LAYERS.includes(m?.layer)) return m.layer;
  if (m?.kind === 'preference') return 'preference';
  if (m?.kind === 'semantic' || m?.kind === 'human-reviewed-reconstruction') return 'semantic';
  if (m?.kind === 'autobiographical') return 'autobiographical';
  return 'episodic'; // Old V0.1/V0.2 records are inferred, not rewritten.
}
export function queryTerms(raw) {
  const q = clipped(raw,150).toLowerCase();
  const tokens = lexemes(q);
  const expansions = new Set();
  for (const group of CONCEPTS) {
    // Expansion is deliberately small and weaker than an exact match.
    if (group.some(term=>q.includes(term))) for(const term of group) for(const token of lexemes(term)) expansions.add(token);
  }
  for (const token of tokens) expansions.delete(token);
  return { tokens, expansions };
}
export function buildMemoryIndex(memories = []) {
  const docs = [], df = new Map(), postings = new Map();
  let totalLength = 0;
  for (const memory of memories) {
    if (!memory || typeof memory !== 'object' || !memory.id) continue;
    const title = clipped(memory.title,80), tags=clipped(memory.tags,120);
    const raw = `${title} ${tags} ${clipped(memory.content,1000)}`;
    const frequencies=new Map();
    for(const token of lexemes(raw)) frequencies.set(token,1);
    // Boost name/label matching without extra tokens sent to the model.
    for(const token of lexemes(`${title} ${tags}`)) frequencies.set(token,(frequencies.get(token)||0)+2);
    const length=[...frequencies.values()].reduce((a,b)=>a+b,0)||1;
    const doc={memory,frequencies,length}; const idx=docs.length;docs.push(doc); totalLength+=length;
    for (const token of frequencies.keys()) {
      df.set(token,(df.get(token)||0)+1);
      if (!postings.has(token)) postings.set(token,[]);
      postings.get(token).push(idx);
    }
  }
  return {docs,postings,df,avgLength:totalLength/(docs.length||1)};
}
export function searchIndex(index,query,{limit=20,now=Date.now()}={}) {
  const {tokens,expansions}=queryTerms(query);
  if (!tokens.size) return [];
  const sums=new Map();const n=index.docs.length, avg=index.avgLength||1;
  for (const [token,weight] of [...[...tokens].map(t=>[t,1]), ...[...expansions].map(t=>[t,0.24])]) {
    const rows=index.postings.get(token);if(!rows)continue;
    const idf=Math.log(1+(n-(index.df.get(token)||0)+0.5)/((index.df.get(token)||0)+0.5));
    for (const id of rows) {
      const d=index.docs[id],tf=d.frequencies.get(token)||0;
      const bm=idf*(tf*2.2/(tf+1.2*(0.25+0.75*d.length/avg)));
      sums.set(id,(sums.get(id)||0)+weight*bm);
    }
  }
  const matches=[];
  for(const [id,lexical] of sums){
    const memory=index.docs[id].memory;const retention=brainStrength(memory,now);
    // Importance and freshness influence ranking but never fabricate relevance.
    const score=lexical*(0.78+0.22*retention.strength);
    matches.push({memory,score,lexical,retention,layer:memoryLayer(memory)});
  }
  return matches.sort((a,b)=>b.score-a.score).slice(0,bounded(limit,1,50,20));
}
export function memoryOverview(memories,now=Date.now()){
  const counts=Object.fromEntries(LAYERS.map(l=>[l,0]));
  const stages={details:0,overview:0,trace:0};
  for(const m of memories){counts[memoryLayer(m)]++;
    const s=brainStrength(m,now);const stage=s.detailStrength>=0.48?'details':s.strength>=0.18?'overview':'trace';stages[stage]++;
  }
  return {active:memories.length,layers:counts,stages};
}
function compact(m,hit,excerptChars){
  const stage=hit.retention.detailStrength>=0.48?'details':hit.retention.strength>=0.18?'overview':'trace';
  const clean={id:m.id,title:clipped(m.title,70),layer:hit.layer,kind:m.kind||'legacy-unclassified',
    score:Number(hit.score.toFixed(3)),recallLevel:stage,
    source:m.source?.platform==='bilibili'?{platform:'bilibili',bvid:m.source.bvid,level:m.source.level}:
      m.source?.level?{level:m.source.level}:null};
  // Old evidence is retained on disk. A weak memory is deliberately not expanded.
  if(stage==='details') clean.excerpt=clipped(m.content,excerptChars);
  else if(stage==='overview')clean.excerpt='仅保留标题线索；需要核实时请查阅原始证据';
  else clean.excerpt='模糊痕迹；原始证据仍保存在本地';
  return clean;
}
/** Return a strict character budget, as a conservative, non-model-specific token proxy. */
export function compactContext(memories,query,{maxTokens=800,limit=6,now=Date.now()}={}){
  const tokens=bounded(maxTokens,200,1600,800), maxChars=tokens; // UTF-8 Chinese may take ~1 token/character.
  const desired=bounded(limit,1,10,6);
  const hits=searchIndex(buildMemoryIndex(memories),query,{limit:desired,now});
  const out={query:clipped(query,60),readOnly:true,evidenceOnly:true,items:[],truncated:false,charBudget:maxChars,note:'本地证据摘要；公开元数据不代表观看视频。'};
  // Slice by actual serialized JSON size. No unbounded memory bodies leak into model context.
  for(const hit of hits){
    const item=compact(hit.memory,hit,160);
    const next=JSON.stringify({...out,items:[...out.items,item]});
    if (next.length>maxChars) {
      let allowed=Math.min(160,Math.max(0,maxChars-JSON.stringify(out).length-JSON.stringify(item).length+item.excerpt.length-30));
      if (allowed<16) break;
      item.excerpt=clipped(item.excerpt,allowed);
      if(JSON.stringify({...out,items:[...out.items,item]}).length>maxChars) break;
    }
    out.items.push(item);
  }
  out.truncated=out.items.length<hits.length;
  return out;
}
export function consolidationSuggestion(memories,query){
  const hits=searchIndex(buildMemoryIndex(memories),query,{limit:6}).slice(0,4);
  return {status:'unverified',persisted:false,sourceIds:hits.map(x=>x.memory.id),
    evidence:hits.map(x=>({id:x.memory.id,title:x.memory.title,layer:x.layer,source:x.memory.source||null})),
    proposal:hits.length>=2?'这些记录可能涉及同一主题。可人工核实后提炼一条语义或偏好记忆；不得将相关性当成事实。':'证据不足，不建议整合。',
    warning:'不会自动保存摘要、覆盖记忆或生成不存在的经历。'};
}
