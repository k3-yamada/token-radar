import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, quantile } from '../lib/domain/statistics.ts';
import { isPreToken, isRankable } from '../lib/domain/eligibility.ts';
import { calibrate } from '../lib/domain/calibration.ts';
import { adjustLogRatio, estimate, growthFactor, maturityFactor, BASELINE_SHAPES } from '../lib/domain/estimate.ts';
import { effectiveShrinkageK } from '../lib/domain/estimate.ts';
import { backtest, calibrateBacktest, derivedUnknownAge, gradeForBandRatio, summarizeBacktest } from '../lib/domain/backtest.ts';
import { farmTotals } from '../lib/domain/farmplan.ts';
import { boardIssue } from '../lib/domain/board.ts';
import { buildBoard } from '../lib/domain/board.ts';
import { rankRanges } from '../lib/domain/uncertainty.ts';
import { buildRadar } from '../lib/app/buildBoard.ts';
import { MODEL, type BoardRow, type Snapshot, type SnapshotProtocol } from '../lib/domain/types.ts';

const protocol = (overrides: Partial<SnapshotProtocol> = {}): SnapshotProtocol => ({
  slug: 'alpha', name: 'Alpha', category: 'Lending', chains: ['Ethereum'], tvl_usd: 100,
  change_7d: null, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null, ...overrides
});
const snapshot = (protocols: SnapshotProtocol[], floor_usd = 10): Snapshot => ({
  as_of: '2025-01-01', source: 'fixture', floor_usd, protocols, watchlist: []
});

test('adopted G2 growth factor is neutral at the midpoint and monotone by percentile', () => {
  const values = [0, .25, .5, .75, 1].map(p => growthFactor('G2', null, 0, MODEL, p));
  assert.equal(values[2], 1);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
});

test('unknown listed age derives from the median known peer age', () => {
  const snap = snapshot([
    protocol({ slug: 'young', listed_at: '2024-12-22' }),
    protocol({ slug: 'old', listed_at: '2024-10-03' }),
    protocol({ slug: 'missing', listed_at: null })
  ]);
  assert.equal(derivedUnknownAge(snap), 50);
});

test('rejected G3 growth shape remains neutral at one', () => {
  assert.equal(growthFactor('G3', -100, 0, MODEL), 1);
});

test('rejected G1 growth shape is neutral at the market median', () => {
  assert.equal(growthFactor('G1', 12, 12, MODEL), 1);
});

test('rejected M2 maturity shape remains neutral at one', () => {
  assert.equal(maturityFactor('M2', 0, MODEL), 1);
});

test('retained M1 maturity shape has its configured floor at age zero', () => {
  assert.equal(maturityFactor('M1', 0, MODEL), MODEL.maturity_min_factor);
});

test('the backtest defaults to the shipped growth and maturity shapes', () => {
  assert.deepEqual(BASELINE_SHAPES, { growth: 'G2', maturity: 'M1' });
});

test('size adjustment is neutral at median TVL and lowers ratios for larger TVL at a negative slope', () => {
  const slope = -0.6;
  const center = Math.log(100);
  const base = Math.log(2);
  assert.equal(adjustLogRatio(base, center, center, slope), base);
  assert.ok(adjustLogRatio(base, Math.log(400), center, slope) < base);
});

test('statistics use type-7 quantiles and median on hand-checkable arrays', () => {
  assert.equal(median([1, 3, 5]), 3);
  assert.equal(median([1, 3, 5, 7]), 4);
  assert.equal(median([9]), 9);
  assert.equal(quantile([1, 3, 5, 7], .25), 2.5);
  assert.equal(quantile([1, 3, 5, 7], .75), 5.5);
  assert.equal(quantile([9], .25), 9);
  const ps = [0, .1, .25, .5, .75, .9, 1];
  const qs = ps.map(p => quantile([8, 1, 5, 2, 9], p));
  assert.deepEqual(qs, [...qs].sort((a, b) => a - b));
});

test('eligibility excludes wrapped, staked, bridged, and tokenized protocols', () => {
  for (const name of ['Wrapped Alpha', 'Alpha Staked', 'Alpha Staking']) {
    assert.equal(isRankable(protocol({ name })), false);
  }
  assert.equal(isRankable(protocol({ name: 'Alpha Bridge', category: 'Bridge' })), false);
  assert.equal(isRankable(protocol({ mcap_usd: 5 })), false);
  assert.equal(isRankable(protocol({ symbol: 'ALP' })), false);
  assert.equal(isPreToken(protocol()), true);
  // Eligibility consumes the already-filtered snapshot; floor metadata does not alter a row.
  assert.equal(isRankable(protocol({ tvl_usd: 10 })), true);
  assert.equal(isRankable(protocol({ tvl_usd: 9 })), true);
});

test('calibration treats a same-named live protocol as live and excludes invalid rows', () => {
  const live = protocol({ slug: 'alpha-live', name: 'Alpha', mcap_usd: 200, tvl_usd: 100 });
  const missingTvl = protocol({ slug: 'missing-tvl', mcap_usd: 100, tvl_usd: null as unknown as number });
  const zeroCap = protocol({ slug: 'zero-cap', mcap_usd: 0 });
  const negativeCap = protocol({ slug: 'negative-cap', mcap_usd: -1 });
  const cal = calibrate(snapshot([live, missingTvl, zeroCap, negativeCap]));
  assert.equal(isRankable(live), false);
  assert.equal(cal.global.count, 1);
  assert.equal(cal.categories.get('Lending')?.count, 1);
});

test('calibration winsorizes live log ratios to the global type-7 percentile range', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ratio, i) => protocol({
    slug: `peer-${i}`, category: 'DEX', tvl_usd: 100, mcap_usd: 100 * ratio
  }));
  rows.push(protocol({ slug: 'extreme', category: 'Bridge', tvl_usd: 100, mcap_usd: 100 * Math.exp(100) }));
  const cal = calibrate(snapshot(rows));
  const logs = rows.slice(0, 10).map(p => Math.log(p.mcap_usd! / p.tvl_usd));
  const expectedUpper = quantile(logs, .99);
  assert.equal(cal.global.median, median(logs));
  assert.equal(cal.categories.get('Bridge')?.median, expectedUpper);
});

test('rejected P1 keeps a single-peer category global-anchored with current shrinkage', () => {
  const set = { count: 1, q25: 3, median: 3, q75: 3 };
  const global = { count: 10, q25: 0, median: 0, q75: 0 };
  const result = estimate(protocol(), '2025-01-01', set, global, MODEL, 0);
  assert.equal(result.basis, 'global-anchored');
  assert.equal(result.centre, 3 / 7);
});

test('rejected W1 keeps category calibration quantiles unweighted', () => {
  const rows = [1, 2, 9].map((ratio, index) => protocol({
    slug: `uniform-${index}`,
    category: 'DEX',
    tvl_usd: 100,
    mcap_usd: 100 * ratio
  }));
  const calibration = calibrate(snapshot(rows));
  assert.equal(calibration.categories.get('DEX')?.median, Math.log(2));
});

test('a null-mcap protocol carrying a symbol is not board-eligible', () => {
  assert.equal(isRankable(protocol({ mcap_usd: null, symbol: 'ALP' })), false);
});

test('calibration shrinks sparse categories toward global and excludes derivatives globally', () => {
  const rows = [
    protocol({ slug: 'cat-1', category: 'Lending', tvl_usd: 100, mcap_usd: 1000 }),
    protocol({ slug: 'global-1', category: 'DEX', tvl_usd: 100, mcap_usd: 100 }),
    protocol({ slug: 'global-2', category: 'DEX', tvl_usd: 100, mcap_usd: 100 }),
    protocol({ slug: 'bridge', category: 'Bridge', tvl_usd: 100, mcap_usd: 1_000_000 })
  ];
  const cal = calibrate(snapshot(rows));
  const sparse = cal.categories.get('Lending')!;
  assert.equal(cal.global.count, 3);
  const estimated = estimate(protocol({ tvl_usd: 100 }), '2025-01-01', sparse, cal.global, MODEL, 0);
  for (const key of ['q25', 'centre', 'q75'] as const) {
    const a = sparse[key === 'centre' ? 'median' : key];
    const b = cal.global[key === 'centre' ? 'median' : key];
    assert.ok(estimated[key] >= Math.min(a, b) && estimated[key] <= Math.max(a, b));
  }
  assert.ok(cal.global.median < Math.log(1000));
});

test('estimate orders bands, preserves asymmetric quartiles, and centers neutral growth', () => {
  const set = { count: 100, q25: Math.log(2), median: Math.log(3), q75: Math.log(12) };
  const global = { count: 4, q25: set.q25, median: set.median, q75: set.q75 };
  const p = protocol({ tvl_usd: 100, change_7d: 0 });
  const result = estimate(p, '2025-01-01', set, global, MODEL, 0);
  assert.ok(result.low <= result.implied && result.implied <= result.high);
  assert.equal(result.growthMult, 1);
  assert.ok(Math.abs((result.centre - result.q25) - Math.log(1.5)) < 1e-12);
  assert.ok(Math.abs((result.q75 - result.centre) - Math.log(4)) < 1e-12);
  assert.notEqual(result.centre - result.q25, result.q75 - result.centre);
});

test('farm plan fees are the exact sum of step-range midpoints and weeks stay bounded', () => {
  const short = farmTotals(protocol({ tvl_usd: 50 }), 20);
  const long = farmTotals(protocol({ tvl_usd: 50 }), 500);
  assert.deepEqual(short, { capital: 50, fees: 3 + 7 + 4.5 + 4.5 * 8 + 1.5 + 6 + 6.5, weeks: 8 });
  assert.deepEqual(long, { capital: 50, fees: 3 + 7 + 4.5 + 4.5 * 4 + 1.5 + 6 + 6.5, weeks: 4 });
  assert.ok(short.weeks >= 4 && short.weeks <= 8);
  assert.ok(long.weeks >= 4 && long.weeks <= 8);
});

test('boardIssue accepts a valid synthetic board and identifies rank gaps', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    rank: i + 1, slug: `p${i}`, implied_value_usd: 1000 - i,
    value_low_usd: 1, value_high_usd: 1000 - i, farm_steps: ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)]
  } as BoardRow));
  const snap = snapshot([], 10);
  assert.equal(boardIssue(rows, snap), null);
  rows[0]!.symbol = 'P0';
  assert.match(boardIssue(rows, snap) ?? '', /token symbol or Gecko ID/);
  rows[0]!.symbol = null;
  rows[50]!.rank = 52;
  assert.match(boardIssue(rows, snap) ?? '', /rank 51 is 52/);
});

test('rank resampling is deterministic and intervals contain point ranks', () => {
  const peers = [1, 2, 4, 8, 16].map((x, i) => protocol({ slug: `peer-${i}`, mcap_usd: 100 * x, tvl_usd: 100, category: 'Lending' }));
  const candidates = Array.from({ length: 8 }, (_, i) => protocol({ slug: `candidate-${i}`, tvl_usd: 1000 - i * 40, category: 'Lending', change_7d: i - 3 }));
  const snap = snapshot([...peers, ...candidates]);
  const cal = calibrate(snap);
  const first = buildBoard(snap, MODEL, cal);
  const second = buildBoard(snap, MODEL, cal);
  rankRanges(first, cal);
  rankRanges(second, cal);
  assert.deepEqual(first.map(r => [r.slug, r.rank_low, r.rank_high]), second.map(r => [r.slug, r.rank_low, r.rank_high]));
  for (const row of first) assert.ok(row.rank_low <= row.rank && row.rank <= row.rank_high);
});

test('jackknife top-20 overlap is within (0, 1]', () => {
  const peers = [1, 2, 4, 8].map((x, i) => protocol({ slug: `live-${i}`, mcap_usd: 100 * x, tvl_usd: 100, category: 'Lending' }));
  const candidates = Array.from({ length: 100 }, (_, i) => protocol({ slug: `candidate-${i}`, tvl_usd: 10000 - i * 50, category: 'Lending' }));
  const result = buildRadar(snapshot([...peers, ...candidates]));
  assert.ok(result.radar.top20_jackknife_overlap > 0 && result.radar.top20_jackknife_overlap <= 1);
});

test('bias correction moves leave-one-out median log error toward zero', () => {
  const peers = Array.from({ length: 12 }, (_, i) => protocol({ slug: `live-${i}`, category: 'DEX', tvl_usd: 100, mcap_usd: 100 * Math.exp(i / 3 + 1) }));
  const snap = snapshot(peers);
  const before = summarizeBacktest(backtest(snap)).all.median_log_error;
  const correction = Math.exp(-before);
  const after = summarizeBacktest(backtest(snap, { biasFactor: correction })).all.median_log_error;
  assert.ok(Math.abs(after) < Math.abs(before));
});

test('band multiplier search reaches nominal coverage within three points', () => {
  const peers = Array.from({ length: 20 }, (_, i) => protocol({ slug: `live-${i}`, category: 'DEX', tvl_usd: 100, mcap_usd: 100 * Math.exp(Math.sin(i * 2.3) * 2) }));
  const result = calibrateBacktest(snapshot(peers));
  assert.ok(Math.abs(result.summary.all.band_coverage - .5) <= .03);
});

test('residual band log offsets equal multiplier times the basis residual quantiles', () => {
  const p = protocol({ slug: 'candidate-residual', category: 'DEX', tvl_usd: 100 });
  const q = { r25: -1.1817, r75: 1.2835 };
  const multiplier = 1.37;
  const result = estimate(p, '2026-11-18', { count: 0, q25: 0, median: 0, q75: 0 }, { count: 0, q25: 0, median: 0, q75: 0 }, MODEL, 0, { residualQuantiles: q, bandMultiplier: multiplier });
  assert.ok(Math.abs((result.q25 - result.centre) - multiplier * q.r25) < 1e-12);
  assert.ok(Math.abs((result.q75 - result.centre) - multiplier * q.r75) < 1e-12);
});

test('grades require both peer support and a sufficiently narrow calibrated band', () => {
  assert.equal(gradeForBandRatio(4, 10), 'A');
  assert.equal(gradeForBandRatio(10, 10), 'A');
  assert.equal(gradeForBandRatio(8, 4), 'C');
  assert.equal(gradeForBandRatio(20, 4), 'C');
  assert.equal(gradeForBandRatio(20, 5), 'B');
  assert.equal(gradeForBandRatio(31, 20), 'C');
});

test('dispersion-aware effective shrinkage rises with spread and is clamped', () => {
  const global = { count: 10, q25: 0, median: 1, q75: 2 };
  const category = { count: 5, q25: 0, median: 1, q75: 2 };
  assert.equal(effectiveShrinkageK(category, global, [0, 0, 1, 2, 2], [0, 0, 1, 2, 2]), 6);
  assert.equal(effectiveShrinkageK(category, global, [-10, -5, 1, 5, 10], [0, 0, 1, 2, 2]), 24);
  assert.equal(effectiveShrinkageK(category, global, [0, 0, 1, 2, 2], [-10, -8, -4, 1, 2, 3]), 2);
  assert.equal(effectiveShrinkageK({ ...category, count: 3 }, global, [-10, -5, 1, 5, 10], [0, 0, 1, 2, 2]), 6);
});

test('peer token share is weighted by category TVL', () => {
  const peers = [
    protocol({ slug: 'small-live', category: 'DEX', tvl_usd: 100, mcap_usd: 200 }),
    protocol({ slug: 'large-live', category: 'DEX', tvl_usd: 300, mcap_usd: 400 }),
    protocol({ slug: 'pretoken', category: 'DEX', tvl_usd: 600 })
  ];
  const row = buildBoard(snapshot([...peers, protocol({ slug: 'candidate', category: 'DEX', tvl_usd: 200 })]), MODEL).find(x => x.slug === 'candidate')!;
  assert.equal(row.peer_token_share, 1 / 3);
});
