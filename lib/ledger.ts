import type { BoardRow, Snapshot } from './model.ts';
import { classifyProtocols, VERSIONED } from './classification.ts';

/** One disposition and one evidence-backed classification per input slug. */
export function buildLedger(snapshot: Snapshot, board: BoardRow[]) {
  const classification = classifyProtocols(snapshot.protocols);
  const ranks = new Map(board.map(row => [row.slug, row.rank]));
  const watchlist = new Set(snapshot.watchlist);
  const rows = snapshot.protocols.map(protocol => {
    const { slug, name, category, tvl_usd, mcap_usd, gecko_id, symbol } = protocol;
    const { status, evidence } = classification.get(slug)!;
    const rank = ranks.get(slug) ?? null;
    const required = watchlist.has(slug);
    const candidate = status === 'Pre-token candidate' && category !== 'CEX' && !VERSIONED.test(name)
      && mcap_usd === null && gecko_id === null && symbol === null;
    if ((rank !== null) !== (required || candidate)) throw new Error(`Board/ledger mismatch: ${slug}`);
    return { slug, name, category, tvl_usd, mcap_usd, gecko_id, symbol, status, evidence,
      watchlist: required, below_tvl_floor: tvl_usd < snapshot.floor_usd, rank,
      disposition: required ? 'mandatory_watchlist' : candidate ? 'optional_candidate' : 'excluded' };
  });
  if (new Set(rows.map(row => row.slug)).size !== snapshot.protocols.length ||
      watchlist.size !== snapshot.watchlist.length || ranks.size !== board.length ||
      rows.filter(row => row.watchlist).length !== watchlist.size ||
      rows.filter(row => row.rank !== null).length !== board.length) {
    throw new Error('Ledger coverage or uniqueness mismatch');
  }
  const count = (key: 'status' | 'disposition') => Object.fromEntries(
    [...new Set(rows.map(row => row[key]))].sort().map(value => [value, rows.filter(row => row[key] === value).length]));
  return { as_of: snapshot.as_of, source: snapshot.source, count: rows.length,
    by_status: count('status'), by_disposition: count('disposition'), rows };
}
