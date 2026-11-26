import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const [edge, output, shots] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), 'radar-m9-browser-'));
const browser = spawn(edge, ['--headless', '--disable-gpu', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--no-first-run', '--remote-debugging-port=0',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
  '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; !existsSync(portFile) && i < 100; i++) await sleep(100);
  const [port] = readFileSync(portFile, 'utf8').split('\n');
  const targets = await (await fetch('http://localhost:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    socket.addEventListener('open', ok, { once: true });
    socket.addEventListener('error', fail, { once: true });
  });
  const pending = new Map();
  const jsErrors = [];
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return;
    const { ok, fail, timer } = pending.get(m.id);
    pending.delete(m.id);
    clearTimeout(timer);
    if (m.error) fail(new Error(JSON.stringify(m.error))); else ok(m.result);
  });
  let id = 0;
  function command(method, params = {}) {
    return new Promise((ok, fail) => {
      const request = ++id;
      const timer = setTimeout(() => { pending.delete(request); fail(new Error(method + ' timed out')); }, 10000);
      pending.set(request, { ok, fail, timer });
      socket.send(JSON.stringify({ id: request, method, params }));
    });
  }
  async function evalPage(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function shot(name) {
    if (!shots) return;
    const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(data, 'base64');
    assert.ok(bytes.length > 1000 && bytes.length <= 524288);
    const path = join(shots, name);
    writeFileSync(path, bytes);
    assert.deepEqual(readFileSync(path), bytes);
  }
  await command('Page.enable');
  if (process.env.RADAR_BROWSER_COVERAGE) {
    await command('Profiler.enable');
    await command('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  }
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  const url = pathToFileURL(resolve(output, 'dashboard/index.html')).href;
  await command('Page.navigate', { url: url + '#p=usdd' });
  for (let i = 0; i < 100 && !await evalPage("document.querySelectorAll('tbody tr').length"); i++) await sleep(100);
  assert.ok(await evalPage("document.querySelector('dialog').open && document.querySelector('dialog').innerText.includes('USDD')"));
  await evalPage("document.querySelector('dialog').close()");
  const expected = await evalPage('window.RADAR.rows.length');
  assert.equal(await evalPage("document.querySelectorAll('tbody tr').length"), expected);
  if (!process.env.RADAR_BROWSER_COVERAGE || expected === 182 && await evalPage('!!window.RADAR.model.experimental')) {
    assert.ok(await evalPage("document.body.innerText.includes('V1 TVL-only Huber')"));
  }
  await shot('1-board.png');
  await evalPage("[...document.querySelectorAll('.protocol-link')].find(b => b.textContent === 'USDD').click()");
  assert.ok(await evalPage("document.querySelector('dialog').open"));
  if (await evalPage('!!window.RADAR.uncertainty')) assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('peer-error range')"));
  if (await evalPage('!!window.RADAR.model.experimental')) assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('Experimental fit')"));
  assert.ok(await evalPage("!document.querySelector('dialog [role=alert]')"));
  assert.ok(await evalPage("[...document.querySelectorAll('dialog button')].some(b => b.textContent.includes('Load example assumptions'))"));
  await evalPage("[...document.querySelectorAll('dialog button')].find(b => b.textContent.includes('Load example assumptions')).click()");
  assert.ok(await evalPage("document.querySelector('.scenario-result').textContent.includes('Break-even reward $')"));
  await shot('2-detail.png');
  assert.ok(await evalPage("(() => { const x = document.querySelector('.farm-calculator input'); x.value = '-1'; x.dispatchEvent(new Event('input', {bubbles:true})); return document.querySelector('.scenario-result').textContent.includes('non-negative'); })()"));
  await evalPage("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.ok(await evalPage("!document.querySelector('dialog').open"));
  await evalPage("(() => {const s = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'Documented route')); s.value = 'Documented route'; s.dispatchEvent(new Event('change'));})()");
  assert.equal(await evalPage("document.querySelectorAll('tbody tr').length"), 9);
  await shot('3-filtered.png');
  await evalPage("[...document.querySelectorAll('button')].find(b => b.textContent === 'Clear filters').click()");
  assert.equal(await evalPage("document.querySelectorAll('tbody tr').length"), expected);
  await evalPage("(() => {const s = document.querySelector('input[type=search]'); s.value='zzzz_no_match'; s.dispatchEvent(new Event('input'));})()");
  assert.equal(await evalPage("document.querySelectorAll('.protocol-link').length"), 0);
  await evalPage("(() => {const s = document.querySelector('input[type=search]'); s.value='Nuva'; s.dispatchEvent(new Event('input'));})()");
  assert.ok(await evalPage("[...document.querySelectorAll('.protocol-link')].some(b => b.textContent.toLowerCase() === 'nuva')"));
  await evalPage("[...document.querySelectorAll('button')].find(b => b.textContent === 'Clear filters').click()");
  for (const key of ['name', 'tvl', 'growth', 'implied', 'rank']) {
    await evalPage(`document.querySelector('[data-sort=${key}]').click()`);
    assert.equal(await evalPage("document.querySelectorAll('.protocol-link').length"), expected);
    await evalPage(`document.querySelector('[data-sort=${key}]').click()`);
  }
  await evalPage("[...document.querySelectorAll('button')].find(b => /live-token/i.test(b.textContent)).click()");
  assert.equal(await evalPage("document.querySelectorAll('tbody tr').length"), await evalPage('window.RADAR.live.length'));
  await evalPage("document.querySelector('[data-sort=cap]').click()");
  assert.ok(await evalPage("window.location.hash.includes('tab=live')"));
  if (process.env.RADAR_BROWSER_COVERAGE) {
    const { result } = await command('Profiler.takePreciseCoverage');
    const dashboard = result.filter(entry => entry.url.endsWith('/dashboard/app.js'));
    assert.equal(dashboard.length, 1);
    dashboard.forEach(entry => { entry.url = pathToFileURL(join(process.cwd(), 'dashboard', 'app.js')).href; });
    writeFileSync(process.env.RADAR_BROWSER_COVERAGE, JSON.stringify({ result: dashboard }));
  }
  assert.deepEqual(jsErrors, []);
  console.log(`Offline browser: ${expected} rows, filters, sorting, USDD detail and calculator, 9 documented routes, zero JavaScript errors`);
} finally {
  socket?.close();
  browser.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Browser may still be releasing temporary files. */ }
}
