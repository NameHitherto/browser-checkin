import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generate, validateRegistry } from '../scripts/build.mjs';
const registry = JSON.parse(await fs.readFile('src/registry.json','utf8'));
test('构建脚本身份、存储与订阅链接保持一致', async()=>{
 const files=await generate();
 for(const kind of ['worker','scheduler']){
  const code=files[kind+'.user.js'];new Function(code);
  assert.match(code,/@namespace\s+local\.namehitherto\.checkin/);
  assert.match(code,/@storageName\s+local\.namehitherto\.three-sites\.checkin\.v1/);
  const version=code.match(/@version\s+(\S+)/)[1];assert.ok(files['checkin.user.sub.js'].includes('@version      '+version));
  assert.ok(code.startsWith(files[kind+'.meta.js']));
  assert.ok(files['checkin.user.sub.js'].includes(`/dist/${kind}.user.js`));
 }
 assert.match(files['scheduler.user.js'], /^\/\/ @background$/m);
 assert.doesNotMatch(files['scheduler.user.js'], /@crontab/);
 assert.doesNotMatch(files['worker.user.js'], /每天执行时间/);
 for(const site of registry){assert.ok(files['worker.user.js'].includes(`sites`));for(const match of site.matches)assert.ok(files['worker.user.js'].includes(`@match        ${match}`));assert.ok(files['worker.user.js'].includes(`${site.id}:\n    title:`));}
});
test('注册表拒绝重复 id、宽泛权限和含凭据的入口',()=>{
 const mutate=fn=>{const x=structuredClone(registry);fn(x);return x};
 assert.throws(()=>validateRegistry(mutate(x=>x.push(x[0]))));
 assert.throws(()=>validateRegistry(mutate(x=>x[0].matches=['*://*/*'])));
 assert.throws(()=>validateRegistry(mutate(x=>x[0].url='https://user:password@zhiyaoapi.top/dashboard')));
 assert.throws(()=>validateRegistry(mutate(x=>x[0].url+='?token=not-real')));
});
test('站点删除后无需保留不存在的适配器或域名',()=>{
 const reduced=registry.filter(site=>site.id!=='ecy');assert.equal(validateRegistry(reduced).length,2);assert.ok(!reduced.some(site=>site.hosts.includes('owo.ecycloud.com')));
});
