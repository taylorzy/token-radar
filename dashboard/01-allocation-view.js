/* Eligibility and capital allocation use the selected instrument and exit path throughout. */
function allocationWorkspace(el, farms, insights) {
  const engine = window.RadarAllocation;
  const statusNames = {verified:'Verified new entry',conditional:'Conditional entry',holder:'Existing holders',unavailable:'Unavailable',unknown:'Insufficient evidence'};
  const exitNames = {immediate:'Prompt exit',delayed:'Lock or queue',liquidity:'Liquidity-dependent',unknown:'Exit unverified'};
  const selections = new Map(), edits = new Map(), cases = new Map();
  const shared = {...engine.defaults};
  const commonKeys = new Set(['capitalUSD','holdDays','benchmarkAPR','hourlyUSD']);
  const money = n => n == null ? 'Unavailable' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  const text = (tag,value,cls) => el(tag,{text:value,class:cls});
  const button = (label,click,attrs={}) => el('button',{type:'button',text:label,onclick:click,...attrs});
  function paths(row) {
    if(cases.has(row.slug)) return cases.get(row.slug);
    const profiles=farms[row.slug]?.profiles || [];
    const list=(profiles.length ? profiles : [null]).flatMap(profile=>{
      const evidence=window.RadarEntry.get(profile,row.slug);
      const terms=profile?.terms || {};
      const variants=terms.minimumQueueDaysByV1Vault ? ['extUSD v1',...Object.keys(terms.minimumQueueDaysByV1Vault).filter(k=>k!=='extUSD v1')] :
        terms.exitDaysRange ? ['Upper bound','Lower bound'] : terms.approxInstantExitBps ? ['Queue','Instant'] : [''];
      return variants.map(variant=>({
        profile,variant,evidence,exit:variant==='Instant'?'liquidity':variant==='Queue'?'delayed':evidence.exit,
        id:(profile?.id || row.slug+'/unverified')+'|'+variant
      }));
    });
    cases.set(row.slug,list);
    return list;
  }
  function matching(row,access,exit) {
    return paths(row).filter(p=>(access==='all'||p.evidence.status===access)&&(exit==='all'||p.exit===exit));
  }
  function chosen(row,access,exit) {
    const allowed=matching(row,access,exit);
    return allowed.find(p=>p.id===selections.get(row.slug)) || allowed[0] || paths(row)[0];
  }
  function routeName(path,row) {
    const profile=path.profile;
    if(!profile)return 'Participation research';
    const suffix=profile.id.split('/').pop();
    const name=path.evidence.instrument || (suffix==='v6'?row.name+' route':suffix.replaceAll('-',' '));
    return name+(path.variant?' · '+path.variant:'');
  }
  const localInputs = path => ({...engine.defaults,useObservedNetAPY:!!engine.quote(path.profile),...Object.fromEntries([...commonKeys].map(k=>[k,shared[k]])),...(edits.get(path.id)||{})});
  function belowMinimum(path,capital) {
    const m=path.evidence.minimum;
    return m && ['USDC','USD'].includes(m.asset) && ['entry','deposit'].includes(m.action) && capital<m.amount;
  }
  function remember(path,inputs) {
    const local={};
    for(const [k,v] of Object.entries(inputs)) {
      if(commonKeys.has(k)) shared[k]=v;
      else local[k]=v;
    }
    edits.set(path.id,local);
  }
  function metric(label,value) {
    return el('div',null,text('dt',label),text('dd',value));
  }
  function sourceLine(path,row) {
    const finding=insights.get(row.slug)?.participation;
    const urls=[...new Set([path.evidence.source,...(path.profile?.sources || finding?.sources || [])].filter(Boolean))];
    return el('div',{class:'allocation-sources'},urls.length ? text('small','Evidence reviewed '+(path.evidence.reviewedAt || path.profile?.reviewed_at || finding?.date || '—')) : null,
      urls.map(address=>el('a',{href:address,target:'_blank',rel:'noopener',text:new URL(address).hostname})));
  }
  function detail(row,initial) {
    const all=paths(row);
    let path=initial;
    const section=el('section',{class:'detail-section alloc-view'});
    function paint() {
      const e=path.evidence, profile=path.profile;
      const selector=el('select',{'aria-label':'Route and exit path'},all.map(p=>el('option',{value:p.id,text:routeName(p,row)})));
      selector.value=path.id;
      selector.onchange=()=>{path=all.find(p=>p.id===selector.value);selections.set(row.slug,path.id);paint();section.querySelector('select')?.focus();};
      const entry=el('div',{class:'allocation-gate','data-entry':e.status},
        el('div',{class:'gate-head'},text('strong',statusNames[e.status]),text('span',exitNames[path.exit])),
        text('p',e.reason));
      const notes=el('details',{class:'alloc-notes'},text('summary','Instrument, terms and sources'),
        e.instrument ? text('p',e.instrument+(e.network?' · '+e.network:'')):null,
        e.minimum ? text('p','Minimum '+e.minimum.action+' · '+e.minimum.amount+' '+e.minimum.asset):null,
        profile ? text('p',profile.entry+' '+profile.exit):null,
        profile?.incentive ? text('p','Documented incentive · '+profile.incentive):null,
        profile?.fees ? text('p',profile.fees):null, profile?.risks ? text('p',profile.risks):null,sourceLine(path,row));
      section.replaceChildren(el('div',{class:'alloc-heading'},text('h3','Participation decision'),
        all.length>1 ? selector : text('span',routeName(path,row)+(e.network?' · '+e.network:''))),entry);
      if(!profile || ['unknown','unavailable'].includes(e.status)) {
        const finding=insights.get(row.slug)?.participation;
        section.append(el('div',{class:'alloc-stop'},text('h4',e.status==='unavailable'?'Keep new capital outside this route':'Verify the route before allocating capital'),
          text('p',profile?.exit || finding?.finding || 'A named instrument, entry requirements and a documented path back to the settlement asset are needed.'),
          text('p','A wallet payout and a reliable exit quote are unverified.','sub')),sourceLine(path,row),notes);
        return;
      }
      const inputs=localInputs(path);
      const quote=engine.quote(profile);
      const outcome=el('div',{'aria-live':'polite',class:'allocation-result'});
      const fields=[
        ['capitalUSD','Committed capital ($)'],['holdDays','Holding days'],['benchmarkAPR','Alternative APR (%)'],['hourlyUSD','Value of time ($/h)'],
        ['operatingAPR','Assumed operating APR (%)'],['rewardUSD','Hypothetical wallet reward ($)'],['extraFeesUSD','Additional fee budget ($)'],['activeHours','Active hours'],['extraExitDays','Extra settlement days']
      ];
      const controls={};
      const useQuote=el('input',{type:'checkbox',checked:quote && inputs.useObservedNetAPY?'':null});
      const editor=el('details',{class:'alloc-editor'},text('summary','Edit capital, time and reward assumptions'),
        text('p','Capital, holding days, cash APR and value of time apply across routes. Enter only extra fees and rewards outside the chosen operating yield. Other inputs apply to this route and exit.','sub'),
        quote?el('label',null,useQuote,' Project the reviewed '+quote.netAPY+'% net APY over the holding period'):null,
        el('div',{class:'alloc-inputs'},fields.map(([key,label])=>{
          const input=el('input',{type:'number',step:'any',min:key==='operatingAPR'?null:0,value:inputs[key]??0});
          controls[key]=input;
          return el('label',null,text('span',label),input);
        })));
      const comparison=el('details',{class:'alloc-editor'},text('summary','Compare another route on the same capital'));
      const otherPaths=[];
      for(const other of window.RADAR.rows){
        for(const choice of paths(other)){
          if(choice.id===path.id || !choice.profile)continue;
          if(e.status==='holder' ? other.slug!==row.slug || choice.evidence.status!=='holder' : !['verified','conditional'].includes(choice.evidence.status))continue;
          otherPaths.push({row:other,path:choice});
        }
      }
      const selectOther=el('select',{'aria-label':'Comparison route'},el('option',{value:'',text:'Choose a route'}),
        otherPaths.map(o=>el('option',{value:o.path.id,text:o.row.name+' · '+routeName(o.path,o.row)})));
      const comparisonResult=el('div',{'aria-live':'polite'});
      comparison.append(selectOther,comparisonResult);
      function compare(a,values) {
        comparisonResult.replaceChildren();
        const other=otherPaths.find(o=>o.path.id===selectOther.value);
        if(!other || !a || a.error)return;
        const alt=engine.evaluate(other.path.profile,localInputs(other.path),other.path.variant);
        if(alt.error){comparisonResult.append(text('p',alt.error));return;}
        if(e.status!=='holder' && (a.eligibleForNewEntry===false || alt.eligibleForNewEntry===false ||
            belowMinimum(path,values.capitalUSD)||belowMinimum(other.path,values.capitalUSD))){
          comparisonResult.append(text('p','This capital amount does not satisfy both entry requirements.'));return;
        }
        const horizon=Math.max(a.capitalDays,alt.capitalDays);
        const hurdle=values.capitalUSD*values.benchmarkAPR/100*horizon/365;
        comparisonResult.append(text('p',money(values.capitalUSD)+' each for '+Number(horizon.toFixed(2))+' modeled days. Capital released earlier earns the same benchmark until that date. Shared alternative earns '+money(hurdle)+'.','sub'),
          el('dl',{class:'cash-bridge'},[[row,path,a],[other.row,other.path,alt]].map(([r,p,result])=>
            metric(r.name+' · '+routeName(p,r)+' · '+statusNames[p.evidence.status]+' · '+result.activeHours+' h',
              money(result.netUSD)+' after labor'))),
          text('p','Comparison uses each route’s saved fee, time, yield, reward and exit assumptions. Unquoted settlement remains a scenario.','sub'));
      }
      function update(){
        const values=Object.fromEntries(Object.entries(controls).map(([k,input])=>[k,input.valueAsNumber]));
        values.useObservedNetAPY=!!quote && useQuote.checked;
        controls.operatingAPR.disabled=values.useObservedNetAPY;
        const a=engine.evaluate(profile,values,path.variant);
        if(a.error){outcome.replaceChildren(text('p',a.error,'alloc-error'));comparisonResult.replaceChildren();return;}
        remember(path,values);
        const holder=e.status==='holder';
        const gated=(a.eligibleForNewEntry===false || belowMinimum(path,values.capitalUSD)) && !holder;
        const conditional=e.status==='conditional';
        const conclusion=holder?'Existing position only':gated?'Entry constraint applies':a.netUSD<0?'Benchmark leads after labor':a.netUSD>0?'Route leads under these assumptions':'Equal after labor';
        const exitNote=path.exit==='unknown'||path.exit==='liquidity'?' · settlement timing unquoted':'';
        const context=money(a.capitalUSD)+' over '+Number(a.capitalDays.toFixed(2))+' modeled days'+exitNote;
        const bridge=el('dl',{class:'cash-bridge'},
          metric(values.useObservedNetAPY?'Operating yield · if '+quote.netAPY+'% net APY persists':'Operating yield · assumed '+values.operatingAPR+'% APR',money(a.operatingUSD)),
          metric('Hypothetical token reward',money(a.rewardUSD)),
          metric('Modeled route fees + execution budget','−'+money(a.costsUSD)),
          metric('Cash alternative · '+values.benchmarkAPR+'% assumed APR','−'+money(a.benchmarkUSD)),
          metric('Increment above alternative',money(a.incrementalUSD)),
          metric('Labor · '+values.activeHours+' h × '+money(values.hourlyUSD),'−'+money(a.laborUSD)),
          metric('Economic benefit after labor',money(a.netUSD)));
        const verdict=el('div',{class:'allocation-verdict'},text('small',context),text('h4',conclusion),
          el('div',{class:'alloc-key'},
            el('div',null,text('b',a.incrementalPerHourUSD==null?'—':money(a.incrementalPerHourUSD)+'/h'),text('span','Above benchmark per active hour, before labor')),
            el('div',null,text('b',money(a.breakEvenRewardUSD)),text('span','Wallet reward needed to break even after labor'))));
        const fees=el('details',{class:'alloc-fees'},text('summary','Fee breakdown · '+money(a.costsUSD)),
          el('dl',{class:'cash-bridge'},metric('Additional execution budget',money(a.extraFeesUSD)),
            a.feeItems.map(f=>metric(f.label+' · '+f.basis,money(f.usd)))));
        const assumptions=el('p',{class:'alloc-foot',text:(holder?'Holder scenario from today. ':conditional?'Conditional on satisfying the stated entry requirements. ':'')+
          'Operating yield and token rewards are scenario inputs. Principal loss, live execution and wallet entitlement remain unpriced.'});
        outcome.replaceChildren(verdict,el('div',{class:'allocation-breakdown'},el('div',null,text('h4','Capital and time'),bridge,fees),
          el('aside',null,text('h4','Participation terms'),quote?el('p',null,el('a',{href:quote.source,target:'_blank',rel:'noopener',text:'Operator net APY · '+quote.netAPY+'%'}),' · reviewed '+quote.asOf+'. Rate varies.'):text('p',profile.incentive || 'Monetary reward terms unverified.'),
            text('p',profile.exit),text('p','Holding '+a.holdDays+' d · modeled capital horizon '+Number(a.capitalDays.toFixed(2))+' d. '+(a.timing||''),'sub'),
            ...(a.limits||[]).map(s=>text('small',s)))) ,assumptions);
        compare(a,values);
      }
      for(const input of Object.values(controls)) input.oninput=update;
      useQuote.onchange=update;
      selectOther.onchange=update;
      section.append(outcome,editor);
      if(otherPaths.length)section.append(comparison);
      section.append(notes);
      update();
    }
    paint();
    return section;
  }
  function estimate(path) {
    if(!path.profile || !['verified','conditional'].includes(path.evidence.status))return null;
    const inputs=localInputs(path);
    const result=engine.evaluate(path.profile,inputs,path.variant);
    if(result.error || result.eligibleForNewEntry===false || belowMinimum(path,inputs.capitalUSD))return null;
    return result;
  }
  function shortlist(rows,access,exit,open) {
    const items=rows.map(row=>{
      const path=chosen(row,access,exit);
      return {row,path,result:estimate(path)};
    }).sort((a,b)=>(b.result?.incrementalPerHourUSD??-Infinity)-(a.result?.incrementalPerHourUSD??-Infinity)||a.row.rank-b.row.rank);
    const columns=['Official rank','Protocol and route','Entry and exit','Above cash / active hour','After labor'];
    return el('section',{class:'panel ranked-table allocation-list'},
      el('div',{class:'shortlist-head'},text('h2','Compare allocation decisions'),
        text('p',money(shared.capitalUSD)+' per route · '+shared.holdDays+' holding days · '+shared.benchmarkAPR+'% assumed cash APR · labor valued at '+money(shared.hourlyUSD)+'/h. Sorted by incremental dollars per active hour before labor.','sub')),
      el('div',{class:'table-wrap'},el('table',null,el('thead',null,el('tr',null,columns.map(col=>text('th',col)))),
        el('tbody',null,items.map(({row,path,result})=>{
          const cells=[text('td','#'+row.rank,'official-number'),
            el('td',null,button(row.name,()=>open(row.slug,'Allocation'),{class:'protocol-link'}),text('small',routeName(path,row),'sub block')),
            el('td',null,text('strong',statusNames[path.evidence.status]),text('small',exitNames[path.exit],'sub block')),
            el('td',null,text('strong',result?.incrementalPerHourUSD!=null?money(result.incrementalPerHourUSD)+'/h':'—'),
              result?text('small',localInputs(path).useObservedNetAPY?'At reviewed variable yield':'At assumed '+localInputs(path).operatingAPR+'% APR','sub block'):null),
            text('td',result?money(result.netUSD):'Entry or evidence hold')];
          cells.forEach((c,i)=>c.dataset.label=columns[i]);
          return el('tr',{'data-slug':row.slug},cells);
        })))));
  }
  return {paths,matching,chosen,statusNames,exitNames,routeName,detail,shortlist,estimate};
}
