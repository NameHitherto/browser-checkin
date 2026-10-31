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


/* ADAPTERS */
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
