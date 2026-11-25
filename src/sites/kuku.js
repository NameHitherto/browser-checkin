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
