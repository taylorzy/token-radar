import { documentedRoute } from './farming.ts';
import type { BoardRow } from './model.ts';

export interface FarmAssumptions {
  capitalUSD: number;
  feesUSD: number;
  holdingDays: number;
  annualPercent: number;
  laborHours: number;
  hourlyUSD: number;
  scenarioRewardUSD?: number | null;
}

/** Pure calculation. Also serialized to the offline calculator, so keep it self-contained. */
export function farmEconomics(input: FarmAssumptions) {
  const { capitalUSD, feesUSD, holdingDays, annualPercent, laborHours, hourlyUSD, scenarioRewardUSD } = input;
  const valid = (value: number) => Number.isFinite(value) && value >= 0;
  if (![capitalUSD, feesUSD, holdingDays, annualPercent, laborHours, hourlyUSD].every(valid) ||
    (scenarioRewardUSD != null && !valid(scenarioRewardUSD))) {
    return { error: 'Enter non-negative finite assumptions. Enter zero where it applies.' } as const;
  }
  const opportunityUSD = capitalUSD * annualPercent / 100 * holdingDays / 365;
  const laborUSD = laborHours * hourlyUSD;
  const requiredRewardUSD = feesUSD + opportunityUSD + laborUSD;
  const rewardPerHourUSD = laborHours === 0 ? null : requiredRewardUSD / laborHours;
  if (!Number.isFinite(requiredRewardUSD) || (rewardPerHourUSD !== null && !Number.isFinite(rewardPerHourUSD))) {
    return { error: 'Use smaller scenario inputs.' } as const;
  }
  return {
    capitalUSD, feesUSD, opportunityUSD, laborUSD, requiredRewardUSD, rewardPerHourUSD,
    verdict: scenarioRewardUSD == null ? 'reward assumption missing' :
      scenarioRewardUSD >= requiredRewardUSD ? 'covers modeled costs' : 'below modeled break-even',
  } as const;
}

export function farmingSummaries(board: BoardRow[], scenarios: Record<string, FarmAssumptions>) {
  const known = new Set(board.map(row => row.slug));
  for (const slug of Object.keys(scenarios)) {
    if (!known.has(slug)) throw new Error(`Unknown ranked protocol in farming assumptions: ${slug}`);
  }
  return board.map(row => {
    const route = documentedRoute(row.slug);
    const assumptions = Object.hasOwn(scenarios, row.slug) ? scenarios[row.slug]! : null;
    if (Object.hasOwn(scenarios, row.slug) && (!assumptions || typeof assumptions !== 'object')) {
      throw new Error(`Invalid farming assumptions for ${row.slug}`);
    }
    const economics = assumptions ? farmEconomics(assumptions) : null;
    if (economics && 'error' in economics) throw new Error(`${row.slug}: ${economics.error}`);
    return {
      slug: row.slug, rank: row.rank, route_type: row.farm_steps[0]!.split('.', 1)[0],
      route, farm_steps: row.farm_steps, airdrop_eligibility: 'not verified',
      assumptions, economics,
    };
  });
}
