// Adaptability probe: rebuilds the radar on perturbed copies of a snapshot and asserts the properties each
// perturbation is meant to show. Every case is built twice: in-process with buildRadar (the source of the rejection
// verdict and of the figures checked) and through the CLI (main.ts as a child process), whose outputs must agree.
// Usage: node --experimental-strip-types tools/adaptability.mjs [snapshot.json]   (default: the kit snapshot)
// Prints a JSON report; exits 1 when any assertion fails.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadSnapshot } from './_snapshot.mjs';
import { parseSnapshot } from '../lib/infra/snapshot.ts';
import { buildRadar } from '../lib/app/buildBoard.ts';
import { derivedUnknownAge } from '../lib/domain/backtest.ts';
import { maturityFactor } from '../lib/domain/estimate.ts';
import { MODEL } from '../lib/domain/types.ts';

const MAIN = fileURLToPath(new URL('../main.ts', import.meta.url));
const SHIFT_DAYS = 180;
const SCALES = [2, 1000];
const SCALE_TOLERANCE = 1e-6;

const source = loadSnapshot();
const categoryOf = p => p.category ?? 'Other';
const categoryCounts = new Map();
for (const protocol of source.protocols) categoryCounts.set(categoryOf(protocol), (categoryCounts.get(categoryOf(protocol)) ?? 0) + 1);
const largestCategory = [...categoryCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
const scaled = factor => ({ ...source, protocols: source.protocols.map(p => ({ ...p, tvl_usd: p.tvl_usd * factor, mcap_usd: p.mcap_usd === null ? null : p.mcap_usd * factor })) });
const shifted = days => ({ ...source, as_of: new Date(Date.parse(`${source.as_of}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10) });
const withoutCategory = category => {
  const protocols = source.protocols.filter(p => categoryOf(p) !== category);
  const kept = new Set(protocols.map(p => p.slug));
  return { ...source, protocols, watchlist: source.watchlist.filter(slug => kept.has(slug)) };
};
const cases = [
  { name: 'base', kind: 'base', snapshot: source },
  ...SCALES.map(factor => ({ name: `scale ×${factor} TVL+cap`, kind: 'scale', factor, snapshot: scaled(factor) })),
  { name: `time +${SHIFT_DAYS}d`, kind: 'time', snapshot: shifted(SHIFT_DAYS) },
  { name: 'remove largest category', kind: 'remove', snapshot: withoutCategory(largestCategory) }
];

/** Runs main.ts on a snapshot file; resolves with the exit status, stderr and whatever outputs were written. */
function runCli(snapshot) {
  const directory = mkdtempSync(join(tmpdir(), 'radar-adapt-'));
  const input = join(directory, 'perturbed-snapshot.json');
  const output = join(directory, 'out');
  writeFileSync(input, `${JSON.stringify(snapshot)}\n`);
  return new Promise(done => {
    // The child needs the flag to run the TypeScript sources on Node versions where type stripping is not the default.
    const child = spawn(process.execPath, ['--experimental-strip-types', MAIN, '--input', input, '--output', output], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.resume();
    child.on('close', status => {
      try {
        const wrote = existsSync(join(output, 'board.json')) && existsSync(join(output, 'data.js'));
        const board = wrote ? JSON.parse(readFileSync(join(output, 'board.json'), 'utf8')).rows : null;
        const radar = wrote ? JSON.parse(readFileSync(join(output, 'data.js'), 'utf8').replace(/^window\.RADAR=/, '').trim().replace(/;$/, '')) : null;
        done({ status, stderr, board, radar });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });
}

// The children run while this process builds the same cases itself.
const cliRuns = cases.map(c => runCli(c.snapshot));
const plain = value => JSON.parse(JSON.stringify(value));
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
const results = [];
let failed = 0;
let base = null;

for (const [index, c] of cases.entries()) {
  const checks = [];
  const measured = {};
  const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail }) }); if (!ok) failed++; };
  // The same parse the CLI applies to the file, so both paths see one snapshot.
  const snapshot = parseSnapshot(JSON.stringify(c.snapshot));
  const { board, radar, rejection } = buildRadar(snapshot);
  const cli = await cliRuns[index];

  // The CLI agrees with the in-process build: same verdict, and the same bytes' worth of data when it writes.
  if (rejection === null) {
    check('cli exits 0 when the gate accepts the board', cli.status === 0, `exit ${cli.status}: ${cli.stderr.trim()}`);
    check('cli board.json equals the in-process board', isDeepStrictEqual(cli.board, plain(board)));
    check('cli data.js equals the in-process radar', isDeepStrictEqual(cli.radar, plain(radar)));
  } else {
    check('cli exits 1 and reports the gate rejection', cli.status === 1 && cli.stderr.includes(rejection), `exit ${cli.status}: ${cli.stderr.trim()}`);
    check('cli writes no board when the gate rejects', cli.board === null);
  }

  // Invariants of any board the model writes, accepted or not.
  const values = board.map(row => row.implied_value_usd);
  check('implied values are finite positive integers', board.every(row => Number.isSafeInteger(row.implied_value_usd) && row.implied_value_usd > 0));
  check('implied values are non-increasing down the board', values.every((value, i) => i === 0 || values[i - 1] >= value));
  check('ranks are 1..n in board order', board.every((row, i) => row.rank === i + 1));
  check('every band holds its point estimate', board.every(row => row.value_low_usd <= row.implied_value_usd && row.implied_value_usd <= row.value_high_usd));
  check('rank ranges hold the point rank', board.every(row => row.rank_low <= row.rank && row.rank <= row.rank_high));
  const unknownAgeInUse = radar.derived_unknown_listed_age_days;
  check('unknown age in use is the derived median or the model default', unknownAgeInUse === derivedUnknownAge(snapshot) || unknownAgeInUse === MODEL.unknown_listed_age_days, unknownAgeInUse);

  if (c.kind === 'base') {
    check('the unperturbed snapshot passes the board gate', rejection === null, rejection);
    base = { board, radar, snapshot, bySlug: new Map(board.map(row => [row.slug, row])) };
  }

  if (c.kind === 'scale') {
    // Multiplying every TVL and market cap by one constant leaves every ratio, and so the ranking, unchanged.
    check('gate verdict is unchanged', rejection === null, rejection);
    check('ranks are unchanged (same slugs in the same order)', isDeepStrictEqual(board.map(row => row.slug), base.board.map(row => row.slug)));
    check('rank ranges are unchanged', isDeepStrictEqual(board.map(row => [row.rank_low, row.rank_high]), base.board.map(row => [row.rank_low, row.rank_high])));
    // Dollar figures are integers, so exact proportionality has two sources of slack: half a dollar of rounding on each
    // side of the comparison, and the bias factor, which is fitted on leave-one-out predictions that are themselves
    // rounded to whole dollars and so moves in about the eighth significant digit with the scale.
    const deviation = (row, key) => Math.abs(row[key] - c.factor * base.bySlug.get(row.slug)?.[key]);
    const scalesBy = key => board.every(row => deviation(row, key) <= .5 * c.factor + .5 + SCALE_TOLERANCE * row[key]);
    check('implied values scale by the constant', scalesBy('implied_value_usd'), `largest relative deviation ${Math.max(...board.map(row => deviation(row, 'implied_value_usd') / row.implied_value_usd))}`);
    check('band ends scale by the constant', scalesBy('value_low_usd') && scalesBy('value_high_usd'));
    measured.max_relative_value_deviation = Math.max(...board.map(row => deviation(row, 'implied_value_usd') / row.implied_value_usd));
    check('size slope is unchanged', close(radar.size_adjustment_slope, base.radar.size_adjustment_slope));
    check('bias correction factor is unchanged', close(radar.bias_correction_factor, base.radar.bias_correction_factor, 1e-6));
    check('band width multipliers are unchanged', isDeepStrictEqual(radar.band_width_multipliers, base.radar.band_width_multipliers));
    check('grades are unchanged', isDeepStrictEqual(board.map(row => row.confidence), base.board.map(row => row.confidence)));
    check('unknown age is unchanged', unknownAgeInUse === base.radar.derived_unknown_listed_age_days);
  }

  if (c.kind === 'time') {
    // Moving as_of forward ages every dated protocol by the shift; nothing else in the snapshot depends on the date.
    check('gate verdict is unchanged', rejection === null, rejection);
    check('the same protocols are scored', isDeepStrictEqual(board.map(row => row.slug).sort(), base.board.map(row => row.slug).sort()));
    check(`every known age grows by ${SHIFT_DAYS} days and unknown ages stay unknown`, board.every(row => { const before = base.bySlug.get(row.slug)?.age_days; return before === null ? row.age_days === null : row.age_days === before + SHIFT_DAYS; }));
    check(`the derived unknown age grows by ${SHIFT_DAYS} days`, derivedUnknownAge(snapshot) === derivedUnknownAge(base.snapshot) + SHIFT_DAYS);
    const baseDerived = base.radar.derived_unknown_listed_age_days === derivedUnknownAge(base.snapshot);
    const nowDerived = unknownAgeInUse === derivedUnknownAge(snapshot);
    check('the unknown age in use follows the shift when the derived age is adopted on both dates', !(baseDerived && nowDerived) || unknownAgeInUse === base.radar.derived_unknown_listed_age_days + SHIFT_DAYS, { before: base.radar.derived_unknown_listed_age_days, after: unknownAgeInUse });
    check('size slope does not depend on the date', radar.size_adjustment_slope === base.radar.size_adjustment_slope);
    check('growth multipliers do not depend on the date', board.every(row => row.model.growth_multiplier === base.bySlug.get(row.slug)?.model.growth_multiplier));
    // The board prints each maturity factor divided by the scored rows' median, rounded to 4 places, so ratios of
    // two rows' multipliers must match the M1 curve at the shifted ages (amplitude 1 unless amplitudes are adopted).
    const amplitude = radar.fitted_factor_amplitudes?.maturity ?? 1;
    const curve = row => maturityFactor('M1', row.age_days, MODEL, unknownAgeInUse) ** amplitude;
    const reference = board[0];
    check('maturity multipliers follow the maturity curve at the shifted ages', board.every(row => close(row.model.maturity_multiplier / reference.model.maturity_multiplier, curve(row) / curve(reference), 5e-4)));
    const spread = rows => Math.max(...rows.map(row => row.model.maturity_multiplier)) / Math.min(...rows.map(row => row.model.maturity_multiplier));
    check('the maturity spread does not widen as every protocol ages', amplitude !== 1 || spread(board) <= spread(base.board) + 1e-3, { before: spread(base.board), after: spread(board) });
  }

  if (c.kind === 'remove') {
    check('no protocol of the removed category is on the board', board.every(row => categoryOf(row) !== largestCategory));
    check('no calibration entry remains for the removed category', radar.calibration.every(entry => entry.category !== largestCategory));
    check('every remaining watchlist protocol is on the board', snapshot.watchlist.every(slug => board.some(row => row.slug === slug)));
  }

  const top20 = new Set(board.slice(0, 20).map(row => row.slug));
  results.push({
    case: c.name,
    rejection,
    size_slope: radar.size_adjustment_slope,
    bias_factor: radar.bias_correction_factor,
    band_multipliers: radar.band_width_multipliers,
    residual_quantiles: radar.residual_quantiles,
    unknown_age_days: unknownAgeInUse,
    board_rows: board.length,
    watchlist_coverage: `${board.filter(row => snapshot.watchlist.includes(row.slug)).length}/${snapshot.watchlist.length}`,
    top_value_usd: board[0]?.implied_value_usd ?? null,
    // Not asserted: how far a perturbation moves the top of the board is the measurement, not a pass/fail property.
    top20_shared_with_base: base ? base.board.slice(0, 20).filter(row => top20.has(row.slug)).length : null,
    ...(c.kind === 'remove' ? { removed_category: largestCategory, removed_protocols: categoryCounts.get(largestCategory) } : {}),
    ...measured,
    assertions: { passed: checks.filter(x => x.ok).length, failed: checks.filter(x => !x.ok).length },
    checks
  });
}

console.log(JSON.stringify({ ok: failed === 0, failed_assertions: failed, cases: results }, null, 2));
if (failed) {
  process.stderr.write(`adaptability: ${failed} assertion${failed === 1 ? '' : 's'} failed\n`);
  process.exitCode = 1;
}
