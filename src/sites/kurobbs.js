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
