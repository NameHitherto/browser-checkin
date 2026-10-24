import fs from 'node:fs/promises';
const pkg = JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
if (process.env.GITHUB_REF_NAME !== 'v' + pkg.version) throw new Error('Git tag 与 package.json 版本不一致');
console.log('发布标签与版本一致');
