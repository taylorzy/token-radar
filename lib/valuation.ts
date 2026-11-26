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
