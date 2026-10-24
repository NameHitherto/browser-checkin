// ==UserScript==
// @name         三站签到 · 页面执行器
// @namespace    local.namehitherto.checkin
// @version      1.1.0
// @description  浏览器会话复用；可配置站点开关；官网结果复核
// @match        https://zhiyaoapi.top/*
// @match        https://owo.ecycloud.com/user*
// @match        https://owo.ecycloud.com/auth/*
// @match        https://kuku.baidu.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @storageName  local.namehitherto.three-sites.checkin.v1
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_log
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        CAT_userConfig
// @updateURL    https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.meta.js
// @downloadURL  https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.user.js
// @homepageURL  https://github.com/NameHitherto/browser-checkin
// @supportURL   https://github.com/NameHitherto/browser-checkin/issues
// @license      MIT
// ==/UserScript==
