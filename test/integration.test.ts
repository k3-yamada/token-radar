import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRadar } from '../lib/app/buildBoard.ts';
import { adoptFittedAmplitudes, factorChangeReport, globalSizeAdjustment } from '../lib/domain/backtest.ts';
import { ageDays, changePercentiles, growthFactor, maturityFactor } from '../lib/domain/estimate.ts';
import { MODEL, type Snapshot, type SnapshotProtocol } from '../lib/domain/types.ts';
import { assertFiniteNumbers } from '../lib/infra/emit.ts';
import { parseSnapshot } from '../lib/infra/snapshot.ts';

const AS_OF = '2025-01-01';
const daysBefore = (days: number) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const protocol = (overrides: Partial<SnapshotProtocol> = {}): SnapshotProtocol => ({
  slug: 'alpha', name: 'Alpha', category: 'Lending', chains: ['Ethereum'], tvl_usd: 100,
  change_7d: null, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null, ...overrides
});

/**
 * Live peers whose market cap follows the model's own factor shapes raised to `planted` amplitudes (plus a small
 * deterministic disturbance), beside `earlyCount` pre-token rows for the board. With amplitudes well above 1 the
 * fixed (1, 1) arm leaves most of that structure in its errors and the fitted arm removes it.
 */
const plantedAmplitudeSnapshot = (planted: { growth: number; maturity: number }, liveCount = 36, earlyCount = 12): Snapshot => {
  const categories = ['DEX', 'Lending', 'Yield'];
  const live = Array.from({ length: liveCount }, (_, i) => protocol({
    slug: `live-${String(i).padStart(2, '0')}`, name: `Live ${i}`, category: categories[i % 3]!, tvl_usd: 1e6 * (2 + ((i * 17) % liveCount)),
    change_7d: ((i * 7) % liveCount) - liveCount / 2 + .5, listed_at: daysBefore(30 + ((i * 11) % liveCount) * 40)
  }));
  const early = Array.from({ length: earlyCount }, (_, i) => protocol({
    slug: `early-${String(i).padStart(3, '0')}`, name: `Early ${i}`, category: categories[i % 3]!, tvl_usd: 5e5 * (i + 3),
    change_7d: i % 3 ? ((i * 5) % 19) - 9 : null, listed_at: i % 4 ? daysBefore(100 + ((i * 13) % 17) * 90) : null
  }));
  const protocols = [...live, ...early];
  const percentiles = changePercentiles(protocols);
  for (const [i, p] of live.entries()) {
    const growth = growthFactor('G2', p.change_7d, 0, MODEL, percentiles.get(p.slug) ?? .5);
    const maturity = maturityFactor('M1', ageDays(AS_OF, p.listed_at), MODEL);
    const disturbance = (((i * 37) % 11) - 5) * .01;
    p.mcap_usd = Math.round(p.tvl_usd * .5 * Math.exp(planted.growth * Math.log(growth) + planted.maturity * Math.log(maturity) + disturbance));
  }
  return { as_of: AS_OF, source: 'fixture', floor_usd: 10, protocols, watchlist: [early[3]!.slug] };
};

test('fitted amplitudes are adopted end to end on a snapshot where they beat the fixed amplitudes', () => {
  const planted = { growth: 4, maturity: 5 };
  const snap = plantedAmplitudeSnapshot(planted);
  // The report buildRadar computes for itself: same snapshot, same size adjustment.
  const report = factorChangeReport(snap, { ...globalSizeAdjustment(snap), mode: 'global' });

  // The fitted arm wins on its merits, through the gate that used to read summary fields that do not exist.
  assert.equal(report.adopted_amplitudes, true);
  assert.equal(adoptFittedAmplitudes(report.fitted, report.baseline), true);
  for (const arm of [report.baseline, report.fitted, report.unknown_age]) {
    for (const part of ['overall', 'first_half', 'second_half'] as const) {
      const metrics = arm[part];
      assert.ok(metrics.count > 0, part);
      for (const key of ['coverage', 'median_log_error', 'median_absolute_log_error'] as const) assert.ok(Number.isFinite(metrics[key]), `${part}.${key} is ${metrics[key]}`);
    }
    assert.equal(arm.first_half.count + arm.second_half.count, arm.overall.count);
  }
  assert.ok(report.fitted.overall.median_absolute_log_error < .5 * report.baseline.overall.median_absolute_log_error);
  assert.ok(report.fitted.first_half.median_absolute_log_error < report.baseline.first_half.median_absolute_log_error);
  assert.ok(report.fitted.second_half.median_absolute_log_error < report.baseline.second_half.median_absolute_log_error);
  // The full-sample fit recovers the planted structure: both exponents well above 1 and near what was planted.
  assert.ok(Math.abs(report.amplitudes.growth - planted.growth) < .25 * planted.growth, `growth ${report.amplitudes.growth}`);
  assert.ok(Math.abs(report.amplitudes.maturity - planted.maturity) < .25 * planted.maturity, `maturity ${report.amplitudes.maturity}`);

  // buildRadar takes the same decision without being handed a report, and carries it through to what it emits.
  const { board, radar } = buildRadar(snap);
  assert.deepEqual(radar.fitted_factor_amplitudes, { growth: report.amplitudes.growth, maturity: report.amplitudes.maturity });
  assert.ok(radar.model.factor_normalization.includes(`growth ^ ${report.amplitudes.growth}, maturity ^ ${report.amplitudes.maturity}`));
  assert.equal(radar.derived_unknown_listed_age_days, report.adopted_unknown_age ? report.unknownAge : MODEL.unknown_listed_age_days);
  assert.equal(radar.calibration_backtest.peers_evaluated, 36);
  assert.equal(radar.calibration_backtest.median_absolute_log_error, report.selected.summary.all.median_absolute_log_error);
  assert.doesNotThrow(() => assertFiniteNumbers(board, 'board.rows'));
  assert.doesNotThrow(() => assertFiniteNumbers(radar, 'radar'));
  // The board's factor spread is the adopted one: wider than the (1, 1) board's by about the growth exponent.
  const unit = buildRadar(snap, { factorReport: { ...report, adopted_amplitudes: false } }).board;
  const spread = (rows: typeof board) => Math.log(Math.max(...rows.map(r => r.model.growth_multiplier)) / Math.min(...rows.map(r => r.model.growth_multiplier)));
  assert.ok(spread(unit) > .05);
  assert.ok(Math.abs(spread(board) - report.amplitudes.growth * spread(unit)) < .01 * spread(board));
});

test('the same procedure does not adopt amplitudes when the peers carry no factor structure', () => {
  // The control for the case above: planted amplitudes of (1, 1) are what the fixed arm already assumes.
  const report = factorChangeReport(plantedAmplitudeSnapshot({ growth: 1, maturity: 1 }), { mode: 'global', slope: 0 });
  assert.equal(report.adopted_amplitudes, false);
  for (const part of ['overall', 'first_half', 'second_half'] as const) assert.ok(Number.isFinite(report.fitted[part].median_absolute_log_error));
});

// ---- CLI, end to end ----
const MAIN = fileURLToPath(new URL('../main.ts', import.meta.url));
const DASHBOARD_SOURCE = fileURLToPath(new URL('../dashboard', import.meta.url));
// NODE_NO_WARNINGS keeps Node's own "type stripping is experimental" notice (printed by some Node versions) off the
// child's stderr, so the assertions below read only what main.ts wrote.
const runMain = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', MAIN, ...args], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1', MAKEFUN_OUTPUT_DIR: '' } });
const filesIn = (directory: string) => readdirSync(directory).filter(name => statSync(join(directory, name)).isFile()).sort();

test('CLI builds every output, cleans a stale dashboard file on rebuild, and exits 2 on a missing snapshot', () => {
  const work = mkdtempSync(join(tmpdir(), 'token-radar-cli-'));
  try {
    // Enough pre-token rows to pass the board gate (at least 100), written through the parser the CLI reads with.
    const fixture = plantedAmplitudeSnapshot({ growth: 1, maturity: 1 }, 12, 110);
    const input = join(work, 'snapshot.json');
    writeFileSync(input, `${JSON.stringify(fixture)}\n`);
    assert.equal(parseSnapshot(readFileSync(input, 'utf8')).protocols.length, 122);
    const output = join(work, 'out');

    const first = runMain('--input', input, '--output', output);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stderr, '');
    assert.match(first.stdout, /^token radar: 122 protocols, 1 on the watchlist, 110 rows scored/);
    for (const name of ['board.json', 'data.js', 'dossier.json']) assert.ok(statSync(join(output, name)).isFile(), name);
    assert.ok(statSync(join(output, 'dashboard')).isDirectory());
    const sourceFiles = readdirSync(DASHBOARD_SOURCE).filter(name => !name.startsWith('.') && statSync(join(DASHBOARD_SOURCE, name)).isFile()).sort();
    assert.ok(sourceFiles.includes('index.html'));
    assert.deepEqual(filesIn(join(output, 'dashboard')), sourceFiles);
    const board = JSON.parse(readFileSync(join(output, 'board.json'), 'utf8')) as { rows: { slug: string; rank: number }[] };
    assert.equal(board.rows.length, 110);
    assert.deepEqual(board.rows.map(row => row.rank), board.rows.map((_, index) => index + 1));
    assert.match(readFileSync(join(output, 'data.js'), 'utf8'), /^window\.RADAR=\{.*\};\n$/s);
    assert.doesNotThrow(() => JSON.parse(readFileSync(join(output, 'dossier.json'), 'utf8')));
    const produced = Object.fromEntries(['board.json', 'data.js', 'dossier.json'].map(name => [name, readFileSync(join(output, name), 'utf8')]));

    // A file that is no longer in the source dashboard must not survive a rebuild, nor reach the dossier.
    const stale = join(output, 'dashboard', 'stale-extra.js');
    writeFileSync(stale, '// left over from an earlier build\n');
    assert.ok(existsSync(stale));
    const second = runMain('--input', input, '--output', output);
    assert.equal(second.status, 0, second.stderr);
    assert.ok(!existsSync(stale));
    assert.deepEqual(filesIn(join(output, 'dashboard')), sourceFiles);
    assert.ok(!readFileSync(join(output, 'dossier.json'), 'utf8').includes('stale-extra'));
    // The rebuild is the clean build again, byte for byte.
    for (const [name, text] of Object.entries(produced)) assert.equal(readFileSync(join(output, name), 'utf8'), text, name);

    // A missing snapshot: exit code 2, one line on stderr, no stack trace, nothing written.
    const missingInput = join(work, 'absent', 'snapshot.json');
    const missingOutput = join(work, 'out-missing');
    const missing = runMain('--input', missingInput, '--output', missingOutput);
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, '');
    assert.ok(missing.stderr.endsWith('\n'));
    assert.equal(missing.stderr.trimEnd().split('\n').length, 1, missing.stderr);
    assert.ok(missing.stderr.startsWith(`token radar: no snapshot at ${missingInput}`), missing.stderr);
    assert.doesNotMatch(missing.stderr, /\n\s+at |Error:|node:internal/);
    assert.ok(!existsSync(missingOutput));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
