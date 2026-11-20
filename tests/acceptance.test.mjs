import vm from 'node:vm';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
const worker = await fs.readFile('dist/worker.user.js', 'utf8');
const scheduler = await fs.readFile('dist/scheduler.user.js', 'utf8');
const registry = JSON.parse(await fs.readFile('src/registry.json', 'utf8'));
const enabledSites = registry.filter(site => site.defaultEnabled).map(site => site.id);
new Function(worker); new Function(scheduler);
await fs.mkdir('test-results', {recursive:true});
const reports = [];
const prefix = 'three-sites:v1:';
function env(host = 'zhiyaoapi.top', path = '/dashboard', saved = new Map(), values = new Map()) {
  let now = 1792854000000;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const calls = [], timers = new Set();
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
  const listeners = new Map();
  let listenerSeq = 0;
  const setStorageValue = async (k, v) => {
    const prev = saved.get(k);
    saved.set(k, v);
    for (const entry of listeners.values()) {
      if (entry.key === k) entry.fn(k, prev, v, true);
    }
  };
  const context = {
    Date: Clock, URL, URLSearchParams, AbortController, AbortSignal, document,
    location: { hostname:host, origin:`https://${host}`, pathname:path, href:`https://${host}${path}` },
    history: {state:null, replaceState(){}},
    sessionStorage: {getItem:k=>values.get(k) ?? null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
    localStorage: {getItem:()=> 'FAKE-TOKEN'},
    navigator: {locks: { request:async(_key, callback)=> callback() }},
    getComputedStyle:element=>({visibility:element?.style?.visibility || 'visible',display:element?.style?.display || 'block',opacity:element?.style?.opacity || '1'}),
    console:{info(){},warn(){},error(){}},
    GM: {getValue:async(k,v)=>saved.has(k)?saved.get(k):v, setValue:setStorageValue},
    GM_getValue:(k,v)=>saved.has(k)?saved.get(k):v, GM_setValue:(k,v)=>{saved.set(k,v)},
    GM_addValueChangeListener:(key,fn)=>{const id=++listenerSeq;listeners.set(id,{key,fn});return id},
    GM_removeValueChangeListener:id=>listeners.delete(id),
    GM_registerMenuCommand(){},GM_openInTab(){},GM_log(){},GM_notification(){},
    setTimeout:(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);advance(ms);fn()},0);timers.add(t);return t},
    clearTimeout:t=>{timers.delete(t);clearTimeout(t)},
    fetch:async(url, opts={})=>{calls.push({url,opts});throw Error('Unexpected request')},
    DOMParser:class {parseFromString(){return document}},
  };
  const sandbox=vm.createContext(context);
  const injected=worker.replace("  if (document.readyState === 'loading')",'  globalThis.testAPI = { zhiyao, ecy, kuku, hifiti, kurobbs, requestJSON, run, captureJob, main, kukuState, siteEnabled, runBatch, requestManualBatch, localDay, completedToday, saveCompletion, clearCompletion, openSite };\n  if (document.readyState === \'loading\')');
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
const ecyClosePath = '/html/body/main[2]/div/section/div[5]/div/div/div[2]/div/div/div/span[2]';
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
 const e=ecyUi();e.popup({id:'#updated-notice'}).modal.children.clear();e.area.click=()=>assert.fail('must click nested official handler');
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
const hifitiSignPath = '/html/body/main/div/div/div[2]/div[1]/span';
const hifitiLabelPath = '/html/body/main/div/div/div[2]/div[1]/span/div[1]';
function hifitiUi({ path = '/', saved = new Map(), values = new Map(), withId = true } = {}) {
 const e=env('www.hifiti.com',path,saved,values), actions=[];
 e.sandbox.document.readyState='complete';
 const button=ecyElement('签到'), label=ecyElement('签到');
 if(withId){button.children.set('#sign',label);e.elements.set('#sign',label);}
 label.parentElement=button;
 e.xpaths.set(hifitiSignPath,button);e.xpaths.set(hifitiLabelPath,label);
 const signed=()=>{label.textContent='已签'};
 button.click=()=>{actions.push('sign');e.after(1000,signed)};
 label.click=()=>button.click();
 const prompt=text=>e.elements.set('[role="alert"], [role="dialog"], .modal, .alert, .jconfirm-content',[ecyElement(text)]);
 return {...e,button,label,actions,signed,prompt};
}
await test('HiFiTi：XPath 按钮只点一次，等待嵌套 #sign 异步显示已签再记录成功',async()=>{
 const e=hifitiUi();assert.equal((await e.api.run()).status,'success');assert.deepEqual(e.actions,['sign']);assert.equal(e.calls.length,0);
 assert.equal(await e.api.completedToday('hifiti'),true);await e.api.run();assert.deepEqual(e.actions,['sign']);e.cleanup();
});
await test('HiFiTi：初始 #sign 已签时不点击',async()=>{
 const e=hifitiUi();e.signed();assert.equal((await e.api.run()).status,'already');assert.deepEqual(e.actions,[]);assert.equal(await e.api.completedToday('hifiti'),true);e.cleanup();
});
await test('HiFiTi：布局变化时使用已确认的 #sign 入口',async()=>{
 const e=hifitiUi();e.xpaths.delete(hifitiSignPath);assert.equal((await e.api.hifiti()).status,'success');assert.deepEqual(e.actions,['sign']);e.cleanup();
});
await test('HiFiTi：等待页面初始化和按钮延迟挂载',async()=>{
 const e=hifitiUi();e.sandbox.document.readyState='interactive';e.xpaths.clear();e.elements.delete('#sign');
 e.after(1500,()=>{e.sandbox.document.readyState='complete'});e.after(2000,()=>{e.xpaths.set(hifitiSignPath,e.button);e.elements.set('#sign',e.label)});
 const started=e.sandbox.Date.now(),click=e.button.click;e.button.click=()=>{assert.ok(e.sandbox.Date.now()-started>=2500);click()};
 assert.equal((await e.api.hifiti()).status,'success');assert.deepEqual(e.actions,['sign']);e.cleanup();
});
await test('HiFiTi：登录提示及重定向停止，失败状态不记成功',async()=>{
 for(const mode of ['label','prompt','redirect']){const e=hifitiUi();
  if(mode==='label')e.label.textContent='登录后签到';
  else e.button.click=()=>{e.actions.push('sign');if(mode==='redirect')e.sandbox.location.pathname='/user-login.htm';else e.prompt('请先登录')};
  assert.equal((await e.api.run()).status,'login');assert.equal(e.actions.length,mode==='label'?0:1);assert.equal(await e.api.completedToday('hifiti'),false);e.cleanup();
 }
});
await test('HiFiTi：人工验证与明确失败提示只报告结果，不再次点击',async()=>{
 for(const [text,status] of [['请完成人机验证','manual'],['签到失败，请稍后重试','failed']]){const e=hifitiUi();e.button.click=()=>{e.actions.push('sign');e.prompt(text)};
  assert.equal((await e.api.run()).status,status);assert.deepEqual(e.actions,['sign']);assert.equal(await e.api.completedToday('hifiti'),false);e.cleanup();
 }
});
await test('HiFiTi：结果超时、无关已签文案及普通成功提示不写成功，不重试',async()=>{
 const e=hifitiUi();e.sandbox.document.body.innerText='今日已签 签到成功';e.button.click=()=>{e.actions.push('sign');e.prompt('操作成功')};
 assert.equal((await e.api.run()).status,'unknown');assert.deepEqual(e.actions,['sign']);assert.equal(await e.api.completedToday('hifiti'),false);e.cleanup();
});
await test('HiFiTi：缺失、隐藏、禁用或语义变化的按钮不点击',async()=>{
 for(const mode of ['missing','hidden','disabled','changed']){const e=hifitiUi();
  if(mode==='missing'){e.xpaths.clear();e.elements.clear()}
  if(mode==='hidden'){e.button.style.display='none';e.label.style.display='none'}
  if(mode==='disabled')e.button.setAttribute('aria-disabled','true');
  if(mode==='changed')e.label.textContent='补签';
  assert.equal((await e.api.hifiti()).status,'manual');assert.deepEqual(e.actions,[]);e.cleanup();
 }
});
await test('HiFiTi：开关拦截访问、手动及批量入口',async()=>{
 const e=hifitiUi();e.saved.set('sites.hifiti',false);await e.api.main();await e.api.openSite('hifiti');assert.deepEqual(e.actions,[]);
 const pages=batchPages(e);await e.api.runBatch();assert.deepEqual(pages.opened,enabledSites.filter(id=>id!=='hifiti'));e.cleanup();
});
await test('HiFiTi：关闭访问签到及访问其他页面不自动提交',async()=>{
 const e=hifitiUi();e.saved.set('behavior.autoVisit',false);await e.api.main();assert.deepEqual(e.actions,[]);
 e.sandbox.location.pathname='/thread-2.htm';e.saved.set('behavior.autoVisit',true);await e.api.main();assert.deepEqual(e.actions,[]);
 assert.equal((await e.api.hifiti()).status,'manual');e.cleanup();
});
await test('HiFiTi：登录重定向丢失批次标记时回传登录状态',async()=>{
 const e=env('www.hifiti.com','/user-login.htm');e.saved.set(prefix+'pending:hifiti',{token:'batch_test_hifiti',at:e.sandbox.Date.now()});await e.api.main();
 assert.equal(e.saved.get(prefix+'result:hifiti').status,'login');assert.equal(e.saved.get(prefix+'result:hifiti').token,'batch_test_hifiti');e.cleanup();
});
await test('HiFiTi：首页通过 span/div[1] XPath 判定已签（无 #sign 属性且 span 含统计文案）',async()=>{
 const e=hifitiUi({withId:false});
 e.button.textContent='签到 184505人 连续签到0天';
 e.button.click=()=>{e.actions.push('sign');e.after(500,()=>{e.button.textContent='已签 184506人 连续签到1天';e.label.textContent='已签'})};
 assert.equal((await e.api.run()).status,'success');assert.deepEqual(e.actions,['sign']);
 assert.equal(await e.api.completedToday('hifiti'),true);e.cleanup();
});
await test('HiFiTi：点击后重定向到 sg_sign.htm 且元素为已签时判定成功',async()=>{
 for(const withJob of [true,false]){
  const saved=new Map(), values=new Map();
  if(withJob)values.set(prefix+'job',JSON.stringify({token:'batch_hifiti_redirect',at:1792854000000}));
  else saved.set('behavior.autoVisit',false);
  const e1=hifitiUi({saved,values});
  let navSnapshot=null;
  e1.button.click=()=>{e1.actions.push('sign');navSnapshot=new Map(e1.values);};
  const pendingRun=e1.api.run();
  while(!navSnapshot)await new Promise(resolve=>setTimeout(resolve,0));
  e1.cleanup();
  void pendingRun;
  assert.deepEqual(e1.actions,['sign']);
  assert.equal(await e1.api.completedToday('hifiti'),false);
  const e2=hifitiUi({path:'/sg_sign.htm',saved,values:navSnapshot,withId:false});
  e2.label.textContent='已签';
  e2.button.style.display='none';e2.label.style.display='none';
  await e2.api.main();
  assert.equal(e2.saved.get(prefix+'result:hifiti').status,'success');
  assert.equal(e2.saved.get(prefix+'result:hifiti').token,withJob?'batch_hifiti_redirect':'');
  assert.equal(await e2.api.completedToday('hifiti'),true);
  assert.deepEqual(e2.actions,[]);
  assert.equal(navSnapshot.has(prefix+'submitted:hifiti'),false);
  e2.cleanup();
 }
});
await test('HiFiTi：同页面内跳转到 sg_sign.htm 且元素为已签时判定成功',async()=>{
 const e=hifitiUi({withId:false});
 e.button.click=()=>{e.actions.push('sign');e.after(500,()=>{e.sandbox.location.pathname='/sg_sign.htm';e.label.textContent='已签'})};
 assert.equal((await e.api.run()).status,'success');assert.deepEqual(e.actions,['sign']);
 assert.equal(await e.api.completedToday('hifiti'),true);e.cleanup();
});
await test('HiFiTi：重定向到 sg_sign.htm 后仍显示签到则判定失败且不重试',async()=>{
 const saved=new Map(), e1=hifitiUi({saved});
 let navSnapshot=null;
 e1.button.click=()=>{e1.actions.push('sign');navSnapshot=new Map(e1.values);};
 const pendingRun=e1.api.run();
 while(!navSnapshot)await new Promise(resolve=>setTimeout(resolve,0));
 e1.cleanup();
 void pendingRun;
 const e2=hifitiUi({path:'/sg_sign.htm',saved,values:navSnapshot,withId:false});
 e2.label.textContent='签到';
 await e2.api.main();
 assert.equal(e2.saved.get(prefix+'result:hifiti').status,'failed');
 assert.equal(await e2.api.completedToday('hifiti'),false);
 assert.deepEqual(e2.actions,[]);
 e2.cleanup();

 const e3=hifitiUi({withId:false});
 e3.button.click=()=>{e3.actions.push('sign');e3.after(500,()=>{e3.sandbox.location.pathname='/sg_sign.htm';e3.label.textContent='签到'})};
 assert.equal((await e3.api.run()).status,'failed');assert.deepEqual(e3.actions,['sign']);
 assert.equal(await e3.api.completedToday('hifiti'),false);e3.cleanup();
});
await test('HiFiTi：未从首页触发提交时直接访问 sg_sign.htm 不自动签到',async()=>{
 const e1=hifitiUi({path:'/sg_sign.htm',withId:false});
 e1.saved.set('behavior.autoVisit',true);
 await e1.api.main();
 assert.deepEqual(e1.actions,[]);assert.equal(e1.saved.has(prefix+'result:hifiti'),false);
 assert.equal((await e1.api.hifiti()).status,'manual');assert.deepEqual(e1.actions,[]);
 e1.label.textContent='已签';
 assert.equal((await e1.api.hifiti()).status,'already');assert.deepEqual(e1.actions,[]);e1.cleanup();
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

function kuroEnv({ path = '/mc/home/9', storage = null, saved = new Map(), values = new Map() } = {}) {
 const store = new Map(Object.entries(storage ?? {
  auth_token: 'FAKE-KURO-JWT',
  dc: 'FAKE-DEV-CODE-32',
  distinct_id: 'FAKE-DISTINCT-ID',
  auth: JSON.stringify({ token: 'FAKE-KURO-JWT', userId: '10001' }),
 }));
 const e = env('www.kurobbs.com', path, saved, values);
 e.sandbox.localStorage.getItem = key => store.has(key) ? store.get(key) : null;
 return { ...e, store };
}
function kuroRole(overrides = {}) {
 return { gameId: 3, serverId: 'fake-server', roleId: '900000001', userId: '10001', isDefault: true, ...overrides };
}
await test('库街区鸣潮：今日已签到只查询角色与状态，不发送签到 POST',async()=>{
 const e=kuroEnv();
 e.sandbox.fetch=async(url,opts)=>{
  e.calls.push({url,opts});
  if(url.endsWith('/gamer/role/list'))return e.json({code:200,msg:'请求成功',data:[kuroRole()]},200,url);
  if(url.endsWith('/encourage/signIn/initSignInV2'))return e.json({code:200,msg:'请求成功',data:{isSigIn:true,eventStartTimes:'2026-11-01 00:00:00'}},200,url);
  throw Error('must not sign');
 };
 assert.equal((await e.api.run()).status,'already');
 assert.equal(e.calls.length,2);
 assert.equal(e.calls[0].opts.headers.source,'h5');
 assert.equal(e.calls[0].opts.headers.token,'FAKE-KURO-JWT');
 assert.equal(e.calls[0].opts.headers.devCode,'FAKE-DEV-CODE-32');
 assert.equal(e.calls[0].opts.credentials,'omit');
 assert.equal(await e.api.completedToday('kurobbs'),true);
 e.cleanup();
});
await test('库街区鸣潮：实时读取网页令牌，按默认角色和月份提交一次并复核已签',async()=>{
 const e=kuroEnv();let initCalls=0;
 e.sandbox.fetch=async(url,opts)=>{
  e.calls.push({url,opts});
  if(url.endsWith('/gamer/role/list'))return e.json({code:200,data:[kuroRole({roleId:'111',isDefault:false}),kuroRole({roleId:'222',isDefault:true})]},200,url);
  if(url.endsWith('/encourage/signIn/initSignInV2'))return e.json({code:200,data:{isSigIn:++initCalls>1,eventStartTimes:'2026-11-01 00:00:00'}},200,url);
  if(url.endsWith('/encourage/signIn/v2'))return e.json({code:200,msg:'请求成功',data:{}},200,url);
  throw Error('unexpected '+url);
 };
 assert.equal((await e.api.run()).status,'success');
 assert.equal(e.calls.length,4);
 const submit=e.calls[2];
 assert.ok(submit.url==='https://api.kurobbs.com/encourage/signIn/v2');
 const body=new URLSearchParams(submit.opts.body);
 assert.equal(body.get('gameId'),'3');
 assert.equal(body.get('roleId'),'222');
 assert.equal(body.get('serverId'),'fake-server');
 assert.equal(body.get('userId'),'10001');
 assert.equal(body.get('reqMonth'),'11');
 assert.equal(submit.opts.headers.source,'h5');
 assert.equal(await e.api.completedToday('kurobbs'),true);
 const persisted=JSON.stringify([...e.saved.values()]);
 assert.ok(!persisted.includes('FAKE-KURO-JWT')&&!persisted.includes('FAKE-DEV-CODE-32')&&!persisted.includes('222'));
 e.cleanup();
});
await test('库街区鸣潮：无令牌时不发送任何请求，返回需登录',async()=>{
 const e=kuroEnv({storage:{}});
 assert.equal((await e.api.run()).status,'login');
 assert.equal(e.calls.length,0);
 assert.equal(await e.api.completedToday('kurobbs'),false);
 e.cleanup();
});
await test('库街区鸣潮：业务码 220/230 登录过期停止提交且不记成功',async()=>{
 for(const code of [220,230]){
  const e=kuroEnv();
  e.sandbox.fetch=async(url,opts)=>{e.calls.push({url,opts});return e.json({code,msg:'登录已过期，请重新登录'},200,url)};
  assert.equal((await e.api.run()).status,'login');
  assert.equal(e.calls.length,1);
  assert.equal(await e.api.completedToday('kurobbs'),false);
  e.cleanup();
 }
});
await test('库街区鸣潮：提交返回 1511 重复签到且复核已签时记为今日已签',async()=>{
 const e=kuroEnv();let initCalls=0;
 e.sandbox.fetch=async(url,opts)=>{
  e.calls.push({url,opts});
  if(url.endsWith('/gamer/role/list'))return e.json({code:200,data:[kuroRole()]},200,url);
  if(url.endsWith('/encourage/signIn/initSignInV2'))return e.json({code:200,data:{isSigIn:++initCalls>1,nowServerTimes:'2026-11-20 12:00:00'}},200,url);
  if(url.endsWith('/encourage/signIn/v2'))return e.json({code:1511,msg:'请勿重复签到',success:false},200,url);
  throw Error('unexpected '+url);
 };
 assert.equal((await e.api.run()).status,'already');
 assert.equal(await e.api.completedToday('kurobbs'),true);
 e.cleanup();
});
await test('库街区鸣潮：提交后复核未签、状态格式异常、未绑角色和风控均不误报成功',async()=>{
 // Re-check still false -> unknown
 const e1=kuroEnv();
 e1.sandbox.fetch=async(url)=>url.endsWith('/gamer/role/list')?e1.json({code:200,data:[kuroRole()]},200,url):url.endsWith('/encourage/signIn/initSignInV2')?e1.json({code:200,data:{isSigIn:false,eventStartTimes:'2026-11-01'}},200,url):e1.json({code:200},200,url);
 assert.equal((await e1.api.run()).status,'unknown');assert.equal(await e1.api.completedToday('kurobbs'),false);e1.cleanup();
 // Schema changed -> unknown without sign POST
 const e2=kuroEnv();
 e2.sandbox.fetch=async(url,opts)=>{e2.calls.push({url,opts});return url.endsWith('/gamer/role/list')?e2.json({code:200,data:[kuroRole()]},200,url):e2.json({code:200,data:{signed:true}},200,url)};
 assert.equal((await e2.api.kurobbs()).status,'unknown');assert.equal(e2.calls.length,2);e2.cleanup();
 // No bound role -> manual
 const e3=kuroEnv();
 e3.sandbox.fetch=async(url)=>e3.json({code:200,data:[]},200,url);
 assert.equal((await e3.api.kurobbs()).status,'manual');e3.cleanup();
 // Risk control / captcha -> manual
 const e4=kuroEnv();
 e4.sandbox.fetch=async(url)=>url.endsWith('/gamer/role/list')?e4.json({code:200,data:[kuroRole()]},200,url):url.endsWith('/encourage/signIn/initSignInV2')?e4.json({code:200,data:{isSigIn:false,eventStartTimes:'2026-11-01'}},200,url):e4.json({code:5001,msg:'请完成滑动验证'},200,url);
 assert.equal((await e4.api.kurobbs()).status,'manual');e4.cleanup();
});
await test('库街区鸣潮：仅允许访问白名单官方 API 域，其他站点仍严禁跨站请求',async()=>{
 const eKuro=kuroEnv();
 await assert.rejects(eKuro.api.requestJSON('https://other.invalid/signIn'),/禁止向其他站点/);
 assert.equal(eKuro.calls.length,0);
 const eZhiyao=env();
 await assert.rejects(eZhiyao.api.requestJSON('https://api.kurobbs.com/gamer/role/list'),/禁止向其他站点/);
 assert.equal(eZhiyao.calls.length,0);
 eKuro.cleanup();eZhiyao.cleanup();
});
await test('库街区鸣潮：站点开关及非签到路径访问均按规则拦截',async()=>{
 const e=kuroEnv();e.saved.set('sites.kurobbs',false);await e.api.main();await e.api.openSite('kurobbs');assert.equal(e.calls.length,0);
 const eOther=kuroEnv({path:'/mc/post/123'});eOther.saved.set('behavior.autoVisit',true);await eOther.api.main();assert.equal(eOther.calls.length,0);
 e.cleanup();eOther.cleanup();
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
await test('调度器：忽略过期结果、按运行标识收集全部已启用站点并关闭成功页',async()=>{
 const e=env();let closed=0,opened=0;e.saved.set(prefix+'result:zhiyao',{token:'OLD',status:'success'});
 e.sandbox.GM_openInTab=url=>{opened++;const u=new URL(url),token=u.searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);setTimeout(()=>e.saved.set(prefix+'result:'+id,{token,status:'already',message:'verified'}),1);return {close(){closed++}}};
 const run=e.api.runBatch();await run;assert.equal(opened,enabledSites.length);assert.equal(closed,enabledSites.length);assert.equal(e.saved.get(prefix+'batchLock'),null);e.cleanup();
});
await test('调度器：登录失败保留页面并正确报告批次失败',async()=>{
 const e=env();let closed=0;e.sandbox.GM_openInTab=url=>{const token=new URL(url).searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);e.saved.set(prefix+'result:'+id,{token,status:id==='ecy'?'login':'already',message:'test'});return {close(){closed++}}};
 await assert.rejects(e.api.runBatch(),/1个站点未完成/);assert.equal(closed,enabledSites.length-1);assert.equal(e.saved.get(prefix+'batchLast').results.length,enabledSites.length);e.cleanup();
});
await test('禁用站点同时拦截页面签到、单站打开和批量启动',async()=>{
 const e=env();e.saved.set('sites.zhiyao',false);let opened=[];
 e.sandbox.GM_openInTab=url=>{opened.push(url);const token=new URL(url).searchParams.get('sc_daily_checkin');const id=token.split('_').at(-1);e.saved.set(prefix+'result:'+id,{token,status:'already',message:'ok'});return {close(){}}};
 assert.equal((await e.api.run()).status,'disabled');await e.api.openSite('zhiyao');await e.api.runBatch();assert.equal(e.calls.length,0);assert.equal(opened.length,enabledSites.length-1);assert.ok(!opened.some(u=>u.includes('zhiyaoapi')));e.cleanup();
});
await test('关闭访问时签到后，普通访问不发送请求',async()=>{
 const e=env();e.saved.set('behavior.autoVisit',false);await e.api.main();assert.equal(e.calls.length,0);assert.equal(e.saved.has(prefix+'result:zhiyao'),false);e.cleanup();
});
await test('加载新版和读取默认配置不覆盖个人设置',async()=>{
 const e=env();e.saved.set('sites.zhiyao',false);e.saved.set('schedule.times','10:35,23:20');e.saved.set('behavior.autoVisit',false);await e.api.main();assert.equal(e.saved.get('sites.zhiyao'),false);assert.equal(e.saved.get('schedule.times'),'10:35,23:20');e.cleanup();
});
function batchPages(e, statusFor = () => 'already') {
 const opened = [], closed = [], tokens = [];
 e.sandbox.GM_openInTab = url => {
  const token = new URL(url).searchParams.get('sc_daily_checkin'), id = token.split('_').at(-1);
  const status = statusFor(id, token);
  opened.push(id);
  tokens.push(token);
  e.sandbox.GM.setValue(prefix+'result:'+id, {token,status,message:'test',at:e.sandbox.Date.now()});
  if (['success','already'].includes(status)) e.sandbox.GM.setValue(prefix+'completed:'+id, {day:e.api.localDay(),status,at:e.sandbox.Date.now()});
  return {closed:false, close(){this.closed=true;closed.push(id)}};
 };
 return {opened,closed,tokens};
}
function runSchedulerIn(e) {
 const commands = new Map();
 e.sandbox.GM_registerMenuCommand = (name, fn) => commands.set(name, fn);
 vm.runInContext('(function(){' + scheduler + '})()', e.sandbox);
 return {
  commands,
  async settle() { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); },
 };
}
await test('启动检查仅在浏览器启动执行一次，不受旧时间配置限制，无定时轮询',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,14,12));e.saved.set('schedule.times','25:00');e.saved.set(prefix+'scheduleLast','old');
 const pages=batchPages(e);const bg=runSchedulerIn(e);await bg.settle();
 assert.equal(pages.opened.length,enabledSites.length);assert.ok(pages.tokens.every(t=>t.startsWith('batch_')));
 assert.equal(pages.closed.length,enabledSites.length);e.cleanup();
});
await test('成功日期按本地自然日保存，次日零点失效而非24小时',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,23,59));
 await e.api.saveCompletion('zhiyao',{status:'success'},e.api.localDay());
 assert.equal(e.saved.get(prefix+'completed:zhiyao').day,'2026-11-01');assert.equal(await e.api.completedToday('zhiyao'),true);
 e.setNow(new Date(2026,10,2,0,0));assert.equal(await e.api.completedToday('zhiyao'),false);e.cleanup();
});
await test('启动检查逐站独立跳过今日成功，仅打开未完成、过期或未知网站',async()=>{
 const e=env();e.setNow(new Date(2026,10,1,8,0));
 await e.api.saveCompletion('zhiyao',{status:'already'},e.api.localDay());
 e.saved.set(prefix+'completed:ecy',{day:'2026-10-31',status:'success'});
 e.saved.set(prefix+'completed:kuku',{day:e.api.localDay(),status:'unknown'});
 const pages=batchPages(e);const bg=runSchedulerIn(e);await bg.settle();
 assert.deepEqual(pages.opened,enabledSites.filter(id=>id!=='zhiyao'));assert.equal(pages.closed.length,enabledSites.length-1);e.cleanup();
});
await test('同日重启保留成功站点，仅重新尝试失败网站',async()=>{
 const first=env(), pages=batchPages(first,id=>id==='ecy'?'login':'success');
 const bg1=runSchedulerIn(first);await bg1.settle();assert.equal(pages.opened.length,enabledSites.length);assert.equal(first.saved.has(prefix+'completed:ecy'),false);
 const second=env('zhiyaoapi.top','/dashboard',first.saved), retry=batchPages(second);
 const bg2=runSchedulerIn(second);await bg2.settle();assert.deepEqual(retry.opened,['ecy']);first.cleanup();second.cleanup();
});
await test('所有站点今日成功时重启不打开页面也不弹批量通知',async()=>{
 const first=env();batchPages(first);await first.api.runBatch({startup:true});
 const second=env('zhiyaoapi.top','/dashboard',first.saved);second.sandbox.GM_openInTab=()=>assert.fail('must not open');second.sandbox.GM_notification=()=>assert.fail('must not notify');
 const bg2=runSchedulerIn(second);await bg2.settle();first.cleanup();second.cleanup();
});
await test('手动一键重新核验强制打开全部已启用站点并核验真实页面（绕过本地成功缓存）',async()=>{
 const e=env();
 for(const id of enabledSites)await e.api.saveCompletion(id,{status:'already'},e.api.localDay());
 const pages=batchPages(e);const bg=runSchedulerIn(e);await bg.settle();
 assert.equal(pages.opened.length,0,'startup must skip completed sites');
 const manualCmd=bg.commands.get('全部已启用网站：立即重新核验并签到');
 assert.equal(typeof manualCmd,'function');
 manualCmd();await bg.settle();
 assert.deepEqual(pages.opened,enabledSites);
 assert.ok(pages.tokens.every(t=>t.startsWith('force_')));
 assert.equal(pages.closed.length,enabledSites.length);e.cleanup();
});
await test('页面端强制令牌与单站手动检查绕过本地缓存重新核验，被动访问仍命中缓存',async()=>{
 const e=env();let requests=0;e.sandbox.fetch=async()=>{requests++;return e.json({today_checked_in:true})};
 await e.api.run();assert.equal(requests,1);assert.equal(await e.api.completedToday('zhiyao'),true);
 await e.api.run();assert.equal(requests,1,'passive run must use today cache');
 await e.api.run({force:true});assert.equal(requests,2,'manual single-site check must re-verify live site');
 e.values.set(prefix+'job',JSON.stringify({token:'force_batch_zhiyao',force:true,at:e.sandbox.Date.now()}));
 const eForce=env('zhiyaoapi.top','/dashboard',e.saved,e.values);
 let forceRequests=0;eForce.sandbox.fetch=async()=>{forceRequests++;return eForce.json({today_checked_in:true})};
 await eForce.api.main();assert.equal(forceRequests,1,'force token must re-verify live site');
 e.advance(86400000);await e.api.run();assert.equal(requests,3);e.cleanup();eForce.cleanup();
});
await test('强制重新核验若发现实际未登录会清除误记的当日成功状态',async()=>{
 const e=env();await e.api.saveCompletion('zhiyao',{status:'already'},e.api.localDay());
 e.sandbox.localStorage.getItem=()=>null;
 assert.equal((await e.api.run({force:true})).status,'login');
 assert.equal(await e.api.completedToday('zhiyao'),false);e.cleanup();
});
await test('网页菜单点击一键重新核验可交由后台脚本执行，不受当前标签页影响；无后台时本地降级执行',async()=>{
 const e=env('zhiyaoapi.top','/dashboard');
 for(const id of enabledSites)await e.api.saveCompletion(id,{status:'already'},e.api.localDay());
 const pages=batchPages(e);const bg=runSchedulerIn(e);await bg.settle();
 const res=await e.api.requestManualBatch();await bg.settle();
 assert.equal(res,'已交由后台脚本执行');
 assert.deepEqual(pages.opened,enabledSites);assert.ok(pages.tokens.every(t=>t.startsWith('force_')));
 // Standalone worker fallback when background script is not active:
 const standalone=env('zhiyaoapi.top','/dashboard');
 for(const id of enabledSites)await standalone.api.saveCompletion(id,{status:'already'},standalone.api.localDay());
 const fallbackPages=batchPages(standalone);
 await standalone.api.requestManualBatch();
 assert.deepEqual(fallbackPages.opened,enabledSites);assert.ok(fallbackPages.tokens.every(t=>t.startsWith('force_')));
 e.cleanup();standalone.cleanup();
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
await test('关闭启动自动签到不影响手动全站核验，且重新启用后启动即检查',async()=>{
 const e=env();e.saved.set('schedule.enabled',false);const pages=batchPages(e);
 const bg=runSchedulerIn(e);await bg.settle();assert.equal(pages.opened.length,0);
 const manualCmd=bg.commands.get('全部已启用网站：立即重新核验并签到');
 manualCmd();await bg.settle();assert.equal(pages.opened.length,enabledSites.length);
 const e2=env('zhiyaoapi.top','/dashboard',new Map());e2.saved.set('schedule.enabled',true);const pages2=batchPages(e2);
 const bg2=runSchedulerIn(e2);await bg2.settle();assert.equal(pages2.opened.length,enabledSites.length);
 e.cleanup();e2.cleanup();
});
await test('启动遇到异常退出遗留的无心跳批次锁可快速接管，活跃批次仍互斥拦截',async()=>{
 const e=env();e.saved.set(prefix+'batchLock',{token:'crashed_prev',at:e.sandbox.Date.now()});const pages=batchPages(e);
 // Non-startup manual batch sees fresh lock and rejects immediately:
 await assert.rejects(e.api.runBatch({force:true}),/已有批量/);
 // Startup detects stale lock whose heartbeat did not advance and recovers:
 await e.api.runBatch({startup:true});assert.equal(pages.opened.length,enabledSites.length);e.cleanup();
});
await test('后台标签页被提前关闭时快速中止等待，不再空等整段超时',async()=>{
 const e=env();
 e.sandbox.GM_openInTab=()=>({closed:true,close(){}});
 const started=e.sandbox.Date.now();
 await assert.rejects(e.api.runBatch({force:true}),/未完成/);
 assert.ok(e.sandbox.Date.now()-started<20000);e.cleanup();
});
await test('ECY：容器缺失回退到 #checkin 且已显示今日已签到时不重复点击',async()=>{
 const e=ecyUi();e.xpaths.delete(ecySignPath);e.elements.delete('#checkin-btn');e.button.textContent='今日已签到';
 assert.equal((await e.api.ecy()).status,'already');assert.deepEqual(e.actions,[]);e.cleanup();
});
await test('HiFiTi：首页存在通用 .alert 公告条但不影响 #sign 已签判断',async()=>{
 const e=hifitiUi();e.signed();e.prompt('公告：请先登录后下载资源');
 assert.equal((await e.api.hifiti()).status,'already');assert.deepEqual(e.actions,[]);e.cleanup();
});
await test('站点开关配置损坏时回退默认开关而不中断整批其他站点',async()=>{
 const e=env();e.saved.set('sites.zhiyao','corrupted');const pages=batchPages(e);
 await e.api.runBatch();assert.equal(pages.opened.length,enabledSites.length);e.cleanup();
});
await test('全部停用时不打开页面',async()=>{
 const e=env();for(const {id} of registry)e.saved.set('sites.'+id,false);e.sandbox.GM_openInTab=()=>assert.fail('must not open');assert.equal(await e.api.runBatch(),'没有启用的站点');e.cleanup();
});
await fs.writeFile('test-results/acceptance.json', JSON.stringify({passed:reports.length,total:reports.length,scope:'Offline VM acceptance scenarios; no authenticated browser execution',reports},null,2));
