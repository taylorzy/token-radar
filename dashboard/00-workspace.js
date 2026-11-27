/* Views share the same pure engine used for the downloadable decision rows. */
function decisionWorkspace(el, grid, openDetail, ledger, insights, refresh) {
  const {defaults,assess,rankDecisions}=window.RadarDecision;
  const review=window.RADAR_DECISIONS;
  const farms=window.RADAR_FARM_SUMMARIES;
  const bySlug=new Map(window.RADAR.rows.map(r=>[r.slug,r]));
  const selections=new Map();
  let assumptions={...defaults};
  let ranked=new Map(review.decisions.map(r=>[r.slug,r]));
  const money=x=>x==null?'Unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x);
  const text=(tag,value,cls)=>el(tag,{text:value,class:cls});
  const button=(name,action)=>el('button',{type:'button',class:'button',text:name,onclick:action});
  const units={capital:'Capital ($)',days:'Holding days before exit request',annual:'Alternative rate (%/yr)',fees:'Fee budget ($)',hours:'Active hours',wage:'Labor hurdle ($/h)',ppm:'Effective wallet share (ppm)',success:'Joint success weight (%)'};
  const describe=a=>money(a.capital)+' capital · '+a.days+' holding days at '+a.annual+'% · '+money(a.fees)+' fee budget · '+a.hours+' h at '+money(a.wage)+'/h · '+a.ppm+' ppm wallet share · '+a.success+'% joint success';
  function calculate(row,inputs) {
    return assess(row,insights.get(row.slug),ledger.get(row.slug),farms[row.slug],inputs,...(selections.get(row.slug) ?? []));
  }
  function apply(inputs) {
    assumptions={...inputs};
    ranked=new Map(rankDecisions([...bySlug.values()].map(r=>calculate(r,inputs))).map(r=>[r.slug,r]));
    refresh();
  }
  function cover(rows) {
    const shortlist=rows.map(r=>ranked.get(r.slug)).sort((a,b)=>a.opportunityRank-b.opportunityRank).slice(0,3);
    const results=rows.map(r=>ranked.get(r.slug));
    const routeCount=results.filter(d=>d.route).length;
    const baseClears=results.filter(d=>d.tier===1).length;
    const reversals=results.filter(d=>d.tier===1 && d.downside<0).length;
    const holds=results.filter(d=>d.tier>=3).length;
    return el('section',{class:'decision-cover'},
      text('p',results.reduce((n,d)=>n+(farms[d.slug].profiles?.length ?? 0),0)+' routes across '+routeCount+' protocols · '+baseClears+' clear base costs · '+reversals+' reverse in downside · '+holds+' evidence or risk holds','decision-totals'),
      el('div',{class:'decision-heading'},text('h2','Opportunity review'),text('span','Hypothetical scenario','status')),
      text('p',describe(assumptions),'sub'),
      text('p',['shift-defi','extended-perps'].filter(s=>ranked.has(s)).map(s=>{
        const d=ranked.get(s);return bySlug.get(s).name+'  #'+review.comparison[s].rank+' → #'+d.opportunityRank+' · '+d.verdict;
      }).join('   |   ')+'  ·  V6 default → current opportunity rank','decision-totals'),
      el('div',{class:'decision-cards'},shortlist.map(d=>el('button',{type:'button',class:'decision-card',onclick:()=>openDetail(d.slug,'Decision')},
        text('small','Opportunity #'+d.opportunityRank+'   /   Value #'+d.officialRank),
        text('strong',bySlug.get(d.slug).name),text('span',d.verdict),
        text('b',money(d.base.net)+' / '+money(d.downside)),
        text('small','Base / combined downside')))),
      rows.length===1 && farms[rows[0].slug].route ? el('div',{class:'single-route'},text('strong','Documented participation · '+rows[0].name),text('p',farms[rows[0].slug].route.entry),text('p',farms[rows[0].slug].route.exit),text('small',farms[rows[0].slug].route.sources[0]+' · '+farms[rows[0].slug].route.reviewed_at)):null,
      el('details',null,text('summary','How opportunities are ordered'),text('p','Research priority across the full board. Documented routes clearing base costs come first, then documented routes below break-even, unverified routes, access or risk holds, and identity exceptions. Within each group we prefer stronger peer support, then combined-downside net, lower model disagreement, snapshot token resemblance, and official rank. All dollar outcomes use the stated assumptions. Eligibility and total execution costs require confirmation.','sub')));
  }
  function detail(row) {
    const intel=insights.get(row.slug), farm=farms[row.slug], initial=ranked.get(row.slug);
    const output=el('div',{'aria-live':'polite'}), edit=el('details'), controls={};
    const applyButton=button('Apply assumptions to all opportunities',()=>{apply(read());update();});
    const rankLine=text('p','','sub'), assumptionsLine=text('p','','sub');
    const profiles=farm.profiles ?? [];
    const profileSelect=el('select',{'aria-label':'Participation route'},profiles.map(p=>el('option',{value:p.id,text:p.id.endsWith('/v6') ? bySlug.get(row.slug).name+' · documented route' : p.id.split('/')[1].replaceAll('-',' ')})));
    const variantSelect=el('select',{'aria-label':'Exit scenario'});
    profileSelect.value=selections.get(row.slug)?.[0] ?? profiles[0]?.id ?? '';
    function variants() {
      const t=profiles.find(p=>p.id===profileSelect.value)?.terms ?? {};
      const opts=t.minimumQueueDaysByV1Vault ? ['extUSD v1',...Object.keys(t.minimumQueueDaysByV1Vault).filter(k=>k!=='extUSD v1')] :
        t.exitDaysRange ? ['Lower bound','Upper bound'] : t.approxInstantExitBps ? ['Queue','Instant'] : [];
      variantSelect.replaceChildren(...opts.map(v=>el('option',{value:v,text:v})));
      variantSelect.hidden=!opts.length;
    }
    variants();
    if(selections.get(row.slug)?.[1])variantSelect.value=selections.get(row.slug)[1];
    function selectRoute(){selections.set(row.slug,[profileSelect.value,variantSelect.value]);apply(assumptions);update();}
    profileSelect.onchange=()=>{variants();selectRoute();};
    variantSelect.onchange=selectRoute;
    function read() {return Object.fromEntries(Object.entries(controls).map(([k,input])=>[k,input.valueAsNumber]));}
    function update() {
      const inputs=read(), d=calculate(row,inputs), b=d.base;
      rankLine.textContent='Global opportunity #'+ranked.get(row.slug).opportunityRank+' · official value #'+row.rank+' · '+(farm.route?'Documented participation':'Participation unverified')+' · '+(intel.uncertainty.weak?'Weak valuation support':'Supported by traded peers');
      assumptionsLine.textContent='Board assumptions · '+describe(assumptions);
      applyButton.disabled=!b;
      if(!b){
        const {capital,days,annual,fees,hours,wage}=inputs;
        const parts=[fees,capital*days*annual/36500,hours*wage,capital*d.feeRate];
        const known=parts.filter(n=>Number.isFinite(n)&&n>=0);
        output.replaceChildren(text('p','Enter finite nonnegative values, a success weight up to 100% and a wallet share up to one million ppm. Known cost components total '+money(known.reduce((a,v)=>a+v,0))+'. Full net and hourly return are unavailable.'));return;
      }
      const stat=(label,v)=>el('div',null,text('small',label),text('strong',v));
      output.replaceChildren(el('div',{class:'decision-heading'},text('h3',d.verdict),text('span','Eligibility unknown','status')),
        el('div',{class:'decision-stats'},stat('Weighted gross',money(b.gross)),stat('Economic net',money(b.net)),stat('Pre-labor hourly',b.hourly==null?'No active hours':money(b.hourly)+'/h'),stat('Cost hurdle',money(b.hurdle))),
        text('p','V6 default #'+review.comparison[row.slug].rank+' · '+money(review.comparison[row.slug].net)+' · '+review.comparison[row.slug].verdict+' → applied board #'+ranked.get(row.slug).opportunityRank,'decision-totals'),
        text('p',d.terms.timing+' · '+inputs.days+' assumed holding days + '+d.terms.exitDays+' exit days · '+d.terms.days+' modeled days. Variable fees use the scenario budget.','sub'),
        ...profiles.filter(p=>p.id===d.profileId).map(p=>el('details',{open:true},text('summary','Route evidence · '+p.reviewed_at),
          text('p',p.entry+' '+p.exit),p.settlement?text('p',p.settlement):null,text('p',(p.fees ?? 'Transaction quote unavailable.')+' '+(p.incentive ?? 'Separate incentive terms unverified.')+' Wallet reward unknown.'),
          text('p',p.risks,'sub'),...p.sources.map(u=>el('a',{href:u,text:new URL(u).hostname+' ',target:'_blank',rel:'noopener'})))),
        text('p','Next check · '+d.next),
        text('p','Modeled costs · transactions '+money(b.transaction)+' + foregone return '+money(b.opportunity)+' + time '+money(b.labor)+'. Net before labor '+money(b.cashNet)+'.','sub'),
        text('p','Break-even · conditional payout '+(b.requiredPayout===null?'unreachable at zero weight':money(b.requiredPayout))+' · joint weight '+(b.requiredWeight===null?'unreachable':(100*b.requiredWeight).toFixed(2)+'%'+(b.requiredWeight>1?' (infeasible)':''))+' · wallet share '+(b.requiredPpm==null?'unreachable':b.requiredPpm.toFixed(2)+' ppm')+' · maximum total fees '+money(b.feeCeiling)+'.','sub'),
        el('div',{class:'stress-lines'},d.sensitivity.map(s=>el('div',null,text('span',s.label),text('b',money(s.net),s.net<0?'neg':'pos')))));
    }
    const editor=el('div',{class:'decision-inputs'},Object.entries(units).map(([key,label])=>{
      const input=el('input',{type:'number',min:0,step:'any',max:key==='success'?100:key==='ppm'?1000000:null,value:assumptions[key],oninput:update});
      controls[key]=input;return el('label',null,text('span',label),input);
    }));
    edit.append(text('summary','Edit hypothetical assumptions'),editor,applyButton,
      button('Restore defaults',()=>{Object.keys(controls).forEach(k=>controls[k].value=defaults[k]);apply(defaults);update();}));
    update();
    return el('section',{class:'detail-section decision-detail'},text('h2','Participation decision'),
      rankLine,
      text('p','Model estimate '+money(row.implied_value_usd)+' · '+intel.comparables.categoryCount+' category peers · '+intel.span.ratio.toFixed(1)+'× model range. Snapshot token resemblance '+(initial.presence==null?'unavailable':initial.presence.toFixed(2))+' is a research signal.','sub'),
      assumptionsLine,profiles.length?el('div',null,profileSelect,variantSelect):null,output,edit,
      text('p','The wallet share applies to modeled circulating market cap. Joint success includes launch, distribution and qualification. Holding principal, ordinary yield and principal loss are outside the payout calculation. '+(ranked.get(row.slug).feeRate?'Assumes equal entry and exit notional and zero profit. Published proportional fees add '+(ranked.get(row.slug).feeRate*100).toFixed(2)+'% of capital to the fee budget.':'Verify all route fees against the assumed budget.'),'sub'),
      null);
  }
  function validation() {
    const v=review.validation;
    return el('section',{class:'panel compact'},text('h2','Valuation on unseen categories and families'),text('p','119 traded peers · 33 categories · 117 inferred families. Mean and median absolute log error; smaller is better. Top-20 overlap counts observed peers recovered.','sub'),
      el('div',{class:'table-wrap'},grid(v.columns,v.rows)),text('p',v.method,'sub'),
      text('p','TVL alone improves mean error. The accepted model improves median error on both splits and recovers one more top-20 peer on the category split. Chain breadth and the nonlinear term worsen mean error on both. The primary fit stays fixed.'));
  }
  function coverage() {
    const c=review.coverage;
    return el('section',{class:'panel compact'},text('h2','Coverage reconciliation'),text('p',c.screened+' pass a snapshot-only name, category and token-field screen. Identity review excludes '+c.excluded.length+'. The official watchlist includes '+c.exceptions.length+' exceptions.'),
      ...[['Disputed records',c.excluded],['Mandatory exceptions',c.exceptions]].map(([title,slugs])=>el('details',null,text('summary',title+' ('+slugs.length+')'),el('ul',null,slugs.map(s=>{const r=ledger.get(s);return el('li',null,text('strong',r.name+' · '+r.status+' '),text('span',r.evidence.slice(1).join(' ')));})))));
  }
  return {cover,detail,validation,coverage,get:slug=>ranked.get(slug),describe:()=>describe(assumptions),money};
}

