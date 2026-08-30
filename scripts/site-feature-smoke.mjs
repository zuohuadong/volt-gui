#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(root, process.env.VOLTUI_SITE_DIST || 'site/dist');
const routes = ['index.html', 'capabilities/index.html', 'enterprise/index.html', 'usage/index.html', 'docs/index.html', '404.html'];
const pages = Object.fromEntries(await Promise.all(routes.map(async (file) => [file, await readFile(path.join(dist, file), 'utf8')])));
const failures = [];
const check = (condition, message) => condition ? console.log(`PASS ${message}`) : (console.error(`FAIL ${message}`), failures.push(message));

for (const [file, html] of Object.entries(pages)) {
  check(html.includes('id="nav"') && html.includes('id="lang"'), `${file} uses the shared navigation`);
  check(html.includes('data-title-en=') && html.includes('data-title-zh='), `${file} exposes bilingual title metadata`);
  check(!/(?:Reasonix|Wails|main-v2|desktop-frontend|Go CLI|npm i -g voltui)/i.test(html), `${file} has no retired runtime copy`);
}

check(pages['index.html'].includes('Electron shell') && pages['index.html'].includes('Official DeepSeek Harness'), 'home names the current runtime');
check(pages['enterprise/index.html'].includes('unsigned-review') && pages['enterprise/index.html'].includes('Node 26.8.1'), 'enterprise page states packaging gates');
check(pages['docs/index.html'].includes('pnpm install --frozen-lockfile') && pages['docs/index.html'].includes('pnpm run desktop'), 'docs exposes the supported install and run commands');
check(pages['docs/index.html'].includes('id="install"') && pages['docs/index.html'].includes('id="verify"'), 'docs anchors resolve');

if (failures.length) {
  console.error(`\nSite feature smoke failed: ${failures.length} assertion(s).`);
  process.exit(1);
}
console.log('\nSite feature smoke passed.');
