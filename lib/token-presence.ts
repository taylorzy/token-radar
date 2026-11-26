import { featureValue, FEATURES } from './valuation.ts';
import type { Snapshot, SnapshotProtocol } from './model.ts';
import type { Classification } from './classification.ts';

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sigmoid = (n: number) => 1 / (1 + Math.exp(-n));
const trusted = (status: string) => status === 'Recorded token' || status === 'Pre-token candidate';
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** Union likely product families using names, shared token keys and existing named peers.
 * Identity metadata assigns folds only. It never enters the design matrix.
 */
export function protocolGroups(rows: SnapshotProtocol[], classes: Map<string, Classification>) {
  const parent = new Map(rows.map(r => [r.slug, r.slug]));
  function find(s: string): string {
    const next = parent.get(s)!;
    if (next === s) return s;
    const root = find(next);
    parent.set(s, root);
    return root;
  }
  function merge(a: string, b: string) {
    const x = find(a), y = find(b);
    if (x !== y) parent.set(x < y ? y : x, x < y ? x : y);
  }
  const first = new Map<string, string>();
  for (const row of rows) {
    const brand = row.name.toLowerCase().match(/^[a-z0-9]{3,}/)?.[0];
    const keys = [brand && 'brand:' + brand, row.gecko_id && 'id:' + row.gecko_id,
      row.symbol && 'symbol:' + row.symbol.toLowerCase()];
    for (const key of keys) {
      if (!key) continue;
      const other = first.get(key);
      if (other) merge(row.slug, other);
      else first.set(key, row.slug);
    }
    for (const text of classes.get(row.slug)?.evidence ?? []) {
      for (const match of text.matchAll(/\(([a-z0-9_.-]+)\)/g)) {
        if (parent.has(match[1]!)) merge(row.slug, match[1]!);
      }
    }
  }
  return new Map(rows.map(r => [r.slug, find(r.slug)]));
}

type Labeled = { row: SnapshotProtocol; y: number };

function train(trainRows: Labeled[], asOf: string) {
  const base = (trainRows.reduce((s, r) => s + r.y, 0) + 1) / (trainRows.length + 2);
  const categories = new Map<string | null, { n: number; y: number }>();
  const chainCounts = new Map<string, number>();
  for (const { row, y } of trainRows) {
    const seen = categories.get(row.category) ?? { n: 0, y: 0 };
    categories.set(row.category, { n: seen.n + 1, y: seen.y + y });
    for (const chain of new Set(row.chains)) chainCounts.set(chain, (chainCounts.get(chain) ?? 0) + 1);
  }
  const cats = [...categories].filter(([, count]) => count.n >= 8).map(([cat]) => cat);
  const chains = [...chainCounts].filter(([, count]) => count >= 15).map(([chain]) => chain);
  const centers = FEATURES.map(feature => {
    const values = trainRows.map(({ row }) => featureValue(row, asOf, feature)).filter(v => v !== null).sort((a, b) => a - b);
    const center = (values[Math.floor(values.length / 2)]! + values[Math.floor((values.length - 1) / 2)]!) / 2;
    return { feature, center, scale: Math.sqrt(mean(values.map(v => (v - center) ** 2))) || 1 };
  });
  const features = (r: SnapshotProtocol) => [1, ...centers.map(t =>
    ((featureValue(r, asOf, t.feature) ?? t.center) - t.center) / t.scale),
    ...cats.map(cat => Number(r.category === cat)), ...chains.map(chain => Number(r.chains.includes(chain)))];
  const x = trainRows.map(({ row }) => features(row));
  const beta = x[0]!.map(() => 0);
  beta[0] = Math.log(base / (1 - base));
  const dot = (v: number[]) => v.reduce((s, n, i) => s + n * beta[i]!, 0);
  // Fixed ridge penalty on slopes, average log loss, no hyperparameter selection.
  const penalty = 0.1;
  for (let step = 0; step < 400; step++) {
    const g = beta.map((v, i) => i ? penalty * v : 0);
    x.forEach((v, k) => {
      const err = sigmoid(dot(v)) - trainRows[k]!.y;
      v.forEach((n, i) => { g[i]! += err * n / x.length; });
    });
    beta.forEach((_, i) => { beta[i]! -= 0.2 * g[i]!; });
  }
  return (row: SnapshotProtocol) => {
    const cat = categories.get(row.category) ?? { n: 0, y: 0 };
    return { base, category: (cat.y + 10 * base) / (cat.n + 10),
      ridge: sigmoid(dot(features(row))), categoryN: cat.n };
  };
}
type Prediction = { y: number; p: number };

function metrics(rows: Prediction[]) {
  let wins = 0, pairs = 0;
  for (const a of rows.filter(r => r.y === 1)) for (const b of rows.filter(r => r.y === 0)) {
    wins += a.p === b.p ? 0.5 : Number(a.p > b.p);
    pairs++;
  }
  return { n: rows.length, brier: mean(rows.map(r => (r.p - r.y) ** 2)),
    logLoss: -mean(rows.map(r => Math.log(r.y ? r.p : 1 - r.p))),
    auc: pairs ? wins / pairs : null,
    calibration: Array.from({ length: 5 }, (_, i) => {
      const bin = rows.filter(r => Math.min(4, Math.floor(5 * r.p)) === i);
      return { n: bin.length, predicted: bin.length ? mean(bin.map(r => r.p)) : null,
        observed: bin.length ? mean(bin.map(r => r.y)) : null };
    }) };
}

export function tokenPresence(snapshot: Snapshot, classes: Map<string, Classification>) {
  const grouped = protocolGroups(snapshot.protocols, classes);
  const rows = snapshot.protocols.filter(r => r.category !== 'CEX' && trusted(classes.get(r.slug)!.status))
    .map(row => ({ row, y: Number(classes.get(row.slug)!.status === 'Recorded token') }));
  const ids = [...new Set(rows.map(r => grouped.get(r.row.slug)!))].sort((a, b) => hash(a) - hash(b));
  const foldByGroup = new Map(ids.map((id, i) => [id, i % 5]));
  const foldOf = (row: SnapshotProtocol) => foldByGroup.get(grouped.get(row.slug)!)!;
  const evaluated: Record<'base' | 'category' | 'ridge', Prediction[]> = { base: [], category: [], ridge: [] };
  const heldScores = new Map<string, ReturnType<ReturnType<typeof train>>>();
  const sizes = Array.from({ length: 5 }, (_, i) => {
    const fit = train(rows.filter(r => foldOf(r.row) !== i), snapshot.as_of);
    const held = rows.filter(r => foldOf(r.row) === i);
    for (const { row, y } of held) {
      const p = fit(row);
      heldScores.set(row.slug, p);
      for (const key of ['base', 'category', 'ridge'] as const) evaluated[key].push({ y, p: p[key] });
    }
    return held.length;
  });
  const scores = { base: metrics(evaluated.base), category: metrics(evaluated.category), ridge: metrics(evaluated.ridge) };
  // Prefer the simpler category comparator if ridge cannot improve both held-out proper scores.
  const selected = scores.ridge.brier < scores.category.brier && scores.ridge.logLoss < scores.category.logLoss ? 'ridge' :
    scores.category.brier < scores.base.brier && scores.category.logLoss < scores.base.logLoss ? 'category' : 'base';

  return { report: { selected, sizes, groups: ids.length, positive: rows.filter(r => r.y).length,
    negative: rows.filter(r => !r.y).length, scores },
    score: (row: SnapshotProtocol) => {
      const values = heldScores.get(row.slug);
      if (!values) throw new Error("No family-held-out prediction for " + row.slug);
      return { propensity: values[selected], categoryN: values.categoryN, categoryBase: values.category };
    } };
}
