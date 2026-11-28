// Recompute selected rows from the separate sealed-input extract. Compare every position.
function reconcileValuations(rows, ledger, inputRows, watchlist, analyzedCount, price) {
  const inputs = new Map(inputRows.map(([slug, tvl_usd, change_7d, listed_at]) =>
    [slug, {slug, tvl_usd, change_7d, listed_at}]));
  const records = new Map(ledger.map(row => [row.slug, row]));
  const required = new Set(watchlist);
  const selected = row => required.has(row.slug) || row.status === 'Pre-token candidate';
  const adjudicated = ledger.every(row => row.watchlist === required.has(row.slug)
    && row.disposition === (row.watchlist ? 'mandatory_watchlist' : selected(row) ? 'optional_candidate' : 'excluded')
    && (selected(row) || row.rank === null));
  const expected = ledger.filter(selected)
    .map(row => ({slug: row.slug, value: inputs.has(row.slug) ? price(inputs.get(row.slug)) : NaN}))
    .sort((a,b) => b.value - a.value || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const slugs = new Set(rows.map(row => row.slug));
  const covered = watchlist.filter(slug => slugs.has(slug)).length;
  let matched = 0;
  for (const [i, row] of rows.entries()) {
    const target = expected[i];
    const source = inputs.get(row.slug);
    if (target && source && row.rank === i + 1 && records.get(row.slug)?.rank === row.rank
        && row.slug === target.slug && row.implied_value_usd === target.value
        && row.tvl_usd === source.tvl_usd && row.change_7d === source.change_7d
        && row.listed_at === source.listed_at) matched++;
  }
  const unique = inputs.size === inputRows.length && records.size === ledger.length
    && inputRows.length === analyzedCount && inputRows.length === ledger.length && ledger.every(row => inputs.has(row.slug))
    && slugs.size === rows.length;
  const reconciled = unique && adjudicated && covered === required.size && required.size === watchlist.length
    && expected.length === rows.length && matched === rows.length;
  return {reconciled, unique, covered, matched, expected:expected.length};
}
if (typeof module !== 'undefined') module.exports = {reconcileValuations};
