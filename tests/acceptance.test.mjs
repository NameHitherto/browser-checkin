import vm from 'node:vm';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
const worker = await fs.readFile('dist/worker.user.js', 'utf8');
const scheduler = await fs.readFile('dist/scheduler.user.js', 'utf8');
new Function(worker); new Function(scheduler);
await fs.mkdir('test-results', {recursive:true});
const reports = [];
const prefix = 'three-sites:v1:';
function env(host = 'zhiyaoapi.top', path = '/dashboard') {
  let now = 1792854000000;
  class Clock extends Date { static now() { return now; } }
  const values = new Map(), saved = new Map(), calls = [], timers = new Set();
  const elements = new Map();
  const document = {
    readyState: 'loading', scripts: [], body: {innerText:'',appendChild(){}},
    createElement: () => ({ style: {}, textContent: '' }),
    querySelector: selector => elements.get(selector) || null,
    querySelectorAll: selector => elements.get(selector) || [],
    addEventListener() {},
  };
  const context = {
    Date: Clock, URL, AbortController, AbortSignal, document,
    location: { hostname:host, origin:`https://${host}`, pathname:path, href:`https://${host}${path}` },
    history: {state:null, replaceState(){}},
    sessionStorage: {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
    localStorage: {getItem:()=> 'FAKE-TOKEN'},
    navigator: {locks: { request:async(_key, callback)=> callback() }},
    getComputedStyle:()=>({visibility:'visible'}),
    console:{info(){},error(){}},
    GM: {getValue:async(k,v)=>saved.has(k)?saved.get(k):v, setValue:async(k,v)=>saved.set(k,v)},
    GM_getValue:(k,v)=>saved.has(k)?saved.get(k):v, GM_setValue:(k,v)=>saved.set(k,v),
    GM_registerMenuCommand(){},GM_openInTab(){},GM_log(){},GM_notification(){},
    setTimeout:(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);now+=ms;fn()},0);timers.add(t);return t},
    clearTimeout:t=>{timers.delete(t);clearTimeout(t)},
    fetch:async(url, opts={})=>{calls.push({url,opts});throw Error('Unexpected request')},
    DOMParser:class {parseFromString(){return document}},
  };
  const sandbox=vm.createContext(context);
  const injected=worker.replace("  if (document.readyState === 'loading')",'  globalThis.testAPI = { zhiyao, ecy, kuku, requestJSON, run, captureJob, main, kukuState, siteEnabled, runBatch, scheduledTick, parseTimes, openSite };\n  if (document.readyState === \'loading\')');
  vm.runInContext(injected,sandbox);
  const json=(data,status=200,url=`https://${host}/`) => ({status,ok:status>=200&&status<300,url,text:async()=>JSON.stringify(data)});
  return {sandbox,api:sandbox.testAPI,calls,elements,saved,values,json,cleanup(){for(const t of timers)clearTimeout(t)}};
}
async function test(name,fn){await nodeTest(name,async()=>{await fn();reports.push({name,passed:true})})}

await test('知遥：已签到只读取状态，不发送 POST',async()=>{
 const e=env();e.sandbox.fetch=async(url,o)=>{e.calls.push({url,o});return e.json({today_checked_in:true})};
 assert.equal((await e.api.zhiyao()).status,'already');assert.equal(e.calls.length,1);assert.ok(e.calls[0].url.endsWith('/user/rewards/summary'));e.cleanup();
});
await test('知遥：实时读取令牌，提交后再次确认',async()=>{
 const e=env();let n=0;const bodies=[{today_checked_in:false},{reward_amount:1},{today_checked_in:true}];
 e.sandbox.fetch=async(url,opts)=>{e.calls.push({url,opts});return e.json(bodies[n++])};
 assert.equal((await e.api.zhiyao()).status,'success');assert.equal(e.calls[1].opts.method,'POST');assert.ok(e.calls[1].url.endsWith('/user/checkin'));assert.equal(e.calls[1].opts.headers.Authorization,'Bearer FAKE-TOKEN');assert.equal(e.calls[1].opts.credentials,'same-origin');e.cleanup();
});
await test('知遥：没有令牌不发送请求',async()=>{
 const e=env();e.sandbox.localStorage.getItem=()=>null;assert.equal((await e.api.zhiyao()).status,'login');assert.equal(e.calls.length,0);e.cleanup();
});
await test('知遥：登录过期 401 不继续提交',async()=>{
 const e=env();e.sandbox.fetch=async()=>e.json({},401);assert.equal((await e.api.zhiyao()).status,'login');e.cleanup();
});
await test('知遥：状态结构变更时不猜测接口语义',async()=>{
 const e=env();let calls=0;e.sandbox.fetch=async()=>{calls++;return e.json({success:true})};assert.equal((await e.api.zhiyao()).status,'unknown');assert.equal(calls,1);e.cleanup();
});
await test('知遥：HTTP 200 但复核未签不报告成功',async()=>{
 const e=env();e.sandbox.fetch=async()=>e.json({today_checked_in:false});assert.equal((await e.api.zhiyao()).status,'unknown');e.cleanup();
});
await test('ECY：今日已签状态不发送请求',async()=>{
 const e=env('owo.ecycloud.com','/user');e.elements.set('#checkin-btn',{textContent:'今日已签到'});assert.equal((await e.api.ecy()).status,'already');assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：验证码启用或无法确认时不提交',async()=>{
 for(const setting of ['true','undefined']){const e=env('owo.ecycloud.com','/user');e.elements.set('#checkin',{});e.sandbox.document.scripts=[{textContent:`window.UserIndexConfig = {enableCheckin:true,enableCheckinCaptcha:${setting}}`}];assert.equal((await e.api.ecy()).status,'manual');assert.equal(e.calls.length,0);e.cleanup()}
});
await test('ECY：成功必须有官网刷新状态复核',async()=>{
 const e=env('owo.ecycloud.com','/user');e.elements.set('#checkin',{});e.sandbox.document.scripts=[{textContent:'window.UserIndexConfig = {enableCheckin:true,enableCheckinCaptcha:false}'}];
 e.sandbox.fetch=async(url,opts)=>{e.calls.push({url,opts});return e.calls.length===1?e.json({ret:1,msg:'ok'}):{ok:true,url:'https://owo.ecycloud.com/user',text:async()=>'<html/>'}};
 e.sandbox.DOMParser=class {parseFromString(){return {querySelector:()=>({textContent:'今日已签到'})}}};
 assert.equal((await e.api.ecy()).status,'success');assert.equal(e.calls[0].opts.body,'');assert.equal(e.calls[0].opts.credentials,'same-origin');e.cleanup();
});
await test('ECY：服务端报告成功但页面未确认时为未知',async()=>{
 const e=env('owo.ecycloud.com','/user');e.elements.set('#checkin',{});e.sandbox.document.scripts=[{textContent:'window.UserIndexConfig={enableCheckinCaptcha:false}'}];e.sandbox.fetch=async()=>e.json({ret:true});assert.equal((await e.api.ecy()).status,'unknown');e.cleanup();
});
function signButton(text='立即签到',signed=false){const state={text,signed};return {state,get textContent(){return state.text},classList:{contains:k=>k==='is-signed'&&state.signed},getClientRects:()=>[{}],click(){},disabled:false}}
await test('库库：已签按钮不点击，也不触发抽奖',async()=>{
 const e=env('kuku.baidu.com','/operation/activitys/kukuPcSignAct/main');const b=signButton('今日已签',true);let clicks=0;b.click=()=>clicks++;e.elements.set('button.pc-sign-btn',[b]);assert.equal((await e.api.kuku()).status,'already');assert.equal(clicks,0);e.cleanup();
});
await test('库库：只点官网当天签到一次，再等待已签状态',async()=>{
 const e=env('kuku.baidu.com','/operation/activitys/kukuPcSignAct/main');const b=signButton();let clicks=0;b.click=()=>{clicks++;b.state.text='今日已签';b.state.signed=true};e.elements.set('button.pc-sign-btn',[b]);assert.equal((await e.api.kuku()).status,'success');assert.equal(clicks,1);assert.equal(e.calls.length,0);e.cleanup();
});
await test('库库：要求登录时不点击',async()=>{
 const e=env('kuku.baidu.com','/operation/activitys/kukuPcSignAct/main');const b=signButton('登录领奖');b.click=()=>assert.fail('must not click');e.elements.set('button.pc-sign-btn',[b]);assert.equal((await e.api.kuku()).status,'login');e.cleanup();
});
await test('库库：点击后无成功状态为未知，不循环点击',async()=>{
 const e=env('kuku.baidu.com','/operation/activitys/kukuPcSignAct/main');const b=signButton();let clicks=0;b.click=()=>clicks++;e.elements.set('button.pc-sign-btn',[b]);assert.equal((await e.api.kuku()).status,'unknown');assert.equal(clicks,1);e.cleanup();
});
await test('状态存储不包含认证令牌或原始响应',async()=>{
 const e=env();e.sandbox.fetch=async()=>e.json({today_checked_in:true,secret:'SHOULD-NOT-PERSIST'});await e.api.run();const saved=JSON.stringify([...e.saved.values()]);assert.ok(!saved.includes('FAKE-TOKEN'));assert.ok(!saved.includes('SHOULD-NOT-PERSIST'));e.cleanup();
});
await test('跨站认证请求在发送前即被拒绝',async()=>{
 const e=env();await assert.rejects(e.api.requestJSON('https://other.invalid/checkin'),/禁止向其他站点/);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY 登录重定向丢失网址标记后仍能回传需登录结果',async()=>{
 const e=env('owo.ecycloud.com','/auth/login');e.saved.set(prefix+'pending:ecy',{token:'batch_test_ecy',at:e.sandbox.Date.now()});await e.api.main();assert.equal(e.saved.get(prefix+'result:ecy').status,'login');assert.equal(e.saved.get(prefix+'result:ecy').token,'batch_test_ecy');assert.equal(e.calls.length,0);e.cleanup();
});
await test('调度器：忽略过期结果、按运行标识收集三站并关闭成功页',async()=>{
 const e=env();let closed=0,opened=0;e.saved.set(prefix+'result:zhiyao',{token:'OLD',status:'success'});
 e.sandbox.GM_openInTab=url=>{opened++;const u=new URL(url),token=u.searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);setTimeout(()=>e.saved.set(prefix+'result:'+id,{token,status:'already',message:'verified'}),1);return {close(){closed++}}};
 const run=e.api.runBatch();await run;assert.equal(opened,3);assert.equal(closed,3);assert.equal(e.saved.get(prefix+'batchLock'),null);e.cleanup();
});
await test('调度器：登录失败保留页面并正确报告批次失败',async()=>{
 const e=env();let closed=0;e.sandbox.GM_openInTab=url=>{const token=new URL(url).searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);e.saved.set(prefix+'result:'+id,{token,status:id==='ecy'?'login':'already',message:'test'});return {close(){closed++}}};
 await assert.rejects(e.api.runBatch(),/1个站点未完成/);assert.equal(closed,2);assert.equal(e.saved.get(prefix+'batchLast').results.length,3);e.cleanup();
});
await test('禁用站点同时拦截页面签到、单站打开和批量启动',async()=>{
 const e=env();e.saved.set('sites.zhiyao',false);let opened=[];
 e.sandbox.GM_openInTab=url=>{opened.push(url);const token=new URL(url).searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);e.saved.set(prefix+'result:'+id,{token,status:'already',message:'ok'});return {close(){}}};
 assert.equal((await e.api.run()).status,'disabled');await e.api.openSite('zhiyao');await e.api.runBatch();assert.equal(e.calls.length,0);assert.equal(opened.length,2);assert.ok(!opened.some(u=>u.includes('zhiyaoapi')));e.cleanup();
});
await test('关闭访问时签到后，普通访问不发送请求',async()=>{
 const e=env();e.saved.set('behavior.autoVisit',false);await e.api.main();assert.equal(e.calls.length,0);assert.equal(e.saved.has(prefix+'result:zhiyao'),false);e.cleanup();
});
await test('加载新版和读取默认配置不覆盖个人设置',async()=>{
 const e=env();e.saved.set('sites.zhiyao',false);e.saved.set('schedule.times','10:35,23:20');e.saved.set('behavior.autoVisit',false);await e.api.main();assert.equal(e.saved.get('sites.zhiyao'),false);assert.equal(e.saved.get('schedule.times'),'10:35,23:20');e.cleanup();
});
await test('定时按个人时间触发且同一分钟只触发一次',async()=>{
 const e=env();e.saved.set('schedule.times','10:35,23:20');let opened=0;
 e.sandbox.GM_openInTab=url=>{opened++;const token=new URL(url).searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);e.saved.set(prefix+'result:'+id,{token,status:'already',message:'ok'});return {close(){}}};
 await e.api.scheduledTick(new Date(2026,9,24,9,0));assert.equal(opened,0);
 await e.api.scheduledTick(new Date(2026,9,24,10,35));assert.equal(opened,3);
 await e.api.scheduledTick(new Date(2026,9,24,10,35,40));assert.equal(opened,3);
 await e.api.scheduledTick(new Date(2026,9,24,23,20));assert.equal(opened,6);e.cleanup();
});
await test('关闭自动调度不影响手动批量运行',async()=>{
 const e=env();e.saved.set('schedule.enabled',false);let opened=0;e.sandbox.GM_openInTab=url=>{opened++;const token=new URL(url).searchParams.get('sc_daily_checkin');e.saved.set(prefix+'result:'+token.split('_').at(-1),{token,status:'already'});return {close(){}}};await e.api.scheduledTick(new Date(2026,9,24,9,0));assert.equal(opened,0);await e.api.runBatch();assert.equal(opened,3);e.cleanup();
});
await test('错误时间配置不打开任何站点',async()=>{
 const e=env();e.saved.set('schedule.times','25:00');e.sandbox.GM_openInTab=()=>assert.fail('must not open');await assert.rejects(e.api.scheduledTick(new Date(2026,9,24,9,0)),/格式错误/);e.cleanup();
});
await test('全部停用时不打开页面',async()=>{
 const e=env();for(const id of ['zhiyao','ecy','kuku'])e.saved.set('sites.'+id,false);e.sandbox.GM_openInTab=()=>assert.fail('must not open');assert.equal(await e.api.runBatch(),'没有启用的站点');e.cleanup();
});
await fs.writeFile('test-results/acceptance.json', JSON.stringify({passed:reports.length,total:reports.length,scope:'Offline VM acceptance scenarios; no authenticated browser execution',reports},null,2));
