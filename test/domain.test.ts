import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { median, quantile } from '../lib/domain/statistics.ts';
import { isPreToken, isRankable, selectScoredRows } from '../lib/domain/eligibility.ts';
import { calibrate } from '../lib/domain/calibration.ts';
import { adjustLogRatio, ageDays, changePercentiles, estimate, growthFactor, maturityFactor, BASELINE_SHAPES } from '../lib/domain/estimate.ts';
import { effectiveShrinkageK } from '../lib/domain/estimate.ts';
import { backtest, calibrateBacktest, derivedUnknownAge, evaluatedAmplitudes, factorChangeReport, factorNormalizers, fitFactorAmplitudes, globalSizeAdjustment, gradeForBandRatio, measurementReport, summarizeBacktest } from '../lib/domain/backtest.ts';
import { farmTotals } from '../lib/domain/farmplan.ts';
import { boardIssue } from '../lib/domain/board.ts';
import { buildBoard } from '../lib/domain/board.ts';
import { rankRanges } from '../lib/domain/uncertainty.ts';
import { buildRadar } from '../lib/app/buildBoard.ts';
import { MODEL, type BoardRow, type Snapshot, type SnapshotProtocol } from '../lib/domain/types.ts';
import { parseSnapshot, SnapshotError } from '../lib/infra/snapshot.ts';

const protocol = (overrides: Partial<SnapshotProtocol> = {}): SnapshotProtocol => ({
  slug: 'alpha', name: 'Alpha', category: 'Lending', chains: ['Ethereum'], tvl_usd: 100,
  change_7d: null, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null, ...overrides
});
const snapshot = (protocols: SnapshotProtocol[], floor_usd = 10): Snapshot => ({
  as_of: '2025-01-01', source: 'fixture', floor_usd, protocols, watchlist: []
});

test('snapshot parser rejects duplicate slugs, negative TVL, and impossible calendar dates', () => {
  const raw = (protocols: unknown[], as_of = '2025-01-01') => JSON.stringify({ as_of, source: 'fixture', floor_usd: 10, protocols, watchlist: [] });
  const p = (overrides: Record<string, unknown> = {}) => ({ slug: 'alpha', name: 'Alpha', tvl_usd: 1, ...overrides });
  assert.throws(() => parseSnapshot(raw([p(), p()])), SnapshotError);
  assert.throws(() => parseSnapshot(raw([p({ tvl_usd: -1 })])), SnapshotError);
  assert.throws(() => parseSnapshot(raw([], '2025-02-29')), SnapshotError);
  assert.throws(() => parseSnapshot(raw([p({ listed_at: '2025-04-31' })])), SnapshotError);
  assert.equal(parseSnapshot(raw([p({ listed_at: '2024-02-29' })], '2024-02-29')).as_of, '2024-02-29');
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

test('zero TVL pre-token rows are not rankable or scored', () => {
  const zero = protocol({ slug: 'zero', tvl_usd: 0 });
  assert.equal(isRankable(zero), false);
  assert.equal(buildBoard(snapshot([zero]), MODEL).length, 0);
});

test('forced selection shrink re-sorts ranks before rank intervals and board validation', () => {
  const peers = Array.from({ length: 12 }, (_, i) => protocol({ slug: `live-${i}`, mcap_usd: 100 * Math.exp(i / 2), tvl_usd: 100, category: 'Lending' }));
  const candidates = Array.from({ length: 100 }, (_, i) => protocol({ slug: `candidate-${i}`, tvl_usd: 10000 - i * 50, category: 'Lending' }));
  const snap = snapshot([...peers, ...candidates]);
  const result = buildRadar(snap, { forceShrinkAdopted: true });
  assert.equal(result.rejection, null);
  for (let i = 0; i < result.board.length; i++) {
    assert.equal(result.board[i]!.rank, i + 1);
    if (i) assert.ok(result.board[i - 1]!.implied_value_usd >= result.board[i]!.implied_value_usd);
  }
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

test('rank resampling applies the fitted size adjustment to high-TVL rows', () => {
  const row = (slug: string, tvl_usd: number, rank: number) => ({
    slug, tvl_usd, rank, rank_low: rank, rank_high: rank, category: 'Lending',
    model: { growth_multiplier: 1, maturity_multiplier: 1 }
  } as BoardRow);
  const lowTvl = row('low-tvl', 100, 1);
  const highTvl = row('high-tvl', 1000, 2);
  const samples = [0, 0, 0, 0];
  const calibration = {
    global: { count: 4, q25: 0, median: 0, q75: 0 },
    categories: new Map([['Lending', { count: 4, q25: 0, median: 0, q75: 0 }]]),
    samples: new Map([['global', samples], ['Lending', samples]])
  } as ReturnType<typeof calibrate>;
  rankRanges([lowTvl, highTvl], calibration, { sizeAdjustment: { slope: -1.5, center: Math.log(100) } });
  assert.deepEqual([lowTvl.rank_low, lowTvl.rank_high], [1, 1]);
  assert.deepEqual([highTvl.rank_low, highTvl.rank_high], [2, 2]);
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

test('amplitude fit is finite when the size adjustment carries only mode and slope', () => {
  const peers = [100, 200, 400, 800, 1600, 3200].map((tvl, i) => protocol({ slug: `live-${i}`, category: i % 2 ? 'DEX' : 'Lending', tvl_usd: tvl, mcap_usd: tvl * (1 + i), change_7d: i * 3 - 7, listed_at: `202${i}-01-01` }));
  const fit = fitFactorAmplitudes(snapshot(peers), { mode: 'global', slope: -.5 });
  assert.ok(Number.isFinite(fit.growth) && Number.isFinite(fit.maturity));
});

const followUpFixture = (): Snapshot => {
  const live = Array.from({ length: 14 }, (_, i) => protocol({ slug: `live-${i}`, name: `Live ${i}`, category: ['DEX', 'Lending', 'Yield'][i % 3]!, tvl_usd: 100 * (i + 2) ** 2, mcap_usd: 100 * (i + 2) ** 2 * (.3 + ((i * 7) % 5) * .4), change_7d: ((i * 5) % 11) - 3, listed_at: i % 4 === 3 ? null : `20${String(15 + (i % 9)).padStart(2, '0')}-0${1 + (i % 9)}-15` }));
  const early = Array.from({ length: 6 }, (_, i) => protocol({ slug: `early-${i}`, name: `Early ${i}`, category: ['DEX', 'Lending', 'Yield'][i % 3]!, tvl_usd: 500 + 90 * i, change_7d: i % 2 ? 4 * i : null, listed_at: i % 3 ? `2023-0${1 + i}-01` : null }));
  return { ...snapshot([...live, ...early]), watchlist: ['early-5', 'live-2'] };
};

test('factor report returns the amplitudes of the procedure its decision evaluated', () => {
  const snap = followUpFixture();
  const adjustment = { mode: 'global' as const, slope: -.2 };
  assert.notEqual(derivedUnknownAge(snap), MODEL.unknown_listed_age_days);
  const report = factorChangeReport(snap, adjustment);
  const viaDecisionPath = evaluatedAmplitudes(snap, adjustment, { fitAmplitudes: true, derivedUnknownAge: report.adopted_amplitudes && report.adopted_unknown_age });
  assert.deepEqual(report.amplitudes, viaDecisionPath);
  assert.equal(report.amplitudes.unknownAge, report.adopted_amplitudes && report.adopted_unknown_age ? derivedUnknownAge(snap) : MODEL.unknown_listed_age_days);
  assert.ok(Number.isFinite(report.amplitudes.growth) && Number.isFinite(report.amplitudes.maturity));
  // The same helper yields each fold's amplitudes: a fold is the procedure applied to the snapshot minus one peer.
  const fold = { ...snap, protocols: snap.protocols.filter(p => p.slug !== 'live-0') };
  assert.deepEqual(evaluatedAmplitudes(fold, adjustment, { fitAmplitudes: true }), fitFactorAmplitudes(fold, adjustment, MODEL.unknown_listed_age_days));
  assert.deepEqual(evaluatedAmplitudes(fold, adjustment, {}), { growth: 1, maturity: 1, unknownAge: MODEL.unknown_listed_age_days });
});

test('factor normalizers centre growth on the snapshot median change; G2 is unaffected', () => {
  const snap = followUpFixture();
  const medianChange = calibrate(snap).medianChange;
  assert.notEqual(medianChange, 0);
  const scored = selectScoredRows(snap, MODEL);
  const g1 = factorNormalizers(snap, { growth: 'G1', maturity: 'M1' }, MODEL, medianChange);
  assert.equal(g1.growth, median(scored.map(p => growthFactor('G1', p.change_7d, medianChange, MODEL))));
  assert.notEqual(g1.growth, factorNormalizers(snap, { growth: 'G1', maturity: 'M1' }, MODEL, 0).growth);
  assert.deepEqual(factorNormalizers(snap, BASELINE_SHAPES, MODEL, medianChange), factorNormalizers(snap, BASELINE_SHAPES, MODEL, 0));
});

test('board and backtest normalizers score the same selected rows', () => {
  const base = followUpFixture();
  const tied = [protocol({ slug: 'Zeta', name: 'Zeta', tvl_usd: 700 }), protocol({ slug: 'alpha-tie', name: 'Alpha tie', tvl_usd: 700 }), protocol({ slug: 'zero', name: 'Zero', tvl_usd: 0 })];
  const snap = { ...base, protocols: [...base.protocols, ...tied], watchlist: [...base.watchlist, 'zero', 'missing'] };
  const model = { ...MODEL, early_rows: 4, board_max_rows: 5 };
  const selected = selectScoredRows(snap, model).map(p => p.slug);
  assert.deepEqual(selected, ['early-5', 'live-2', 'early-4', 'early-3', 'Zeta']);
  assert.deepEqual(buildBoard(snap, model).map(row => row.slug).sort(), [...selected].sort());
});

test('adopted factor amplitudes reach the production board, and only when adopted', () => {
  const snap = followUpFixture();
  const sizeAdjustment = globalSizeAdjustment(snap);
  const amplitudes = { growth: 2, maturity: 3, unknownAge: MODEL.unknown_listed_age_days };
  const decision = (adopted_amplitudes: boolean) => ({ adopted_amplitudes, adopted_unknown_age: false, amplitudes, unknownAge: derivedUnknownAge(snap) });
  const adopted = buildRadar(snap, { forceShrinkAdopted: false, factorReport: decision(true) });
  assert.deepEqual(adopted.radar.fitted_factor_amplitudes, { growth: 2, maturity: 3 });

  // The board buildRadar returns is the one buildBoard gives for the recorded calibration at the adopted amplitudes, not at (1,1).
  const direct = (radar: typeof adopted.radar, withAmplitudes?: { growth: number; maturity: number }) => buildBoard(snap, MODEL, calibrate(snap, sizeAdjustment), {
    biasFactor: radar.bias_correction_factor, bandMultipliers: radar.band_width_multipliers, residualQuantiles: radar.residual_quantiles, sizeAdjustment,
    unknownAge: MODEL.unknown_listed_age_days, ...(withAmplitudes ? { amplitudes: withAmplitudes } : {})
  });
  const values = (rows: BoardRow[]) => rows.map(r => [r.slug, r.implied_value_usd, r.value_low_usd, r.value_high_usd, r.model.growth_multiplier, r.model.maturity_multiplier]);
  assert.deepEqual(values(adopted.board), values(direct(adopted.radar, { growth: 2, maturity: 3 })));
  assert.notDeepEqual(values(adopted.board), values(direct(adopted.radar)));

  // Normalization and bias cancel in a ratio of two rows, so the log spread of each factor scales by its amplitude.
  const unit = direct(adopted.radar);
  const bySlug = (rows: BoardRow[]) => new Map(rows.map(r => [r.slug, r.model]));
  const a = bySlug(adopted.board), u = bySlug(unit);
  const slugs = [...u.keys()].sort();
  const spread = (m: typeof a, key: 'growth_multiplier' | 'maturity_multiplier') => Math.log(Math.max(...slugs.map(s => m.get(s)![key])) / Math.min(...slugs.map(s => m.get(s)![key])));
  assert.ok(spread(u, 'growth_multiplier') > .05 && spread(u, 'maturity_multiplier') > .05);
  assert.ok(Math.abs(spread(a, 'growth_multiplier') - 2 * spread(u, 'growth_multiplier')) < 1e-3);
  assert.ok(Math.abs(spread(a, 'maturity_multiplier') - 3 * spread(u, 'maturity_multiplier')) < 1e-3);

  // A report that does not adopt amplitudes leaves the board at (1,1) whatever amplitudes it carries.
  const rejected = buildRadar(snap, { forceShrinkAdopted: false, factorReport: decision(false) });
  assert.equal(rejected.radar.fitted_factor_amplitudes, undefined);
  assert.deepEqual(values(rejected.board), values(direct(rejected.radar)));
});

test('measurement report gives the within-category ratio slope without a second subtraction', () => {
  // Within each category log(mcap) = c + 0.6 * log(tvl) exactly, so the log-ratio slope is 0.6 - 1 = -0.4;
  // the category intercepts differ widely, so the pooled (global) slope is not -0.4.
  const rows = [['DEX', 5], ['Lending', .02], ['Yield', 300]].flatMap(([category, k], c) => Array.from({ length: 6 }, (_, i) => {
    const tvl_usd = 1000 * 2 ** i * (c + 1);
    return protocol({ slug: `${category}-${i}`, name: `${category} ${i}`, category: category as string, tvl_usd, mcap_usd: (k as number) * tvl_usd ** .6 });
  }));
  const report = measurementReport(snapshot(rows));
  assert.ok(Math.abs(report.within_category_ratio_slope - -.4) < 1e-9);
  assert.ok(Math.abs(report.global_ratio_slope - -.4) > .01);
});

test('selection shrink keeps low <= implied <= high on every shrunk row, including at the $1 floor', () => {
  const peers = Array.from({ length: 12 }, (_, i) => protocol({ slug: `live-${i}`, mcap_usd: 100 * Math.exp(i / 2), tvl_usd: 100, category: 'Lending' }));
  for (const scale of [10000, 3, .02]) {
    const candidates = Array.from({ length: 100 }, (_, i) => protocol({ slug: `candidate-${i}`, tvl_usd: scale * (200 - i), category: 'Lending', change_7d: (i % 7) - 3 }));
    const snap = snapshot([...peers, ...candidates], 0);
    const plain = buildRadar(snap, { forceShrinkAdopted: false });
    const shrunk = buildRadar(snap, { forceShrinkAdopted: true });
    assert.equal(shrunk.rejection, null);
    const before = new Map(plain.board.map(r => [r.slug, r]));
    const changed = shrunk.board.filter(r => r.implied_value_usd !== before.get(r.slug)!.implied_value_usd || r.value_high_usd !== before.get(r.slug)!.value_high_usd);
    if (scale >= 3) assert.ok(changed.length > 0 && changed.length <= 10);
    for (const row of shrunk.board) {
      assert.ok(row.value_low_usd >= 1);
      assert.ok(row.value_low_usd <= row.implied_value_usd && row.implied_value_usd <= row.value_high_usd, `${row.slug}: ${row.value_low_usd} / ${row.implied_value_usd} / ${row.value_high_usd}`);
    }
  }
});

// Values scaled up so the integer rounding of implied values is negligible next to the effects under test.
const scaledFollowUpFixture = (): Snapshot => {
  const snap = followUpFixture();
  return { ...snap, protocols: snap.protocols.map(p => ({ ...p, tvl_usd: p.tvl_usd * 1e6, mcap_usd: p.mcap_usd === null ? null : p.mcap_usd * 1e6 })) };
};

test('backtest factorWeight scales each row’s factor log-deviations; the default is weight 1', () => {
  const snap = scaledFollowUpFixture();
  const base = backtest(snap);
  assert.deepEqual(backtest(snap, { factorWeight: 1 }), base);
  const half = backtest(snap, { factorWeight: .5 });
  const none = backtest(snap, { factorWeight: 0 });
  // logError is linear in the weight: the half-weight arm sits midway between weight 0 and weight 1.
  base.forEach((row, i) => {
    assert.ok(Math.abs(half[i]!.logError - (row.logError + none[i]!.logError) / 2) < 1e-12);
    assert.ok(Math.abs(Math.log(half[i]!.predictedValue) - (Math.log(row.predictedValue) + Math.log(none[i]!.predictedValue)) / 2) < 1e-12);
  });
  // Weight 0 removes the row's own factor deviation ln(g/gMedian) + ln(m/mMedian) entirely: what is left is the
  // factor-free prediction, with the fold's normalizers and the row's own multipliers both gone.
  none.forEach(row => {
    const peer = snap.protocols.find(p => p.slug === row.slug)!;
    const fold = { ...snap, protocols: snap.protocols.filter(p => p.slug !== row.slug) };
    const cal = calibrate(fold);
    const flat = estimate(peer, snap.as_of, (peer.category ? cal.categories.get(peer.category) : undefined) ?? { count: 0, q25: 0, median: 0, q75: 0 }, cal.global, MODEL, cal.medianChange, { factorShapes: { growth: 'G3', maturity: 'M2' }, categorySamples: peer.category ? cal.samples.get(peer.category) : undefined, globalSamples: cal.samples.get('global') });
    assert.ok(Math.abs(row.logError - Math.log(flat.implied / peer.mcap_usd!)) < 1e-6, `${row.slug}: ${row.logError} vs ${Math.log(flat.implied / peer.mcap_usd!)}`);
  });
  // The weight moves rows by different amounts, so no single bias factor can undo it.
  const shifts = base.map((row, i) => half[i]!.logError - row.logError);
  assert.ok(Math.max(...shifts) - Math.min(...shifts) > 1e-3);
});

test('factorWeight survives the median bias correction: the bias-corrected arm changes at weight .5', () => {
  const snap = scaledFollowUpFixture();
  const adjustment = { mode: 'global' as const, slope: globalSizeAdjustment(snap).slope };
  const full = calibrateBacktest(snap, BASELINE_SHAPES, adjustment);
  assert.deepEqual(calibrateBacktest(snap, BASELINE_SHAPES, adjustment, { factorWeight: 1 }), full);
  const half = calibrateBacktest(snap, BASELINE_SHAPES, adjustment, { factorWeight: .5 });
  // Both arms are recentred on a zero median error, so only a row-specific effect can separate them. Weighting
  // the normalization constant alone (the earlier wiring) cancelled here to within rounding (about 1e-8 on this fixture).
  assert.ok(Math.abs(median(full.observations.map(r => r.logError))) < 1e-6 && Math.abs(median(half.observations.map(r => r.logError))) < 1e-6);
  const moved = full.observations.map((row, i) => half.observations[i]!.logError - row.logError);
  assert.ok(Math.max(...moved.map(Math.abs)) > 1e-2, `largest corrected shift ${Math.max(...moved.map(Math.abs))}`);
  // What separates the corrected arms is exactly half of each row's own factor log-deviation (derived here from the
  // factor functions, not from backtest) plus the one constant the two bias factors differ by.
  const percentiles = changePercentiles(snap.protocols);
  const offsets = full.observations.map((row, i) => {
    const peer = snap.protocols.find(p => p.slug === row.slug)!;
    const fold = { ...snap, protocols: snap.protocols.filter(p => p.slug !== row.slug) };
    const medians = factorNormalizers(fold, BASELINE_SHAPES, MODEL, calibrate(fold).medianChange);
    const deviation = Math.log(growthFactor('G2', peer.change_7d, 0, MODEL, percentiles.get(peer.slug) ?? .5) / medians.growth) + Math.log(maturityFactor('M1', ageDays(snap.as_of, peer.listed_at), MODEL) / medians.maturity);
    return moved[i]! + .5 * deviation;
  });
  assert.ok(Math.max(...offsets) - Math.min(...offsets) < 1e-6, `offset spread ${Math.max(...offsets) - Math.min(...offsets)}`);
  assert.ok(Math.abs(half.summary.all.median_absolute_log_error - full.summary.all.median_absolute_log_error) > 1e-4);
});

test('factor normalizers and the backtest score the rows the model they were given selects', () => {
  const snap = followUpFixture();
  const medianChange = calibrate(snap).medianChange;
  const narrow = { ...MODEL, early_rows: 0 };
  const rows = selectScoredRows(snap, narrow);
  assert.deepEqual(rows.map(p => p.slug), ['early-5', 'live-2']);
  assert.ok(selectScoredRows(snap, MODEL).length > rows.length);
  const percentiles = new Map<string, number>();
  const ranked = snap.protocols.filter(p => p.change_7d !== null).sort((a, b) => a.change_7d! - b.change_7d!);
  for (let i = 0; i < ranked.length;) { let j = i + 1; while (j < ranked.length && ranked[j]!.change_7d === ranked[i]!.change_7d) j++; for (let k = i; k < j; k++) percentiles.set(ranked[k]!.slug, ((i + 1 + j) / 2 - 1) / (ranked.length - 1)); i = j; }
  const custom = factorNormalizers(snap, BASELINE_SHAPES, narrow, medianChange);
  assert.equal(custom.growth, median(rows.map(p => growthFactor('G2', p.change_7d, medianChange, MODEL, percentiles.get(p.slug) ?? .5))));
  assert.notDeepEqual(custom, factorNormalizers(snap, BASELINE_SHAPES, MODEL, medianChange));
  // The default model is unaffected, and a custom-model backtest arm now differs from it only through its normalizers.
  assert.deepEqual(backtest(snap, { model: MODEL }), backtest(snap));
  const arm = backtest(snap, { model: narrow }), base = backtest(snap);
  assert.ok(arm.some((row, i) => Math.abs(row.logError - base[i]!.logError) > 1e-6));
  arm.forEach(row => {
    const fold = { ...snap, protocols: snap.protocols.filter(p => p.slug !== row.slug) };
    const mc = calibrate(fold).medianChange;
    const a = factorNormalizers(fold, BASELINE_SHAPES, narrow, mc), b = factorNormalizers(fold, BASELINE_SHAPES, MODEL, mc);
    const expected = base.find(r => r.slug === row.slug)!.logError + Math.log(b.growth * b.maturity) - Math.log(a.growth * a.maturity);
    assert.ok(Math.abs(row.logError - expected) < 1e-12);
  });
});

test('amplitude fit regresses the residuals of the centre estimate() predicts from', () => {
  // Lending holds one live peer and Yield three, so the production shrinkage blend sits well away from the raw
  // category median (and from the 50/50 single-peer average the fit used before).
  const cats = ['DEX', 'DEX', 'DEX', 'DEX', 'DEX', 'Yield', 'Yield', 'Yield', 'Lending', 'DEX'];
  const peers = cats.map((category, i) => protocol({ slug: `live-${i}`, category, tvl_usd: 1000 * (i + 2) ** 2, mcap_usd: 1000 * (i + 2) ** 2 * (.2 + ((i * 7) % 5) * .9), change_7d: ((i * 5) % 11) - 3, listed_at: `20${15 + i % 9}-0${1 + i % 9}-15` }));
  const snap = snapshot(peers);
  const slope = -.3, unknownAge = MODEL.unknown_listed_age_days;
  const center = median(peers.map(p => Math.log(p.tvl_usd)));
  const cal = calibrate(snap, { slope, center });
  const fit = fitFactorAmplitudes(snap, { mode: 'global', slope }, unknownAge);
  const regress = (centreOf: (p: SnapshotProtocol) => number) => {
    const rows = peers.map(p => estimate(p, snap.as_of, cal.categories.get(p.category!)!, cal.global, MODEL, cal.medianChange, { changePercentile: undefined, categorySamples: cal.samples.get(p.category!), globalSamples: cal.samples.get('global'), sizeAdjustment: { slope, center }, unknownAge }));
    const residuals = peers.map(p => Math.log(p.mcap_usd! / p.tvl_usd) - centreOf(p));
    const ranked = [...peers].sort((a, b) => a.change_7d! - b.change_7d!);
    const pct = new Map<string, number>();
    for (let i = 0; i < ranked.length;) { let j = i + 1; while (j < ranked.length && ranked[j]!.change_7d === ranked[i]!.change_7d) j++; for (let k = i; k < j; k++) pct.set(ranked[k]!.slug, ((i + 1 + j) / 2 - 1) / (ranked.length - 1)); i = j; }
    const gx = peers.map(p => Math.log(growthFactor('G2', p.change_7d, 0, MODEL, pct.get(p.slug)))), mx = rows.map(r => Math.log(r.maturityMult));
    const slopeOf = (xs: number[]) => { const c = median(xs), z = xs.map(v => v - c); return z.reduce((s, v, i) => s + v * residuals[i]!, 0) / z.reduce((s, v) => s + v * v, 0); };
    return { growth: slopeOf(gx), maturity: slopeOf(mx) };
  };
  const productionCentre = (p: SnapshotProtocol) => estimate(p, snap.as_of, cal.categories.get(p.category!)!, cal.global, MODEL, cal.medianChange, { categorySamples: cal.samples.get(p.category!), globalSamples: cal.samples.get('global'), sizeAdjustment: { slope, center } }).centre;
  const unshrunkCentre = (p: SnapshotProtocol) => { const set = cal.categories.get(p.category!)!; return (set.count === 1 ? (set.median + cal.global.median) / 2 : set.median) + slope * (Math.log(p.tvl_usd) - center); };
  const expected = regress(productionCentre), previous = regress(unshrunkCentre);
  assert.ok(Math.abs(fit.growth - expected.growth) < 1e-9 && Math.abs(fit.maturity - expected.maturity) < 1e-9, `${JSON.stringify(fit)} vs ${JSON.stringify(expected)}`);
  assert.ok(Math.abs(fit.growth - previous.growth) > 1e-3 || Math.abs(fit.maturity - previous.maturity) > 1e-3);
});

test('radar always carries the unknown listed age in use, adopted or not', () => {
  const snap = followUpFixture();
  const derived = derivedUnknownAge(snap);
  assert.notEqual(derived, MODEL.unknown_listed_age_days);
  const decision = (adopted_unknown_age: boolean) => ({ adopted_amplitudes: false, adopted_unknown_age, amplitudes: { growth: 1, maturity: 1, unknownAge: MODEL.unknown_listed_age_days }, unknownAge: derived });
  const rejected = buildRadar(snap, { forceShrinkAdopted: false, factorReport: decision(false) }).radar;
  assert.equal(rejected.derived_unknown_listed_age_days, MODEL.unknown_listed_age_days);
  assert.equal(rejected.model.unknown_listed_age_days, MODEL.unknown_listed_age_days);
  const adopted = buildRadar(snap, { forceShrinkAdopted: false, factorReport: decision(true) }).radar;
  assert.equal(adopted.derived_unknown_listed_age_days, derived);
  assert.equal(adopted.model.unknown_listed_age_days, derived);
});

test('factor_normalization describes the unknown age and amplitudes actually in use, adopted or not', () => {
  const snap = followUpFixture();
  const derived = derivedUnknownAge(snap);
  assert.notEqual(derived, MODEL.unknown_listed_age_days);
  const text = (adopted_amplitudes: boolean, adopted_unknown_age: boolean) => buildRadar(snap, { forceShrinkAdopted: false, factorReport: { adopted_amplitudes, adopted_unknown_age, amplitudes: { growth: 2, maturity: 3, unknownAge: MODEL.unknown_listed_age_days }, unknownAge: derived } }).radar.model.factor_normalization;
  const formulas = 'growth: 1 + 0.35 * (2 * percentile - 1); maturity: 0.75 + 0.5 * ln(1 + age_days) / ln(1 + 1460); ';
  // Adopted: the historical wording, byte for byte (the sealed snapshot takes this branch).
  assert.equal(text(false, true), `${formulas}factors are median-normalized across scored rows; unknown listed_at age is snapshot-derived (${derived} days)`);
  // Not adopted: the age in use is the model default and the string must not claim a derivation.
  const rejected = text(false, false);
  assert.equal(rejected, `${formulas}factors are median-normalized across scored rows; unknown listed_at age is the model default (${MODEL.unknown_listed_age_days} days)`);
  assert.ok(!rejected.includes('snapshot-derived'));
  // Adopted amplitudes are named; unadopted ones leave no trace.
  assert.equal(text(true, false), `${formulas}each factor is raised to its fitted amplitude before normalization (growth ^ 2, maturity ^ 3); factors are median-normalized across scored rows; unknown listed_at age is the model default (${MODEL.unknown_listed_age_days} days)`);
  assert.ok(!rejected.includes('amplitude'));
});

test('dashboard method text names the unknown-age source truthfully, adopted or not', () => {
  const source = readFileSync(new URL('../dashboard/components.js', import.meta.url), 'utf8');
  // The dashboard's copy of the model default must track MODEL, or the wording branch silently goes wrong.
  assert.equal(Number(/MODEL_DEFAULT_UNKNOWN_AGE_DAYS = (\d+);/.exec(source)![1]), MODEL.unknown_listed_age_days);
  type StubNode = { className?: string; textContent?: string; children: StubNode[] };
  const node = (): StubNode & Record<string, unknown> => ({ children: [], dataset: {}, style: {}, append(...c: StubNode[]) { this.children.push(...c); }, appendChild(c: StubNode) { this.children.push(c); return c; }, setAttribute() {} });
  const window: { RadarComponents?: { method(d: unknown): StubNode } } = {};
  runInNewContext(source, { window, document: { createElement: node } });
  const find = (n: StubNode): StubNode | undefined => n.className === 'method-copy' ? n : n.children.map(find).find(Boolean);
  const snap = followUpFixture();
  const derived = derivedUnknownAge(snap);
  assert.notEqual(derived, MODEL.unknown_listed_age_days);
  const copy = (adopted_unknown_age: boolean) => find(window.RadarComponents!.method(buildRadar(snap, { forceShrinkAdopted: false, factorReport: { adopted_amplitudes: false, adopted_unknown_age, amplitudes: { growth: 1, maturity: 1, unknownAge: MODEL.unknown_listed_age_days }, unknownAge: derived } }).radar))!.textContent!;
  assert.ok(copy(true).includes(`Missing listed_at ages use the snapshot median known age (${derived} days).`));
  const rejected = copy(false);
  assert.ok(rejected.includes(`Missing listed_at ages use the model default age (${MODEL.unknown_listed_age_days} days).`));
  assert.ok(!rejected.includes('median known age'));
  assert.ok(!rejected.includes('fitted amplitude'));
  const fitted = find(window.RadarComponents!.method(buildRadar(snap, { forceShrinkAdopted: false, factorReport: { adopted_amplitudes: true, adopted_unknown_age: false, amplitudes: { growth: 2, maturity: 3, unknownAge: MODEL.unknown_listed_age_days }, unknownAge: derived } }).radar))!.textContent!;
  assert.ok(fitted.includes('Before normalization each factor is raised to its fitted amplitude (growth 2, maturity 3). Missing listed_at ages use the model default age'));
  // The leave-one-out peer count is read from the data, not hardcoded for the sealed snapshot.
  const radar = buildRadar(snap, { forceShrinkAdopted: false, factorReport: { adopted_amplitudes: false, adopted_unknown_age: false, amplitudes: { growth: 1, maturity: 1, unknownAge: MODEL.unknown_listed_age_days }, unknownAge: derived } }).radar;
  assert.equal(radar.calibration_backtest.peers_evaluated, 14);
  assert.ok(find(window.RadarComponents!.method(radar))!.textContent!.includes('The 14 leave-one-out estimates have a Spearman rank correlation'));
  // A grade with no backtest estimates prints its count alone; measured grades keep their full sentence.
  const measured = { count: 4, coverage: 0.5, band_coverage: 0.5, median_log_error: 0, median_absolute_log_error: Math.log(2) };
  const empty = { count: 0, coverage: null, band_coverage: null, median_log_error: null, median_absolute_log_error: null };
  const graded = find(window.RadarComponents!.method({ ...radar, grade_backtest: { A: empty, B: measured, C: empty } }))!.textContent!;
  assert.ok(graded.includes('In leave-one-out backtesting, A carried 0 estimates; B carried 4 with 50.0% coverage and 2.0× error; C carried 0. Each rank'));
  const full = find(window.RadarComponents!.method({ ...radar, grade_backtest: { A: measured, B: measured, C: measured } }))!.textContent!;
  assert.ok(full.includes('A carried 4 estimates with 50.0% coverage and 2.0× median absolute log error; B carried 4 with 50.0% coverage and 2.0× error; C carried 4 with 50.0% coverage and 2.0× error. Each rank'));
  assert.ok(!source.includes('The 128 leave-one-out'));
  assert.ok(!source.includes('calibration set’s quartiles'));
});
