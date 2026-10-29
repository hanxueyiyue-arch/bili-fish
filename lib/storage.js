import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// 整个插件仅操作这一固定目录。不会读取浏览器、密钥、DSH 会话或账号凭据。
export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'bili-fish');
const STATE_FILE = join(DATA_DIR, 'state.json');

const blank = () => ({
  version: 1,
  bornAt: new Date().toISOString(),
  observations: [],
  memories: [],
  diary: [],
  drafts: [],
  quota: { day: '', used: 0 },
});

let writeTail = Promise.resolve();

export function dateKey() { return new Date().toISOString().slice(0, 10); }

export async function readState() {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    if (!state || state.version !== 1 || !Array.isArray(state.memories)) {
      throw new Error('state.json 格式错误，请先备份并人工检查');
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return blank();
    throw error;
  }
}

// 仅本进程内串行；插件不支持并行运行两个实例并共用同一数据目录。
export function updateState(mutate) {
  const run = writeTail.then(async () => {
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    const state = await readState();
    const result = await mutate(state);
    const tmp = join(DATA_DIR, `state-${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(tmp, STATE_FILE);
    } catch (error) {
      // 临时文件在下一次人工维护时可删除；不扫描其他目录。
      throw error;
    }
    return result;
  });
  writeTail = run.then(() => undefined, () => undefined);
  return run;
}

export function clipped(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
