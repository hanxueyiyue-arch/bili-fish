import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Reads/writes are restricted to the dedicated BiliFish data directory.
export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'bili-fish');
export const STATE_FILE = join(DATA_DIR, 'state.json');
const BACKUP_DIR = join(DATA_DIR, 'backups');
export const dateKey = () => new Date().toISOString().slice(0, 10);
export const clipped = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const blank = () => ({
  version: 1, bornAt: new Date().toISOString(), observations: [], memories: [],
  diary: [], drafts: [], quota: { day: '', used: 0 }, activity: [],
  life: null, // V0.2 lazily migrates on the first write; existing state remains compatible.
  automation: { enabled: false, nextRunAt: null, lastRunAt: null, lastError: null },
});

function normalize(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.memories)) {
    throw new Error('state.json 格式错误；请先备份并人工检查');
  }
  for (const key of ['observations', 'diary', 'drafts', 'activity']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  if (!state.quota || typeof state.quota !== 'object') state.quota = { day: '', used: 0 };
  if (!state.automation || typeof state.automation !== 'object') {
    state.automation = { enabled: false, nextRunAt: null, lastRunAt: null, lastError: null };
  }
  return state;
}

let writeTail = Promise.resolve();

export async function readState() {
  try { return normalize(JSON.parse(await readFile(STATE_FILE, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return blank(); throw error; }
}

export function activity(state, type, message, details = {}) {
  state.activity.push({ at: new Date().toISOString(), type: clipped(type, 32),
    message: clipped(message, 240), ...details });
  state.activity = state.activity.slice(-150);
}

// Per-process serialized atomic writes; safe snapshot is made only when a change succeeds.
// Two independent DSH processes must not share one DSH_HOME concurrently.
export function updateState(mutate, { backupBefore = false } = {}) {
  const run = writeTail.then(async () => {
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    const state = await readState();
    const original = backupBefore ? JSON.stringify(state, null, 2) : null;
    const result = await mutate(state);
    if (backupBefore) {
      await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
      const file = join(BACKUP_DIR, `state-${Date.now()}-${randomUUID()}.json`);
      await writeFile(file, original, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    }
    const tmp = join(DATA_DIR, `state-${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(state, null, 2),
        { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(tmp, STATE_FILE);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
    return result;
  });
  writeTail = run.then(() => undefined, () => undefined);
  return run;
}

export function isTestRecord(kind, entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (kind === 'memory') return /^V0\.1测试[-—]/.test(entry.title ?? '') &&
    String(entry.content ?? '').includes('这是一条测试记忆');
  if (kind === 'diary') return String(entry.text ?? '').includes('测试') &&
    String(entry.text ?? '').includes('蓝色珊瑚');
  if (kind === 'draft') return String(entry.text ?? '').includes('BiliFish V0.1 功能测试草稿');
  return false;
}

export function testRecordList(state) {
  return [
    ...state.memories.filter(x => isTestRecord('memory', x)).map(x =>
      ({ kind: 'memory', id: x.id, label: clipped(x.title, 100) })),
    ...state.diary.filter(x => isTestRecord('diary', x)).map(x =>
      ({ kind: 'diary', id: x.at, label: clipped(x.text, 100) })),
    ...state.drafts.filter(x => isTestRecord('draft', x)).map(x =>
      ({ kind: 'draft', id: x.id, label: clipped(x.text, 100) })),
  ];
}

export async function cleanTestRecord(kind, id, confirmation) {
  if (confirmation !== 'DELETE_TEST_DATA') throw new Error('需要明确确认 DELETE_TEST_DATA');
  const collection = { memory: 'memories', diary: 'diary', draft: 'drafts' }[kind];
  if (!collection || !clipped(id, 128)) throw new Error('无效的 kind 或 id');
  return updateState(state => {
    const rows = state[collection];
    const matches = rows.filter(x => (kind === 'diary' ? x.at : x.id) === id);
    if (matches.length !== 1 || !isTestRecord(kind, matches[0])) {
      throw new Error('只能删除一条明确匹配的 V0.1 测试数据；其他数据不受影响');
    }
    state[collection] = rows.filter(x => x !== matches[0]);
    activity(state, 'cleanup', `删除 1 条 ${kind} 测试记录（操作前已备份）`);
    return { deleted: true, kind, id, automaticBackup: true };
  }, { backupBefore: true });
}
