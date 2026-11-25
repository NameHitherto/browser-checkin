# 接口依据与验收边界

核对日期：2026-10-24。来源为各站官方前端及其官方静态资源；没有把非官方脚本中的猜测当成接口证据。

| 网站 | 官方前端确认内容 |
|---|---|
| [知遥 dashboard](https://zhiyaoapi.top/dashboard) | localStorage.user_token；GET /user/rewards/summary；POST /user/checkin；today_checked_in |
| [ECY user.index.js](https://owo.ecycloud.com/theme/material/js/user.index.js?v=1792149483) | UserIndexConfig 验证码配置；POST /user/checkin；ret/msg；checkin-btn |
| [库库活动入口配置](https://nd-static.bdstatic.com/m-static/pc-genflow-pro/js/signin-activity-center-state.md9dfbox.js) | 官网指向 /operation/activitys/kukuPcSignAct/main |
| [库库活动接口配置](https://staticplat.cdn.bcebos.com/kuku/js/chunk-common-kukuNaSignAct~kukuPcSignAct~panNaGuideAct~panPcGuideAct.ebf80fd8.js) | /act/v2/kukuai30/homepage、/signin，以及动态风控参数处理 |
| [库库活动实现](https://staticplat.cdn.bcebos.com/kuku/js/32.ec1d9cde.js) | POST；tid；signed_today；button.pc-sign-btn / is-signed |

真实 Chrome 只读查看了 ECY 今日已签及库库活动页今日已签。没有在真实账号中执行三站未签→已签的端到端验收。源码引用的具体资源可能随官网部署变化。

1.1.0 的验收为：26 项离线行为场景、3 项构建/注册检查、构建一致性。自动化测试不联系真实站点，不能证明账号或活动仍然有效。GitHub 更新地址发布后的可访问性属于发布验收，不属于签到验收。

## 1.1.1 ECY 流程修复（2026-10-28）

用户提供了真实浏览器手动验证的两步顺序和 XPath：关闭提示弹窗，再点击签到入口。此次实时重读上述 ECY 官方公开 JS，确认 `#checkin` 绑定官网处理器、`#checkin-btn` 在成功响应后更新为“今日已签到”；初始化公告关闭后还可能接着弹出 `#result`。修复版使用官网处理器，等待提示和遮罩消失，不再自行构造签到 POST 或依赖能否读到旧验证码配置。

本地构建、42 项测试（39 项离线行为场景及 3 项构建/注册检查）和构建一致性检查通过。测试使用合成 DOM 与虚拟时钟，验证弹窗关闭顺序、页面初始化、单次点击、明确已签、登录/人工验证/错误/超时。[流程决策与验收映射](ECY-FLOW.md)

真实浏览器验证未完成：连接现有 ECY 标签页超时，随后浏览器工具因无法可靠确认当前 URL 而停止。用户手动验证、官方源码核对和修复版离线测试是不同证据；没有声称新版已在真实脚本猫环境完成未签到至已签到的端到端验证。

## 1.2.0 启动检查与每日状态（2026-11-01）

依据脚本猫官方[后台脚本文档](https://docs.scriptcat.org/docs/dev/background/)，`@background` 脚本在浏览器启动或脚本启用后持续运行；异步任务返回 Promise，且 Promise 结束后后续 GM 操作失效。因此启动器改用 `@background` 并返回持续运行的异步循环，启动立即检查，每分钟检测本机日期变化。

55 项本地测试（50 项离线行为场景、2 项全天空闲性能检查与 3 项构建/注册检查）通过，构建一致性通过。新增场景覆盖生成的后台脚本立即执行、失败后仍保留循环、逐站独立状态、只重试失败站点、同日重启跳过成功、零点失效、跨月跨年、休眠跨日、并发检查与遗留批次锁。请求跨零点时不把前一天的结果写成新一天成功。测试仅使用虚拟时钟、合成页面和模拟脚本猫 API；尚未在真实脚本猫中验收浏览器重启触发或账号签到。

性能检查直接执行生成的后台脚本，分别模拟当天成功与失败后的 1439 次分钟回调：扩展存储读写、标签页打开/关闭、通知、日志均为 0，始终只有一个待触发的 60 秒定时器；次日零点仍能启动新一日签到。沙盒不提供 DOM 和网络对象，检测阶段不接触页面或网络。Node VM 单次实测每组回调合计约 9–11 毫秒（含测试调度），仅用于辅助判断 JavaScript 逻辑开销，不是浏览器/脚本猫总 CPU、内存或页面加载耗时测量。普通网站不在页面脚本匹配范围；签到期间官网页面加载以及人工保留页面自身仍占用资源。

## 1.3.0 HiFiTi 与 ECY 定位更新（2026-11-09）

- HiFiTi 签到入口由用户提供：`/html/body/main/div/div/div[2]/div[1]/span`；用户进一步确认成功后的结构为 `<div class="font" id="sign">已签</div>`。适配器优先点击 XPath 入口，布局变化时可使用 `#sign`；仅签到控件的明确已签文案可确认完成，不从帖子正文、按钮禁用或普通提示推断成功。
- [HiFiTi 官方签到说明](https://www.hifiti.com/thread-2.htm)的公开搜索摘要说明电脑端入口位于首页右侧；本次直接读取首页仅得到跳转占位 HTML，浏览器连接超时。因此定位及已签判据依据用户提供的信息，未声称实时读取了登录后的官网处理器或接口。
- ECY 关闭定位更新为 `/html/body/main[2]/div/section/div[5]/div/div/div[2]/div/div/div/span[2]`。回归场景只提供此 XPath 对应的关闭控件，不提供旧语义回退，以验证新定位确实被使用。
- HiFiTi 默认启用以落实本次新增签到需求，复用四站统一调度和个人开关。测试覆盖异步已签、初始已签、定位回退、延迟加载、登录、验证、失败、超时、按钮不可用、禁用及登录跳转关联；未在真实脚本猫中完成新版本的账号签到验收。
- 66 项本地测试（61 项离线行为场景、2 项全天空闲性能检查与 3 项构建/注册检查）通过，构建及构建一致性检查通过。

## 1.3.1 HiFiTi 成功态与跳转确认修复（2026-11-15）

- 内置只读浏览器在访客态实测 `https://www.hifiti.com/` 与 `https://www.hifiti.com/sg_sign.htm`：两页右侧边栏均包含 `<div id="start"><span id="sg_sign"><div class="font" id="sign">签到</div>...</span></div>`，其中 `/html/body/main/div/div/div[2]/div[1]/span` 为 `#sg_sign`，`/html/body/main/div/div/div[2]/div[1]/span/div[1]` 为 `#sign`；点击 `#sg_sign` 会向 `sg_sign.htm` 发起 `POST` 并跳转到 `https://www.hifiti.com/sg_sign.htm`。另观察到 `sg_sign.htm` 上的 `#start` 带有 `d-none d-xl-block` 类（`<1200px` 视口下 CSS `display: none`）。
- 用户在真实已登录浏览器测试确认成功态为以下两者之一：1）重定向到 `https://www.hifiti.com/sg_sign.htm` 且 `/html/body/main/div/div/div[2]/div[1]/span/div[1]` 文字为“已签”（失败为“签到”）；2）首页 `/` 的 `/html/body/main/div/div/div[2]/div[1]/span/div[1]` 文字为“已签”（正常为“签到”）。
- 修复将 `HIFITI_LABEL_XPATH`（`/html/body/main/div/div/div[2]/div[1]/span/div[1]`）作为首页与跳转页的优先状态读取目标（保留 `#sign` 回退），在点击前通过 `sessionStorage` 写入同会话提交标记，配合 `registry.json` 的 `confirmPaths: ["/sg_sign.htm"]` 支持重定向后的结果确认；未先从首页提交而直接访问 `sg_sign.htm` 时不自动点击。
- 71 项本地测试（66 项离线行为场景、2 项全天空闲性能检查与 3 项构建/注册检查）通过，构建及构建一致性检查通过；`v1.3.1` 推送后 GitHub Actions 因账号账单限制未运行，已在本地通过 `scripts/verify-release.mjs`、`npm test`、`npm run check` 并经 `gh release create` 直接发布 Release（含 `dist/*` 与 `SHA256SUMS.txt`）。因本机真实浏览器凭证不可由代理直接访问，未在真实脚本猫登录会话中由代理直接执行签到端到端验收。

## 1.4.0 触发机制重构与定时功能精简（2026-11-15）

- 依据实际使用需求移除每分钟定时轮询（`scheduledTick` 与 60 秒循环定时器），后台脚本在启动单次检查后通过事件待命（零定时器、零轮询）。
- 为手动一键执行引入强制核验令牌（`force_` 前缀）与后台菜单/跨脚本指令通道（`GM_registerMenuCommand` + `GM_addValueChangeListener`），点击一键执行时绕过 `completedToday` 缓存重新打开全部已启用注册站点并向官网实时复核，发现实际未登录/失败时清除误记状态；单站“本站：检查并签到”同步启用实时复核，被动访问 `autoVisit` 保持缓存拦截。
- `runBatch` 引入 5 秒 `batchLock` 心跳、30 秒锁超时与启动 ~6 秒无心跳遗留锁接管、标签页提前关闭感知及 `GM_addValueChangeListener` 即时唤醒；同步修复 ECY `#checkin` 回退判重、HiFiTi 通用 `.alert` 误拦截及损坏站点开关容错。
- 75 项本地测试（70 项离线行为场景、2 项零定时器空闲性能检查与 3 项构建/注册检查）通过，构建及构建一致性检查通过；尚未在真实已登录 ScriptCat 实例中由代理直接执行四站端到端验收。

## 1.5.0 库街区 · 鸣潮游戏签到接入（2026-11-20）

- 核对官方前端资源：`https://web-static.kurobbs.com/events2.0/assets/index-b450023e.js`、`web-5912510f.js` 与 `https://web-static.kurobbs.com/resource/prod/assets/index-DbxcGYMV.js`。确认官方活动页 `/mc-month-sign/home` 在非 App 环境下自动重定向至 `/mc-month-sign/web` 下载引导页；官方接口为 `POST /encourage/signIn/initSignInV2` 与 `POST /encourage/signIn/v2`（`reqMonth` 取 `eventStartTimes.slice(5, 7)`，业务码 `220`/`230` 表示登录过期）；官网在 `www.kurobbs.com` 的 `localStorage` 维护 `auth_token`、`auth`、`dc`（32 位 `DEV_CODE`）与 `distinct_id`。
- 在真实已登录 Chrome 的 `https://www.kurobbs.com/mc/home/9` 页面上下文中通过原生 `fetch` 实测 `https://api.kurobbs.com`：预检 `OPTIONS` 返回 `200` 且显式放行 `access-control-allow-origin: https://www.kurobbs.com` 与 `access-control-allow-headers: devcode, distinct_id, source, token`；`POST /gamer/role/list`（`gameId=3`）与 `POST /encourage/signIn/initSignInV2` 均返回 HTTP `200` / `code: 200`（实测当日 `isSigIn: true`）；在今日已签状态下对 `POST /encourage/signIn/v2` 做一次幂等探测，`source: h5` 返回 `code: 1511`（`请勿重复签到`），对照 `source: android` 返回 `code: 220`（`登录已过期`）。用户核实无多端互顶影响，且需求范围为仅执行鸣潮游戏每日奖励签到。
- 83 项本地测试（78 项离线行为场景、2 项零定时器空闲性能检查与 3 项构建/注册检查）通过，构建及构建一致性检查通过；真实已登录浏览器仅完成了只读查询与已签态幂等探测，未在真实 ScriptCat 实例中完成未签到至已签到的端到端验收。

## 1.6.0 设备级本地启用开关（2026-11-23）

- 依据脚本猫官方云同步机制（`scriptcat-sync.json` 跨设备同步脚本源码与启用状态，而 `GM_setValue` / `UserConfig` 仅保存在当前浏览器本地），在共享 `@storageName` 中新增 `device.enabled` 开关（默认 `false`），并在页面执行器与后台脚本的 `==UserConfig==` 及动态菜单（`GM_registerMenuCommand` / `GM_unregisterMenuCommand` + `GM_addValueChangeListener`）中同步暴露。
- 设备开关关闭或配置异常时完全拦截启动检查、访问页面自动签到及所有单站/全站手动触发入口，且不产生存储写入或定时器；批量执行中途关闭会立即中止剩余站点打开。
- 91 项本地测试（85 项离线行为场景、3 项零定时器空闲性能检查与 3 项构建/注册检查）通过，构建及构建一致性检查通过；尚未在真实多设备 ScriptCat 云同步环境中由代理直接完成端到端实测。

## 1.6.1 库库 AI 主工作台签到迁移与凭证保护（2026-11-25）

- 结合用户真实登录故障抓包与 `kuku.baidu.com` 当前 `pc-genflow-pro`（`v1.15.0`）静态资源核实：主工作台 `GET /` 现通过百度 Passport `tpl=genflowpro` SSO 换票（`/?stoken=...` → `302 /?_at_=...`，下发 `domain=.kuku.baidu.com` 的 `STOKEN`，未登录时重定向 `/genflowpro`），并经 `/api/genflowpro/common/userreport` 注入 `{ bdstoken, uinfo, uk }` 会话参数；而旧入口 `/operation/activitys/kukuPcSignAct/main` 属于网盘运营子服务（加载 `nd_bundle`、使用无前导点 `domain=kuku.baidu.com` Cookie 且不走 `genflowpro` 换票），直接顶层访问或携带额外查询参数会导致同名双 `STOKEN` 冲突，触发服务端在 `GET /?_at_=...` 响应中下发 `Set-Cookie: BDUSS=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.baidu.com` 强制销毁全站登录态。
- 实时核对 `LeftSidebar.gn39d8wy.js`、`SigninPromoWidget.j2gsej9u.js`、`signin-collapse.fzfopbra.js` 与 `HoverCardTrigger.kiev9w2w.js`：主工作台左侧栏内置 `[data-testid="sidebar-signin-entry"]`（`SigninSidebarEntry`）与左下角 `[data-testid="signin-promo"]`（`SigninPromoWidget`），悬停侧栏按钮即挂载 `[data-testid="sidebar-signin-card"]`；其 `SigninPromoCard` 通过主站 `http.post` 调用 `/act/v2/kukuai30/homepage` 与 `/act/v2/kukuai30/signin`（自动携带 `v1.15.0` 会话参数与 `dfxaf3` 反作弊参数），提交后重新请求 `homepage` 校验 `signed_today === true` 并将按钮更新为 `去抽会员` / `去抽会员 (s)`。在真实已登录 Chrome 会话中只读实测悬停 `[data-testid="sidebar-signin-entry"]`，确认卡片正常挂载并返回 `ctaText: "去抽会员"`（且在跨轮次连签 `calendar` 状态为 `5` 时 `.signin-promo-day--signed-today` 为 `false`，以按钮状态为准）。
- 注册表将 `kuku.url` 改为 `https://kuku.baidu.com/`、`autoPaths: ["/"]`、`loginPaths: ["/login", "/genflowpro"]` 并启用 `cleanUrl: true`（打开标签页不附加 `sc_daily_checkin` 查询参数，改由 `pending:kuku` 单次消费恢复任务）；适配器改为操作主工作台原生签到卡片并在确认已签后自动关闭悬停浮层，保留主工作台同源活动中心 iframe 回退，拒绝在 `/operation/activitys/kukuPcSignAct/main` 直接运行。
- 95 项本地测试（89 项离线行为场景、3 项零定时器空闲性能检查与 3 项构建/注册检查）通过，构建及构建一致性检查通过；真实已登录浏览器仅执行了主工作台侧栏悬停已签态只读核验，未触发额外签到提交。
