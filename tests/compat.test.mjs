import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isAutomationEnabled } from '../lib/automation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('DSH 客户端模块可以按 package exports 解析', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['./client'], './lib/client.js');
  const resolved = import.meta.resolve('dsh-bili-fish/client');
  assert.ok(resolved.endsWith('/lib/client.js'), resolved);
});

test('自动浏览状态以持久化 state 为准，而非遗留配置项', () => {
  assert.equal(isAutomationEnabled({automation:{enabled:false}}),false);
  assert.equal(isAutomationEnabled({automation:{enabled:true}}),true);
  assert.equal(isAutomationEnabled({automation:{enabled:false},autoBrowse:true}),false);
  assert.equal(isAutomationEnabled(null),false);
});

test('状态工具使用持久化开关且手动停止后不会继续记录已取消的观察', async () => {
  const source = await readFile(resolve(root, 'lib/index.js'), 'utf8');
  assert.match(source, /automaticBrowse:\s*isAutomationEnabled\(state\)/);
  assert.match(source, /const videos = await client\.popular\(count, signal\);\s*if \(signal\?\.aborted\) throw/);
});
