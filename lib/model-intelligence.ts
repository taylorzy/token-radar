import { classifyProtocols, externalEvidence } from './classification.ts';
import { impliedValue, MODEL, ageDays, type BoardRow, type Snapshot, type SnapshotProtocol } from './model.ts';
import { median, FEATURES, fitMultivariate, fitValuation, isComparable, valuationParts, type MultivariateFit } from './valuation.ts';
import { intervalStudy, peerSupport, quantile } from './interval-study.ts';
import { protocolGroups, tokenPresence } from './token-presence.ts';
import routes from '../dashboard/01-farming-routes.json' with { type: 'json' };
import { participationReview } from './farming.ts';
import frozen from './frozen-model-review.json' with { type: 'json' };

const dollar = (v: number) => Math.max(1, Math.round(v));
const logDollar = (x: number) => dollar(Math.exp(x));
const slugOrder = (a: string, b: string) => a < b ? -1 : a === b ? 0 : 1;
function rankRows(rows: { slug: string; value: number | null }[]) {
  return new Map(rows.filter((r): r is { slug: string; value: number } => r.value !== null)
    .sort((a, b) => b.value - a.value || slugOrder(a.slug, b.slug)).map((r, i) => [r.slug, i + 1]));
}
function estimate(fit: MultivariateFit, p: SnapshotProtocol, asOf: string) {
  const parts = valuationParts(fit, p, asOf);
  return dollar(Math.exp(fit.intercept + (parts.tvl ?? 0)) * Math.exp(parts.growth ?? 0) * Math.exp(parts.age ?? 0));
}

export function modelIntelligence(snapshot: Snapshot, board: BoardRow[]) {
  const peers = snapshot.protocols.filter(isComparable);
  const asOf = snapshot.as_of;
  const classes = classifyProtocols(snapshot.protocols);
  const groups = protocolGroups(snapshot.protocols, classes);
  const presence = tokenPresence(snapshot, classes);
  const interval = intervalStudy(peers, asOf, groups);
  const primary = frozen.sensitivity as MultivariateFit;
  const anchor = fitValuation(peers);
  if (!anchor || peers.length < 30) throw new Error('Missing valuation comparables');
  // Previously selected model specifications, fit once to the sealed snapshot.
  const alternatives = {
    growth: fitMultivariate(peers, asOf, ['tvl', 'growth']),
    age: fitMultivariate(peers, asOf, ['tvl', 'age']),
    m7: fitMultivariate(peers, asOf, FEATURES, 0),
    expanded: fitMultivariate(peers, asOf, FEATURES, 100),
  };
  if (Object.values(alternatives).some(fit => !fit)) throw new Error('An archived model could not fit');
  const support = peerSupport(primary, peers, asOf);
  const bySlug = new Map(snapshot.protocols.map(r => [r.slug, r]));
  const growthTerm = primary.terms.find(t => t.feature === 'growth')!;
  const normalGrowth = Math.sinh(growthTerm.center) * 100;
  const stress = [
    ['reference', 'Peer median growth'], ['clamp', 'Growth within peer bounds'],
    ['flat', 'Zero weekly growth'], ['tvl25', 'TVL down 25%'], ['age365', 'One more tracking year'],
  ] as const;
  const baseRows = board.map(row => {
    const p = bySlug.get(row.slug)!;
    const base = impliedValue(p, asOf, MODEL).implied;
    const primaryValue = p.tvl_usd > 0 ? estimate(primary, p, asOf) : base;
    if (primaryValue !== row.implied_value_usd) throw new Error(`V3 model mismatch: ${row.slug}`);
    const models = {
      starter: base, tvl: p.tvl_usd > 0 ? logDollar(anchor.intercept + anchor.slope * Math.log(p.tvl_usd)) : base,
      ...Object.fromEntries(Object.entries(alternatives).map(([name, fit]) =>
        [name, p.tvl_usd > 0 ? estimate(fit!, p, asOf) : base])), m71: primaryValue,
    };
    const scenarios = Object.fromEntries(stress.map(([name]) => {
      const change = { ...p };
      if (name === 'reference') change.change_7d = normalGrowth;
      if (name === 'flat') change.change_7d = 0;
      if (name === 'clamp' && change.change_7d !== null) {
        change.change_7d = 100 * Math.sinh(Math.min(growthTerm.max, Math.max(growthTerm.min, Math.asinh(change.change_7d / 100))));
      }
      if (name === 'tvl25') change.tvl_usd *= 0.75;
      if (name === 'age365' && ageDays(asOf, p.listed_at) !== null) {
        change.listed_at = new Date(Date.parse(p.listed_at!) - 365 * 86400000).toISOString().slice(0, 10);
      }
      return [name, change.tvl_usd > 0 ? estimate(primary, change, asOf) : impliedValue(change, asOf, MODEL).implied];
    }));
    const sorted = Object.entries(models).sort((a, b) => a[1] - b[1]);
    const consensus = sorted[3]![1];
    const spread = Math.log(sorted.at(-1)![1] / sorted[0]![1]);
    return { row, p, models, scenarios, consensus, spread, sorted };
  });
  const modelRanks = Object.fromEntries(Object.keys(baseRows[0]!.models).map(key =>
    [key, rankRows(baseRows.map(r => ({ slug: r.row.slug, value: (r.models as Record<string, number>)[key]! })))]));
  const stressRanks = Object.fromEntries(stress.map(([key]) =>
    [key, rankRows(baseRows.map(r => ({ slug: r.row.slug, value: r.scenarios[key]! })))]));
  const disagreement = quantile(baseRows.map(r => r.spread), 0.9);
  const minAge = quantile(peers.map(r => ageDays(asOf, r.listed_at)).filter(x => x !== null), 0.1);
  const rows = baseRows.map(r => {
    const { p, row } = r;
    const cls = classes.get(p.slug)!;
    const s = support(p);
    const diagnostics = interval.assess(p);
    const flags: { kind: string; label: string; reason: string }[] = [];
    const add = (kind: string, label: string, reason: string) => flags.push({ kind, label, reason });
    if (s.missing.length) add('Observed', 'Imputed features', s.missing.join(', ') + ' use training medians.');
    if (s.outside.length) add('Statistical', 'Extrapolation', s.outside.join(', ') + ' lies outside fitted peer support.');
    if (s.weak) add('Statistical', 'Weak peer support', `Nearest standardized distance ${s.nearest.toFixed(2)}; peer P90 threshold ${s.threshold.toFixed(2)}. Missing or out-of-range features also trigger this flag.`);
    if ((p.change_7d ?? -Infinity) > 100 * Math.sinh(growthTerm.max)) {
      const prior = p.tvl_usd / (1 + p.change_7d! / 100);
      add('Heuristic', 'Possible low-base growth', `Weekly growth exceeds the fitted peer maximum; implied prior TVL about $${Math.round(prior).toLocaleString('en-US')} if both figures share the same basis. Cause unverified.`);
    }
    if (row.age_days !== null && row.age_days < minAge) add('Statistical', 'Short tracking history', `Below the known-age peer P10 (${minAge} days). Tracking start is a proxy.`);
    if (r.spread >= disagreement) add('Statistical', 'High model disagreement', 'Top decile of board log max/min spread.');
    if (cls.status !== 'Pre-token candidate') add('Observed', 'Watchlist exception', `${cls.status}. No propensity-weighted opportunity rank.`);
    const external = externalEvidence(p.slug);
    if (external) add('Documented', 'Protocol evidence', external.finding);
    add('Unknown', 'Launch and eligibility', 'Snapshot token absence and documented participation do not establish a future token launch or any individual airdrop.');
    const model = Object.fromEntries(Object.entries(r.models).map(([key, value]) =>
      [key, { value, rank: modelRanks[key]!.get(p.slug)! }]));
    const ranks = Object.values(model).map(x => x.rank);
    const local = interval.useAdaptive && !s.weak && !diagnostics.weak ? {
      low: logDollar(diagnostics.logCenter - diagnostics.adapted), high: logDollar(diagnostics.logCenter + diagnostics.adapted),
      center: logDollar(diagnostics.logCenter),
    } : null;
    const propensity = cls.status === 'Pre-token candidate' ? presence.score(p) : null;
    const factor = frozen.m71Uncertainty.factor;
    const terms = valuationParts(primary, p, asOf);
    const same = peers.filter(peer => peer.category === p.category);
    const describe = (peer: SnapshotProtocol) => ({
      name: peer.name, category: peer.category, slug: peer.slug, tvl: peer.tvl_usd,
      cap: peer.mcap_usd!, growth: peer.change_7d, days: ageDays(asOf, peer.listed_at),
      chains: peer.chains.filter(chain => p.chains.includes(chain)),
    });
    const categoryPeers = same.slice().sort((a, b) =>
      Math.abs(Math.log(a.tvl_usd / Math.max(1, p.tvl_usd))) - Math.abs(Math.log(b.tvl_usd / Math.max(1, p.tvl_usd))) || slugOrder(a.slug,b.slug));
    return {
      participation: participationReview(p.slug),
      comparables: { categoryCount: same.length, category: categoryPeers.slice(0,3).map(describe),
        numerical: s.neighbors.slice(0,3).map(n => ({...describe(peers[n.index]!), distance:n.distance})),
        categoryMultiple: same.length >= 5 ? median(same.map(peer => peer.mcap_usd! / peer.tvl_usd)) : null },
      slug: p.slug, models: model, consensus: r.consensus,
      span: { low: r.sorted[0], high: r.sorted.at(-1), ratio: Math.exp(r.spread), logSpread: r.spread },
      rankRange: [Math.min(...ranks), Math.max(...ranks)],
      terms: { growth: Math.exp(terms.growth!), age: Math.exp(terms.age!) },
      stress: Object.fromEntries(stress.map(([key]) => [key, { value: r.scenarios[key], rank: stressRanks[key]!.get(p.slug)! }])),
      uncertainty: { global: [dollar(row.implied_value_usd / factor), dollar(row.implied_value_usd * factor)],
        adaptive: local, localLogError: diagnostics.local, weak: s.weak || diagnostics.weak,
        nearestPeers: s.neighbors.slice(0, 3).map(n => peers[n.index]!.name) },
      flags, propensity, domainEvidence: external,
      conservative: Math.min(row.implied_value_usd, r.scenarios.clamp!, r.scenarios.tvl25!),
      documented: propensity && Object.hasOwn(routes, p.slug) ? r.consensus * propensity.propensity : null,
      opportunity: propensity ? r.consensus * propensity.propensity : null,
    };
  });
  const metrics = {
    consensus: 'Median valuation across seven related estimators',
    conservative: 'Minimum of V3, growth-clamped V3, and V3 with TVL down 25%',
    documented: 'Opportunity proxy restricted to candidates with a documented participation route; route evidence establishes feasibility only',
    opportunity: 'Consensus times snapshot token-presence propensity; exploratory proxy, not expected value',
  };
  const rank = Object.fromEntries(Object.keys(metrics).map(key => [key, rankRows(rows.map(r =>
    ({ slug: r.slug, value: r[key as keyof typeof metrics] })))]));
  return { features: { normalGrowth, extremeGrowth: 100 * Math.sinh(growthTerm.max), shortAge: minAge, stress, metrics },
    interval: interval.report, presence: presence.report, rows: rows.map(r => ({
      ...r, rankings: Object.fromEntries(Object.keys(metrics).map(key => [key, rank[key]!.get(r.slug) ?? null])),
    })) };
}
