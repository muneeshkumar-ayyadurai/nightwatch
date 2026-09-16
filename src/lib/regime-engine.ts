/** Six-signal, 90-session z-score classifier.

Raw observables in. Regime out. The India prior fills the window until
ninety real sessions exist so the first tape bar is already a z-score,
not a hardcoded threshold. */

export type RegimeId = "mean_reverting" | "trending" | "high_vol" | "crisis";

export type SignalKey =
  | "hurst"
  | "vixTerm"
  | "rvIv"
  | "correlation"
  | "credit"
  | "curve";

export interface Signals {
  hurst: number;
  vixTerm: number;
  rvIv: number;
  correlation: number;
  credit: number;
  curve: number;
}

export const SIGNAL_KEYS: SignalKey[] = [
  "hurst",
  "vixTerm",
  "rvIv",
  "correlation",
  "credit",
  "curve",
];

export const WINDOW_DAYS = 90;

/** India 2019–2024 cash-session prior. Used as the missing days in the 90-day window. */
export const INDIA_PRIOR_MEAN: Signals = {
  hurst: 0.43,
  vixTerm: 0.01,
  rvIv: -0.06,
  correlation: 0.7,
  credit: 88,
  curve: -0.78,
};

export const INDIA_PRIOR_STD: Signals = {
  hurst: 0.07,
  vixTerm: 0.05,
  rvIv: 0.2,
  correlation: 0.11,
  credit: 5,
  curve: 0.04,
};

const HOME: Signals = { ...INDIA_PRIOR_MEAN };

/** Loadings: how a +1σ move in each signal votes for each regime. */
export const LOADINGS: Record<RegimeId, Signals> = {
  mean_reverting: {
    hurst: -1.15,
    vixTerm: 0.55,
    rvIv: -0.55,
    correlation: -0.65,
    credit: -0.4,
    curve: 0.35,
  },
  trending: {
    hurst: 1.45,
    vixTerm: 0.1,
    rvIv: -0.25,
    correlation: 0.1,
    credit: -0.15,
    curve: 0.2,
  },
  high_vol: {
    hurst: 0.15,
    vixTerm: -0.85,
    rvIv: 1.35,
    correlation: 0.35,
    credit: 0.25,
    curve: -0.2,
  },
  crisis: {
    hurst: 0.12,
    vixTerm: -1.05,
    rvIv: 0.7,
    correlation: 1.05,
    credit: 1.2,
    curve: -0.9,
  },
};

const REGIME_IDS: RegimeId[] = [
  "mean_reverting",
  "trending",
  "high_vol",
  "crisis",
];

const HYSTERESIS = 0.32;
const CRISIS_HYSTERESIS = 0.12;

export interface EngineState {
  days: Signals[];
  lastDay: string | null;
  classified: RegimeId;
}

export interface RegimeSnapshot {
  raw: Signals;
  z: Signals;
  scores: Record<RegimeId, number>;
  regime: RegimeId;
  confidence: number;
  nObs: number;
  window: number;
}

export function emptySignals(): Signals {
  return { ...HOME };
}

export function emptyScores(): Record<RegimeId, number> {
  return {
    mean_reverting: 0,
    trending: 0,
    high_vol: 0,
    crisis: 0,
  };
}

export function createEngine(
  history: Signals[] = [],
  lastDay: string | null = null,
): EngineState {
  return {
    days: history.slice(-WINDOW_DAYS),
    lastDay,
    classified: "mean_reverting",
  };
}

export function istDayKey(tsMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsMs));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function moments(days: Signals[], key: SignalKey): { mean: number; std: number } {
  const n = days.length;
  const priorN = Math.max(0, WINDOW_DAYS - n);
  const mu0 = INDIA_PRIOR_MEAN[key];
  const sd0 = INDIA_PRIOR_STD[key];
  let sum = mu0 * priorN;
  let sumsq = (sd0 * sd0 + mu0 * mu0) * priorN;
  for (const d of days) {
    const x = d[key];
    sum += x;
    sumsq += x * x;
  }
  const denom = priorN + n || WINDOW_DAYS;
  const mean = sum / denom;
  const v = Math.max(1e-10, sumsq / denom - mean * mean);
  return { mean, std: Math.sqrt(v) };
}

export function zScores(days: Signals[], raw: Signals): Signals {
  const z = emptySignals();
  for (const key of SIGNAL_KEYS) {
    const { mean, std } = moments(days, key);
    z[key] = clamp((raw[key] - mean) / std, -4, 4);
  }
  return z;
}

function shrinkZ(z: number, dead = 0.45) {
  const a = Math.abs(z);
  if (a <= dead) return 0;
  return Math.sign(z) * (a - dead);
}

export function scoreZ(z: Signals): Record<RegimeId, number> {
  const scores = emptyScores();
  for (const id of REGIME_IDS) {
    let s = 0;
    const w = LOADINGS[id];
    for (const key of SIGNAL_KEYS) s += w[key] * shrinkZ(z[key]);
    scores[id] = s;
  }
  scores.mean_reverting += 0.75;
  return scores;
}

function pickRegime(
  scores: Record<RegimeId, number>,
  prev: RegimeId,
): { regime: RegimeId; confidence: number } {
  let top: RegimeId = "mean_reverting";
  let topV = -Infinity;
  let second = -Infinity;
  for (const id of REGIME_IDS) {
    const v = scores[id];
    if (v > topV) {
      second = topV;
      topV = v;
      top = id;
    } else if (v > second) {
      second = v;
    }
  }
  const gap = topV - (Number.isFinite(second) ? second : topV - 1);
  const confidence = clamp(gap / (Math.abs(topV) + 1.4), 0, 1);
  if (top === prev) return { regime: prev, confidence };
  if (prev === "mean_reverting" && topV < 0.85) {
    return { regime: prev, confidence: clamp(confidence * 0.5, 0, 1) };
  }
  const hurdle = top === "crisis" || prev === "crisis" ? CRISIS_HYSTERESIS : HYSTERESIS;
  if (topV > scores[prev] + hurdle) return { regime: top, confidence };
  return { regime: prev, confidence: clamp(confidence * 0.7, 0, 1) };
}

export function observe(
  engine: EngineState,
  raw: Signals,
  tsMs: number,
): { engine: EngineState; snap: RegimeSnapshot } {
  const day = istDayKey(tsMs);
  const days = engine.days.slice();
  if (days.length && engine.lastDay === day) {
    days[days.length - 1] = raw;
  } else {
    days.push(raw);
    if (days.length > WINDOW_DAYS) days.shift();
  }
  const z = zScores(days, raw);
  const scores = scoreZ(z);
  const { regime, confidence } = pickRegime(scores, engine.classified);
  const next: EngineState = { days, lastDay: day, classified: regime };
  return {
    engine: next,
    snap: {
      raw,
      z,
      scores,
      regime,
      confidence,
      nObs: days.length,
      window: WINDOW_DAYS,
    },
  };
}

export function cloneEngine(engine: EngineState): EngineState {
  return {
    days: engine.days.map((d) => ({ ...d })),
    lastDay: engine.lastDay,
    classified: engine.classified,
  };
}
