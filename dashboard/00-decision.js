/* Shared by the Node build and the offline scenario editor. Monetary amounts are USD. */
(function () {
  const defaults = Object.freeze({capital:1000, days:30, annual:5, fees:8, hours:1, wage:20, ppm:2, success:0});
  const fields = Object.keys(defaults);
  // ppm is a hypothetical wallet share of the modeled circulating market cap.
  // success is the user's joint launch, distribution and qualification weight for the horizon.
  function economics(value, inputs, feeRate = 0) {
    if (![value, feeRate, ...fields.map(k => inputs[k])].every(x => Number.isFinite(x) && x >= 0)
        || inputs.success > 100 || inputs.ppm > 1000000) return null;
    const transaction = inputs.fees + feeRate * inputs.capital;
    const opportunity = inputs.capital * inputs.annual / 100 * inputs.days / 365;
    const labor = inputs.hours * inputs.wage;
    const hurdle = transaction + opportunity + labor;
    const payout = value * inputs.ppm / 1000000;
    const weight = inputs.success / 100;
    const gross = payout * weight;
    const cashNet = gross - transaction - opportunity;
    const net = cashNet - labor;
    const numbers = {transaction, opportunity, labor, hurdle, payout, gross, cashNet, net,
      hourly: inputs.hours ? cashNet / inputs.hours : null,
      requiredPayout: weight ? hurdle / weight : hurdle ? null : 0,
      requiredWeight: payout ? hurdle / payout : hurdle ? null : 0,
      requiredPpm: weight * value ? hurdle / (weight * value) * 1000000 : hurdle ? null : 0,
      feeCeiling: gross - opportunity - labor};
    return Object.values(numbers).every(x => x === null || Number.isFinite(x)) ? numbers : null;
  }
  const checks = {
    'bitfi-basis':'Issuer already advertises a BFI claim. Verify token identity.',
    'polymarket-international':'Check geographic access and event-loss tolerance before considering an outcome position.',
    'opentrade':'An approved distributor and allowlisted wallet are required.',
    'k3-capital':'The reviewed US site offers no services to US residents.',
    'hive-protocol':'The reviewed interface restricted access in the review context.',
    'firelight':'A 30–60 day unstaking window can exceed the default horizon. Capital can still be slashed.',
    'doppler-finance':'Check jurisdiction and the seven-day withdrawal period for the XRP vault.',
    'nuva':'Confirm location, investor screening and the nvYLDS minimum.',
    'tori-finance':'The direct mint and redeem scenario requires identity verification. Secondary swaps require separate quotes.',
    'veda':'Verify share transfer restrictions and solver availability for the configured BoringQueue.',
    'onre':'Confirm investor screening and the selected redemption channel.',
    'figure-markets-prime':'Verify account approval and settlement terms.',
    'mellow-core':'Match the selected deployed vault to the ERC20RootVault architecture and check access.'
  };
  function resolveRoute(profile, inputs, variant) {
    const t=profile?.terms ?? {};
    const queue=t.minimumQueueDaysByV1Vault;
    const instant=variant==='Instant' && t.approxInstantExitBps != null;
    const exitDays=queue ? queue[variant] ?? queue['extUSD v1'] :
      t.exitDaysRange ? t.exitDaysRange[variant==='Upper bound' ? 1 : 0] :
      instant ? 0 : t.queueDays ?? t.exitDays ?? t.estimatedExitDays ?? t.exitMaxUSBusinessDays ??
      ((t.exitHours ?? t.underlyingExitHours ?? 0)/24);
    const minDays=(t.minHoldHours ?? 0)/24;
    const rate=((t.buyBpsOnPurchase ?? 0)+(t.sellBpsOnSale ?? 0)+(t.exitBpsOnNAV ?? 0)+
      (t.directMintBps ?? 0)+(t.directRedeemBps ?? 0)+(instant ? t.approxInstantExitBps : 0))/10000;
    const days=Math.max(inputs.days,minDays)+exitDays;
    const timing=queue ? (variant in queue ? variant : 'extUSD v1')+' minimum queue' :
      t.exitDaysRange ? 'Exit range '+t.exitDaysRange.join('–')+' days' :
      t.estimatedExitDays ? 'Issuer estimate' : t.exitMaxUSBusinessDays ? 'Up to '+t.exitMaxUSBusinessDays+' US business days; scenario assumes weekday request with no intervening weekend or holiday' :
      instant ? 'Approximate instant exit fee' : exitDays ? 'Documented exit delay' :
      t.minHoldHours!=null ? 'Minimum hold '+t.minHoldHours+' hours; later execution unquoted' : 'Settlement duration unverified or unpriced';
    return {days,rate,exitDays,timing};
  }
  function assess(row, intel, ledger, farm, inputs = defaults, profileId, variant) {
    const value=row.implied_value_usd;
    const profile=farm.profiles?.find(p=>p.id===profileId) ?? farm.profiles?.[0] ?? farm.route;
    const terms=resolveRoute(profile,inputs,variant);
    const rate=terms.rate;
    function scenario(v, overrides={}) {
      const edited={...inputs,...overrides};
      if (!Number.isFinite(edited.days) || edited.days<0) return null;
      return economics(v,{...edited,days:resolveRoute(profile,edited,variant).days},rate);
    }
    const base=scenario(value);
    const variations = [
      ['Low peer value',intel.uncertainty.global?.[0],{}],
      ['Median growth',intel.stress.reference?.value,{}],
      ['Lowest model',intel.span.low[1],{}],
      ['5× capital',value,{capital:inputs.capital*5}],
      ['Half wallet share',value,{ppm:inputs.ppm/2}],
      ['No qualification',value,{success:0}],
      ['Double fee budget',value,{fees:inputs.fees*2}],
      ['Combined downside',intel.uncertainty.global?.[0],{fees:inputs.fees*2,ppm:inputs.ppm/2,days:inputs.days*2}]
    ];
    const sensitivity = variations.map(([label,v,overrides]) => ({
      label, net:scenario(v,overrides)?.net ?? null
    }));
    const downside = sensitivity.at(-1).net;
    let verdict, tier, next;
    if (ledger.status !== 'Pre-token candidate' || row.slug === 'bitfi-basis') {
      tier=5; verdict='Resolve token identity'; next=checks[row.slug] || ledger.evidence.at(-1);
    } else if (profile?.terms?.newEntry==='deprecated') {
      tier=4; verdict='Hold new deposits'; next=profile.entry;
    } else if (profile?.terms?.minimumRedemptionUnits) {
      tier=4; verdict='Verify redemption size'; next=profile.exit;
    } else if (profile?.terms?.newEntry==='closed' || profile?.id==='yuzu-money/primary' || (profile?.minimum?.asset==='USDC' && inputs.capital<profile.minimum.amount)) {
      tier=4; verdict='Verify access or risk'; next=profile.terms?.newEntry==='closed' ? 'Closed to new Origin entries. Exit scenarios apply to existing holders.' : profile.entry;
    } else if (checks[row.slug]) {
      tier=4; verdict='Verify access or risk'; next=checks[row.slug];
    } else if (!farm.route) {
      tier=3; verdict=intel.participation?.status==='Conditional route' ? 'Verify exit terms' : 'Verify participation'; next=intel.participation?.finding || 'Find primary evidence for entry, custody and withdrawal.';
    } else {
      tier=base && base.net >= 0 ? 1 : 2;
      verdict=!base ? 'Complete scenario' : base.net < 0 ? 'Below break-even' :
        sensitivity.some(s=>s.net !== null && s.net<0) ? 'Assumption-sensitive' : 'Clears tested costs';
      next=profile.exit;
    }
    return {slug:row.slug, officialRank:row.rank, tier, verdict, next, base, sensitivity, downside,
      feeRate:rate, weak:intel.uncertainty.weak, modelSpread:intel.span.ratio,
      presence:intel.propensity?.propensity ?? null, route:!!farm.route,
      profileId:profile?.id ?? null,terms,risk:profile?.risks ?? null, qualification:'Unknown'};
  }
  function rankDecisions(rows) {
    return rows.slice().sort((a,b)=>a.tier-b.tier || Number(a.weak)-Number(b.weak) ||
      (b.downside ?? -Infinity)-(a.downside ?? -Infinity) || a.modelSpread-b.modelSpread ||
      (b.presence ?? -1)-(a.presence ?? -1) || a.officialRank-b.officialRank)
      .map((r,i)=>({...r,opportunityRank:i+1}));
  }
  const api = {defaults,economics,resolveRoute,assess,rankDecisions};
  if (typeof module === 'object') module.exports=api;
  else window.RadarDecision=api;
})();

