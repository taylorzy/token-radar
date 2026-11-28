/* Browser and CommonJS consume the same frozen fit and cross-fitted observations. */
(function () {
  'use strict';
  const features = {
    tvl:{transform:Math.log, inverse:Math.exp},
    growth:{transform:x=>Math.asinh(x/100),inverse:x=>100*Math.sinh(x)},
    age:{transform:Math.log1p,inverse:Math.expm1}
  };
  function components(fit,raw) {
    return fit.terms.map(({feature:key,center,coefficient,min,max,scale})=>{
      const value=raw[key];
      const imputed=value==null;
      const transformed=imputed?center:features[key].transform(value);
      const logContribution=(transformed-center)*coefficient;
      return {key,raw:value,transformed,center,coefficient,reference:features[key].inverse(center),imputed,
        outside:!imputed&&(transformed<min || transformed>max),logContribution,multiplier:Math.exp(logContribution),
        standardized:(transformed-center)/scale};
    });
  }
  function quantile(sorted,p) {
    if(!sorted.length) return null;
    const i=(sorted.length-1)*p, lo=Math.floor(i);
    return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo);
  }
  const mean = xs => xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
  const order = (a,b) => a<b?-1:a>b?1:0;
  const byError = (a,b) => a-b;
  function create(radar,intelligence) {
    const fit=radar.model.regression;
    const archive=radar.validationEvidence;
    const byInfo=new Map(intelligence.rows.map(info=>[info.slug,info]));
    const peers=(archive?.records??[]).map(([slug,name,category,family,fold,tvl,growth,age,observed,predicted,tvlOnlyPredicted])=>{
      const logError=Math.log(predicted)-Math.log(observed);
      const absoluteLogError=Math.abs(logError);
      const radius=archive.foldRadii[fold-1];
      return {slug,name,category,family,fold,tvl,growth,age,observed,predicted,tvlOnlyPredicted,
        errorFactor:Math.exp(absoluteLogError),logError,absoluteLogError,direction:predicted>observed?'over':predicted<observed?'under':'equal',
        radius,covered:absoluteLogError<=radius,foldBandLow:predicted/Math.exp(radius),foldBandHigh:predicted*Math.exp(radius)};
    });
    const peerComponents=new Map(peers.map(p=>[p.slug,components(fit,p)]));
    const absolute=peers.map(p=>p.absoluteLogError).sort(byError);
    const diagnostic=peers.map(p=>Math.abs(Math.log(p.tvlOnlyPredicted)-Math.log(p.observed))).sort(byError);
    const factorAt=(x,p)=>x.length?Math.exp(quantile(x,p)):null;
    const summary={asOf:radar.as_of,peerCount:peers.length,familyCount:new Set(peers.map(p=>p.family)).size,
      foldCount:archive?.foldRadii.length??0,coveredCount:peers.filter(p=>p.covered).length,
      typicalFactor:factorAt(absolute,.5),p90Factor:factorAt(absolute,.9),meanLogError:mean(absolute),
      tvlOnlyTypicalFactor:factorAt(diagnostic,.5),tvlOnlyP90Factor:factorAt(diagnostic,.9),tvlOnlyMeanLogError:mean(diagnostic),
      productionFactor:radar.uncertainty?.factor??null,productionResiduals:radar.uncertainty?.residuals??0,
      foldFactors:(archive?.foldRadii??[]).map(Math.exp)};
    const cache=new Map();
    const ranked=new Map(radar.rows.map(row=>[row.slug,row]));
    function get(slug) {
      if(cache.has(slug)) return cache.get(slug);
      const row=ranked.get(slug),info=byInfo.get(slug);
      if(!row || !info || !fit) return null;
      const asOfAge=(Date.parse(radar.as_of)-Date.parse(row.listed_at))/86400000;
      const parts=components(fit,{tvl:row.tvl_usd,growth:row.change_7d,age:Number.isFinite(asOfAge)&&asOfAge>=0?asOfAge:null});
      const family=archive?.familyLinks[slug]??slug;
      const categoryPeers=peers.filter(p=>p.category===row.category);
      const rankedPeers=peers.filter(p=>p.family!==family).map(p=>{
        const coordinates=peerComponents.get(p.slug);
        const distance=Math.hypot(...parts.map((part,i)=>part.standardized-coordinates[i].standardized));
        return {...p,distance,sameCategory:p.category===row.category,logTVLDistance:Math.abs(Math.log(p.tvl/row.tvl_usd))};
      });
      const category=rankedPeers.filter(p=>p.sameCategory)
        .sort((a,b)=>a.logTVLDistance-b.logTVLDistance||order(a.slug,b.slug));
      const numeric=rankedPeers.slice().sort((a,b)=>a.distance-b.distance||order(a.slug,b.slug));
      const selected=[],usedFamilies=new Set();
      for(const [selection,rows] of [['category',category],['numerical',numeric]]) {
        for(const p of rows) {
          if(selected.length===3) break;
          if(usedFamilies.has(p.family)) continue;
          usedFamilies.add(p.family);
          selected.push({...p,selection});
        }
      }
      const value=row.implied_value_usd;
      const scenarios=Object.entries(info.stress).map(([key,scenario])=>{
        const soloRank=1+radar.rows.filter(r=>r.slug!==slug && (r.implied_value_usd>scenario.value ||
          (r.implied_value_usd===scenario.value && order(r.slug,slug)<0))).length;
        return {key,...scenario,deltaPct:100*(scenario.value/value-1),rankChange:row.rank-scenario.rank,soloRank,
          soloRankChange:row.rank-soloRank};
      });
      const low=info.uncertainty.global[0],high=info.uncertainty.global[1];
      const [size,growth,age]=parts.map(p=>p.logContribution);
      const implied=Math.max(1,Math.round(Math.exp(fit.intercept+size)*Math.exp(growth)*Math.exp(age)));
      const record={slug,rank:row.rank,value,low,high,intercept:fit.intercept,logCap:fit.intercept+size+growth+age,implied,
        anchorUSD:Math.exp(fit.intercept),components:parts,scenarios,peers:selected,
        tvlAnchorUSD:Math.exp(fit.intercept)*parts.find(p=>p.key==='tvl').multiplier,
        family,categoryPeerCount:categoryPeers.length,categoryFamilyCount:new Set(categoryPeers.map(p=>p.family)).size,
        eligibleCategoryFamilyCount:new Set(category.map(p=>p.family)).size,
        missing:parts.filter(p=>p.imputed).map(p=>p.key),outside:parts.filter(p=>p.outside).map(p=>p.key),weak:info.uncertainty.weak};
      cache.set(slug,record);
      return record;
    }
    return {summary,peers,get};
  }
  const api={create};
  if(typeof module==='object'&&module.exports) module.exports=api; else window.RadarEvidence=api;
})();
