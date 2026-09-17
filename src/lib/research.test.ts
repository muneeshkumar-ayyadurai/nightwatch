import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankUniverse, scorePair } from "./research.ts";
import type { ValidationReport } from "./validate-ou.ts";

function emptyStats() {
  return {
    equity: 1_000_000,
    pnl: 0,
    cagr: null as number | null,
    sharpe: null as number | null,
    maxDd: 0,
    downsideVol: null as number | null,
    winRate: null as number | null,
    trades: 0,
    wins: 0,
    timeIn: 0,
    turnover: 0,
    tailLoss: null as number | null,
  };
}

function emptySlice() {
  return { bars: 0, naive: emptyStats(), filtered: emptyStats() };
}

function byRegime() {
  return {
    mean_reverting: emptySlice(),
    trending: emptySlice(),
    high_vol: emptySlice(),
    crisis: emptySlice(),
  };
}

function fit(over: { beta: number; halfLife: number; r2: number }) {
  return {
    beta: over.beta,
    alpha: 0,
    kappa: Math.LN2 / (over.halfLife / 252),
    theta: 0,
    sigma: 0.1,
    phi: 0.8,
    halfLife: over.halfLife,
    eqStd: 0.01,
    r2: over.r2,
    n: 126,
  };
}

function report(
  pairId: string,
  folds: {
    selected: boolean;
    beta: number;
    hl: number;
    r2: number;
    oosF: number;
    oosN: number;
    fTrades: number;
    nTrades: number;
  }[],
  pooledPnl?: { f: number; n: number; fTrades: number; nTrades: number },
): ValidationReport {
  const tradable = folds.filter((f) => f.r2 >= 0.35 && f.hl >= 1 && f.hl <= 40);
  const betas = tradable.map((f) => f.beta);
  const hls = tradable.map((f) => f.hl);
  const r2s = tradable.map((f) => f.r2);
  const mom = (xs: number[]) => {
    if (!xs.length) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v =
      xs.length > 1
        ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)
        : 0;
    return { n: xs.length, mean, std: Math.sqrt(v), min: Math.min(...xs), max: Math.max(...xs) };
  };
  const selected = folds.filter((f) => f.selected).length;
  const fStats = {
    ...emptyStats(),
    pnl: pooledPnl?.f ?? 0,
    trades: pooledPnl?.fTrades ?? 0,
    maxDd: 0.01,
  };
  const nStats = {
    ...emptyStats(),
    pnl: pooledPnl?.n ?? 0,
    trades: pooledPnl?.nTrades ?? 0,
    maxDd: 0.02,
  };
  return {
    status: selected > 0 ? "ok" : "invalid",
    reason: selected > 0 ? `${selected} selected` : "none",
    pairId,
    from: 1,
    to: 2,
    nBars: 500,
    interval: "1d",
    source: "yahoo",
    integrity: {
      pair: { n: 500, present: 500, ok: true },
      vix: { n: 500, present: 500, ok: true },
      nifty: { n: 500, present: 500, ok: true },
      bank: { n: 500, present: 500, ok: true },
      usdInr: { n: 500, present: 500, ok: true },
      gilt: { n: 500, present: 500, ok: true },
      complete: true,
      notes: [],
    },
    folds: folds.map((f, i) => ({
      i: i + 1,
      trainFrom: 1,
      trainTo: 2,
      valFrom: 3,
      valTo: 4,
      oosFrom: 5,
      oosTo: 6,
      fit: fit({ beta: f.beta, halfLife: f.hl, r2: f.r2 }),
      selected: f.selected,
      reason: f.selected ? "selected" : "no",
      validate: { naive: emptyStats(), filtered: emptyStats() },
      oos: {
        naive: { ...emptyStats(), pnl: f.oosN, trades: f.nTrades },
        filtered: { ...emptyStats(), pnl: f.oosF, trades: f.fTrades },
        byRegime: byRegime(),
      },
    })),
    selectedFolds: selected,
    stability: {
      beta: mom(betas),
      halfLife: mom(hls),
      kappa: mom(hls.map((h) => 252 * Math.LN2 / h)),
      r2: mom(r2s),
    },
    pooled:
      selected > 0 && pooledPnl
        ? {
            naive: nStats,
            filtered: fStats,
            edge: fStats.pnl - nStats.pnl,
            byRegime: byRegime(),
          }
        : null,
    lastFit: null,
    lastRegime: "mean_reverting",
    engineN: 90,
  };
}

describe("pair research score", () => {
  it("does not pick the highest-return pair", () => {
    const lottery = report(
      "rel-ongc",
      [
        { selected: true, beta: 0.7, hl: 6, r2: 0.8, oosF: 80_000, oosN: 10_000, fTrades: 1, nTrades: 1 },
        { selected: false, beta: 0.2, hl: 60, r2: 0.05, oosF: 0, oosN: 0, fTrades: 0, nTrades: 0 },
        { selected: false, beta: 0.9, hl: 50, r2: 0.1, oosF: 0, oosN: 0, fTrades: 0, nTrades: 0 },
      ],
      { f: 80_000, n: 10_000, fTrades: 1, nTrades: 1 },
    );
    const stable = report(
      "hdfc-icici",
      [
        { selected: true, beta: 1.01, hl: 3, r2: 0.7, oosF: -2000, oosN: -3000, fTrades: 2, nTrades: 3 },
        { selected: true, beta: 0.95, hl: 3.2, r2: 0.88, oosF: -1500, oosN: -1800, fTrades: 2, nTrades: 2 },
        { selected: true, beta: 0.99, hl: 2.8, r2: 0.8, oosF: 500, oosN: -400, fTrades: 1, nTrades: 2 },
      ],
      { f: -3000, n: -5200, fTrades: 5, nTrades: 7 },
    );
    const uni = rankUniverse([lottery, stable]);
    assert.equal(uni.cards[0]!.pairId, "hdfc-icici");
    assert.equal(scorePair(stable).pairVerdict, "survive");
    assert.notEqual(scorePair(lottery).pairVerdict, "survive");
    assert.ok(scorePair(lottery).report.pooled!.filtered.pnl > scorePair(stable).report.pooled!.filtered.pnl);
  });

  it("rejects a pair with no selected fold", () => {
    const r = scorePair(
      report("hul-itc", [
        { selected: false, beta: 1.2, hl: 11, r2: 0.7, oosF: 0, oosN: 0, fTrades: 0, nTrades: 0 },
        { selected: false, beta: -0.6, hl: 20, r2: 0.05, oosF: 0, oosN: 0, fTrades: 0, nTrades: 0 },
      ]),
    );
    assert.equal(r.pairVerdict, "reject");
    assert.equal(r.regimeVerdict, "n/a");
  });

  it("marks a stable pair with thin OOS as watch, not survive", () => {
    const r = scorePair(
      report(
        "hdfc-icici",
        [
          { selected: true, beta: 1.01, hl: 2.9, r2: 0.67, oosF: 0, oosN: 0, fTrades: 0, nTrades: 0 },
          { selected: true, beta: 0.9, hl: 2.7, r2: 0.94, oosF: -4000, oosN: -5800, fTrades: 2, nTrades: 3 },
        ],
        { f: -4000, n: -5800, fTrades: 2, nTrades: 3 },
      ),
    );
    assert.equal(r.pairVerdict, "watch");
    assert.equal(r.regimeVerdict, "unclear");
  });
});
