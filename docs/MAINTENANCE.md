# 增删网站与发布更新

## 日常启停（用户）

- **按设备启停**：脚本猫云同步会同步脚本扩展开关，但不同步脚本内部存储。请保持两个脚本在脚本猫扩展中启用，并在指定设备上通过全局菜单 **当前设备：脚本已停用（点击启用）** 或 **站点与启动设置** 中的 `device.enabled`（在当前设备启用本脚本，默认 `false`）开启运行；关闭后同时拦截启动检查、页面自动签到及手动触发。
- **按站点启停**：通过后台脚本全局菜单或打开任一目标网站 → 脚本猫 → “站点与启动设置”。取消某站“启用签到”会拦截所有执行入口；不需要删除网站代码或退订。设置保存在脚本猫共享本地存储，发布不会写入默认值覆盖个人选择。

自动调度使用 `@background`，在浏览器启动/脚本启用时立即检查一次，之后进入零定时器事件待命状态，支持通过全局菜单或网页指令手动触发全站重新核验；已移除每分钟定时轮询。`schedule.enabled` 沿用旧开关，`schedule.times` / `scheduleLast` 不再参与运行。每站 `three-sites:v1:completed:<id>` 只记录 `{day,status,at}`，只有官网确认的 `success` / `already` 才写入（手动强制重新核验发现实际未登录/失败时会清除）；与本机当天日期不符即失效。`result:<id>` 用于批次结果通信，失败结果不覆盖成功日期。两个脚本应一起升级。

## 新增网站（维护者）

1. 核对实际官方页面/请求，确定认证来源、签到前状态与签到后成功判据。
2. 在 `src/sites/newsite.js` 实现 `async function newsite()`。返回 `{status,message}`；可使用公共 `requestJSON`、`authFailure`、`result`、`sleep`、`normalize` 等函数。不得记录认证信息，不可只凭 HTTP 200 报告成功。
3. 向 `src/registry.json` 增加一项，例如：

```json
{
  "id": "newsite",
  "name": "新网站",
  "adapter": "newsite",
  "url": "https://example.com/checkin",
  "hosts": ["example.com"],
  "matches": ["https://example.com/*"],
  "autoPaths": ["/checkin"],
  "loginPaths": ["/login"],
  "loginPrefixes": [],
  "defaultEnabled": false
}
```

`url` 不得包含 Cookie/Token、用户名密码、查询参数或片段；运行关联标记由通用启动器临时添加。`hosts` 必须包括登录重定向所在的同源域名；新域名还需要明确的 `matches`。不使用通配全网权限。`loginPaths` / `loginPrefixes` 用于恢复被登录重定向丢弃的运行关联标记，不是绕过登录。

推荐新站默认停用，由使用者明确启用。构建器统一生成页面匹配、站点配置、调度注册和适配器分发，不再手工维护两份网站列表。

4. 增加离线成功、已签、失效、未知响应测试；用真实浏览器单站验证后再写入已验收说明。
5. 提高 `package.json` 版本，更新 `CHANGELOG.md`，执行构建、测试和一致性检查。

## 移除网站

从注册表删除该项，删除仅供该站使用的适配文件及对应测试，重新构建。新执行器会移除对应 `@match`、新启动器不会打开该网站。旧的个人设置键即使保留也不会调用已移除的站点。

停止当前站点后再升级，以免打开的旧页面仍有旧脚本运行。已经发送的请求无法撤销。不要为删除一个网站从订阅中删除整个页面执行器。

## 发布

**版本更新自动发布原则**：以后凡是涉及脚本代码或站点适配的版本更新，在完成修改、更新版本号与文档并通过全部本地验证后，应**自动完成发布流程**（提交、推送 `main` 并推送同版本标签以触发 GitHub Release 自动发布），无需再等额外确认；仅在测试未通过、构建一致性失败、疑似包含隐私/凭证或用户明确要求暂不发布时中止。

1. 仅修改 `src/`、注册表、文档及测试；在 `package.json` 提高版本号（`x.y.z`），并更新 `CHANGELOG.md`（及必要时的 `README.md`、`docs/EVIDENCE.md`）。
2. 运行 `npm run build`、`npm test`、`npm run check`，确认构建一致性与全部测试通过，且仓库中不含凭证、个人配置或真实账号抓取数据。
3. 提交源码、测试、文档与 `dist/`，推送 `main`。固定的 Raw 地址立即用于脚本猫后续检查更新；只有测试通过的代码应进入 `main`。
4. 创建并推送同版本标签（例如 `git tag v1.3.1 && git push origin v1.3.1`）。推送 `v*` 标签后，`.github/workflows/release.yml` 会自动执行 `scripts/verify-release.mjs`、`npm test`、`npm run check`、生成 `SHA256SUMS.txt` 并创建对应 GitHub Release；Release 用于版本记录与下载归档，订阅读取的仍是 `main/dist`。
5. 发布后可在 GitHub Actions / Release 确认工作流成功、资产完整（`dist/*` 与 `SHA256SUMS.txt`）。若因账号账单或 Actions 配额导致工作流未启动，应在本地运行 `GITHUB_REF_NAME=v<x.y.z> node scripts/verify-release.mjs`、`npm test`、`npm run check`，并立即通过 `gh release create` 直接创建同版本 Release，附带 `dist/*` 与 `SHA256SUMS.txt`。

`worker.meta.js` / `scheduler.meta.js` 用于检查版本，`.user.js` 为下载内容，`checkin.user.sub.js` 为合集入口。构建器统一使用同一版本生成全部文件。修改站点或脚本清单后提高版本，脚本猫才会按检查间隔安装更新。可在脚本猫手动检查更新。

若迁移仓库或修改文件位置，必须先通过旧地址发布一次指向新地址的过渡版，再停止旧地址；否则现有订阅无法自行发现新位置。

## 回滚

从已知正常标签恢复代码，发布一个**更高版本号**的修复版。单纯降低 `@version` 不保证客户端降级。更紧急时先停用定时与访问时签到，手动安装已核对的旧版，并暂时停用自动更新。

## 本地配置边界

不要把个人配置、HAR、账号截图、浏览器配置文件或真实响应提交到仓库。不要在 `release.json` 写入 GitHub 令牌；发布认证使用本机 GitHub CLI/凭证管理器。

构建只打包脚本，不执行站点请求；测试只使用虚构令牌和合成响应。真实浏览器验证与源码推断须分别记录。
