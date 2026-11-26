import { PENALTIES, predictLog, selectPenalty } from './lib/regularization.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRadar, impliedValue, MODEL, parseSnapshot } from './lib/model.ts';
import { FEATURES, featureValue, fitMultivariate, fitValuation, isComparable, valuationParts } from './lib/valuation.ts';

const snapshot = parseSnapshot(readFileSync(process.argv[2]!, 'utf8'));
const { as_of: asOf } = snapshot;
const peers = snapshot.protocols.filter(isComparable);
const unknownAge = peers.filter(row => featureValue(row, asOf, 'age') === null);
const knownAge = peers.filter(row => featureValue(row, asOf, 'age') !== null)
  .sort((a, b) => featureValue(a, asOf, 'age')! - featureValue(b, asOf, 'age')!);
// Hold out the missing-age cohort separately, and keep identical dates together.
const cuts = [1, 2].map(i => featureValue(knownAge[Math.floor(i * knownAge.length / 3)]!, asOf, 'age')!);
const bands = [unknownAge, ...Array.from({ length: 3 }, (_, i) => knownAge.filter(row =>
  cuts.filter(cut => featureValue(row, asOf, 'age')! >= cut).length === i))];
assert.ok(bands.every(band => band.length > 0));
const variants = [
  ['Full', FEATURES],
  ['Without TVL', ['growth', 'age']],
  ['Without growth', ['tvl', 'age']],
  ['Without age', ['tvl', 'growth']],
] as const;

function evaluate(folds: typeof bands) {
  const totals = new Map<string, number>();
  const seen = new Set<string>();
  const selected: Record<string, number> = {};
  for (const heldOut of folds) {
    const excluded = new Set(heldOut.map(row => row.slug));
    const train = peers.filter(row => !excluded.has(row.slug));
    const tvl = fitValuation(train);
    assert.ok(tvl);
    const fits = variants.map(([name, features]) => {
      const fit = fitMultivariate(train, asOf, [...features]);
      assert.ok(fit, name);
      return [name, fit] as const;
    });
    const { penalty } = selectPenalty(train, asOf);
    selected[penalty] = (selected[penalty] ?? 0) + heldOut.length;
    const regularized = PENALTIES.slice(1).map(value => {
      const fit = fitMultivariate(train, asOf, FEATURES, value);
      assert.ok(fit);
      return [value, fit] as const;
    });
    const tuned = penalty === 0 ? fits[0]![1] : regularized.find(([value]) => value === penalty)![1];
    for (const row of heldOut) {
      assert.ok(!seen.has(row.slug));
      seen.add(row.slug);
      const actual = Math.log(row.mcap_usd!);
      const predictions: [string, number][] = [
        ['Nested selection', predictLog(tuned, row, asOf)],
        ...regularized.map(([value, fit]): [string, number] => [`Ridge ${value}`, predictLog(fit, row, asOf)]),
        ['Starter', Math.log(impliedValue(row, asOf, MODEL).implied)],
        ['V1 Huber', tvl.intercept + tvl.slope * Math.log(row.tvl_usd)],
        ...fits.map(([name, fit]): [string, number] => [name, fit.intercept +
          Object.values(valuationParts(fit, row, asOf)).reduce((sum, part) => sum + part, 0)]),
      ];
      for (const [name, value] of predictions) {
        const rounded = Math.log(Math.max(1, Math.round(Math.exp(value))));
        totals.set(name, (totals.get(name) ?? 0) + Math.abs(rounded - actual));
      }
    }
  }
  assert.equal(seen.size, peers.length);
  return { errors: Object.fromEntries([...totals].map(([name, sum]) => [name, sum / seen.size])), selected };
}

const loo = evaluate(peers.map(row => [row]));
const ageBands = evaluate(bands);
const { board, radar } = buildRadar(snapshot);
const previous = new Map<string, (typeof board)[number]>(
  JSON.parse(readFileSync(process.argv[4]!, 'utf8')).rows.map((row: (typeof board)[number]) => [row.slug, row]));
const currentSlugs = new Set(board.map(row => row.slug));
assert.ok(snapshot.watchlist.every(slug => currentSlugs.has(slug)));
for (const row of board) {
  const old = previous.get(row.slug);
  if (old) assert.deepEqual(row.farm_steps, old.farm_steps);
}
const added = board.filter(row => !previous.has(row.slug));
const removed = [...previous.keys()].filter(slug => !currentSlugs.has(slug));
const fit = radar.model.regression;
assert.ok(fit);
const current = new Map(snapshot.protocols.map(row => [row.slug, row]));
const v1 = JSON.parse(readFileSync(process.argv[3]!, 'utf8')).rows;
const baseline = new Map<string, (typeof board)[number]>(v1.map((row: (typeof board)[number]) => [row.slug, row]));

const changes = board.filter(row => baseline.has(row.slug)).map(row => {
  const old = baseline.get(row.slug);
  assert.ok(old);
  assert.deepEqual(row.farm_steps, old.farm_steps);
  const parts = valuationParts(fit, current.get(row.slug)!, asOf);
  assert.equal(row.implied_value_usd, Math.max(1, Math.round(Math.exp(fit.intercept + parts.tvl!) *
    Math.exp(parts.growth!) * Math.exp(parts.age!))));
  return { slug: row.slug, oldRank: old.rank, rank: row.rank, oldValue: old.implied_value_usd,
    value: row.implied_value_usd, growthFactor: Math.exp(parts.growth!), ageFactor: Math.exp(parts.age!) };
});
const moved = changes.slice().sort((a, b) => (a.rank - a.oldRank) - (b.rank - b.oldRank));
console.log(JSON.stringify({
  peers: peers.length, board: board.length, watchlist: snapshot.watchlist.length,
  additions: { belowFloor: added.filter(row => row.tvl_usd < snapshot.floor_usd).length,
    atOrAboveFloor: added.filter(row => row.tvl_usd >= snapshot.floor_usd).length, slugs: added.map(row => row.slug) },
  removed, uncertainty: radar.uncertainty, bandSizes: bands.map(band => band.length),
  bandCutDays: cuts.map(cut => Math.round(Math.expm1(cut))),
  missingPeers: Object.fromEntries(FEATURES.map(feature => [
    feature, peers.filter(row => featureValue(row, asOf, feature) === null).length,
  ])),
  outsideBoardRange: Object.fromEntries(fit.terms.map(({ feature, min, max }) => [
    feature, board.filter(row => {
      const value = featureValue(current.get(row.slug)!, asOf, feature);
      return value !== null && (value < min || value > max);
    }).length,
  ])),
  loo, ageBands, fullSampleSelection: selectPenalty(peers, asOf), fit, changes: [...moved.slice(0, 2), ...moved.slice(-2)],
}, null, 2));
