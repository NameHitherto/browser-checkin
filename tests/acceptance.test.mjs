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
function env(host = 'zhiyaoapi.top', path = '/dashboard', saved = new Map()) {
  let now = 1792854000000;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const values = new Map(), calls = [], timers = new Set();
  const elements = new Map(), xpaths = new Map(), clockJobs = [];
  function advance(ms) {
    now += ms;
    for (const job of clockJobs.filter(job => !job.done && job.at <= now)) { job.done = true; job.fn(); }
  }
  const document = {
    readyState: 'loading', scripts: [], body: {innerText:'',appendChild(){}},
    createElement: () => ({ style: {}, textContent: '' }),
    querySelector: selector => elements.get(selector) || null,
    querySelectorAll: selector => elements.get(selector) || [],
    evaluate: xpath => ({singleNodeValue:xpaths.get(xpath) || null}),
    addEventListener() {},
  };
  const context = {
    Date: Clock, URL, AbortController, AbortSignal, document,
    location: { hostname:host, origin:`https://${host}`, pathname:path, href:`https://${host}${path}` },
    history: {state:null, replaceState(){}},
    sessionStorage: {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
    localStorage: {getItem:()=> 'FAKE-TOKEN'},
    navigator: {locks: { request:async(_key, callback)=> callback() }},
    getComputedStyle:element=>({visibility:element?.style?.visibility || 'visible',display:element?.style?.display || 'block'}),
    console:{info(){},error(){}},
    GM: {getValue:async(k,v)=>saved.has(k)?saved.get(k):v, setValue:async(k,v)=>saved.set(k,v)},
    GM_getValue:(k,v)=>saved.has(k)?saved.get(k):v, GM_setValue:(k,v)=>saved.set(k,v),
    GM_registerMenuCommand(){},GM_openInTab(){},GM_log(){},GM_notification(){},
    setTimeout:(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);advance(ms);fn()},0);timers.add(t);return t},
    clearTimeout:t=>{timers.delete(t);clearTimeout(t)},
    fetch:async(url, opts={})=>{calls.push({url,opts});throw Error('Unexpected request')},
    DOMParser:class {parseFromString(){return document}},
  };
  const sandbox=vm.createContext(context);
  const injected=worker.replace("  if (document.readyState === 'loading')",'  globalThis.testAPI = { zhiyao, ecy, kuku, requestJSON, run, captureJob, main, kukuState, siteEnabled, runBatch, scheduledTick, localDay, completedToday, saveCompletion, openSite };\n  if (document.readyState === \'loading\')');
  vm.runInContext(injected,sandbox);
  const json=(data,status=200,url=`https://${host}/`) => ({status,ok:status>=200&&status<300,url,text:async()=>JSON.stringify(data)});
  return {sandbox,api:sandbox.testAPI,calls,elements,xpaths,saved,values,json,advance,setNow(value){now=Number(value)},after(ms,fn){clockJobs.push({at:now+ms,fn,done:false})},cleanup(){for(const t of timers)clearTimeout(t)}};
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
const ecyClosePath = '/html/body/main[2]/div/section/div[4]/div/div/div[2]/p/button';
const ecySignPath = '/html/body/main[2]/div/section/div[1]/div[3]/div[1]/div[2]/div[2]/div[6]/div';
function ecyElement(text = '', classes = []) {
  const children = new Map(), attributes = new Map();
  const element = {
    textContent:text, style:{}, disabled:false, parentElement:null, children,
    get innerText(){return this.textContent},
    classList:{contains:name=>classes.includes(name)},
    getClientRects(){return this.style.display === 'none' ? [] : [{}]},
    getAttribute(name){return attributes.get(name) ?? null},
    setAttribute(name,value){attributes.set(name,String(value))},
    querySelector(selector){for(const key of selector.split(',').map(s=>s.trim()))if(children.has(key))return children.get(key);return null},
    querySelectorAll(selector){const found=[];for(const key of selector.split(',').map(s=>s.trim()))if(children.has(key))found.push(children.get(key));return [...new Set(found)]},
    closest(selector){if(selector.split(',').some(key=>key.trim()==='.modal'&&classes.includes('modal')))return this;return this.parentElement?.closest(selector) || null},
    click(){},
  };
  return element;
}
function ecyUi() {
  const e=env('owo.ecycloud.com','/user'), actions=[], modals=[];
  e.sandbox.document.readyState='complete';
  const area=ecyElement('签到'), button=ecyElement('签到');
  area.children.set('#checkin',button);button.parentElement=area;
  e.elements.set('#checkin-btn',area);e.elements.set('#checkin',button);e.xpaths.set(ecySignPath,area);
  const originalQuery=e.sandbox.document.querySelector;
  e.sandbox.document.querySelector=selector=>{
    for(const key of selector.split(',').map(s=>s.trim())){const value=originalQuery(key);if(value)return value}
    return null;
  };
  e.sandbox.document.querySelectorAll=selector=>{
    const found=[];
    for(const key of selector.split(',').map(s=>s.trim())){
      if(key==='.modal'||key==='[role="dialog"]')found.push(...modals);
      else {const value=e.elements.get(key);if(value)found.push(...(Array.isArray(value)?value:[value]));}
    }
    return [...new Set(found)];
  };
  const signed=()=>{area.textContent='今日已签到';button.textContent='今日已签到'};
  button.click=()=>{actions.push('sign');signed()};
  function popup({name='popup',id='#latestAnnouncementModal',xpath=true,stuck=false}={}){
    const modal=ecyElement('公告',['modal']), close=ecyElement('关闭');
    close.parentElement=modal;modals.push(modal);e.elements.set(id,modal);
    for(const selector of ['[data-dismiss="modal"]','[data-bs-dismiss="modal"]','button.close'])modal.children.set(selector,close);
    close.click=()=>{actions.push(name);if(!stuck){modal.style.display='none';close.style.display='none'}};
    if(xpath)e.xpaths.set(ecyClosePath,close);
    return {modal,close};
  }
  const prompt=text=>{const message=ecyElement(text);e.elements.set('#msg',message);return message};
  return {...e,area,button,actions,modals,signed,popup,prompt};
}
await test('ECY：今日已签到不点击且不直接发送请求',async()=>{
 const e=ecyUi();e.signed();assert.equal((await e.api.ecy()).status,'already');assert.deepEqual(e.actions,[]);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：按用户 XPath 先关闭弹窗再点击容器内真实按钮',async()=>{
 const e=ecyUi();e.popup();e.area.click=()=>assert.fail('must click nested official handler');
 assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['popup','sign']);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：没有弹窗和验证码配置也可点击官网签到',async()=>{
 const e=ecyUi();assert.deepEqual(e.sandbox.document.scripts,[]);assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['sign']);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：仅 XPath 区域可用时点击明确的签到入口',async()=>{
 const e=ecyUi();e.elements.delete('#checkin');e.elements.delete('#checkin-btn');e.area.children.clear();e.area.click=()=>{e.actions.push('region-sign');e.area.textContent='今日已签到'};
 assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['region-sign']);e.cleanup();
});
await test('ECY：布局 XPath 变化时通过已知语义按钮回退',async()=>{
 const e=ecyUi();e.xpaths.delete(ecySignPath);e.popup({xpath:false});assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['popup','sign']);e.cleanup();
});
await test('ECY：延迟弹窗出现后关闭并等待消失再签到',async()=>{
 const e=ecyUi();e.after(500,()=>e.popup());assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['popup','sign']);e.cleanup();
});
await test('ECY：弹窗关闭失败仅尝试一次且不签到',async()=>{
 const e=ecyUi();e.popup({stuck:true});assert.equal((await e.api.ecy()).status,'manual');assert.deepEqual(e.actions,['popup']);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：公告关闭后出现的官网提示也先关闭',async()=>{
 const e=ecyUi(), first=e.popup();const close=first.close.click;first.close.click=()=>{close();e.after(250,()=>e.popup({name:'result',id:'#result',xpath:false}))};
 assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['popup','result','sign']);e.cleanup();
});
await test('ECY：弹窗消失后等待残留遮罩及稳定期结束才签到',async()=>{
 const e=ecyUi(), popup=e.popup(), backdrop=ecyElement();e.elements.set('.modal-backdrop',[backdrop]);let clearedAt;
 const close=popup.close.click;popup.close.click=()=>{close();e.after(1000,()=>{backdrop.style.display='none';clearedAt=e.sandbox.Date.now()})};
 e.button.click=()=>{assert.ok(clearedAt);assert.ok(e.sandbox.Date.now()-clearedAt>=750);e.actions.push('sign');e.signed()};
 assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['popup','sign']);e.cleanup();
});
await test('ECY：未知对话框遮挡时停止且不点击猜测的关闭按钮',async()=>{
 const e=ecyUi(), dialog=ecyElement('需要人工处理',['modal']);dialog.children.set('button.close',{click:()=>assert.fail('must not dismiss unknown modal')});e.modals.push(dialog);
 assert.equal((await e.api.ecy()).status,'manual');assert.deepEqual(e.actions,[]);e.cleanup();
});
await test('ECY：等待页面加载及官网按钮延迟挂载',async()=>{
 const e=ecyUi();e.sandbox.document.readyState='interactive';e.elements.delete('#checkin');e.elements.delete('#checkin-btn');e.xpaths.delete(ecySignPath);
 e.after(2000,()=>{e.sandbox.document.readyState='complete'});e.after(2500,()=>{e.elements.set('#checkin',e.button);e.elements.set('#checkin-btn',e.area);e.xpaths.set(ecySignPath,e.area)});
 const started=e.sandbox.Date.now();e.button.click=()=>{assert.ok(e.sandbox.Date.now()-started>=3000);e.actions.push('sign');e.signed()};
 assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['sign']);e.cleanup();
});
await test('ECY：官网异步刷新已签状态后才报告成功',async()=>{
 const e=ecyUi();e.button.click=()=>{e.actions.push('sign');e.after(1500,e.signed)};assert.equal((await e.api.ecy()).status,'success');assert.deepEqual(e.actions,['sign']);e.cleanup();
});
await test('ECY：实际人机验证提示停止自动操作',async()=>{
 const e=ecyUi();e.button.click=()=>{e.actions.push('sign');e.prompt('请完成人机验证')};assert.equal((await e.api.ecy()).status,'manual');assert.deepEqual(e.actions,['sign']);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：官网登录提示与登录跳转均停止提交',async()=>{
 for(const redirect of [false,true]){const e=ecyUi();e.button.click=()=>{e.actions.push('sign');if(redirect)e.sandbox.location.pathname='/auth/login';else e.prompt('请先登录')};assert.equal((await e.api.ecy()).status,'login');assert.deepEqual(e.actions,['sign']);e.cleanup()}
});
await test('ECY：明确签到失败提示只报告失败且不重试',async()=>{
 const e=ecyUi();e.button.click=()=>{e.actions.push('sign');e.prompt('签到失败，请稍后重试')};assert.equal((await e.api.ecy()).status,'failed');assert.deepEqual(e.actions,['sign']);e.cleanup();
});
await test('ECY：超时不重复点击且无关成功文案不算已签',async()=>{
 const e=ecyUi();e.sandbox.document.body.innerText='签到成功 今日已签到';e.button.click=()=>{e.actions.push('sign');e.prompt('操作成功')};assert.equal((await e.api.ecy()).status,'unknown');assert.deepEqual(e.actions,['sign']);assert.equal(e.calls.length,0);e.cleanup();
});
await test('ECY：签到目标缺失或禁用不点击其他控件',async()=>{
 for(const missing of [false,true]){const e=ecyUi();if(missing){e.elements.delete('#checkin');e.elements.delete('#checkin-btn');e.xpaths.delete(ecySignPath)}else e.button.disabled=true;assert.equal((await e.api.ecy()).status,'manual');assert.deepEqual(e.actions,[]);e.cleanup()}
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
function batchPages(e, statusFor = () => 'already') {
 const opened = [], closed = [];
 e.sandbox.GM_openInTab = url => {
  const token = new URL(url).searchParams.get('sc_daily_checkin'), id = token.split('_').at(-1);
  const status = statusFor(id);
  opened.push(id);
  e.saved.set(prefix+'result:'+id, {token,status,message:'test',at:e.sandbox.Date.now()});
  if (['success','already'].includes(status)) e.saved.set(prefix+'completed:'+id, {day:e.api.localDay(),status,at:e.sandbox.Date.now()});
  return {close(){closed.push(id)}};
 };
 return {opened,closed};
}
await test('启动检查不受旧时间配置限制，同会话当天不重复打开',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,14,12));e.saved.set('schedule.times','25:00');e.saved.set(prefix+'scheduleLast','old');
 const pages=batchPages(e);await e.api.scheduledTick();assert.equal(pages.opened.length,3);
 await e.api.scheduledTick();assert.equal(pages.opened.length,3);e.cleanup();
});
await test('成功日期按本地自然日保存，次日零点失效而非24小时',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,23,59));
 await e.api.saveCompletion('zhiyao',{status:'success'},e.api.localDay());
 assert.equal(e.saved.get(prefix+'completed:zhiyao').day,'2026-11-01');assert.equal(await e.api.completedToday('zhiyao'),true);
 e.setNow(new Date(2026,10,2,0,0));assert.equal(await e.api.completedToday('zhiyao'),false);e.cleanup();
});
await test('逐站独立跳过今日成功，仅打开未完成、过期或未知网站',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,8,0));
 await e.api.saveCompletion('zhiyao',{status:'already'},e.api.localDay());
 e.saved.set(prefix+'completed:ecy',{day:'2026-10-31',status:'success'});
 e.saved.set(prefix+'completed:kuku',{day:e.api.localDay(),status:'unknown'});
 const pages=batchPages(e);await e.api.scheduledTick();assert.deepEqual(pages.opened,['ecy','kuku']);assert.equal(pages.closed.length,2);e.cleanup();
});
await test('同日重启保留成功站点，仅重新尝试失败网站',async()=>{
 const first=env(), pages=batchPages(first,id=>id==='ecy'?'login':'success');
 await assert.rejects(first.api.scheduledTick(),/1个站点未完成/);assert.equal(pages.opened.length,3);assert.equal(first.saved.has(prefix+'completed:ecy'),false);
 await first.api.scheduledTick();assert.equal(pages.opened.length,3);
 const second=env('zhiyaoapi.top','/dashboard',first.saved), retry=batchPages(second);
 await second.api.scheduledTick();assert.deepEqual(retry.opened,['ecy']);first.cleanup();second.cleanup();
});
await test('所有站点今日成功时重启不打开页面也不弹批量通知',async()=>{
 const first=env();batchPages(first);await first.api.scheduledTick();
 const second=env('zhiyaoapi.top','/dashboard',first.saved);second.sandbox.GM_openInTab=()=>assert.fail('must not open');second.sandbox.GM_notification=()=>assert.fail('must not notify');
 await second.api.scheduledTick();first.cleanup();second.cleanup();
});
await test('同会话跨日重新检查各站，跨月跨年及休眠恢复均适用',async()=>{
 for(const [before,after] of [[new Date(2026,10,1,23,59),new Date(2026,10,2,0,0)],[new Date(2026,10,30,23,59),new Date(2026,11,1,0,0)],[new Date(2026,11,31,23,59),new Date(2027,0,1,9,0)]]) {
  const e=env();e.setNow(before);const pages=batchPages(e);await e.api.scheduledTick();assert.equal(pages.opened.length,3);
  e.setNow(after);await e.api.scheduledTick();assert.equal(pages.opened.length,6);e.cleanup();
 }
});
await test('页面已签缓存拦截重复请求，次日重新访问后查询官网',async()=>{
 const e=env();let requests=0;e.sandbox.fetch=async()=>{requests++;return e.json({today_checked_in:true})};
 await e.api.run();assert.equal(requests,1);assert.equal(await e.api.completedToday('zhiyao'),true);
 await e.api.run();await e.api.openSite('zhiyao');assert.equal(requests,1);
 e.advance(86400000);await e.api.run();assert.equal(requests,2);e.cleanup();
});
await test('登录、失败、未知、停用均不写当日成功，也不覆盖已有成功记录',async()=>{
 const e=env();for(const status of ['login','manual','failed','unknown','disabled']){await e.api.saveCompletion('ecy',{status},e.api.localDay());assert.equal(e.saved.has(prefix+'completed:ecy'),false)}
 await e.api.saveCompletion('ecy',{status:'already'},e.api.localDay());const saved=e.saved.get(prefix+'completed:ecy');await e.api.saveCompletion('ecy',{status:'unknown'},e.api.localDay());assert.equal(e.saved.get(prefix+'completed:ecy'),saved);e.cleanup();
});
await test('页面失败不写成功状态，下次人工运行仍可恢复',async()=>{
 const e=env();e.sandbox.localStorage.getItem=()=>null;assert.equal((await e.api.run()).status,'login');assert.equal(await e.api.completedToday('zhiyao'),false);
 e.sandbox.localStorage.getItem=()=> 'FAKE-TOKEN';e.sandbox.fetch=async()=>e.json({today_checked_in:true});assert.equal((await e.api.run()).status,'already');assert.equal(await e.api.completedToday('zhiyao'),true);e.cleanup();
});
await test('请求跨过零点不把前一日结果写成新一日成功',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,23,59,59));e.sandbox.fetch=async()=>{e.advance(2000);return e.json({today_checked_in:true})};
 await e.api.run();assert.equal(e.api.localDay(),'2026-11-02');assert.equal(await e.api.completedToday('zhiyao'),false);e.cleanup();
});
await test('关闭自动调度不影响手动批量运行，重新启用会补做当天检查',async()=>{
 const e=env();e.saved.set('schedule.enabled',false);const pages=batchPages(e);await e.api.scheduledTick();assert.equal(pages.opened.length,0);await e.api.runBatch();assert.equal(pages.opened.length,3);
 e.saved.set('schedule.enabled',true);await e.api.scheduledTick();assert.equal(pages.opened.length,3);e.cleanup();
});
await test('尚有批次运行时稍后检查，防止启动遗留锁阻止当天签到',async()=>{
 const e=env();e.saved.set(prefix+'batchLock',{token:'previous',at:e.sandbox.Date.now()});const pages=batchPages(e);
 await assert.rejects(e.api.scheduledTick(),/已有批量/);assert.equal(pages.opened.length,0);
 e.advance(360001);await e.api.scheduledTick();assert.equal(pages.opened.length,3);e.cleanup();
});
await test('并发启动检查复用同一批次',async()=>{
 const e=env();const pages=batchPages(e);await Promise.all([e.api.scheduledTick(),e.api.scheduledTick()]);assert.equal(pages.opened.length,3);e.cleanup();
});
await test('生成的后台脚本启动立即执行，循环检查跨日且失败后继续存活',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,12,0));const pages=batchPages(e,id=>id==='ecy'?'login':'success');
 const waits=[];e.sandbox.setTimeout=(fn,ms)=>{waits.push({fn,ms});return waits.length};
 vm.runInContext('(function(){'+scheduler+'})()',e.sandbox);
 const settle=async()=>{for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve))};await settle();
 assert.equal(pages.opened.length,3);assert.equal(waits.length,1);assert.equal(waits[0].ms,60000);
 waits.shift().fn();await settle();assert.equal(pages.opened.length,3);
 e.setNow(new Date(2026,10,2,0,0));waits.shift().fn();await settle();assert.equal(pages.opened.length,6);assert.equal(waits.length,1);e.cleanup();
});
await test('全部停用时不打开页面',async()=>{
 const e=env();for(const id of ['zhiyao','ecy','kuku'])e.saved.set('sites.'+id,false);e.sandbox.GM_openInTab=()=>assert.fail('must not open');assert.equal(await e.api.runBatch(),'没有启用的站点');e.cleanup();
});
await fs.writeFile('test-results/acceptance.json', JSON.stringify({passed:reports.length,total:reports.length,scope:'Offline VM acceptance scenarios; no authenticated browser execution',reports},null,2));
