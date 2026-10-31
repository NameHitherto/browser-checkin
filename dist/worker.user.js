// ==UserScript==
// @name         三站签到 · 页面执行器
// @namespace    local.namehitherto.checkin
// @version      1.2.0
// @description  浏览器会话复用；可配置站点开关；官网结果复核
// @match        https://zhiyaoapi.top/*
// @match        https://owo.ecycloud.com/user*
// @match        https://owo.ecycloud.com/auth/*
// @match        https://kuku.baidu.com/*
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
// @grant        CAT_userConfig
// @updateURL    https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.meta.js
// @downloadURL  https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.user.js
// @homepageURL  https://github.com/NameHitherto/browser-checkin
// @supportURL   https://github.com/NameHitherto/browser-checkin/issues
// @license      MIT
// ==/UserScript==

/* ==UserConfig==
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
    title: 启用浏览器启动与跨日签到
    type: checkbox
    default: true
==/UserConfig== */

(() => {
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
  const id = Object.keys(SITE).find(key => SITE[key].hosts.includes(location.hostname));
  if (!id) return;
  const JOB_PARAM = 'sc_daily_checkin';
  const JOB_TTL = 180000;
  const stamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const result = (status, message) => ({ status, message });
  const labels = { success:'签到成功', already:'今日已签', login:'需要登录', manual:'需要人工', unknown:'结果未确认', failed:'执行失败', busy:'正在执行', disabled:'已停用', enabled:'已启用' };
  const normalize = text => String(text || '').replace(/\s+/g, '').trim();

  function captureJob() {
    try {
      const url = new URL(location.href);
      const token = url.searchParams.get(JOB_PARAM);
      if (token && /^[a-zA-Z0-9_-]{8,100}$/.test(token)) {
        const job = { token, at: Date.now() };
        sessionStorage.setItem(PREFIX + 'job', JSON.stringify(job));
        url.searchParams.delete(JOB_PARAM);
        history.replaceState(history.state, '', url.href);
        return job;
      }
      const job = JSON.parse(sessionStorage.getItem(PREFIX + 'job') || 'null');
      return job && Date.now() - job.at < JOB_TTL ? job : null;
    } catch { return null; }
  }
  let job = captureJob();
  let running = null;
  let badge = null;

  function show(status, message) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'sc-three-sites-status';
      Object.assign(badge.style, {
        position: 'fixed', bottom: '18px', right: '18px', zIndex: '2147483647',
        background: '#142235', color: '#fff', padding: '12px 16px', borderRadius: '10px',
        font: '13px/1.6 system-ui,sans-serif', maxWidth: '350px', boxShadow: '0 4px 18px #0004',
      });
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
    if (target.origin !== location.origin) throw new Error('禁止向其他站点发送认证信息');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(target.href, {
        ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...options.headers },
      });
      if (response.status === 401 || response.status === 403) {
        return { http: response.status, login: response.status === 401, forbidden: response.status === 403 };
      }
      if (new URL(response.url || target.href).origin !== location.origin) return { login: true };
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

  const ECY_CLOSE_XPATH = '/html/body/main[2]/div/section/div[4]/div/div/div[2]/p/button';
  const ECY_CHECKIN_XPATH = '/html/body/main[2]/div/section/div[1]/div[3]/div[1]/div[2]/div[2]/div[6]/div';

  function ecyAt(xpath) {
    return document.evaluate(xpath, document, null, 9, null).singleNodeValue;
  }
  function ecyVisible(element) {
    if (!element || element.hidden || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function ecyAlready() {
    return [document.querySelector('#checkin-btn'), ecyAt(ECY_CHECKIN_XPATH)].some(area =>
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

  function visible(element) {
    return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }
  function kukuButton() {
    return Array.from(document.querySelectorAll('button.pc-sign-btn')).find(visible);
  }
  function kukuState(button) {
    const text = normalize(button?.textContent);
    if (button?.classList.contains('is-signed') && text === '今日已签') return 'signed';
    if (text === '登录领奖') return 'login';
    if (text === '立即签到' && !button.disabled && !button.classList.contains('is-disabled')) return 'ready';
    return 'loading';
  }

  async function kuku() {
    if (!/^\/operation\/activitys\/kukuPcSignAct\/main\/?$/.test(location.pathname)) {
      return result('manual', '请使用菜单中的“打开本站签到页”进入官方活动页');
    }
    let button;
    const loadDeadline = Date.now() + 35000;
    while (Date.now() < loadDeadline) {
      button = kukuButton();
      const state = kukuState(button);
      if (state === 'signed') return result('already', '官网今日签到按钮已显示今日已签');
      if (state === 'login') return result('login', '请在库库 AI 网页手动登录后重新运行');
      if (state === 'ready') break;
      await sleep(500);
    }
    if (kukuState(button) !== 'ready') return result('manual', '官方活动页未准备好，可能需要登录、验证或活动已结束');
    // The official handler constructs tid and dynamic anti-abuse parameters.
    // Do not reproduce signatures, claim prizes, buy makeup days or click lotteries.
    button.click();
    const verifyDeadline = Date.now() + 25000;
    while (Date.now() < verifyDeadline) {
      await sleep(500);
      const state = kukuState(kukuButton());
      if (state === 'signed') return result('success', '官网请求完成并刷新为今日已签');
      if (state === 'login') return result('login', '官网要求重新登录');
      const text = document.body?.innerText || '';
      if (/请完成人机验证|请完成滑动验证|操作过于频繁|请求过于频繁|安全验证/.test(text)) {
        return result('manual', '官网要求人工验证或限流，已停止自动操作');
      }
    }
    return result('unknown', '仅点击一次，未确认签到结果；保留页面供你检查');
  }

  const ADAPTERS = {"zhiyao":zhiyao,"ecy":ecy,"kuku":kuku};

  async function run() {
    if (running) return running;
    running = (async () => {
      const perform = async () => {
        if (!(await siteEnabled(id))) return publish(result('disabled', '本站已在个人配置中停用'));
        if (await completedToday(id)) return publish(result('already', '本地已记录今日成功签到'));
        show('busy', '检查当前会话及今日签到状态');
        const day = localDay();
        try {
          const outcome = await ADAPTERS[id]();
          await saveCompletion(id, outcome, day);
          return await publish(outcome);
        }
        catch { return publish(result('unknown', '请求超时或脚本执行异常；未自动重发，请检查官网')); }
      };
      // Chrome Web Locks prevents simultaneous tabs submitting for this origin.
      return navigator.locks ? navigator.locks.request(PREFIX + 'submit', perform) : perform();
    })().finally(() => { running = null; });
    return running;
  }

  async function openSite(site) {
    if (!(await siteEnabled(site))) { show('disabled', '本站已停用，请先到配置中启用'); return; }
    const url = new URL(SITE[site].url);
    url.searchParams.set(JOB_PARAM, `manual_${Date.now()}_${site}`);
    return GM_openInTab(url.href, { active: true, insert: false, setParent: false });
  }
  async function main() {
    GM_registerMenuCommand('本站：检查并签到', run);
    GM_registerMenuCommand('打开本站签到页', () => openSite(id));
    GM_registerMenuCommand('全部已启用网站：立即签到', () => runBatch().catch(() => show('failed', '部分网站未完成，请查看保留页面和运行日志')));
    GM_registerMenuCommand('启用 / 停用本站', async () => {
      const enabled = !(await siteEnabled(id));
      await setSetting('sites.' + id, enabled);
      show(enabled ? 'enabled' : 'disabled', enabled ? '本站已启用，下次运行生效' : '已停用：访问、单站、批量和定时均不再提交');
    });
    GM_registerMenuCommand('站点与启动设置', () => CAT_userConfig());
    // A server-side login redirect may discard the URL marker before document-start.
    if (!job && (SITE[id].loginPaths.includes(location.pathname) || SITE[id].loginPrefixes.some(prefix => location.pathname.startsWith(prefix)))) {
      const pending = await read('pending:' + id, null);
      if (pending?.token && Date.now() - pending.at < 95000) job = pending;
    }
    const normalTarget = SITE[id].autoPaths.includes(location.pathname);
    if (job || (normalTarget && await setting('behavior.autoVisit', true))) await run();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => main().catch(console.error), { once: true });
  else main().catch(console.error);

})();
