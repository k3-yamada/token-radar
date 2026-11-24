// Shared by every research tool: where the snapshot comes from and the settings production evaluates under.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../lib/infra/snapshot.ts';
import { factorChangeReport, globalSizeAdjustment } from '../lib/domain/backtest.ts';

/** The sealed kit snapshot, a sibling checkout of this repository. The snapshot is not vendored here. */
export const DEFAULT_SNAPSHOT_PATH = fileURLToPath(new URL('../../token-radar-01-kit/input/snapshot.json', import.meta.url));

/** An explicit path (the tool's first argument) wins; otherwise the kit snapshot. */
export function snapshotPath(argument = process.argv[2]) {
  return argument ? resolve(argument) : DEFAULT_SNAPSHOT_PATH;
}

export function loadSnapshot(argument = process.argv[2]) {
  const path = snapshotPath(argument);
  if (!existsSync(path)) {
    process.stderr.write(`no snapshot at ${path}: pass a snapshot.json path as the first argument (default: ${DEFAULT_SNAPSHOT_PATH})\n`);
    process.exit(2);
  }
  return parseSnapshot(readFileSync(path, 'utf8'));
}

/**
 * The factor settings `buildRadar` evaluates its calibration backtest under: fitted amplitudes and the
 * snapshot-derived unknown age, each only when `factorChangeReport` adopts it (the sealed snapshot adopts the
 * derived age, 677 days, and not the amplitudes). Spread into `calibrateBacktest`'s variants so a research arm
 * differs from production only in the one setting it contests.
 */
export function productionVariants(snapshot) {
  const report = factorChangeReport(snapshot, { ...globalSizeAdjustment(snapshot), mode: 'global' });
  return { fitAmplitudes: report.adopted_amplitudes, derivedUnknownAge: report.adopted_unknown_age };
}
