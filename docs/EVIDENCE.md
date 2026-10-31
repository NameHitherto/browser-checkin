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
