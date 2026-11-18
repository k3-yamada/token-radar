# Constants audit (radar-12)

Scope: values in the scoring path and dashboard that can alter a value, rank, displayed band/grade, plan, selection, or dashboard shortlist. Line numbers refer to this checkout. Numeric loop counters, date arithmetic units, rounding precision, validation-only limits, and dossier packaging limits are listed where they affect the submitted entry but do not affect model estimates. “Snapshot fixed” includes lists and fields supplied by the competition input. Factor amplitude contest on 128 live peers: fixed amplitudes scored MAE 1.2374; fitted amplitudes scored 1.3328 (split MAEs 1.3470 and 1.3199), so fitting was rejected. The derived unknown-age variant scored 1.2374 and was adopted; its fold-wise test uses each fold’s known-age median.

## (a) Derived at build time from the snapshot — 6 entries

| Name / description | Current value | File and line | Origin and effect |
|---|---|---|---|
| Global size slope and center | fitted least-squares log(mcap/TVL) slope; center is median log TVL of eligible live rows | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:362), used by [buildBoard.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/app/buildBoard.ts:10) | (a) Refit from each snapshot; changes calibrated ratios and all values. Fit set: live rows with positive cap and TVL, excluding the derivative list. |
| Calibration ratios and quartiles | per-category and global medians/q25/q75; global logs winsorized at p=.01 and p=.99 | [calibration.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/calibration.ts:11) | (a) All statistics are computed from the snapshot. Percentiles are fixed procedures, not snapshot values (see class d). |
| Growth percentile and median change | per-protocol midrank percentile; median of reported change_7d values | [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:34), [calibration.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/calibration.ts:82) | (a) Recomputed when membership or reported changes move. |
| Calibration correction and band widths | correction is exp(−median leave-one-out log error); widths selected on held-out errors | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:329) | (a) Refit on snapshot leave-one-out results. |
| Factor normalization and selection shrink decision | growth/maturity medians across scored rows; top-10 bias and adoption boolean | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:133), [buildBoard.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/app/buildBoard.ts:14) | (a) Snapshot-dependent; affects multipliers and potentially top-10 values. |
| Derived unknown listed age | median known `listed_at` age (currently 677 days) | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:119), [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:29) | (a) Derived from known snapshot ages; adopted after the unknown-age contest with no more than 1% MAE change. Recomputed inside each leave-one-out fold. |

## (b) Fixed by competition format or snapshot — 5 entries

| Name / description | Current value | File and line | Origin and effect |
|---|---|---|---|
| Snapshot floor and contents | `floor_usd`, `as_of`, protocol records, watchlist, categories and chains come from input; no numeric default | [snapshot.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/infra/snapshot.ts:18), [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:1) | (b) Snapshot-fixed inputs drive all scored outputs. |
| Board output contract limits | 100–4000 rows; 3–12 farm steps; each 20–600 chars | [board.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/board.ts:96) | (b) Submission format gate; these limits reject output rather than tune estimates. |
| Farm step shape | seven steps, with activity described over 4 or 8 weeks | [farmplan.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/farmplan.ts:42), [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:37) | (b) Entry schema/content shape. The chosen week span is class (d), below. |
| Input schema validity | positive integer floor; ISO date; finite numeric TVL/cap/change; nulls allowed where schema says | [snapshot.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/infra/snapshot.ts:19) | (b) Input contract. Validation constants only reject malformed snapshots. |
| Vendor dossier contract | schema `makefun/dossier/v1`, max 4 MiB and 8 images, PNG/JPEG signatures; text/dashboard/image caps passed by entry | [makefun-board.ts](/home/hatch/workspace/makefun/token-radar-entry/vendor/makefun-board.ts:45), [main.ts](/home/hatch/workspace/makefun/token-radar-entry/main.ts:10) | (b), kit-fixed: submission packaging, not token estimates. Vendor constants are kept separate from model constants. |

## (c) Fixed by design and contested in a backtest — 3 entries

| Name / description | Current value | File and line | Origin and contest outcome |
|---|---|---|---|
| Growth/maturity shapes | `G2`, `M1`; shape alternatives G1/G3 and M2 exist | [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:22) | (c) Existing shape selection remains fixed; amplitude fitting was separately contested and rejected for this snapshot. |
| Shrinkage base `k` | 6; adaptive clamp 2–24, with higher-k contest arm 12, 4–48 | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:47), [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:10) | (c) Model averaging contest compares V0 and V2; no persisted outcome says which won. |
| Band multiplier selection | Search 0.50–3.00 by .01; target 50% held-out coverage | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:314) | (c) Explicitly fitted per basis on held-out errors; output multipliers are snapshot-derived. Search range/target are fixed. |
| Dispersion-aware shrinkage toggle / single-peer blend | enabled for main model; blend tested as P0/P1 proxy contest | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:402), [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:10) | (c) Contest arms exist; no stored score/outcome in repository. |

## (d) Fixed by design and never contested — 15 entries

| Name / description | Current value | File and line | If data changes materially |
|---|---|---|---|
| Winsorization tails | global p1 and p99 | [calibration.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/calibration.ts:24) | Tail behavior may be too aggressive or too permissive as sample size and outlier frequency change. |
| Band grade thresholds | A: ≥10 peers and ratio ≤10; B: ≥5 and ratio ≤30; otherwise C | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:358) | Peer-count and uncertainty distributions can shift, making grades too generous or too rare. |
| Rank uncertainty resampling | 200 resamples; seed `0x7b7a11`; percentile interval p05–p95 | [uncertainty.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/uncertainty.ts:4), [uncertainty.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/uncertainty.ts:39) | Larger or more heterogeneous samples may need more draws; fixed seed affects reproducibility, not central estimates. |
| Size-slope fitting set definition | live positive-cap/positive-TVL rows, with `DERIVATIVE` categories excluded; within-category alternative requires ≥2 rows | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:362), [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:374) | A category taxonomy or coverage shift can change which populations set the size correction. |
| Global excluded-category list | Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:54) | New or renamed categories can enter global calibration unexpectedly; old categories can remain excluded after their behavior changes. |
| Dispersion clamp bounds | effective k clamped to 2–24; default base 6 | [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:10) | Category/global dispersion ratios outside the current range stop changing shrinkage. |
| Category sparse-support boundary | category count 1 uses global-anchored; count 0 global; otherwise category | [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:58) | Changed category coverage changes which calibration basis many rows use. |
| Minimum implied value | $1 (`Math.max(1, round(...))`) | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:57), [estimate.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/estimate.ts:83) | A radically lower floor or currency convention would make the dollar floor distort small estimates. |
| Maturity assumptions | min `.75`, range `.5`, cap 1460 days; fallback is the adopted snapshot-derived median age (677 days here) | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:51), [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:119) | The fallback is class (a); shape limits remain design constants. |
| Growth tanh scale | 50 percentage points | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:48) | A changed volatility regime compresses or exaggerates growth adjustments. |
| Growth center fallback | zero median change for backtest factor normalization; missing values use observed median in final estimate | [backtest.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/backtest.ts:133), [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:49) | A shifted change distribution changes neutral growth and factor normalization. |
| Board selection sizes | max 200, early 160, live side list 24 | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:59) | Snapshot/watchlist growth can crowd out early rows or truncate the live list. |
| Farm capital tiers | TVL thresholds $100M/$1B/$5B map to $50/$100/$150/$250 | [farmplan.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/farmplan.ts:9) | TVL scale shifts can make suggested capital inappropriate for the represented protocol set. |
| Farm fees and span | fees `$3 + $7 + $4.5 + $4.5/week + $1.5 + $6 + $6.5`; 4 weeks, or 8 if age <365 days | [types.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/types.ts:55), [farmplan.ts](/home/hatch/workspace/makefun/token-radar-entry/lib/domain/farmplan.ts:10) | Gas/fee markets and age mix can make plan totals stale. |
| Dashboard shortlist sizes | shortlist 5; top view 20 | [state.js](/home/hatch/workspace/makefun/token-radar-entry/dashboard/state.js:29) | A changed board size or audience may make these panels too short or too long. |
| Dashboard display scales | 1K/1M/1B formatting and 3 significant digits | [components.js](/home/hatch/workspace/makefun/token-radar-entry/dashboard/components.js:12) | Larger/smaller value ranges may lose useful precision or use unsuitable labels. |

## Sensitivity-pass order

### radar-12c measured sensitivity

Full leave-one-out recalibration on the 128 live peers; bias and per-basis band widths were refit for every arm. Baseline: 50.00% overall coverage, median log error −0.0000, median absolute log error 1.2374. Each row is measured against that baseline; no arm improved median absolute log error by the required 3% (threshold ≤1.2002), so no sensitivity variant was adopted.

| Choice / variant | Coverage | Median log error | Median absolute log error | Sensitivity range (median absolute log error) |
|---|---:|---:|---:|---:|
| Winsor 0/100 | 50.00% | −0.0000 | 1.2374 | **1.2374–1.2374** |
| Winsor 0.5/99.5 | 50.00% | −0.0000 | 1.2374 | |
| Winsor 1/99 (current) | 50.00% | −0.0000 | 1.2374 | |
| Winsor 2.5/97.5 | 50.00% | −0.0000 | 1.2374 | |
| Winsor 5/95 | 50.00% | −0.0000 | 1.2374 | |
| Shrink clamp [1,12], base 6 | 50.00% | −0.0000 | 1.2408 | **1.2374–1.2906** |
| Shrink clamp [2,24], base 6 (current) | 50.00% | −0.0000 | 1.2374 | |
| Shrink clamp [4,48], base 6 | 50.00% | −0.0000 | 1.2906 | |
| Global calibration: current exclusions (baseline) | 50.00% | −0.0000 | 1.2374 | **1.2374–1.2789** |
| Global calibration: no exclusions | 50.00% | −0.0000 | 1.2789 | |
| Slope fit: live peers outside excluded categories (baseline) | 50.00% | −0.0000 | 1.2374 | **1.2374–1.3650** |
| Slope fit: all live peers | 50.00% | −0.0000 | 1.3650 | |

The winsor arms tie at the reported precision on this snapshot. The current exclusions and slope-fitting population have lower error than their alternatives. `tools/sensitivity.mjs` reproduces these arms.

1. **Winsorization percentiles and global/category eligibility.** These directly set calibration ratios; changes in snapshot mix can silently alter the peer population and tails.
2. **Shrinkage base and clamp bounds.** They control how strongly sparse or unusually dispersed categories move toward global evidence.
3. **Growth and maturity constants.** These directly rescale every estimate and depend on volatility and age distributions.
4. **Grade thresholds and band search target/grid.** These shape displayed confidence and uncertainty interpretation as peer counts and residuals move.
5. **Size-fit population definition.** A changed category mix can alter the learned size correction even when the formula is stable.
6. **Farm capital, fee, and duration assumptions; board/live-list sizes; minimum value.** These affect advice or presentation and should be checked when units, fees, protocol scale, or snapshot coverage shift.
7. **Bootstrap count/seed and dashboard panel sizes/formatting.** Mostly reproducibility and presentation; revisit if rank uncertainty or output scale materially changes.

### Count note

The grouped inventory has 30 rows (6 class a, 5 class b, 3 class c, 15 class d). Rows group related literals that implement one rule; the class-d list above is complete at that rule level. `vendor/makefun-board.ts` contains further byte/line/PNG/JPEG protocol literals, separately kit-fixed; they constrain dossier serialization and do not feed radar estimates. `main.ts` packaging caps are likewise kit/submission limits. Dashboard rendering constants are included only where they affect displayed values or shortlist content.
