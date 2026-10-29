import test from 'node:test';
import assert from 'node:assert/strict';
import { lexemes, association, strength, newMemory, findMemories } from '../lib/memory.js';

test('中文短语可联想', () => {
  assert.ok(lexemes('喜欢猫咪视频').has('猫咪'));
  assert.ok(association('猫咪', newMemory({ title: '猫咪视频', content: '很有趣' })) > 0);
});

test('较老记忆逐渐衰减', () => {
  const mem = newMemory({ title: '动画', content: '一段趣闻', importance: 4 });
  const now = Date.parse(mem.createdAt);
  assert.ok(strength(mem, now + 20 * 86400000) < strength(mem, now));
});

test('根据关键词选取记忆', () => {
  const list = [newMemory({ title: '游戏直播', content: '游戏好玩' }),
    newMemory({ title: '猫咪日常', content: '小猫睡觉' })];
  assert.equal(findMemories(list, '猫咪')[0]?.memory.title, '猫咪日常');
});
