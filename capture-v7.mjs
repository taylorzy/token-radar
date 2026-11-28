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
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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

  async function navigate(hash, selector) {
    await command('Page.navigate',{url:'about:blank'});
    await command('Page.navigate',{url:url+hash});
    for(let n=0;n<100;n++){
      if(await evalPage('!!document.querySelector('+JSON.stringify(selector)+')')) return;
      await sleep(80);
    }
    throw Error('Missing '+selector);
  }
  await navigate('', '.decision-cover');
  assert.equal(await evalPage("document.querySelectorAll('tbody tr').length"),182);
  await shot('1-board.png');
  await navigate('#tab=research','.table-wrap');
  assert.ok(await evalPage("document.body.innerText.includes('Valuation on unseen')"));
  await shot('2-validation.png');
  for(const [slug,name] of [['shift-defi','3-participation.png'],['extended-perps','4-protocol.png']]){
    await navigate('#p='+slug,'dialog[open]');
    await evalPage("Array.from(document.querySelectorAll('dialog nav button')).find(b=>b.textContent==='Decision').click()");
    assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('V6 default #')"));
    await shot(name);
  }
  await navigate('#p=axis','dialog[open]');
  await evalPage("Array.from(document.querySelectorAll('dialog nav button')).find(b=>b.textContent==='Decision').click()");
  assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('37 modeled')"));
  await evalPage(`const v=document.querySelector('[aria-label="Exit scenario"]'); v.value='Instant';v.dispatchEvent(new Event('change'))`);
  assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('transactions $11.00')"));
  assert.deepEqual(jsErrors,[]);
  console.log('Verified offline board, validation, decision details and instant-exit selection.');
} finally {
  socket?.close();
  browser.kill();
  await sleep(500);
  const {relative,isAbsolute}=await import('node:path');
  const child=relative(tmpdir(),profile);
  if (!isAbsolute(child) && child.startsWith('radar-m9-browser-') && !child.includes('..')){
    try {rmSync(profile,{recursive:true,force:true});} catch {}
  }
}
