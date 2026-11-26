// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, classification: 'all', route: 'all' };

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
  function impliedOf(row, model, baseline) {
    var fit = model.regression;
    if (!baseline && fit && row.tvl_usd > 0) {
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
      return Math.max(1, Math.round(Math.exp(fit.intercept + parts.tvl) * Math.exp(parts.growth) * Math.exp(parts.age)));
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
    for (var key of ['q', 'category', 'classification', 'route']) {
      if (params.has(key)) state[key] = params.get(key);
    }
    if (params.get('tab') === 'live') state.tab = 'live';
    state.selected = state.tab === 'pre-token' ? params.get('p') : null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    for (var key of ['category', 'classification', 'route']) {
      if (state[key] !== 'all') params.set(key, state[key]);
    }
    if (state.tab === 'live') params.set('tab', 'live');
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
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'cap') { av = a.mcap_usd ?? -Infinity; bv = b.mcap_usd ?? -Infinity; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
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
    var counts = Object.create(null);
    DATA.rows.forEach(function (r) {
      var status = DATA.classification[r.slug].status;
      counts[status] = (counts[status] || 0) + 1;
    });
    var facts = [
      ['Analyzed records', DATA.analyzed_size],
      ['Ranked rows', DATA.board_size],
      ['Watchlist covered', DATA.watchlist_covered + ' / ' + DATA.watchlist_size],
      ['Pre-token candidates', counts['Pre-token candidate'] || 0],
      ['Related products', counts['Related product'] || 0],
      ['Uncertain rows', counts.Uncertain || 0],
      ['Live-token sample', DATA.live.length]
    ];
    return el('section', { class: 'lede' },
      el('h1', { text: 'Protocol launch radar' }),
      el('p', { text: 'Compare peer-implied valuations and assess the evidence behind each farming route.' }),
      el('dl', { class: 'facts' }, facts.map(function (fact) {
        return el('div', { class: 'fact' }, el('dt', { text: fact[0] }), el('dd', { text: String(fact[1]) }));
      }))
    );
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
    var categories = Array.from(new Set(activeRows().map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category or chain', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; refreshResults(); });
    function tab(id, label) {
      return el('button', { type: 'button', 'aria-pressed': String(state.tab === id), text: label, onclick: function () {
        if (state.tab === id) return;
        state.tab = id;
        state.category = 'all';
        state.sort = id === 'live' ? 'cap' : 'implied';
        state.dir = -1;
        renderControls();
        refreshResults();
        controlHost.querySelector('[aria-pressed="true"]').focus();
      } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'tabs', 'aria-label': 'Protocol universe' }, tab('pre-token', 'Ranked board'), tab('live', 'Live-token sample')),
      el('div', { class: 'field search' }, el('label', { for: 'q', text: 'Search' }), search),
      filter('category', 'Categories', categories),
      ranked ? filter('classification', 'Classifications', Array.from(new Set(DATA.rows.map(function (r) { return DATA.classification[r.slug].status; }))).sort()) : null,
      ranked ? filter('route', 'Routes', ['Documented route', 'Conditional route', 'Research only']) : null,
      el('button', { type: 'button', class: 'button', text: 'Clear filters', onclick: function () {
        state.q = '';
        state.category = state.classification = state.route = 'all';
        renderControls();
        refreshResults();
        controlHost.querySelector('#q').focus();
      } })
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
    var max = Math.max(...DATA.rows.map(function (r) { return r.implied_value_usd; }));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var classification = DATA.classification[r.slug];
      var related = classification.evidence.slice(1).join(' ');
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-slug': r.slug
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('button', { class: 'protocol-link', type: 'button', text: r.name, onclick: function () { openDetail(r.slug); } }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'evidence' }, el('span', { class: 'status', 'data-status': classification.status, text: classification.status }),
          el('span', { class: 'sub evidence-summary', title: related || null, text: related || 'Token fields empty' })),
        el('td', null, el('span', { class: 'status route', 'data-status': routeOf(r), text: routeOf(r) }),
          routeOf(r) === 'Documented route'
            ? el('div', { class: 'sub', text: new URL(r.farm_steps[0].match(/https:\/\/[^ ]+/)[0]).hostname })
            : null)
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
            sortHeader('implied', 'Implied value'),
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
    var m = DATA.model;
    var fit = m.regression;
    return el('section', { class: 'panel model' },
      el('div', { class: 'method-copy' },
        el('h2', { text: 'Valuation methodology' }),
        el('p', null, el('strong', { text: 'Multivariate Huber regression' }),
          ' fits market cap from TVL, seven-day growth and tracking age. DefiLlama tracking age is a proxy for age of a pre-token protocol.'),
        el('details', null, el('summary', { text: 'Formula and sensitivity' }),
          el('div', { class: 'formula', text: fit ? 'Implied USD = exp(' + fit.intercept.toFixed(6) + ' + the centered feature terms below), rounded with a $1 floor.' : 'Original comparator fallback.' }),
          ...(fit ? fit.terms.map(function (term) {
            var names = { tvl: 'ln(TVL USD)', growth: 'asinh(growth % / 100)', age: 'ln(1 + tracking days)' };
            return el('p', { text: names[term.feature] + ': coefficient ' + term.coefficient.toFixed(6) + ', training median ' + term.center.toFixed(6) + '.' });
          }) : []),
          el('p', { text: 'Missing growth or age uses the training median. Board estimates can use growth or age outside the observed training range.' }),
          el('p', { text: 'Comparator = round(TVL * 0.25 * growth multiplier * age multiplier), with a $1 floor. Growth is clipped to -60% to +120% and weighted by 0.5. The age multiplier rises from 0.6 to 1 over 1,095 days. Missing growth uses zero and missing age uses 365 days.' })
        )
      ),
      el('div', { class: 'validation' },
        el('span', { class: 'sub', text: 'Sealed snapshot: 119 peers / leave-one-out mean absolute log error' }),
        el('div', { class: 'scores' },
          el('div', null, el('strong', { text: '1.604' }), el('span', { text: 'Multivariate Huber' })),
          el('div', null, el('strong', { text: '1.571' }), el('span', { text: 'V1 TVL-only Huber' })),
          el('div', null, el('strong', { text: '1.769' }), el('span', { text: 'Original comparator' }))
        ),
        el('span', { class: 'sub', text: 'Held-out age cohorts: 1.634 multivariate, 1.564 V1, 1.769 comparator. Both tests use one cross-sectional snapshot.' })
      )
    );
  }

  function farmingCalculator() {
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
    var result = el('p', { class: 'scenario-result', 'aria-live': 'polite' });
    function update() {
      var values = inputs.map(function (input) { return input.valueAsNumber; });
      if (values.some(function (v) { return !Number.isFinite(v) || v < 0; })) {
        result.textContent = 'Enter six non-negative scenario inputs. Enter zero where it applies.';
        return;
      }
      var opportunity = values[0] * values[3] / 100 * values[2] / 365;
      var labor = values[4] * values[5];
      var total = values[1] + opportunity + labor;
      if (!Number.isFinite(total)) {
        result.textContent = 'Use smaller scenario inputs.';
        return;
      }
      function money(value) { return '$' + value.toFixed(2); }
      result.textContent = 'Break-even reward ' + money(total) + '. Capital committed ' + money(values[0])
        + '. Cash fees ' + money(values[1]) + ', foregone return ' + money(opportunity)
        + ', and labor value ' + money(labor) + '.';
    }
    var labels = inputs.map(function (input, i) {
      return el('label', null, fields[i][0], input);
    });
    update();
    return el('section', { class: 'detail-section' },
      el('h3', { text: 'Illustrative farming costs' }),
      el('p', { class: 'sub', text: 'Example values are illustrative assumptions. Enter your own fee quotes and time estimates.' }),
      el('div', { class: 'farm-calculator', oninput: update }, labels),
      el('button', { type: 'button', class: 'button', text: 'Load example assumptions', onclick: function () {
        inputs.forEach(function (input, i) { input.value = fields[i][1]; });
        update();
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
      el('p', { class: 'sub', text: classification.evidence.join(' ') })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Listing age' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Huber implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Original comparator' }), el('b', { class: 'num', text: fmtUsd(impliedOf(row, DATA.model, true)) }))
      ),
      impliedOf(row, DATA.model) === row.implied_value_usd ? null : el('p', { role: 'alert', text: 'Recomputed valuation differs from the board.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(farmingCalculator());
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
    var matches = rows().length;
    count.textContent = matches + ' of ' + activeRows().length + ' rows shown';
    resultHost.replaceChildren(matches
      ? (state.tab === 'pre-token' ? boardTable() : liveTable())
      : el('div', { class: 'panel empty', text: 'No protocols match these filters.' }));
    writeHash();
  }

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
