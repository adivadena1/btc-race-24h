[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/adivadena1/btc-race-24h/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/adivadena1/btc-race-24h/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# Momentum-60 — BTC trading bot

A trend-following bot for the [make.fun "Race a BTC trading bot live for 24 hours" bounty](https://make.fun/bounty/btc-race-24h-20261123-0511). It trades cbBTC vs USDC on 1-minute bars with $1,000 of paper money, one position at a time.

## Strategy

BTC's daily moves come in bursts, so the bot waits for a genuine 1-hour up-move, rides it with the whole account, and lets a trailing stop cap the loss if the day turns. It trades rarely — once on the dev window — because a full-size round trip costs ~30 bps (fee + slippage + pool impact), so every trade has to earn more than that.

- **Entry (first):** the trailing 60-bar (1h) return exceeds 40 bps (0.40%). 40 bps is just above the 1-minute noise (per-1m log-return sd ≈ 8 bps), so it marks a real move, not chop, and it is low enough to catch a rally in its first hour.
- **Exit:** a trailing stop — sell everything when the close falls 300 bps (3.00%) below the highest close since entry. 3% sits well above the dev window's worst pullback (1.98%), so it does not fire on normal chop, but it caps a real down day at roughly a 3% loss.
- **Re-entry (after any exit)** is deliberately hard, so a crash cannot churn the account with buy-the-dip / stop-out cycles: at least 120 bars (2h) must have passed, the 60-bar return must exceed 100 bps (1.00%), and the close must be above the peak the bot was stopped out from — the trend has to prove it genuinely reversed.
- **Sizing:** full equity on every buy, full quantity on every sell. `max_slippage_bps` is 100 (1%) on every order.

## Dev-window result

Graded locally against the kit's 1,440-bar dev window (`grade-local`):

| | |
|---|---|
| Net PnL | **+$32.24** |
| Trades | 1 (buy bar 68 at $59,068.19, flattened at the end at $61,021.29) |
| Max drawdown | −1.98% |
| Sub-windows (continuous run) | H1 +$29.80, H2 +$4.22 (positive in both halves) |

For comparison, buy-and-hold scores +$32.17 on the same window and the best house momentum baseline +$34.94 — this bot matches them on an up day while carrying a trailing stop that limits the loss to about −$7 on a mirrored down day (stress test), versus −$39 for holding through it.

## How to run

The grader runs `node /bot/main.ts` (Node 22, type stripping). The bot speaks `agent-fun/bars-replay/v1` over NDJSON stdin/stdout through the vendored SDK shim (`vendor/makefun-bars.ts`, a byte-identical copy of the kit's `sdk/makefun-bars.ts`). No dependencies, no network, no clock, no randomness — fully deterministic.

## Files

- `main.ts` — the bot (strategy + wire loop via the shim).
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte-for-byte.
- `README.md` — this file.
- `LICENSE` — MIT.
