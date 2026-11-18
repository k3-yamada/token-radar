import { backtest, summarizeBacktest, calibrateBacktest, measurementReport, globalSizeAdjustment } from '../domain/backtest.ts';
import type { Snapshot } from '../domain/types.ts';

export function runBacktest(snapshot: Snapshot) {
  const adjustment = globalSizeAdjustment(snapshot);
  const model = calibrateBacktest(snapshot, undefined, { mode: 'global', slope: adjustment.slope });
  const withoutDispersion = summarizeBacktest(backtest(snapshot, { sizeAdjustment: { mode: 'global', slope: adjustment.slope }, dispersionShrinkage: false, biasFactor: model.correctionFactor, bandMultipliers: model.widthMultipliers }));
  return {
    ...model.summary,
    measurements: measurementReport(snapshot),
    bias_correction_factor: model.correctionFactor,
    band_width_multipliers: model.widthMultipliers,
    dispersion_effect: {
      with_dispersion: { all_median_absolute_log_error: model.summary.all.median_absolute_log_error, global_anchored_median_absolute_log_error: model.summary.by_basis.global_anchored.median_absolute_log_error },
      fixed_k_6: { all_median_absolute_log_error: withoutDispersion.all.median_absolute_log_error, global_anchored_median_absolute_log_error: withoutDispersion.by_basis.global_anchored.median_absolute_log_error }
    }
  };
}
