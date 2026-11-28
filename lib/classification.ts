import evidenceFile from './protocol-evidence.json' with { type: 'json' };
import type { SnapshotProtocol } from './model.ts';

type Status = 'Recorded token' | 'Likely existing-token product' | 'Related product' | 'Uncertain' | 'Pre-token candidate';

export interface ExternalEvidence {
  reviewed_at: string;
  status: Status | null;
  finding: string;
  sources: string[];
}

const external = evidenceFile as Record<string, ExternalEvidence>;
export const externalEvidence = (slug: string): ExternalEvidence | null =>
  Object.hasOwn(external, slug) ? external[slug]! : null;

export interface Classification {
  status: Status;
  evidence: string[];
}

export const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;

function tokenEvidence(p: SnapshotProtocol): string[] {
  const evidence: string[] = [];
  if (p.symbol !== null) evidence.push('ticker ' + p.symbol);
  if (p.gecko_id !== null) evidence.push('CoinGecko ID ' + p.gecko_id);
  if (p.mcap_usd !== null) evidence.push('recorded market cap $' + p.mcap_usd);
  return evidence;
}

const wrapperCategories = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
const documentedWrappers = new Map([
  ['usdt0', 'The official kit identifies USDT0 as a product of an already traded token.'],
  ['wbtc', 'The kit input guide identifies WBTC as Bitcoin on Ethereum.'],
  ['binance-staked-eth', 'The kit input guide identifies this record as ETH in the Binance staking product.'],
]);
const familyBrands = new Set(['exponent', 'marginfi', 'felix', 'hyperbeat', 'ultrayield', 'hylo', 'plasma']);
const reviewed: Record<string, { peer: string; status: Status; evidence: string }> = {
  'mezo-earn': { peer: 'mezo-bridge', status: 'Related product', evidence: 'Shared Mezo brand across an incentives product and a bridge. The bridge ticker does not identify the Earn token.' },
  'starknet-btc-staking': { peer: 'starknet-bridge', status: 'Uncertain', evidence: 'The staking product names Starknet and deploys there. Its BTC designation and the bridge record do not establish STRK usage.' },
  'polygon-zkevm-bridge': { peer: 'polygon-bridge', status: 'Likely existing-token product', evidence: 'Both records describe Polygon-branded canonical bridges on Ethereum, with zkEVM identifying the specific product.' },
  'mantle-restaking': { peer: 'mantle-bridge', status: 'Related product', evidence: 'Both records use the Mantle brand on Ethereum. The categories differ and the restaking asset is unspecified.' },
  'manta-cedefi': { peer: 'manta-pacific', status: 'Uncertain', evidence: 'The name matches the Manta brand and the product deploys on Manta. The bridge record does not establish ownership or an asset relationship.' },
  'gmx-solana': { peer: 'gmx-evm', status: 'Likely existing-token product', evidence: 'Both use the GMX brand and derivatives category, with chain qualifiers distinguishing the products. The EVM ticker corroborates the brand match.' },
  'kava-mint': { peer: 'kava-lend', status: 'Related product', evidence: 'Shared Kava branding and chain, with complementary CDP and lending products. HARD is recorded for Lend only.' },
  'metalx-swap': { peer: 'metalx-lending', status: 'Related product', evidence: 'Both use the MetalX brand on Proton. Their swap and lending functions differ, and LOAN is recorded for Lending only.' },
};

export function classifyProtocols(protocols: SnapshotProtocol[]): Map<string, Classification> {
  const bySlug = new Map(protocols.map(p => [p.slug, p]));
  const brand = (p: SnapshotProtocol) => p.name.toLowerCase().split(/\s+/, 1)[0]!;
  return new Map(protocols.map(p => {
    const evidence = tokenEvidence(p);
    if (evidence.length) return [p.slug, { status: 'Recorded token', evidence }];

    evidence.push('Snapshot ticker, CoinGecko ID, and market cap are all null.');
    const finding = externalEvidence(p.slug);
    if (finding) {
      evidence.push(`External review, ${finding.reviewed_at}: ${finding.finding} Sources: ${finding.sources.join(' ')}`);
      if (finding.status) return [p.slug, { status: finding.status, evidence }];
    }
    const relation = Object.hasOwn(reviewed, p.slug) ? reviewed[p.slug] : undefined;
    const peer = relation && bySlug.get(relation.peer);
    if (relation && peer && tokenEvidence(peer).length) {
      evidence.push(relation.evidence, peer.name + ' (' + peer.slug + '): ' + tokenEvidence(peer).join(', ') + '.');
      return [p.slug, { status: relation.status, evidence }];
    }

    const documented = documentedWrappers.get(p.slug);
    if (documented) {
      evidence.push(documented);
      return [p.slug, { status: 'Likely existing-token product', evidence }];
    }

    if (p.category === 'CEX' || VERSIONED.test(p.name)) {
      evidence.push(p.category === 'CEX' ? 'Centralized exchange category.' : 'Name has a release suffix.');
      if (VERSIONED.test(p.name)) {
        const stem = p.name.replace(VERSIONED, '').toLowerCase();
        for (const q of protocols) {
          if (q.slug !== p.slug && q.name.replace(VERSIONED, '').toLowerCase() === stem) {
            evidence.push('Same version-stripped name as ' + q.name + ' (' + q.slug + ').');
          }
        }
      }
      return [p.slug, { status: 'Uncertain', evidence }];
    }

    if (familyBrands.has(brand(p))) {
      const siblings = protocols.filter(q => q.slug !== p.slug && brand(q) === brand(p)
        && q.chains.some(chain => p.chains.includes(chain)));
      for (const q of siblings) {
        const shared = p.chains.filter(chain => q.chains.includes(chain));
        evidence.push(q.name + ' (' + q.slug + ') shares the brand prefix and deploys on ' + shared.join(', ') + '.');
      }
      if (siblings.length) {
        evidence.push('Possible product family. Ownership and token sharing are unverified.');
        return [p.slug, { status: 'Related product', evidence }];
      }
    }

    if (wrapperCategories.has(p.category ?? '') || /\b(wrapped|staked|staking)\b/i.test(p.name)
        || /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i.test(p.name)) {
      evidence.push('Product category or name matches a watchlist wrapper or exchange screen. Parent and underlying asset are unverified.');
      return [p.slug, { status: 'Uncertain', evidence }];
    }
    return [p.slug, { status: 'Pre-token candidate', evidence }];
  }));
}
