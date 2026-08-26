#!/usr/bin/env node
/*
 * tools/render-card.mjs — renders tools/og-card.html to og-card.png at 1200x630.
 *
 * Self-contained on purpose: it starts its own static server and its own
 * isolated headless Chrome, then tears both down. No dependencies, no global
 * state, and it never touches your real browser profile.
 *
 * Chrome's old `--screenshot` flag is gone in current builds (the old headless
 * mode it belonged to was removed), so this drives DevTools directly. It also
 * waits on document.fonts.ready before shooting — without that the card
 * renders in Georgia and the whole point of the design is lost.
 *
 *   node tools/render-card.mjs
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const PAGE = '/tools/og-card.html';
const OUT = join(ROOT, 'og-card.png');
const WIDTH = 1200;
const HEIGHT = 630;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => existsSync(p));
}

const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0]));
    // Refuse anything that climbs out of the repo.
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

const port = await new Promise((done) => {
  server.listen(0, '127.0.0.1', () => done(server.address().port));
});

const chromePath = findChrome();
if (!chromePath) {
  console.error('No Chrome or Chromium found. Set CHROME=/path/to/chrome and retry.');
  server.close();
  process.exit(1);
}

const profile = await mkdtemp(join(tmpdir(), 'og-card-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

async function cleanup(code) {
  try { chrome.kill(); } catch {}
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}

// Chrome prints its DevTools endpoint to stderr; port 0 means we must read it
// back rather than assume one, so two renders can never collide.
const wsUrl = await new Promise((done, fail) => {
  let buf = '';
  const timer = setTimeout(() => fail(new Error('timed out waiting for DevTools')), 20000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/ws:\/\/\S+/);
    if (m) { clearTimeout(timer); done(m[0]); }
  });
  chrome.on('exit', (c) => fail(new Error('Chrome exited early (code ' + c + ')')));
}).catch(async (e) => { console.error(e.message); await cleanup(1); });

const ws = new WebSocket(wsUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const target = await send('Target.createTarget', { url: 'about:blank' });
const attached = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
const S = attached.result.sessionId;

await send('Page.enable', {}, S);
await send('Runtime.enable', {}, S);
await send('Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, S);
await send('Page.navigate', { url: `http://127.0.0.1:${port}${PAGE}` }, S);

await new Promise((r) => setTimeout(r, 1200));
const fonts = await send('Runtime.evaluate',
  { expression: 'document.fonts.ready.then(() => document.fonts.status)', awaitPromise: true, returnByValue: true }, S);
if (fonts.result?.result?.value !== 'loaded') {
  console.error('Fonts did not finish loading; refusing to render a fallback-face card.');
  await cleanup(1);
}
await new Promise((r) => setTimeout(r, 400));

const shot = await send('Page.captureScreenshot',
  { format: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } }, S);
const png = Buffer.from(shot.result.data, 'base64');
await writeFile(OUT, png);
console.log(`og-card.png written — ${WIDTH}x${HEIGHT}, ${png.length} bytes`);

ws.close();
await cleanup(0);
