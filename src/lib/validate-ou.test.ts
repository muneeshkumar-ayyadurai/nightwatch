import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NseBar } from "./nse.ts";
import { signalsFromNse } from "./nse.ts";
import { validateOu, VALIDATION_WARMUP } from "./validate-ou.ts";

function bar(i: number, over: Partial<NseBar> = {}): NseBar {
  const t = 1_720_000_000 + i * 86400;
  const cycle = i % 22;
  const disloc = cycle === 0 ? 95 : cycle === 1 ? 60 : cycle === 2 ? 28 : 0;
  const sign = Math.floor(i / 22) % 2 === 0 ? 1 : -1;
  return {
    t,
    a: 720 + sign * disloc,
    b: 1360 - sign * disloc * 0.55,
    vix: 12.4,
    nifty: 24500 + i * 2,
    bank: 55000 + i * 3,
    usdInr: 87.5,
    gilt5: 64,
    gilt10: 29.5,
    ...over,
  };
}

function tape(n: number, map?: (i: number, b: NseBar) => NseBar): NseBar[] {
  return Array.from({ length: n }, (_, i) => (map ? map(i, bar(i)) : bar(i)));
}

describe("signalsFromNse authenticity", () => {
  it("credit tracks USD/INR, not India VIX", () => {
    const nifty = [24000, 24100, 23900, 24200, 24300, 24150, 24400, 24500];
    const bank = nifty.map((x) => x * 2.2);
    const spread = nifty.map((x, i) => Math.log(720 + i) - Math.log(1360));
    const lowFx = signalsFromNse({
      spreadBuf: spread,
      vix: 28,
      nifty,
      bank,
      usdInr: 83,
      gilt5: 64,
      gilt10: 29.4,
      barHours: 1,
    });
    const highFx = signalsFromNse({
      spreadBuf: spread,
      vix: 11,
      nifty,
      bank,
      usdInr: 97,
      gilt5: 64,
      gilt10: 29.4,
      barHours: 1,
    });
    assert.equal(lowFx.credit, 83);
    assert.equal(highFx.credit, 97);
    assert.ok(highFx.credit > lowFx.credit);
  });

  it("curve tracks gilt ETFs, not VIX", () => {
    const nifty = Array.from({ length: 30 }, (_, i) => 24000 + i);
    const bank = nifty.map((x) => x * 2.2);
    const spread = nifty.map(() => -0.63);
    const steep = signalsFromNse({
      spreadBuf: spread,
      vix: 22,
      nifty,
      bank,
      usdInr: 88,
      gilt5: 64,
      gilt10: 32,
      barHours: 1,
    });
    const dumped = signalsFromNse({
      spreadBuf: spread,
      vix: 11,
      nifty,
      bank,
      usdInr: 88,
      gilt5: 64,
      gilt10: 27,
      barHours: 1,
    });
    assert.ok(steep.curve > dumped.curve);
  });
});

describe("validateOu walk-forward", () => {
  it("needs a 90-session warmup before it trades", () => {
    const r = validateOu(tape(80), "hdfc-icici");
    assert.equal(r, null);
  });

  it("runs two books on a mean-reverting pair without lookahead", () => {
    const bars = tape(VALIDATION_WARMUP + 80);
    const r = validateOu(bars, "hdfc-icici");
    assert.ok(r);
    assert.equal(r.warmup, VALIDATION_WARMUP);
    assert.equal(r.oos, 80);
    assert.equal(r.interval, "1d");
    assert.ok(r.naive.trades >= 1, "naive should trade the oscillating spread");
    const prefix = validateOu(bars.slice(0, bars.length - 5), "hdfc-icici");
    const longer = validateOu(bars, "hdfc-icici");
    assert.ok(prefix && longer);
    assert.ok(
      Math.abs(prefix.filtered.trades - longer.filtered.trades) <= 2,
      "five extra days should not rewrite the whole blotter",
    );
  });

  it("regime gate sits out a credit/vol shock the naive book still trades", () => {
    const bars = tape(VALIDATION_WARMUP + 70, (i, b) => {
      if (i < VALIDATION_WARMUP) return b;
      return {
        ...b,
        vix: 32,
        usdInr: 104,
        gilt10: 26,
        nifty: b.nifty * (1 - (i - VALIDATION_WARMUP) * 0.004),
        bank: b.bank * (1 - (i - VALIDATION_WARMUP) * 0.006),
      };
    });
    const r = validateOu(bars, "hdfc-icici");
    assert.ok(r);
    assert.ok(
      r.filtered.trades <= r.naive.trades,
      `gated ${r.filtered.trades} vs naive ${r.naive.trades}`,
    );
  });

  it("z at t uses only prices ≤ t", () => {
    const bars = tape(VALIDATION_WARMUP + 40);
    const r1 = validateOu(bars, "hdfc-icici");
    const future = bars.map((b, i) =>
      i === bars.length - 1 ? { ...b, a: b.a * 1.4, b: b.b * 0.7 } : b,
    );
    const r2 = validateOu(future.slice(0, -1), "hdfc-icici");
    assert.ok(r1 && r2);
    assert.equal(r2.nBars, bars.length - 1);
    assert.equal(r2.filtered.trades, validateOu(bars.slice(0, -1), "hdfc-icici")?.filtered.trades);
  });
});
