# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/k3-yamada/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/k3-yamada/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed DefiLlama snapshot (758 protocols, TVL at least $5M, fetched 2026-11-14). It finds the protocols that record no token of their own, excludes wrapped, staked and bridged products of tokenized protocols, exchange balance sheets and versioned duplicates, and ranks what is left by an implied launch value.

The value model (radar-6) is calibrated from the snapshot itself: for each category it takes live-token ratios with positive market cap and TVL, then shrinks sparse categories toward a global set that also omits derivative asset categories. It multiplies a pre-token protocol's TVL by that ratio, then adjusts for demeaned 7-day TVL growth and maturity; both factors are median-normalized over scored rows and do not inflate the overall level. The chain factor was tested and removed. No protocol name is hardcoded and no figure comes from outside the snapshot. The board holds 198 rows and covers all 40 protocols on the competition watchlist.

The dashboard is a static page with no network calls: a sortable, filterable board, a detail view for every protocol that shows its implied value step by step and a farm plan with concrete steps, costs and times, the model explained in plain language, and the live-token calibration set kept separate from the ranking.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node.js 22.18 or later. This writes board.json, data.js, dashboard/, screenshots/ and dossier.json into out/.

---

<sub>Entered on [make.fun](https://make.fun/?ref=azally&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
