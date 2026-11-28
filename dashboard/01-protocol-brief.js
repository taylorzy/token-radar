/* Read the price and participation decision side by side. All numeric evidence comes from the shared model. */
function protocolBrief(el,valuation,row,ledger,format) {
  const ev=valuation.get(row.slug), group=valuation.summary;
  const text=(tag,t,cls)=>el(tag,{text:t,class:cls});
  const money=format.fmtUsd;
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const factor=n=>number.format(n)+'×';
  const label={tvl:'TVL',growth:'7-day growth',age:'Tracking age'};
  const rawNumber=new Intl.NumberFormat('en-US',{maximumFractionDigits:10});
  const integerUSD=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const stress=ev.scenarios.reduce((largest,s)=>Math.abs(Math.log(s.value/ev.value))>Math.abs(Math.log(largest.value/ev.value))?s:largest);
  const stressLabel={reference:'Resetting growth to the peer median',clamp:'Clipping growth to the peer range',flat:'Setting growth to zero',tvl25:'Reducing TVL by 25%',age365:'Adding one tracking year'};
  const price=el('header',{class:'brief-price'},text('span','Implied market cap'),text('strong',money(ev.value)),
    text('small','Official #'+row.rank+' · '+ledger.status));
  const transforms={tvl:'ln(USD)',growth:'asinh(% / 100)',age:'ln(1 + days)'};
  const units={tvl:' USD',growth:'%',age:' days'};
  const decimals=n=>n.toFixed(6);
  const signed=n=>(n<0?' − ':' + ')+decimals(Math.abs(n));
  const bridge=el('section',{class:'valuation-bridge','aria-label':'Valuation calculation'},
    text('h3','From protocol inputs to market cap'),
    text('p','Huber fit · '+window.RADAR.model.regression.comparables+' priced peers. Center each transformed input on its peer median, then multiply by its fitted slope. Slopes include the training-scale adjustment.'),
    el('table',{class:'bridge-table'},el('thead',null,el('tr',null,['Snapshot input','Transform − median','Slope','Log effect'].map(s=>el('th',{scope:'col',text:s})))),
      el('tbody',null,ev.components.map(c=>el('tr',{'data-feature':c.key},
        el('th',{scope:'row'},text('b',label[c.key]),text('small',c.imputed?'Missing → median':rawNumber.format(c.raw)+units[c.key],'raw')),
        el('td',null,text('b',transforms[c.key]),text('small',decimals(c.transformed)+' − '+decimals(c.center),'centered')),
        el('td',{class:'slope',text:decimals(c.coefficient)}),el('td',{class:'effect',text:decimals(c.logContribution)}))))),
    el('div',{class:'bridge-result'},
      text('small','Log cap = intercept + three log effects'),
      text('div',decimals(ev.intercept)+ev.components.map(c=>signed(c.logContribution)).join('')+' ≈ '+ev.logCap.toFixed(9),'log-sum'),
      text('strong','exp('+ev.logCap.toFixed(9)+') ≈ '+integerUSD.format(ev.implied),'inverse')),
    text('p','Final cap rounded once to whole USD (floor $1). Using the printed inputs and slopes, allow $1 or 0.01%, whichever is larger.','bridge-note'));
  const peers=el('table',{class:'brief-peers'},el('thead',null,el('tr',null,['Traded peer','Observed cap','Held-out prediction','Miss'].map(s=>text('th',s)))),
    el('tbody',null,ev.peers.map(p=>el('tr',null,
      el('td',null,text('b',p.name),text('small',p.selection==='category'?p.category+' · '+money(p.tvl)+' TVL':p.category+' · input neighbor')),
      text('td',money(p.observed)),text('td',money(p.predicted)),
      text('td',factor(p.errorFactor)+(p.direction==='equal'?'':' '+p.direction))))));
  const peersWhy=ev.peers.every(p=>p.selection==='category') ?
    'Closest TVL in '+row.category+', one peer per inferred family.' :
    'Same-category families by closest TVL first. Other neighbors match transformed TVL, growth and age.';
  const validation=el('details',{class:'brief-fold'},text('summary','How the peer check was run'),
    text('p',group.peerCount+' priced peers · '+group.familyCount+' inferred families · '+group.foldCount+' held-out folds. Each peer prediction shown here came from a refit with that family excluded.'),
    text('p','Median miss '+factor(group.typicalFactor)+' versus '+factor(group.tvlOnlyTypicalFactor)+' with TVL alone. At the 90th percentile the misses were '+factor(group.p90Factor)+' and '+factor(group.tvlOnlyP90Factor)+', respectively.'),
    text('p','Validation uses recorded market caps on the same snapshot. A future launch price, token issuance and wallet eligibility remain unobserved.'));
  const lines=ledger.evidence.map(s=>s.split(' Sources:')[0]);
  const identity=el('details',{class:'brief-fold'},text('summary','Why this protocol is ranked'),
    text('p',(ledger.watchlist?'Mandatory watchlist':'Additional candidate')+' · '+(ledger.identity||ledger.status)+'. '+lines.join(' ')),
    ledger.subsequent?text('p',ledger.subsequent.finding):null);
  const body=el('details',{class:'brief-research',open:window.matchMedia('(min-width: 800px)').matches?'':null},
    text('summary','Valuation evidence'),el('div',{class:'brief-body'},
      text('h4','Comparable market caps'),text('p',peersWhy,'brief-why'),peers,
      text('p',group.foldCount+' family-held-out folds · '+group.peerCount+' traded caps. Median miss '+factor(group.typicalFactor)+' versus '+factor(group.tvlOnlyTypicalFactor)+' with TVL alone.','brief-validation'),
      validation,
      identity));
  return el('section',{class:'protocol-brief'},price,
    text('p','80% peer-error range '+money(ev.low)+' – '+money(ev.high)+' · leave-one-peer-out residuals. Future launch coverage unknown.','brief-range'),
    bridge,el('div',{class:'bridge-stress'},text('b','Largest of five stresses'),text('p',stressLabel[stress.key]+' gives '+money(stress.value)+' (rank #'+stress.soloRank+' with other inputs fixed across the board).'),
      ev.outside.length?text('p','Beyond the fitted peer range · '+ev.outside.map(k=>label[k]).join(', ')):null),body);
}
