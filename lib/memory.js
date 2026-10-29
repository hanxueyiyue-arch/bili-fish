import { randomUUID } from 'node:crypto';
import { clipped } from './storage.js';

// 特意不访问任何云端：模糊联想只在插件专属的本地记忆里计算。
export function lexemes(raw) {
  const text = clipped(raw, 1500).toLowerCase();
  const words = text.match(/[a-z0-9]{2,}/g) || [];
  const han = [...(text.match(/[\p{Script=Han}]+/gu) || [])];
  for (const segment of han) {
    if (segment.length === 1) words.push(segment);
    for (let i = 0; i < segment.length - 1; i++) words.push(segment.slice(i, i + 2));
  }
  return new Set(words);
}

export function association(query, memory) {
  const q = lexemes(query);
  const m = lexemes(`${memory.title} ${memory.content} ${memory.tags}`);
  if (!q.size) return 0;
  let matched = 0;
  for (const token of q) if (m.has(token)) matched++;
  return matched / q.size;
}

export function strength(memory, now = Date.now()) {
  const last = Date.parse(memory.lastRecalledAt || memory.createdAt);
  const days = Math.max(0, (now - (Number.isFinite(last) ? last : now)) / 86400000);
  const importance = Math.max(1, Math.min(5, Number(memory.importance) || 1));
  const tau = 8 + 7 * importance;
  const repetition = Math.log1p(Math.max(0, memory.recallCount || 0));
  return Math.min(1, Math.exp(-days / tau) * (importance / 5 + repetition * 0.12));
}

export function newMemory({ title, content, importance = 3, tags = '' }) {
  if (!clipped(title, 80) || !clipped(content, 1000)) throw new Error('标题和内容不能为空');
  return {
    id: randomUUID(), title: clipped(title, 80), content: clipped(content, 1000),
    tags: clipped(tags, 120), importance: Math.max(1, Math.min(5, Math.round(Number(importance) || 3))),
    createdAt: new Date().toISOString(), lastRecalledAt: null, recallCount: 0,
  };
}

export function findMemories(memories, query, limit = 5) {
  return memories.map(memory => ({ memory, association: association(query, memory), strength: strength(memory) }))
    .filter(entry => entry.association > 0)
    .sort((a, b) => (b.association * 0.8 + b.strength * 0.2) - (a.association * 0.8 + a.strength * 0.2))
    .slice(0, limit);
}
