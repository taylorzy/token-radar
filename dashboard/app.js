// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, classification: 'all', route: 'all', chain: 'all', showExperiment: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model, baseline, experimental) {
    var fit = experimental ? sandboxFit : model.regression;
    if (!baseline && fit && row.tvl_usd > 0) {
      if (!experimental) return Math.max(1, Math.round(Math.exp(fit.intercept + fit.slope * Math.log(row.tvl_usd))));
      var days = (Date.parse(DATA.as_of) - Date.parse(row.listed_at || '')) / 86400000;
      var inputs = {
        tvl: Math.log(row.tvl_usd),
        growth: row.change_7d == null ? null : Math.asinh(row.change_7d / 100),
        age: Number.isFinite(days) && days >= 0 ? Math.log1p(days) : null
      };
      var parts = {};
      fit.terms.forEach(function (term) {
        parts[term.feature] = ((inputs[term.feature] == null ? term.center : inputs[term.feature]) - term.center) * term.coefficient;
      });
      return Math.max(1, Math.round(Math.exp(fit.intercept + parts.tvl) * Math.exp(parts.growth * weights.growth) * Math.exp(parts.age * weights.age)));
    }
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    for (var key of ['q', 'category', 'classification', 'route', 'chain']) {
      if (params.has(key)) state[key] = params.get(key);
    }
    if (['live', 'research', 'accounting'].includes(params.get('tab'))) state.tab = params.get('tab');
    state.selected = state.tab === 'pre-token' ? params.get('p') : null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    for (var key of ['category', 'classification', 'route', 'chain']) {
      if (state[key] !== 'all') params.set(key, state[key]);
    }
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function routeOf(row) {
    return row.farm_steps[0].split('.', 1)[0];
  }

  function activeRows() {
    return state.tab === 'live' ? DATA.live : DATA.rows;
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return activeRows().filter(function (r) {
      if (state.chain !== 'all' && !r.chains.includes(state.chain)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      var classification = DATA.classification[r.slug];
      if (state.tab !== 'live' && (
        (state.classification !== 'all' && classification.status !== state.classification)
        || (state.route !== 'all' && routeOf(r) !== state.route)
      )) return false;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().includes(q);
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'experiment') { av = simulated.get(a.slug).value; bv = simulated.get(b.slug).value; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'cap') { av = a.mcap_usd ?? -Infinity; bv = b.mcap_usd ?? -Infinity; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  var account = window.RADAR_ACCOUNTING;
  var research = window.RADAR_RESEARCH;
  var byAccount = new Map(account.map(function (r) { return [r.slug, r]; }));
  var byRanked = new Map(DATA.rows.map(function (r) { return [r.slug, r]; }));
  var pins = new Set();
  var page = 0;
  var weights = { growth: 1, age: 1 };
  var sandboxFit = DATA.model.experimental;
  var simulated = new Map();

  function rerank() {
    var rows = DATA.rows.map(function (row) {
      return { slug: row.slug, value: impliedOf(row, DATA.model, false, true) };
    }).sort(function (a, b) { return b.value - a.value || (a.slug < b.slug ? -1 : 1); });
    simulated = new Map(rows.map(function (r, i) { return [r.slug, { value: r.value, rank: i + 1 }]; }));
  }

  function ledgerFacts() {
    var counts = {};
    account.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    var required = account.filter(function (r) { return r.watchlist; });
    var covered = required.filter(function (r) { return byRanked.has(r.slug); }).length;
    var unique = byAccount.size === account.length;
    var reconciled = account.length === DATA.analyzed_size && unique &&
      account.filter(function (r) { return r.rank !== null; }).length === DATA.rows.length &&
      DATA.rows.every(function (r, i) {
        return r.rank === i + 1 && byAccount.get(r.slug)?.rank === r.rank &&
          (i === 0 || r.implied_value_usd <= DATA.rows[i - 1].implied_value_usd);
      });
    return { counts: counts, required: required.length, covered: covered, unique: unique, reconciled: reconciled,
      exceptions: required.filter(function (r) { return r.status !== 'Pre-token candidate'; }).length };
  }

  function pinButton(row) {
    return el('button', { class: 'pin', type: 'button', 'data-pin': row.slug,
      'aria-label': 'Pin ' + row.name, 'aria-pressed': String(pins.has(row.slug)),
      text: pins.has(row.slug) ? 'Pinned' : 'Pin', onclick: function () {
        if (pins.has(row.slug)) pins.delete(row.slug);
        else if (pins.size < 4) pins.add(row.slug);
        refreshResults();
        resultHost.querySelector('[data-pin="' + row.slug + '"]')?.focus();
      } });
  }

  function comparePanel() {
    var rows = [...pins].map(function (slug) { return byRanked.get(slug); });
    return el('section', { class: 'panel compact comparison', id: 'comparison' },
      el('h2', { text: 'Pinned comparison · ' + pins.size + '/4' }),
      rows.length ? el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, ['Protocol', 'TVL', '7d', 'Tracking', 'Primary', 'Experimental', 'Evidence'].map(function (h) {
          return el('th', { scope: 'col', text: h });
        }))),
        el('tbody', null, rows.map(function (r) {
          var other = simulated.get(r.slug);
          return el('tr', null,
            el('td', null, el('button', { class: 'protocol-link', text: r.name, onclick: function () { openDetail(r.slug); } }), pinButton(r)),
            el('td', { text: fmtUsd(r.tvl_usd) }), el('td', { text: fmtPct(r.change_7d) }), el('td', { text: fmtAge(r.age_days) }),
            el('td', { text: '#' + r.rank + ' · ' + fmtUsd(r.implied_value_usd) }),
            el('td', { text: '#' + other.rank + ' · ' + fmtUsd(other.value) }),
            el('td', { text: byAccount.get(r.slug).status + ' · ' + routeOf(r) }));
        }))
      )) : el('p', { class: 'sub', text: 'Pin up to four rows on the board to compare them here.' }));
  }

  function valueRange(row) {
    return !DATA.uncertainty || row.tvl_usd <= 0 ? [null, null] :
      [Math.max(1, Math.round(row.implied_value_usd / DATA.uncertainty.factor)),
        Math.round(row.implied_value_usd * DATA.uncertainty.factor)];
  }

  function exportCsv() {
    var selected = sortedRows(rows());
    var header = ['rank', 'slug', 'name', 'tvl_usd', 'change_7d_pct', 'tracking_age_days',
      'primary_value_usd', 'peer_range_low_usd', 'peer_range_high_usd', 'classification',
      'mandatory_watchlist', 'farming_evidence', 'required_reward_usd', 'reward_per_hour_usd',
      'experimental_rank', 'experimental_value_usd'];
    var lines = [header, ...selected.map(function (r) {
      var [low, high] = valueRange(r);
      var quote = window.RADAR_FARM_SUMMARIES[r.slug].economics;
      var other = simulated.get(r.slug);
      return [r.rank, r.slug, r.name, r.tvl_usd, r.change_7d, r.age_days, r.implied_value_usd,
        low, high, byAccount.get(r.slug).status, byAccount.get(r.slug).watchlist, routeOf(r),
        quote?.requiredRewardUSD, quote?.rewardPerHourUSD, other.rank, other.value];
    })];
    var csv = lines.map(function (line) {
      return line.map(function (value) {
        var raw = typeof value === 'string' && /^[=+@\t\r-]/.test(value) ? "'" + value : String(value ?? '');
        return '"' + raw.replaceAll('"', '""') + '"';
      }).join(',');
    }).join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    el('a', { href: url, download: 'token-radar-filtered.csv' }).click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function accountingPanel() {
    var facts = ledgerFacts();
    var ledgerRows = account.filter(function (r) {
      return (state.classification === 'all' || state.classification === r.status) &&
        (!state.q || (r.name + ' ' + r.slug).toLowerCase().includes(state.q.toLowerCase()));
    });
    var pages = Math.max(1, Math.ceil(ledgerRows.length / 25));
    page = Math.min(page, pages - 1);
    return el('div', { class: 'view-stack' },
      el('section', { class: 'panel compact', id: 'accounting' },
        el('h2', { text: 'Full protocol accounting · ' + account.length + ' records' }),
        el('div', { class: 'ledger-totals' }, Object.entries(facts.counts).map(function (entry) {
          return el('div', null, el('b', { text: entry[1] }), el('span', { text: entry[0] }));
        })),
        el('p', { class: 'sub', text: (facts.unique && facts.reconciled ? 'Integrity passed' : 'Integrity mismatch') +
          ' · ' + byAccount.size + ' unique slugs · ' + facts.covered + '/' + facts.required +
          ' required · ' + facts.exceptions + ' mandatory exceptions · ' + (account.length - byRanked.size) + ' excluded' })),
      comparePanel(),
      el('section', { class: 'panel compact' },
        el('div', { class: 'ledger-pager' },
          el('button', { class: 'button', disabled: page === 0 ? '' : null, text: 'Previous', onclick: function () { page--; refreshResults(); } }),
          el('span', { text: ledgerRows.length + ' matches · page ' + (page + 1) + ' of ' + pages }),
          el('button', { class: 'button', disabled: page + 1 >= pages ? '' : null, text: 'Next', onclick: function () { page++; refreshResults(); } })),
        el('div', { class: 'table-wrap' }, el('table', null,
          el('thead', null, el('tr', null, ['Protocol', 'Classification', 'Accounting', 'Evidence'].map(function (h) { return el('th', { text: h }); }))),
          el('tbody', null, ledgerRows.slice(page * 25, (page + 1) * 25).map(function (r) {
            return el('tr', null,
              el('td', { text: r.name }), el('td', { text: r.status }),
              el('td', { text: r.watchlist ? 'Mandatory #' + r.rank : r.rank === null ? 'Excluded' : 'Optional #' + r.rank }),
              el('td', null, el('details', null, el('summary', { text: 'Review evidence' }), el('p', { text: r.evidence.join(' ') }))));
          }))))));
  }

  function peerChart() {
    var plot = el('canvas', { width: 650, height: 280, role: 'img',
      'aria-label': 'Log-scale scatter plot of 119 traded peer market caps against TVL with the fitted V1 line' });
    var ctx = plot.getContext('2d');
    if (!ctx) return plot;
    var peers = research.peers.map(function (r) { return [Math.log10(r[1]), Math.log10(r[2])]; });
    var limits = [0, 1].map(function (i) {
      return [Math.floor(Math.min(...peers.map(p => p[i]))), Math.ceil(Math.max(...peers.map(p => p[i])))];
    });
    var x = v => 65 + (v - limits[0][0]) / (limits[0][1] - limits[0][0]) * 560;
    var y = v => 235 - (v - limits[1][0]) / (limits[1][1] - limits[1][0]) * 205;
    ctx.font = '13px system-ui';
    for (var i = limits[0][0]; i <= limits[0][1]; i++) {
      ctx.strokeStyle = '#304255'; ctx.beginPath(); ctx.moveTo(x(i), 30); ctx.lineTo(x(i), 235); ctx.stroke();
      ctx.fillStyle = '#c2cfdb'; ctx.fillText('10^' + i, x(i) - 12, 253);
    }
    for (var j = limits[1][0]; j <= limits[1][1]; j++) {
      ctx.strokeStyle = '#304255'; ctx.beginPath(); ctx.moveTo(65, y(j)); ctx.lineTo(625, y(j)); ctx.stroke();
      ctx.fillStyle = '#c2cfdb'; ctx.fillText('10^' + j, 20, y(j) + 4);
    }
    ctx.fillText('TVL in USD', 300, 274);
    ctx.fillText('Market cap in USD', 64, 17);
    ctx.fillStyle = '#99b7e6';
    peers.forEach(function (p) {
      ctx.beginPath(); ctx.arc(x(p[0]), y(p[1]), 3, 0, Math.PI * 2); ctx.fill();
    });
    var fit = DATA.model.regression;
    ctx.strokeStyle = '#75e1c4'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x(limits[0][0]), y(fit.intercept / Math.LN10 + fit.slope * limits[0][0]));
    ctx.lineTo(x(limits[0][1]), y(fit.intercept / Math.LN10 + fit.slope * limits[0][1]));
    ctx.stroke();
    return plot;
  }

  function researchPanel() {
    var labels = { starter: 'Starter', v1: 'V1 TVL Huber', growth: 'TVL + growth', age: 'TVL + age',
      m7: 'M7 full', m71: 'M7.1 regularized', extended: 'M9 expanded' };
    var stats = research.comparisons;
    var preset = el('select', { id: 'sandbox-fit', 'aria-label': 'Experimental fit' },
      el('option', { value: 'expanded', text: 'M9 expanded fit' }),
      el('option', { value: 'm71', text: 'M7.1 sensitivity fit' }));
    preset.value = sandboxFit === research.sensitivity ? 'm71' : 'expanded';
    preset.onchange = function () {
      sandboxFit = preset.value === 'm71' ? research.sensitivity : DATA.model.experimental;
      rerank(); refreshResults(); resultHost.querySelector('#sandbox-fit').focus();
    };
    var sample = el('select', { id: 'sandbox-protocol', 'aria-label': 'Protocol for sensitivity' },
      DATA.rows.map(function (r) { return el('option', { value: r.slug, text: r.name }); }));
    sample.value = state.sample || 'nuva';
    var sensitivity = el('p', { class: 'sensitivity', id: 'sandbox-result', 'aria-live': 'polite' });
    function describe() {
      var leaders = document.getElementById('sandbox-leaders');
      if (leaders) leaders.replaceChildren(...[...simulated].slice(0, 3).map(item => el('li', { text: byRanked.get(item[0]).name + ' / ' + fmtUsd(item[1].value) })));
      var row = byRanked.get(sample.value), other = simulated.get(sample.value);
      sensitivity.textContent = row.name + ' · primary #' + row.rank + ' ' + fmtUsd(row.implied_value_usd) +
        ' · experiment #' + other.rank + ' ' + fmtUsd(other.value);
    }
    sample.onchange = function () { state.sample = sample.value; describe(); };
    var sliders = ['growth', 'age'].map(function (key) {
      var readout = el('b', { text: weights[key].toFixed(1) + '×' });
      var input = el('input', { id: 'weight-' + key, type: 'range', min: 0, max: 2, step: 0.1, value: weights[key] });
      input.oninput = function () {
        weights[key] = input.valueAsNumber;
        rerank(); readout.textContent = weights[key].toFixed(1) + '×'; describe();
      };
      return el('label', null, key === 'growth' ? 'Growth term' : 'Tracking-age term', input, readout);
    });
    describe();
    return el('div', { class: 'view-stack' },
      el('div', { class: 'research-grid' },
        el('section', { class: 'panel compact' },
          el('h2', { text: 'Market comparables' }), peerChart(),
          el('p', { class: 'sub', text: research.peers.length + ' traded peers · teal line: V1 Huber fit · both axes logarithmic' })),
        el('section', { class: 'panel compact' },
          el('h2', { text: 'Held-out model selection' }),
          el('p', { class: 'sub', text: 'Mean absolute log market-cap error. Lower is better.' }),
          el('table', null, el('thead', null, el('tr', null,
            el('th', { text: 'Model' }), el('th', { text: 'Leave one out' }), el('th', { text: 'Age cohorts' }))),
            el('tbody', null, Object.entries(labels).map(function (entry) {
              return el('tr', { class: entry[0] === 'v1' ? 'chosen' : '' }, el('td', { text: entry[1] }),
                el('td', { text: stats.loo[entry[0]].mean.toFixed(3) }), el('td', { text: stats.age[entry[0]].mean.toFixed(3) }));
            }))),
          el('p', { class: 'sub', text: 'Growth and age were tested in isolation and together. They did not reliably improve valuation or ranking. These data describe traded peers on one snapshot.' }))),
      el('section', { class: 'panel compact sandbox' },
        el('h2', { text: 'Experimental ranking sandbox' }),
        el('p', { class: 'sub', text: 'TVL remains fitted. Scale the fitted growth and tracking-age terms from zero to twice their fitted contribution. Every change recomputes all candidate ranks. The primary board and its uncertainty range are fixed.' }),
        el('div', { class: 'sandbox-controls' }, preset, sample, sliders),
        sensitivity,
        el('button', { class: 'button', text: state.showExperiment ? 'Hide experiment on board' : 'Show experiment on board', onclick: function () {
          state.showExperiment = !state.showExperiment;
          state.tab = 'pre-token'; state.sort = 'implied'; state.dir = -1; renderControls(); refreshResults();
        } }),
        el('ol', { class: 'experiment-leaders', id: 'sandbox-leaders' },
          [...simulated].slice(0, 3).map(function (item) {
            return el('li', { text: byRanked.get(item[0]).name + ' · ' + fmtUsd(item[1].value) });
          }))));
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var facts = ledgerFacts();
    var summary = [account.length + ' records', DATA.rows.length + ' ranked', facts.covered + '/' + facts.required + ' watchlist',
      facts.exceptions + ' mandatory exceptions', (facts.reconciled ? 'Ledger reconciled' : 'Ledger mismatch')];
    return el('section', { class: 'lede' },
      el('h1', { text: 'Protocol launch radar' }),
      el('div', { class: 'ledger-totals' }, summary.map(function (fact) { return el('b', { text: fact }); })));
  }

  function filter(key, label, choices) {
    var select = el('select', { id: key },
      el('option', { value: 'all', text: 'All ' + label.toLowerCase() }),
      choices.map(function (choice) { return el('option', { value: choice, text: choice }); })
    );
    select.value = state[key];
    if (!select.value) state[key] = select.value = 'all';
    select.addEventListener('change', function () { state[key] = select.value; refreshResults(); });
    return el('div', { class: 'field' }, el('label', { for: key, text: label }), select);
  }

  function controls() {
    var ranked = state.tab === 'pre-token';
    var accounting = state.tab === 'accounting';
    var showingRows = ranked || state.tab === 'live';
    var categories = Array.from(new Set(activeRows().map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category or chain', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; refreshResults(); });
    function tab(id, label) {
      return el('button', { type: 'button', 'aria-pressed': String(state.tab === id), text: label, onclick: function () {
        if (state.tab === id) return;
        state.tab = id;
        state.category = state.classification = state.chain = 'all';
        state.q = ''; page = 0;
        state.sort = id === 'live' ? 'cap' : 'implied';
        state.dir = -1;
        renderControls();
        refreshResults();
        controlHost.querySelector('[aria-pressed="true"]').focus();
      } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'tabs', 'aria-label': 'Protocol universe' }, tab('pre-token', 'Ranked board'), tab('live', 'Live-token sample'), tab('research', 'Model research'), tab('accounting', 'Accounting & comparison')),
      state.tab !== 'research' ? el('div', { class: 'field search' }, el('label', { for: 'q', text: 'Search' }), search) : null,
      showingRows ? filter('category', 'Categories', categories) : null,
      showingRows ? filter('chain', 'Chains', [...new Set(activeRows().flatMap(r => r.chains))].sort()) : null,
      ranked || accounting ? filter('classification', 'Classifications', [...new Set((ranked ? DATA.rows.map(r => byAccount.get(r.slug)) : account).map(r => r.status))].sort()) : null,
      ranked ? filter('route', 'Routes', ['Documented route', 'Conditional route', 'Research only']) : null,
      ranked ? el('button', { type: 'button', class: 'button', text: 'Export filtered CSV', onclick: exportCsv }) : null,
      state.tab !== 'research' ? el('button', { type: 'button', class: 'button', text: 'Clear filters', onclick: function () {
        state.q = '';
        state.category = state.classification = state.route = state.chain = 'all'; page = 0;
        renderControls();
        refreshResults();
        controlHost.querySelector('#q').focus();
      } }) : null
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', 'aria-sort': state.sort === key ? (state.dir < 0 ? 'descending' : 'ascending') : null },
      el('button', { type: 'button', 'data-sort': key, onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; } refreshResults(); resultHost.querySelector('[data-sort=' + key + ']').focus(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u2193' : ' \u2191' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    var tbody = el('tbody');
    list.forEach(function (r) {
      var ledger = byAccount.get(r.slug);
      var [low, high] = valueRange(r);
      var plan = window.RADAR_FARM_SUMMARIES[r.slug];
      var quote = plan.economics;
      var alternative = simulated.get(r.slug);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-slug': r.slug
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('button', { class: 'protocol-link', type: 'button', text: r.name, onclick: function () { openDetail(r.slug); } }),
          pinButton(r),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('strong', { class: 'num pos', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub block', text: fmtUsd(low) + ' to ' + fmtUsd(high) })),
        state.showExperiment ? el('td', { class: 'num', text: '#' + alternative.rank + ' / ' + fmtUsd(alternative.value) }) : null,
        el('td', null, el('span', { class: 'status', 'data-status': ledger.status, text: ledger.status }),
          el('span', { class: 'sub block', text: ledger.watchlist ?
            (ledger.status === 'Pre-token candidate' ? 'Mandatory watchlist' : 'Mandatory exception') : 'Optional candidate' })),
        el('td', null, el('span', { class: 'status route', 'data-status': routeOf(r), text: routeOf(r) }),
          quote ? el('span', { class: 'sub block', text: 'Scenario: ' + fmtUsd(quote.requiredRewardUSD) + ' required / ' +
            fmtUsd(quote.rewardPerHourUSD) + '/h / ' + quote.verdict }) : el('span', { class: 'sub block', text: plan.route ? new URL(plan.route.sources[0]).hostname : 'No cost scenario' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Select a protocol to inspect its valuation, evidence and farming plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            el('th', { scope: 'col', text: 'Tracking age' }),
            sortHeader('implied', 'Primary / peer range'),
            state.showExperiment ? sortHeader('experiment', 'Experimental') : null,
            el('th', { scope: 'col', text: 'Token evidence' }),
            el('th', { scope: 'col', text: 'Farming evidence' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    sortedRows(rows()).forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: DATA.classification[r.slug].status, title: DATA.classification[r.slug].evidence.join(' ') }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Displayed sample of token-bearing protocols, selected by recorded market cap.' }),
          el('thead', null, el('tr', null, sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'), sortHeader('cap', 'Market cap'), el('th', { scope: 'col', text: 'Token evidence' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var fit = DATA.model.regression;
    var scores = research.comparisons;
    return el('section', { class: 'panel model compact' },
      el('div', null, el('h2', { text: 'Primary valuation: TVL Huber' }),
        el('p', { class: 'formula', text: 'USD = exp(' + fit.intercept.toFixed(6) + ' + ' + fit.slope.toFixed(6) + ' * ln(TVL))' }),
        el('p', { class: 'sub', text: '80th-percentile peer-error range: divide or multiply by ' + DATA.uncertainty.factor.toFixed(2) +
          '. Cross-sectional traded peers; launch coverage unknown.' })),
      el('div', { class: 'validation' },
        el('p', null, el('strong', { text: scores.loo.v1.mean.toFixed(3) + ' leave-one-out / ' + scores.age.v1.mean.toFixed(3) + ' age cohorts' })),
        el('p', { class: 'sub', text: 'Mean absolute log error on ' + research.peers.length +
          ' peers. Growth and age did not consistently improve held-out results. See Model research.' })));
  }

  function farmingCalculator(slug) {
    var fields = [
      ['Capital committed (USD)', '1000'],
      ['Total entry and exit fees (USD)', '10'],
      ['Holding period (days)', '30'],
      ['Annual opportunity cost (%)', '5'],
      ['Labor (hours)', '1'],
      ['Hourly value (USD)', '20']
    ];
    var inputs = fields.map(function (field) {
      return el('input', { type: 'number', min: '0', step: 'any', placeholder: field[1] });
    });
    var reward = el('input', { type: 'number', min: '0', step: 'any' });
    var planning = window.RADAR_FARM_SUMMARIES[slug];
    var result = el('p', { class: 'scenario-result', 'aria-live': 'polite' });
    function update() {
      var values = inputs.map(function (input) { return input.valueAsNumber; });
      var input = {
        capitalUSD: values[0], feesUSD: values[1], holdingDays: values[2], annualPercent: values[3],
        laborHours: values[4], hourlyUSD: values[5], scenarioRewardUSD: reward.value === '' ? null : reward.valueAsNumber
      };
      var summary = window.RADAR_FARM_ECONOMICS(input);
      if (summary.error) {
        result.textContent = summary.error;
        return;
      }
      function money(value) { return '$' + value.toFixed(2); }
      result.textContent = 'Break-even reward ' + money(summary.requiredRewardUSD) +
        '. Capital committed ' + money(summary.capitalUSD) + '. Estimated fees ' + money(summary.feesUSD) +
        ', foregone return ' + money(summary.opportunityUSD) + ', and labor value ' + money(summary.laborUSD) +
        '. Required reward per labor hour ' + (summary.rewardPerHourUSD === null ? 'n/a' : money(summary.rewardPerHourUSD)) +
        '. Conditional verdict: ' + summary.verdict + '.';
      return { input: input, summary: summary };

    }
    var labels = inputs.map(function (input, i) {
      return el('label', null, fields[i][0], input);
    });
    if (planning.assumptions) {
      var a = planning.assumptions;
      [a.capitalUSD, a.feesUSD, a.holdingDays, a.annualPercent, a.laborHours, a.hourlyUSD].forEach(function (value, i) {
        inputs[i].value = value;
      });
      if (a.scenarioRewardUSD != null) reward.value = a.scenarioRewardUSD;
    }
    update();
    return el('section', { class: 'detail-section' },
      el('h3', { text: 'Illustrative farming costs' }),
      el('p', { class: 'sub', text: 'Example values are illustrative assumptions. Enter your own fee quotes and time estimates.' }),
      planning.route && planning.route.capital ? el('p', { class: 'sub', text:
        'Capital: ' + planning.route.capital + ' Fees: ' + planning.route.fees +
        ' Settlement: ' + planning.route.settlement + ' Risks: ' + planning.route.risks }) : null,
      el('div', { class: 'farm-calculator', oninput: update }, labels,
        el('label', null, 'Hypothetical reward (USD, optional)', reward)),
      el('button', { type: 'button', class: 'button', text: 'Load example assumptions', onclick: function () {
        inputs.forEach(function (input, i) { input.value = fields[i][1]; });
        reward.value = '';
        update();
      } }),
      el('button', { class: 'button', text: 'Use scenario on board', onclick: function () {
        var scenario = update();
        if (!scenario) return;
        planning.assumptions = scenario.input; planning.economics = scenario.summary;
        result.appendChild(document.createTextNode(' Scenario added to board.'));
        refreshResults();
      } }),
      result,
      el('p', { class: 'sub', text: 'Break-even is fees plus simple foregone return plus labor value, before taxes or protocol gains or losses.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var classification = DATA.classification[row.slug];
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: classification.status }),
      byAccount.get(slug).watchlist && classification.status !== 'Pre-token candidate' ?
        el('p', { class: 'sub', text: 'Mandatory watchlist exception. Inclusion follows the sealed watchlist.' }) : null,
      el('p', { class: 'sub', text: classification.evidence.join(' ') })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Tracking age' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Huber implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        DATA.model.experimental && row.tvl_usd > 0 ? el('div', null, el('span', { text: 'Experimental fit' }), el('b', { class: 'num', text: fmtUsd(impliedOf(row, DATA.model, false, true)) })) : null,
        el('div', null, el('span', { text: 'Original comparator' }), el('b', { class: 'num', text: fmtUsd(impliedOf(row, DATA.model, true)) }))
      ),
      DATA.uncertainty && row.tvl_usd > 0 ? el('p', { class: 'sub',
        text: 'Empirical 80% peer-error range: ' +
          fmtUsd(Math.max(1, Math.round(row.implied_value_usd / DATA.uncertainty.factor))) + ' to ' +
          fmtUsd(Math.round(row.implied_value_usd * DATA.uncertainty.factor)) +
          '. Based on held-out traded peers; launch coverage is unknown.' }) : null,
      impliedOf(row, DATA.model) === row.implied_value_usd ? null : el('p', { role: 'alert', text: 'Recomputed valuation differs from the board.' })
    ));
    dialog.appendChild(farmingCalculator(slug));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  var controlHost = el('div');
  var resultHost = el('div');
  var count = el('p', { class: 'count', role: 'status' });

  function renderControls() {
    controlHost.replaceChildren(controls());
  }

  function refreshResults() {
    count.hidden = state.tab === 'accounting' || state.tab === 'research';
    if (state.tab === 'research' || state.tab === 'accounting') {
      resultHost.replaceChildren(state.tab === 'research' ? researchPanel() : accountingPanel());
      writeHash(); return;
    }
    var matches = rows().length;
    count.textContent = matches + ' of ' + activeRows().length + ' rows shown';
    resultHost.replaceChildren(matches
      ? (state.tab === 'pre-token' ? boardTable() : liveTable())
      : el('div', { class: 'panel empty', text: 'No protocols match these filters.' }));
    writeHash();
  }

  rerank();
  readHash();
  if (state.tab === 'live') state.sort = 'cap';
  app.appendChild(el('div', { class: 'shell' }, header(), lede(), modelPanel(), controlHost, count, resultHost, dialog));
  renderControls();
  refreshResults();
  app.setAttribute('aria-busy', 'false');
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
