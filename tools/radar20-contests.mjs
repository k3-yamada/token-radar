// radar-20 contests: corrected amplitude contest, per-basis bias contest, jackknife refit check.
// Usage: node --experimental-strip-types tools/radar20-contests.mjs [snapshot.json]   (default: the kit snapshot)
import { createHash } from 'node:crypto';
import { loadSnapshot } from './_snapshot.mjs';
import { backtest, bestBandMultiplier, calibrateBacktest, derivedUnknownAge, fitFactorAmplitudes, globalSizeAdjustment } from '../lib/domain/backtest.ts';
import { calibrate } from '../lib/domain/calibration.ts';
import { buildBoard } from '../lib/domain/board.ts';
import { BASELINE_SHAPES } from '../lib/domain/estimate.ts';
import { median, quantile } from '../lib/domain/statistics.ts';
import { MODEL } from '../lib/domain/types.ts';

const snapshot = loadSnapshot();
const isLive = p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
const live = snapshot.protocols.filter(isLive);
const without = slug => ({ ...snapshot, protocols: snapshot.protocols.filter(p => p.slug !== slug) });
const fullAdjustment = globalSizeAdjustment(snapshot);
const production = { mode: 'global', slope: fullAdjustment.slope };
const basisKey = row => row.basis === 'category' ? 'category' : 'global_anchored';

// ---- Task 2: amplitude contest (production arm settings: fixed full-sample slope, derived unknown age) ----
const arm = fitAmplitudes => calibrateBacktest(snapshot, BASELINE_SHAPES, production, { fitAmplitudes, derivedUnknownAge: true });
const fixed = arm(false), fitted = arm(true);
const unknownAge = derivedUnknownAge(snapshot);
const half = slug => createHash('sha256').update(slug).digest()[0] & 1;
const halfFit = h => {
  const part = { ...snapshot, protocols: snapshot.protocols.filter(p => !isLive(p) || half(p.slug) === h) };
  const fit = fitFactorAmplitudes(part, production, unknownAge);
  return { peers: part.protocols.filter(isLive).length, growth: fit.growth, maturity: fit.maturity };
};
const foldFits = live.map(p => fitFactorAmplitudes(without(p.slug), production, derivedUnknownAge(without(p.slug))));
const range = xs => ({ min: Math.min(...xs), median: median(xs), max: Math.max(...xs) });
const full = fitFactorAmplitudes(snapshot, production, unknownAge);
const halves = [halfFit(0), halfFit(1)];
const within50 = (a, b) => Math.abs(a - b) <= .5 * Math.max(Math.abs(a), Math.abs(b));
const stable = ['growth', 'maturity'].every(k => Math.sign(halves[0][k]) === Math.sign(halves[1][k]) && within50(halves[0][k], halves[1][k]));
const maeGain = fixed.summary.all.median_absolute_log_error - fitted.summary.all.median_absolute_log_error;
const amplitude = {
  full_sample_fit: { growth: full.growth, maturity: full.maturity },
  per_fold_fit_range: { growth: range(foldFits.map(f => f.growth)), maturity: range(foldFits.map(f => f.maturity)) },
  fixed_1_1: fixed.summary, fitted: fitted.summary,
  fixed_bias_factor: fixed.correctionFactor, fitted_bias_factor: fitted.correctionFactor,
  half_fits: halves,
  gates: { mae_improvement: maeGain, mae_gate: maeGain >= .02, coverage: fitted.summary.all.coverage, coverage_gate: fitted.summary.all.coverage >= .47 && fitted.summary.all.coverage <= .53, halves_stable: stable },
};
amplitude.adopt = amplitude.gates.mae_gate && amplitude.gates.coverage_gate && stable;

// ---- Task 3: per-basis bias contest. Raw (bias = 1) LOO errors, nested LOO inside every fold. ----
const rawOptions = slope => ({ factorShapes: BASELINE_SHAPES, sizeAdjustment: { mode: 'global', slope }, derivedUnknownAge: true });
const outer = backtest(snapshot, rawOptions(production.slope));
const globalLog = -median(outer.map(r => r.logError));
const variants = { i_current_scalar: [], i_fold_scalar: [], ii_per_basis_fold: [], iii_per_basis_shrunk: [] };
const foldBias = [];
for (const row of outer) {
  const inner = backtest(without(row.slug), rawOptions(production.slope));
  const same = inner.filter(r => basisKey(r) === basisKey(row));
  const foldGlobal = -median(inner.map(r => r.logError));
  const foldBasis = same.length ? -median(same.map(r => r.logError)) : foldGlobal;
  const w = same.length / (same.length + 20);
  const shrunk = w * foldBasis + (1 - w) * foldGlobal;
  foldBias.push({ slug: row.slug, basis: basisKey(row), n: same.length, foldGlobal, foldBasis, shrunk });
  variants.i_current_scalar.push({ ...row, logError: row.logError + globalLog });
  variants.i_fold_scalar.push({ ...row, logError: row.logError + foldGlobal });
  variants.ii_per_basis_fold.push({ ...row, logError: row.logError + foldBasis });
  variants.iii_per_basis_shrunk.push({ ...row, logError: row.logError + shrunk });
}
// Bands follow the production recipe: per-basis residual quartiles of the corrected errors, width multiplier searched to 50% coverage.
const score = rows => {
  const bands = {};
  for (const key of ['category', 'global_anchored']) {
    const xs = rows.filter(r => basisKey(r) === key).map(r => -r.logError);
    const r25 = quantile(xs, .25), r75 = quantile(xs, .75);
    const m = bestBandMultiplier(rows.filter(r => basisKey(r) === key).map(r => ({ ...r, lowLogDistance: -r25, highLogDistance: r75 })));
    bands[key] = { r25, r75, m };
  }
  const covered = r => { const b = bands[basisKey(r)]; return r.logError >= -b.m * b.r75 && r.logError <= -b.m * b.r25; };
  const summarize = xs => ({ count: xs.length, coverage: xs.filter(covered).length / xs.length, median_log_error: median(xs.map(r => r.logError)), median_absolute_log_error: median(xs.map(r => Math.abs(r.logError))) });
  return { overall: summarize(rows), category: summarize(rows.filter(r => basisKey(r) === 'category')), global_anchored: summarize(rows.filter(r => basisKey(r) === 'global_anchored')) };
};
const bias = Object.fromEntries(Object.entries(variants).map(([k, rows]) => [k, score(rows)]));
const base = bias.i_current_scalar;
const biasGates = Object.fromEntries(['ii_per_basis_fold', 'iii_per_basis_shrunk'].map(k => {
  const v = bias[k];
  const g = {
    overall_mae_improvement: base.overall.median_absolute_log_error - v.overall.median_absolute_log_error,
    global_anchored_abs_bias: Math.abs(v.global_anchored.median_log_error),
    category_mae_worsening: v.category.median_absolute_log_error - base.category.median_absolute_log_error,
  };
  return [k, { ...g, adopt: g.overall_mae_improvement >= .01 && g.global_anchored_abs_bias < .15 && g.category_mae_worsening <= .01 }];
}));
const by = key => foldBias.filter(f => f.basis === key);
const foldSummary = Object.fromEntries(['category', 'global_anchored'].map(key => [key, { n_same_basis: range(by(key).map(f => f.n)), fold_basis_log_bias: range(by(key).map(f => f.foldBasis)), shrunk_log_bias: range(by(key).map(f => f.shrunk)), fold_global_log_bias: range(by(key).map(f => f.foldGlobal)) }]));

// ---- Task 4: jackknife top-20 overlap, current definition vs per-fold refit of slope, bias factor, unknown age ----
const fullBias = Math.exp(globalLog);
const fullBoard = buildBoard(snapshot, MODEL, calibrate(snapshot, fullAdjustment), { biasFactor: fullBias, sizeAdjustment: fullAdjustment, unknownAge, light: true });
const fullTop = new Set(fullBoard.slice(0, 20).map(r => r.slug));
const overlap = board => board.slice(0, 20).filter(r => fullTop.has(r.slug)).length / 20;
let current = 0, refit = 0; const perFold = [];
for (const peer of live) {
  const reduced = without(peer.slug);
  const a = overlap(buildBoard(reduced, MODEL, calibrate(reduced, fullAdjustment), { biasFactor: fullBias, sizeAdjustment: fullAdjustment, unknownAge, light: true }));
  const adjustment = globalSizeAdjustment(reduced);
  const age = derivedUnknownAge(reduced);
  const foldFactor = Math.exp(-median(backtest(reduced, rawOptions(adjustment.slope)).map(r => r.logError)));
  const b = overlap(buildBoard(reduced, MODEL, calibrate(reduced, adjustment), { biasFactor: foldFactor, sizeAdjustment: adjustment, unknownAge: age, light: true }));
  current += a; refit += b;
  perFold.push({ slug: peer.slug, current: a, refit: b, slope: adjustment.slope, unknownAge: age, biasFactor: foldFactor });
}
const jackknife = {
  current: current / live.length, refit: refit / live.length, difference: Math.abs(current - refit) / live.length,
  folds_below_one: { current: perFold.filter(f => f.current < 1).length, refit: perFold.filter(f => f.refit < 1).length },
  min_fold_overlap: { current: Math.min(...perFold.map(f => f.current)), refit: Math.min(...perFold.map(f => f.refit)) },
  refit_ranges: { slope: range(perFold.map(f => f.slope)), unknownAge: range(perFold.map(f => f.unknownAge)), biasFactor: range(perFold.map(f => f.biasFactor)) },
  full: { slope: fullAdjustment.slope, unknownAge, biasFactor: fullBias },
  folds_differing: perFold.filter(f => f.current !== f.refit || f.current < 1),
};
jackknife.change_reported_value = jackknife.difference > .01;

console.log(JSON.stringify({ live_peers: live.length, amplitude, bias: { variants: bias, gates: biasGates, fold_estimates: foldSummary, production_log_bias: globalLog }, jackknife }, null, 2));
