// ==UserScript==
// @name         三站签到 · 定时与一键执行
// @namespace    local.namehitherto.checkin
// @version      1.2.0
// @description  浏览器启动时检查每日状态；仅打开未完成网站；跨日失效
// @background
// @storageName  local.namehitherto.three-sites.checkin.v1
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_log
// @grant        GM_notification
// @updateURL    https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/scheduler.meta.js
// @downloadURL  https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/scheduler.user.js
// @homepageURL  https://github.com/NameHitherto/browser-checkin
// @supportURL   https://github.com/NameHitherto/browser-checkin/issues
// @license      MIT
// ==/UserScript==

return (async () => {
  'use strict';
  const VERSION = "1.2.0";
  const SITE = {
  "zhiyao": {
    "id": "zhiyao",
    "name": "知遥 API",
    "adapter": "zhiyao",
    "url": "https://zhiyaoapi.top/dashboard",
    "hosts": [
      "zhiyaoapi.top"
    ],
    "matches": [
      "https://zhiyaoapi.top/*"
    ],
    "autoPaths": [
      "/dashboard",
      "/dashboard/"
    ],
    "defaultEnabled": true,
    "loginPaths": [
      "/"
    ],
    "loginPrefixes": []
  },
  "ecy": {
    "id": "ecy",
    "name": "ECY Cloud",
    "adapter": "ecy",
    "url": "https://owo.ecycloud.com/user",
    "hosts": [
      "owo.ecycloud.com"
    ],
    "matches": [
      "https://owo.ecycloud.com/user*",
      "https://owo.ecycloud.com/auth/*"
    ],
    "autoPaths": [
      "/user",
      "/user/"
    ],
    "defaultEnabled": true,
    "loginPaths": [],
    "loginPrefixes": [
      "/auth/"
    ]
  },
  "kuku": {
    "id": "kuku",
    "name": "库库 AI",
    "adapter": "kuku",
    "url": "https://kuku.baidu.com/operation/activitys/kukuPcSignAct/main",
    "hosts": [
      "kuku.baidu.com"
    ],
    "matches": [
      "https://kuku.baidu.com/*"
    ],
    "autoPaths": [
      "/operation/activitys/kukuPcSignAct/main",
      "/operation/activitys/kukuPcSignAct/main/"
    ],
    "defaultEnabled": true,
    "loginPaths": [],
    "loginPrefixes": []
  }
};
  const PREFIX = 'three-sites:v1:';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getValue = (key, fallback) => typeof GM === 'object' && GM.getValue
    ? GM.getValue(key, fallback) : Promise.resolve(GM_getValue(key, fallback));
  const setValue = (key, value) => typeof GM === 'object' && GM.setValue
    ? GM.setValue(key, value) : Promise.resolve(GM_setValue(key, value));
  const read = (key, fallback) => getValue(PREFIX + key, fallback);
  const write = (key, value) => setValue(PREFIX + key, value);
  const setting = (key, fallback) => getValue(key, fallback);
  const setSetting = setValue;

  async function siteEnabled(id) {
    if (!SITE[id]) return false;
    const value = await setting('sites.' + id, SITE[id].defaultEnabled);
    if (typeof value !== 'boolean') throw new Error('站点开关必须是布尔值：' + id);
    return value;
  }
  function localDay(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  async function completedToday(id) {
    const saved = await read('completed:' + id, null);
    return saved?.day === localDay() && ['success', 'already'].includes(saved.status);
  }
  async function saveCompletion(id, outcome, day) {
    // A request straddling midnight cannot prove completion for the new day.
    if (day === localDay() && ['success', 'already'].includes(outcome.status)) {
      await write('completed:' + id, { day, status: outcome.status, at: Date.now() });
    }
  }

  async function runBatch() {
    const sites = [];
    for (const site of Object.values(SITE)) if (await siteEnabled(site.id)) sites.push(site);
    if (!sites.length) { GM_log('没有启用的站点，未打开页面'); return '没有启用的站点'; }
    if ((await Promise.all(sites.map(site => completedToday(site.id)))).every(Boolean)) {
      GM_log('所有已启用网站今日均已完成签到');
      return '所有已启用网站今日均已完成签到';
    }
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prior = await read('batchLock', null);
    if (prior && Date.now() - prior.at < 360000) {
      const error = new Error('已有批量签到运行，请稍后再试');
      error.code = 'BATCH_BUSY';
      throw error;
    }
    await write('batchLock', { token: batchId, at: Date.now() });
    const results = [];
    try {
      for (const site of sites) {
        if (!(await siteEnabled(site.id))) continue;
        if (await completedToday(site.id)) continue;
        await write('batchLock', { token: batchId, at: Date.now() });
        const token = `${batchId}_${site.id}`;
        const url = new URL(site.url);
        url.searchParams.set('sc_daily_checkin', token);
        await write('pending:' + site.id, { token, at: Date.now() });
        let tab;
        let outcome;
        try {
          tab = GM_openInTab(url.href, { active: false, insert: false, setParent: false });
          GM_log(`[${site.name}] 已打开页面，等待执行器`);
          const deadline = Date.now() + 90000;
          while (Date.now() < deadline) {
            const latest = await read('result:' + site.id, null);
            if (latest?.token === token) { outcome = latest; break; }
            await sleep(800);
          }
          outcome ||= { status: 'unknown', message: '90秒未收到结果：请检查页面执行器、登录和验证码，页面已保留' };
        } catch {
          outcome = { status: 'unknown', message: '打开或检查页面异常；请查看官网，未自动重发' };
        } finally { await write('pending:' + site.id, null); }
        const done = ['success', 'already', 'disabled'].includes(outcome.status);
        results.push({ site: site.id, name: site.name, status: outcome.status, message: outcome.message });
        GM_log(`[${site.name}] ${outcome.status}：${outcome.message}`, done ? 'info' : 'warn');
        if (done && await setting('behavior.closeSuccess', true)) {
          try { tab?.close(); } catch { /* Keep the completed result. */ }
        }
      }
      const failures = results.filter(row => !['success', 'already', 'disabled'].includes(row.status));
      const labels = { success: '签到成功', already: '今日已签', login: '需要登录', manual: '需要人工', disabled: '已停用' };
      const summary = results.map(row => `${row.name}：${labels[row.status] || '未完成'}`).join('\n');
      await write('batchLast', { at: Date.now(), results });
      if (results.length && await setting('behavior.notifications', true)) {
        try { GM_notification({ title: '网页签到结果', text: summary, timeout: 12000 }); } catch { /* Logs remain available. */ }
      }
      if (failures.length) throw new Error(`${failures.length}个站点未完成，页面已保留；请查看运行日志`);
      return summary;
    } finally {
      const lock = await read('batchLock', null);
      if (lock?.token === batchId) await write('batchLock', null);
    }
  }

  let checkedDay = null;
  let checking = null;
  async function scheduledTick() {
    if (checking) return checking;
    const day = localDay();
    if (checkedDay === day) return '本次浏览器会话今日已检查';
    // The usual idle path above never crosses the extension storage boundary.
    if (!(await setting('schedule.enabled', true))) return '自动调度已关闭';
    // Recheck after the asynchronous settings read to coalesce concurrent calls.
    if (checking) return checking;
    if (checkedDay === day) return '本次浏览器会话今日已检查';
    // Session-only attempt guard: failures retry on restart, not every minute.
    checkedDay = day;
    checking = runBatch().catch(error => {
      if (error.code === 'BATCH_BUSY') checkedDay = null;
      throw error;
    }).finally(() => { checking = null; });
    return checking;
  }
  // Keep the returned promise alive so ScriptCat retains this background task.
  // Run immediately on browser/script startup, then detect local date rollover.
  while (true) {
    try { await scheduledTick(); }
    catch (error) { GM_log(error.message || '自动签到未完成，请查看保留页面', 'warn'); }
    await sleep(60000);
  }

})();
