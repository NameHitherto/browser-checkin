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
