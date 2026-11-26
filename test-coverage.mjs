import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const root = process.cwd();
const load = file => import(pathToFileURL(join(root, file)));
const input = process.env.RADAR_INPUT;
const output = process.env.RADAR_OUTPUT;
const m = await load('lib/model.ts');
const v = await load('lib/valuation.ts');
const { classifyProtocols } = await load('lib/classification.ts');
const { farmPlan } = await load('lib/farming.ts');
const raw = readFileSync(join(input, 'snapshot.json'), 'utf8');
const snapshot = m.parseSnapshot(raw);
const peers = snapshot.protocols.filter(v.isComparable);
const build = m.buildRadar(snapshot);

test('snapshot and board invariants, including rejected rankings', () => {
  assert.equal(snapshot.protocols.length, 758);
  assert.equal(peers.length, 119);
  assert.equal(build.radar.watchlist_covered, 40);
  assert.equal(m.boardIssue(build.board, snapshot), null);
  const checkBad = (change, error) => {
    const rows = structuredClone(build.board);
    change(rows);
    assert.match(m.boardIssue(rows, snapshot), error);
  };
  checkBad(rows => rows.splice(rows.findIndex(r => snapshot.watchlist.includes(r.slug)), 1), /misses/);
  checkBad(rows => { rows[0].rank = 2; }, /rank/);
  checkBad(rows => { rows[1].implied_value_usd = rows[0].implied_value_usd + 1; }, /outranks/);
  checkBad(rows => rows.forEach(r => { r.implied_value_usd = 1; }), /share the same/);
  checkBad(rows => { rows[0].farm_steps = []; }, /farm steps/);
  checkBad(rows => { rows[0].farm_steps[0] = 'short'; }, /characters/);
  checkBad(rows => { rows.at(-1).implied_value_usd = 0; }, /implied value/);
  assert.throws(() => m.parseSnapshot('{'), /not JSON/);
  assert.throws(() => m.parseSnapshot('null'), /not a JSON object/);
  const tests = { as_of: 'yesterday', source: null, floor_usd: 0, protocols: null, watchlist: [0] };
  for (const [field, value] of Object.entries(tests)) {
    assert.throws(() => m.parseSnapshot(JSON.stringify({ ...snapshot, [field]: value })), new RegExp(field));
  }
  assert.throws(() => m.parseSnapshot(JSON.stringify({ ...snapshot, protocols: [null] })), /not an object/);
  assert.throws(() => m.parseSnapshot(JSON.stringify({ ...snapshot, protocols: [{}] })), /lacks a slug/);
  assert.equal(m.ageDays(snapshot.as_of, 'unknown'), null);
  assert.equal(m.ageDays(snapshot.as_of, '2100-01-01'), 0);
});
test('classification, valuation and farming edge cases', () => {
  const classes = classifyProtocols(snapshot.protocols);
  assert.equal(classes.size, 758);
  assert.equal(classes.get('wbtc').status, 'Likely existing-token product');
  assert.equal(classes.get('mezo-earn').status, 'Related product');
  assert.equal(classes.get('nuva').status, 'Pre-token candidate');
  const example = snapshot.protocols.find(p => p.slug === 'nuva');
  for (const category of ['Lending', 'DEX', 'Bridge', 'Staking']) {
    assert.match(farmPlan({ ...example, category })[0], /^Conditional route/);
  }
  assert.match(farmPlan({ ...example, category: null })[0], /^Research only/);
  assert.match(farmPlan(snapshot.protocols.find(p => p.slug === 'usdd'))[0], /^Documented route/);
  assert.equal(v.fitValuation([peers[0]]), null);
  assert.equal(v.fitValuation([peers[0], peers[0]]), null);
  const old = v.fitValuation(peers);
  assert.ok(old.slope > 0 && old.slope < 1);
  assert.ok(m.impliedValue({ ...example, change_7d: null, listed_at: null }, snapshot.as_of, m.MODEL).implied > 0);
  assert.ok(m.buildBoard(snapshot, m.MODEL, null).every(row => row.implied_value_usd >= 1));
  if (v.fitMultivariate) {
    assert.equal(v.fitMultivariate(peers.slice(0, 2), snapshot.as_of), null);
    assert.equal(v.fitMultivariate(peers.map(row => ({ ...row, change_7d: null })), snapshot.as_of), null);
    assert.equal(v.fitMultivariate(peers.map(row => ({ ...row, change_7d: 0 })), snapshot.as_of), null);
    const fit = v.fitMultivariate(peers, snapshot.as_of);
    if (build.radar.model.experimental) {
      const alt = m.buildBoard(snapshot, m.MODEL, build.radar.model.experimental);
      assert.equal(alt.length, build.board.length);
      assert.ok(alt.some(row => row.implied_value_usd !== build.board.find(r => r.slug === row.slug).implied_value_usd));
    }
    assert.equal(v.valuationParts(fit, { ...example, change_7d: null }, snapshot.as_of).growth, 0);
    assert.equal(v.featureValue({ ...example, tvl_usd: 0 }, snapshot.as_of, 'tvl'), null);
  }
});
test('CLI and offline browser workflow', () => {
  const run = (args, env) => execFileSync(process.execPath, args, { env, encoding: 'utf8' });
  assert.match(run(['main.ts', '--input', input, '--output', output], process.env), /758 protocols/);
  assert.throws(() => run(['main.ts', '--input=' + join(input, 'absent.json')], process.env),
    e => e.status === 2 && /no snapshot/.test(e.stderr));
  const browserCoverage = join(process.env.NODE_V8_COVERAGE, `coverage-${process.pid}-${Date.now()}-999.json`);
  assert.match(run([process.env.RADAR_BROWSER_TEST, process.env.RADAR_EDGE, output],
    { ...process.env, RADAR_BROWSER_COVERAGE: browserCoverage }), /zero JavaScript errors/);
});
