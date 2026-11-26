import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBoard, impliedValue, MODEL, parseSnapshot, type SnapshotProtocol } from './lib/model.ts';
import { FEATURES, featureValue, fitMultivariate, fitValuation, isComparable, valuationParts, type Feature } from './lib/valuation.ts';
import { PENALTIES, predictLog, selectPenalty } from './lib/regularization.ts';

const snapshot = parseSnapshot(readFileSync(process.argv[2]!, 'utf8'));
const asOf = snapshot.as_of;
const peers = snapshot.protocols.filter(isComparable);
assert.equal(peers.length, 119);
const slugOrder = (a: string, b: string) => a < b ? -1 : a === b ? 0 : 1;
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const sorted = (x: number[]) => x.slice().sort((a, b) => a - b);
function quantile(x: number[], p: number) {
  const y = sorted(x), index = (y.length - 1) * p;
  return y[Math.floor(index)]! + (y[Math.ceil(index)]! - y[Math.floor(index)]!) * (index % 1);
}
const usd = (log: number) => Math.max(1, Math.round(Math.exp(log)));
const variants: Record<string, Feature[]> = {
  growth: ['tvl', 'growth'], age: ['tvl', 'age'], m7: FEATURES,
};

function fitAll(train: SnapshotProtocol[]) {
  const v1 = fitValuation(train);
  assert.ok(v1);
  const old = selectPenalty(train, asOf, [0, 0.1, 1]).penalty;
  const extended = selectPenalty(train, asOf).penalty;
  const fits = Object.fromEntries(Object.entries({ ...variants, m71: FEATURES, extended: FEATURES }).map(([name, features]) => {
    const fit = fitMultivariate(train, asOf, features, name === 'm71' ? old : name === 'extended' ? extended : 0);
    assert.ok(fit, name);
    return [name, fit];
  }));
  return { old, extended, v1, fits };
}

type Pair = { slug: string; observed: number; predicted: number; fold: number };
export function ranks(values: number[]) {
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const ranks = Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i + 1;
    while (j < order.length && values[order[i]!] === values[order[j]!]) j++;
    for (let k = i; k < j; k++) ranks[order[k]!] = (i + j + 1) / 2;
    i = j;
  }
  return ranks;
}
function ranking(rows: Pair[]) {
  const x = ranks(rows.map(r => r.observed)), y = ranks(rows.map(r => r.predicted));
  const mx = mean(x), my = mean(y);
  const varx = x.reduce((s, v) => s + (v - mx) ** 2, 0), vary = y.reduce((s, v) => s + (v - my) ** 2, 0);
  let net = 0, nonTieX = 0, nonTieY = 0;
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
    const a = Math.sign(x[i]! - x[j]!), b = Math.sign(y[i]! - y[j]!);
    nonTieX += Math.abs(a); nonTieY += Math.abs(b); net += a * b;
  }
  const order = (field: 'observed' | 'predicted') =>
    rows.slice().sort((a, b) => b[field] - a[field] || slugOrder(a.slug, b.slug));
  const observed = order('observed'), predicted = order('predicted');
  return {
    spearman: varx && vary ? x.reduce((s, v, i) => s + (v - mx) * (y[i]! - my), 0) / Math.sqrt(varx * vary) : null,
    kendallTauB: nonTieX && nonTieY ? net / Math.sqrt(nonTieX * nonTieY) : null,
    overlap: Object.fromEntries([10, 20, 40].map(k => {
      const top = new Set(observed.slice(0, k).map(r => r.slug));
      return [k, rows.length >= k ? predicted.slice(0, k).filter(r => top.has(r.slug)).length : null];
    })),
  };
}
const loss = (r: Pair) => Math.abs(Math.log(r.predicted) - Math.log(r.observed));
function metrics(rows: Pair[]) {
  const errors = rows.map(loss);
  return { n: rows.length, mean: mean(errors), median: quantile(errors, 0.5), p80: quantile(errors, 0.8), ...ranking(rows) };
}

function evaluate(folds: SnapshotProtocol[][]) {
  const predictions: Record<string, Pair[]> = {};
  const coefficients: Record<string, Record<string, number>[]> = {};
  const selection = { m71: {} as Record<number, number>, extended: {} as Record<number, number> };
  for (const [fold, held] of folds.entries()) {
    const excluded = new Set(held.map(r => r.slug));
    const train = peers.filter(r => !excluded.has(r.slug));
    const fit = fitAll(train);
    for (const [name, penalty] of [['m71', fit.old], ['extended', fit.extended]] as const) {
      selection[name][penalty] = (selection[name][penalty] ?? 0) + 1;
    }
    (coefficients.v1 ??= []).push({ tvl: fit.v1.slope });
    for (const [name, model] of Object.entries(fit.fits)) {
      (coefficients[name] ??= []).push(Object.fromEntries(model.terms.map(t => [t.feature, t.coefficient])));
    }
    for (const row of held) {
      const values = {
        starter: impliedValue(row, asOf, MODEL).implied,
        v1: usd(fit.v1.intercept + fit.v1.slope * Math.log(row.tvl_usd)),
        ...Object.fromEntries(Object.entries(fit.fits).map(([name, model]) => [name, usd(predictLog(model, row, asOf))])),
      };
      for (const [name, predicted] of Object.entries(values)) {
        (predictions[name] ??= []).push({ slug: row.slug, predicted, observed: row.mcap_usd!, fold });
      }
    }
  }
  const v1 = predictions.v1!;
  assert.equal(new Set(v1.map(row => row.slug)).size, peers.length);
  const paired = Object.fromEntries(Object.entries(predictions).filter(([name]) => name !== 'v1').map(([name, rows]) => {
    assert.equal(rows.length, peers.length);
    const delta = rows.map((r, i) => {
      assert.equal(r.slug, v1[i]!.slug);
      return loss(r) - loss(v1[i]!);
    });
    const foldMeans = folds.map((_, fold) => mean(delta.filter((_, i) => rows[i]!.fold === fold)));
    const k = folds.length;
    const variance = foldMeans.reduce((s, v) => s + (v - mean(foldMeans)) ** 2, 0) / (k - 1);
    const correction = 1 / k + mean(folds.map(f => f.length / (peers.length - f.length)));
    const sem = Math.sqrt(correction * variance);
    const half = sem * (k === 4 ? 3.182446 : 1.980272);
    const center = mean(delta);
    return [name, { meanDifference: center, correctedSE: sem, approximate95: [center - half, center + half], foldMeans }];
  }));
  return { selection, paired, predictions,
    pooled: Object.fromEntries(Object.entries(predictions).map(([name, rows]) => [name, metrics(rows)])),
    cohorts: folds.length === 4 ? folds.map((_, fold) =>
      Object.fromEntries(Object.entries(predictions).map(([name, rows]) => [name, metrics(rows.filter(row => row.fold === fold))]))) : null,
    coefficientStability: Object.fromEntries(Object.entries(coefficients).map(([name, values]) => [name,
      Object.fromEntries(Object.keys(values[0]!).map(key => {
        const v = sorted(values.map(row => row[key]!));
        return [key, { min: v[0], median: quantile(v, 0.5), max: v.at(-1), positive: v.filter(n => n > 0).length }];
      }))])),
  };
}

const unknown = peers.filter(r => featureValue(r, asOf, 'age') === null);
const known = peers.filter(r => featureValue(r, asOf, 'age') !== null)
  .sort((a, b) => featureValue(a, asOf, 'age')! - featureValue(b, asOf, 'age')!);
const cuts = [1, 2].map(i => featureValue(known[Math.floor(i * known.length / 3)]!, asOf, 'age')!);
const cohorts = [unknown, ...Array.from({ length: 3 }, (_, i) => known.filter(r =>
  cuts.filter(c => featureValue(r, asOf, 'age')! >= c).length === i))];
const loo = evaluate(peers.map(r => [r]));
const age = evaluate(cohorts);
const full = fitAll(peers);
const board = buildBoard(snapshot, MODEL, full.fits.extended);
assert.equal(board.length, 182);
const protocols = new Map(snapshot.protocols.map(r => [r.slug, r]));
const v1 = board.map(r => ({ slug: r.slug, value: usd(full.v1.intercept + full.v1.slope * Math.log(r.tvl_usd)) }))
  .sort((a, b) => b.value - a.value || slugOrder(a.slug, b.slug));
const baseRanks = new Map(v1.map((r, i) => [r.slug, { rank: i + 1, value: r.value }]));
const routes = JSON.parse(readFileSync(new URL('./dashboard/farming-routes.json', import.meta.url), 'utf8'));
const candidate = board.map(r => {
  const base = baseRanks.get(r.slug)!;
  const p = protocols.get(r.slug)!;
  const parts = valuationParts(full.fits.extended!, p, asOf);
  return { slug: r.slug, v1Rank: base.rank, v1Value: base.value, alternativeRank: r.rank,
    alternativeValue: r.implied_value_usd, rankGain: base.rank - r.rank, growth: p.change_7d, trackingDays: r.age_days,
    growthFactor: Math.exp(parts.growth!), ageFactor: Math.exp(parts.age!),
    watchlist: snapshot.watchlist.includes(r.slug), route: Object.hasOwn(routes, r.slug) };
});
const comparisons = candidate.map(r => ({ slug: r.slug, observed: r.v1Value, predicted: r.alternativeValue, fold: 0 }));
const residuals = sorted(loo.predictions.v1!.map(loss));
console.log(JSON.stringify({
  peers: peers.length, penalties: PENALTIES, cohortSizes: cohorts.map(x => x.length),
  cohortCutDays: cuts.map(x => Math.round(Math.expm1(x))), loo, age, full,
  finalInnerScores: selectPenalty(peers, asOf).errors,
  candidateRanking: { ...ranking(comparisons), rows: candidate },
  v1Uncertainty: { level: 0.8, residuals: residuals.length, factor: Math.exp(residuals[Math.ceil(0.8 * residuals.length) - 1]!) },
}, null, 2));
