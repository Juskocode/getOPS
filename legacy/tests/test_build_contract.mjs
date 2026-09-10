import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const project = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', dist), 'utf8'));
const distIndex = await readFile(new URL('index.html', dist), 'utf8');
const rootIndex = await readFile(new URL('index.html', project), 'utf8');
const serviceWorker = await readFile(new URL('service-worker.js', dist), 'utf8');

test('production build emits content-addressed assets', async () => {
  assert.match(manifest.release, /^[a-f0-9]{16}$/);
  assert.match(manifest.assets.css, /^app\.[a-f0-9]{16}\.css$/);
  assert.match(manifest.assets.js, /^app\.[a-f0-9]{16}\.js$/);
  await stat(new URL(`assets/${manifest.assets.css}`, dist));
  await stat(new URL(`assets/${manifest.assets.js}`, dist));
  await stat(new URL(`assets/${manifest.assets.css}.gz`, dist));
  await stat(new URL(`assets/${manifest.assets.js}.gz`, dist));
});

test('production document has external scripts and no third-party runtime dependency', () => {
  assert.doesNotMatch(distIndex, /<style>/);
  assert.doesNotMatch(distIndex, /<script(?![^>]*\bsrc=)/);
  assert.doesNotMatch(distIndex, /unpkg|jsdelivr|cdnjs/);
  assert.match(distIndex, new RegExp(`\\./assets/${manifest.assets.css.replaceAll('.', '\\.')}`));
  assert.match(distIndex, new RegExp(`\\./assets/${manifest.assets.js.replaceAll('.', '\\.')}`));
  assert.doesNotMatch(distIndex, /script-src[^;]*unsafe-inline/);
  assert.match(rootIndex, /\.\/dist\/assets\/app\.[a-f0-9]{16}\.js/);
});

test('service worker caches the shell and bypasses every API request', () => {
  assert.match(serviceWorker, new RegExp(`trading-ops-${manifest.release}`));
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(serviceWorker, /event\.request\.mode === 'navigate'/);
  assert.equal(manifest.cache.api, 'never');
});

test('bundled application includes persistence, icons, and worker registration', async () => {
  const app = await readFile(new URL(`assets/${manifest.assets.js}`, dist), 'utf8');
  assert.match(app, /window\.opsPersistence/);
  assert.match(app, /navigator\.serviceWorker\.register/);
  assert.match(app, /createIcons/);
  assert.doesNotMatch(app, /https:\/\/unpkg\.com/);
});
