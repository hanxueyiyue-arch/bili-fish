/** Opt-in per-record local memory archive. Copy-first, verify, then remove active copy.
 * Crash before state commit can leave a duplicate; recall de-duplicates by UUID.
 */
import { mkdir, writeFile, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DATA_DIR, readState, updateState, activity } from './storage.js';

export const ARCHIVE_DIR = join(DATA_DIR,'memory-archive');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function pathFor(id){if(!uuid.test(id))throw Error('只接受原始记忆 UUID，不允许文件路径');return join(ARCHIVE_DIR,id+'.json');}
export async function readArchive(id){
  const path=pathFor(id);
  try {const data=JSON.parse(await readFile(path,'utf8'));if(data?.id!==id)throw Error('归档文件 ID 不一致');return data;}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function listArchives({max=5000}={}){
  let entries=[];
  try{entries=await readdir(ARCHIVE_DIR);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const files=entries.filter(x=>x.endsWith('.json')&&uuid.test(x.slice(0,-5))).sort();
  if(files.length>max)throw Error(`归档多于 ${max} 条，请先导出并分批管理`);
  const out=[];
  for(const filename of files){out.push(await readArchive(filename.slice(0,-5)));}
  return out;
}
export function mergeMemories(active,archived){
  const byId=new Map();
  for(const m of archived)if(m?.id)byId.set(m.id,m);
  for(const m of active)if(m?.id)byId.set(m.id,m); // live is authoritative
  return [...byId.values()];
}
export async function archiveMemoryIds(ids,confirmation,{dryRun=false}={}){
  const unique=[...new Set(ids)];
  if(!unique.length||unique.length>25||unique.some(x=>!uuid.test(x)))throw Error('一次指定 1–25 个合法 UUID');
  if(!dryRun&&confirmation!=='ARCHIVE_MEMORIES')throw Error('需要确认口令 ARCHIVE_MEMORIES');
  if(dryRun){
    const state=await readState();
    const records=unique.map(id=>state.memories.find(x=>x.id===id));
    if(records.some(x=>!x))throw Error('部分记忆不在活跃记忆中');
    return {dryRun:true,ids:unique,titles:records.map(m=>m.title),willBackup: true,willRemoveFromActive:true};
  }
  return updateState(async state=>{
    const records=unique.map(id=>state.memories.find(x=>x.id===id));
    if(records.some(x=>!x))throw Error('部分记忆不在活跃记忆中');
    await mkdir(ARCHIVE_DIR,{recursive:true,mode:0o700});
    for(const record of records){
      const target=pathFor(record.id);
      const existing=await readArchive(record.id);
      if(existing && JSON.stringify(existing)===JSON.stringify(record))continue;
      // Restored memories can be strengthened later. Preserve the previous archive
      // snapshot as an immutable history file before replacing the primary copy.
      if(existing){
        const history=join(ARCHIVE_DIR,`${record.id}.history-${randomUUID()}.json`);
        await writeFile(history,JSON.stringify(existing,null,2),{flag:'wx',mode:0o600});
      }
      const tmp=join(ARCHIVE_DIR,'.'+randomUUID()+'.tmp');
      try{await writeFile(tmp,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});await rename(tmp,target);}
      finally{await unlink(tmp).catch(()=>{});}
      const check=await readArchive(record.id);
      if(JSON.stringify(check)!==JSON.stringify(record))throw Error('归档校验失败，未删除活跃记录');
    }
    const idsSet=new Set(unique);
    state.memories=state.memories.filter(m=>!idsSet.has(m.id));
    activity(state,'memory-archive',`用户确认后归档 ${unique.length} 条记忆（原文保留，状态自动备份）`);
    return {archived:unique.length,ids:unique,originalEvidencePreserved:true,backup:true};
  },{backupBefore:true});
}
export async function restoreArchivedMemory(id,confirmation){
  if(confirmation!=='RESTORE_MEMORY')throw Error('需要确认口令 RESTORE_MEMORY');
  const original=await readArchive(id);
  if(!original)throw Error('归档 ID 不存在');
  return updateState(s=>{
    if(s.memories.some(m=>m.id===id))return {restored:false,reason:'已在活跃记忆中'};
    if(s.memories.length>=500)throw Error('活跃记忆达到 500 条上限，请先归档');
    s.memories.push(original); activity(s,'memory-restore','恢复已归档记忆 '+id);
    return {restored:true,id,archiveCopyPreserved:true};
  },{backupBefore:true});
}
