# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/k3-yamada/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/k3-yamada/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed DefiLlama snapshot (758 protocols, TVL at least $5M, fetched 2026-11-14). It finds the protocols that record no token of their own, excludes wrapped, staked and bridged products of tokenized protocols, exchange balance sheets and versioned duplicates, and ranks what is left by an implied launch value.

The model calibrates live peers' market-cap/TVL ratios in log space, with category estimates shrunk toward a global set that excludes derivative asset categories. A fitted TVL size adjustment lowers the implied ratio for larger protocols. Growth and maturity factors are median-normalized across scored rows; residual-quantile bands come from leave-one-out errors, and a build-time bias correction recentres those errors. Missing listing ages use the snapshot-derived median known age (677 days). Rank ranges come from resampling the calibration sets with the same model used for point estimates, while holding growth and maturity factors fixed. The implied value is a market value at launch calibrated from live peers' market-cap/TVL ratios; it is not a fully diluted valuation or a prediction of a listing price. The chain factor was tested and removed. No protocol name is hardcoded and no figure comes from outside the snapshot. The board holds 198 rows and covers all 40 protocols on the competition watchlist.

Provenance: the sealed DefiLlama snapshot is the competition input (`as_of` is recorded in the data); kit snapshot `input/snapshot.json` SHA-256: `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`.

The dashboard is a static page with no network calls: a sortable, filterable board, a detail view for every protocol that shows its implied value step by step and a farm plan with concrete steps, costs and times, the model explained in plain language, and the live-token calibration set kept separate from the ranking.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Node.js 22.18 or later. This writes board.json, data.js, dashboard/, screenshots/ and dossier.json into out/.

---

<sub>Entered on [make.fun](https://make.fun/?ref=azally&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
