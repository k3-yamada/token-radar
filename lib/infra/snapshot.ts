import type { Snapshot } from '../domain/types.ts';

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !isCalendarDate(o.as_of)) throw new SnapshotError('snapshot.json has no valid as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some(s => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const watchlist = o.watchlist as string[];
  const repeated = watchlist.find((slug, index) => watchlist.indexOf(slug) !== index);
  if (repeated !== undefined) throw new SnapshotError(`snapshot.json's watchlist has duplicate slug ${repeated}`);
  const slugs = new Set<string>();
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    if (p.slug.trim() === '' || p.name.trim() === '') throw new SnapshotError(`snapshot.json's protocol ${i} has an empty slug or name`);
    if (slugs.has(p.slug)) throw new SnapshotError(`snapshot.json has duplicate protocol slug ${p.slug}`);
    slugs.add(p.slug);
    if (p.tvl_usd < 0) throw new SnapshotError(`snapshot.json's protocol ${i} has negative TVL`);
    // An absent or null mcap_usd / change_7d means "not recorded"; a present value of the wrong type is a broken
    // snapshot, not a missing figure, and a silently nulled market cap would turn a live token into a pre-token row.
    // A negative mcap_usd is NOT rejected: the sealed snapshot carries one (-1, a source sentinel), so it passes through
    // unchanged as it always has; every consumer reads a live token as mcap_usd > 0.
    if (p.mcap_usd !== null && p.mcap_usd !== undefined && (typeof p.mcap_usd !== 'number' || !Number.isFinite(p.mcap_usd))) throw new SnapshotError(`snapshot.json's protocol ${i} has an mcap_usd that is not a number`);
    if (p.change_7d !== null && p.change_7d !== undefined && (typeof p.change_7d !== 'number' || !Number.isFinite(p.change_7d))) throw new SnapshotError(`snapshot.json's protocol ${i} has a change_7d that is not a number`);
    if (p.listed_at !== null && p.listed_at !== undefined && (typeof p.listed_at !== 'string' || !isCalendarDate(p.listed_at))) throw new SnapshotError(`snapshot.json's protocol ${i} has an invalid listed_at date`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist };
}
