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
  let port;
  for (let i=0; !port && i<100; i++) {
    try { port=readFileSync(portFile,'utf8').split('\n')[0].trim(); }
    catch(error) { if (!['ENOENT','EBUSY'].includes(error.code)) throw error; }
    if (!port) await sleep(100);
  }
  assert.ok(port,'Edge debugging endpoint started');
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
  await command('Page.navigate', { url: url + '#p=usdd' });
  for (let i = 0; i < 100 && !await evalPage("document.querySelectorAll('table:not(dialog table) > tbody > tr').length"); i++) await sleep(100);
  assert.ok(await evalPage("document.querySelector('dialog').open && document.querySelector('dialog').innerText.includes('USDD')"));
  await evalPage("document.querySelector('dialog').close()");
  const expected = await evalPage('window.RADAR.rows.length');
  assert.equal(await evalPage("document.querySelectorAll('table:not(dialog table) > tbody > tr').length"), expected);
  const m11 = await evalPage('!!window.RADAR_ACCOUNTING');
  if (m11) {
    assert.ok(await evalPage("document.body.innerText.includes('Primary valuation') && document.body.innerText.includes('Ledger reconciled')"));
  } else if (!process.env.RADAR_BROWSER_COVERAGE || expected === 182 && await evalPage('!!window.RADAR.model.experimental')) {
    assert.ok(await evalPage("document.body.innerText.includes('V1 TVL-only Huber')"));
  }
  if (m11) {
    assert.equal(await evalPage("document.querySelectorAll('.landscape [role=button]').length"), expected);
    await evalPage("document.querySelector('.model summary').click()");
    assert.ok(await evalPage("document.querySelector('.model').open && document.querySelector('.formula').innerText.includes('centered asinh')"));
    await evalPage("document.querySelector('.model summary').click()");
    await evalPage("document.querySelector('.landscape [role=button]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))");
    assert.ok(await evalPage("document.querySelector('dialog').open"));
    await evalPage("document.querySelector('dialog').close()");
  }
  assert.equal(await evalPage("document.querySelector('tr[data-slug]').dataset.slug"),await evalPage("RADAR_DECISIONS.decisions[0].slug"));
  await evalPage("window.scrollTo(0,0)");
  await command('Emulation.setDeviceMetricsOverride', {width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  const visibleRows = await evalPage("Array.from(document.querySelectorAll('.ranked-table tbody tr')).filter(row=>{const box=row.getBoundingClientRect();return box.top>=0 && box.bottom<=innerHeight;}).length");
  assert.ok(visibleRows>=6, 'Primary capture has '+visibleRows+' complete ranked rows');
  console.log('Primary capture: '+visibleRows+' complete ranked rows');
  assert.ok(await evalPage("document.querySelector('.decision-totals').textContent.includes('2 reverse in downside')"));
  await shot('1-board.png');
  await command('Emulation.setDeviceMetricsOverride', {width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await evalPage("Array.from(document.querySelectorAll('.decision-card')).find(b=>b.innerText.includes('Sentora')).click()");
  assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('$5.68') && document.querySelector('dialog').innerText.includes('-$29.08')"));
  if (!process.env.RADAR_KEEP_REVIEW_SHOTS) await shot('4-protocol.png');
  await evalPage("document.querySelector('.decision-detail details').open=true; const weight=document.querySelectorAll('.decision-inputs input')[7];weight.value='0';weight.dispatchEvent(new Event('input'));");
  assert.ok(await evalPage("document.querySelector('.decision-detail').innerText.includes('Below break-even')"));
  await evalPage("document.querySelector('.decision-detail details button').click();document.querySelector('dialog').close()");
  assert.ok(await evalPage("document.querySelector('.decision-cover').innerText.includes('0% joint success')"));
  await evalPage("document.querySelector('.decision-card').click();document.querySelector('.decision-detail details').open=true;document.querySelectorAll('.decision-detail details button')[1].click();document.querySelector('dialog').close()");

  if (m11) {
    await evalPage("document.querySelector('.coverage-toggle').click()");
    assert.equal(await evalPage("document.querySelectorAll('.landscape .plot-point').length"), 32);
    await evalPage("document.querySelector('.coverage-toggle').click()");
  }
  await evalPage("const picker=document.querySelector('#market-mode');picker.value='documented';picker.dispatchEvent(new Event('change'))");
  assert.ok(await evalPage("document.querySelector('.landscape').innerText.includes('documented participation route')"));
  await evalPage("const picker2=document.querySelector('#market-mode');picker2.value='primary';picker2.dispatchEvent(new Event('change'))");
  await evalPage("[...document.querySelectorAll('.protocol-link')].find(b => b.textContent === 'USDD').click()");
  assert.ok(await evalPage("document.querySelector('dialog').open"));
  if (await evalPage('!!window.RADAR.uncertainty')) assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('peer-error range')"));
  if (await evalPage('!!window.RADAR.model.experimental')) assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('Experimental fit')"));
  assert.ok(await evalPage("!document.querySelector('dialog [role=alert]')"));
  await evalPage("[...document.querySelectorAll('dialog nav button')].find(b=>b.textContent==='Farming economics').click()");
  assert.ok(await evalPage("[...document.querySelectorAll('dialog button')].some(b => b.textContent.includes('Load example assumptions'))"));
  await evalPage("[...document.querySelectorAll('dialog button')].find(b => b.textContent.includes('Load example assumptions')).click()");
  assert.ok(await evalPage("document.querySelector('.scenario-result').textContent.includes('Break-even reward $')"));
  if (await evalPage('!!window.RADAR_FARM_ECONOMICS')) {
    assert.ok(await evalPage("document.querySelector('.scenario-result').textContent.includes('Required reward per labor hour')"));
    assert.ok(await evalPage("(() => { const x = [...document.querySelectorAll('.farm-calculator input')].at(-1); x.value = 100; x.dispatchEvent(new Event('input', {bubbles:true})); return document.querySelector('.scenario-result').textContent.includes('covers modeled costs'); })()"));
  }
  if (m11 && shots) await command('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  if(!m11) await shot('2-detail.png');
  if (m11 && shots) await command('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  if(m11) {
    await evalPage("[...document.querySelectorAll('dialog button')].find(b => b.textContent === 'Use scenario on board').click()");
    assert.ok(await evalPage("document.querySelector('tr[data-slug=usdd]').innerText.includes('Scenario:')"));
  }
  assert.ok(await evalPage("(() => { const x = document.querySelector('.farm-calculator input'); x.value = '-1'; x.dispatchEvent(new Event('input', {bubbles:true})); return document.querySelector('.scenario-result').textContent.includes('non-negative'); })()"));
  await evalPage("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.ok(await evalPage("!document.querySelector('dialog').open"));
  await evalPage("(() => {const s = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'Documented route')); s.value = 'Documented route'; s.dispatchEvent(new Event('change'));})()");
  const documented = await evalPage("window.RADAR.rows.filter(r => r.farm_steps[0].startsWith('Documented route.')).length");
  assert.ok(documented >= 9);
  assert.equal(await evalPage("document.querySelectorAll('table:not(dialog table) > tbody > tr').length"), documented);
  if (m11) assert.equal(await evalPage("document.querySelectorAll('.landscape .plot-point').length"), documented);
  if (!m11) await shot('3-filtered.png');
  await evalPage("[...document.querySelectorAll('button')].find(b => b.textContent === 'Clear filters').click()");
  assert.equal(await evalPage("document.querySelectorAll('table:not(dialog table) > tbody > tr').length"), expected);
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
  assert.equal(await evalPage("document.querySelectorAll('table:not(dialog table) > tbody > tr').length"), await evalPage('window.RADAR.live.length'));
  await evalPage("document.querySelector('[data-sort=cap]').click()");
  assert.ok(await evalPage("window.location.hash.includes('tab=live')"));
  if (m11) {
    const button = label => `[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)}).click()`;
    await evalPage(button('Ranked board'));
    const chainCount = await evalPage(`(() => {
      const select = document.querySelector('#chain'); select.value = 'Ethereum';
      select.dispatchEvent(new Event('change')); return window.RADAR.rows.filter(r => r.chains.includes('Ethereum')).length;
    })()`);
    assert.ok(chainCount > 0 && chainCount < expected);
    assert.equal(await evalPage("document.querySelectorAll('.protocol-link').length"), chainCount);
    const csv = await evalPage(`(async () => {
      const oldURL = URL.createObjectURL, oldClick = HTMLAnchorElement.prototype.click;
      let text, name;
      URL.createObjectURL = b => { text = b.text(); return oldURL.call(URL, b); };
      HTMLAnchorElement.prototype.click = function () { name = this.download; };
      try { ${button('Export filtered CSV')}; } finally { URL.createObjectURL = oldURL; HTMLAnchorElement.prototype.click = oldClick; }
      return { text: await text, name };
    })()`);
    assert.equal(csv.name, 'token-radar-filtered.csv');
    assert.equal(csv.text.trim().split('\r\n').length, chainCount + 1);
    assert.ok(csv.text.includes('"primary_value_usd"') && csv.text.includes('"experimental_rank"'));
    await evalPage(button('Clear filters'));
    await evalPage("document.querySelector('[data-pin=nuva]').click(); document.querySelector('[data-pin=usdd]').click()");
    assert.equal(await evalPage("document.querySelector('[data-pin=nuva]').getAttribute('aria-pressed')"), 'true');
    await evalPage(button('Model research'));
    assert.equal(await evalPage("document.querySelector('canvas').width"), 650);
    assert.ok(await evalPage("document.querySelector('canvas').getContext('2d').getImageData(0, 0, 650, 280).data.some(v => v > 0)"));
    const first = await evalPage("document.querySelector('#sandbox-result').textContent");
    await evalPage("(() => { const x = document.querySelector('#sandbox-fit'); x.value='m71'; x.dispatchEvent(new Event('change')); })()");
    await evalPage("(() => { const x = document.querySelector('#weight-growth'); x.value='2'; x.dispatchEvent(new Event('input')); })()");
    await evalPage("(() => { const x = document.querySelector('#weight-age'); x.value='0'; x.dispatchEvent(new Event('input')); })()");
    assert.notEqual(await evalPage("document.querySelector('#sandbox-result').textContent"), first);
    if (await evalPage('!!window.RADAR_INTELLIGENCE')) {
      assert.equal(await evalPage("document.querySelectorAll('#intelligence svg').length"), 3);
      assert.equal(await evalPage("document.querySelectorAll('#intelligence svg:first-of-type .plot-point').length"), 127);
      await evalPage("window.scrollTo(0, 0)");
      await evalPage("const mode = document.querySelector('#opportunity-mode'); mode.value='documented'; mode.dispatchEvent(new Event('change'))");
      assert.ok(await evalPage("document.querySelector('#intelligence').textContent.includes(window.RADAR_INTELLIGENCE.rows.filter(r=>r.documented).length+' eligible')"));
    }
    if (shots) await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
    if (!process.env.RADAR_KEEP_REVIEW_SHOTS) await shot('2-validation.png');
    if (shots) await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await evalPage(button('Show experiment on board'));
    assert.ok(await evalPage("document.querySelector('[data-sort=experiment]') !== null"));
    await evalPage("document.querySelector('[data-sort=experiment]').click()");
    assert.ok(await evalPage("document.querySelector('tbody td:nth-child(7)').textContent.startsWith('#1 ' )"));
    await evalPage(button('Accounting & comparison'));
    assert.equal(await evalPage("document.querySelectorAll('#comparison tbody tr').length"), 2);
    assert.ok(await evalPage("document.querySelector('#accounting').innerText.includes('758 unique slugs')"));
    await evalPage(button('Ranked board'));
    await evalPage("const q=document.querySelector('#q');q.value='Shift DeFi';q.dispatchEvent(new Event('input'));document.querySelector('.protocol-link').click()");
    assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('Market comparables') && document.querySelector('dialog').innerText.includes('#56')"));
    assert.ok(await evalPage("document.querySelector('.valuation-range-values').textContent.includes('$10.8M') && document.querySelector('.valuation-range-values').textContent.includes('$369.8M')"));
    // Shift stress is also checked numerically above.
    await evalPage("document.querySelector('dialog').close();document.querySelector('#q').value='Lofty';document.querySelector('#q').dispatchEvent(new Event('input'));document.querySelector('.protocol-link').click()");
    await evalPage("Array.from(document.querySelectorAll('dialog nav button')).find(b=>b.textContent==='Farming economics').click();Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Load example assumptions').click()");
    assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('2.5%') && document.querySelector('.scenario-result').textContent.includes('Break-even reward $79.11')"));
    await evalPage("document.querySelector('dialog').close();document.querySelector('#q').value='loopscale-lending';document.querySelector('#q').dispatchEvent(new Event('input'));document.querySelector('.protocol-link').click()");
    await evalPage("Array.from(document.querySelectorAll('dialog nav button')).find(b=>b.textContent==='Farming economics').click()");
    assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('immediate exit')"));
    await evalPage("document.querySelector('.source-disclosure').open=true;document.querySelector('dialog').scrollTop=0");
    assert.ok(await evalPage("document.querySelector('dialog').innerText.includes('docs.loopscale.com/using-loopscale/earn') && document.querySelector('dialog').innerText.includes('queue')"));
    await shot('3-participation.png');
    await evalPage("document.querySelector('dialog').close()");
    await evalPage(button('Clear filters'));
    await evalPage(button('Accounting & comparison'));
    await evalPage(button('Next'));
    assert.ok(await evalPage("document.querySelector('.ledger-pager').textContent.includes('page 2')"));
    await evalPage(button('Previous'));
    assert.ok(await evalPage("document.querySelector('.ledger-pager').textContent.includes('page 1')"));
    await evalPage("document.querySelector('#comparison [data-pin=nuva]').click()");
    assert.equal(await evalPage("document.querySelectorAll('#comparison tbody tr').length"), 1);
  }
  if (process.env.RADAR_BROWSER_COVERAGE) {
    const { result } = await command('Profiler.takePreciseCoverage');
    const dashboard = result.filter(entry => entry.url.endsWith('/dashboard/app.js'));
    assert.equal(dashboard.length, 1);
    dashboard.forEach(entry => { entry.url = pathToFileURL(join(process.cwd(), 'dashboard', 'app.js')).href; });
    writeFileSync(process.env.RADAR_BROWSER_COVERAGE, JSON.stringify({ result: dashboard }));
  }
  assert.deepEqual(jsErrors, []);
  console.log(`Offline browser: ${expected} rows, filters, sorting, USDD detail and calculator, ${documented} documented routes, zero JavaScript errors`);
} finally {
  socket?.close();
  browser.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Browser may still be releasing temporary files. */ }
}

