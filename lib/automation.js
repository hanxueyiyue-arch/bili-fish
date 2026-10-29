import { readState, updateState, activity, clipped } from './storage.js';

// The persisted automation switch, not legacy config.autoBrowse, is authoritative.
export const isAutomationEnabled = state => Boolean(state?.automation?.enabled);
export const intervalMs = hours => Math.max(6, Math.min(48, Number(hours) || 12)) * 3600_000;
const BACKOFF_MS = [15, 30, 60, 120, 360].map(min => min * 60_000);
export function retryDelay(failures) { return BACKOFF_MS[Math.min(Math.max(0, failures - 1), BACKOFF_MS.length - 1)]; }
export function isRateLimited(message) { return /(?:\b412\b|\b429\b|\b403\b|[-]412\b|[-]352\b)/.test(String(message)); }

/** Runs in the DSH host: never invokes an Agent, shell, or posting endpoint. */
export function createAutomation({ swim, hours = 12, log = console.warn }) {
  let active = null;
  let disposed = false;
  async function control(action) {
    if (!['start', 'stop', 'status'].includes(action)) throw new Error('只允许 start、stop、status');
    if (action === 'status') return (await readState()).automation;
    if (action === 'stop') active?.abort();
    await updateState(state => {
      const a = state.automation;
      if (action === 'stop') {
        a.enabled = false; a.nextRunAt = null;
        activity(state, 'automation-stop', '用户暂停自动浏览');
      } else {
        a.enabled = true; a.pausedByRisk = false; a.failures = 0; a.lastError = null;
        a.nextRunAt = new Date(Date.now() + intervalMs(hours)).toISOString();
        activity(state, 'automation-start', '用户开启自动浏览，首轮按完整间隔调度');
      }
    });
    return (await readState()).automation;
  }
  async function tick() {
    if (disposed || active) return false;
    const now = Date.now();
    const initial = await readState();
    const a = initial.automation;
    if (!a.enabled || a.pausedByRisk) return false;
    if (!a.nextRunAt) {
      await updateState(state => {
        if (state.automation.enabled && !state.automation.nextRunAt) {
          state.automation.nextRunAt = new Date(now + intervalMs(hours)).toISOString();
          activity(state, 'automation-plan', '生成下一次自动浏览时间');
        }
      });
      return false;
    }
    if (Date.parse(a.nextRunAt) > now) return false;
    const controller = new AbortController(); active = controller;
    try {
      // Reserve the next time first, so a restart can't duplicate a just-due run.
      let allowed = false;
      await updateState(state => {
        if (state.automation.enabled && state.automation.nextRunAt === a.nextRunAt) {
          allowed = true;
          state.automation.nextRunAt = new Date(now + intervalMs(hours)).toISOString();
          state.automation.lastRunAt = new Date(now).toISOString();
          activity(state, 'automation-run', '开始读取 B站公开热门列表');
        }
      });
      if (!allowed) return false;
      await swim(3, 'scheduled', controller.signal);
      await updateState(state => {
        // Stop always wins: a previously canceled task cannot turn itself back on.
        if (state.automation.enabled) {
          state.automation.failures = 0;
          state.automation.lastError = null;
          activity(state, 'automation-success', '本轮读取公开热门列表成功');
        }
      });
      return true;
    } catch (err) {
      const message = clipped(err?.message || err, 180);
      log('[bili-fish] 自动浏览失败：' + message);
      await updateState(state => {
        if (!state.automation.enabled) return;
        const a = state.automation;
        a.failures = (a.failures || 0) + 1;
        a.lastError = message;
        if (isRateLimited(message)) {
          a.enabled = false;
          a.pausedByRisk = true;
          a.nextRunAt = null;
          activity(state, 'automation-risk-stop', '平台限流或拒绝，已停止自动浏览', { detail: message });
        } else {
          a.nextRunAt = new Date(Date.now() + retryDelay(a.failures)).toISOString();
          activity(state, 'automation-error', '本轮失败，已安排退避重试', { detail: message });
        }
      });
      return false;
    } finally { active = null; }
  }
  function dispose() { disposed = true; active?.abort(); }
  return { control, tick, dispose };
}
