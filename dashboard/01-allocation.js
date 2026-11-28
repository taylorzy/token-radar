/* Monetary inputs and results are USD. Rates are percentages, fee terms use the units in the profile. */
(function () {
  'use strict';
  const decision = typeof module === 'object' ? require('./00-decision.js') : window.RadarDecision;
  const entry = typeof module === 'object' ? require('./01-entry-review.js') : window.RadarEntry;
  // From the dated Morpho deployment pages in research/allocation-yield-evidence.json.
  // Amounts here are percentage points. A missing fee is unquoted.
  const morphoQuotes = [
    ['steakhouse-financial/v6','Steakhouse USDC V1','Ethereum','0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB',3.01,5,null,null,'01:59:37'],
    ['gauntlet/v6','Gauntlet USDC Prime v2','Base','0x050cE30b927Da55177A4914EC73480238BAD56f0',4.33,0,0,0.001,'01:59:36'],
    ['clearstar/v6','Clearstar Core USDC','Arc','0xd45C268Ef9850a00D51d7c05C0aF17fdAd309060',7.90,5,0,0,'01:59:37'],
    ['rockawayx/v6','RockawayX USDC Yield','Ethereum','0xE0181090c22579B6A217f1522cbf8c9f1F0C1965',6.24,5,0,0.5,'01:59:38'],
    ['galaxy-curation/v6','Galaxy USDC','Arc','0x8E357432CC12ff425c36432F312968aEb16112AF',0.70,0,0,0,'01:59:38']
  ].map(([id,instrument,network,address,netAPY,feePct,managementFeePct,forceDeallocationFeePct,time]) =>
    ({id,instrument,network,address,netAPY,feePct,managementFeePct,forceDeallocationFeePct,asOf:'2026-11-28T'+time+'Z'}));

  function quote(profile) {
    const q = morphoQuotes.find(row => row.id===profile?.id);
    if (!q || !entry) return null;
    const reviewed = entry.get(profile,profile.slug);
    const prefix = 'https://app.morpho.org/'+q.network.toLowerCase()+'/vault/'+q.address+'/';
    if (reviewed.status!=='verified' || reviewed.instrument!==q.instrument || reviewed.network!==q.network ||
        !reviewed.source?.startsWith(prefix)) return null;
    return {...q,source:reviewed.source};
  }
  const defaults = Object.freeze({
    capitalUSD:1000, holdDays:30, extraExitDays:0, benchmarkAPR:5, extraFeesUSD:8,
    activeHours:1, hourlyUSD:20, operatingAPR:0, rewardUSD:0
  });
  const feeKeys = [
    'buyBpsOnPurchase','sellBpsOnSale','directMintBps','directRedeemBps','exitBpsOnNAV',
    'approxInstantExitBps','profitFeeBpsOnPositiveProfit','performanceFeeOnProfitPct',
    'annualManagementFeePct','oneTimeBorrowFeeBps'
  ];
  const exitKeys = [
    'minimumQueueDaysByV1Vault','exitDaysRange','queueDays','exitDays','estimatedExitDays',
    'exitMaxUSBusinessDays','exitHours','underlyingExitHours'
  ];

  function evaluate(profile, inputs = {}, variant) {
    if (!profile || !profile.id) return {error:'Select a documented product and route to compare.'};
    const a = {...defaults, ...inputs};
    for (const key of Object.keys(defaults)) {
      if (!Number.isFinite(a[key]) || (key !== 'operatingAPR' && a[key] < 0))
        return {error:'Enter a finite scenario value for '+key+'.'};
    }
    if (!a.capitalUSD) return {error:'Enter a positive committed capital amount.'};
    const q = quote(profile);
    const usedObservedNetAPY = inputs.useObservedNetAPY===true && q!==null;
    const t = {...profile.terms};
    if (q && t.performanceFeeOnProfitPct==null && t.profitFeeBpsOnPositiveProfit==null) t.performanceFeeOnProfitPct=q.feePct;
    if (q && t.annualManagementFeePct==null && q.managementFeePct!=null) t.annualManagementFeePct=q.managementFeePct;
    // With no explicit range selection, price the longer documented exit rather than its lower endpoint.
    const selected = variant || (t.exitDaysRange ? 'Upper bound' : undefined);
    if (t.minimumQueueDaysByV1Vault && selected && !Object.hasOwn(t.minimumQueueDaysByV1Vault,selected))
      return {error:'Select a vault listed in the reviewed exit terms.'};
    const resolved = decision.resolveRoute(profile,{days:a.holdDays},selected);
    const holdDays = Math.max(a.holdDays,(t.minHoldHours ?? 0)/24);
    const exitDays = resolved.exitDays + a.extraExitDays;
    const capitalDays = holdDays + exitDays;
    const operatingUSD = usedObservedNetAPY
      ? a.capitalUSD * Math.expm1(Math.log1p(q.netAPY/100)*holdDays/365)
      : a.capitalUSD * (a.operatingAPR/100) * (holdDays/365);
    const benchmarkUSD = a.capitalUSD * (a.benchmarkAPR/100) * (capitalDays/365);
    const laborUSD = a.activeHours * a.hourlyUSD;
    const hasKnownExitTime = exitKeys.some(key => t[key] != null);
    const knownFeeTerms = feeKeys.filter(key => t[key] != null);
    const feeItems = [];
    function addFee(term,label,baseUSD,denominator,basis) {
      if (t[term] == null) return 0;
      const usd = baseUSD*t[term]/denominator;
      feeItems.push({term,label,basis,rate:t[term],baseUSD,usd});
      return usd;
    }
    addFee('buyBpsOnPurchase','Purchase fee',a.capitalUSD,10000,'purchase notional');
    addFee('sellBpsOnSale','Sale fee',a.capitalUSD,10000,'sale at unchanged unit price');
    addFee('directMintBps','Mint fee',a.capitalUSD,10000,'direct mint notional');
    addFee('directRedeemBps','Redeem fee',a.capitalUSD,10000,'direct redemption at par');
    let retainedProfit = operatingUSD;
    const positiveOperatingProfit = Math.max(0,operatingUSD);
    if (!usedObservedNetAPY) {
      retainedProfit -= addFee('profitFeeBpsOnPositiveProfit','Fee on positive operating profit',
      positiveOperatingProfit,10000,'positive pre-fee operating profit');
      retainedProfit -= addFee('performanceFeeOnProfitPct','Performance fee',
      positiveOperatingProfit,100,'positive pre-fee operating profit');
      retainedProfit -= addFee('annualManagementFeePct','Management fee',
      a.capitalUSD*holdDays/365,100,'principal times years held');
    }
    const exitNAV = a.capitalUSD + retainedProfit;
    if (exitNAV < 0) return {error:'Operating loss or fees exceed capital. Shorten the scenario or change the assumed return.'};
    addFee('exitBpsOnNAV','Exit charge',exitNAV,10000,'scenario exit NAV including retained operating profit');
    if (selected==='Instant') addFee('approxInstantExitBps','Approximate instant exit fee',
      a.capitalUSD,10000,'redemption at unchanged assumed NAV');
    // Borrow notional is not interchangeable with posted collateral. The catalog only quantifies a zero fee here.
    if (t.oneTimeBorrowFeeBps===0) feeItems.push({term:'oneTimeBorrowFeeBps',label:'One-time borrowing fee',
      basis:'documented zero rate',rate:0,baseUSD:null,usd:0});
    const documentedFeesUSD = feeItems.reduce((s,fee)=>s+fee.usd,0);
    const costsUSD = documentedFeesUSD + a.extraFeesUSD;
    const incrementalUSD = operatingUSD + a.rewardUSD - costsUSD - benchmarkUSD;
    const netUSD = incrementalUSD - laborUSD;
    const cashBreakEvenRewardUSD = Math.max(0,costsUSD+benchmarkUSD-operatingUSD);
    const breakEvenRewardUSD = Math.max(0,costsUSD+benchmarkUSD+laborUSD-operatingUSD);
    const incrementalPerHourUSD = a.activeHours > 0 ? incrementalUSD/a.activeHours : null;
    const netPerHourUSD = a.activeHours > 0 ? netUSD/a.activeHours : null;
    const numbers = [holdDays,exitDays,capitalDays,operatingUSD,benchmarkUSD,laborUSD,documentedFeesUSD,
      costsUSD,incrementalUSD,netUSD,cashBreakEvenRewardUSD,breakEvenRewardUSD,incrementalPerHourUSD,netPerHourUSD];
    if (numbers.some(n=>n!==null && !Number.isFinite(n))) return {error:'Reduce the scenario inputs to fit the calculation.'};

    const limits = [];
    if (usedObservedNetAPY) limits.push('The dated vault net APY includes operating fees. This scenario holds that rate constant until the end of the hold.');
    if (inputs.useObservedNetAPY===true && !q) limits.push('No reviewed deployment net APY is available. The manual operating APR applies.');
    if (q?.forceDeallocationFeePct>0) limits.push('Forced deallocation carries a conditional '+q.forceDeallocationFeePct+'% fee. Include your quoted cost in extra fees if that exit mechanism applies.');
    let eligibleForNewEntry = null;
    if (t.newEntry==='closed' || t.newEntry==='deprecated') {
      eligibleForNewEntry = false;
      limits.push(t.newEntry==='closed' ? 'This route is closed to new entries. The figures model an existing position.' :
        'This product is deprecated. New deposits are outside this scenario.');
    }
    if (profile.minimum?.asset==='USDC' && Number.isFinite(profile.minimum.amount)) {
      limits.push('Entry minimum '+profile.minimum.amount+' USDC. The USD comparison assumes USDC at par.');
      if (a.capitalUSD < profile.minimum.amount) eligibleForNewEntry = false;
    }
    if (t.minimumRedemptionUnits != null) limits.push('Redemption requires '+t.minimumRedemptionUnits+' '+
      (t.redemptionAsset ?? 'units')+'. Verify the token balance separately from the USD scenario.');
    if (t.minimumPayoutUSD != null) limits.push('The $'+t.minimumPayoutUSD+' payout floor applies to eligible distributions, not deposits or assured rewards.');
    if (t.oneTimeBorrowFeeBps > 0) limits.push('Borrowed principal is needed to price the one-time borrowing fee. Include the calculated amount in extra costs.');
    if (!hasKnownExitTime) limits.push('Settlement time is unquoted. Extra exit days are a user assumption. Zero gives the lowest modeled time cost.');
    if (!feeItems.length) limits.push('No separate quantified route charge is applied. Use the extra fee budget for unquoted charges.');
    return {capitalUSD:a.capitalUSD, plannedHoldDays:a.holdDays, holdDays, exitDays, documentedExitDays:resolved.exitDays,
      extraExitDays:a.extraExitDays, capitalDays,activeHours:a.activeHours,documentedFeesUSD,extraFeesUSD:a.extraFeesUSD,
      costsUSD,benchmarkUSD,laborUSD,operatingUSD,rewardUSD:a.rewardUSD,incrementalUSD,incrementalPerHourUSD,netUSD,
      netPerHourUSD,cashBreakEvenRewardUSD,breakEvenRewardUSD,timing:resolved.timing,limits,eligibleForNewEntry,
      knownFeeTerms,hasKnownExitTime,feeItems,usedObservedNetAPY,observedQuote:usedObservedNetAPY?q:null};
  }
  const api = Object.freeze({defaults,evaluate,quote});
  if (typeof module==='object') module.exports=api; else window.RadarAllocation=api;
})();
