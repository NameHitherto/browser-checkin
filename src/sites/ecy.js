  function readEcyConfig() {
    const text = Array.from(document.scripts, script => script.textContent || '')
      .find(value => /UserIndexConfig\s*=/.test(value)) || '';
    const flag = name => {
      const match = text.match(new RegExp('["\']?' + name + '["\']?\\s*:\\s*(true|false|1|0)\\b'));
      return match ? /^(true|1)$/.test(match[1]) : null;
    };
    return { enabled: flag('enableCheckin'), captcha: flag('enableCheckinCaptcha') };
  }

  function ecyAlready(doc) {
    const area = doc.querySelector('#checkin-btn');
    return !!area && /今日已签到|今日已簽到|Checkedintoday|Checked-intoday/i.test(normalize(area.textContent));
  }

  async function ecy() {
    if (/^\/auth\//.test(location.pathname)) return result('login', '请在 ECY Cloud 手动登录后重新运行');
    if (ecyAlready(document)) return result('already', '官网签到区域显示今日已签到');
    const button = document.querySelector('#checkin');
    if (!button) return result('manual', '未找到官网签到按钮，请检查登录状态或页面变化');
    const config = readEcyConfig();
    if (config.enabled === false) return result('manual', '官网当前关闭签到功能');
    if (config.captcha !== false) return result('manual', '验证码已启用或配置无法确认，请在官网手动签到');
    const posted = await requestJSON('/user/checkin', {
      method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: '',
    });
    const denied = authFailure(posted);
    if (denied) return denied;
    const success = posted.data?.ret === 1 || posted.data?.ret === true;
    // Re-read authenticated HTML rather than treating HTTP 200 as success.
    const response = await fetch(new URL('/user', location.origin).href, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (/\/auth\//.test(response.url)) return result('login', '登录已失效，请重新登录');
    if (!response.ok) return result('unknown', '已提交，刷新签到状态失败；请查看官网');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (ecyAlready(doc)) return result(success ? 'success' : 'already', '重新读取官网确认今日已签到');
    if (success) return result('unknown', '接口报告成功，但官网状态未确认；请查看页面');
    const message = String(posted.data?.msg || '');
    if (/验证码|验证|captcha|turnstile/i.test(message)) return result('manual', '官网要求人工验证，请手动完成');
    return result('failed', '签到未成功，请查看官网提示（未保存原始响应）');
  }
