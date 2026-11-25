// ==UserScript==
// @name         三站签到 · 页面执行器
// @namespace    local.namehitherto.checkin
// @version      1.6.1
// @description  浏览器会话复用；设备级本地开关；可配置站点开关；官网结果复核
// @match        https://zhiyaoapi.top/*
// @match        https://owo.ecycloud.com/user*
// @match        https://owo.ecycloud.com/auth/*
// @match        https://kuku.baidu.com/*
// @match        https://www.hifiti.com/*
// @match        https://www.kurobbs.com/*
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
// @grant        GM_unregisterMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        CAT_userConfig
// @updateURL    https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.meta.js
// @downloadURL  https://raw.githubusercontent.com/NameHitherto/browser-checkin/main/dist/worker.user.js
// @homepageURL  https://github.com/NameHitherto/browser-checkin
// @supportURL   https://github.com/NameHitherto/browser-checkin/issues
// @license      MIT
// ==/UserScript==
