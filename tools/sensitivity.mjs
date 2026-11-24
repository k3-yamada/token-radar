// radar-12c sensitivity arms, measured under the settings production evaluates (see productionVariants).
// Usage: node --experimental-strip-types tools/sensitivity.mjs [snapshot.json]   (default: the kit snapshot)
import { loadSnapshot, productionVariants } from './_snapshot.mjs';
import { calibrateBacktest, globalSizeAdjustment } from '../lib/domain/backtest.ts';

const snapshot = loadSnapshot();
const production = productionVariants(snapshot);
const baselineAdjustment = globalSizeAdjustment(snapshot);
const variants = [
  ...[[0, 1], [.005, .995], [.01, .99], [.025, .975], [.05, .95]].map(([low, high]) => ({ name: `winsor ${low * 100}/${high * 100}`, adjustment: baselineAdjustment, calibrationOptions: { winsor: [low, high] } })),
  ...[[1, 12], [2, 24], [4, 48]].map(([min, max]) => ({ name: `shrink clamp ${min}-${max}`, adjustment: baselineAdjustment, shrinkage: { base: 6, min, max } })),
  { name: 'global exclusions: none', adjustment: baselineAdjustment, calibrationOptions: { exclusions: [], winsor: [.01, .99] } },
  { name: 'size fit: all live peers', adjustment: globalSizeAdjustment(snapshot, true) }
];
const metric = (result) => ({ coverage: result.summary.all.coverage, median_log_error: result.summary.all.median_log_error, median_absolute_log_error: result.summary.all.median_absolute_log_error });
const rows = variants.map(v => {
  const result = calibrateBacktest(snapshot, undefined, { ...v.adjustment, mode: 'global' }, { ...production, shrinkage: v.shrinkage, calibrationOptions: v.calibrationOptions });
  return { variant: v.name, ...metric(result) };
});
const base = calibrateBacktest(snapshot, undefined, { ...baselineAdjustment, mode: 'global' }, production);
console.log(JSON.stringify({ settings: production, baseline: metric(base), variants: rows }, null, 2));
