import routes from '../dashboard/01-farming-routes.json' with { type: 'json' };
import type { SnapshotProtocol } from './model.ts';

import review from './participation-review.json' with { type: 'json' };
export const participationReview = (slug: string) => Object.hasOwn(review, slug) ? review[slug as keyof typeof review] : null;

type Route = {
  sources: string[]; entry: string; action: string; exit: string;
  capital?: string; fees?: string; settlement?: string; risks?: string;
  reviewed_at?: string;
};

export function documentedRoute(slug: string): Route | null {
  const profile = Object.hasOwn(routes, slug) ? routes[slug][0] : null;
  if (!profile) return null;
  return {...profile, action: profile.action ?? 'Confirm the selected product and preview the transaction before signing.',
    fees: profile.fees ?? 'Obtain transaction and exit quotes.', capital: profile.capital ?? 'Minimum unverified.',
    settlement: profile.settlement ?? profile.exit};
}

function categoryRoute(category: string) {
  if (/lend|cdp|collateral/.test(category)) return [
    'Identify a supported supply or collateral market. Check the asset, caps, interest terms and liquidation threshold if borrowing.',
    'If a suitable supply route is verified, preview a supply transaction and record the receipt or position balance after execution.',
    'Check available liquidity and repay any outstanding debt before withdrawing collateral.',
  ];
  if (/dex|yield|vault|allocator|curator/.test(category)) return [
    'Identify an official pool or vault, its accepted assets, strategy and share or LP token. Review asset and contract risk.',
    'If the pool is accessible and suitable, preview a deposit and record the actual shares or LP balance received.',
    'Preview a withdrawal, check liquidity, slippage and any queue, then redeem when the terms are acceptable.',
  ];
  if (/bridge/.test(category)) return [
    'Verify a supported origin, destination and asset in official product docs. Check bridge security and destination liquidity.',
    'If you need the transfer, preview the fee and minimum received. Track the originating transaction until funds arrive.',
    'Verify destination receipt and check the independently documented return route before committing more capital.',
  ];
  if (/stak/.test(category)) return [
    'Identify the eligible staking asset and validator or vault. Check delegation terms, unbonding and slashing risk.',
    'If the route and risks are acceptable, preview the stake and record its receipt or position balance.',
    'Check current unstake and claim conditions before requesting withdrawal. Track any cooldown until the funds are spendable.',
  ];
  return null;
}

export function farmPlan(p: SnapshotProtocol): string[] {
  const documented = documentedRoute(p.slug);
  const finding = participationReview(p.slug);
  if (!documented && finding) return [
    'Research only. ' + finding.finding + ' Source: ' + finding.sources[0] + '.',
    'Check the named product, access terms, transaction quote and exit mechanism with the issuer. Allow 20 minutes for review as a planning assumption.',
    'Leave capital uncommitted while fees, eligibility or settlement are unresolved. Research transaction budget: $0. No individual reward is established.',
  ];
  const category = categoryRoute((p.category ?? '').toLowerCase());
  if (!documented && !category) return [
    `Research only. Find ${p.name}'s official user guide and verify whether a user-facing route exists. Risks and entry requirements are unknown. Cost: $0 transaction budget for research. Time: allow 20 minutes as a planning estimate.`,
    'Record the supported asset, access requirements and any quoted costs only when confirmed. Reward eligibility is unknown. Cost: $0 while checking. Time: allow 15 minutes as a planning estimate.',
    'Keep capital uncommitted until you can verify both entry and exit, including any delay or loss exposure. Cost: $0 while evaluating. Time: allow 10 minutes as a planning estimate.',
  ];

  const level = documented ? 'Documented route' : 'Conditional route';
  const [entry, action, exit] = documented ? [documented.entry, documented.action, documented.exit] : category!;
  const sources = documented ? ` Source: ${documented.sources.join(' ')}.` : '';
  return [
    `${level}. ${p.name}. ${entry}${sources} Cost: $0 transaction budget for review. Time: allow 20 minutes for review (planning estimate).`,
    `${action} Cost: ${documented?.fees ?? "Use a live entry quote; separate fees from capital."} Time: allow 15 minutes for setup (planning estimate).`,
    `${exit} Cost: verify exit costs in the transaction quote. Time: allow 15 minutes for handling (planning estimate). ${documented?.settlement ?? "Settlement varies."}`,
    'Airdrop eligibility is unknown. If a campaign is published, check the official terms for your exact product and activity. Cost: $0 to review. Time: allow 10 minutes (planning estimate).',
  ];
}
