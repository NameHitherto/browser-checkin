// ==UserScript==
// @name         三站签到 · 定时与一键执行
// @namespace    local.namehitherto.checkin
// @version      1.6.0
// @description  浏览器启动时检查每日状态并打开未完成网站；支持设备级本地开关与全局手动一键全站重新核验
// @background
// @storageName  local.namehitherto.three-sites.checkin.v1
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_log
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        CAT_userConfig
// @updateURL    https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/scheduler.meta.js
// @downloadURL  https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/scheduler.user.js
// @homepageURL  https://github.com/NameHitherto/browser-checkin
// @supportURL   https://github.com/NameHitherto/browser-checkin/issues
// @license      MIT
// ==/UserScript==

/* ==UserConfig==
device:
  enabled:
    title: "在当前设备启用本脚本"
    description: "仅保存在当前浏览器本地，不随脚本猫云同步；新设备默认关闭，需在指定设备手动开启"
    type: checkbox
    default: false
sites:
  zhiyao:
    title: "知遥 API：启用签到"
    type: checkbox
    default: true
  ecy:
    title: "ECY Cloud：启用签到"
    type: checkbox
    default: true
  kuku:
    title: "库库 AI：启用签到"
    type: checkbox
    default: true
  hifiti:
    title: "HiFiTi 音乐磁场：启用签到"
    type: checkbox
    default: true
  kurobbs:
    title: "库街区 · 鸣潮：启用签到"
    type: checkbox
    default: true
behavior:
  autoVisit:
    title: 访问签到页面时自动执行
    type: checkbox
    default: true
  closeSuccess:
    title: 批量执行后关闭成功的临时页面
    type: checkbox
    default: true
  notifications:
    title: 显示批量结果通知
    type: checkbox
    default: true
schedule:
  enabled:
    title: 启用浏览器启动时自动签到
    type: checkbox
    default: true
==/UserConfig== */

return (async () => {
  'use strict';
  const VERSION = "1.6.0";
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
      "/",
      "/login"
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
    "loginPaths": [
      "/login"
    ],
    "loginPrefixes": []
  },
  "hifiti": {
    "id": "hifiti",
    "name": "HiFiTi 音乐磁场",
    "adapter": "hifiti",
    "url": "https://www.hifiti.com/",
    "hosts": [
      "www.hifiti.com"
    ],
    "matches": [
      "https://www.hifiti.com/*"
    ],
    "autoPaths": [
      "/"
    ],
    "defaultEnabled": true,
    "loginPaths": [
      "/user-login.htm"
    ],
    "loginPrefixes": [],
    "confirmPaths": [
      "/sg_sign.htm"
    ]
  },
  "kurobbs": {
    "id": "kurobbs",
    "name": "库街区 · 鸣潮",
    "adapter": "kurobbs",
    "url": "https://www.kurobbs.com/mc/home/9",
    "hosts": [
      "www.kurobbs.com"
    ],
    "matches": [
      "https://www.kurobbs.com/*"
    ],
    "apiOrigins": [
      "https://api.kurobbs.com"
    ],
    "autoPaths": [
      "/mc/home/9",
      "/mc/home/9/"
    ],
    "defaultEnabled": true,
    "loginPaths": [],
    "loginPrefixes": []
  }
};
  const PREFIX = 'three-sites:v1:';
  const BATCH_LOCK_TTL = 30000;
  const BATCH_HEARTBEAT_MS = 5000;
  const BATCH_SITE_TIMEOUT = 105000;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getValue = (key, fallback) => typeof GM === 'object' && GM.getValue
    ? GM.getValue(key, fallback) : Promise.resolve(GM_getValue(key, fallback));
  const setValue = (key, value) => typeof GM === 'object' && GM.setValue
    ? GM.setValue(key, value) : Promise.resolve(GM_setValue(key, value));
  const read = (key, fallback) => getValue(PREFIX + key, fallback);
  const write = (key, value) => setValue(PREFIX + key, value);
  const setting = (key, fallback) => getValue(key, fallback);
  const setSetting = setValue;

  const DEVICE_ENABLED_KEY = 'device.enabled';
  async function deviceEnabled() {
    const value = await setting(DEVICE_ENABLED_KEY, false);
    if (typeof value !== 'boolean') {
      GM_log('本设备启用开关配置异常，已安全回退为停用', 'warn');
      return false;
    }
    return value;
  }
  async function setDeviceEnabled(enabled) {
    const next = Boolean(enabled);
    await setSetting(DEVICE_ENABLED_KEY, next);
    return next;
  }
  function setupDeviceMenu(onToggle) {
    let menuId = null;
    let seq = 0;
    const refresh = async () => {
      if (typeof GM_registerMenuCommand !== 'function') return;
      const current = ++seq;
      const enabled = await deviceEnabled();
      if (current !== seq) return;
      if (menuId != null && typeof GM_unregisterMenuCommand === 'function') {
        try { GM_unregisterMenuCommand(menuId); } catch {}
      }
      menuId = GM_registerMenuCommand(
        enabled ? '当前设备：脚本已启用（点击停用）' : '当前设备：脚本已停用（点击启用）',
        () => Promise.resolve(onToggle()).catch(error => GM_log(error?.message || '切换本设备开关失败', 'warn')),
        { id: 'device-enabled-toggle' }
      );
    };
    if (typeof GM_addValueChangeListener === 'function') {
      try {
        GM_addValueChangeListener(DEVICE_ENABLED_KEY, () => {
          refresh().catch(() => {});
        });
      } catch {}
    }
    return refresh;
  }

  async function siteEnabled(id) {
    if (!SITE[id]) return false;
    const value = await setting('sites.' + id, SITE[id].defaultEnabled);
    if (typeof value !== 'boolean') {
      GM_log(`站点开关配置异常（${id}），回退默认状态`, 'warn');
      return SITE[id].defaultEnabled;
    }
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
  async function clearCompletion(id) {
    await write('completed:' + id, null);
  }

  async function acquireBatchLock(batchId, startup) {
    const prior = await read('batchLock', null);
    if (prior && Date.now() - prior.at < BATCH_LOCK_TTL) {
      let active = true;
      if (startup) {
        // Recover quickly from an abnormal browser exit whose lock stopped heartbeating.
        await sleep(BATCH_HEARTBEAT_MS + 1000);
        const current = await read('batchLock', null);
        if (!current || Date.now() - current.at >= BATCH_LOCK_TTL ||
            (current.token === prior.token && current.at === prior.at)) {
          active = false;
        }
      }
      if (active) {
        const error = new Error('已有批量签到运行，请稍后再试');
        error.code = 'BATCH_BUSY';
        throw error;
      }
    }
    await write('batchLock', { token: batchId, at: Date.now() });
  }

  async function waitSiteOutcome(siteId, token, batchId, tab) {
    const deadline = Date.now() + BATCH_SITE_TIMEOUT;
    let lastHeartbeat = Date.now();
    let tabClosedAt = null;
    let wake = null;
    let listenerId = null;
    let notifiedOutcome = null;

    if (tab && typeof tab === 'object' && !('onclose' in tab && tab.onclose)) {
      try {
        tab.onclose = () => {
          tabClosedAt ??= Date.now();
          wake?.();
        };
      } catch { /* Ignore readonly tab wrappers. */ }
    }
    if (typeof GM_addValueChangeListener === 'function') {
      try {
        listenerId = GM_addValueChangeListener(PREFIX + 'result:' + siteId, (_name, _old, next) => {
          if (next?.token === token) {
            notifiedOutcome = next;
            wake?.();
          }
        });
      } catch { /* Fall back to storage polling. */ }
    }

    try {
      while (Date.now() < deadline) {
        if (notifiedOutcome) return notifiedOutcome;
        const latest = await read('result:' + siteId, null);
        if (latest?.token === token) return latest;
        if (tab?.closed) tabClosedAt ??= Date.now();
        if (tabClosedAt !== null && Date.now() - tabClosedAt >= 1200) {
          const finalCheck = await read('result:' + siteId, null);
          if (finalCheck?.token === token) return finalCheck;
          return { status: 'unknown', message: '页面已提前关闭，未收到结果；请检查官网，未自动重发' };
        }
        const now = Date.now();
        if (now - lastHeartbeat >= BATCH_HEARTBEAT_MS) {
          await write('batchLock', { token: batchId, at: now });
          lastHeartbeat = now;
        }
        await new Promise(resolve => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            wake = null;
            resolve();
          };
          wake = finish;
          const timer = setTimeout(finish, 800);
        });
      }
      return { status: 'unknown', message: '等待超时未收到结果：请检查页面执行器、登录和验证码，页面已保留' };
    } finally {
      if (listenerId !== null && typeof GM_removeValueChangeListener === 'function') {
        try { GM_removeValueChangeListener(listenerId); } catch {}
      }
    }
  }

  async function runBatch(options = {}) {
    if (!(await deviceEnabled())) {
      GM_log('当前设备未启用本脚本，已跳过批量执行');
      return '当前设备未启用本脚本';
    }
    const force = Boolean(options?.force);
    const startup = Boolean(options?.startup);
    const sites = [];
    for (const site of Object.values(SITE)) if (await siteEnabled(site.id)) sites.push(site);
    if (!sites.length) { GM_log('没有启用的站点，未打开页面'); return '没有启用的站点'; }
    if (!force && (await Promise.all(sites.map(site => completedToday(site.id)))).every(Boolean)) {
      GM_log('所有已启用网站今日均已完成签到');
      return '所有已启用网站今日均已完成签到';
    }
    const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await acquireBatchLock(batchId, startup);
    const results = [];
    try {
      for (const site of sites) {
        if (!(await deviceEnabled())) {
          GM_log('当前设备已停用本脚本，中止剩余站点');
          break;
        }
        if (!(await siteEnabled(site.id))) continue;
        if (!force && await completedToday(site.id)) continue;
        await write('batchLock', { token: batchId, at: Date.now() });
        const token = `${force ? 'force' : 'batch'}_${batchId}_${site.id}`;
        const url = new URL(site.url);
        url.searchParams.set('sc_daily_checkin', token);
        await write('pending:' + site.id, { token, at: Date.now() });
        let tab;
        let outcome;
        try {
          tab = GM_openInTab(url.href, { active: false, insert: false, setParent: false });
          GM_log(`[${site.name}] 已打开页面，等待${force ? '重新核验' : '执行器'}`);
          outcome = await waitSiteOutcome(site.id, token, batchId, tab);
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
      await write('batchLast', { at: Date.now(), force, results });
      if (results.length && await setting('behavior.notifications', true)) {
        try { GM_notification({ title: force ? '全站核验签到结果' : '网页签到结果', text: summary, timeout: 12000 }); } catch { /* Logs remain available. */ }
      }
      if (failures.length) throw new Error(`${failures.length}个站点未完成，页面已保留；请查看运行日志`);
      return summary;
    } finally {
      const lock = await read('batchLock', null);
      if (lock?.token === batchId) await write('batchLock', null);
    }
  }
  let activeBatch = null;
  let lastRequestId = null;

  async function runManaged(options) {
    if (activeBatch) {
      const error = new Error('已有批量签到运行，请稍后再试');
      error.code = 'BATCH_BUSY';
      throw error;
    }
    const task = runBatch(options).finally(() => {
      if (activeBatch === task) activeBatch = null;
    });
    activeBatch = task;
    return task;
  }

  async function startupCheck() {
    if (!(await deviceEnabled())) return '当前设备未启用本脚本';
    if (!(await setting('schedule.enabled', true))) return '启动自动签到已关闭';
    return runManaged({ force: false, startup: true });
  }

  async function manualReverify() {
    if (!(await deviceEnabled())) {
      const msg = '当前设备未启用本脚本，请先在菜单或设置中启用';
      GM_log(msg, 'warn');
      if (await setting('behavior.notifications', true)) {
        try { GM_notification({ title: '网页签到工具集 · 本设备未启用', text: msg, timeout: 6000 }); } catch {}
      }
      return msg;
    }
    return runManaged({ force: true, startup: false });
  }

  async function handleManualRequest(request) {
    if (!request?.id || request.id === lastRequestId) return;
    if (Date.now() - Number(request.at || 0) > 15000) return;
    if (!(await deviceEnabled())) return;
    lastRequestId = request.id;
    await write('manualAck', { id: request.id, at: Date.now() });
    try {
      await manualReverify();
    } catch (error) {
      GM_log(error.message || '全站重新核验未完成，请查看保留页面', 'warn');
    }
  }

  let refreshDeviceMenu = null;
  async function toggleDeviceEnabled() {
    const next = await setDeviceEnabled(!(await deviceEnabled()));
    if (refreshDeviceMenu) await refreshDeviceMenu();
    const msg = next
      ? '当前设备已启用脚本（仅影响本设备，不同步到其他设备）'
      : '当前设备已停用脚本（仅影响本设备，不同步到其他设备）';
    GM_log(msg);
    if (await setting('behavior.notifications', true)) {
      try { GM_notification({ title: '网页签到工具集 · 本设备开关', text: msg, timeout: 6000 }); } catch {}
    }
    return next;
  }

  refreshDeviceMenu = setupDeviceMenu(toggleDeviceEnabled);
  refreshDeviceMenu().catch(error => GM_log(error?.message || '初始化本设备开关菜单失败', 'warn'));

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('全部已启用网站：立即重新核验并签到', () => {
      manualReverify().catch(error => GM_log(error.message || '全站重新核验未完成，请查看保留页面', 'warn'));
    });
    if (typeof CAT_userConfig === 'function') {
      GM_registerMenuCommand('站点与启动设置', () => CAT_userConfig());
    }
  }

  if (typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(PREFIX + 'manualRequest', (_name, _old, next) => {
      handleManualRequest(next).catch(error => GM_log(error.message || '手动核验触发失败', 'warn'));
    });
  }

  startupCheck().catch(error => {
    GM_log(error.message || '启动自动签到未完成，请查看保留页面', 'warn');
  });

  // Stay resident solely for event-driven menu/trigger handling with zero polling timers.
  return new Promise(() => {});

})();
