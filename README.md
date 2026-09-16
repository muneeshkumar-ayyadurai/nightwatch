# Nightwatch

A paper trading desk with **regime intelligence**. Same Ornstein–Uhlenbeck KO/PEP book, two ledgers: one gated by a six-signal classifier, one always-on.

The point of the desk is not a better strategy. It is the weather report that tells you when the current one is about to stop working.

## What’s on the desk

- Live simulated KO/PEP statistical-arbitrage tape
- Six regime gauges: Hurst, VIX term, realized vs implied, cross-asset correlation, credit spreads, rates curve
- Classifier: mean-reverting / trending / high-vol / crisis
- Regime book vs always-on OU equity overlay
- Kelly sizing, drawdown cap, daily-loss cap, kill switch
- Locked Phase-6 engines: Avellaneda–Stoikov, Hawkes, Heston

Simulated paper market. Not a broker. Not advice.

## Run it

```bash
npm install
npm run dev
```

Then open the app on port 8080.

```bash
npm run build
npm run typecheck
```
