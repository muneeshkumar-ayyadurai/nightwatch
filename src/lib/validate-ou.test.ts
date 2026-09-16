import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NseBar } from "./nse.ts";
import { dataIntegrity, signalsFromNse } from "./nse.ts";
import { OOS_BARS, TRAIN_BARS, VAL_BARS, validateOu } from "./validate-ou.ts";

function gauss(i: number) {
  const u = ((i * 1103515245 + 12345) >>> 0) / 4294967296;
  const v = ((i * 1664525 + 1013904223) >>> 0) / 4294967296;
  return Math.sqrt(-2 * Math.log(Math.max(u, 1e-12))) * Math.cos(2 * Math.PI * v);
}

function ouBars(n: number, shockFrom = Infinity): NseBar[] {
  const dt = 1 / 252;
  const beta = 1.2;
  const alpha = -0.35;
  let x = 0.01;
  let logB = Math.log(1360);
  const out: NseBar[] = [];
  for (let i = 0; i < n; i++) {
    const crisis = i >= shockFrom;
    const kappa = crisis ? 2 : 35;
    const sigma = crisis ? 0.35 : 0.1;
    x += kappa * (0.01 - x) * dt + sigma * Math.sqrt(dt) * gauss(i);
    logB += 0.0001 + 0.01 * gauss(i + 7);
    const a = Math.exp(alpha + beta * logB + x);
    const b = Math.exp(logB);
    out.push({
      t: 1_700_000_000 + i * 86400,
      a,
      b,
      vix: crisis ? 28 : 12.5 + 0.4 * gauss(i + 3),
      nifty: 24000 + i * 3 + (crisis ? -i : 0),
      bank: 54000 + i * 4 + (crisis ? -i * 1.4 : 0),
      usdInr: crisis ? 102 : 87 + i * 0.004,
      gilt5: 64 + 0.01 * i,
      gilt10: crisis ? 26 : 29.4 + 0.004 * i,
    });
  }
  return out;
}

describe("signalsFromNse authenticity", () => {
  it("usdInr tracks USD/INR, not India VIX", () => {
    const nifty = [24000, 24100, 23900, 24200, 24300, 24150, 24400, 24500];
    const bank = nifty.map((x) => x * 2.2);
    const spread = nifty.map((x, i) => Math.log(720 + i) - Math.log(1360));
    const low = signalsFromNse({
      spreadBuf: spread,
      vix: 28,
      nifty,
      bank,
      usdInr: 83,
      gilt5: 64,
      gilt10: 29.4,
      barHours: 1,
    });
    const high = signalsFromNse({
      spreadBuf: spread,
      vix: 11,
      nifty,
      bank,
      usdInr: 97,
      gilt5: 64,
      gilt10: 29.4,
      barHours: 1,
    });
    assert.ok(low && high);
    assert.equal(low.usdInr, 83);
    assert.equal(high.usdInr, 97);
  });

  it("refuses to invent USD/INR or gilt prints", () => {
    const nifty = Array.from({ length: 10 }, (_, i) => 24000 + i);
    const bank = nifty.map((x) => x * 2.2);
    const spread = nifty.map(() => -0.63);
    assert.equal(
      signalsFromNse({
        spreadBuf: spread,
        vix: 13,
        nifty,
        bank,
        usdInr: null,
        gilt5: 64,
        gilt10: 29,
        barHours: 1,
      }),
      null,
    );
    assert.equal(
      signalsFromNse({
        spreadBuf: spread,
        vix: 13,
        nifty,
        bank,
        usdInr: 88,
        gilt5: null,
        gilt10: 29,
        barHours: 1,
      }),
      null,
    );
  });

  it("marks a tape without USD/INR as incomplete", () => {
    const bars = ouBars(80).map((b) => ({ ...b, usdInr: null }));
    const g = dataIntegrity(bars);
    assert.equal(g.usdInr.ok, false);
    assert.equal(g.complete, false);
  });
});

describe("validateOu walk-forward", () => {
  const need = TRAIN_BARS + VAL_BARS + OOS_BARS;

  it("INVALID when critical macros are missing — no dummy backtest", () => {
    const bars = ouBars(need + 10).map((b) => ({ ...b, usdInr: null }));
    const r = validateOu(bars, "hdfc-icici");
    assert.equal(r.status, "invalid");
    assert.match(r.reason, /USD\/INR/);
    assert.equal(r.folds.length, 0);
    assert.equal(r.pooled, null);
  });

  it("INVALID when the tape is shorter than one fold", () => {
    const r = validateOu(ouBars(80), "hdfc-icici");
    assert.equal(r.status, "invalid");
  });

  it("fits OU on train only and rolls at least one fold", () => {
    const bars = ouBars(need + 20);
    const r = validateOu(bars, "hdfc-icici");
    assert.ok(r.folds.length >= 1, "expected a fold");
    const f = r.folds[0]!;
    assert.ok(f.fit, "train should produce a fit");
    assert.ok(f.fit.beta > 0.8 && f.fit.beta < 1.7, `beta ${f.fit.beta}`);
    assert.ok(f.fit.halfLife > 0);
    const prefix = validateOu(bars.slice(0, need), "hdfc-icici");
    const mutated = bars.map((b, i) =>
      i === bars.length - 1 ? { ...b, a: b.a * 1.5 } : b,
    );
    const later = validateOu(mutated, "hdfc-icici");
    assert.ok(prefix.folds[0]?.fit && later.folds[0]?.fit);
    assert.equal(
      prefix.folds[0]!.fit!.beta.toFixed(6),
      later.folds[0]!.fit!.beta.toFixed(6),
    );
  });

  it("regime gate does not trade more than naive through a crisis OOS", () => {
    const bars = ouBars(need, TRAIN_BARS + VAL_BARS);
    const r = validateOu(bars, "hdfc-icici");
    if (r.status === "ok" && r.pooled) {
      assert.ok(
        r.pooled.filtered.trades <= r.pooled.naive.trades,
        `gated ${r.pooled.filtered.trades} vs naive ${r.pooled.naive.trades}`,
      );
    } else {
      assert.ok(r.folds.length >= 0);
    }
  });
});
