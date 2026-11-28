import { FEATURES, featureValue, fitMultivariate, valuationParts, type MultivariateFit } from './valuation.ts';
import type { SnapshotProtocol } from './model.ts';

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
export function quantile(values: number[], p: number) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1))]!;
}

const logFit = (fit: MultivariateFit, row: SnapshotProtocol, asOf: string) => {
  const p = valuationParts(fit, row, asOf);
  return fit.intercept + p.tvl! + p.growth! + p.age!;
};

export function peerSupport(fit: MultivariateFit, peers: SnapshotProtocol[], asOf: string) {
  const features = (r: SnapshotProtocol) => fit.terms.map(t => featureValue(r, asOf, t.feature));
  const ref = peers.map(features);
  const distance = (x: (number | null)[], y: (number | null)[]) =>
    Math.hypot(...fit.terms.map((t, i) => ((x[i] ?? t.center) - (y[i] ?? t.center)) / t.scale));
  const nearest = ref.map((x, i) => Math.min(...ref.flatMap((y, j) => i === j ? [] : [distance(x, y)])));
  const threshold = quantile(nearest, 0.9);
  return (r: SnapshotProtocol) => {
    const x = features(r);
    const neighbors = ref.map((y, index) => ({ index, distance: distance(x, y) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 15);
    const missing = fit.terms.filter((_, i) => x[i] === null).map(t => t.feature);
    const outside = fit.terms.filter((t, i) => x[i] !== null && (x[i]! < t.min || x[i]! > t.max)).map(t => t.feature);
    const weak = missing.length > 0 || outside.length > 0 || neighbors[0]!.distance > threshold;
    return { outside, missing, weak, nearest: neighbors[0]!.distance, threshold, neighbors };
  };
}

function calibrated(train: SnapshotProtocol[], calibration: SnapshotProtocol[], asOf: string) {
  const fit = fitMultivariate(train, asOf, FEATURES, 1);
  if (!fit) throw new Error('Interval training split cannot fit the fixed V3 model');
  const support = peerSupport(fit, train, asOf);
  const absolute = (r: SnapshotProtocol) => Math.abs(logFit(fit, r, asOf) - Math.log(r.mcap_usd!));
  const errors = train.map(absolute);
  const center = mean(errors);
  const scale = (r: SnapshotProtocol) => {
    const s = support(r);
    const local = mean(s.neighbors.map(n => errors[n.index]!));
    return { local, support: s, value: s.weak || center <= 0 ? 1 : (local + center) / (2 * center) };
  };
  // Prespecified alternative: two equally populated TVL strata, with 10 global pseudo-peers.
  const medianTVL = quantile(train.map(r => r.tvl_usd), 0.5);
  const tvlScales = [false, true].map(large => {
    const e = errors.filter((_, i) => (train[i]!.tvl_usd > medianTVL) === large);
    return (e.reduce((a, b) => a + b, 0) + 10 * center) / ((e.length + 10) * center);
  });
  const sizeScale = (r: SnapshotProtocol) => support(r).weak ? 1 : tvlScales[Number(r.tvl_usd > medianTVL)]!;
  const q = (x: number[]) => quantile(x, Math.ceil(0.8 * (x.length + 1)) / x.length);
  const global = q(calibration.map(absolute));
  const normalized = q(calibration.map(r => absolute(r) / scale(r).value));
  const sizeQ = q(calibration.map(r => absolute(r) / sizeScale(r)));
  return (r: SnapshotProtocol) => {
    const s = scale(r);
    const logCenter = logFit(fit, r, asOf);
    return { logCenter, global, sizeWidth: s.support.weak ? global : sizeQ * sizeScale(r), adapted: s.support.weak ? global : normalized * s.value, local: s.local,
      weak: s.support.weak };
  };
}

function stats(rows: { error: number; width: number }[]) {
  return rows.length ? { n: rows.length, coverage: mean(rows.map(r => Number(r.error <= r.width))),
    logWidth: 2 * mean(rows.map(r => r.width)),
    intervalScore: mean(rows.map(r => 2 * r.width + 10 * Math.max(0, r.error - r.width))) } : null;
}

export function intervalStudy(peers: SnapshotProtocol[], asOf: string, groups: Map<string, string>) {
  const keys = [...new Set(peers.map(r => groups.get(r.slug)!))].sort();
  const assignments = new Map(keys.map((key, i) => [key, i % 5]));
  const fold = (r: SnapshotProtocol) => assignments.get(groups.get(r.slug)!)!;
  const folds = Array.from({ length: 5 }, (_, i) => peers.filter(r => fold(r) === i));
  const tested = folds.flatMap((test, i) => {
    const cal = (i + 1) % 5;
    const fit = calibrated(peers.filter(r => fold(r) !== i && fold(r) !== cal), folds[cal]!, asOf);
    return test.map(row => {
      const p = fit(row);
      return { error: Math.abs(Math.log(row.mcap_usd!) - p.logCenter), ...p,
        extreme: Math.abs(row.change_7d ?? 0) >= quantile(peers.filter(r => fold(r) !== i && fold(r) !== cal)
          .map(r => Math.abs(r.change_7d ?? 0)), 0.9) };
    });
  });
  const both = (rows: typeof tested) => ({
    global: stats(rows.map(r => ({ error: r.error, width: r.global }))),
    size: stats(rows.map(r => ({ error: r.error, width: r.sizeWidth }))),
    adaptive: stats(rows.map(r => ({ error: r.error, width: r.adapted }))),
  });
  const overall = both(tested);
  const useAdaptive = overall.adaptive!.intervalScore < overall.global!.intervalScore &&
    overall.adaptive!.coverage >= overall.global!.coverage;
  const final = calibrated(peers.filter(r => fold(r) !== 0), folds[0]!, asOf);
  return { useAdaptive, assess: final, report: { calibrationN: folds[0]!.length, testFolds: folds.map(x => x.length),
    overall, weak: both(tested.filter(r => r.weak)), supported: both(tested.filter(r => !r.weak)),
    extremeGrowth: both(tested.filter(r => r.extreme)), useAdaptive } };
}
