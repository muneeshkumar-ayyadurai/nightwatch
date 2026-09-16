import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calibrateOu, fitPairOu, isTradable, ouZ, residual } from "./ou.ts";

function gauss(i: number) {
  const u = ((i * 1103515245 + 12345) >>> 0) / 4294967296;
  const v = ((i * 1664525 + 1013904223) >>> 0) / 4294967296;
  return Math.sqrt(-2 * Math.log(Math.max(u, 1e-12))) * Math.cos(2 * Math.PI * v);
}

describe("OU calibration", () => {
  it("recovers hedge β and a fast half-life on a synthetic OU pair", () => {
    const dt = 1 / 252;
    const beta = 1.25;
    const alpha = -0.4;
    const kappa = 40;
    const theta = 0.02;
    const sigma = 0.12;
    const n = 400;
    const a: number[] = [];
    const b: number[] = [];
    let x = theta;
    let logB = Math.log(1360);
    for (let i = 0; i < n; i++) {
      x += kappa * (theta - x) * dt + sigma * Math.sqrt(dt) * gauss(i);
      logB += 0.00015 + 0.012 * gauss(i + 99);
      const logA = alpha + beta * logB + x;
      a.push(Math.exp(logA));
      b.push(Math.exp(logB));
    }
    const fit = fitPairOu(a, b, dt);
    assert.ok(fit, "fit should succeed");
    assert.ok(Math.abs(fit.beta - beta) < 0.15, `beta ${fit.beta}`);
    assert.ok(fit.halfLife > 1 && fit.halfLife < 12, `hl ${fit.halfLife}`);
    assert.ok(fit.r2 > 0.9, `r2 ${fit.r2}`);
    assert.ok(isTradable(fit));
    const xLast = residual(
      a.map(Math.log),
      b.map(Math.log),
      fit.alpha,
      fit.beta,
    ).at(-1)!;
    const z = ouZ(xLast, fit);
    assert.ok(Number.isFinite(z));
  });

  it("rejects a random walk (no mean reversion)", () => {
    const x: number[] = [0];
    for (let i = 1; i < 200; i++) x.push(x[i - 1]! + 0.02 * gauss(i));
    const ou = calibrateOu(x, 1 / 252);
    assert.equal(ou, null);
  });
});
