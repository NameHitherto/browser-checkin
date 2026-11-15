import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const scheduler = await fs.readFile('dist/scheduler.user.js', 'utf8');
const registry = JSON.parse(await fs.readFile('src/registry.json', 'utf8'));
const prefix = 'three-sites:v1:';
const flush = () => new Promise(resolve => setImmediate(resolve));

// Verify zero-timer event-driven standby after startup check (no polling loop).
for (const state of ['completed', 'failed']) {
  test(`后台空闲性能：${state} 启动检查结束后零定时器、零存储/网络/日志活动，且菜单可即时触发全站复核`, async () => {
    const saved = new Map();
    const counts = { reads: 0, writes: 0, opens: 0, closes: 0, notifications: 0, logs: 0, timers: 0 };
    const openedTokens = [];
    const commands = new Map();
    if (state === 'completed') {
      for (const site of registry) saved.set(prefix + 'completed:' + site.id, { day: '2026-11-01', status: 'success' });
    }
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : [2026, 10, 1, 9, 0])); }
      static now() { return Number(new Date(2026, 10, 1, 9, 0)); }
    }
    const context = vm.createContext({
      Date: FixedDate, URL,
      GM: {
        async getValue(key, fallback) { counts.reads++; return saved.has(key) ? saved.get(key) : fallback; },
        async setValue(key, value) { counts.writes++; saved.set(key, value); },
      },
      GM_openInTab(url) {
        counts.opens++;
        const target = new URL(url);
        const token = target.searchParams.get('sc_daily_checkin');
        openedTokens.push(token);
        const site = registry.find(row => row.hosts.includes(target.hostname));
        saved.set(prefix + 'result:' + site.id, { token, status: 'already', message: 'synthetic' });
        return { closed: false, close() { counts.closes++; } };
      },
      GM_registerMenuCommand(name, fn) { commands.set(name, fn); },
      GM_addValueChangeListener() { return 1; },
      GM_removeValueChangeListener() {},
      GM_log() { counts.logs++; },
      GM_notification() { counts.notifications++; },
      setTimeout(fn) {
        counts.timers++;
        return setImmediate(fn);
      },
      clearTimeout() {},
    });
    vm.runInContext('(function(){' + scheduler + '})()', context);
    for (let i = 0; i < 20; i++) await flush();

    assert.equal(counts.opens, state === 'completed' ? 0 : registry.length);
    assert.equal(counts.timers, 0, 'zero timers created during fast completion and idle standby');
    for (const key of Object.keys(counts)) counts[key] = 0;
    openedTokens.length = 0;

    // Idle verification: no background polling happens on its own.
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(counts, { reads: 0, writes: 0, opens: 0, closes: 0, notifications: 0, logs: 0, timers: 0 });

    // Manual menu command must force-open all enabled sites even if already completed.
    const menuFn = commands.get('全部已启用网站：立即重新核验并签到');
    assert.equal(typeof menuFn, 'function');
    menuFn();
    for (let i = 0; i < 20; i++) await flush();
    assert.equal(counts.opens, registry.length);
    assert.ok(openedTokens.every(token => token.startsWith('force_')));
  });
}
