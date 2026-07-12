#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(root, process.env.VOLTUI_SITE_DIST || 'site/dist');
const routeFiles = {
  home: 'index.html',
  usage: 'usage/index.html',
  capabilities: 'capabilities/index.html',
  enterprise: 'enterprise/index.html',
  docs: 'docs/index.html',
  notFound: '404.html',
};

const pages = Object.fromEntries(await Promise.all(
  Object.entries(routeFiles).map(async ([name, file]) => [name, await readFile(path.join(dist, file), 'utf8')]),
));
const failures = [];

function check(condition, message) {
  if (condition) console.log(`PASS ${message}`);
  else {
    console.error(`FAIL ${message}`);
    failures.push(message);
  }
}

function attributeValues(html, attribute) {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((match) => match[1]);
}

function ids(html) {
  return new Set(attributeValues(html, 'id'));
}

function assetPath(url) {
  const pathname = new URL(url, 'https://example.test').pathname;
  return path.join(dist, pathname.replace(/^\/volt-gui\/?/, ''));
}

async function referencedAssets(html, tag, attribute) {
  const pattern = new RegExp(`<${tag}\\b[^>]*${attribute}="([^"]+)"[^>]*>`, 'g');
  const extension = tag === 'link' ? '.css' : '.js';
  const urls = [...html.matchAll(pattern)]
    .map((match) => match[1])
    .filter((url) => new URL(url, 'https://example.test').pathname.endsWith(extension));
  return Promise.all(urls.map(async (url) => readFile(assetPath(url), 'utf8')));
}

const allPages = Object.values(pages);
const sharedCss = (await referencedAssets(pages.usage, 'link', 'href')).join('\n');
const sharedScripts = (await referencedAssets(pages.usage, 'script', 'src')).join('\n');
const expectedRoutes = ['/volt-gui/usage/', '/volt-gui/capabilities/', '/volt-gui/enterprise/', '/volt-gui/docs/'];

for (const [name, html] of Object.entries(pages)) {
  check(/<body[^>]*data-lang="en"[^>]*data-title-en="[^"]+"[^>]*data-title-zh="[^"]+"/.test(html), `${name} exposes bilingual title metadata`);
  check(html.includes('id="nav"') && html.includes('id="lang"'), `${name} uses the shared site header`);
}

for (const route of expectedRoutes) {
  check(pages.home.includes(`href="${route}"`), `home links to ${route}`);
  check(pages.usage.includes(`href="${route}"`), `shared navigation links to ${route}`);
}

check(
  /body\[data-lang=(?:"en"|en)\] \.l-zh/.test(sharedCss)
    && /body\[data-lang=(?:"zh"|zh)\] \.l-en/.test(sharedCss)
    && /display\s*:\s*none!important/.test(sharedCss),
  'shared CSS renders exactly one language at a time',
);
check(sharedScripts.includes('voltui-lang') && sharedScripts.includes('navigator.clipboard'), 'shared scripts provide language and copy interactions');
check(sharedScripts.includes('.htab') && sharedScripts.includes('.hpanel'), 'home install tabs have shared interaction wiring');
check(pages.home.includes('role="tablist"') && pages.home.includes('aria-selected="true"'), 'home install tabs expose accessible tab semantics');
check(pages.home.includes('Mobile navigation') && pages.home.includes('<details class="mobile-nav">'), 'shared header exposes mobile navigation');

check(pages.usage.includes('Product demo') && pages.usage.includes('产品演示'), 'usage dashboard labels sample values as demo data');
check(pages.usage.includes('usage.jsonl') && pages.usage.includes('voltui usage --since 30d'), 'usage page connects the dashboard to the local ledger and CLI');
check(pages.usage.includes('~/.voltui/usage/usage.jsonl') && !pages.usage.includes('~/.config/voltui/usage/usage.jsonl'), 'usage page publishes the real default ledger path');
check(pages.usage.includes('desktop planned') && pages.usage.includes('桌面接入规划中'), 'usage page keeps the desktop dashboard boundary explicit');
check(pages.usage.includes('GPU utilization') && pages.usage.includes('当前不宣称支持'), 'usage page states the GPU and cluster monitoring boundary');
check(pages.usage.includes('By model') && pages.usage.includes('by day · model · source · surface'), 'usage page exposes product-backed aggregation dimensions');

check(pages.capabilities.includes('CodeGraph') && pages.capabilities.includes('/rewind') && pages.capabilities.includes('.mcp.json'), 'capabilities page covers code intelligence, rollback and MCP');
check(pages.capabilities.includes('browser_control') && pages.capabilities.includes('VOLTUI.md'), 'capabilities page covers host automation and memory');

check(pages.enterprise.includes('Prepared package') && pages.enterprise.includes('Internal model gateway'), 'enterprise page explains the deployment path');
check(pages.enterprise.includes('White-label and OEM') && pages.enterprise.includes('Credential protection'), 'enterprise page covers branding and credential controls');
check(!pages.home.includes('Bake the API endpoint and key') && pages.home.includes('without hardcoding keys'), 'home deployment copy avoids hardcoded credentials');

check(pages.docs.includes('data-copy="npm i -g voltui@next"'), 'docs publishes the Go 1.x install command');
check(pages.docs.includes('id="usage"') && pages.docs.includes('voltui usage --json'), 'docs includes the local usage report reference');
for (const href of attributeValues(pages.docs, 'href').filter((href) => href.startsWith('#'))) {
  check(ids(pages.docs).has(href.slice(1)), `docs anchor ${href} resolves`);
}

const notFoundHead = pages.notFound.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
check(/<meta name="robots" content="noindex"\s*\/?\s*>/.test(notFoundHead), '404 remains noindex');
check(
  sharedCss.includes('.usage-console')
    && sharedCss.includes('.deployment-map')
    && /@media\s*\((?:max-width:\s*620px|width<=620px)\)/.test(sharedCss),
  'new product pages ship responsive styles',
);
check(!allPages.some((html) => html.includes('/blob/main-v2/')), 'documentation links avoid the retired main-v2 branch');

if (failures.length > 0) {
  console.error(`\nSite feature smoke failed: ${failures.length} assertion(s).`);
  process.exit(1);
}

console.log('\nSite feature smoke passed.');
