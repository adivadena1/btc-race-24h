// Momentum-60 Breakout with a 3% Trailing Stop — a BTC (cbBTC/USDC) trend bot.
//
// Idea: BTC's daily moves come in bursts. This bot waits for a genuine 1-hour
// up-move, rides it with the whole account, and lets a trailing stop cap the
// loss if the day turns. It trades rarely (once on the dev window) because a
// full-size round trip costs ~30 bps (fee + slippage + pool impact), so every
// trade has to earn more than that or it is not worth taking.
//
//   - Entry (first): the trailing 60-bar (1h) return exceeds 40 bps (0.40%).
//     40 bps is just above the 1-minute noise (per-1m log-return sd is ~8 bps,
//     so a 60-bar drift of 40 bps is a real move, not chop) and low enough to
//     catch a rally in its first hour.
//   - Exit: a trailing stop. Sell everything when the close falls 300 bps
//     (3.00%) below the highest close since entry. 3% sits well above the
//     dev window's worst peak-to-trough pullback (1.98%), so it does not fire
//     on normal chop, but it caps a real down day at roughly a 3% loss.
//   - Re-entry (after any exit) is deliberately hard, so a crash cannot churn
//     the account with buy-the-dip / stop-out cycles: at least 120 bars (2h)
//     must have passed, the 60-bar return must exceed 100 bps (1.00%), and
//     the close must be above the peak the bot was stopped out from — the
//     trend has to prove it genuinely reversed.
//   - One position at a time, full equity on every buy, full quantity on
//     every sell. max_slippage_bps is 100 (1%) on every order.
//
// Fully deterministic: integer (bigint) math only, no clock, no randomness,
// no environment, no files, no network. The only state is the close history
// and the stop bookkeeping above.
//
// Dev-window result (grade-local, kit data): net PnL +$32.24, 1 trade,
// max drawdown -1.98%. See BUILD-REPORT.md in the garapan folder.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Momentum window: 60 one-minute bars (1 hour). */
const LOOKBACK_BARS = 60;
/** First-entry threshold: trailing 60-bar return above 40 bps. */
const ENTRY_BPS = 40n;
/** Re-entry threshold after an exit: trailing 60-bar return above 100 bps. */
const REENTRY_BPS = 100n;
/** Trailing stop: sell when the close is this far below the peak since entry. */
const TRAIL_BPS = 300n;
const BPS = 10_000n;
/** No re-entry until this many bars after an exit. */
const COOLDOWN_BARS = 120;
/** Slippage allowance on every order (1%). */
const MAX_SLIPPAGE_BPS = 100;

// --- state (per run; reset by the process, never by the clock) -----------------
/** Closes of every CBBTC bar seen, in order (warm-up bars included). */
const closes: bigint[] = [];
/** Highest close since the current entry (the entry close at entry). */
let peak = 0n;
/** Highest close at the moment of the last exit (re-entry must beat it). */
let exitPeak = 0n;
/** Bar index (into `closes`) of the last exit decision, -1 when never exited. */
let lastExitBar = -1;

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  // Only a bar for our symbol advances the history; a batch without one
  // carries no new price information.
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const close = BigInt(bar.c);
  closes.push(close);
  const barIndex = closes.length - 1;

  // Warm-up bars exist to build history; never trade on them.
  if (state.warmingUp) return [];

  const held = state.positions.get(SYMBOL);
  const qty = held === undefined ? 0n : BigInt(held.qty);

  if (qty > 0n) {
    // Holding: maintain the trailing stop from the peak close since entry.
    if (close > peak) peak = close;
    if (close * BPS <= peak * (BPS - TRAIL_BPS)) {
      exitPeak = peak;
      lastExitBar = barIndex;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat: look for a momentum entry.
  if (barIndex < LOOKBACK_BARS) return [];
  if (lastExitBar >= 0 && barIndex - lastExitBar < COOLDOWN_BARS) return [];
  const base = closes[barIndex - LOOKBACK_BARS]!;
  // Trailing 60-bar return in bps, integer-truncated. BigInt division
  // truncates toward zero rather than flooring, which only matters for
  // negative returns — and the entry thresholds below are positive, so a
  // negative return can never pass either way.
  const retBps = ((close - base) * BPS) / base;
  const need = lastExitBar < 0 ? ENTRY_BPS : REENTRY_BPS;
  if (retBps <= need) return [];
  // After an exit, only re-enter above the peak the bot was stopped out from.
  if (lastExitBar >= 0 && close <= exitPeak) return [];
  // Full equity, capped by the caps' weight room (here 100% of equity, so
  // the cap is a no-op — but it keeps the buy legal if a contest ever runs
  // a lower max_weight_bps). The buy is rejected (not an error) if cash is
  // below the minimum notional, so guard that here too.
  const cash = state.cash;
  const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
  if (cash < minNotional) return [];
  const notional = cash < state.weightRoom(SYMBOL) ? cash : state.weightRoom(SYMBOL);
  if (notional < minNotional) return [];
  peak = close;
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({ onBatch });
