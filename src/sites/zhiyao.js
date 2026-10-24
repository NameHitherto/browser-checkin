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
