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
    if (!shots || (process.argv.includes('--detail-only') && name !== '4-protocol.png')) return;
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
  await navigate('', '.ranked-table tr[data-slug]');
  const ranks = () => evalPage("Array.from(document.querySelectorAll('.ranked-table tbody tr'), r => r.dataset.slug)");
  assert.deepEqual(await ranks(), await evalPage('RADAR.rows.map(r=>r.slug)'));
  assert.equal(await evalPage("document.querySelector('[aria-sort=descending] button').dataset.sort"),'implied');
  assert.ok(await evalPage("document.querySelector('.ranked-table tbody tr').getBoundingClientRect().bottom < innerHeight"));
  await shot('1-board.png');
  await evalPage("document.querySelector('#input-columns').click(); document.querySelector('[data-sort=tvl]').click()");
  assert.deepEqual(await ranks(),await evalPage('RADAR.rows.slice().sort((a,b)=>b.tvl_usd-a.tvl_usd || a.slug.localeCompare(b.slug)).map(r=>r.slug)'));
  await evalPage("document.querySelector('.market-disclosure').open=true;const mode=document.querySelector('#market-mode');mode.value='consensus';mode.dispatchEvent(new Event('change'))");
  assert.ok(await evalPage("document.querySelector('.market-disclosure').open"));
  await navigate('#tab=research','#intelligence');
  await shot('2-validation.png');
  await navigate('#route=Documented+route','.ranked-table tr[data-slug]');
  const official = await evalPage('RADAR.rows.map(({slug,rank,implied_value_usd})=>({slug,rank,value:implied_value_usd}))');
  for (let i=1;i<official.length;i++) assert.ok(official[i-1].value>=official[i].value);
  const documented = await evalPage("RADAR.rows.filter(r=>r.farm_steps[0].startsWith('Documented route.')).map(r=>[r.slug,'#'+r.rank])");
  assert.equal(documented.length,54);
  assert.deepEqual(await evalPage("Array.from(document.querySelectorAll('.ranked-table tr[data-slug]'),r=>[r.dataset.slug,r.querySelector('.official-number').textContent])"),documented);
  for (const slug of ['shift-defi','usdd']) await evalPage(`document.querySelector('[data-pin="${slug}"]').click()`);
  assert.equal(await evalPage("document.querySelectorAll('#comparison tbody tr').length"),2);
  await shot('3-participation.png');
  await navigate('#q=lofty','.ranked-table tr[data-slug]');
  await evalPage("document.querySelector('.ranked-table tbody tr td:last-child button').click()");
  assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('2.5% on purchases and 3% on sales')"));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await evalPage("document.querySelector('.farm-calculator').closest('details').querySelector('summary').click();Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Load example assumptions').click()");
  assert.deepEqual(await evalPage("Array.from(document.querySelectorAll('.farm-calculator input'),x=>x.value)"),['1000','55','30','5','1','20','']);
  assert.equal(await evalPage("document.querySelector('.break-even-value strong').innerText"),'$79.11');
  assert.ok(await evalPage("['.execution-steps','.farm-calculator','.scenario-result'].every(s=>{const r=document.querySelector(s).getBoundingClientRect(),d=document.querySelector('dialog').getBoundingClientRect();return r.height>0 && r.top>=d.top && r.bottom<=Math.min(d.bottom,innerHeight)})"));
  await shot('4-protocol.png');
  await evalPage("const fee=document.querySelectorAll('.farm-calculator input')[1];fee.value=65;fee.dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evalPage("document.querySelector('.break-even-value strong').innerText"),'$89.11');
  await evalPage("Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Use scenario on board').click();document.querySelector('dialog').close()");
  assert.ok(await evalPage("document.querySelector('.ranked-table').innerText.includes('$89.11 break-even')"));
  await navigate('#tab=opportunity','.decision-cover');
  assert.deepEqual(await ranks(),await evalPage('RADAR_DECISIONS.decisions.slice().sort((a,b)=>a.opportunityRank-b.opportunityRank).map(r=>r.slug)'));
  await evalPage("Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent==='Valuation Ranking').click()");
  assert.deepEqual(await ranks(),await evalPage('RADAR.rows.map(r=>r.slug)'));
  await navigate('#p=axis','dialog[open]');
  await evalPage("Array.from(document.querySelectorAll('dialog nav button')).find(b=>b.textContent==='Decision').click()");
  assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('37 modeled')"));
  await evalPage(`const v=document.querySelector('[aria-label="Exit scenario"]'); v.value='Instant';v.dispatchEvent(new Event('change'))`);
  assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('transactions $11.00')"));
  await evalPage("const editor=document.querySelector('.decision-inputs');editor.closest('details').open=true;const capital=editor.querySelector('input');capital.value=2000;capital.dispatchEvent(new Event('input',{bubbles:true}));Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Apply assumptions to all opportunities').click();document.querySelector('dialog').close()");
  await evalPage("Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent==='Opportunity Ranking').click()");
  assert.ok(await evalPage("document.querySelector('.decision-cover').innerText.includes('$2,000.00 capital')"));
  await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:false});
  await navigate('', '.ranked-table tbody tr');
  assert.ok(await evalPage('document.documentElement.scrollWidth <= innerWidth'));
  assert.ok(await evalPage("document.querySelector('.ranked-table tbody tr td:nth-child(5)').getBoundingClientRect().right<=innerWidth"));
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
