// ==UserScript==
// @name         三站签到 · 定时与一键执行
// @namespace    local.namehitherto.checkin
// @version      1.1.1
// @description  按个人配置的时间自动签到；手动全签请使用执行器菜单
// @crontab      * * * * *
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
  const VERSION = "1.1.1";
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
  function parseTimes(value) {
    if (typeof value !== 'string') throw new Error('执行时间应为 HH:MM 列表');
    const times = value.split(/[,，\s]+/).filter(Boolean);
    if (!times.length || times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      throw new Error('执行时间格式错误，例如 09:00,21:00；未执行自动任务');
    }
    return [...new Set(times)].sort();
  }
  function localSlot(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return { key: `${day}T${time}`, time };
  }

  async function runBatch() {
    const sites = [];
    for (const site of Object.values(SITE)) if (await siteEnabled(site.id)) sites.push(site);
    if (!sites.length) { GM_log('没有启用的站点，未打开页面'); return '没有启用的站点'; }
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prior = await read('batchLock', null);
    if (prior && Date.now() - prior.at < 360000) throw new Error('已有批量签到运行，请稍后再试');
    await write('batchLock', { token: batchId, at: Date.now() });
    const results = [];
    try {
      for (const site of sites) {
        if (!(await siteEnabled(site.id))) continue;
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
      if (await setting('behavior.notifications', true)) {
        try { GM_notification({ title: '网页签到结果', text: summary, timeout: 12000 }); } catch { /* Logs remain available. */ }
      }
      if (failures.length) throw new Error(`${failures.length}个站点未完成，页面已保留；请查看运行日志`);
      return summary;
    } finally {
      const lock = await read('batchLock', null);
      if (lock?.token === batchId) await write('batchLock', null);
    }
  }

  async function scheduledTick(date = new Date()) {
    if (!(await setting('schedule.enabled', true))) return '自动调度已关闭';
    const slot = localSlot(date);
    const times = parseTimes(await setting('schedule.times', '09:00,21:00'));
    if (!times.includes(slot.time)) return '当前未到执行时间';
    if (await read('scheduleLast', '') === slot.key) return '本时刻已触发';
    // Record the attempt first: a failed task must not resubmit every minute/restart.
    await write('scheduleLast', slot.key);
    return runBatch();
  }
  return scheduledTick();

})();
