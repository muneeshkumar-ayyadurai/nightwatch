import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INDIA_PRIOR_MEAN,
  WINDOW_DAYS,
  createEngine,
  observe,
  scoreZ,
  zScores,
  type Signals,
} from "./regime-engine.ts";

const DAY = 86_400_000;
const T0 = Date.parse("2026-06-01T10:00:00+05:30");

function raw(over: Partial<Signals> = {}): Signals {
  return { ...INDIA_PRIOR_MEAN, ...over };
}

function run(over: Partial<Signals>, n = 8) {
  let engine = createEngine();
  let snap = observe(engine, raw(), T0).snap;
  engine = observe(engine, raw(), T0).engine;
  for (let i = 1; i <= n; i++) {
    const step = observe(engine, raw(over), T0 + i * DAY);
    engine = step.engine;
    snap = step.snap;
  }
  return snap;
}

describe("regime-engine 90-day z-score", () => {
  it("scores a prior-like print as mean-reverting", () => {
    const snap = observe(createEngine(), raw(), T0).snap;
    assert.equal(snap.regime, "mean_reverting");
    assert.equal(snap.window, WINDOW_DAYS);
    for (const k of Object.keys(snap.z) as (keyof Signals)[]) {
      assert.ok(Math.abs(snap.z[k]) < 0.6, `${k} z=${snap.z[k]}`);
    }
  });

  it("classifies a credit/corr/VIX spike as crisis", () => {
    const snap = run({
      hurst: 0.57,
      vixTerm: -0.18,
      rvIv: 0.85,
      correlation: 0.95,
      credit: 104,
      curve: -0.94,
    });
    assert.equal(snap.regime, "crisis");
    assert.ok(snap.scores.crisis > snap.scores.mean_reverting);
    assert.ok(snap.z.credit > 2);
    assert.ok(snap.z.vixTerm < -2);
  });

  it("classifies elevated Hurst as trending", () => {
    const snap = run({ hurst: 0.68, vixTerm: 0.3, rvIv: -0.04, correlation: 0.66 });
    assert.equal(snap.regime, "trending");
    assert.ok(snap.z.hurst > 2);
  });

  it("classifies realized-over-implied as high vol", () => {
    const snap = run({
      hurst: 0.48,
      vixTerm: -0.12,
      rvIv: 0.72,
      correlation: 0.74,
      credit: 90,
    });
    assert.equal(snap.regime, "high_vol");
    assert.ok(snap.z.rvIv > 2);
  });

  it("caps the window at 90 sessions", () => {
    let engine = createEngine();
    for (let i = 0; i < 120; i++) {
      engine = observe(engine, raw({ hurst: 0.4 + (i % 5) * 0.01 }), T0 + i * DAY).engine;
    }
    assert.equal(engine.days.length, WINDOW_DAYS);
  });

  it("replaces the same IST day instead of growing the window", () => {
    let engine = createEngine();
    engine = observe(engine, raw({ credit: 90 }), T0).engine;
    engine = observe(engine, raw({ credit: 140 }), T0 + 3_600_000).engine;
    assert.equal(engine.days.length, 1);
    assert.equal(engine.days[0]?.credit, 140);
  });

  it("hysteresis does not flip on a one-tick wiggle", () => {
    let engine = createEngine();
    let snap = observe(engine, raw(), T0).snap;
    engine = observe(engine, raw(), T0).engine;
    for (let i = 1; i <= 6; i++) {
      const step = observe(
        engine,
        raw({ hurst: 0.45, rvIv: -0.02, vixTerm: 0.3 }),
        T0 + i * DAY,
      );
      engine = step.engine;
      snap = step.snap;
    }
    assert.equal(snap.regime, "mean_reverting");
  });

  it("z-score of the prior mean is near zero even with an empty window", () => {
    const z = zScores([], INDIA_PRIOR_MEAN);
    for (const k of Object.keys(z) as (keyof Signals)[]) {
      assert.ok(Math.abs(z[k]) < 1e-6, `${k}=${z[k]}`);
    }
    const scores = scoreZ(z);
    assert.ok(scores.mean_reverting > scores.crisis);
    assert.ok(scores.mean_reverting > scores.trending);
  });
});
