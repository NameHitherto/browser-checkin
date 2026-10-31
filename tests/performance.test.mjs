import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const scheduler = await fs.readFile('dist/scheduler.user.js', 'utf8');
const registry = JSON.parse(await fs.readFile('src/registry.json', 'utf8'));
const prefix = 'three-sites:v1:';
const flush = () => new Promise(resolve => setImmediate(resolve));

// Exercise the shipped loop without DOM/network globals. Only the extension
// boundary and clock are mocked; no browser account is involved.
for (const state of ['completed', 'failed']) {
  test(`空闲性能：${state} 后全天无存储、网络、页面或日志活动，仅保留一个分钟定时器`, async t => {
    let now = Number(new Date(2026, 10, 1, 0, 0));
    class Clock extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    }
    const saved = new Map();
    const counts = { reads: 0, writes: 0, opens: 0, closes: 0, notifications: 0, logs: 0 };
    const waits = [];
    if (state === 'completed') {
      for (const site of registry) saved.set(prefix + 'completed:' + site.id, { day: '2026-11-01', status: 'success' });
    }
    const context = vm.createContext({
      Date: Clock, URL,
      GM: {
        async getValue(key, fallback) { counts.reads++; return saved.has(key) ? saved.get(key) : fallback; },
        async setValue(key, value) { counts.writes++; saved.set(key, value); },
      },
      GM_openInTab(url) {
        counts.opens++;
        const target = new URL(url);
        const site = registry.find(row => row.hosts.includes(target.hostname));
        saved.set(prefix + 'result:' + site.id, {
          token: target.searchParams.get('sc_daily_checkin'), status: 'login', message: 'synthetic',
        });
        return { close() { counts.closes++; } };
      },
      GM_log() { counts.logs++; },
      GM_notification() { counts.notifications++; },
      setTimeout(fn, ms) {
        assert.equal(ms, 60000, 'idle background must not use a fast polling loop');
        assert.equal(waits.length, 0, 'only one pending timer is allowed');
        waits.push(fn);
      },
    });
    vm.runInContext('(function(){' + scheduler + '})()', context);
    await flush();
    assert.equal(counts.opens, state === 'completed' ? 0 : registry.length);
    assert.equal(waits.length, 1);
    for (const key of Object.keys(counts)) counts[key] = 0;

    const started = performance.now();
    for (let minute = 1; minute < 1440; minute++) {
      now += 60000;
      waits.shift()();
      await flush();
      assert.equal(waits.length, 1);
    }
    t.diagnostic(`1439 idle callbacks: ${(performance.now() - started).toFixed(2)} ms in Node VM (not a browser CPU profile)`);
    assert.deepEqual(counts, { reads: 0, writes: 0, opens: 0, closes: 0, notifications: 0, logs: 0 });

    now += 60000;
    waits.shift()();
    await flush();
    assert.equal(counts.opens, registry.length, 'next local day must still trigger check-in');
    assert.equal(waits.length, 1);
  });
}
