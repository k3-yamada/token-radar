# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/k3-yamada/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/k3-yamada/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed DefiLlama snapshot (758 protocols, TVL at least $5M, fetched 2026-11-14). It finds the protocols that record no token of their own, excludes wrapped, staked and bridged products of tokenized protocols, exchange balance sheets and versioned duplicates, and ranks what is left by an implied launch value.

The model calibrates live peers' market-cap/TVL ratios in log space, with category estimates shrunk toward a global set that excludes derivative asset categories. A fitted TVL size adjustment lowers the implied ratio for larger protocols. Growth and maturity factors are median-normalized across scored rows; residual-quantile bands come from leave-one-out errors, and a build-time bias correction recentres those errors. Missing listing ages use the snapshot-derived median known age (677 days). Rank ranges come from resampling the calibration sets with the same model used for point estimates, while holding growth and maturity factors fixed. The implied value is a market value at launch calibrated from live peers' market-cap/TVL ratios; it is not a fully diluted valuation or a prediction of a listing price. The chain factor was tested and removed. No protocol name is hardcoded and no figure comes from outside the snapshot. The board holds 198 rows and covers all 40 protocols on the competition watchlist.

Provenance: the sealed DefiLlama snapshot is the competition input (`as_of` is recorded in the data); kit snapshot `input/snapshot.json` SHA-256: `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`.

The dashboard is a static page with no network calls: a sortable, filterable board, a detail view for every protocol that shows its implied value step by step and a farm plan with concrete steps, costs and times, a validation section with the out-of-sample tests and the ablation below, the model explained in plain language, and the live-token calibration set kept separate from the ranking.

## Validation

Every figure below is computed by the build from the sealed snapshot, for the exact model the board ships, and written to `data.js` (`validation`, `launchContext`, `audit`); the dashboard renders them from there. The metric is the median over peers of |ln(predicted market cap / actual market cap)|; the factor is e to that power. No error is clamped and no peer is dropped.

| Test | Definition | Median abs log error | Factor |
| --- | --- | --- | --- |
| Leave-one-out | All 128 tokenized peers (market cap and TVL above 0). Calibration sets and factor normalizers are refit without the held-out peer; the size slope and the bias correction are the full-sample constants the board ships. | 1.2378 | ×3.45 |
| Strict leave-one-out | The fully refit variant: the size slope is also refit in every fold, and each peer is bias-corrected with the median error of the other peers. | 1.3191 | ×3.74 |
| Walk-forward | The 95 peers with a listing date, split at the median date 2024-02-18. Every fitted quantity comes from the earlier 48; the later 47 are predicted once. The 33 undated peers are in neither half. | 0.9702 | ×2.64 |

The walk-forward error is scored on 47 dated peers, not on all 128, so it is not comparable with the leave-one-out rows as a ranking of procedures.

Band coverage, held out (each peer scored against the residual quantiles of the other peers in its basis group): the nominal-50% band the board shows holds 48.4% of peers (62/128); a nominal-80% band built from the same residuals holds 78.9% (101/128).

Ablation, same leave-one-out metric over the same 128 peers, each variant recalibrated on its own:

| Variant | Median abs log error | Factor | vs full |
| --- | --- | --- | --- |
| Full shipped model | 1.2378 | ×3.45 | |
| Plain log-log OLS, ln(mcap) on ln(TVL) | 1.2234 | ×3.40 | −0.0144 (beats the full model) |
| Without the growth factor | 1.3079 | ×3.70 | +0.0702 |
| Without the maturity factor | 1.2630 | ×3.54 | +0.0252 |
| Without the size adjustment | 1.5130 | ×4.54 | +0.2753 |
| Category medians only | 1.5876 | ×4.89 | +0.3498 |

A plain curve of market cap on TVL does 0.0144 better than the shipped model, which is within noise on 128 peers: the shipped model is not more accurate than that curve. The extra terms are kept for the size effect, which carries the model (removing it costs 0.2753), and for the per-basis bands; growth and maturity help modestly (0.0702 and 0.0252).

Launch context. The dashboard shows, for each row's age band, the share of all 758 protocols of that age that already record a token: under 1 year 32.5% (n=160), 1-2 years 38.3% (n=183), 2-3 years 54.7% (n=139), 3-5 years 79.4% (n=155), 5 years and over 75.0% (n=8), unknown age 78.8% (n=113). This is a cross-sectional share shown as context. It is deliberately not used as a launch probability and enters neither the value nor the rank, because it is right-censored (a protocol with no token today may still launch one) and its cohort cells are small.

Accounting. 758 protocols = 416 with a token record + 342 pre-token. Of the pre-token ones, 198 are ranked and 144 are excluded: 128 in a derivative or exchange category, 11 versioned duplicates and 5 wrapped or staked products. The watchlist is covered 40 of 40.

Farm cost. Each plan is six steps in the order they are done (open the app, check the category's risks, deposit the plan's one amount, repeat the category's activity weekly, governance, exit), and every step states its time and gas. Step executions, hours and cost are the sums of what the steps state: $76.5-$139.5 for the 4-week plans (9 executions, 2.25 hours) and $110.5-$201.5 for the 8-week plans (13 executions, 3.25 hours). The cost assumes gas of $1-$8 per step, 15 minutes per step and time at $30/hour; these are assumptions, not snapshot data.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Node.js 22.18 or later. This writes board.json, data.js, dashboard/, screenshots/ and dossier.json into out/.

---

<sub>Entered on [make.fun](https://make.fun/?ref=azally&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
