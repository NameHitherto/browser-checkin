import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');

export function validateRegistry(registry) {
  if (!Array.isArray(registry) || !registry.length) throw new Error('站点注册表不能为空');
  const ids = new Set();
  const hosts = new Set();
  for (const site of registry) {
    if (!/^[a-z][a-z0-9_]*$/.test(site.id) || ids.has(site.id)) throw new Error('站点 id 重复或无效');
    ids.add(site.id);
    if (!/^[a-z][a-z0-9_]*$/.test(site.adapter) || !site.name || typeof site.defaultEnabled !== 'boolean') throw new Error('适配器定义无效');
    const url = new URL(site.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('站点入口仅允许无认证参数的 HTTPS URL');
    if (!Array.isArray(site.hosts) || !site.hosts.includes(url.hostname)) throw new Error('站点入口与域名不一致');
    for (const host of site.hosts) {
      if (!/^[a-z0-9.-]+\.[a-z]+$/.test(host) || hosts.has(host)) throw new Error('重复或无效域名');
      hosts.add(host);
    }
    if (!site.matches?.length || site.matches.some(match => !site.hosts.some(host => match.startsWith(`https://${host}/`)))) throw new Error('匹配范围必须限于本站 HTTPS 域名');
    if (!site.autoPaths?.length || site.autoPaths.some(p => typeof p !== 'string' || !p.startsWith('/'))) throw new Error('自动路径无效');
    for (const key of ['loginPaths','loginPrefixes']) if (!Array.isArray(site[key]) || site[key].some(p => typeof p !== 'string' || !p.startsWith('/'))) throw new Error('登录重定向路径无效');
  }
  return registry;
}
function configBlock(registry) {
  return `/* ==UserConfig==\nsites:\n${registry.map(site => `  ${site.id}:\n    title: ${JSON.stringify(site.name + '：启用签到')}\n    type: checkbox\n    default: ${site.defaultEnabled}`).join('\n')}
behavior:
  autoVisit:
    title: 访问签到页面时自动执行
    type: checkbox
    default: true
  closeSuccess:
    title: 批量执行后关闭成功的临时页面
    type: checkbox
    default: true
  notifications:
    title: 显示批量结果通知
    type: checkbox
    default: true
schedule:
  enabled:
    title: 启用浏览器启动与跨日签到
    type: checkbox
    default: true
==/UserConfig== */\n`;
}
export async function generate() {
  const pkg = JSON.parse(await read('package.json'));
  const release = JSON.parse(await read('release.json'));
  for (const field of ['owner','repository','branch']) if (!/^[a-zA-Z0-9_.-]+$/.test(release[field] || '')) throw new Error('发布配置无效：' + field);
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('版本号应为 x.y.z');
  const registry = validateRegistry(JSON.parse(await read('src/registry.json')));
  const base = `https://raw.githubusercontent.com/${release.owner}/${release.repository}/${release.branch}/dist`;
  const home = `https://github.com/${release.owner}/${release.repository}`;
  const values = Object.fromEntries(registry.map(site => [site.id,site]));
  const common = `  const VERSION = ${JSON.stringify(pkg.version)};\n  const SITE = ${JSON.stringify(values,null,2)};\n` + await read('src/runtime.js');
  const grants = ['GM_openInTab','GM_getValue','GM_setValue','GM.getValue','GM.setValue','GM_log','GM_notification'];
  const header = (kind) => `// ==UserScript==\n// @name         三站签到 · ${kind === 'worker' ? '页面执行器' : '定时与一键执行'}\n// @namespace    local.namehitherto.checkin\n// @version      ${pkg.version}\n// @description  ${kind === 'worker' ? '浏览器会话复用；可配置站点开关；官网结果复核' : '浏览器启动时检查每日状态；仅打开未完成网站；跨日失效'}\n${kind === 'worker' ? registry.flatMap(site => site.matches).map(match => `// @match        ${match}\n`).join('') + '// @run-at       document-start\n// @inject-into  content\n// @noframes\n' : '// @background\n'}// @storageName  local.namehitherto.three-sites.checkin.v1\n${[...grants,...(kind==='worker'?['GM_registerMenuCommand','CAT_userConfig']:[])].map(grant=>`// @grant        ${grant}\n`).join('')}// @updateURL    ${base}/${kind}.meta.js\n// @downloadURL  ${base}/${kind}.user.js\n// @homepageURL  ${home}\n// @supportURL   ${home}/issues\n// @license      MIT\n// ==/UserScript==\n`;
  let adapters = '';
  for (const name of new Set(registry.map(site=>site.adapter))) {
    const code = await read(`src/sites/${name}.js`);
    if (!new RegExp(`async function ${name}\\(`).test(code)) throw new Error(`缺少适配器函数：${name}`);
    adapters += code + '\n';
  }
  adapters += '  const ADAPTERS = {' + registry.map(site=>`${JSON.stringify(site.id)}:${site.adapter}`).join(',') + '};\n';
  const workerSource = await read('src/worker.js');
  if (!workerSource.includes('/* ADAPTERS */')) throw new Error('缺少适配器插入点');
  const files = {
    'worker.user.js':header('worker')+'\n'+configBlock(registry)+'\n(() => {\n  \'use strict\';\n'+common+workerSource.replace('/* ADAPTERS */',adapters)+'\n})();\n',
    'scheduler.user.js':header('scheduler')+'\nreturn (async () => {\n  \'use strict\';\n'+common+await read('src/scheduler.js')+'\n})();\n',
    'worker.meta.js':header('worker'),
    'scheduler.meta.js':header('scheduler'),
    'checkin.user.sub.js':`// ==UserSubscribe==\n// @name         网页签到工具集\n// @description  实时浏览器登录态、启动检查、逐站每日状态与手动全签\n// @version      ${pkg.version}\n// @author       ${release.owner}\n// @scriptUrl    ${base}/worker.user.js\n// @scriptUrl    ${base}/scheduler.user.js\n// @homepageURL  ${home}\n// ==/UserSubscribe==\n`,
  };
  for (const [file,code] of Object.entries(files)) if(file.endsWith('.user.js')) new Function(code);
  return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await generate();
  await fs.mkdir(path.join(root,'dist'),{recursive:true});
  for (const [name,code] of Object.entries(files)) {
    const target = path.join(root,'dist',name);
    if (process.argv.includes('--check')) {
      if (await fs.readFile(target,'utf8') !== code) throw new Error(`构建文件未更新：dist/${name}；请运行 npm run build`);
    } else await fs.writeFile(target,code);
  }
  console.log(process.argv.includes('--check') ? '构建一致性通过' : '生成5个发布文件');
}
