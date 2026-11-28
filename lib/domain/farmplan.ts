import type { FarmStep, SnapshotProtocol } from './types.ts';

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s += " Check the protocol's page and record the transaction.";
  return s;
}

/** The one deposit figure of a plan: every step that names an amount uses this value. */
export function planCapital(p: SnapshotProtocol): number {
  return p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
}

/** Activity span: 8 weeks for a protocol younger than a year, else 4. */
export function planWeeks(age: number | null): number {
  return age !== null && age < 365 ? 8 : 4;
}

/** Step executions of a plan: each one-off step once, each weekly step once per activity week. */
export function stepExecutions(steps: FarmStep[], weeks: number): number {
  return steps.reduce((sum, step) => sum + (step.weekly ? weeks : 1), 0);
}

/** fees = step executions x the midpoint of the row's chain gas range, the same per-execution gas every step states. */
export function farmTotals(p: SnapshotProtocol, age: number | null): { capital: number; fees: number; weeks: number } {
  const weeks = planWeeks(age);
  const executions = stepExecutions(farmSteps(p, age), weeks);
  const [low, high] = chainGas(p.chains[0]);
  return { capital: planCapital(p), fees: executions * (low + high) / 2, weeks };
}

/**
 * ASSUMED per-step network fee by chain, in USD, not snapshot data: the snapshot carries no gas or fee price. Each tier
 * lists every primary chain of the sealed board that it covers; a chain not listed takes `GAS_OTHER`. The dashboard's
 * FARM.gas mirrors this table and a test holds the two equal for every chain.
 */
export const CHAIN_GAS: { usd: [number, number]; chains: string[]; why: string }[] = [
  { usd: [1, 8], chains: ['Ethereum'], why: 'Ethereum L1: a DeFi call uses about 100k-400k gas, a few to tens of gwei at busy hours' },
  { usd: [1, 10], chains: ['Tron'], why: 'Tron: a contract call burns energy, roughly 10-40 TRX without staked or rented energy' },
  { usd: [.4, 5], chains: ['Bitcoin'], why: 'Bitcoin: one transaction of about 200 vB at 2-25 sat/vB' },
  { usd: [.001, .05], chains: ['Solana', 'Algorand', 'Stellar', 'Ripple', 'Aptos', 'Sui', 'Bittensor', 'Noble', 'XION', 'Provenance'], why: 'fixed or tiny base fees: fractions of a cent, plus any priority fee' },
  { usd: [0, .01], chains: ['Proton', 'Qubic'], why: 'no user gas fee by design' },
  { usd: [.01, .25], why: 'EVM rollups, sidechains and other low-fee chains: a DeFi call costs a few cents, rarely $0.25', chains: ['Base', 'Arbitrum', 'Ink', 'zkSync Era', 'Manta', 'World Chain', 'Mantle', 'Morph', 'RISE', 'Reya Network', 'Robinhood Chain', 'Fluent', 'BSquared', 'Mezo', 'Polygon', 'Avalanche', 'Binance', 'Monad', 'Flare', 'Klaytn', 'Ronin', 'Berachain', 'RSK', 'Bifrost Network', 'Plume Mainnet', 'Pharos', 'Arc', 'Stable', 'Plasma', 'Tempo', 'Hyperliquid L1', 'Kava', 'Starknet', 'Stacks', 'Canton', 'Strato'] }
];
export const GAS_OTHER: [number, number] = [.01, .25];
export function chainGas(chain: string | undefined): [number, number] {
  return CHAIN_GAS.find(t => t.chains.includes(chain ?? ''))?.usd ?? GAS_OTHER;
}

/**
 * How a chain is used, which decides the wording of steps 1, 2 and the fee label: EVM chains have token approvals and
 * gas; Solana signs transactions; Bitcoin sends from a wallet (or a Lightning channel); every other chain gets neutral
 * signing wording. Chains whose model the snapshot cannot settle (Hyperliquid L1, Kava, Tron, Starknet) are 'other'.
 */
const EVM = new Set(['Ethereum', 'Base', 'Arbitrum', 'Ink', 'zkSync Era', 'Manta', 'World Chain', 'Mantle', 'Morph', 'RISE', 'Reya Network', 'Robinhood Chain', 'Fluent', 'BSquared', 'Mezo', 'Polygon', 'Avalanche', 'Binance', 'Monad', 'Flare', 'Klaytn', 'Ronin', 'Berachain', 'RSK', 'Bifrost Network', 'Plume Mainnet', 'Pharos', 'Arc', 'Stable', 'Plasma', 'Tempo']);
export type ChainKind = 'evm' | 'solana' | 'bitcoin' | 'other';
export function chainKind(chain: string | undefined): ChainKind {
  return chain === 'Solana' ? 'solana' : chain === 'Bitcoin' ? 'bitcoin' : EVM.has(chain ?? '') ? 'evm' : 'other';
}

/**
 * ASSUMPTIONS, not snapshot data. The snapshot carries no gas price, no time-per-action and no wage, so every figure
 * `farmEconomics` derives rests on these named constants and is emitted beside them.
 */
export const FARM_ASSUMPTIONS = {
  label: 'assumptions: the snapshot contains none of these figures',
  gas_usd_per_step_by_chain: CHAIN_GAS,
  gas_usd_per_step_other_chains: GAS_OTHER,
  minutes_per_step: 15,
  value_of_time_usd_per_hour: 30,
  airdrop_share_of_launch_value: .1,
  allocation_rule: 'pro rata to the plan capital as a share of protocol TVL'
} as const;
export type FarmAssumptions = { gas_usd_per_step_low: number; gas_usd_per_step_high: number; minutes_per_step: number; value_of_time_usd_per_hour: number; airdrop_share_of_launch_value: number };
/** The assumptions a row's plan is costed on: its primary chain's gas range and the shared time constants. */
export function rowAssumptions(p: SnapshotProtocol): FarmAssumptions {
  const [low, high] = chainGas(p.chains[0]);
  return { gas_usd_per_step_low: low, gas_usd_per_step_high: high, minutes_per_step: FARM_ASSUMPTIONS.minutes_per_step, value_of_time_usd_per_hour: FARM_ASSUMPTIONS.value_of_time_usd_per_hour, airdrop_share_of_launch_value: FARM_ASSUMPTIONS.airdrop_share_of_launch_value };
}

/**
 * Cost, time and break-even of a plan under `assumptions`.
 * step_executions = one-off steps + each weekly step once per activity week, read from the steps' own `weekly` flags.
 * hours = step_executions * minutes_per_step / 60, which is the sum of the steps' stated times (each step states
 * minutes_per_step); time_cost = hours * value of time.
 * cost_low/high = step_executions * the row chain's gas low/high + time_cost. The plan capital is working capital, not a cost.
 * break_even_implied_value = cost / (capital / TVL * airdrop share): the launch value at which a pro-rata allocation
 * repays the cost. break_even_share_of_implied_value = cost / the row's implied value: the fraction of the model's
 * estimate this wallet would have to receive, which needs no allocation assumption.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, impliedValue: number | null = null, assumptions: FarmAssumptions = rowAssumptions(p)) {
  const capital = planCapital(p);
  const executions = stepExecutions(farmSteps(p, age), planWeeks(age));
  const hours = executions * assumptions.minutes_per_step / 60;
  const timeCost = hours * assumptions.value_of_time_usd_per_hour;
  const gasLow = executions * assumptions.gas_usd_per_step_low;
  const gasHigh = executions * assumptions.gas_usd_per_step_high;
  const costLow = gasLow + timeCost;
  const costHigh = gasHigh + timeCost;
  const walletShare = p.tvl_usd > 0 ? capital / p.tvl_usd * assumptions.airdrop_share_of_launch_value : 0;
  const breakEven = (cost: number) => walletShare > 0 ? cost / walletShare : null;
  const shareOfImplied = (cost: number) => impliedValue !== null && impliedValue > 0 ? cost / impliedValue : null;
  return {
    step_executions: executions,
    hours,
    gas_usd_low: gasLow,
    gas_usd_high: gasHigh,
    time_cost_usd: timeCost,
    cost_usd_low: costLow,
    cost_usd_high: costHigh,
    break_even_implied_value_usd_low: breakEven(costLow),
    break_even_implied_value_usd_high: breakEven(costHigh),
    break_even_share_of_implied_value_low: shareOfImplied(costLow),
    break_even_share_of_implied_value_high: shareOfImplied(costHigh)
  };
}

/**
 * What a category's farm plan asks for, in plan order: the check made before any deposit, the deposit or first
 * action with the plan's one amount `a`, the action repeated each week, the one-off engagement that fits the category
 * (step 5), and the exit by the category's own mechanics (step 6, lower-case, no final stop). Templates describe the
 * category's own qualifying activity; they name no protocol feature, token, rate or programme that the snapshot does
 * not carry, and anything that may not exist (a vote, a points page, a staking option) is phrased "if".
 */
type Template = { risk: string; action: string; weekly: string; once: string; exit: string };
type Ctx = { n: string; c: string; a: string; all: string };
const holdWeekly = ({ n, c }: Ctx) => `Open your ${n} position on ${c}; check its balance, and claim or compound rewards if the app offers it.`;
const TEMPLATES: [RegExp, string, (x: Ctx) => Template][] = [
  [/leveraged farm/, 'leveraged farming', ({ n, c, a }) => ({
    risk: `Before opening a position on ${n}, read the leverage limits, borrow rate and liquidation rules for ${c}, and plan to use 2x leverage or less on the ${a}.`,
    action: `Open one ${a} leveraged farming position on ${n} on ${c} at low leverage, in a pool the app lists.`,
    weekly: `Open your ${n} position on ${c}; check the debt ratio and the distance to liquidation, and harvest rewards or reduce leverage if the app allows it.`,
    once: `Once during the plan, reduce the leverage of your ${n} position by repaying part of the borrowed side, and check that the debt ratio falls as the app predicts.`,
    exit: `close the leveraged position so the borrowed side is repaid, then withdraw what remains of the ${a} on ${c}` })],
  [/index/, 'index', ({ n, c, a }) => ({
    risk: `Before buying, open the index's page in ${n}'s app on ${c} and check what it holds, the fees it charges and how redemption works.`,
    action: `Buy or mint ${a} of one ${n} index token on ${c} through the app and hold it in the same wallet.`,
    weekly: `Check the index position in ${n} on ${c}, and make one small mint or redemption within the same ${a}.`,
    once: `Once during the plan, read the index's latest rebalance or change of holdings in ${n}'s app, and if ${n} runs a vote on the index, vote with the same wallet.`,
    exit: `redeem or sell the index token in the app on ${c} for what remains of the ${a}` })],
  [/cdp/, 'CDP', ({ n, c, a }) => ({
    risk: `Before depositing collateral in ${n} on ${c}, check the collateral ratio, liquidation ratio and stability or borrow fee, and plan to mint no more than a quarter of the ${a} in debt.`,
    action: `Deposit ${a} of a supported collateral asset in ${n} on ${c}; then mint a small amount of debt against it and repay it, so the position shows both sides.`,
    weekly: `Open your ${n} position on ${c}, check the collateral ratio and fees, and make one small mint, repay or top-up within the same ${a}.`,
    once: `Once during the plan, check how the stability or borrow fee on ${n} has changed since you opened the position, and if ${n} runs a vote on collateral or fee settings, vote with the same wallet.`,
    exit: `repay all minted debt first, then withdraw the collateral, what remains of the ${a}, on ${c}` })],
  [/uncollateral/, 'uncollateralized lending', ({ n, c, a }) => ({
    risk: `Before supplying to ${n} on ${c}, read who borrows from the pool and how they are vetted, what happens to lenders if a borrower defaults, and any lock-up or withdrawal notice period.`,
    action: `Supply ${a} of the stablecoin ${n} accepts to one lending pool on ${c} and keep the receipt token in the same wallet; borrowing is for vetted borrowers, so the plan only lends.`,
    weekly: `Open your ${n} position on ${c}, check the pool's yield and utilization, and claim interest if the app shows a claim.`,
    once: `Once during the plan, read the latest pool or borrower report ${n} publishes, if any, and check how much of the pool is free to withdraw.`,
    exit: `request withdrawal of the supplied ${a}, wait out any notice period or queue the pool sets, then withdraw on ${c}` })],
  [/restak|collateral market/, 'restaking/collateral', ({ n, c, a }) => ({
    risk: `Before depositing, read which networks or operators ${n} lets your deposit secure on ${c}, the slashing conditions that apply, and how long a withdrawal takes to be released.`,
    action: `Deposit ${a} of an asset ${n} accepts into one of its restaking or collateral vaults on ${c}, and record the position or receipt token the app shows.`,
    weekly: `Open your ${n} position on ${c}; check the deposit balance and any slashing notice, and claim rewards if the app shows them.`,
    once: `Once during the plan, check which networks or operators your ${n} deposit currently backs, if the app shows it, and whether any slashing event has been reported.`,
    exit: `request withdrawal from the ${n} vault; deposits leave through a withdrawal queue or epoch, so claim what remains of the ${a} on ${c} once it is released` })],
  [/lend|credit|money market/, 'lending', ({ n, c, a }) => ({
    risk: `Before supplying or borrowing on ${n} on ${c}, check the collateral factor, liquidation threshold, health factor and borrow rate for the asset you will use, and plan to borrow no more than a quarter of the ${a}.`,
    action: `Supply ${a} of a stablecoin ${n} lists on ${c}; then make a small borrow and repay it to create both sides of a lending position.`,
    weekly: `Open your ${n} position on ${c}, check the health factor and rates, and make one small supply, borrow or repay within the same ${a}.`,
    once: `Once during the plan, supply part of the same ${a} as a second asset ${n} lists on ${c}, keeping the health factor well above the liquidation level.`,
    exit: `repay every borrow in full first, then withdraw the supplied ${a} on ${c}` })],
  [/dex|swap|exchange/, 'DEX/swap', ({ n, c, a }) => ({
    risk: `Before adding liquidity on ${n}, choose one active pool on ${c}, check its fee and, if it uses price ranges, the range, and estimate the impermanent loss a ${a} position would take if one asset moved 20%.`,
    action: `Put ${a} into that ${n} pool on ${c}: swap about half of it through ${n} into the pool's second asset, then add a balanced portion of both to the liquidity pool.`,
    weekly: `Check your ${n} pool position on ${c}; collect accrued fees, or rebalance the range if the pool uses one and the price has left it, inside the same ${a}.`,
    once: `Once during the plan, make one small swap through ${n} on ${c} in a second pair, so the wallet has swap history as well as liquidity.`,
    exit: `remove the liquidity, collect the remaining fees, and swap back to the asset you started with, what remains of the ${a}, on ${c}` })],
  [/interest rate/, 'interest-rate derivatives', ({ n, c, a }) => ({
    risk: `Before buying, read how ${n} prices fixed and floating yield on ${c}: the maturity dates, the implied rate it quotes, and how much liquidity each market has.`,
    action: `Buy a ${a} fixed-rate position in one ${n} market on ${c} whose maturity falls after the plan ends, and hold it in the same wallet.`,
    weekly: `Open your ${n} position on ${c}; check its value and the implied rate, and claim any yield or rewards the app shows.`,
    once: `Once during the plan, sell a small part of the position before maturity and compare the price with the implied rate you bought at.`,
    exit: `sell the position, or redeem it if its maturity has passed, for what remains of the ${a} on ${c}` })],
  [/perpet|derivative|futures|option/, 'perps/derivatives', ({ n, c, a }) => ({
    risk: `Before depositing margin on ${n}, read the leverage limits, liquidation rules and trading and funding fees the app shows on ${c}, and plan to use 2x leverage or less.`,
    action: `Deposit ${a} of the margin asset ${n} accepts on ${c}, open a small low-leverage hedge, then close it after checking the fee charged.`,
    weekly: `Open and close one small low-leverage trade on ${n} on ${c} from the same ${a} margin, and review the fees paid.`,
    once: `Once during the plan, place one limit order on ${n} instead of a market order, and cancel it or let it fill within the same margin.`,
    exit: `close every open position, then withdraw what remains of the ${a} margin on ${c}` })],
  [/curator|vault/, 'curator/vault', ({ n, c, a }) => ({
    risk: `Before depositing, review the curator's permissions for the ${n} vault on ${c}, the markets it allocates to, its caps and how fast withdrawals are paid; if any of these is unclear, stop here and keep the ${a}.`,
    action: `Deposit ${a} of the vault's asset into one ${n} vault on ${c} and keep the receipt token in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }),
    once: `Once during the plan, read the ${n} vault's current allocation and any curator change announced since your deposit, and confirm it still matches what you checked in step 2.`,
    exit: `withdraw from the ${n} vault, waiting out any queue, and confirm what remains of the ${a} arrives on ${c}` })],
  [/staking|validator/, 'staking', ({ n, c, a }) => ({
    risk: `Before staking with ${n} on ${c}, check the lockup and unbonding period and any slashing terms, and confirm you can leave the ${a} staked that long.`,
    action: `Stake ${a} of the supported asset with ${n} on ${c} and keep any receipt token in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }),
    once: `Once during the plan, check the validator or pool performance ${n} reports, and if ${n} lets stakers choose a validator, review that choice.`,
    exit: `unstake and withdraw what remains of the ${a} on ${c} once the unbonding period ends, or swap any receipt token back if a market lists it` })],
  [/yield/, 'yield', ({ n, c, a }) => ({
    risk: `Before depositing, check which strategy the ${n} product on ${c} runs, the fees it takes and its withdrawal terms, and confirm the ${a} can stay there for the whole plan.`,
    action: `Deposit ${a} of the supported asset in ${n} on ${c} and keep the receipt token in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }),
    once: `Once during the plan, compare the yield ${n} reports with what it showed at deposit, and read any strategy change it has announced.`,
    exit: `withdraw from the ${n} product, allowing for any fee or delay its terms showed, and confirm what remains of the ${a} arrives on ${c}` })],
  [/bridge|cross.chain/, 'bridge/cross-chain', ({ n, c, a, all }) => ({
    risk: `Before bridging, confirm in ${n}'s app that both chains you will use are supported (${all}), and check the fee quote and expected arrival time.`,
    action: `Bridge ${a} of a stablecoin through ${n} from ${c} to a second supported chain, then use part of it in an app on the destination chain.`,
    weekly: `Send one small transfer of the same funds through ${n} between supported chains (${all}) and confirm receipt before sending more.`,
    once: `Once during the plan, send a small transfer on a different route between supported chains and compare its fee and arrival time with the first.`,
    exit: `bridge what remains of the ${a} back to ${c} through ${n} and confirm it arrives` })],
  [/rwa|real.world/, 'RWA', ({ n, c, a }) => ({
    risk: `Before subscribing, read the ${n} product terms: who holds the underlying real-world asset, the minimum subscription, the redemption window, and whether your country qualifies; if the minimum is above ${a}, stop here.`,
    action: `Complete any identity check ${n}'s app requires, then subscribe ${a} of the stablecoin it accepts into one tokenized real-world-asset product on ${c} and hold the token in the same wallet.`,
    weekly: `Open ${n} on ${c}, check the token balance and the yield or distribution accrued, and claim it if the app shows a claim.`,
    once: `Once during the plan, read the latest holdings, NAV or attestation report ${n} publishes on the underlying asset, if any, and note the next redemption window.`,
    exit: `redeem the token in the next redemption window ${n} offers, or sell it if the app lists a market, for what remains of the ${a} on ${c}` })],
  [/capital allocator/, 'onchain capital allocator', ({ n, c, a }) => ({
    risk: `Before depositing, read where ${n} allocates deposited capital, who can change that allocation, and how and when withdrawals are paid on ${c}.`,
    action: `Deposit ${a} of the stablecoin ${n} accepts into its deposit product on ${c} and keep the receipt token in the same wallet.`,
    weekly: `Open your ${n} position on ${c}; check its value and the current allocation, and claim or compound rewards if the app offers it.`,
    once: `Once during the plan, read where ${n} has moved the deposited capital since your deposit, and if it runs a vote on allocations, vote with the same wallet.`,
    exit: `request withdrawal of what remains of the ${a} on ${c}, and wait for any payout delay the app shows` })],
  [/basis/, 'basis trading', ({ n, c, a }) => ({
    risk: `Before depositing, read how ${n} runs its basis trade: where the hedge positions are held, what happens to returns when funding turns negative, and how long redemption takes on ${c}.`,
    action: `Mint or deposit ${a} into ${n}'s basis-trade product on ${c} with a stablecoin the app accepts, and stake the result in the app if staking is offered.`,
    weekly: `Open your ${n} position on ${c}; check the balance and the return the app reports, and claim or restake rewards if the app offers it.`,
    once: `Once during the plan, compare the return ${n} reports with the funding rates it shows, to see how the yield moves with funding.`,
    exit: `unstake if you staked, then redeem through ${n}'s redemption process, allowing for its delay, for what remains of the ${a} on ${c}` })],
  [/liquidity manager/, 'liquidity manager', ({ n, c, a }) => ({
    risk: `Before depositing, check which pool and fee tier the ${n} strategy uses on ${c}, the manager's fee, and the impermanent loss the position can take.`,
    action: `Deposit ${a} into one ${n}-managed liquidity strategy on ${c} and keep the receipt token; the strategy manages the price range for you.`,
    weekly: holdWeekly({ n, c, a, all: '' }),
    once: `Once during the plan, check whether the ${n} strategy has moved its price range since your deposit and what fee it took for doing so.`,
    exit: `withdraw from the ${n} strategy, receiving the pool's two assets, and swap back to what remains of the ${a} on ${c}` })],
  [/farm/, 'farm', ({ n, c, a }) => ({
    risk: `Before depositing, check which pool the ${n} farm on ${c} uses, how its rewards are paid and any deposit or withdrawal fee.`,
    action: `Deposit ${a} into one ${n} farm on ${c}, first adding the pool's assets as liquidity if the farm asks for LP tokens, and keep the receipt in the same wallet.`,
    weekly: `Open your ${n} farm on ${c} and harvest or compound the rewards earned.`,
    once: `Once during the plan, compare the reward rate of your ${n} farm with what it showed at deposit, and compound the rewards into the pool if the app allows it.`,
    exit: `unstake from the farm, remove the liquidity if you added any, and withdraw what remains of the ${a} on ${c}` })],
  [/btc|bitcoin/, 'BTC', ({ n, c, a }) => ({
    risk: `Before minting, read how ${n} secures the bitcoin behind its token: who controls custody, how redemption back to native BTC works, and what it costs.`,
    action: `Mint ${a} of ${n}'s BTC token through its app, or buy it on a market the app lists, and hold it in a wallet you control.`,
    weekly: `Open ${n} on ${c}, check the BTC token balance, and stake it or claim rewards if ${n}'s app lists that option.`,
    once: `Once during the plan, read the latest reserve or custody report ${n} publishes, if any, and check that it covers the tokens in issue.`,
    exit: `redeem the token back to native BTC through ${n}, or sell it, and confirm what remains of the ${a} arrives in a wallet you control` })],
  [/stablecoin/, 'stablecoin', ({ n, c, a }) => ({
    risk: `Before minting, read what backs ${n}'s stablecoin on ${c}, how redemption works and what it costs, and check that it currently trades close to $1.`,
    action: `Mint or wrap ${a} of ${n}'s stablecoin on ${c} through its app, and stake or deposit it in the app if that option is listed.`,
    weekly: `Open ${n} on ${c}, check the stablecoin balance and its price against $1, and claim or compound any yield the app shows.`,
    once: `Once during the plan, redeem or unwrap a small part of the stablecoin through ${n}'s app to confirm redemption works, then mint it back.`,
    exit: `unstake if you staked, then redeem or sell the stablecoin for what remains of the ${a} on ${c}` })],
  [/^chain$/, 'chain', ({ n, a }) => ({
    risk: `Before bridging, find ${n}'s official bridge from its own website, and check the fee and how long a withdrawal back takes.`,
    action: `Bridge ${a} of a stablecoin onto ${n} through its official bridge, then make one swap or transfer in an app running on ${n}.`,
    weekly: `Make one small swap, deposit or transfer on ${n} with the bridged funds, in an app you have checked.`,
    once: `Once during the plan, try a second app on ${n} with part of the bridged funds, after checking it as in step 2; if ${n} runs a points or testnet programme, read its rules first.`,
    exit: `bridge what remains of the ${a} off ${n} through the official bridge, allowing for the withdrawal time you checked in step 2` })],
  [/cedefi/, 'CeDeFi', ({ n, c, a }) => ({
    risk: `Before depositing, read which part of ${n} is custodial and which is on-chain on ${c}, the identity check it requires, and how withdrawals are paid.`,
    action: `Deposit ${a} into ${n}'s on-chain product on ${c} from the dedicated wallet and keep any receipt token in that wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }),
    once: `Once during the plan, read the latest custody or reserve statement ${n} publishes, if any, and check that the on-chain balance matches what the app shows.`,
    exit: `withdraw what remains of the ${a} from ${n}'s product to the dedicated wallet on ${c}, allowing for any payout delay` })],
  [/card/, 'card', ({ n, c, a }) => ({
    risk: `Before topping up, read ${n}'s identity check, card fees and spending limits, and who holds the topped-up funds.`,
    action: `Top up your ${n} card with ${a} of a supported stablecoin from the dedicated wallet on ${c}, then make one card purchase.`,
    weekly: `Make one card purchase with ${n} from the same top-up, and check that it shows in the app.`,
    once: `Once during the plan, compare the fee shown for each purchase with ${n}'s stated card fees, and note any difference.`,
    exit: `spend what remains of the ${a} on the card, or move it back to the dedicated wallet on ${c} if ${n} allows withdrawals` })],
  [/governance/, 'governance incentives', ({ n, c, a }) => ({
    risk: `Before depositing, read how ${n} pays incentives on ${c}, any lock period on deposited tokens, and how rewards are claimed.`,
    action: `Deposit ${a} of a governance or liquidity token that ${n} supports on ${c}, and direct its vote or incentives through the app.`,
    weekly: `Open ${n} on ${c}; claim the incentives earned and direct the vote again if a new round has started.`,
    once: `Once during the plan, read the results of the last incentive round on ${n} and compare what your vote earned with the other options it offered.`,
    exit: `claim the last incentives, unlock the deposited tokens when any lock ends, and withdraw what remains of the ${a} on ${c}` })],
  [/insurance/, 'insurance', ({ n, c, a }) => ({
    risk: `Before depositing, read ${n}'s cover terms on ${c}: which events pay out, who decides claims, and any lock on deposited capital.`,
    action: `Deposit ${a} as capital in one ${n} cover or underwriting pool on ${c} and keep the receipt in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }),
    once: `Once during the plan, read any claim ${n} has paid or rejected since your deposit, and if capital providers vote on claims, vote with the same wallet.`,
    exit: `withdraw the capital from the ${n} pool once any lock ends, and confirm what remains of the ${a} arrives on ${c}` })],
  [/otc/, 'OTC', ({ n, c, a }) => ({
    risk: `Before trading, read how ${n} settles trades on ${c}: whether funds sit in escrow, who can cancel an order, and the fee.`,
    action: `Make one ${a} trade on ${n} on ${c}: fill an existing listing, or post a small offer and let it fill.`,
    weekly: `Check open offers on ${n} on ${c}, and fill or post one small offer within the same ${a}.`,
    once: `Once during the plan, cancel one open offer before it fills, to confirm cancellation works and see what it costs.`,
    exit: `cancel any open offer and withdraw what remains of the ${a} from ${n} on ${c}` })],
  [/payment/, 'payments', ({ n, c, a }) => ({
    risk: `Before sending, check which assets ${n} supports on ${c} and the fee per payment.`,
    action: `Send a ${a} payment through ${n} on ${c} to a second wallet you control, and confirm it arrives.`,
    weekly: `Send one small payment from the same ${a} through ${n} on ${c} between your two wallets.`,
    once: `Once during the plan, send one small payment in a second asset ${n} supports, if it supports more than one, and compare the fee.`,
    exit: `send what remains of the ${a} from the second wallet back to the dedicated wallet on ${c} and confirm it arrives` })],
  [/prediction/, 'prediction market', ({ n, c, a }) => ({
    risk: `Before depositing, read the resolution rules and liquidity of the markets on ${n}, and whether your country may trade there.`,
    action: `Deposit ${a} of the stablecoin ${n} accepts on ${c} and buy shares in one market with part of it.`,
    weekly: `Buy or sell shares in one market on ${n} on ${c} with the same deposit, and review your open positions.`,
    once: `Once during the plan, sell part of one position before its market resolves, and compare the price with what you paid.`,
    exit: `sell the open shares, or redeem them once their markets resolve, then withdraw what remains of the ${a} from ${n} on ${c}` })]
];
/** Only for a category no template matches; no row of the sealed snapshot uses it. */
const DEFAULT_TEMPLATE = ({ n, c, a }: Ctx): Template => ({
  risk: `Before depositing, read ${n}'s documentation for what its main on-chain action does on ${c}, who can upgrade the contracts and how to exit.`,
  action: `Deposit ${a} into ${n}'s main on-chain product on ${c} and keep any receipt token in the same wallet.`,
  weekly: `Open your ${n} position on ${c} and make one small transaction within the same ${a}, such as a claim, swap or top-up.`,
  once: `Once during the plan, if ${n} runs a governance forum or publishes a points rule, read it and take part with the same wallet.`,
  exit: `withdraw what remains of the ${a} from ${n} on ${c}`
});

/** The template group a category falls in, or 'default' when none matches. */
export function farmGroup(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  return TEMPLATES.find(([re]) => re.test(c))?.[1] ?? 'default';
}

/** Step 1 (connect, first action) and step 2's wallet hygiene, by how the chain is used. `fee` is the step's fee phrase. */
const CHAIN_STEPS: Record<ChainKind, (n: string, c: string, fee: string) => { open: string; openCost: string; tidy: string; tidyCost: string }> = {
  evm: (n, c, fee) => ({
    open: `Open ${n}'s official app on ${c}, connect a dedicated wallet, check the network and contract the app shows, and approve only the amount the deposit needs.`,
    openCost: `$0 to connect; ${fee} for the first token approval`,
    tidy: 'If this wallet holds token approvals it no longer needs, revoke them.',
    tidyCost: `$0 to read; ${fee} for each approval you revoke` }),
  solana: (n, c, fee) => ({
    open: `Open ${n}'s official app, connect a dedicated ${c} wallet, and read the wallet's preview of each transaction before you sign it.`,
    openCost: `$0 to connect; ${fee} for each transaction you sign`,
    tidy: 'If the wallet holds empty token accounts from earlier use, close them to recover their rent.',
    tidyCost: `$0 to read; ${fee} for each account you close` }),
  bitcoin: (n, c, fee) => ({
    open: `Open ${n}'s official app with a dedicated ${c} wallet it supports, check the deposit address or request the app shows, and send a small test amount first; if the app works over Lightning, use a Lightning wallet with an open channel instead.`,
    openCost: `$0 to connect; ${fee} for the test transaction`,
    tidy: 'Keep the plan in its own wallet: if this wallet holds coins you will not use here, move the plan funds to a fresh address you control.',
    tidyCost: `$0 to read; ${fee} for that transfer` }),
  other: (n, c, fee) => ({
    open: `Open ${n}'s official app on ${c}, connect a dedicated wallet that supports ${c}, and read what each transaction does in the wallet before you sign it.`,
    openCost: `$0 to connect; ${fee} for the first transaction you sign`,
    tidy: 'If the wallet lists connected apps or permissions it no longer needs, remove them.',
    tidyCost: `$0 to read; ${fee} for each one you remove` })
};

/** TVL band of `planCapital`'s tiers, in the same order and at the same thresholds. */
export function tvlBand(tvl: number): string {
  return tvl >= 5e9 ? 'over $5B' : tvl >= 1e9 ? '$1B-$5B' : tvl >= 1e8 ? '$100M-$1B' : 'under $100M';
}
const money = (x: number) => x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${(x / 1e3).toFixed(1)}K`;

/**
 * The protocol's own facts each plan cites, every one a field of its snapshot row: its listed chains (step 1), its
 * 7-day TVL change, already in percent as DefiLlama gives it (step 2), its TVL, which sets the plan capital (step 3), and its listing age, which sets the plan
 * weeks (step 4). A field the snapshot leaves empty is said to be missing, never filled in.
 */
export function protocolFacts(p: SnapshotProtocol, age: number | null) {
  const n = p.name, c = p.chains[0], k = p.chains.length;
  return {
    chains: !c ? `The snapshot lists no chain for ${n}.` : k > 1 ? `${c} is the first of ${n}'s ${k} chains in the snapshot.` : `${c} is ${n}'s only chain in the snapshot.`,
    change: p.change_7d === null ? '' : ` ${n}'s TVL moved ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1).replace(/^-0\.0$/, '0.0')}% in the snapshot's last 7 days.`,
    tvl: `$${planCapital(p)} is the plan size for ${n}'s ${money(p.tvl_usd)} TVL (${tvlBand(p.tvl_usd)}).`,
    age: age === null ? `The snapshot has no listing date for ${n}, hence ${planWeeks(age)} weeks.` : `${n} was listed ${age} days before the snapshot, hence ${planWeeks(age)} weeks.`
  };
}

/**
 * The farm plan, in the order it is done: open the app, check the risks, deposit, repeat weekly, the category's one-off
 * engagement, exit. Steps 1-4 each cite one of the protocol's own facts (`protocolFacts`). Every amount is
 * `planCapital`; every step states `minutes_per_step` and the fee range of the row's primary chain (`chainGas`), so
 * the plan's executions, hours and costs are the sums of what the steps say.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const c = p.chains[0] ?? 'its main chain';
  const all = p.chains.length ? p.chains.join(', ') : 'its main chain';
  const n = p.name;
  const a = `$${planCapital(p)}`;
  const weeks = planWeeks(age);
  const category = (p.category ?? '').toLowerCase();
  const make = TEMPLATES.find(([re]) => re.test(category))?.[2] ?? DEFAULT_TEMPLATE;
  const t = make({ n, c, a, all });
  const kind = chainKind(p.chains[0]);
  const [low, high] = chainGas(p.chains[0]);
  const gas = `${kind === 'evm' ? 'gas' : 'network fee'} about $${low}-$${high} on ${c}`;
  const w = CHAIN_STEPS[kind](n, c, gas);
  const minutes = `${FARM_ASSUMPTIONS.minutes_per_step} minutes`;
  const f = protocolFacts(p, age);
  return [
    { text: `${w.open} ${f.chains}`, cost: w.openCost, time: minutes },
    { text: `${t.risk}${f.change} ${w.tidy}`, cost: w.tidyCost, time: minutes },
    { text: `${t.action} ${f.tvl}`, cost: `${a} of working capital, returned when you exit, plus ${gas} and any protocol fee the app shows before you confirm`, time: minutes },
    { text: `Once a week for ${weeks} weeks: ${t.weekly[0]!.toLowerCase()}${t.weekly.slice(1)} Record each transaction hash, date, amount and fee. ${f.age}`, cost: `${gas} per visit; no new capital`, time: `${minutes} each week, ${weeks} times`, weekly: true },
    { text: t.once, cost: `$0 to read; ${gas} for each transaction`, time: minutes },
    { text: `At the end of week ${weeks}, ${t.exit}. Record the final transaction, and check any rewards or points page ${n} publishes.`, cost: gas, time: minutes }
  ];
}
