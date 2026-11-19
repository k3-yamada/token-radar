import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSnapshot } from '../lib/infra/snapshot.ts';
import { calibrateBacktest, globalSizeAdjustment } from '../lib/domain/backtest.ts';
import { median } from '../lib/domain/statistics.ts';

const snapshot = parseSnapshot(readFileSync(resolve(process.argv[2] ?? '/input/snapshot.json'), 'utf8'));
const adjustment = { ...globalSizeAdjustment(snapshot), mode: 'global' };
const metrics = rows => {
  const avgAbs = xs => xs.length ? xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length : null;
  const summarize = xs => ({ count: xs.length, coverage: xs.length ? xs.filter(x => x.covered).length / xs.length : null,
    median_log_error: xs.length ? median(xs.map(x => x.logError)) : null,
    median_absolute_log_error: xs.length ? median(xs.map(x => Math.abs(x.logError))) : null,
    mae: avgAbs(xs.map(x => x.logError)) });
  return { ...summarize(rows), per_basis: { category: summarize(rows.filter(x => x.basis === 'category')), global_anchored: summarize(rows.filter(x => x.basis !== 'category')) } };
};
const S = [false, true].map(adjustGlobal => {
  const result = calibrateBacktest(snapshot, undefined, adjustment, { calibrationOptions: { adjustGlobal } });
  return { arm: adjustGlobal ? 'S1 adjusted global' : 'S0 current', ...metrics(result.observations) };
});
const G = ['current', 'threshold', 'interpolate'].map((bandContinuity, i) => {
  const result = calibrateBacktest(snapshot, undefined, adjustment, { bandContinuity });
  const sparse = result.observations.filter(row => row.peerCount >= 2 && row.peerCount <= 4);
  const base = result.observations;
  const changed = i === 0 ? 0 : base.filter(row => row.basis === 'category' && (bandContinuity === 'threshold' ? row.blendWeight < .5 : row.blendWeight < 1)).length;
  return { arm: `G${i}`, ...metrics(result.observations), sparse: { ...metrics(sparse), mean_band_ratio: sparse.length ? sparse.reduce((s, r) => s + r.bandRatio, 0) / sparse.length : null }, changed_band_basis_rows: changed };
});
// Explicitly report the live LOO population so the reviewed cohort is auditable.
const livePeers = snapshot.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0).length;
console.log(JSON.stringify({ live_peers: livePeers, contest_S: S, contest_G: G }, null, 2));
