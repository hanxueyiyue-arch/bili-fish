/** Non-destructive BrainMem B-inspired recall; no LLM calls and no fabricated sources. */
import { lexemes } from './memory.js';
import { clipped } from './storage.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const day=86400000;
export function brainStrength(memory,now=Date.now()){
  const importance=clamp((Number(memory.importance)||3)/5);
  const count=Math.max(0,Number(memory.recallCount)||0);
  const last=Date.parse(memory.lastRecalledAt||memory.createdAt);
  const days=Math.max(0,(now-(Number.isFinite(last)?last:now))/day);
  const hFast=2+importance*12+Math.log1p(count)*3;
  const hSlow=18+importance*85+Math.log1p(count)*15;
  const w=0.60;
  const retention=w*2**(-days/hFast)+(1-w)*2**(-days/hSlow);
  const strength=clamp(importance*(1+Math.log1p(count)*0.15)*retention);
  const detailStrength=clamp(strength*2**(-days/(3+importance*26)));
  return {strength,detailStrength,retention};
}
function tokenSimilarity(a,b){const aa=lexemes(a),bb=lexemes(b);if(!aa.size||!bb.size)return 0;let both=0;for(const k of aa)if(bb.has(k))both++;return both/aa.size;}
function connection(a,b){
  // two-hop links through shared tags and explicitly matching topics, never invented relationships
  const tagsA=lexemes(a.tags||''),tagsB=lexemes(b.tags||'');
  let intersection=0;for(const k of tagsA)if(tagsB.has(k))intersection++;
  const tagScore=tagsA.size&&tagsB.size?intersection/Math.max(tagsA.size,tagsB.size):0;
  const topicScore=tokenSimilarity(a.title||'',b.title||'');
  return clamp(tagScore*0.75+topicScore*0.25);
}
export function brainRecall(memories,query,{now=Date.now(),limit=6}={}){
  const q=clipped(query,150);
  if(!q)return [];
  // V0.3: bounded two-hop seed exploration avoids the old O(n²) all-pairs scan.
  const docs=memories.map(m=>({m,similarity:tokenSimilarity(q,`${m.title} ${m.content} ${m.tags}`),
    tags:lexemes(m.tags||''),title:lexemes(m.title||'')}));
  const seeds=docs.filter(x=>x.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,12);
  const proximity=(a,b)=>{
    let overlap=0;for(const token of a.tags)if(b.tags.has(token))overlap++;
    const tagScore=a.tags.size&&b.tags.size?overlap/Math.max(a.tags.size,b.tags.size):0;
    let titleOverlap=0;for(const token of a.title)if(b.title.has(token))titleOverlap++;
    const titleScore=a.title.size?titleOverlap/a.title.size:0;
    return clamp(tagScore*.75+titleScore*.25);
  };
  return docs.map(doc=>{
    const {m,similarity}=doc;
    let waking=0;
    for(const seed of seeds){if(seed===doc)continue;
      waking=Math.max(waking,seed.similarity*proximity(seed,doc));}
    const s=brainStrength(m,now);
    const relevance=clamp(.45*similarity+.35*waking+.20*s.strength);
    const awakened=similarity<=0&&waking>0;
    const level=s.detailStrength>=.48?'details':s.strength>=.18?'overview':'trace';
    return {id:m.id,title:m.title,kind:m.kind||'legacy-unclassified',source:m.source||null,
      similarity:Number(similarity.toFixed(3)),association:Number(relevance.toFixed(3)),
      associativeWake:Number(waking.toFixed(3)),awakened,
      strength:Number(s.strength.toFixed(3)),detailStrength:Number(s.detailStrength.toFixed(3)),
      recallLevel:level,
      content:level==='details'?m.content:level==='overview'?'细节逐渐模糊；可查看保留的原始证据，但本次只返回概况。':null,
      evidenceAvailable:!!m.content};
  }).filter(x=>x.similarity>0||x.associativeWake>0)
    .sort((a,b)=>b.association-a.association).slice(0,Math.max(1,Math.min(10,limit)));
}
/** Candidate association only: no persistence, no modification, no claims of a new fact. */
export function reconstructionCandidate(memories,query,{now=Date.now()}={}){
  const matches=brainRecall(memories,query,{now,limit:5});
  const selected=matches.slice(0,3);
  return {
    query:clipped(query,150),status:'unverified-candidate',persisted:false,
    candidate:selected.length>1?`可能存在主题关联：${selected.map(x=>`《${x.title}》`).join('、')}。这些内容是独立记录，不能据此推断它们之间存在真实因果关系。`:
      selected.length===1?`与《${selected[0].title}》相关的线索较少；无法可靠重组新的经历。`:'没有足够的回忆线索，不生成候选。',
    evidence:selected.map(x=>({id:x.id,title:x.title,kind:x.kind,source:x.source,strength:x.strength})),
    warning:'重组仅为推测，不是验证过的新记忆；不覆盖原始证据，也不自动写入 state.json。',
  };
}
