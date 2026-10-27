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
