import type { SnapshotProtocol } from './model.ts';

export const HUBER_DELTA = 1.5;

export function isComparable(row: SnapshotProtocol): boolean {
  return row.category !== 'CEX' && row.tvl_usd > 0 && (row.mcap_usd ?? 0) > 0;
}

/** Iteratively reweighted least squares on natural logs, in USD. */
export function fitValuation(rows: SnapshotProtocol[]) {
  const points = rows.map(row => ({
    x: Math.log(row.tvl_usd),
    y: Math.log(row.mcap_usd!),
    weight: 1,
  }));
  if (points.length < 2) return null;

  let intercept = 0;
  let slope = 0;
  for (let iteration = 0; iteration < 100; iteration++) {
    const total = points.reduce((sum, p) => sum + p.weight, 0);
    const xMean = points.reduce((sum, p) => sum + p.weight * p.x, 0) / total;
    const yMean = points.reduce((sum, p) => sum + p.weight * p.y, 0) / total;
    const variance = points.reduce((sum, p) => sum + p.weight * (p.x - xMean) ** 2, 0);
    if (variance === 0) return null;
    const nextSlope = points.reduce((sum, p) => sum + p.weight * (p.x - xMean) * (p.y - yMean), 0) / variance;
    const nextIntercept = yMean - nextSlope * xMean;
    const converged = Math.abs(nextSlope - slope) + Math.abs(nextIntercept - intercept) < 1e-10;
    slope = nextSlope;
    intercept = nextIntercept;
    if (converged) break;
    for (const p of points) {
      p.weight = Math.min(1, HUBER_DELTA / Math.abs(p.y - intercept - slope * p.x));
    }
  }
  return { intercept, slope, comparables: points.length };
}

export type Feature = 'tvl' | 'growth' | 'age';
export const FEATURES: Feature[] = ['tvl', 'growth', 'age'];
const DAY = 86_400_000;

export function featureValue(row: SnapshotProtocol, asOf: string, feature: Feature): number | null {
  if (feature === 'tvl') return row.tvl_usd > 0 ? Math.log(row.tvl_usd) : null;
  if (feature === 'growth') return row.change_7d === null ? null : Math.asinh(row.change_7d / 100);
  const days = (Date.parse(asOf) - Date.parse(row.listed_at ?? '')) / DAY;
  return Number.isFinite(days) && days >= 0 ? Math.log1p(days) : null;
}

export function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return (sorted[middle]! + sorted[Math.floor((sorted.length - 1) / 2)]!) / 2;
}

/** Gaussian elimination with partial pivoting on a small standardized system. */
function solve(matrix: number[][]): number[] | null {
  for (let col = 0; col < matrix.length; col++) {
    let pivot = col;
    for (let row = col + 1; row < matrix.length; row++) {
      if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!)) pivot = row;
    }
    [matrix[col], matrix[pivot]] = [matrix[pivot]!, matrix[col]!];
    const diagonal = matrix[col]![col]!;
    if (Math.abs(diagonal) < 1e-10) return null;
    matrix[col] = matrix[col]!.map(value => value / diagonal);
    for (let row = 0; row < matrix.length; row++) {
      if (row === col) continue;
      const factor = matrix[row]![col]!;
      matrix[row] = matrix[row]!.map((value, i) => value - factor * matrix[col]![i]!);
    }
  }
  return matrix.map(row => row.at(-1)!);
}

/** Huber IRLS with preprocessing estimated exclusively on the training rows. */
export function fitMultivariate(rows: SnapshotProtocol[], asOf: string, features = FEATURES, penalty = 0) {
  if (rows.length <= features.length) return null;
  const inputs = features.map(feature => {
    const values = rows.map(row => featureValue(row, asOf, feature)).filter(v => v !== null);
    if (!values.length) return null;
    const center = median(values);
    const scale = Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length);
    return scale > 0 ? { feature, center, scale, min: Math.min(...values), max: Math.max(...values) } : null;
  });
  if (inputs.some(input => input === null)) return null;
  const columns = inputs.filter(input => input !== null);
  const design = rows.map(row => [1, ...columns.map(({ feature, center, scale }) =>
    ((featureValue(row, asOf, feature) ?? center) - center) / scale)]);
  const targets = rows.map(row => Math.log(row.mcap_usd!));
  let beta = Array<number>(features.length + 1).fill(0);
  let weights = rows.map(() => 1);
  for (let iteration = 0; iteration < 200; iteration++) {
    const system = beta.map((_, i) => [...beta, 0].map((_, j) =>
      design.reduce((sum, x, k) => sum + weights[k]! * x[i]! * (j === beta.length ? targets[k]! : x[j]!), 0)));
    // Penalize standardized growth and age slopes; leave TVL and the intercept free.
    columns.forEach(({ feature }, i) => {
      if (feature !== 'tvl') system[i + 1]![i + 1]! += rows.length * penalty;
    });
    const next = solve(system);
    if (!next) return null;
    const converged = next.every((value, i) => Math.abs(value - beta[i]!) < 1e-10);
    beta = next;
    if (converged) {
      return { intercept: beta[0]!, comparables: rows.length, terms: columns.map((input, i) =>
        ({ ...input, coefficient: beta[i + 1]! / input.scale })) };
    }
    weights = design.map((x, i) => Math.min(1, HUBER_DELTA /
      Math.abs(targets[i]! - x.reduce((sum, value, j) => sum + value * beta[j]!, 0))));
  }
  return null;
}

export type MultivariateFit = NonNullable<ReturnType<typeof fitMultivariate>>;

export function valuationParts(fit: MultivariateFit, row: SnapshotProtocol, asOf: string) {
  return Object.fromEntries(fit.terms.map(({ feature, center, coefficient }) =>
    [feature, ((featureValue(row, asOf, feature) ?? center) - center) * coefficient]));
}
