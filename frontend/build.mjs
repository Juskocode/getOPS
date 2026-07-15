import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('./source.fragment.html', import.meta.url);
const cssUrl = new URL('./base.css', import.meta.url);
const persistenceUrl = new URL('./persistence.js', import.meta.url);
const lucideUrl = new URL('../node_modules/lucide/dist/umd/lucide.min.js', import.meta.url);
const distUrl = new URL('../dist/', import.meta.url);
const assetsUrl = new URL('../dist/assets/', import.meta.url);
const rootOutputUrl = new URL('../index.html', import.meta.url);
const distOutputUrl = new URL('../dist/index.html', import.meta.url);
const CACHE_SCHEMA = '2';

const [fragment, baseCss, persistence, lucide] = await Promise.all([
  readFile(sourceUrl, 'utf8'),
  readFile(cssUrl, 'utf8'),
  readFile(persistenceUrl, 'utf8'),
  readFile(lucideUrl, 'utf8'),
]);

const styleMatch = fragment.match(/\n\s*<style>([\s\S]*?)<\/style>/);
const scriptMatches = [...fragment.matchAll(/\n\s*<script>([\s\S]*?)<\/script>/g)];
if (!styleMatch || scriptMatches.length !== 1) {
  throw new Error('Expected exactly one fragment style and one fragment script block.');
}

const appMarkup = fragment.replace(styleMatch[0], '').replace(scriptMatches[0][0], '');
const appCss = [
  baseCss,
  'html > body { width: min(100%, 1560px); margin: 0 auto; padding: 16px; }',
  styleMatch[1],
].join('\n');
const appJs = [
  persistence,
  lucide,
  scriptMatches[0][1],
  `if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {}), { once: true });
  }`,
].join('\n');

function digest(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

const cssName = `app.${digest(appCss)}.css`;
const jsName = `app.${digest(appJs)}.js`;
const release = digest(`${CACHE_SCHEMA}:${cssName}:${jsName}:${appMarkup}`);

function assetHref(name, rootDocument = false) {
  return rootDocument ? `./dist/assets/${name}` : `./assets/${name}`;
}

function csp() {
  return "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'";
}

function documentFor(rootDocument = false) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    `<meta name="application-version" content="${release}">`,
    '<link rel="icon" href="data:,">',
    `<meta http-equiv="Content-Security-Policy" content="${csp()}">`,
    '<title>Trading Ops Ascent</title>',
    `<link rel="stylesheet" href="${assetHref(cssName, rootDocument)}">`,
    `<script defer src="${assetHref(jsName, rootDocument)}"></script>`,
    '</head>',
    '<body>',
    appMarkup,
    '</body>',
    '</html>',
  ].join('\n');
}

const sameOriginAssets = [`/assets/${cssName}`, `/assets/${jsName}`];
const serviceWorker = `const CACHE = 'trading-ops-${release}';
const APP_SHELL = ['/', '/index.html', ...${JSON.stringify(sameOriginAssets)}];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('trading-ops-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (!response.ok) throw new Error('Navigation failed');
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put('/index.html', copy));
      return response;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (!response.ok) throw new Error('Asset request failed');
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    })));
  }
});
`;

const manifest = JSON.stringify({
  release,
  assets: { css: cssName, js: jsName },
  cache: { shell: `trading-ops-${release}`, api: 'never' },
}, null, 2) + '\n';

await rm(distUrl, { recursive: true, force: true });
await mkdir(assetsUrl, { recursive: true });

const outputs = [
  [new URL(cssName, assetsUrl), appCss],
  [new URL(jsName, assetsUrl), appJs],
  [distOutputUrl, documentFor(false)],
  [rootOutputUrl, documentFor(true)],
  [new URL('../dist/service-worker.js', import.meta.url), serviceWorker],
  [new URL('../dist/asset-manifest.json', import.meta.url), manifest],
];

for (const [url, content] of outputs) {
  await writeFile(url, content, 'utf8');
  if (/\.(css|js|html)$/.test(url.pathname)) {
    await writeFile(new URL(`${url.href}.gz`), gzipSync(content, { level: 9 }));
  }
}

console.log(JSON.stringify({ index: distOutputUrl.pathname, release, css: cssName, js: jsName }));
