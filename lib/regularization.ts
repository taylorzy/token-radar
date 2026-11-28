import type { SnapshotProtocol } from './model.ts';
import { FEATURES, fitMultivariate, valuationParts, type MultivariateFit } from './valuation.ts';

export const PENALTIES = [0, 0.1, 1, 3, 10, 30, 100];

export function predictLog(fit: MultivariateFit, row: SnapshotProtocol, asOf: string): number {
  return fit.intercept + Object.values(valuationParts(fit, row, asOf)).reduce((sum, part) => sum + part, 0);
}

/** Four deterministic inner folds. Training medians and coefficients are refit in every fold. */
export function selectPenalty(rows: SnapshotProtocol[], asOf: string, grid = PENALTIES) {
  const ordered = rows.slice().sort((a, b) => a.slug < b.slug ? -1 : a.slug === b.slug ? 0 : 1);
  const errors = grid.map(penalty => {
    let total = 0;
    for (let fold = 0; fold < 4; fold++) {
      const fit = fitMultivariate(ordered.filter((_, i) => i % 4 !== fold), asOf, FEATURES, penalty);
      if (!fit) return Number.POSITIVE_INFINITY;
      for (let i = fold; i < ordered.length; i += 4) {
        const row = ordered[i]!;
        total += Math.abs(predictLog(fit, row, asOf) - Math.log(row.mcap_usd!));
      }
    }
    return total / rows.length;
  });
  return { penalty: grid[errors.indexOf(Math.min(...errors))]!, errors };
}
