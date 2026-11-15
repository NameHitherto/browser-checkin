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
