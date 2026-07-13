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
check(pages.home.includes('Mobile navigation') && pages.home.includes('<details class="mobile-nav">'), 'shared header exposes mobile navigation');
check(
  pages.home.indexOf('Capabilities') < pages.home.indexOf('Enterprise deployment')
    && pages.home.indexOf('Enterprise deployment') < pages.home.indexOf('Security &amp; usage'),
  'shared navigation prioritizes capabilities, enterprise deployment, security and usage',
);

check(pages.home.includes('enterprise-hero') && pages.home.includes('Private-network workspace'), 'home opens with an enterprise split hero and deployment overview');
check(pages.home.includes('single-binary CLI') && pages.home.includes('prepared desktop client'), 'home distinguishes the Go CLI from the prepared Wails desktop client');
check(pages.home.includes('Public internet is a preparation path') && pages.home.includes('controlled import'), 'home explains the enterprise network preparation topology');
check(pages.home.includes('Platform administrator') && pages.home.includes('Security / compliance') && pages.home.includes('Developer'), 'home includes an enterprise role matrix');
check(pages.home.includes('Typical scenarios') && pages.home.includes('Current product boundary'), 'home includes scenarios and explicit product boundaries');
check(pages.home.includes('Three-step rollout') && pages.home.includes('Pilot, verify and distribute'), 'home ends with a three-step enterprise rollout');
check(!pages.home.includes('npm i -g') && !pages.home.includes('brew install'), 'home no longer leads with public package-manager installation');

check(pages.usage.includes('Product demo') && pages.usage.includes('产品演示'), 'usage dashboard labels sample values as demo data');
check(pages.usage.includes('usage.jsonl') && pages.usage.includes('voltui usage --since 30d'), 'usage page connects the dashboard to the local ledger and CLI');
check(pages.usage.includes('~/.voltui/usage/usage.jsonl') && !pages.usage.includes('~/.config/voltui/usage/usage.jsonl'), 'usage page publishes the real default ledger path');
check(pages.usage.includes('desktop planned') && pages.usage.includes('桌面接入规划中'), 'usage page keeps the desktop dashboard boundary explicit');
check(pages.usage.includes('GPU utilization') && pages.usage.includes('当前不宣称支持'), 'usage page states the GPU and cluster monitoring boundary');
check(pages.usage.includes('By model') && pages.usage.includes('by day · model · source · surface'), 'usage page exposes product-backed aggregation dimensions');

check(pages.capabilities.includes('CodeGraph') && pages.capabilities.includes('/rewind') && pages.capabilities.includes('.mcp.json'), 'capabilities page covers code intelligence, rollback and MCP');
check(pages.capabilities.includes('browser_control') && pages.capabilities.includes('VOLTUI.md'), 'capabilities page covers host automation and memory');
check(pages.capabilities.includes('Optional runtime') && pages.capabilities.includes('core repository work does not depend on it'), 'capabilities keeps the CodeGraph offline boundary explicit');

check(pages.enterprise.includes('Internal distribution') && pages.enterprise.includes('Internal model gateway'), 'enterprise page separates preparation, distribution and runtime');
check(pages.enterprise.includes('Single Go binary') && pages.enterprise.includes('Prepared application'), 'enterprise page distinguishes CLI and desktop delivery');
check(pages.enterprise.includes('Credential source') && pages.enterprise.includes('do not bake keys into packages'), 'enterprise page covers credential-safe preparation');
check(pages.enterprise.includes('CodeGraph') && pages.enterprise.includes('install or pre-cache'), 'enterprise page states the optional CodeGraph runtime boundary');
check(!pages.home.includes('complete centralized enterprise suite') || pages.home.includes('not presented as a complete centralized enterprise suite'), 'home does not claim a complete centralized enterprise suite');

check(pages.docs.includes('data-copy="npm i -g voltui@next"'), 'docs publishes the Go 1.x install command');
check(pages.docs.includes('id="offline"') && pages.docs.includes('Enterprise offline preparation'), 'docs retains public install methods and adds enterprise offline preparation');
check(pages.docs.includes('CodeGraph is optional') && pages.docs.includes('pre-cache'), 'docs explains the optional CodeGraph offline preparation');
check(pages.docs.includes('id="usage"') && pages.docs.includes('voltui usage --json'), 'docs includes the local usage report reference');
for (const href of attributeValues(pages.docs, 'href').filter((href) => href.startsWith('#'))) {
  check(ids(pages.docs).has(href.slice(1)), `docs anchor ${href} resolves`);
}

const notFoundHead = pages.notFound.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
check(/<meta name="robots" content="noindex"\s*\/?\s*>/.test(notFoundHead), '404 remains noindex');
check(
  sharedCss.includes('.usage-console')
    && sharedCss.includes('.enterprise-hero')
    && sharedCss.includes('.topology-flow')
    && sharedCss.includes('.mobile-rail')
    && /@media\s*\((?:max-width:\s*620px|width<=620px)\)/.test(sharedCss),
  'enterprise-first product pages ship responsive styles',
);
check(!allPages.some((html) => html.includes('/blob/main-v2/')), 'documentation links avoid the retired main-v2 branch');

if (failures.length > 0) {
  console.error(`\nSite feature smoke failed: ${failures.length} assertion(s).`);
  process.exit(1);
}

console.log('\nSite feature smoke passed.');
