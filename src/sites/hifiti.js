  const HIFITI_CHECKIN_XPATH = '/html/body/main/div/div/div[2]/div[1]/span';

  function hifitiVisible(element) {
    if (!element || element.hidden || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function hifitiButton() {
    const supplied = document.evaluate(HIFITI_CHECKIN_XPATH, document, null, 9, null).singleNodeValue;
    return hifitiVisible(supplied) ? supplied : document.querySelector('#sign');
  }
  function hifitiState(button) {
    if (!hifitiVisible(button)) return 'loading';
    const label = button.querySelector('#sign') || button;
    if (!hifitiVisible(label)) return 'loading';
    const text = normalize(label.textContent);
    // The user confirmed the daily completed label: <div id="sign">已签</div>.
    if (/^(?:(?:今日|今天)?已签(?:到)?)$/.test(text)) return 'signed';
    if (/^(?:请先登录|登录后签到|登录签到|登录)$/.test(text)) return 'login';
    if (/^(?:(?:立即|每日|点击|今日)?签到)$/.test(text) && !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true' && !button.classList.contains('disabled') &&
        !button.classList.contains('is-disabled')) return 'ready';
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

  async function hifiti() {
    const initialIssue = hifitiIssue(false);
    if (initialIssue) return initialIssue;
    if (location.pathname !== '/') return result('manual', '请打开 HiFiTi 首页后再签到');
    const loadDeadline = Date.now() + 35000;
    let readySince = null;
    let button;
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
      if (state === 'ready' && readySince !== null && Date.now() - readySince >= 1000) break;
      await sleep(250);
    }
    if (Date.now() >= loadDeadline) return result('manual', '未找到可用的 HiFiTi 签到入口，请检查登录、验证或页面变化');
    button.click();
    const verifyDeadline = Date.now() + 25000;
    while (Date.now() < verifyDeadline) {
      await sleep(250);
      const state = hifitiState(hifitiButton());
      if (state === 'signed') return result('success', '官网签到按钮已更新为已签');
      if (state === 'login') return result('login', '官网要求重新登录');
      const issue = hifitiIssue(true);
      if (issue) return issue;
    }
    return result('unknown', '仅点击一次官网签到，未确认已签状态；请查看保留页面，未自动重试');
  }
