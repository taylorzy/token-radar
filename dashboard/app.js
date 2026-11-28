// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  const valuationEvidence=window.RadarEvidence.create(DATA,window.RADAR_INTELLIGENCE);
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', ...valuationOrder, selected: null, classification: 'all', route: 'all', chain: 'all', access:'all', exit:'all', showExperiment: false };

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
  function impliedOf(row, model, baseline, experimental, tvlOnly) {
    var fit = tvlOnly ? model.tvlComparator : experimental ? sandboxFit : model.regression;
    if (!baseline && fit && row.tvl_usd > 0) {
      if (tvlOnly) return Math.max(1, Math.round(Math.exp(fit.intercept + fit.slope * Math.log(row.tvl_usd))));
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
      return Math.max(1, Math.round(Math.exp(fit.intercept + parts.tvl) * Math.exp(parts.growth * (experimental ? weights.growth : 1)) * Math.exp(parts.age * (experimental ? weights.age : 1))));
    }
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var tracked = (Date.parse(DATA.as_of) - Date.parse(row.listed_at || '')) / 86400000;
    var age = row.age_days ?? (Number.isFinite(tracked) ? Math.max(0, Math.floor(tracked)) : model.unknown_age_days);
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
    for (var key of ['q', 'category', 'classification', 'route', 'chain','access','exit']) {
      if (params.has(key)) state[key] = params.get(key);
    }
    if (['opportunity', 'live', 'research', 'accounting'].includes(params.get('tab'))) state.tab = params.get('tab');
    if(state.access!=='all' && !Object.hasOwn(allocation.statusNames,state.access))state.access='all';
    if(state.exit!=='all' && !Object.hasOwn(allocation.exitNames,state.exit))state.exit='all';
    if(state.tab==='opportunity' && !params.has('access'))state.access='verified';
    if(state.tab==='pre-token' && ['implied','name','rank','tvl','age','growth','experiment'].includes(params.get('sort'))){
      state.sort=params.get('sort');
      state.dir=params.get('dir')==='asc'?1:-1;
      if(['tvl','age','growth'].includes(state.sort))showInputs=true;
      if(state.sort==='experiment')state.showExperiment=true;
    }
    lastViewed=byRanked.has(params.get('seen'))?params.get('seen'):null;
    state.selected = ['pre-token','opportunity'].includes(state.tab) ? params.get('p') : null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    for (var key of ['category', 'classification', 'route', 'chain','access','exit']) {
      if (state[key] !== 'all' || (key==='access' && state.tab==='opportunity')) params.set(key, state[key]);
    }
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if(state.tab==='pre-token' && (state.sort!=='implied'||state.dir!==-1)){
      params.set('sort',state.sort);params.set('dir',state.dir===1?'asc':'desc');
    }
    if(lastViewed && !state.selected)params.set('seen',lastViewed);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(window.history.state, '', next?'#'+next:window.location.pathname+window.location.search);
  }

  function routeOf(row) {
    return row.farm_steps[0].split('.', 1)[0];
  }

  function activeRows() {
    return state.tab === 'live' ? DATA.live : DATA.rows;
  }

  function rows(ignoreAccess=false) {
    var q = state.q.trim().toLowerCase();
    return activeRows().filter(function (r) {
      if (state.chain !== 'all' && !r.chains.includes(state.chain)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      var classification = DATA.classification[r.slug];
      if (state.tab !== 'live' && (
        (state.classification === 'Candidates without known launch'
          ? classification.status !== 'Pre-token candidate' || byAccount.get(r.slug).subsequent
          : state.classification !== 'all' && classification.status !== state.classification)
        || (state.route !== 'all' && routeOf(r) !== state.route)
        || !allocation.matching(r,ignoreAccess?'all':state.access,state.exit).length
      )) return false;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().includes(q);
    });
  }
  function sortedRows(list) {
    if(state.tab==='opportunity'){
      const score=r=>allocation.estimate(allocation.chosen(r,state.access,state.exit))?.incrementalPerHourUSD??-Infinity;
      return list.slice().sort((a,b)=>score(b)-score(a)||a.rank-b.rank);
    }
    return sortRadarRows(list, state, simulated, decisions);
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
    var proof = reconcileValuations(DATA.rows, account, window.RADAR_VALUATION_INPUTS,
      window.RADAR_REQUIRED_SLUGS, DATA.analyzed_size, input => impliedOf(input, DATA.model));
    proof.reconciled = proof.reconciled && window.RADAR_REQUIRED_SLUGS.length === DATA.watchlist_size;
    return { ...proof, counts:counts, required:required.length,
      exceptions: required.filter(function (r) { return r.status !== 'Pre-token candidate'; }).length };
  }

  function pinButton(row) {
    return el('button', { class: 'pin', type: 'button', 'data-pin': row.slug,
      disabled: !pins.has(row.slug) && pins.size >= 4 ? '' : null, 'aria-label': (pins.has(row.slug) ? 'Unpin ' : 'Pin ') + row.name, 'aria-pressed': String(pins.has(row.slug)),
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
        el('thead', null, el('tr', null, ['Protocol', 'TVL', '7d growth', 'Tracking age', 'Official rank / value', 'Experimental', 'Model rank span', 'Median-growth stress', 'Classification / route'].map(function (h) {
          return el('th', { scope: 'col', text: h });
        }))),
        el('tbody', null, rows.map(function (r) {
          var other = simulated.get(r.slug);
          return el('tr', null,
            el('td', null, el('button', { class: 'protocol-link', text: r.name, onclick: function () { openDetail(r.slug); } }), pinButton(r)),
            el('td', { text: fmtUsd(r.tvl_usd) }), el('td', { text: fmtPct(r.change_7d) }), el('td', { text: fmtAge(r.age_days) }),
            el('td', { text: '#' + r.rank + ' · ' + fmtUsd(r.implied_value_usd) }),
            el('td', { text: '#' + other.rank + ' · ' + fmtUsd(other.value) }),
            el('td',{text:insights.get(r.slug).rankRange.join(' to ')}),el('td',{text:'#'+insights.get(r.slug).stress.reference.rank+' / '+fmtUsd(insights.get(r.slug).stress.reference.value)}),
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
      'experimental_rank', 'experimental_value_usd', 'advanced_opportunity_rank', 'advanced_scenario_decision', 'advanced_scenario_net_usd', 'advanced_scenario_assumptions','selected_route','exit_variant','entry_access','exit_constraint','evidence_source','capital_usd','modeled_capital_days','operating_return_usd','hypothetical_reward_usd','direct_cost_usd','cash_benchmark_usd','incremental_before_labor_usd','active_hours','incremental_per_active_hour_usd','net_after_labor_usd','break_even_hypothetical_reward_usd'];
    var lines = [header, ...selected.map(function (r) {
      var [low, high] = valueRange(r);
      var quote = window.RADAR_FARM_SUMMARIES[r.slug].economics;
      var other = simulated.get(r.slug);
      const path=allocation.chosen(r,state.access,state.exit);
      const a=allocation.estimate(path);
      return [r.rank, r.slug, r.name, r.tvl_usd, r.change_7d, r.age_days, r.implied_value_usd,
        low, high, byAccount.get(r.slug).status, byAccount.get(r.slug).watchlist, routeOf(r),
        quote?.requiredRewardUSD, quote?.rewardPerHourUSD, other.rank, other.value, decisions.get(r.slug).opportunityRank, decisions.get(r.slug).verdict, decisions.get(r.slug).base.net,decisions.describe(),
        path.profile?.id,path.variant,allocation.statusNames[path.evidence.status],allocation.exitNames[path.exit],path.evidence.source,
        a?.capitalUSD,a?.capitalDays,a?.operatingUSD,a?.rewardUSD,a?.costsUSD,a?.benchmarkUSD,a?.incrementalUSD,a?.activeHours,a?.incrementalPerHourUSD,a?.netUSD,a?.breakEvenRewardUSD];
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
          ' · ' + facts.matched+'/'+facts.expected+' valuations from snapshot inputs · ' + byAccount.size + ' unique slugs · ' + facts.covered + '/' + facts.required +
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
    var fit = DATA.model.tvlComparator;
    ctx.strokeStyle = '#75e1c4'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x(limits[0][0]), y(fit.intercept / Math.LN10 + fit.slope * limits[0][0]));
    ctx.lineTo(x(limits[0][1]), y(fit.intercept / Math.LN10 + fit.slope * limits[0][1]));
    ctx.stroke();
    return plot;
  }

  var intel = window.RADAR_INTELLIGENCE;
  var insights = new Map(intel.rows.map(r => [r.slug, r]));
  var decisions = decisionWorkspace(el,grid,openDetail,byAccount,insights,refreshResults);
  const allocation = allocationWorkspace(el,window.RADAR_FARM_SUMMARIES,insights);
  function grid(headers, records) {
    return el('table', null, el('thead', null, el('tr', null, headers.map(h => el('th', {text:h})))),
      el('tbody', null, records.map(row => el('tr', null, row.map(cell => cell instanceof Node ? el('td',null,cell) : el('td', {text:String(cell)}))))));
  }
  function svgNode(tag, attrs, label) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (label) node.textContent = label;
    return node;
  }

  function scatter(options) {
    var { width, height, xTicks, yTicks, xLabel, yLabel, points, formatX, formatY } = options;
    var chart = svgNode('svg', {viewBox: '0 0 '+width+' '+height, class:'research-chart',
      role: options.activate ? 'group' : 'img', 'aria-label': yLabel+' versus '+xLabel});
    var left = 66, top = 25, right = width - 17, bottom = height - 46;
    var scale = (ticks, a, b) => v => a + (b-a)*(v-ticks[0])/(ticks.at(-1)-ticks[0]);
    var x = scale(xTicks, left, right), y = scale(yTicks, bottom, top);
    function line(x1,y1,x2,y2,kind) {
      chart.append(svgNode('line',{x1,y1,x2,y2,class:kind||'chart-grid'}));
    }
    function label(value, x, y, anchor) {
      chart.append(svgNode('text',{x,y,'text-anchor':anchor||'start'},value));
    }
    xTicks.forEach(v => { line(x(v),top,x(v),bottom); label(formatX(v),x(v),bottom+17,'middle'); });
    yTicks.forEach(v => { line(left,y(v),right,y(v)); label(formatY(v),left-8,y(v)+4,'end'); });
    label(yLabel,left,14);
    label(xLabel,(left+right)/2,height-6,'middle');
    if (options.reference) {
      var [a,b] = options.reference;
      line(x(a[0]),y(a[1]),x(b[0]),y(b[1]),'chart-reference');
    }
    if (options.connect && points.length) chart.append(svgNode('polyline',{
      points:points.map(p=>x(p.x)+','+y(p.y)).join(' '), class:'chart-trend'}));
    points.forEach(p => {
      var dot = svgNode('circle',{cx:x(p.x),cy:y(p.y),r:p.radius||3.2,class:'plot-point '+(p.kind||'')});
      dot.append(svgNode('title',{},p.label));
      if (options.activate) {
        dot.setAttribute('tabindex','0');
        dot.setAttribute('role','button');
        dot.setAttribute('aria-label',p.label);
        dot.addEventListener('click',()=>options.activate(p));
        dot.addEventListener('keydown',e=> {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); options.activate(p); }
        });
      }
      chart.append(dot);
    });
    return chart;
  }

  var marketMode = 'primary';
  var showInputs = false;
  function marketLens(list) {
    var modes={primary:'Primary valuation',consensus:'Seven-model median',conservative:'Stress-tested value',opportunity:'Propensity-weighted proxy',documented:'Documented opportunity'};
    var value=p=>marketMode==='primary'?p.implied_value_usd:insights.get(p.slug)[marketMode];
    var choose=el('select',{id:'market-mode','aria-label':'Rank screened opportunities'},Object.entries(modes).map(([k,v])=>el('option',{value:k,text:v})));
    choose.value=marketMode;
    choose.onchange=()=>{marketMode=choose.value;refreshResults();document.querySelector('#market-mode').focus();};
    var swing = p => p.rank - insights.get(p.slug).stress.reference.rank;
    var plotted=list.filter(p=>p.tvl_usd>0 && value(p)>0);
    var extent = values => {
      var min = Math.floor(Math.min(...values.map(Math.log10)));
      var max = Math.ceil(Math.max(...values.map(Math.log10)));
      return Array.from({length:Math.max(2,max-min+1)},(_,i)=>min+i);
    };
    var routeCount = DATA.rows.filter(p=>routeOf(p)==='Documented route').length;
    var chart = plotted.length ? scatter({
      width:810,height:200,xTicks:extent(plotted.map(p=>p.tvl_usd)),yTicks:extent(plotted.map(value)),
      xLabel:'Protocol TVL (USD, log)',yLabel:modes[marketMode]+' (USD, log)',
      formatX:v=>fmtUsd(10**v),formatY:v=>fmtUsd(10**v),
      points:plotted.slice().sort((a,b)=>Number(routeOf(a)==='Documented route')-Number(routeOf(b)==='Documented route'))
        .map(p=>({x:Math.log10(p.tvl_usd),y:Math.log10(value(p)),slug:p.slug,
          kind:routeOf(p)==='Documented route'?'has-route':'other-route',
          radius:Math.abs(swing(p))>=20?6:3.5,
          label:p.name+' • '+fmtUsd(value(p))+' • TVL '+fmtUsd(p.tvl_usd)+' • '+routeOf(p)+
            ' • rank '+p.rank+' to '+insights.get(p.slug).stress.reference.rank+' at peer-median growth'})),
      activate:p=>openDetail(p.slug)
    }) : el('p',{class:'empty',text:'No positive values in this screen for the selected lens.'});
    var stress = list.slice().sort((a,b)=>Math.abs(swing(b))-Math.abs(swing(a))||a.rank-b.rank).slice(0,4);
    var leader = plotted.slice().sort((a,b)=>value(b)-value(a)||a.rank-b.rank)[0];
    return el('section',{class:'landscape'},
      el('div',{class:'landscape-main'},el('div',{class:'lens-heading'},
        el('h2',{text:'Valuation landscape'}),choose),
        chart,el('p',{class:'chart-key sub'},el('span',{class:'key-dot',text:'Documented route'}),
          el('span',{class:'key-dot muted-dot',text:'Conditional or research only'}),
          el('span',{class:'key-dot large-dot',text:'20+ places at peer-median growth'}),
          el('span',{text:plotted.length+' plotted'})),
        marketMode==='primary'?null:el('p',{class:'sub',text:intel.features.metrics[marketMode]+'.'+
          (leader?' Screen high: '+leader.name+' '+fmtUsd(value(leader))+'.':'')})),
      el('aside',{class:'landscape-side'},
        el('div',{class:'route-coverage'},
          el('button',{type:'button',class:'coverage-toggle',
          'aria-pressed':String(state.route==='Documented route'),
          'aria-label':'Filter ranked board to documented participation routes',
          text:routeCount+' / '+DATA.rows.length,onclick:()=>{
            state.route=state.route==='Documented route'?'all':'Documented route';
            renderControls(); refreshResults(); document.querySelector('.coverage-toggle')?.focus();
          }}),
          el('div',null,el('b',{text:'Protocols with documented routes'}),
            el('p',{class:'sub',text:'Incentive terms and airdrop eligibility require separate evidence.'}))),
        el('details',null,el('summary',{text:'Growth-sensitive ranks'}),
        el('p',{class:'sub',text:'Largest moves at peer-median weekly growth'}),
        stress.map(p=>el('button',{type:'button',class:'move',onclick:()=>openDetail(p.slug)},el('span',{text:p.name}),
          el('b',{text:'#'+p.rank+' to #'+insights.get(p.slug).stress.reference.rank}))))));
  }
  function protocolOverview(row,r) {
    var c=r.comparables, st=r.stress.reference;
    var title=(t)=>el('h3',{text:t});
    var axis = intel.features.stress.map(([k,label])=>[label,r.stress[k]]);
    axis.unshift(['Primary estimate',r.models.m71]);
    var max=Math.max(...axis.map(a=>a[1].value));
    var basis=el('section',{class:'chart-pane'},title('Valuation under stress'),
      el('p',{class:'sub',text:'Each scenario reranks the complete board. USD market cap.'}),
      axis.map(([label,v])=>el('div',{class:'stress-line'},el('span',{text:label}),el('div',null,el('i',{style:'width:'+100*v.value/max+'%'})),el('b',{text:fmtUsd(v.value)+'  #'+v.rank}))),
      el('div',{class:'valuation-range'},title('Seven-model valuation range'),
        el('p',{class:'sub',text:'Related specifications fitted to the same snapshot.'}),
        el('div',{class:'valuation-range-values'},
          [['Low',r.span.low[1]],['Median',r.consensus],['High',r.span.high[1]]].map(([label,value])=>
            el('div',null,el('span',{text:label}),el('b',{text:fmtUsd(value)}))))));
    var peers=el('section',{class:'chart-pane'},title('Market comparables'),
      el('p',{class:'sub',text:c.categoryCount+' traded peers in '+row.category+'. Ordered by closest TVL. Shared category is a business-model proxy.'}),
      c.category.length?grid(['Category peer','TVL','Traded cap'],c.category.map(p=>[p.name,fmtUsd(p.tvl),fmtUsd(p.cap)])):el('p',{text:'No same-category traded peer.'}),
      el('p',{text:c.categoryMultiple===null?'Sparse category: median multiple withheld.':'Category median market cap / TVL: '+c.categoryMultiple.toFixed(2)+'x. Descriptive only.'}),
      el('details',{open:''},el('summary',{text:'Numerical neighbors · transformed inputs'}),el('p',{text:'Distance uses standardized transformed TVL, growth and tracking age with median imputation. Categories and chains can differ.'}),
        grid(['Numerical peer','Category','Distance','Shared chain'],c.numerical.map(p=>[p.name,p.category,p.distance.toFixed(2),p.chains.join(', ')||'None']))));
    return el('section',{class:'protocol-overview'},el('div',{class:'thesis'},el('div',null,el('small',{text:'PRIMARY IMPLIED VALUE'}),el('strong',{text:fmtUsd(row.implied_value_usd)})),
      el('div',null,title('Model ranks '+r.rankRange.join('–')),
        el('div',{class:'rank-rail','aria-hidden':'true'},
          el('i',{style:'left:'+100*(r.rankRange[0]-1)/(DATA.rows.length-1)+'%;width:'+100*(r.rankRange[1]-r.rankRange[0])/(DATA.rows.length-1)+'%'}),
          el('em',{style:'left:'+100*(row.rank-1)/(DATA.rows.length-1)+'%'})),
        el('p',{text:'Primary #'+row.rank+' of '+DATA.rows.length+' · peer-median growth #'+st.rank})),
      el('div',null,el('h3',{class:r.uncertainty.weak?'weak-support':'',text:r.uncertainty.weak?'Weak peer support':'Within peer support'}),
        el('p',{text:'Peer-error envelope '+r.uncertainty.global.map(fmtUsd).join(' to ')}),
        el('p',{text:'Seven-model high / low '+r.span.ratio.toFixed(1)+'×'}))),
      el('div',{class:'driver-grid'},
        [['TVL',fmtUsd(row.tvl_usd),
          Math.exp(DATA.model.regression.terms.find(t=>t.feature==='tvl').coefficient*
            (Math.log(row.tvl_usd)-DATA.model.regression.terms.find(t=>t.feature==='tvl').center))],
          ['7-day growth',fmtPct(row.change_7d),r.terms.growth],
          ['Tracking age',fmtAge(row.age_days),r.terms.age]].map(([label,value,term])=>
          el('div',null,el('span',{text:label}),el('b',{text:value}),
            el('small',{text:term>0?term.toFixed(2)+'× centered factor':'Centered factor unavailable'})))),
      el('p',{class:'sub driver-note',text:'Factors multiply the fitted intercept baseline. Tracking age proxies tokenless age.'}),
      el('div',{class:'analysis-grid'},basis,peers));
  }
  function intelligenceDetail(r) {
    var names = {starter:'Starter heuristic', tvl:'TVL only', growth:'TVL + growth', age:'TVL + age',
      m7:'Full unpenalized', expanded:'Strong shrinkage', m71:'V3 primary'};
    var u = r.uncertainty;
    return el('section', {class:'detail-section'}, el('h3', {id:'valuation-sensitivity',text:'Valuation sensitivity'}),
      el('p', {text:'Seven-model median ' + fmtUsd(r.consensus) + ' | rank ' + r.rankRange.join(' to ') +
        ' | ' + r.span.ratio.toFixed(1) + 'x high/low. Related models share the same snapshot.'}),
      grid(['Assumption','Value','Rank'], Object.entries(r.models).map(([k,v]) => [names[k],fmtUsd(v.value),v.rank])),
      el('h3',{text:'Counterfactuals'}), grid(['Scenario across the board','Value','Rank'],intel.features.stress.map(([k,label]) =>
        [label,fmtUsd(r.stress[k].value),r.stress[k].rank])),
      el('p',{text:'Peer support ' + (u.weak ? 'weak' : 'within reference') + '. Nearby peers: ' +
        u.nearestPeers.join(', ') + '. Local mean absolute log error ' + u.localLogError.toFixed(2) + ' (fit residual diagnostic).'}),
      el('h3',{text:'Snapshot token presence and evidence'}),el('p',{text:'Cross-sectional resemblance to protocols with recorded tokens. Future issuance probability and individual eligibility are unknown.'}),el('p',{text:r.propensity ?
        'Family-held-out propensity ' + (100*r.propensity.propensity).toFixed(1) + '% | category comparator ' +
        (100*r.propensity.categoryBase).toFixed(1) + '% (' + r.propensity.categoryN + ' training rows). Opportunity rank #' +
        r.rankings.opportunity + '. Documented participation screen: ' + (r.documented ? 'qualifies, rank #' + r.rankings.documented : 'no qualifying route') :
        'Opportunity screen abstains under the token-status classification.'}),
      r.flags.map(f => el('p',{text:f.kind + ' | ' + f.label + ' | ' + f.reason})));
  }
  function intelligencePanel() {
    var mode = el('select',{id:'opportunity-mode','aria-label':'Opportunity ranking'},
      Object.keys(intel.features.metrics).map(k => el('option',{value:k,text:k})));
    var results = el('div');
    function update() {
      var k = mode.value;
      var sorted = intel.rows.filter(r => r.rankings[k]).sort((a,b) => a.rankings[k]-b.rankings[k]);
      results.replaceChildren(el('p',{text:intel.features.metrics[k]+'. '+sorted.length+' eligible.'}),
        grid(['Rank','Protocol','Score','Model rank range'],sorted.map(r=>[r.rankings[k],
          el('button',{class:'protocol-link',type:'button',text:byRanked.get(r.slug).name,onclick:()=>openDetail(r.slug)}),
          fmtUsd(r[k]),r.rankRange.join(' to ')])));
    }
    mode.onchange = update; update();
    var interval = intel.interval.overall, presence = intel.presence;
    var sample = research.m71Loo;
    var middle = presence.scores.ridge.calibration[2];
    var powers = sample.flatMap(p=>[Math.log10(p[1]),Math.log10(p[2])]);
    var min = Math.floor(Math.min(...powers)), max = Math.ceil(Math.max(...powers));
    var dollars = Array.from({length:max-min+1},(_,i)=>min+i);
    var percent = v => (100*v).toFixed(1)+'%';
    var ticks = [0,.25,.5,.75,1];
    var names = {global:'Global split',adaptive:'Nearby residuals',size:'TVL strata'};
    var stats = research.comparisons;
    var modelNames = {starter:'Starter',v1:'V1 TVL Huber',growth:'TVL + growth',age:'TVL + age',
      m7:'M7 full',m71:'M7.1 primary',extended:'M9 expanded'};
    var errorMax = Math.max(...Object.keys(modelNames).flatMap(k=>[stats.loo[k].mean,stats.age[k].mean]));
    var pane = (title,copy,chart,foot) => el('section',{class:'chart-pane validation-pane'},
      el('h3',{text:title}),el('p',{class:'sub',text:copy}),chart,el('p',{class:'sub',text:foot}));
    return el('section',{class:'panel',id:'intelligence'},
      el('h2',{text:'Model validation'}),
      el('p',{class:'validation-intro',text:'M7.1 retains all three valuation inputs. TVL-only had lower mean error in both held-out tests. Snapshot token presence is the calibration outcome.'}),
      el('div',{class:'validation-board'},
        pane('Predicted vs. observed traded cap','M7.1 leave-one-out predictions · '+sample.length+' traded peers',
          scatter({width:580,height:192,xTicks:dollars,yTicks:dollars,xLabel:'Predicted cap (USD, log)',yLabel:'Observed cap (USD, log)',
            formatX:v=>fmtUsd(10**v),formatY:v=>fmtUsd(10**v),reference:[[min,min],[max,max]],
            points:sample.map(([slug,predicted,observed])=>({x:Math.log10(predicted),y:Math.log10(observed),
              kind:'other-route',label:slug+' • predicted '+fmtUsd(predicted)+' • observed '+fmtUsd(observed)}))}),
          'Dashed line shows exact agreement. The archive evaluates cross-sectional traded caps.'),
        pane('Comparative model error','Mean absolute log error · lower is better',
          el('div',{class:'model-errors'},Object.entries(modelNames).map(([key,label])=>
            el('div',{class:'error-row'+(key==='m71'?' primary-error':'')},el('b',{text:label}),
              ['loo','age'].map(test=>el('div',{class:'error-track'},el('i',{style:'width:'+100*stats[test][key].mean/errorMax+'%'}),
                el('span',{text:stats[test][key].mean.toFixed(3)})))))),
          'Dark green bars show leave-one-out errors. Pale bars show age-cohort errors.'),
        pane('Snapshot token presence calibration','Ridge · family-held-out · 579 screened records',
          el('div',{class:'calibration-composition'},
            scatter({width:340,height:180,xTicks:ticks,yTicks:ticks,xLabel:'Mean predicted share',yLabel:'Observed share',
              formatX:v=>Math.round(v*100)+'%',formatY:v=>Math.round(v*100)+'%',reference:[[0,0],[1,1]],connect:true,
              points:presence.scores.ridge.calibration.filter(b=>b.n).map(b=>({x:b.predicted,y:b.observed,
                kind:'has-route',radius:4.5,label:b.n+' records • '+percent(b.predicted)+' predicted • '+percent(b.observed)+' observed'}))}),
            el('div',{class:'calibration-counts'},grid(['n','Pred.','Obs.'],presence.scores.ridge.calibration.map(b=>
              [b.n,percent(b.predicted),percent(b.observed)])))),
          'The middle bin predicted '+percent(middle.predicted)+' and observed '+percent(middle.observed)+
            '. Launch outcomes lack a verified follow-up cohort.'),
        pane('Interval coverage vs. width','Five family-held-out folds · 119 traded peers · 80% target',
          el('div',{class:'calibration-composition'},
            scatter({width:330,height:180,xTicks:[5.30,5.32,5.34,5.36,5.38],yTicks:[.79,.80,.81],
              xLabel:'Mean log width',yLabel:'Empirical coverage',formatX:v=>v.toFixed(2),formatY:percent,
              reference:[[5.30,.80],[5.38,.80]],
              points:Object.entries(interval).map(([k,v])=>({x:v.logWidth,y:v.coverage,kind:'has-route',radius:5,
                label:names[k]+' • '+percent(v.coverage)+' coverage • '+v.logWidth.toFixed(2)+' mean log width'}))}),
            el('div',{class:'calibration-counts'},grid(['Method','Covered','Width'],Object.entries(interval).map(([k,v])=>
              [names[k],Math.round(v.coverage*119)+'/119',v.logWidth.toFixed(2)])))),
          'Global split covered one more peer. Empirical coverage for a future launch is unknown.')),
      el('details',{class:'validation-numbers'},el('summary',{text:'Detailed interval and classifier scores'}),
        grid(['Interval method','Coverage','Mean log width','Interval score (lower)'],Object.entries(interval).map(([k,v])=>
          [names[k],percent(v.coverage),v.logWidth.toFixed(2),v.intervalScore.toFixed(2)])),
        grid(['Family-held-out model','Brier (lower)','Log loss (lower)','AUC (higher)'],Object.entries(presence.scores).map(([k,v])=>
          [k,v.brier.toFixed(3),v.logLoss.toFixed(3),v.auc.toFixed(3)])),
        el('p',{text:'Family-held-out classifier scores also informed model selection.'}),
        el('p',{text:'Shift DeFi | growth sensitivity'}),intelligenceSummary('shift-defi')),
      el('details',{class:'validation-numbers'},el('summary',{text:'Explore opportunity rankings'}),
        el('p',{text:'The opportunity score multiplies the seven-model valuation median by resemblance to protocols with a token recorded in the snapshot. It uses neither an issuance forecast nor a payout estimate. The documented lens limits that same score to candidates with a documented participation route.'}),mode,results));
  }
  function intelligenceSummary(slug) {
    var r = insights.get(slug);
    return el('p',{text:'Primary ' + fmtUsd(r.models.m71.value) + ' (#' + r.models.m71.rank +
      ') falls to ' + fmtUsd(r.stress.reference.value) + ' (#' + r.stress.reference.rank +
      ') at peer median growth. Across seven specifications its rank spans ' + r.rankRange.join(' to ') + '.'});
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
      el('details',{class:'panel compact secondary-validation'},el('summary',{text:'Traded peer benchmark and detailed model errors'}),el('div', { class: 'research-grid' },
        el('section', { class: 'panel compact' },
          el('h2', { text: 'Market comparables' }), peerChart(),
          el('p', { class: 'sub', text: research.peers.length + ' traded peers · teal line: V1 Huber fit · both axes logarithmic' })),
        el('section', { class: 'panel compact' },
          el('h2', { text: 'Held-out model selection' }),
          el('p', { class: 'sub', text: 'Mean absolute log market-cap error. Lower is better.' }),
          el('table', null, el('thead', null, el('tr', null,
            el('th', { text: 'Model' }), el('th', { text: 'Leave one out' }), el('th', { text: 'Age cohorts' }))),
            el('tbody', null, Object.entries(labels).map(function (entry) {
              return el('tr', { class: entry[0] === 'm71' ? 'chosen' : '' }, el('td', { text: entry[1] }),
                el('td', { text: stats.loo[entry[0]].mean.toFixed(3) }), el('td', { text: stats.age[entry[0]].mean.toFixed(3) }));
            }))),
          el('p', { class: 'sub', text: 'V1 had lower held-out mean error. V3 uses M7.1 because the rubric values TVL, growth and age. Neither test measures future launch performance.' })))),
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
    const excluded=account.filter(r=>r.rank===null);
    const groups=new Map();
    for(const row of excluded)groups.set(row.status,(groups.get(row.status)||0)+1);
    const universe=el('details',{id:'universe-summary'},
      el('summary',{text:account.length+' snapshot rows · '+DATA.rows.length+' ranked · '+excluded.length+' excluded'}),
      el('div',{class:'universe-body'},el('strong',{text:'How the universe reconciles'}),
        el('p',{text:facts.required+' mandatory rows (including '+facts.exceptions+' token-status exceptions) + '+(DATA.rows.length-facts.required)+' additional candidates = '+DATA.rows.length+' ranked.'}),
        el('ul',null,[...groups.entries()].sort((a,b)=>b[1]-a[1]).map(([label,n])=>el('li',null,el('b',{text:String(n)}),' '+label))),
        el('p',{text:'Each excluded row retains its disposition in the accounting ledger. Reviewed family representatives use only their own TVL.'}),
        el('button',{type:'button',class:'protocol-link',text:'Inspect the accounting ledger',onclick:()=>{
          state.tab='accounting';state.q='';state.category=state.classification=state.route=state.chain=state.access=state.exit='all';page=0;
          universe.open=false;renderControls();refreshResults();controlHost.querySelector('#q')?.focus();}})));
    return el('section', { class: 'lede' },
      el('h1', { id: 'view-title', text: 'Valuation Ranking' }),
      el('div',{class:'ledger-totals'},universe,el('b',{text:facts.covered+'/'+facts.required+' watchlist'}),
        el('b',{text:facts.reconciled?facts.matched+'/'+facts.expected+' values reconciled':'Valuation or ledger mismatch'})));
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
    var ranked = ['pre-token','opportunity'].includes(state.tab);
    var accounting = state.tab === 'accounting';
    var showingRows = ranked || state.tab === 'live';
    var categories = Array.from(new Set(activeRows().map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category or chain', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; refreshResults(); });
    function tab(id, label) {
      return el('button', { type: 'button', 'aria-pressed': String(state.tab === id), text: label, onclick: function () {
        if (state.tab === id) return;
        state.tab = id;
        state.category = state.classification = state.route = state.chain = state.access = state.exit = 'all';
        if(id==='opportunity')state.access='verified';
        state.q = ''; page = 0;
        state.sort = id === 'live' ? 'cap' : id === 'opportunity' ? 'decision' : 'implied';
        state.dir = id === 'opportunity' ? 1 : -1;
        renderControls();
        refreshResults();
        controlHost.querySelector('[aria-pressed="true"]').focus();
      } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'tabs', 'aria-label': 'Protocol universe' }, tab('pre-token', 'Valuation Ranking'), tab('opportunity', 'Allocation shortlist'), tab('live', 'Live-token sample'), tab('research', 'Model research'), tab('accounting', 'Accounting & comparison')),
      state.tab !== 'research' ? el('div', { class: 'field search' }, el('label', { for: 'q', text: 'Search' }), search) : null,
      ranked ? accessHost : null,
      showingRows || accounting ? el('details',{class:'advanced-filters',open:[state.category,state.chain,state.classification,state.route].some(v=>v!=='all')?'':null},el('summary',{text:'Research filters'}),
        el('div',null,showingRows ? filter('category', 'Categories', categories) : null,
          showingRows ? filter('chain', 'Chains', [...new Set(activeRows().flatMap(r => r.chains))].sort()) : null,
          ranked || accounting ? filter('classification', 'Classifications', [...(ranked ? ['Candidates without known launch'] : []), ...new Set((ranked ? DATA.rows.map(r => byAccount.get(r.slug)) : account).map(r => r.status))]) : null,
          ranked ? filter('route', 'Routes', ['Documented route', 'Conditional route', 'Research only']) : null)) : null,
      ranked ? el('button', { type: 'button', class: 'button', text: 'Export filtered CSV', onclick: exportCsv }) : null,
      state.tab !== 'research' ? el('button', { type: 'button', class: 'button', text: 'Clear filters', onclick: function () {
        state.q = '';
        state.category = state.classification = state.route = state.chain = state.access = state.exit = 'all'; page = 0;
        renderControls();
        refreshResults();
        controlHost.querySelector('#q').focus();
      } }) : null
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', 'aria-sort': state.sort === key ? (state.dir < 0 ? 'descending' : 'ascending') : null },
      el('button', { type: 'button', 'data-sort': key, onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'decision' || key === 'rank' || key === 'name' ? 1 : -1; } refreshResults(); resultHost.querySelector('[data-sort=' + key + ']').focus(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u2193' : ' \u2191' }) : null
      )
    );
  }

  function boardTable() {
    const opportunity = state.tab === 'opportunity';
    const heading = label => el('th', {scope:'col', text:label});
    const headers = [
      opportunity ? sortHeader('decision','Opportunity rank') : sortHeader('rank','Official rank'),
      sortHeader('name','Protocol'), sortHeader('implied','Implied value'),
      heading('Peer-error range'), heading('Token classification'), heading('Participation access')
    ];
    if (showInputs) headers.push(sortHeader('tvl','TVL'),sortHeader('growth','7d growth'),sortHeader('age','Tracking age'));
    if (state.showExperiment) headers.push(sortHeader('experiment','Experimental'));
    if (opportunity) headers.push(heading('Base / downside'));
    const body = sortedRows(rows()).map(row => {
      const ledger = byAccount.get(row.slug);
      const decision = decisions.get(row.slug);
      const farm = window.RADAR_FARM_SUMMARIES[row.slug];
      const path = allocation.chosen(row,state.access,state.exit);
      const intel = insights.get(row.slug);
      const range = valueRange(row);
      const detail = (label,page) => el('button',{type:'button',class:'protocol-link',text:label,
        onclick:() => openDetail(row.slug,page)});
      const cells = [
        el('td',{class:'official-number',text:'#'+(opportunity ? decision.opportunityRank : row.rank)}),
        el('td',null,detail(row.name),pinButton(row),el('small',{class:'block sub',text:row.category+' · '+row.chains.slice(0,2).join(', ')})),
        el('td',{class:'estimate'},el('button',{type:'button',class:'value-link',title:usd.format(row.implied_value_usd),
          'aria-label':'Inspect the valuation evidence for '+row.name,onclick:()=>openDetail(row.slug,'Brief')},fmtUsd(row.implied_value_usd)),
          el('span',{class:'estimate-track','aria-hidden':'true'},el('i',{style:'width:'+100*row.implied_value_usd/DATA.rows[0].implied_value_usd+'%'})),
          opportunity ? el('small',{text:'Official #'+row.rank}) : null),
        el('td',{class:'range',text:range.map(fmtUsd).join(' – ')}),
        el('td',null,el('span',{class:'status','data-status':ledger.status,text:ledger.subsequent ? ledger.subsequent.label : ledger.status}),
          ledger.identity && !ledger.subsequent ? el('small',{class:'sub block',text:ledger.identity}) : null,
          ledger.watchlist ? el('small',{class:'sub block',text:'Mandatory watchlist'}) : null),
        el('td',{'data-entry':path.evidence.status},detail(allocation.statusNames[path.evidence.status],'Allocation'),el('small',{class:'sub block',text:allocation.exitNames[path.exit]+(farm.profiles?.length>1?' · '+farm.profiles.length+' routes':'')}),
          farm.economics ? el('small',{class:'sub block',text:'Scenario: '+decisions.money(farm.economics.requiredRewardUSD)+' break-even'}) : null)
      ];
      if (showInputs) cells.push(el('td',{text:fmtUsd(row.tvl_usd)}),el('td',{text:fmtPct(row.change_7d)}),el('td',{text:fmtAge(row.age_days)}));
      if (state.showExperiment) cells.push(el('td',{text:fmtUsd(simulated.get(row.slug).value)}));
      if (opportunity) cells.push(el('td',null,detail(decision.verdict,'Decision'),el('small',{class:'sub block',text:decisions.money(decision.base.net)+' / '+decisions.money(decision.downside)})));
      cells.forEach((cell,index) => cell.dataset.label = headers[index].textContent.trim());
      return el('tr',{'data-slug':row.slug},cells);
    });
    return el('div',{class:'panel ranked-table'},el('div',{class:'table-wrap'},el('table',null,
      el('thead',null,el('tr',null,headers)),el('tbody',null,body))));
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
    return el('details', { class: 'panel model compact' },
      el('summary', null, el('strong', {text:'Primary valuation'}),
        el('span', {text:'TVL · 7-day growth · tracking age'}),
        el('span', {class:'formula-affordance',text:valuationEvidence.summary.peerCount+' traded peers · '+valuationEvidence.summary.typicalFactor.toFixed(2)+'× median held-out error'})),
      el('p', { class: 'formula', text: 'USD = exp(' + fit.intercept.toFixed(4) + fit.terms.map(function (t) {
        return (t.coefficient < 0 ? ' - ' : ' + ') + Math.abs(t.coefficient).toFixed(4) + ' × ' +
          { tvl: 'centered log(TVL)', growth: 'centered asinh(growth%/100)', age: 'centered log(1+tracking days)' }[t.feature];
      }).join('') + ')' }),
      el('p', { class: 'sub', text: 'Empirical peer-error range: divide or multiply by ' + DATA.uncertainty.factor.toFixed(2) +
        '. The error statistic above uses separate family-held-out predictions of recorded peer market caps. Tracking age measures time since listing. Future token valuations and wallet rewards remain unobserved.' }));
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
    var result = el('div', { class: 'scenario-result', 'aria-live': 'polite' });
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
      var components = [['Fees',summary.feesUSD],['Foregone return',summary.opportunityUSD],['Labor',summary.laborUSD]];
      var total = summary.requiredRewardUSD;
      result.replaceChildren(
        el('div',{class:'break-even-value'},el('small',{text:'Break-even reward '}),
          el('strong',{text:money(total)})),
        el('div',{class:'break-even-components'},el('div',{class:'cost-allocation','aria-hidden':'true'},
          components.map(([label,value],i)=>el('i',{class:'cost-'+i,style:'width:'+(total?100*value/total:0)+'%'}))),
          el('div',{class:'cost-items'},components.map(([label,value],i)=>el('span',null,
            el('i',{class:'cost-'+i}),label+' ',el('b',{text:money(value)}))))),
        el('p',{class:'break-even-note',text:'Capital committed '+money(summary.capitalUSD)+
          ' · Required reward per labor hour '+(summary.rewardPerHourUSD===null?'n/a':money(summary.rewardPerHourUSD))+
          ' · '+summary.verdict+'.'}));
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
    return el('details', { class: 'detail-section' },
      el('summary', { text: 'Calculate illustrative break-even economics' }),
      el('p', { class: 'sub', text: 'Edit the assumptions using your own quotes and time estimates. Live charges are unverified.' }),
      el('div', { class: 'farm-calculator', oninput: update }, labels,
        el('label', null, 'Hypothetical reward (USD, optional)', reward)),
      el('button', { type: 'button', class: 'button', text: 'Load example assumptions', onclick: function () {
        inputs.forEach(function (input, i) { input.value = fields[i][1]; });
        if (slug === 'lofty') inputs[1].value = '55';
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
      slug==='lofty'?el('p',{class:'sub',text:'Lofty example assumes a $1,000 purchase and resale at the same gross price: 2.5% buy + 3% sell = $55 in marketplace fees. Requote for the selected order.'}):null,
      el('p', { class: 'sub', text: 'Break-even is fees plus simple foregone return plus labor value, before taxes or protocol gains or losses.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  let boardOrigin=null, lastViewed=null, detailPage='Allocation';
  function boardRows(){return Array.from(resultHost.querySelectorAll('.ranked-table tbody tr[data-slug]'));}
  function markLastViewed(){
    const current=boardRows().find(r=>r.dataset.slug===lastViewed);
    if(current)current.querySelector('.protocol-link')?.setAttribute('aria-current','true');
    return current;
  }
  function finishDetail(){
    if(!state.selected)return;
    lastViewed=state.selected;
    state.selected=null;
    if(dialog.open)dialog.close();
    refreshResults();
    const link=markLastViewed()?.querySelector('.protocol-link');
    (link || (boardOrigin?.opener?.isConnected && boardOrigin.opener) || document.querySelector('#view-title')).focus({preventScroll:true});
    const wrap=resultHost.querySelector('.ranked-table .table-wrap');
    if(wrap && boardOrigin)wrap.scrollLeft=boardOrigin.left;
    if(boardOrigin)window.scrollTo(boardOrigin.x,boardOrigin.y);
    boardOrigin=null;
  }
  function returnToBoard(){
    if(history.state?.radarDetail)history.back();
    else finishDetail();
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();returnToBoard();});
  window.addEventListener('popstate',()=>{
    const slug=new URLSearchParams(location.hash.slice(1)).get('p');
    if(slug && byRanked.has(slug))openDetail(slug);
    else if(state.selected)finishDetail();
  });

  function openDetail(slug,initialPage) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    if(!dialog.open){
      boardOrigin={x:scrollX,y:scrollY,left:resultHost.querySelector('.ranked-table .table-wrap')?.scrollLeft||0,opener:document.activeElement};
      if(!new URLSearchParams(location.hash.slice(1)).has('p'))history.pushState({radarDetail:true},'',location.href);
    }
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps;
    var finding = insights.get(slug).participation;
    const order=boardRows().map(tr=>tr.dataset.slug);
    const position=order.indexOf(slug);
    function neighbor(offset,label){
      const target=position<0?null:order[position+offset];
      return el('button',{type:'button',class:'neighbor','data-move':offset,text:label,disabled:target?null:'',
        title:target?byRanked.get(target).name:label+' unavailable',onclick:()=>{
          openDetail(target,detailPage);
          const continued=dialog.querySelector('[data-move="'+offset+'"]:enabled') || dialog.querySelector('.neighbor:enabled');
          continued?.focus({preventScroll:true});
        }});
    }
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('div',{class:'research-return'},
        el('button',{class:'close',type:'button',text:'Return to board',onclick:returnToBoard}),
        position>=0?el('div',{class:'neighbors','aria-label':'Protocols in displayed order'},
          neighbor(-1,'Previous'),el('span',{text:(position+1)+' / '+order.length}),neighbor(1,'Next')):null)
    ));
    dialog.appendChild(protocolOverview(row,insights.get(slug)));
    var classification = DATA.classification[row.slug];
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: classification.status }),
      byAccount.get(slug).watchlist && classification.status !== 'Pre-token candidate' ?
        el('p', { class: 'sub', text: 'Mandatory watchlist exception. Inclusion follows the sealed watchlist.' }) : null,
      el('p', { class: 'sub', text: classification.evidence.join(' ') }),
      byAccount.get(row.slug).subsequent ? el('p',{text:byAccount.get(row.slug).subsequent.finding+' '+byAccount.get(row.slug).subsequent.sources.join(' ')}) : null
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Tracking age' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Huber implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        DATA.model.experimental && row.tvl_usd > 0 ? el('div', null, el('span', { text: 'Experimental fit' }), el('b', { class: 'num', text: fmtUsd(impliedOf(row, DATA.model, false, true)) })) : null,
        el('div', null, el('span', { text: 'V1 TVL-only' }), el('b', { class: 'num', text: fmtUsd(impliedOf(row, DATA.model, false, false, true)) })),
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
    dialog.appendChild(intelligenceDetail(insights.get(slug)));
    var route = window.RADAR_FARM_SUMMARIES[slug].route;
    var explicitIncentive = slug==='saturn' ? 'Issuer interface shows USDat points.' :
      slug==='bitfi-basis' ? 'Issuer page advertises a BFI claim.' :
      slug==='firelight' ? 'Staking emissions follow protocol rules; a separate token distribution is unverified.' : 'Separate incentive terms unverified';
    var evidence = finding || (route && {status:'Documented route',date:route.reviewed_at,sources:route.sources});
    var field = (label,copy) => el('div',null,el('b',{text:label}),el('p',{text:copy}));
    dialog.appendChild(el('section',{class:'detail-section farm-workspace'},
      el('div',{class:'farm-heading'},el('h3',{text:'Participation research'}),
        evidence ? el('div',{class:'source-links'},el('span',{text:'Reviewed '+evidence.date}),
          el('details',{class:'source-disclosure'},el('summary',{text:evidence.sources.map(url=>new URL(url).hostname).join(' · ')}),
            el('div',{class:'source-addresses'},evidence.sources.map(url=>el('p',{text:url}))))) : null),
      window.RADAR_FARM_SUMMARIES[slug].profiles?.length > 1 ?
        el('button',{type:'button',class:'button',text:'Compare all '+window.RADAR_FARM_SUMMARIES[slug].profiles.length+' participation routes',onclick:()=>select(3)}) : null,
      el('div',{class:'farm-evidence'},
        field('Participation',finding?.entryLabel || routeOf(row)),
        field('Incentive evidence',route?.incentive || explicitIncentive),
        field('Airdrop eligibility','Individual eligibility unverified')),
      el('div',{class:'farm-plan'},
        el('div',{class:'farm-terms'},
          field('Access & jurisdiction',route ? route.entry : 'Confirm product access and applicable restrictions with the issuer.'),
          field('Capital & transaction costs',route ? route.capital+' '+route.fees : 'Capital and live transaction costs require verification.'),
          field('Withdrawal & settlement',route ? route.settlement : 'Validate the exit mechanism, delay and settlement terms.'),
          field('Risks & evidence',route ? route.risks : (finding ? finding.finding : 'Route-specific terms remain unverified.'))),
        el('div',null,el('h3',{text:route?'Execution steps':'Research steps'}),
          el('ol',{class:'execution-steps'},steps.map(function(step,i) {
            var core = route ? [route.entry,route.action,route.exit][i] : null;
            var tags = step.match(/ Cost: (.*?) Time: (.*?planning estimate\)\.)/);
            var action = core || (tags ? step.slice(0,tags.index) : step);
            return el('li',null,el('b',{text:action}),tags?el('div',{class:'step-meta'},
              el('span',null,el('strong',{text:'Cost '}),tags[1]),
              el('span',null,el('strong',{text:'Time '}),tags[2])):null);
          }))))));
    var sections=Array.from(dialog.children).slice(1);
    var decisionPanel=decisions.detail(row);
    dialog.appendChild(decisionPanel);
    const allocationPanel=allocation.detail(row,allocation.chosen(row,state.access,state.exit));
    const brief=protocolBrief(el,valuationEvidence,row,byAccount.get(slug), {fmtUsd,fmtAge,fmtPct});
    const spread=el('section',{class:'decision-spread'},brief,allocationPanel);
    dialog.appendChild(spread);
    var pages=[['Valuation',[sections[0],sections[2]]],['Evidence & scenarios',[sections[1],sections[4]]],['Farming economics',[sections[5],sections[3]]],['Decision',[decisionPanel]],['Allocation',[spread]]];
    if(finding && finding.status==='Further verification') sections[1].appendChild(el('p',{text:'External review '+finding.date+' | '+finding.finding}));
    var nav=el('nav',{class:'workspace-nav','aria-label':'Protocol research'});
    dialog.insertBefore(sections[5],sections[3]);
    const tabNames=['Model detail','Sensitivity & identity','Route research','Scenario lab','Decision brief'];
    var buttons=pages.map(([name,items],i)=>el('button',{type:'button',text:tabNames[i],onclick:()=>select(i)}));
    function select(i){
      detailPage=pages[i][0];
      pages.forEach((page,j)=>{page[1].forEach(part=>{part.hidden=i!==j;});buttons[j].setAttribute('aria-pressed',String(i===j));});
      dialog.scrollTop=0;
    }
    [4,0,2,1,3].forEach(i=>nav.appendChild(buttons[i]));
    dialog.insertBefore(nav,sections[0]);select(!initialPage || initialPage==='Brief'?4:Math.max(0,pages.findIndex(([name])=>name===initialPage)));
    if(initialPage==='Brief')brief.querySelector('.brief-research').open=true;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  var controlHost = el('div');
  var resultHost = el('div');
  var count = el('p', { class: 'count', role: 'status' });
  const accessHost=el('div');
  function renderAccess(){
    accessHost.replaceChildren();
    if(!['pre-token','opportunity'].includes(state.tab))return;
    const choices=Object.entries({all:'All protocols',...allocation.statusNames});
    const candidates=rows(true);
    const exit=el('select',{id:'exit','aria-label':'Filter by exit constraint'},
      Object.entries({all:'All exit paths',...allocation.exitNames}).map(([k,v])=>el('option',{value:k,text:v})));
    exit.value=state.exit;
    exit.onchange=()=>{state.exit=exit.value;refreshResults();document.querySelector('#exit').focus();};
    const access=el('select',{id:'access','aria-label':'Filter by participation access'},choices.map(([key,label])=>{
        const total=key==='all'?candidates.length:candidates.filter(r=>allocation.matching(r,key,state.exit).length).length;
        return el('option',{value:key,text:label+' ('+total+')'});
      }));
    access.value=state.access;
    access.onchange=()=>{state.access=access.value;refreshResults();document.querySelector('#access').focus();};
    accessHost.append(el('section',{class:'compact-access','aria-label':'Participation filters'},
      el('label',null,'Participation ',access),el('label',null,'Exit ',exit)));
  }

  function renderControls() {
    controlHost.replaceChildren(controls());
  }

  function refreshResults() {
    renderAccess();
    document.querySelector('#view-title').textContent = ({
      'pre-token':'Valuation Ranking', opportunity:'Allocation shortlist', live:'Traded token sample',
      research:'Model validation', accounting:'Protocol accounting'
    })[state.tab];
    count.hidden = state.tab === 'accounting' || state.tab === 'research';
    if (state.tab === 'research' || state.tab === 'accounting') {
      resultHost.replaceChildren(...(state.tab === 'research' ? [decisions.validation(), intelligencePanel(), researchPanel()] : [decisions.coverage(),accountingPanel()]));
      writeHash(); return;
    }
    const chartOpen = resultHost.querySelector('.market-disclosure')?.open ?? false;
    var matches = rows().length;
    count.textContent = matches + ' of ' + activeRows().length + ' protocols' +
      (state.tab === 'pre-token' && state.sort === 'implied' ? ' · Implied value, '+(state.dir < 0 ? 'highest first' : 'lowest first') : '') +
      (state.tab === 'pre-token' ? ' · Peer-error range: estimate ÷ or × '+DATA.uncertainty.factor.toFixed(2) : '');
    resultHost.replaceChildren(matches
      ? (state.tab === 'live' ? liveTable() : state.tab==='opportunity' ? allocation.shortlist(rows(),state.access,state.exit,openDetail) : el('div',null,
        pins.size ? comparePanel() : null,
        el('div',{class:'board-options'},el('label',null,el('input',{type:'checkbox',id:'input-columns',
          checked:showInputs ? '' : null,onchange:event=>{
            showInputs=event.target.checked;
            if (!showInputs && ['tvl','growth','age'].includes(state.sort)) {
              state.sort=state.tab==='opportunity'?'decision':'implied';
              state.dir=state.tab==='opportunity'?1:-1;
            }
            refreshResults();document.querySelector('#input-columns').focus();
          }}),' Show snapshot inputs')),
        el('details',{class:'market-disclosure', open:chartOpen ? '' : null},el('summary',{text:'Explore the valuation chart'}),marketLens(rows())),
        boardTable()))
      : el('div', { class: 'panel empty', text: 'No protocols match these filters.' }));
    markLastViewed();
    writeHash();
  }

  rerank();
  readHash();
  if (state.tab === 'opportunity') { state.sort = 'decision'; state.dir = 1; }
  if (state.tab === 'live') state.sort = 'cap';
  app.appendChild(el('div', { class: 'shell' }, header(), lede(), modelPanel(), controlHost, count, resultHost, dialog));
  renderControls();
  refreshResults();
  app.setAttribute('aria-busy', 'false');
  if (state.selected) openDetail(state.selected);
})();
