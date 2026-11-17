// Token Radar scores only pre-token protocols. Live-token protocols calibrate the TVL multiple:
// within categories with at least four positive-TVL live protocols, use that category's median
// market-cap/TVL ratio; otherwise use the global live-token median. This makes each estimate
// comparable to observed market values in this snapshot. TVL is then adjusted for seven-day
// growth, how long the protocol has been listed without a token (a proxy for maturity), and
// chain coverage. Every input comes from the snapshot, and no protocol name is special-cased.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: SnapshotProtocol[]; watchlist: string[] }

/** Constants used by the valuation and selection rules; names state their units and meaning. */
export interface ModelConstants {
  category_min_live_protocols: number;
  growth_clamp_min_pct: number;
  growth_clamp_max_pct: number;
  growth_weight: number;
  maturity_min_factor: number;
  maturity_range: number;
  maturity_cap_days: number;
  unknown_listed_age_days: number;
  chain_bonus_per_extra_chain: number;
  chain_bonus_max_extra_chains: number;
  minimum_implied_value_usd: number;
  board_max_rows: number;
  // Retained for the existing dashboard's model panel/API compatibility.
  base_multiple: number; growth_floor: number; growth_cap: number; maturity_floor: number;
  maturity_days: number; maturity_range_legacy: number; unknown_age_days: number;
}
export const MODEL: ModelConstants = {
  category_min_live_protocols: 4,
  growth_clamp_min_pct: -50, growth_clamp_max_pct: 100, growth_weight: 0.35,
  maturity_min_factor: 0.75, maturity_range: 0.5, maturity_cap_days: 1460,
  unknown_listed_age_days: 365, chain_bonus_per_extra_chain: 0.03, chain_bonus_max_extra_chains: 5,
  minimum_implied_value_usd: 1, board_max_rows: 200,
  base_multiple: 0, growth_floor: -50, growth_cap: 100, maturity_floor: 0.75,
  maturity_days: 1460, maturity_range_legacy: 0.5, unknown_age_days: 365,
};
export const MODEL_VERSION = 'radar-2';
/** Maximum additional high-TVL pre-token rows; combined board is capped at 200. */
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;
export interface FarmStep { text: string; cost: string; time: string }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null; gecko_id: string | null;
  symbol: string | null; token_status: 'pre-token'; age_days: number | null; implied_value_usd: number;
  model: { category_ratio_used: number; category_ratio_source: string; base_usd: number; growth_pct: number;
    growth_multiplier: number; maturity_multiplier: number; chain_multiplier: number; age_days: number | null };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null; age_days: number | null;
  implied_value_usd: number; growth_multiplier: number; maturity_multiplier: number;
  category_ratio_used: number; category_ratio_source: string; base_usd: number; chain_multiplier: number; farm_steps: string[]; watchlist: boolean;
}
export interface LiveRow { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; mcap_usd: number | null; change_7d: number | null }
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants; model_version: string;
  watchlist_size: number; board_size: number; early_size: number; live_size: number; scanned_size: number; rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error { constructor(message: string) { super(message); this.name = 'SnapshotError' } }
const DAY_MS = 86_400_000;
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
export interface Calibration { global: number; categories: Map<string, number> }
export function calibrate(snapshot: Snapshot): Calibration {
  const live = snapshot.protocols.filter(p => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(live.map(p => p.mcap_usd! / p.tvl_usd));
  const groups = new Map<string, number[]>();
  for (const p of live) if (p.category) {
    const xs = groups.get(p.category) ?? []; xs.push(p.mcap_usd! / p.tvl_usd); groups.set(p.category, xs);
  }
  const categories = new Map<string, number>();
  for (const [category, ratios] of groups) if (ratios.length >= MODEL.category_min_live_protocols) categories.set(category, median(ratios));
  return { global, categories };
}
export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL, calibration: Calibration = { global: 0, categories: new Map() }): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; ratio: number; ratioSource: string; base: number; chainMult: number } {
  const age = ageDays(asOf, p.listed_at), growthPct = Math.min(model.growth_clamp_max_pct, Math.max(model.growth_clamp_min_pct, p.change_7d ?? 0));
  const growthMult = 1 + growthPct / 100 * model.growth_weight;
  const maturityMult = model.maturity_min_factor + Math.min(age ?? model.unknown_listed_age_days, model.maturity_cap_days) / model.maturity_cap_days * model.maturity_range;
  const ratio = p.category && calibration.categories.has(p.category) ? calibration.categories.get(p.category)! : calibration.global;
  const ratioSource = p.category && calibration.categories.has(p.category) ? p.category : 'global';
  const base = p.tvl_usd * ratio, chainMult = 1 + Math.min(Math.max(p.chains.length - 1, 0), model.chain_bonus_max_extra_chains) * model.chain_bonus_per_extra_chain;
  const implied = Math.max(model.minimum_implied_value_usd, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, age, ratio, ratioSource, base, chainMult };
}
const VERSIONED = /\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;
const EXCLUDED_CATEGORIES = new Set(['bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex']);
const EXCLUDED_NAME_WORDS = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
export function isPreToken(p: SnapshotProtocol): boolean { return p.mcap_usd === null && p.gecko_id === null && p.symbol === null }
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !EXCLUDED_CATEGORIES.has((p.category ?? '').toLowerCase()) && !VERSIONED.test(p.name)
    && !EXCLUDED_NAME_WORDS.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> { return new Map(protocols.map(p => [p.slug, p])) }
export interface BoardSummary { watchlist_size: number; board_size: number; early_size: number; live_size: number }
function round4(n: number): number { return Math.round(n * 1e4) / 1e4 }
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s += " Check the protocol's page and record the transaction.";
  return s;
}
function chainOf(p: SnapshotProtocol): string { return p.chains[0] ?? 'its main chain' }
function capitalFor(p: SnapshotProtocol): number { return p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50 }
function categoryGroup(p: SnapshotProtocol): 'lending' | 'DEX/swap' | 'perps/derivatives' | 'yield/staking' | 'bridge/cross-chain' | 'other' {
  const c = (p.category ?? '').toLowerCase();
  if (/lend|cdp|collateral|credit|money market/.test(c)) return 'lending';
  if (/dex|swap|exchange/.test(c)) return 'DEX/swap';
  if (/perpet|derivative|futures|option/.test(c)) return 'perps/derivatives';
  if (/yield|staking|restak|vault/.test(c)) return 'yield/staking';
  if (/bridge|cross.chain/.test(c)) return 'bridge/cross-chain';
  return 'other';
}
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p), allChains = p.chains.length ? p.chains.join(', ') : 'its main chain', name = p.name, amount = capitalFor(p), group = categoryGroup(p);
  const actions: Record<string, string> = {
    'lending': `Supply $${amount} USDC to ${name} on ${chain}; then make a small borrow and repay it to create both sides of a lending position.`,
    'DEX/swap': `Swap $${amount} of a major asset through ${name} on ${chain}, then add a balanced portion to one active liquidity pool.`,
    'perps/derivatives': `Deposit $${amount} USDC as margin on ${name} on ${chain}, open a small low-leverage hedge, then close it after checking fees.`,
    'yield/staking': `Deposit or stake $${amount} of the supported asset in ${name} on ${chain} and keep the receipt token in the same wallet.`,
    'bridge/cross-chain': `Bridge $${amount} of USDC through ${name} from ${chain} to a second supported chain (${allChains}); use a small remainder in the destination app.`,
    'other': `Make a $${amount} deposit or other supported on-chain action in ${name} on ${chain}, following the app's own instructions.`
  };
  const poolAction = group === 'lending' ? `Adjust the USDC supply in ${name} on ${chain} once this week and check the borrow rate before borrowing.` : group === 'DEX/swap' ? `Add or rebalance $${Math.min(amount, 50)} in a ${name} liquidity pool on ${chain}; check price range and fee tier first.` : group === 'perps/derivatives' ? `On ${name} on ${chain}, make one additional small hedge trade and close it; keep leverage low and review trading fees.` : group === 'yield/staking' ? `On ${name} on ${chain}, compound or restake once if the app supports it; otherwise add $${Math.min(amount, 50)} to the position.` : group === 'bridge/cross-chain' ? `Send a second small transfer through ${name} between supported chains (${allChains}) and confirm receipt before bridging more.` : `Repeat one small supported action in ${name} on ${chain}, such as a swap, deposit, or market interaction.`;
  return [
    { text: `Open ${name}'s official app on ${chain}, connect a dedicated wallet, and confirm the network and contract shown by the app before signing.`, cost: '$0 to connect; allow $1-$5 for an initial approval or gas fee', time: '10-15 minutes' },
    { text: actions[group]!, cost: `$${amount} of working capital plus roughly $2-$12 in gas or trading fees on ${chain}`, time: '15-30 minutes' },
    { text: poolAction, cost: `$${Math.min(amount, 50)}-$${Math.min(amount, 100)} additional activity; about $1-$8 in fees`, time: '10-20 minutes weekly' },
    { text: `Repeat the category's qualifying activity in ${name} on ${chain} each week for ${age !== null && age < 365 ? '8' : '4'} weeks; review rates, slippage, and fees before each transaction.`, cost: 'about $1-$8 per visit on ' + chain, time: '10 minutes weekly' },
    { text: `Check ${name}'s governance forum or official community for a proposal or points rule, then cast an eligible vote or leave a specific question using the same wallet on ${chain}.`, cost: 'usually $0-$3 gas on ' + chain, time: '15-30 minutes monthly' },
    { text: `Record each ${name} transaction hash, date, amount, and fees; review the position and any official rewards page before withdrawing on ${chain}.`, cost: '$0 to track; withdrawal may cost $1-$12 gas on ' + chain, time: '5 minutes weekly; 10-20 minutes to unwind' },
  ];
}
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols), chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) { const p = index.get(slug); if (p) chosen.set(slug, p) }
  const slots = Math.max(0, Math.min(EARLY_ROWS, model.board_max_rows - chosen.size));
  const early = snapshot.protocols.filter(p => !chosen.has(p.slug) && isRankable(p)).sort((a,b) => b.tvl_usd-a.tvl_usd || a.slug.localeCompare(b.slug)).slice(0, slots);
  for (const p of early) chosen.set(p.slug, p);
  const calibration = calibrate(snapshot);
  const scored = [...chosen.values()].map(p => ({ p, v: impliedValue(p, snapshot.as_of, model, calibration) }));
  scored.sort((a,b) => b.v.implied-a.v.implied || b.p.tvl_usd-a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));
  return scored.map(({p,v},i) => ({ rank:i+1, slug:p.slug, name:p.name, category:p.category, chains:p.chains, tvl_usd:p.tvl_usd,
    change_7d:p.change_7d, mcap_usd:p.mcap_usd, listed_at:p.listed_at, gecko_id:p.gecko_id, symbol:p.symbol, token_status:'pre-token', age_days:v.age,
    implied_value_usd:v.implied, model:{ category_ratio_used:round4(v.ratio), category_ratio_source:v.ratioSource, base_usd:Math.round(v.base), growth_pct:v.growthPct,
      growth_multiplier:round4(v.growthMult), maturity_multiplier:round4(v.maturityMult), chain_multiplier:round4(v.chainMult), age_days:v.age },
    farm_steps:farmSteps(p,v.age).map(stepText) }));
}
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols.filter(p => !isPreToken(p) && p.category !== 'CEX').sort((a,b)=>(b.mcap_usd??0)-(a.mcap_usd??0)||b.tvl_usd-a.tvl_usd).slice(0,LIVE_ROWS).map(p=>({slug:p.slug,name:p.name,category:p.category,chains:p.chains,tvl_usd:p.tvl_usd,mcap_usd:p.mcap_usd,change_7d:p.change_7d}));
}
export function radarRow(row: BoardRow): RadarRow {
  return { rank:row.rank,slug:row.slug,name:row.name,category:row.category,chains:row.chains,tvl_usd:row.tvl_usd,change_7d:row.change_7d,mcap_usd:row.mcap_usd,listed_at:row.listed_at,age_days:row.age_days,implied_value_usd:row.implied_value_usd,growth_multiplier:row.model.growth_multiplier,maturity_multiplier:row.model.maturity_multiplier,category_ratio_used:row.model.category_ratio_used,category_ratio_source:row.model.category_ratio_source,base_usd:row.model.base_usd,chain_multiplier:row.model.chain_multiplier,farm_steps:row.farm_steps };
}
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board=buildBoard(snapshot,model), live=liveRows(snapshot), early=board.filter(r=>!snapshot.watchlist.includes(r.slug)).length;
  const watchlist=new Set(snapshot.watchlist);
  const radar:RadarData={as_of:snapshot.as_of,source:snapshot.source,floor_usd:snapshot.floor_usd,model,model_version:MODEL_VERSION,watchlist_size:snapshot.watchlist.length,board_size:board.length,early_size:early,live_size:live.length,scanned_size:snapshot.protocols.length,rows:board.map(r=>({...radarRow(r),watchlist:watchlist.has(r.slug)})),live}; return {board,radar};
}
export function parseSnapshot(text: string): Snapshot {
  let raw:unknown; try { raw=JSON.parse(text) } catch { throw new SnapshotError('snapshot.json is not JSON') }
  if(typeof raw!=='object'||raw===null||Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o=raw as Record<string,unknown>;
  if(typeof o.as_of!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if(typeof o.source!=='string') throw new SnapshotError('snapshot.json has no source');
  if(typeof o.floor_usd!=='number'||!Number.isSafeInteger(o.floor_usd)||o.floor_usd<=0) throw new SnapshotError('snapshot.json has no floor_usd');
  if(!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if(!Array.isArray(o.watchlist)||o.watchlist.some(s=>typeof s!=='string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols=o.protocols.map((v,i)=>{ if(typeof v!=='object'||v===null||Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`); const p=v as Record<string,unknown>;
    if(typeof p.slug!=='string'||typeof p.name!=='string'||typeof p.tvl_usd!=='number'||!Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {slug:p.slug,name:p.name,category:typeof p.category==='string'?p.category:null,chains:Array.isArray(p.chains)?p.chains.filter((c):c is string=>typeof c==='string'):[],tvl_usd:p.tvl_usd,change_7d:typeof p.change_7d==='number'&&Number.isFinite(p.change_7d)?p.change_7d:null,mcap_usd:typeof p.mcap_usd==='number'&&Number.isFinite(p.mcap_usd)?p.mcap_usd:null,listed_at:typeof p.listed_at==='string'?p.listed_at:null,gecko_id:typeof p.gecko_id==='string'?p.gecko_id:null,symbol:typeof p.symbol==='string'?p.symbol:null}; });
  return {as_of:o.as_of,source:o.source,floor_usd:o.floor_usd,protocols,watchlist:o.watchlist as string[]};
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs=new Set(board.map(r=>r.slug)),missing=snapshot.watchlist.filter(s=>!slugs.has(s));
  if(missing.length) return `the board misses ${missing.length} watchlist slug${missing.length===1?'':'s'}: ${missing.slice(0,5).join(', ')}`;
  const ranks=board.map(r=>r.rank).sort((a,b)=>a-b); for(let i=0;i<ranks.length;i++) if(ranks[i]!==i+1)return `rank ${i+1} is ${ranks[i]}`;
  for(let i=1;i<board.length;i++) if(board[i]!.implied_value_usd>board[i-1]!.implied_value_usd)return `row ${i+1} outranks row ${i} on implied value`;
  if(board.length>=2&&board[0]!.implied_value_usd===board[board.length-1]!.implied_value_usd)return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  for(const r of board){if(r.farm_steps.length<3||r.farm_steps.length>12)return `${r.slug} has ${r.farm_steps.length} farm steps`;for(const s of r.farm_steps)if(s.length<20||s.length>600)return `${r.slug} has a farm step of ${s.length} characters`;if(!Number.isSafeInteger(r.implied_value_usd)||r.implied_value_usd<=0)return `${r.slug} has implied value ${r.implied_value_usd}`;}
  return null;
}
export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n` }
