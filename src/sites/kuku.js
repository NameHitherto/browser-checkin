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
