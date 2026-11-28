# Token Radar V9

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taylorzy/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taylorzy/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An offline [make.fun Token Radar bounty](https://make.fun/bounty/token-radar-01) entry for researching pre-token DeFi protocols. The November 14 snapshot covers 758 records. The board ranks 183 protocols by implied circulating market capitalization, includes all 40 mandatory watchlist entries and labels existing-token exceptions.

## Run locally

Use Node.js 22.18 or later and the official kit’s byte-exact input. From the repository root in cmd.exe, with the unpacked kit alongside the checkout, run

```bat
node main.ts --input "..\token-radar-01-kit\input\snapshot.json" --output "output"
start "" "output\dashboard\index.html"
```

The build writes the board, protocol ledger, farming economics, dashboard, four captured screenshots and judge dossier. The frozen dossier SHA-256 is `86356fadf73ee9c1f657c2d2d0d11f0d1ab843745b0603c662ef973f582965a0`.

## Valuation and participation

Each protocol brief traces TVL, seven-day growth and tracking age through the fixed 119-peer Huber/ridge fit to a whole-dollar estimate. It shows peer-error ranges, family-held-out comparisons and sensitivity. A missing transformed input uses the fitted median. The reported interval measures historical errors on traded peers. Future issuance, launch price and wallet payouts are unknown.

Search, filter and sort the board, open a protocol and move through the displayed ranking. The allocation shortlist compares named entry and exit routes on shared capital and time assumptions. Users can inspect fees, active labor, the cash alternative and access restrictions. Historical capture scripts and model studies are included in the source history.
