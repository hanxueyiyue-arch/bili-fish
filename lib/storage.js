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

export function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('请求已取消');
    error.name = 'AbortError';
    throw error;
  }
}
export const isAbortError = error => error?.name === 'AbortError' || error?.code === 'ABORT_ERR';

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
export function updateState(mutate, { backupBefore = false, signal } = {}) {
  const run = writeTail.then(async () => {
    throwIfAborted(signal);
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    throwIfAborted(signal);
    const state = await readState();
    throwIfAborted(signal);
    const original = backupBefore ? JSON.stringify(state, null, 2) : null;
    const result = await mutate(state);
    throwIfAborted(signal);
    if (backupBefore) {
      await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
      const file = join(BACKUP_DIR, `state-${Date.now()}-${randomUUID()}.json`);
      await writeFile(file, original, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    }
    const tmp = join(DATA_DIR, `state-${randomUUID()}.tmp`);
    try {
      throwIfAborted(signal);
      await writeFile(tmp, JSON.stringify(state, null, 2),
        { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      throwIfAborted(signal);
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

// Explicit markers are authoritative for new test data. Keep a narrowly defined
// compatibility exception for the three known V0.1 tutorial samples, not broad
// "contains test" guesses that could misclassify ordinary user memories.
const LEGACY_SAMPLE = Object.freeze({
  memory: {
    title: 'V0.1测试-蓝色珊瑚',
    content: '小鱼今天在想象中的海底发现了一片蓝色珊瑚，感到非常好奇。这是一条测试记忆，并非真实的 B站经历。',
    tags: '测试 珊瑚 海洋',
  },
  diary: '今天我开始测试自己的记忆能力。我记下了一片想象中的蓝色珊瑚，还成功回忆起了它。这只是一次功能测试，但我很高兴自己能够保存经历。',
  draft: '这是一条 BiliFish V0.1 功能测试草稿，仅用于验证本地存储，不需要实际发布。',
});
export function isTestRecord(kind, entry) {
  if (!entry || typeof entry !== 'object' || entry.isTest === false) return false;
  if (entry.isTest === true || entry.testRecord === true) return true;
  if (kind === 'memory') {
    if (entry.kind === 'test') return true;
    return entry.title === LEGACY_SAMPLE.memory.title &&
      entry.content === LEGACY_SAMPLE.memory.content &&
      entry.tags === LEGACY_SAMPLE.memory.tags;
  }
  if (kind === 'diary') return entry.text === LEGACY_SAMPLE.diary && entry.mood === '好奇';
  if (kind === 'draft') return entry.kind === 'comment' &&
    entry.targetBvid === 'BV1JYsd6sE4k' && entry.text === LEGACY_SAMPLE.draft;
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
