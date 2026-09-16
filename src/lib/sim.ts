export type RegimeId = "mean_reverting" | "trending" | "high_vol" | "crisis";
export type Side = "long_spread" | "short_spread";
export type CloseReason = "target" | "stop" | "time" | "regime" | "kill" | "risk";
export type Mode = "shadow" | "paper" | "live";
export type AlertLevel = "info" | "warn" | "crit";

export const REGIME_ORDER: RegimeId[] = [
  "mean_reverting",
  "trending",
  "high_vol",
  "crisis",
];

export const REGIME_META: Record<
  RegimeId,
  { label: string; short: string; blurb: string }
> = {
  mean_reverting: {
    label: "Mean-reverting",
    short: "Mean-rev",
    blurb: "Hurst below 0.5. Spread snaps back. OU is in its home regime.",
  },
  trending: {
    label: "Trending",
    short: "Trend",
    blurb: "Hurst elevated. Residual is a drift, not a rubber band.",
  },
  high_vol: {
    label: "High volatility",
    short: "High vol",
    blurb: "Realized vol overruns implied. Size down or stand aside.",
  },
  crisis: {
    label: "Crisis",
    short: "Crisis",
    blurb: "Credit, correlation, and vol term structure all scream. Flatten.",
  },
};

export const PAIR = {
  a: { symbol: "KO", name: "Coca-Cola" },
  b: { symbol: "PEP", name: "PepsiCo" },
} as const;

export const INITIAL_EQUITY = 100_000;
export const Z_ENTRY = 1.75;
export const Z_EXIT = 0.4;
export const Z_STOP = 4.2;
export const MAX_HOLD_HOURS = 48;
export const SPREAD_WINDOW = 90;
export const HISTORY_CAP = 360;
export const BOOTSTRAP_HOURS = 168;

export interface Signals {
  hurst: number;
  vixTerm: number;
  rvIv: number;
  correlation: number;
  credit: number;
  curve: number;
}

export interface Position {
  side: Side;
  notional: number;
  koShares: number;
  pepShares: number;
  koEntry: number;
  pepEntry: number;
  zEntry: number;
  openedAt: number;
}

export interface ClosedTrade {
  id: number;
  side: Side;
  openedAt: number;
  closedAt: number;
  pnl: number;
  zEntry: number;
  reason: CloseReason;
}

export interface Book {
  id: "filtered" | "naive";
  realized: number;
  peak: number;
  dayStart: number;
  dayHour: number;
  paused: boolean;
  position: Position | null;
  trades: ClosedTrade[];
  lastExit: number;
}

export interface Alert {
  id: number;
  hour: number;
  level: AlertLevel;
  title: string;
  body: string;
}

export interface Point {
  t: number;
  ko: number;
  pep: number;
  spread: number;
  z: number;
  filtered: number;
  naive: number;
  regime: RegimeId;
}

export interface SimState {
  hour: number;
  seed: number;
  n: number;
  ko: number;
  pep: number;
  spread: number;
  z: number;
  spreadMean: number;
  spreadStd: number;
  spreadBuf: number[];
  signals: Signals;
  latent: RegimeId;
  regime: RegimeId;
  latentLeft: number;
  forceRegime: RegimeId | null;
  filterOn: boolean;
  killed: boolean;
  killReason: string | null;
  mode: Mode;
  running: boolean;
  speed: number;
  kellyBlend: number;
  maxDd: number;
  dailyLoss: number;
  autoFlattenCrisis: boolean;
  history: Point[];
  alerts: Alert[];
  filtered: Book;
  naive: Book;
  nextId: number;
  lastRegime: RegimeId;
}

const TARGETS: Record<RegimeId, Signals> = {
  mean_reverting: {
    hurst: 0.37,
    vixTerm: 0.82,
    rvIv: -0.18,
    correlation: 0.22,
    credit: 318,
    curve: 0.48,
  },
  trending: {
    hurst: 0.64,
    vixTerm: 0.28,
    rvIv: 0.12,
    correlation: 0.48,
    credit: 372,
    curve: 0.12,
  },
  high_vol: {
    hurst: 0.51,
    vixTerm: -0.42,
    rvIv: 0.62,
    correlation: 0.66,
    credit: 528,
    curve: -0.08,
  },
  crisis: {
    hurst: 0.58,
    vixTerm: -1.18,
    rvIv: 1.35,
    correlation: 0.93,
    credit: 912,
    curve: -0.62,
  },
};

function mulberry(seed: number, n: number): number {
  let a = (seed + Math.imul(n, 0x9e3779b9)) >>> 0;
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rng(s: SimState): number {
  const u = mulberry(s.seed, s.n);
  s.n += 1;
  return u;
}

function gauss(s: SimState): number {
  const u = Math.max(1e-12, rng(s));
  const v = rng(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function emptyBook(id: Book["id"]): Book {
  return {
    id,
    realized: INITIAL_EQUITY,
    peak: INITIAL_EQUITY,
    dayStart: INITIAL_EQUITY,
    dayHour: 0,
    paused: false,
    position: null,
    trades: [],
    lastExit: -99,
  };
}

function emptySignals(): Signals {
  return { ...TARGETS.mean_reverting };
}

export function classify(sig: Signals): RegimeId {
  if (sig.credit > 720 || sig.correlation > 0.86 || sig.vixTerm < -0.85) {
    return "crisis";
  }
  if (sig.rvIv > 0.48 || sig.vixTerm < -0.18) return "high_vol";
  if (sig.hurst > 0.55) return "trending";
  return "mean_reverting";
}

function durationFor(s: SimState, regime: RegimeId): number {
  const span =
    regime === "crisis"
      ? [8, 16]
      : regime === "high_vol"
        ? [14, 32]
        : regime === "trending"
          ? [22, 54]
          : [36, 80];
  return Math.floor(span[0] + rng(s) * (span[1] - span[0]));
}

function pickNext(s: SimState, from: RegimeId): RegimeId {
  const roll = rng(s);
  if (from === "crisis") {
    return roll < 0.55 ? "high_vol" : "mean_reverting";
  }
  if (from === "high_vol") {
    if (roll < 0.18) return "crisis";
    if (roll < 0.5) return "trending";
    return "mean_reverting";
  }
  if (from === "trending") {
    if (roll < 0.12) return "crisis";
    if (roll < 0.4) return "high_vol";
    return "mean_reverting";
  }
  if (roll < 0.08) return "crisis";
  if (roll < 0.28) return "high_vol";
  if (roll < 0.55) return "trending";
  return "mean_reverting";
}

function zscore(buf: number[]) {
  const n = buf.length;
  const last = buf[n - 1] ?? 0;
  let mean = 0;
  for (const x of buf) mean += x;
  mean /= n;
  let v = 0;
  for (const x of buf) v += (x - mean) ** 2;
  const std = Math.sqrt(v / Math.max(1, n - 1)) || 1e-6;
  return { mean, std, z: (last - mean) / std };
}

function mtm(pos: Position, ko: number, pep: number): number {
  const a = pos.koShares * (ko - pos.koEntry);
  const b = pos.pepShares * (pep - pos.pepEntry);
  return pos.side === "long_spread" ? a - b : b - a;
}

export function equityOf(book: Book, ko: number, pep: number): number {
  return book.realized + (book.position ? mtm(book.position, ko, pep) : 0);
}

function kelly(book: Book, blend: number): number {
  const recent = book.trades.slice(-20);
  if (recent.length < 8) return 0.07 * blend;
  const wins = recent.filter((t) => t.pnl > 0);
  const losses = recent.filter((t) => t.pnl <= 0);
  const p = wins.length / recent.length;
  if (losses.length === 0) return 0.12 * blend;
  const avgW =
    wins.reduce((a, t) => a + t.pnl, 0) / Math.max(1, wins.length);
  const avgL = Math.abs(
    losses.reduce((a, t) => a + t.pnl, 0) / losses.length,
  );
  const b = avgW / Math.max(1, avgL);
  const f = p - (1 - p) / b;
  return clamp(f, 0, 0.18) * blend;
}

function pushAlert(
  s: SimState,
  level: AlertLevel,
  title: string,
  body: string,
) {
  s.alerts.push({
    id: s.nextId++,
    hour: s.hour,
    level,
    title,
    body,
  });
  if (s.alerts.length > 36) s.alerts.splice(0, s.alerts.length - 36);
}

function closePos(s: SimState, book: Book, reason: CloseReason) {
  const pos = book.position;
  if (!pos) return;
  const pnl = mtm(pos, s.ko, s.pep);
  book.realized += pnl;
  book.trades.push({
    id: s.nextId++,
    side: pos.side,
    openedAt: pos.openedAt,
    closedAt: s.hour,
    pnl,
    zEntry: pos.zEntry,
    reason,
  });
  if (book.trades.length > 60) book.trades.splice(0, book.trades.length - 60);
  book.position = null;
  book.lastExit = s.hour;
  const who = book.id === "filtered" ? "Regime book" : "Naive book";
  const verb =
    reason === "kill"
      ? "Kill switch flattened"
      : reason === "regime"
        ? "Regime filter flattened"
        : reason === "stop"
          ? "Stop hit"
          : reason === "risk"
            ? "Risk limit flattened"
            : reason === "time"
              ? "Time stop"
              : "Target hit";
  pushAlert(
    s,
    pnl < -400 || reason === "kill" || reason === "regime" ? "warn" : "info",
    `${who}: ${verb}`,
    `${pos.side === "long_spread" ? "Long" : "Short"} KO/PEP  ·  ${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(0)}`,
  );
}

function maybeEnter(s: SimState, book: Book, allow: boolean) {
  if (!allow || book.paused || book.position) return;
  if (s.hour - book.lastExit < 3) return;
  if (Math.abs(s.z) < Z_ENTRY) return;
  if (Math.abs(s.z) > Z_STOP - 0.2) return;
  const eq = equityOf(book, s.ko, s.pep);
  const k = Math.max(kelly(book, s.kellyBlend), 0.14);
  const notional = clamp(k * eq, 22_000, eq * 0.28);
  const side: Side = s.z > 0 ? "short_spread" : "long_spread";
  book.position = {
    side,
    notional,
    koShares: notional / s.ko,
    pepShares: notional / s.pep,
    koEntry: s.ko,
    pepEntry: s.pep,
    zEntry: s.z,
    openedAt: s.hour,
  };
  const who = book.id === "filtered" ? "Regime book" : "Naive book";
  pushAlert(
    s,
    "info",
    `${who}: ${side === "long_spread" ? "Long" : "Short"} spread`,
    `z ${s.z.toFixed(2)}  ·  ${usdShort(notional)} notional`,
  );
}

function usdShort(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function manage(s: SimState, book: Book, filter: boolean) {
  const eq = equityOf(book, s.ko, s.pep);
  book.peak = Math.max(book.peak, eq);

  if (s.hour - book.dayHour >= 24) {
    book.dayStart = eq;
    book.dayHour = s.hour;
  }

  if (s.killed) {
    if (book.position) closePos(s, book, "kill");
    return;
  }

  if (filter && s.autoFlattenCrisis && s.regime === "crisis" && book.position) {
    closePos(s, book, "regime");
  }

  const dd = 1 - eq / book.peak;
  const dayLoss = 1 - eq / book.dayStart;
  if (filter && (dd >= s.maxDd || dayLoss >= s.dailyLoss)) {
    if (book.position) closePos(s, book, "risk");
    if (!book.paused) {
      book.paused = true;
      pushAlert(
        s,
        "crit",
        "Risk pause on regime book",
        dd >= s.maxDd
          ? `Max drawdown ${Math.round(dd * 100)}% hit the ${Math.round(s.maxDd * 100)}% cap.`
          : `Day loss ${Math.round(dayLoss * 100)}% hit the ${Math.round(s.dailyLoss * 100)}% cap.`,
      );
    }
    return;
  }

  const pos = book.position;
  if (pos) {
    const held = s.hour - pos.openedAt;
    const adverse =
      (pos.side === "short_spread" && s.z > Z_STOP) ||
      (pos.side === "long_spread" && s.z < -Z_STOP);
    const target =
      (pos.side === "short_spread" && s.z < Z_EXIT) ||
      (pos.side === "long_spread" && s.z > -Z_EXIT);
    if (adverse) closePos(s, book, "stop");
    else if (target) closePos(s, book, "target");
    else if (held >= MAX_HOLD_HOURS) closePos(s, book, "time");
  }

  const canEnter =
    !book.paused &&
    (!filter || (s.filterOn ? s.regime === "mean_reverting" : true));
  maybeEnter(s, book, canEnter);
}

function lerpSignals(s: SimState) {
  const target = TARGETS[s.latent];
  const a = s.forceRegime ? 0.42 : 0.16;
  const noise = s.latent === "crisis" ? 0.15 : 0.45;
  const n = (k: number) => gauss(s) * k * noise;
  s.signals = {
    hurst: clamp(
      s.signals.hurst + a * (target.hurst - s.signals.hurst) + n(0.02),
      0.2,
      0.85,
    ),
    vixTerm: s.signals.vixTerm + a * (target.vixTerm - s.signals.vixTerm) + n(0.08),
    rvIv: s.signals.rvIv + a * (target.rvIv - s.signals.rvIv) + n(0.06),
    correlation: clamp(
      s.signals.correlation +
        a * (target.correlation - s.signals.correlation) +
        n(0.03),
      0.05,
      0.99,
    ),
    credit: clamp(
      s.signals.credit + a * (target.credit - s.signals.credit) + n(8),
      180,
      1400,
    ),
    curve: s.signals.curve + a * (target.curve - s.signals.curve) + n(0.03),
  };
}

function stepPrices(s: SimState) {
  const regime = s.latent;
  const vol =
    regime === "crisis" ? 0.022 : regime === "high_vol" ? 0.013 : 0.0055;
  const rho =
    regime === "crisis" ? 0.94 : regime === "high_vol" ? 0.72 : 0.42;
  const drift =
    regime === "crisis" ? -0.005 : regime === "trending" ? 0.0012 : 0.00012;
  const kappa =
    regime === "mean_reverting" ? 0.2 : regime === "trending" ? 0 : 0.03;
  const z1 = gauss(s);
  const z2 = rho * z1 + Math.sqrt(Math.max(0, 1 - rho * rho)) * gauss(s);
  s.pep *= Math.exp(drift + vol * z2);
  s.ko *= Math.exp(drift * 0.9 + vol * 0.95 * z1);
  if (regime === "crisis") {
    s.ko *= Math.exp(-0.0018 + 0.004 * gauss(s));
  }
  let spread = Math.log(s.ko) - Math.log(s.pep);
  const mu = Math.log(64.4) - Math.log(171.6);
  const shock = regime === "crisis" ? 0.018 * gauss(s) : 0;
  const trendPush =
    regime === "trending" ? 0.0048 * Math.sign(spread - mu || 1) : 0;
  spread += kappa * (mu - spread) + shock + trendPush;
  s.ko = Math.exp(spread + Math.log(s.pep));
  s.spread = spread;
  s.spreadBuf.push(spread);
  if (s.spreadBuf.length > SPREAD_WINDOW) s.spreadBuf.shift();
  const zs = zscore(s.spreadBuf);
  s.spreadMean = zs.mean;
  s.spreadStd = zs.std;
  s.z = zs.z;
}

export function tick(state: SimState): SimState {
  const s: SimState = {
    ...state,
    signals: { ...state.signals },
    spreadBuf: state.spreadBuf.slice(),
    history: state.history.slice(),
    alerts: state.alerts.slice(),
    filtered: {
      ...state.filtered,
      trades: state.filtered.trades.slice(),
      position: state.filtered.position ? { ...state.filtered.position } : null,
    },
    naive: {
      ...state.naive,
      trades: state.naive.trades.slice(),
      position: state.naive.position ? { ...state.naive.position } : null,
    },
  };

  const prevLatent = s.latent;
  if (s.forceRegime) {
    s.latent = s.forceRegime;
    s.latentLeft = 24;
  } else {
    s.latentLeft -= 1;
    if (s.latentLeft <= 0) {
      s.latent = pickNext(s, s.latent);
      s.latentLeft = durationFor(s, s.latent);
    }
  }

  if (s.latent !== prevLatent) {
    if (s.latent === "crisis") s.ko *= 1.02;
    if (s.latent === "trending") s.ko *= 1.016;
    if (s.latent === "high_vol") s.ko *= 1.008;
  }

  lerpSignals(s);
  s.regime = classify(s.signals);

  if (s.regime !== s.lastRegime) {
    pushAlert(
      s,
      s.regime === "crisis" ? "crit" : s.regime === "high_vol" ? "warn" : "info",
      `Regime → ${REGIME_META[s.regime].label}`,
      REGIME_META[s.regime].blurb,
    );
    s.lastRegime = s.regime;
  }

  stepPrices(s);
  s.hour += 1;

  manage(s, s.filtered, true);
  manage(s, s.naive, false);

  s.history.push({
    t: s.hour,
    ko: s.ko,
    pep: s.pep,
    spread: s.spread,
    z: s.z,
    filtered: equityOf(s.filtered, s.ko, s.pep),
    naive: equityOf(s.naive, s.ko, s.pep),
    regime: s.regime,
  });
  if (s.history.length > HISTORY_CAP) s.history.shift();

  return s;
}

export function createInitialState(seed = 2026): SimState {
  let s: SimState = {
    hour: 0,
    seed,
    n: 0,
    ko: 64.42,
    pep: 171.58,
    spread: Math.log(64.42) - Math.log(171.58),
    z: 0,
    spreadMean: 0,
    spreadStd: 0.01,
    spreadBuf: [],
    signals: emptySignals(),
    latent: "mean_reverting",
    regime: "mean_reverting",
    latentLeft: 44,
    forceRegime: null,
    filterOn: true,
    killed: false,
    killReason: null,
    mode: "paper",
    running: true,
    speed: 1,
    kellyBlend: 0.7,
    maxDd: 0.08,
    dailyLoss: 0.03,
    autoFlattenCrisis: true,
    history: [],
    alerts: [],
    filtered: emptyBook("filtered"),
    naive: emptyBook("naive"),
    nextId: 1,
    lastRegime: "mean_reverting",
  };
  const script: { hours: number; force: RegimeId | null }[] = [
    { hours: 36, force: "mean_reverting" },
    { hours: 28, force: "trending" },
    { hours: 18, force: "mean_reverting" },
    { hours: 16, force: "crisis" },
    { hours: 22, force: "high_vol" },
    { hours: 48, force: "mean_reverting" },
  ];
  for (const chapter of script) {
    s.forceRegime = chapter.force;
    for (let i = 0; i < chapter.hours; i++) s = tick(s);
  }
  s.forceRegime = null;
  s.alerts = s.alerts.slice(-6);
  return s;
}

export function maxDrawdown(series: number[]): number {
  let peak = series[0] ?? INITIAL_EQUITY;
  let max = 0;
  for (const x of series) {
    peak = Math.max(peak, x);
    max = Math.max(max, 1 - x / peak);
  }
  return max;
}

export function simSharpe(history: Point[], key: "filtered" | "naive"): number | null {
  if (history.length < 48) return null;
  const daily: number[] = [];
  for (let i = 24; i < history.length; i += 24) {
    const prev = history[i - 24]![key];
    const cur = history[i]![key];
    daily.push(cur / prev - 1);
  }
  if (daily.length < 3) return null;
  const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
  let v = 0;
  for (const r of daily) v += (r - mean) ** 2;
  const std = Math.sqrt(v / Math.max(1, daily.length - 1));
  if (std < 1e-8) return null;
  return (mean / std) * Math.sqrt(252);
}

export function winRate(book: Book): number | null {
  if (book.trades.length < 4) return null;
  return book.trades.filter((t) => t.pnl > 0).length / book.trades.length;
}

export const SIGNAL_META: {
  key: keyof Signals;
  label: string;
  unit: string;
  hint: string;
  format: (v: number) => string;
  goodHigh: boolean;
}[] = [
  {
    key: "hurst",
    label: "Hurst exponent",
    unit: "H",
    hint: "H < 0.5 mean-reverts; H > 0.5 trends.",
    format: (v) => v.toFixed(2),
    goodHigh: false,
  },
  {
    key: "vixTerm",
    label: "VIX term structure",
    unit: "pts",
    hint: "Positive = contango (calm). Negative = backwardation (stress).",
    format: (v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
    goodHigh: true,
  },
  {
    key: "rvIv",
    label: "Realized vs implied",
    unit: "vol",
    hint: "Realized minus implied. Positive = vol underpriced, risk-off.",
    format: (v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
    goodHigh: false,
  },
  {
    key: "correlation",
    label: "Cross-asset corr",
    unit: "ρ",
    hint: "Risk-on is dispersed. Crisis correlation piles toward 1.",
    format: (v) => v.toFixed(2),
    goodHigh: false,
  },
  {
    key: "credit",
    label: "Credit spreads",
    unit: "bps",
    hint: "HY OAS. Stress shows up here before equities finish falling.",
    format: (v) => `${Math.round(v)}`,
    goodHigh: false,
  },
  {
    key: "curve",
    label: "Rates curve slope",
    unit: "%",
    hint: "10y–2y. Inversion leans recession; steepening leans growth.",
    format: (v) => `${v.toFixed(2)}`,
    goodHigh: true,
  },
];
