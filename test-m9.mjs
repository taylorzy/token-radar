import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const [output, m8, v1] = process.argv.slice(2);
const file = (root, name) => readFileSync(join(root, name));
const json = (root, name) => JSON.parse(file(root, name).toString('utf8').replace(/^\uFEFF/, ''));
const ledger = json(output, 'protocol-accounting.json');
const oldLedger = json(m8, 'protocol-accounting.json');
const board = json(output, 'board.json').rows;
const oldBoard = new Map(json(m8, 'board.json').rows.map(r => [r.slug, r]));
const accepted = new Map(json(v1, 'board.json').rows.map(r => [r.slug, r]));
const metrics = JSON.parse(readFileSync(new URL('./reports/m9-evaluation.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(board.length, 182);
assert.equal(ledger.rows.length, 758);
assert.equal(new Set(ledger.rows.map(r => r.slug)).size, 758);
const bySlug = new Map(ledger.rows.map(r => [r.slug, r]));
assert.equal(ledger.rows.filter(r => r.watchlist && r.rank !== null).length, 40);
assert.deepEqual(ledger.by_status, oldLedger.by_status);
assert.deepEqual(ledger.by_disposition, oldLedger.by_disposition);
const omitRank = ({ rank, ...row }) => row;
assert.deepEqual(ledger.rows.map(omitRank), oldLedger.rows.map(omitRank));
assert.deepEqual(file(output, 'dashboard/farming-routes.json'), file(m8, 'dashboard/farming-routes.json'));
const routes = Object.keys(json(output, 'dashboard/farming-routes.json'));
assert.equal(routes.length, 9);
assert.ok(routes.every(slug => bySlug.get(slug)?.rank > 0));
const browser = { window: {} };
vm.runInNewContext(file(output, 'data.js').toString('utf8'), browser);
const data = browser.window.RADAR;
assert.equal(data.model_version, 'huber-log-tvl-1');
assert.ok(Math.abs(data.uncertainty.factor - metrics.v1Uncertainty.factor) < 1e-10);
assert.equal(data.uncertainty.residuals, 119);
const app = file(output, 'dashboard/app.js').toString('utf8');
const start = app.indexOf('  function impliedOf');
const context = { DATA: data };
vm.runInNewContext(app.slice(start, app.indexOf('\n  }', start) + 4), context);
const alternatives = new Map(metrics.candidateRanking.rows.map(r => [r.slug, r]));
for (const [i, row] of board.entries()) {
  assert.equal(row.rank, i + 1);
  assert.equal(row.rank, bySlug.get(row.slug).rank);
  assert.ok(i === 0 || row.implied_value_usd <= board[i - 1].implied_value_usd);
  assert.deepEqual(row.farm_steps, oldBoard.get(row.slug).farm_steps);
  if (accepted.has(row.slug)) assert.equal(row.implied_value_usd, accepted.get(row.slug).implied_value_usd);
  assert.equal(row.implied_value_usd, alternatives.get(row.slug).v1Value);
  assert.equal(context.impliedOf(row, data.model), row.implied_value_usd);
  assert.equal(context.impliedOf(row, data.model, false, true), alternatives.get(row.slug).alternativeValue);
}
const screenshots = ['1-board.png', '2-detail.png', '3-filtered.png'];
for (const name of screenshots) {
  const bytes = file(output, 'screenshots/' + name);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 1440);
  assert.equal(bytes.readUInt32BE(20), 960);
  assert.ok(bytes.length > 1000 && bytes.length <= 524288);
}
assert.ok(Object.keys(json(output, 'dossier.json')).length);
console.log('M9 regression: 758 ledger entries, 40 mandatory rows, 182 ranks and comparators, nine routes, calibrated range, three PNGs');
