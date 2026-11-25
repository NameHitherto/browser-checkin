// ==UserScript==
// @name         三站签到 · 页面执行器
// @namespace    local.namehitherto.checkin
// @version      1.6.1
// @description  浏览器会话复用；设备级本地开关；可配置站点开关；官网结果复核
// @match        https://zhiyaoapi.top/*
// @match        https://owo.ecycloud.com/user*
// @match        https://owo.ecycloud.com/auth/*
// @match        https://kuku.baidu.com/*
// @match        https://www.hifiti.com/*
// @match        https://www.kurobbs.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
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
// @updateURL    https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.meta.js
// @downloadURL  https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.user.js
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

(() => {
  'use strict';
  const VERSION = "1.6.1";
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
    "url": "https://kuku.baidu.com/",
    "cleanUrl": true,
    "hosts": [
      "kuku.baidu.com"
    ],
    "matches": [
      "https://kuku.baidu.com/*"
    ],
    "autoPaths": [
      "/"
    ],
    "defaultEnabled": true,
    "loginPaths": [
      "/login",
      "/genflowpro"
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
        if (!site.cleanUrl) url.searchParams.set('sc_daily_checkin', token);
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
  const id = Object.keys(SITE).find(key => SITE[key].hosts.includes(location.hostname));
  if (!id) return;
  const JOB_PARAM = 'sc_daily_checkin';
  const JOB_TTL = 220000;
  const SUBMIT_TTL = 90000;
  const SUBMIT_KEY = PREFIX + 'submitted:' + id;
  const stamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const result = (status, message) => ({ status, message });
  const labels = { success:'签到成功', already:'今日已签', login:'需要登录', manual:'需要人工', unknown:'结果未确认', failed:'执行失败', busy:'正在执行', disabled:'已停用', enabled:'已启用' };
  const normalize = text => String(text || '').replace(/\s+/g, '').trim();

  function captureJob() {
    try {
      const url = new URL(location.href);
      const token = url.searchParams.get(JOB_PARAM);
      if (token && /^[a-zA-Z0-9_-]{8,100}$/.test(token)) {
        const job = { token, force: token.startsWith('force_'), at: Date.now() };
        sessionStorage.setItem(PREFIX + 'job', JSON.stringify(job));
        url.searchParams.delete(JOB_PARAM);
        history.replaceState(history.state, '', url.href);
        return job;
      }
      const job = JSON.parse(sessionStorage.getItem(PREFIX + 'job') || 'null');
      return job && Date.now() - job.at < JOB_TTL ? job : null;
    } catch { return null; }
  }
  function markSubmitted() {
    try { sessionStorage.setItem(SUBMIT_KEY, JSON.stringify({ at: Date.now(), day: localDay() })); } catch {}
  }
  function readSubmitted() {
    try {
      const entry = JSON.parse(sessionStorage.getItem(SUBMIT_KEY) || 'null');
      return entry && Date.now() - entry.at < SUBMIT_TTL && entry.day === localDay() ? entry : null;
    } catch { return null; }
  }
  function clearSubmitted() {
    try { sessionStorage.removeItem(SUBMIT_KEY); } catch {}
  }
  let job = captureJob();
  let running = null;
  let badge = null;

  function show(status, message) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'sc-three-sites-status';
      badge.title = '点击关闭提示';
      Object.assign(badge.style, {
        position: 'fixed', bottom: '18px', right: '18px', zIndex: '2147483647',
        background: '#142235', color: '#fff', padding: '12px 16px', borderRadius: '10px',
        font: '13px/1.6 system-ui,sans-serif', maxWidth: '350px', boxShadow: '0 4px 18px #0004',
        cursor: 'pointer',
      });
      badge.onclick = () => { try { badge.remove?.(); badge = null; } catch {} };
      document.body.appendChild(badge);
    }
    badge.textContent = `${SITE[id].name} · ${labels[status] || status}：${message}`;
  }

  async function publish(outcome, token = job?.token) {
    const entry = { ...outcome, site: id, name: SITE[id].name, version: VERSION, time: stamp(), at: Date.now(), token: token || '' };
    // Only status is persisted. No cookies, tokens, response bodies or account information.
    await write('result:' + id, entry);
    show(outcome.status, outcome.message);
    console.info(`[三站签到] ${SITE[id].name}：${labels[outcome.status]}；${outcome.message}`);
    if (token && job?.token === token) sessionStorage.removeItem(PREFIX + 'job');
    return entry;
  }

  async function requestJSON(path, options = {}) {
    const target = new URL(path, location.origin);
    const allowedOrigins = [location.origin, ...(SITE[id]?.apiOrigins || [])];
    if (!allowedOrigins.includes(target.origin)) throw new Error('禁止向其他站点发送认证信息');
    const crossOrigin = target.origin !== location.origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(target.href, {
        ...options, credentials: crossOrigin ? 'omit' : 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...options.headers },
      });
      if (response.status === 401 || response.status === 403) {
        return { http: response.status, login: response.status === 401, forbidden: response.status === 403 };
      }
      if (!allowedOrigins.includes(new URL(response.url || target.href).origin)) return { login: true };
      if (/\/auth\/login|passport\.baidu\.com/.test(response.url || '')) return { login: true };
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { return { http: response.status, html: true }; }
      return { http: response.status, good: response.ok, data };
    } finally { clearTimeout(timer); }
  }

  function authFailure(response) {
    if (response.login) return result('login', '请在此浏览器手动重新登录后再运行');
    if (response.forbidden) return result('manual', '访问被拒绝，请检查登录状态或人工验证');
    if (response.html) return result('manual', '接口返回网页，请检查是否需要登录或人机验证');
    if (!response.good) return result('failed', `服务器 HTTP ${response.http}`);
    return null;
  }


  async function zhiyao() {
    const getToken = () => localStorage.getItem('user_token');
    const headers = () => ({ Authorization: 'Bearer ' + getToken() });
    if (!getToken()) return result('login', '请先在知遥 API 登录；令牌会从当前页面实时读取');
    const before = await requestJSON('/user/rewards/summary', { headers: headers() });
    const denied = authFailure(before);
    if (denied) return denied;
    if (before.data?.today_checked_in === true) return result('already', '服务端确认今日已签到');
    if (before.data?.today_checked_in !== false) return result('unknown', '签到状态格式变化，未发送签到请求');
    const submission = await requestJSON('/user/checkin', { method: 'POST', headers: headers() });
    const rejected = authFailure(submission);
    if (rejected) return rejected;
    const after = await requestJSON('/user/rewards/summary', { headers: headers() });
    if (after.good && after.data?.today_checked_in === true) return result('success', '签到后查询确认今日已签');
    return result('unknown', '已提交，但服务端未确认今日已签；请查看官网，勿连续重试');
  }

  const ECY_CLOSE_XPATH = '/html/body/main[2]/div/section/div[5]/div/div/div[2]/div/div/div/span[2]';
  const ECY_CHECKIN_XPATH = '/html/body/main[2]/div/section/div[1]/div[3]/div[1]/div[2]/div[2]/div[6]/div';

  function ecyAt(xpath) {
    return document.evaluate(xpath, document, null, 9, null).singleNodeValue;
  }
  function ecyVisible(element) {
    if (!element || element.hidden || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }
  function ecyAlready() {
    return [document.querySelector('#checkin-btn'), ecyAt(ECY_CHECKIN_XPATH), document.querySelector('#checkin')].some(area =>
      ecyVisible(area) && /今日已签到|今日已簽到|Checked-?in-?today/i.test(normalize(area.textContent)));
  }
  function ecyButton() {
    const area = ecyAt(ECY_CHECKIN_XPATH);
    // The supplied XPath may identify a wrapper. The official handler is on #checkin.
    const official = area?.querySelector('#checkin') || document.querySelector('#checkin');
    const button = official || area;
    if (!ecyVisible(button) || button.disabled || button.getAttribute('aria-disabled') === 'true' ||
        button.classList.contains('disabled') || button.classList.contains('is-disabled')) return null;
    if (!official && !/^(?:(?:立即|每日|点击|今日)?签到|簽到|Check-?in)$/i.test(normalize(button.textContent))) return null;
    return button;
  }
  function ecyCloseButton() {
    const supplied = ecyAt(ECY_CLOSE_XPATH);
    if (ecyVisible(supplied)) return supplied;
    // Only dismiss the site's known informational modals, never arbitrary dialogs.
    for (const selector of ['#latestAnnouncementModal', '#result']) {
      const modal = document.querySelector(selector);
      if (!ecyVisible(modal)) continue;
      const button = modal.querySelector('[data-dismiss="modal"], [data-bs-dismiss="modal"], button.close');
      if (ecyVisible(button)) return button;
    }
    return null;
  }
  function ecyBlocked() {
    return ecyVisible(ecyAt(ECY_CLOSE_XPATH)) ||
      Array.from(document.querySelectorAll('.modal, [role="dialog"], .modal-backdrop')).some(ecyVisible);
  }
  function ecyIssue(submitted) {
    if (/^\/auth\//.test(location.pathname)) return result('login', '请在 ECY Cloud 手动登录后重新运行');
    const message = document.querySelector('#msg');
    const text = ecyVisible(message) ? normalize(message.textContent) : '';
    if (/请.*登录|登录.*(?:失效|过期)|未登录|loginrequired|sessionexpired/i.test(text)) {
      return result('login', '官网要求重新登录，请手动登录后再运行');
    }
    if (/验证码|人机验证|人機驗證|滑动验证|安全验证|操作过于频繁|请求过于频繁|captcha|turnstile/i.test(text)) {
      return result('manual', '官网要求人工验证或限流，已停止自动操作');
    }
    if (submitted && /失败|失敗|发生错误|發生錯誤|网络错误|拒绝|failed|error/i.test(text)) {
      return result('failed', '官网提示签到失败，请查看页面（未保存原始提示）');
    }
    return null;
  }

  async function ecy() {
    if (/^\/auth\//.test(location.pathname)) return result('login', '请在 ECY Cloud 手动登录后重新运行');
    if (!/^\/user\/?$/.test(location.pathname)) return result('manual', '请打开 ECY Cloud 用户中心后再签到');
    if (ecyAlready()) return result('already', '官网签到区域显示今日已签到');
    const initialIssue = ecyIssue(false);
    if (initialIssue) return initialIssue;
    const closed = new Set();
    const loadDeadline = Date.now() + 35000;
    let readySince = null;
    let clearSince = null;
    let button = null;
    let blocked = false;
    while (Date.now() < loadDeadline) {
      if (ecyAlready()) return result('already', '官网签到区域显示今日已签到');
      const issue = ecyIssue(false);
      if (issue) return issue;
      if (document.readyState !== 'complete') {
        readySince = null;
        await sleep(250);
        continue;
      }
      readySince ??= Date.now();
      // jQuery ready initializes popups and click handlers after DOMContentLoaded.
      if (Date.now() - readySince < 1000) { await sleep(250); continue; }
      const close = ecyCloseButton();
      if (close && !closed.has(close)) {
        closed.add(close);
        close.click();
        clearSince = null;
        await sleep(250);
        continue;
      }
      blocked = ecyBlocked();
      if (blocked) clearSince = null;
      else clearSince ??= Date.now();
      const candidate = ecyButton();
      if (candidate && clearSince !== null && Date.now() - clearSince >= 750) {
        button = candidate;
        break;
      }
      await sleep(250);
    }
    if (!button) {
      return result('manual', blocked ? '官网弹窗或遮罩未关闭，请手动处理后重新运行' : '未找到可用的官网签到入口，页面未准备好或结构已变化');
    }
    // Let the official handler build session/captcha parameters. Submit exactly once.
    button.click();
    const verifyDeadline = Date.now() + 25000;
    while (Date.now() < verifyDeadline) {
      await sleep(250);
      if (ecyAlready()) return result('success', '官网签到区域已更新为今日已签到');
      const issue = ecyIssue(true);
      if (issue) return issue;
    }
    return result('unknown', '仅点击一次官网签到，未确认结果；请查看保留页面，未自动重试');
  }

  const KUKU_CARD_SELECTORS = ['[data-testid="sidebar-signin-card"]', '[data-testid="signin-promo"]'];
  const KUKU_CTA_SELECTORS = ['[data-testid="sidebar-signin-card-cta"]', '[data-testid="signin-promo-cta"]', 'button.signin-promo-cta'];
  const KUKU_DAYS_SELECTORS = ['[data-testid="sidebar-signin-card-days"]', '[data-testid="signin-promo-days"]', '.signin-promo-days'];
  const KUKU_EXPAND_SELECTORS = ['[data-testid="workbench-left-sidebar-restore"]', '[data-testid="left-sidebar-expand"]'];
  const KUKU_TOAST_SELECTORS = ['[data-sonner-toast]', '[role="status"]', '[role="alert"]', '.pc-toast', '.toast'];

  function kukuVisible(element) {
    if (!element || element.hidden || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }
  function kukuFirst(root, selectors) {
    for (const selector of selectors) {
      const found = root?.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
  function kukuLoggedIn() {
    return kukuVisible(document.querySelector('[data-testid="user-profile"]'));
  }
  function kukuLoggedOut() {
    return !kukuLoggedIn() && kukuVisible(document.querySelector('[data-testid="sidebar-auth-login"]'));
  }
  function kukuState(button) {
    const text = normalize(button?.textContent);
    if (button?.classList?.contains('is-signed') && text === '今日已签') return 'signed';
    if (/^去抽会员(?:\(\d+\))?$/.test(text)) return 'signed';
    if (text === '登录领奖') return 'login';
    if (text === '立即签到' && !button.disabled && !button.classList?.contains('is-disabled')) return 'ready';
    return 'loading';
  }
  function kukuCardTarget(loggedIn) {
    for (const selector of KUKU_CARD_SELECTORS) {
      for (const card of Array.from(document.querySelectorAll(selector))) {
        if (!kukuVisible(card)) continue;
        const cta = kukuFirst(card, KUKU_CTA_SELECTORS);
        if (!kukuVisible(cta)) continue;
        const hasDays = Boolean(kukuFirst(card, KUKU_DAYS_SELECTORS));
        if (card.querySelector?.('.signin-promo-day--signed-today') && !['立即签到', '登录领奖'].includes(normalize(cta.textContent))) {
          return { state: 'signed', button: cta, kind: 'card' };
        }
        const state = kukuState(cta);
        // SigninPromoCard renders guest fallback ("登录领奖" without days) while homepage status is still null.
        if (state === 'login' && (loggedIn || !hasDays)) return { state: 'loading', button: cta, kind: 'card' };
        return { state, button: cta, kind: 'card' };
      }
    }
    return null;
  }
  function kukuIframeTarget() {
    const iframe = document.querySelector('iframe[data-testid="signin-activity-center-iframe"]');
    if (!kukuVisible(iframe)) return null;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return null;
      const button = Array.from(doc.querySelectorAll('button.pc-sign-btn')).find(kukuVisible);
      if (!button) return { state: 'loading', button: null, kind: 'iframe', doc };
      return { state: kukuState(button), button, kind: 'iframe', doc };
    } catch { return null; }
  }
  function kukuHoverOpen(element) {
    try {
      if (typeof PointerEvent === 'function') {
        element.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
      } else if (typeof Event === 'function') {
        element.dispatchEvent(new Event('pointerenter', { bubbles: true, cancelable: true }));
      }
    } catch {}
    try { element.focus?.(); } catch {}
  }
  function kukuCloseHoverCard() {
    const closeBtn = document.querySelector('[data-testid="sidebar-signin-card-close"]');
    if (kukuVisible(closeBtn)) {
      try { closeBtn.click(); } catch {}
    }
  }
  function kukuPromptOutcome(extraDoc = null) {
    const docs = [document, ...(extraDoc ? [extraDoc] : [])];
    const toastTexts = [];
    for (const doc of docs) {
      for (const selector of KUKU_TOAST_SELECTORS) {
        for (const node of Array.from(doc.querySelectorAll?.(selector) || [])) {
          if (kukuVisible(node)) toastTexts.push(node.textContent || '');
        }
      }
    }
    const toastJoined = toastTexts.join(' ');
    const bodyJoined = docs.map(doc => doc.body?.innerText || '').join(' ');
    if (/请完成人机验证|请完成滑动验证|操作过于频繁|请求过于频繁|安全验证|验证次数已达上限|账号存在异常/.test(toastJoined + ' ' + bodyJoined)) {
      return result('manual', '官网要求人工验证或限流，已停止自动操作');
    }
    if (/账户已过期|请重新登录|未登录/.test(toastJoined)) {
      return result('login', '官网提示登录状态失效，请重新登录');
    }
    if (/签到已结束|活动已结束|活动已下线/.test(toastJoined)) {
      return result('manual', '官网提示当前签到活动已结束');
    }
    if (/签到失败|获取反作弊参数失败/.test(toastJoined)) {
      return result('failed', '官网提示签到失败，未重复提交');
    }
    return null;
  }

  async function kuku() {
    if (SITE.kuku.loginPaths.includes(location.pathname)) {
      return result('login', '请在库库 AI 网页手动登录后重新运行');
    }
    if (location.pathname !== '/') {
      return result('manual', '请从库库 AI 首页工作台执行签到，避免直接访问旧活动子路径导致登录异常');
    }
    let expandedSidebar = false;
    let openedHoverCard = false;
    let lastHoverAt = 0;
    let openedFallbackModal = false;
    let target = null;
    const loadDeadline = Date.now() + 35000;
    while (Date.now() < loadDeadline) {
      if (SITE.kuku.loginPaths.includes(location.pathname) || kukuLoggedOut()) {
        if (openedHoverCard) kukuCloseHoverCard();
        return result('login', '请在库库 AI 网页手动登录后重新运行');
      }
      const loggedIn = kukuLoggedIn();
      const cardTarget = kukuCardTarget(loggedIn);
      const iframeTarget = kukuIframeTarget();
      target = cardTarget || iframeTarget;
      if (target?.state === 'signed') {
        if (openedHoverCard) kukuCloseHoverCard();
        return result('already', '官网今日签到状态已显示已签');
      }
      if (target?.state === 'login') {
        if (openedHoverCard) kukuCloseHoverCard();
        return result('login', '请在库库 AI 网页手动登录后重新运行');
      }
      if (target?.state === 'ready') break;
      const promptBefore = kukuPromptOutcome(iframeTarget?.doc);
      if (promptBefore) {
        if (openedHoverCard) kukuCloseHoverCard();
        return promptBefore;
      }
      if (!loggedIn && !cardTarget && !iframeTarget && !expandedSidebar) {
        const expandBtn = KUKU_EXPAND_SELECTORS.map(sel => document.querySelector(sel)).find(kukuVisible);
        if (expandBtn) {
          expandedSidebar = true;
          expandBtn.click();
          await sleep(400);
          continue;
        }
      }
      if (loggedIn && !cardTarget) {
        const sidebarEntry = document.querySelector('[data-testid="sidebar-signin-entry"]');
        if (kukuVisible(sidebarEntry)) {
          if (Date.now() - lastHoverAt >= 1500) {
            openedHoverCard = true;
            lastHoverAt = Date.now();
            kukuHoverOpen(sidebarEntry);
          }
        } else if (!iframeTarget && !openedFallbackModal) {
          const fallbackEntry = document.querySelector('[data-testid="sidebar-sign-in-entry"]');
          if (kukuVisible(fallbackEntry)) {
            openedFallbackModal = true;
            fallbackEntry.click();
          }
        }
      }
      await sleep(500);
    }
    if (target?.state !== 'ready' || !target.button) {
      if (openedHoverCard) kukuCloseHoverCard();
      if (SITE.kuku.loginPaths.includes(location.pathname) || kukuLoggedOut()) {
        return result('login', '请在库库 AI 网页手动登录后重新运行');
      }
      return result('manual', '官方签到入口未就绪，可能需要登录、验证或活动已结束');
    }
    // Official workbench handler sends authenticated sessionParams + antiParams and re-queries homepage.
    // Do not reproduce signatures, open lottery dialogs ("去抽会员"), claim prizes, buy makeup days or run chat tasks.
    target.button.click();
    const verifyDeadline = Date.now() + 25000;
    while (Date.now() < verifyDeadline) {
      await sleep(500);
      if (SITE.kuku.loginPaths.includes(location.pathname) || kukuLoggedOut()) {
        if (openedHoverCard) kukuCloseHoverCard();
        return result('login', '官网要求重新登录');
      }
      const loggedIn = kukuLoggedIn();
      const next = kukuCardTarget(loggedIn) || kukuIframeTarget();
      if (next?.state === 'signed') {
        if (openedHoverCard) kukuCloseHoverCard();
        return result('success', '官网请求完成并刷新为今日已签');
      }
      if (next?.state === 'login') {
        if (openedHoverCard) kukuCloseHoverCard();
        return result('login', '官网要求重新登录');
      }
      const promptAfter = kukuPromptOutcome(next?.doc);
      if (promptAfter) {
        if (openedHoverCard) kukuCloseHoverCard();
        return promptAfter;
      }
      if (openedHoverCard && loggedIn && !next && Date.now() - lastHoverAt >= 2000) {
        const sidebarEntry = document.querySelector('[data-testid="sidebar-signin-entry"]');
        if (kukuVisible(sidebarEntry)) {
          lastHoverAt = Date.now();
          kukuHoverOpen(sidebarEntry);
        }
      }
    }
    if (openedHoverCard) kukuCloseHoverCard();
    return result('unknown', '仅点击一次，未确认签到结果；保留页面供你检查');
  }

  const HIFITI_CHECKIN_XPATH = '/html/body/main/div/div/div[2]/div[1]/span';
  const HIFITI_LABEL_XPATH = '/html/body/main/div/div/div[2]/div[1]/span/div[1]';
  const HIFITI_SIGNED_RE = /^(?:(?:今日|今天)?已签(?:到)?)$/;
  const HIFITI_LOGIN_RE = /^(?:请先登录|登录后签到|登录签到|登录)$/;
  const HIFITI_READY_RE = /^(?:(?:立即|每日|点击|今日)?签到)$/;
  const HIFITI_CONFIRM_PATH_RE = /^\/sg_sign\.htm\/?$/;

  function hifitiAt(xpath) {
    return document.evaluate(xpath, document, null, 9, null).singleNodeValue;
  }
  function hifitiVisible(element) {
    if (!element || element.hidden || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function hifitiPick(elements, allowHidden = false) {
    for (const element of elements) {
      if (element && !element.hidden && hifitiVisible(element)) return element;
    }
    if (!allowHidden) return null;
    for (const element of elements) {
      if (element && !element.hidden) return element;
    }
    return null;
  }
  function hifitiButton(allowHidden = false) {
    return hifitiPick([
      hifitiAt(HIFITI_CHECKIN_XPATH),
      document.querySelector('#sg_sign'),
      document.querySelector('#sign'),
    ], allowHidden);
  }
  function hifitiLabel(button, allowHidden = false) {
    return hifitiPick([
      hifitiAt(HIFITI_LABEL_XPATH),
      button?.querySelector('#sign'),
      document.querySelector('#sign'),
      button,
    ], allowHidden);
  }
  function hifitiDisabled(button) {
    return !button || button.disabled || button.getAttribute('aria-disabled') === 'true' ||
      button.classList.contains('disabled') || button.classList.contains('is-disabled');
  }
  function hifitiState(button, allowHidden = false) {
    const label = hifitiLabel(button, allowHidden);
    if (!label) return 'loading';
    const text = normalize(label.textContent);
    if (HIFITI_SIGNED_RE.test(text)) return 'signed';
    if (HIFITI_LOGIN_RE.test(text)) return 'login';
    if (HIFITI_READY_RE.test(text)) {
      if (allowHidden) return 'ready';
      return button && !hifitiDisabled(button) ? 'ready' : 'loading';
    }
    return 'loading';
  }
  function hifitiIssue(submitted) {
    if (/^\/user-login(?:\.htm)?\/?$/.test(location.pathname)) {
      return result('login', '请在 HiFiTi 手动登录后重新运行');
    }
    // Only inspect visible site feedback, never forum posts or the script's status badge.
    const messages = Array.from(document.querySelectorAll('[role="alert"], [role="dialog"], .modal, .alert, .jconfirm-content'))
      .filter(hifitiVisible).map(element => normalize(element.textContent));
    if (messages.some(text => /请.*登录|未登录|登录.*(?:失效|过期)/.test(text))) {
      return result('login', '官网要求重新登录，请手动登录后再运行');
    }
    if (messages.some(text => /验证码|人机验证|滑动验证|安全验证|操作过于频繁|请求过于频繁|captcha|turnstile/i.test(text))) {
      return result('manual', '官网要求人工验证或限流，已停止自动操作');
    }
    if (submitted && messages.some(text => /签到失败|簽到失敗|网络错误|请求失败/.test(text))) {
      return result('failed', '官网提示签到失败，请查看页面（未保存原始提示）');
    }
    return null;
  }
  async function hifitiConfirmRedirect() {
    const pending = readSubmitted();
    clearSubmitted();
    const initialIssue = hifitiIssue(Boolean(pending));
    if (initialIssue) return initialIssue;
    const deadline = Date.now() + (pending ? 15000 : 3000);
    let readySince = null;
    while (Date.now() < deadline) {
      const issue = hifitiIssue(Boolean(pending));
      if (issue) return issue;
      // On /sg_sign.htm, #start uses d-none d-xl-block so it may be CSS-hidden on <1200px viewports.
      const state = hifitiState(hifitiButton(true), true);
      if (state === 'signed') {
        return pending
          ? result('success', '官网跳转签到页确认已签')
          : result('already', '官网签到页显示已签');
      }
      if (state === 'login') return result('login', '官网要求重新登录');
      if (!pending) {
        if (document.readyState === 'complete' && state === 'ready') {
          return result('manual', '请打开 HiFiTi 首页后再签到');
        }
      } else if (document.readyState === 'complete' && state === 'ready') {
        readySince ??= Date.now();
        if (Date.now() - readySince >= 1000) {
          return result('failed', '跳转签到页后仍显示签到，未确认成功');
        }
      } else {
        readySince = null;
      }
      await sleep(250);
    }
    return pending
      ? result('unknown', '跳转签到页后未确认已签状态；请查看保留页面，未自动重试')
      : result('manual', '请打开 HiFiTi 首页后再签到');
  }

  async function hifiti() {
    if (HIFITI_CONFIRM_PATH_RE.test(location.pathname)) {
      return hifitiConfirmRedirect();
    }
    clearSubmitted();
    if (/^\/user-login(?:\.htm)?\/?$/.test(location.pathname)) {
      return result('login', '请在 HiFiTi 手动登录后重新运行');
    }
    if (location.pathname !== '/') return result('manual', '请打开 HiFiTi 首页后再签到');
    const loadDeadline = Date.now() + 35000;
    let readySince = null;
    let button = null;
    let ready = false;
    while (Date.now() < loadDeadline) {
      button = hifitiButton();
      const state = hifitiState(button);
      if (state === 'signed') return result('already', '官网签到按钮显示已签');
      if (state === 'login') return result('login', '请在 HiFiTi 手动登录后重新运行');
      const issue = hifitiIssue(false);
      if (issue) return issue;
      if (document.readyState !== 'complete') readySince = null;
      else readySince ??= Date.now();
      // Allow the official page to attach its click handler after loading.
      if (state === 'ready' && readySince !== null && Date.now() - readySince >= 1000) {
        ready = true;
        break;
      }
      await sleep(250);
    }
    if (!ready) return result('manual', '未找到可用的 HiFiTi 签到入口，请检查登录、验证或页面变化');
    markSubmitted();
    button.click();
    const verifyDeadline = Date.now() + 25000;
    while (Date.now() < verifyDeadline) {
      await sleep(250);
      if (HIFITI_CONFIRM_PATH_RE.test(location.pathname)) {
        return hifitiConfirmRedirect();
      }
      const state = hifitiState(hifitiButton());
      if (state === 'signed') {
        clearSubmitted();
        return result('success', '官网签到按钮已更新为已签');
      }
      if (state === 'login') {
        clearSubmitted();
        return result('login', '官网要求重新登录');
      }
      const issue = hifitiIssue(true);
      if (issue) {
        clearSubmitted();
        return issue;
      }
    }
    clearSubmitted();
    return result('unknown', '仅点击一次官网签到，未确认已签状态；请查看保留页面，未自动重试');
  }

  const KURO_API_ORIGIN = 'https://api.kurobbs.com';
  const KURO_MC_GAME_ID = '3';
  const KURO_LOGIN_CODES = new Set([220, 230]);
  const KURO_ALREADY_CODE = 1511;

  function kuroReadAuth() {
    let auth = null;
    try { auth = JSON.parse(localStorage.getItem('auth') || 'null'); } catch { auth = null; }
    const token = String(localStorage.getItem('auth_token') || auth?.token || '').trim();
    const devCode = String(localStorage.getItem('dc') || '').trim();
    const distinctId = String(localStorage.getItem('distinct_id') || '').trim();
    const userId = auth?.userId != null ? String(auth.userId).trim() : '';
    return { token, devCode, distinctId, userId };
  }

  function kuroHeaders(cred) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      token: cred.token,
      source: 'h5',
    };
    if (cred.devCode) headers.devCode = cred.devCode;
    if (cred.distinctId) headers.distinct_id = cred.distinctId;
    return headers;
  }

  function kuroPost(path, params, cred) {
    return requestJSON(KURO_API_ORIGIN + path, {
      method: 'POST',
      headers: kuroHeaders(cred),
      body: new URLSearchParams(params).toString(),
    });
  }

  function kuroFailure(response, allowCodes = []) {
    const denied = authFailure(response);
    if (denied) return denied;
    const code = response.data?.code;
    if (KURO_LOGIN_CODES.has(code)) {
      return result('login', '库街区登录已过期，请在此浏览器重新登录后再运行');
    }
    if (code === 200 || code === 0 || allowCodes.includes(code)) return null;
    const msg = normalize(response.data?.msg || response.data?.message);
    if (/验证码|人机验证|滑动验证|安全验证|操作过于频繁|请求过于频繁|风控/.test(msg)) {
      return result('manual', '库街区要求人工验证或限流，已停止自动操作');
    }
    if (typeof code === 'number') {
      return result('failed', `库街区接口返回异常（code ${code}），请查看官网`);
    }
    return result('unknown', '库街区接口返回格式变化，未确认签到结果');
  }

  function kuroMonth(info) {
    for (const candidate of [info?.eventStartTimes, info?.nowServerTimes]) {
      const month = String(candidate || '').slice(5, 7);
      if (/^(?:0[1-9]|1[0-2])$/.test(month)) return month;
    }
    return String(new Date().getMonth() + 1).padStart(2, '0');
  }

  async function kurobbs() {
    const cred = kuroReadAuth();
    if (!cred.token) {
      return result('login', '请先在库街区网页版登录；令牌会从当前页面实时读取');
    }
    const roleRes = await kuroPost('/gamer/role/list', { gameId: KURO_MC_GAME_ID }, cred);
    const roleErr = kuroFailure(roleRes);
    if (roleErr) return roleErr;
    const roles = Array.isArray(roleRes.data?.data) ? roleRes.data.data : [];
    const mcRoles = roles.filter(role => role && (role.gameId == null || String(role.gameId) === KURO_MC_GAME_ID));
    const role = mcRoles.find(item => item.isDefault) || mcRoles[0];
    const serverId = role?.serverId != null ? String(role.serverId).trim() : '';
    const roleId = role?.roleId != null ? String(role.roleId).trim() : '';
    const userId = role?.userId != null ? String(role.userId).trim() : cred.userId;
    if (!serverId || !roleId || !userId) {
      return result('manual', '未找到已绑定的鸣潮角色，请在库街区确认角色绑定状态');
    }

    const baseParams = { gameId: KURO_MC_GAME_ID, serverId, roleId, userId };
    const before = await kuroPost('/encourage/signIn/initSignInV2', baseParams, cred);
    const beforeErr = kuroFailure(before);
    if (beforeErr) return beforeErr;
    const beforeInfo = before.data?.data;
    if (beforeInfo?.isSigIn === true) {
      return result('already', '服务端确认鸣潮今日已签到');
    }
    if (beforeInfo?.isSigIn !== false) {
      return result('unknown', '鸣潮签到状态格式变化，未发送签到请求');
    }

    const reqMonth = kuroMonth(beforeInfo);
    const submission = await kuroPost('/encourage/signIn/v2', { ...baseParams, reqMonth }, cred);
    const submitErr = kuroFailure(submission, [KURO_ALREADY_CODE]);
    if (submitErr) return submitErr;
    const duplicate = submission.data?.code === KURO_ALREADY_CODE;

    const after = await kuroPost('/encourage/signIn/initSignInV2', baseParams, cred);
    const afterErr = kuroFailure(after);
    if (afterErr) {
      return afterErr.status === 'login'
        ? afterErr
        : result('unknown', '已提交鸣潮签到，但状态复核失败；请查看官网，勿连续重试');
    }
    if (after.data?.data?.isSigIn === true) {
      return duplicate
        ? result('already', '服务端复核确认鸣潮今日已签到')
        : result('success', '鸣潮签到后查询确认今日已签');
    }
    return result('unknown', '已提交鸣潮签到，但服务端未确认今日已签；请查看官网，勿连续重试');
  }

  const ADAPTERS = {"zhiyao":zhiyao,"ecy":ecy,"kuku":kuku,"hifiti":hifiti,"kurobbs":kurobbs};

  async function run(options = {}) {
    const force = Boolean(options?.force || job?.force || job?.token?.startsWith('force_'));
    if (running) return running;
    running = (async () => {
      const perform = async () => {
        if (!(await deviceEnabled())) {
          const outcome = result('disabled', '当前设备未启用本脚本，请先在菜单或设置中启用');
          if (job?.token) return publish(outcome);
          show(outcome.status, outcome.message);
          return outcome;
        }
        if (!(await siteEnabled(id))) return publish(result('disabled', '本站已在个人配置中停用'));
        if (!force && await completedToday(id)) {
          clearSubmitted();
          return publish(result('already', '本地已记录今日成功签到'));
        }
        show('busy', force ? '正在重新核验当前页面及今日签到状态' : '检查当前会话及今日签到状态');
        const day = localDay();
        try {
          const outcome = await ADAPTERS[id]();
          if (['success', 'already'].includes(outcome.status)) {
            await saveCompletion(id, outcome, day);
          } else if (force && ['login', 'failed', 'manual'].includes(outcome.status)) {
            await clearCompletion(id);
          }
          return await publish(outcome);
        } catch (error) {
          clearSubmitted();
          console.warn('[三站签到]', SITE[id].name, error?.name || 'Error');
          return publish(result('unknown', '请求超时或脚本执行异常；未自动重发，请检查官网'));
        }
      };
      // Chrome Web Locks prevents simultaneous tabs submitting for this origin.
      return navigator.locks ? navigator.locks.request(PREFIX + 'submit', perform) : perform();
    })().finally(() => { running = null; });
    return running;
  }

  async function openSite(site) {
    if (!(await deviceEnabled())) { show('disabled', '当前设备未启用本脚本，请先在菜单或设置中启用'); return; }
    if (!(await siteEnabled(site))) { show('disabled', '本站已停用，请先到配置中启用'); return; }
    const token = `manual_${Date.now()}_${site}`;
    const url = new URL(SITE[site].url);
    if (SITE[site].cleanUrl) await write('pending:' + site, { token, at: Date.now() });
    else url.searchParams.set(JOB_PARAM, token);
    return GM_openInTab(url.href, { active: true, insert: false, setParent: false });
  }

  async function requestManualBatch() {
    if (!(await deviceEnabled())) {
      show('disabled', '当前设备未启用本脚本，请先在菜单或设置中启用');
      return '当前设备未启用本脚本';
    }
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    show('busy', '正在请求后台启动全站重新核验');
    await write('manualRequest', { id: requestId, at: Date.now() });
    for (let i = 0; i < 4; i++) {
      await sleep(150);
      const ack = await read('manualAck', null);
      if (ack?.id === requestId) {
        show('busy', '已交由后台脚本执行全站重新核验，关闭本页不会中断');
        return '已交由后台脚本执行';
      }
    }
    return runBatch({ force: true, startup: false });
  }

  let refreshDeviceMenu = null;
  async function toggleDeviceEnabled() {
    const next = await setDeviceEnabled(!(await deviceEnabled()));
    if (refreshDeviceMenu) await refreshDeviceMenu();
    show(
      next ? 'enabled' : 'disabled',
      next
        ? '当前设备已启用脚本，下次运行生效（仅本设备有效，不同步）'
        : '当前设备已停用脚本：自动与手动签到均已拦截（仅本设备有效，不同步）'
    );
    return next;
  }

  async function main() {
    if (!refreshDeviceMenu) refreshDeviceMenu = setupDeviceMenu(toggleDeviceEnabled);
    await refreshDeviceMenu();
    GM_registerMenuCommand('本站：检查并签到', () => run({ force: true }));
    GM_registerMenuCommand('打开本站签到页', () => openSite(id));
    GM_registerMenuCommand('全部已启用网站：立即重新核验并签到', () =>
      requestManualBatch().catch(error => show('failed', error?.message || '部分网站未完成，请查看保留页面和运行日志')));
    GM_registerMenuCommand('启用 / 停用本站', async () => {
      const enabled = !(await siteEnabled(id));
      await setSetting('sites.' + id, enabled);
      show(enabled ? 'enabled' : 'disabled', enabled ? '本站已启用，下次运行生效' : '已停用：访问、单站、批量和启动检查均不再提交');
    });
    GM_registerMenuCommand('站点与启动设置', () => CAT_userConfig());
    if (!(await deviceEnabled())) {
      if (job?.token) await run();
      return;
    }
    // Recover job token when cleanUrl is enabled or server-side login redirect stripped URL marker.
    if (!job && (SITE[id].cleanUrl || SITE[id].loginPaths.includes(location.pathname) || SITE[id].loginPrefixes.some(prefix => location.pathname.startsWith(prefix)))) {
      const pending = await read('pending:' + id, null);
      if (pending?.token && Date.now() - pending.at < 110000) {
        job = { ...pending, force: pending.token.startsWith('force_') };
        try { sessionStorage.setItem(PREFIX + 'job', JSON.stringify(job)); } catch {}
        if (SITE[id].cleanUrl) await write('pending:' + id, null);
      }
    }
    const confirmTarget = Boolean(readSubmitted()) && (SITE[id].confirmPaths || []).includes(location.pathname);
    const normalTarget = SITE[id].autoPaths.includes(location.pathname);
    if (job || confirmTarget || (normalTarget && await setting('behavior.autoVisit', true))) await run();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => main().catch(console.error), { once: true });
  else main().catch(console.error);

})();
