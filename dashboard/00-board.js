const valuationOrder = Object.freeze({sort:'implied', dir:-1});

function sortRadarRows(list, state, simulated, decisions) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'experiment') { av = simulated.get(a.slug).value; bv = simulated.get(b.slug).value; }
      else if (key === 'decision') { av = decisions.get(a.slug).opportunityRank; bv = decisions.get(b.slug).opportunityRank; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'cap') { av = a.mcap_usd ?? -Infinity; bv = b.mcap_usd ?? -Infinity; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      if (key === 'implied') return a.rank - b.rank;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
