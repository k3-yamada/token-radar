import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../lib/infra/snapshot.ts';
import { derivedUnknownAge } from '../lib/domain/backtest.ts';

const snapshotPath = resolve(process.argv[2] ?? '/input/snapshot.json');
const source = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const categoryCounts = new Map();
for (const protocol of source.protocols) {
  const category = protocol.category ?? 'Other';
  categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
}
const largestCategory = [...categoryCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
const cases = [
  ['base', source],
  ['scale ×2 TVL+cap', { ...source, protocols: source.protocols.map(p => ({ ...p, tvl_usd: p.tvl_usd * 2, mcap_usd: p.mcap_usd === null ? null : p.mcap_usd * 2 })) }],
  ['time +180d', { ...source, as_of: new Date(Date.parse(`${source.as_of}T00:00:00Z`) + 180 * 86400000).toISOString().slice(0, 10) }],
  ['remove largest category', { ...source, protocols: source.protocols.filter(p => (p.category ?? 'Other') !== largestCategory), watchlist: source.watchlist.filter(slug => source.protocols.some(p => p.slug === slug && (p.category ?? 'Other') !== largestCategory)) }]
];

const results = [];
for (const [name, snapshot] of cases) {
  const out = mkdtempSync(join(tmpdir(), 'radar-adapt-'));
  try {
    const input = join(out, 'perturbed-snapshot.json');
    writeFileSync(input, `${JSON.stringify(snapshot)}\n`);
    const main = fileURLToPath(new URL('../main.ts', import.meta.url));
    const build = spawnSync(process.execPath, [main, '--input', input, '--output', out], { encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`${name}: build failed (${build.status}): ${build.stderr || build.stdout}`);
    const { rows: board } = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
    const radarText = readFileSync(join(out, 'data.js'), 'utf8').replace(/^window\.RADAR=/, '').trim().replace(/;$/, '');
    const radar = JSON.parse(radarText);
    const rejection = null;
    const orderedValues = board.map(row => row.implied_value_usd);
    const monotone = orderedValues.every((value, i) => i === 0 || orderedValues[i - 1] >= value);
    const finiteNonnegative = board.every(row => Number.isFinite(row.implied_value_usd) && row.implied_value_usd >= 0);
    const unknownAge = derivedUnknownAge(snapshot);
    results.push({
      case: name,
      size_slope: radar.size_adjustment_slope,
      bias_factor: radar.bias_correction_factor,
      band_multipliers: radar.band_width_multipliers,
      residual_quantiles: radar.residual_quantiles,
      unknown_age_days: radar.derived_unknown_listed_age_days ?? radar.model.unknown_listed_age_days,
      board_rows: board.length,
      watchlist_coverage: `${board.filter(row => snapshot.watchlist.includes(row.slug)).length}/${snapshot.watchlist.length}`,
      top_value_usd: board[0]?.implied_value_usd ?? null,
      diagnostics: { rejection, monotone_nonincreasing: monotone, finite_nonnegative: finiteNonnegative, expected_median_known_age: unknownAge, removed_category: name.startsWith('remove') ? largestCategory : undefined }
    });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
console.log(JSON.stringify(results, null, 2));
