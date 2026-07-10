#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(root, process.env.VOLTUI_SITE_DIST || 'site/dist');
const pages = {
  home: await readFile(path.join(dist, 'index.html'), 'utf8'),
  docs: await readFile(path.join(dist, 'docs/index.html'), 'utf8'),
  notFound: await readFile(path.join(dist, '404.html'), 'utf8'),
};

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
  return path.join(dist, pathname.replace(/^\/voltui\/?/, ''));
}

async function referencedAssets(html, tag, attribute) {
  const pattern = new RegExp(`<${tag}\\b[^>]*${attribute}="([^"]+)"[^>]*>`, 'g');
  const extension = tag === 'link' ? '.css' : '.js';
  const urls = [...html.matchAll(pattern)]
    .map((match) => match[1])
    .filter((url) => new URL(url, 'https://example.test').pathname.endsWith(extension));
  return Promise.all(urls.map(async (url) => readFile(assetPath(url), 'utf8')));
}

const homeIds = ids(pages.home);
const docsIds = ids(pages.docs);
const docsHead = pages.docs.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
const notFoundHead = pages.notFound.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
const docsCss = (await referencedAssets(pages.docs, 'link', 'href')).join('\n');
const docsScripts = (await referencedAssets(pages.docs, 'script', 'src')).join('\n');
const notFoundScripts = (await referencedAssets(pages.notFound, 'script', 'src')).join('\n');

check(
  /<body[^>]*data-lang="en"[^>]*data-title-en="Docs — VoltUI"[^>]*data-title-zh="文档 — VoltUI"/.test(pages.docs),
  'docs exposes initial language and bilingual title data on body',
);
check(
  /body\[data-lang=(?:"en"|en)\] \.l-zh/.test(docsCss)
    && /body\[data-lang=(?:"zh"|zh)\] \.l-en/.test(docsCss)
    && /display\s*:\s*none!important/.test(docsCss),
  'docs CSS renders exactly one language at a time',
);
check(
  docsScripts.includes('voltui-lang') && docsScripts.includes('navigator.clipboard'),
  'docs loads language and copy interactions',
);
check(
  pages.docs.includes('data-copy="npm i -g voltui"'),
  'docs publishes a copyable install command',
);
const multilineCodeBlocks = [...pages.docs.matchAll(/<pre class="codeblock"[^>]*>([\s\S]*?)<\/pre>/g)];
check(
  multilineCodeBlocks.length >= 5 && multilineCodeBlocks.some((match) => match[1].includes('\n')),
  'docs preserves multiline command and configuration examples',
);
check(
  /<meta name="robots" content="noindex"\s*\/?\s*>/.test(notFoundHead),
  '404 injects noindex through the named head slot',
);
check(
  /<body[^>]*data-lang="en"[^>]*data-title-en="Page not found — VoltUI"[^>]*data-title-zh="页面不存在 — VoltUI"/.test(pages.notFound)
    && notFoundScripts.includes('voltui-lang'),
  '404 exposes bilingual metadata and loads language interactions',
);
check(
  docsCss.includes('.docs-layout')
    && docsCss.includes('.not-found-page')
    && /@media\s*\((?:max-width:\s*900px|width<=900px)\)/.test(docsCss),
  'docs and 404 ship scoped responsive layout styles',
);

for (const href of attributeValues(pages.docs, 'href')) {
  if (href.startsWith('#')) {
    check(docsIds.has(href.slice(1)), `docs anchor ${href} resolves`);
  } else if (href.startsWith('/voltui/#')) {
    check(homeIds.has(href.split('#')[1]), `home anchor ${href} resolves`);
  }
}

check(!pages.docs.includes('/blob/main-v2/'), 'fork documentation links use the real default branch');
check(!docsHead.includes('name="robots" content="noindex"'), 'docs remains indexable');

if (failures.length > 0) {
  console.error(`\nSite feature smoke failed: ${failures.length} assertion(s).`);
  process.exit(1);
}

console.log('\nSite feature smoke passed.');
