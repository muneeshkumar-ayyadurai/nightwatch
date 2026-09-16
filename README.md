# Nightwatch

Paper trading desk with regime intelligence. The product is not a better strategy — it is the weather report that tells you when the current one is about to stop working.

**Paper is live. Live capital is a waitlist.**

## Product

- Marketing site with a live paper tape
- Desk: KO/PEP Ornstein–Uhlenbeck, regime book vs always-on control
- Six-signal classifier (Hurst, VIX term, RV−IV, correlation, credit, curve)
- Risk: Kelly blend, drawdown cap, daily-loss cap, flatten-on-crisis, kill switch
- Method: the rules the desk is held to

Simulated market. Not a broker. Not advice.

## Run

```bash
npm install
npm run dev
```

Open the app on port 8080. `npm run build` and `npm run typecheck` before you ship.
