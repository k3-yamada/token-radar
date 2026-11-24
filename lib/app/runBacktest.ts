import { calibrateBacktest, factorChangeReport, measurementReport, globalSizeAdjustment } from '../domain/backtest.ts';
import { BASELINE_SHAPES } from '../domain/estimate.ts';
import { MODEL, type Snapshot } from '../domain/types.ts';

/**
 * The calibration backtest under the conditions `buildRadar` evaluates: the same size adjustment and the same factor
 * decisions (fitted amplitudes and the snapshot-derived unknown age, each only when `factorChangeReport` adopts it).
 * `measurements` runs its contest arms under those same decisions. `dispersion_effect` compares two arms that are each calibrated on their own: the fixed-k arm has its own bias
 * correction and band widths rather than borrowing the with-dispersion arm's.
 */
export function runBacktest(snapshot: Snapshot) {
  const adjustment = globalSizeAdjustment(snapshot);
  const sizeAdjustment = { mode: 'global' as const, slope: adjustment.slope };
  const factorReport = factorChangeReport(snapshot, { ...adjustment, mode: 'global' });
  const variants = { fitAmplitudes: factorReport.adopted_amplitudes, derivedUnknownAge: factorReport.adopted_unknown_age };
  const model = calibrateBacktest(snapshot, BASELINE_SHAPES, sizeAdjustment, variants);
  const fixedK = calibrateBacktest(snapshot, BASELINE_SHAPES, sizeAdjustment, { ...variants, dispersionShrinkage: false });
  const arm = (calibrated: typeof model) => ({
    all_median_absolute_log_error: calibrated.summary.all.median_absolute_log_error,
    global_anchored_median_absolute_log_error: calibrated.summary.by_basis.global_anchored.median_absolute_log_error,
    bias_correction_factor: calibrated.correctionFactor,
    band_width_multipliers: calibrated.widthMultipliers
  });
  return {
    ...model.summary,
    measurements: measurementReport(snapshot, variants),
    unknown_listed_age_days: factorReport.adopted_unknown_age ? factorReport.unknownAge : MODEL.unknown_listed_age_days,
    bias_correction_factor: model.correctionFactor,
    band_width_multipliers: model.widthMultipliers,
    dispersion_effect: { with_dispersion: arm(model), fixed_k_6: arm(fixedK) }
  };
}
