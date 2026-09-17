/** Rolling train / validate / OOS of a fitted OU pair, gated vs naive.

Parameters are frozen at the end of train. Validation decides whether
the fold is selected. Pooled scores use selected OOS only.
*/

import {
  LEG_CHARGE,
  dataIntegrity,
  nseTick,
  pairOf,
  signalsFromNse,
  type DataIntegrity,
  type NseBar,
} from "./nse.ts";
import {
  DT_DAILY,
  fitPairOu,
  isTradable,
  ouZ,
  spreadX,
  type OuFit,
} from "./ou.ts";
import {
  createEngine,
  observe,
  type EngineState,
  type RegimeId,
} from "./regime-engine.ts";

const INITIAL_EQUITY = 1_000_000;
const MIN_NOTIONAL = 220_000;
const Z_ENTRY = 1.75;
const Z_EXIT = 0.4;
const Z_STOP = 4.2;
const COOLDOWN = 2;

export const TRAIN_BARS = 126;
export const VAL_BARS = 63;
export const OOS_BARS = 63;
export const FOLD_STEP = 63;
export const VALIDATION_WARMUP = TRAIN_BARS;

const REGIMES: RegimeId[] = [
  "mean_reverting",
  "trending",
  "high_vol",
  "crisis",
];

export interface BookStats {
  equity: number;
  pnl: number;
  cagr: number | null;
  sharpe: number | null;
  maxDd: number;
  downsideVol: number | null;
  winRate: number | null;
  trades: number;
  wins: number;
  timeIn: number;
  turnover: number;
  tailLoss: number | null;
}

export interface RegimeSlice {
  bars: number;
  naive: BookStats;
  filtered: BookStats;
}

export interface ParamMoments {
  n: number;
  mean: number;
  std: number;
  min: number;
  max: number;
}

export interface FoldReport {
  i: number;
  trainFrom: number;
  trainTo: number;
  valFrom: number;
  valTo: number;
  oosFrom: number;
  oosTo: number;
  fit: OuFit | null;
  selected: boolean;
  reason: string;
  validate: { naive: BookStats; filtered: BookStats };
  oos: { naive: BookStats; filtered: BookStats; byRegime: Record<RegimeId, RegimeSlice> };
}

export interface ValidationReport {
  status: "ok" | "invalid";
  reason: string;
  pairId: string;
  from: number;
  to: number;
  nBars: number;
  interval: "1d";
  source: "yahoo";
  integrity: DataIntegrity;
  folds: FoldReport[];
  selectedFolds: number;
  stability: {
    beta: ParamMoments | null;
    halfLife: ParamMoments | null;
    kappa: ParamMoments | null;
    r2: ParamMoments | null;
  } | null;
  pooled: {
    naive: BookStats;
    filtered: BookStats;
    edge: number;
    byRegime: Record<RegimeId, RegimeSlice>;
  } | null;
  lastFit: OuFit | null;
  lastRegime: RegimeId;
  engineN: number;
  /** @deprecated use pooled.filtered */
  filtered?: BookStats;
  /** @deprecated use pooled.naive */
  naive?: BookStats;
  series?: DataIntegrity;
  edge?: number;
}

interface Pos {
  side: "long_spread" | "short_spread";
  aShares: number;
  bShares: number;
  aEntry: number;
  bEntry: number;
  zEntry: number;
  openedAt: number;
  regime: RegimeId;
}

interface Book {
  realized: number;
  peak: number;
  pos: Pos | null;
  lastExit: number;
  pnls: number[];
  held: number;
  daily: number[];
  dailyRegime: RegimeId[];
  tradeRegime: RegimeId[];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function mtm(pos: Pos, a: number, b: number) {
  const da = pos.aShares * (a - pos.aEntry);
  const db = pos.bShares * (b - pos.bEntry);
  return pos.side === "long_spread" ? da - db : db - da;
}

function equity(book: Book, a: number, b: number) {
  return book.realized + (book.pos ? mtm(book.pos, a, b) : 0);
}

function charges(aN: number, bN: number) {
  return (Math.abs(aN) + Math.abs(bN)) * LEG_CHARGE;
}

function close(book: Book, a: number, b: number, hour: number) {
  const pos = book.pos;
  if (!pos) return;
  const pnl = mtm(pos, a, b) - charges(pos.aShares * a, pos.bShares * b);
  book.realized += pnl;
  book.pnls.push(pnl);
  book.tradeRegime.push(pos.regime);
  book.pos = null;
  book.lastExit = hour;
}

function enter(
  book: Book,
  z: number,
  a: number,
  b: number,
  hour: number,
  fit: OuFit,
  regime: RegimeId,
) {
  if (book.pos) return;
  if (hour - book.lastExit < COOLDOWN) return;
  if (Math.abs(z) < Z_ENTRY || Math.abs(z) > Z_STOP - 0.2) return;
  const eq = equity(book, a, b);
  const cap = eq * 0.28;
  const notional = clamp(0.14 * eq, Math.min(MIN_NOTIONAL, cap), cap);
  const aPx = nseTick(a);
  const bPx = nseTick(b);
  const aShares = Math.max(1, Math.round(notional / aPx));
  const bShares = Math.max(
    1,
    Math.round((Math.abs(fit.beta) * aShares * aPx) / bPx),
  );
  book.realized -= charges(aShares * aPx, bShares * bPx);
  book.pos = {
    side: z > 0 ? "short_spread" : "long_spread",
    aShares,
    bShares,
    aEntry: aPx,
    bEntry: bPx,
    zEntry: z,
    openedAt: hour,
    regime,
  };
}

function manage(
  book: Book,
  z: number,
  a: number,
  b: number,
  hour: number,
  regime: RegimeId,
  gate: boolean,
  fit: OuFit,
  hold: number,
) {
  const eq = equity(book, a, b);
  book.peak = Math.max(book.peak, eq);
  if (gate && regime === "crisis" && book.pos) close(book, a, b, hour);
  if (book.pos) {
    const pos = book.pos;
    const held = hour - pos.openedAt;
    const stop =
      (pos.side === "short_spread" && z > Z_STOP) ||
      (pos.side === "long_spread" && z < -Z_STOP);
    const target =
      (pos.side === "short_spread" && z < Z_EXIT) ||
      (pos.side === "long_spread" && z > -Z_EXIT);
    if (stop || target || held >= hold) close(book, a, b, hour);
  }
  const allow = !gate || regime === "mean_reverting";
  if (allow) enter(book, z, a, b, hour, fit, regime);
  if (book.pos) book.held += 1;
}

function emptyBook(): Book {
  return {
    realized: INITIAL_EQUITY,
    peak: INITIAL_EQUITY,
    pos: null,
    lastExit: -99,
    pnls: [],
    held: 0,
    daily: [],
    dailyRegime: [],
    tradeRegime: [],
  };
}

function retsOf(eq: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < eq.length; i++) {
    const p = eq[i - 1]!;
    if (p > 0) r.push(eq[i]! / p - 1);
  }
  return r;
}

function sharpe(eq: number[]): number | null {
  const r = retsOf(eq);
  if (r.length < 10) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  let v = 0;
  for (const x of r) v += (x - m) ** 2;
  const std = Math.sqrt(v / (r.length - 1));
  if (std < 1e-10) return null;
  return (m / std) * Math.sqrt(252);
}

function maxDd(eq: number[]): number {
  let peak = eq[0] ?? INITIAL_EQUITY;
  let max = 0;
  for (const x of eq) {
    peak = Math.max(peak, x);
    max = Math.max(max, 1 - x / peak);
  }
  return max;
}

function downVol(eq: number[]): number | null {
  const r = retsOf(eq);
  if (r.length < 10) return null;
  let s = 0;
  for (const x of r) s += Math.min(x, 0) ** 2;
  return Math.sqrt(s / r.length) * Math.sqrt(252);
}

function cagr(eq: number[], days: number): number | null {
  const last = eq[eq.length - 1];
  if (last == null || days < 20 || last <= 0) return null;
  return (last / INITIAL_EQUITY) ** (252 / days) - 1;
}

function tailLoss(pnls: number[]): number | null {
  if (pnls.length < 5) return null;
  const s = pnls.slice().sort((a, b) => a - b);
  const i = Math.max(0, Math.floor(0.05 * (s.length - 1)));
  return s[i] ?? null;
}

function stats(book: Book, a: number, b: number, days: number): BookStats {
  const eqPath = book.daily.length ? book.daily : [equity(book, a, b)];
  const eq = equity(book, a, b);
  const wins = book.pnls.filter((p) => p > 0).length;
  return {
    equity: eq,
    pnl: eq - INITIAL_EQUITY,
    cagr: cagr(eqPath, days),
    sharpe: sharpe(eqPath),
    maxDd: maxDd(eqPath),
    downsideVol: downVol(eqPath),
    winRate: book.pnls.length >= 4 ? wins / book.pnls.length : null,
    trades: book.pnls.length,
    wins,
    timeIn: days > 0 ? book.held / days : 0,
    turnover: days > 0 ? book.pnls.length / days : 0,
    tailLoss: tailLoss(book.pnls),
  };
}

function emptyStats(): BookStats {
  return {
    equity: INITIAL_EQUITY,
    pnl: 0,
    cagr: null,
    sharpe: null,
    maxDd: 0,
    downsideVol: null,
    winRate: null,
    trades: 0,
    wins: 0,
    timeIn: 0,
    turnover: 0,
    tailLoss: null,
  };
}

function emptySlice(): RegimeSlice {
  return { bars: 0, naive: emptyStats(), filtered: emptyStats() };
}

function walkEngine(engine: EngineState, bars: NseBar[]): EngineState {
  const spreadBuf: number[] = [];
  const niftyBuf: number[] = [];
  const bankBuf: number[] = [];
  let e = engine;
  for (const bar of bars) {
    spreadBuf.push(Math.log(bar.a) - Math.log(bar.b));
    if (bar.nifty != null) niftyBuf.push(bar.nifty);
    if (bar.bank != null) bankBuf.push(bar.bank);
    if (spreadBuf.length > 90) spreadBuf.shift();
    if (niftyBuf.length > 90) niftyBuf.shift();
    if (bankBuf.length > 90) bankBuf.shift();
    const raw = signalsFromNse({
      spreadBuf,
      vix: bar.vix,
      nifty: niftyBuf,
      bank: bankBuf,
      usdInr: bar.usdInr,
      gilt5: bar.gilt5,
      gilt10: bar.gilt10,
      barHours: 1,
    });
    if (!raw) continue;
    const step = observe(e, raw, bar.t * 1000);
    e = step.engine;
  }
  return e;
}

function simulate(
  bars: NseBar[],
  fit: OuFit,
  startEngine: EngineState,
  hold: number,
): { filtered: Book; naive: Book; engine: EngineState; lastRegime: RegimeId } {
  const filtered = emptyBook();
  const naive = emptyBook();
  let engine = startEngine;
  let lastRegime: RegimeId = engine.classified;
  const spreadBuf: number[] = [];
  const niftyBuf: number[] = [];
  const bankBuf: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    const a = nseTick(bar.a);
    const b = nseTick(bar.b);
    spreadBuf.push(Math.log(a) - Math.log(b));
    if (bar.nifty != null) niftyBuf.push(bar.nifty);
    if (bar.bank != null) bankBuf.push(bar.bank);
    if (spreadBuf.length > 90) spreadBuf.shift();
    if (niftyBuf.length > 90) niftyBuf.shift();
    if (bankBuf.length > 90) bankBuf.shift();
    const raw = signalsFromNse({
      spreadBuf,
      vix: bar.vix,
      nifty: niftyBuf,
      bank: bankBuf,
      usdInr: bar.usdInr,
      gilt5: bar.gilt5,
      gilt10: bar.gilt10,
      barHours: 1,
    });
    if (raw) {
      const step = observe(engine, raw, bar.t * 1000);
      engine = step.engine;
      lastRegime = step.snap.regime;
    }
    const x = spreadX(a, b, fit);
    const z = ouZ(x, fit);
    manage(filtered, z, a, b, i, lastRegime, true, fit, hold);
    manage(naive, z, a, b, i, lastRegime, false, fit, hold);
    filtered.daily.push(equity(filtered, a, b));
    naive.daily.push(equity(naive, a, b));
    filtered.dailyRegime.push(lastRegime);
    naive.dailyRegime.push(lastRegime);
  }
  return { filtered, naive, engine, lastRegime };
}

function sliceByRegime(book: Book, other: Book, days: number): Record<RegimeId, RegimeSlice> {
  const out = {} as Record<RegimeId, RegimeSlice>;
  for (const r of REGIMES) {
    const f = emptyBook();
    const n = emptyBook();
    f.realized = INITIAL_EQUITY;
    n.realized = INITIAL_EQUITY;
    let prevF = INITIAL_EQUITY;
    let prevN = INITIAL_EQUITY;
    let bars = 0;
    for (let i = 0; i < book.daily.length; i++) {
      if (book.dailyRegime[i] !== r) {
        prevF = book.daily[i]!;
        prevN = other.daily[i]!;
        continue;
      }
      bars += 1;
      const dF = book.daily[i]! - prevF;
      const dN = other.daily[i]! - prevN;
      f.realized += dF;
      n.realized += dN;
      f.daily.push(f.realized);
      n.daily.push(n.realized);
      prevF = book.daily[i]!;
      prevN = other.daily[i]!;
    }
    for (let i = 0; i < book.pnls.length; i++) {
      if (book.tradeRegime[i] === r) {
        f.pnls.push(book.pnls[i]!);
        f.held += 1;
      }
    }
    for (let i = 0; i < other.pnls.length; i++) {
      if (other.tradeRegime[i] === r) {
        n.pnls.push(other.pnls[i]!);
        n.held += 1;
      }
    }
    out[r] = {
      bars,
      filtered: stats(f, 1, 1, Math.max(1, bars || days)),
      naive: stats(n, 1, 1, Math.max(1, bars || days)),
    };
  }
  return out;
}

function poolBooks(books: Book[], days: number): Book {
  const p = emptyBook();
  p.realized = INITIAL_EQUITY;
  let eq = INITIAL_EQUITY;
  for (const b of books) {
    for (const r of retsOf(b.daily.length ? b.daily : [INITIAL_EQUITY])) {
      eq *= 1 + r;
      p.daily.push(eq);
    }
    p.pnls.push(...b.pnls);
    p.held += b.held;
    p.tradeRegime.push(...b.tradeRegime);
    p.dailyRegime.push(...b.dailyRegime);
  }
  p.realized = eq;
  return p;
}

function moments(xs: number[]): ParamMoments | null {
  if (!xs.length) return null;
  let lo = xs[0]!;
  let hi = xs[0]!;
  let s = 0;
  for (const x of xs) {
    s += x;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  const mean = s / xs.length;
  let v = 0;
  for (const x of xs) v += (x - mean) ** 2;
  const std = xs.length > 1 ? Math.sqrt(v / (xs.length - 1)) : 0;
  return { n: xs.length, mean, std, min: lo, max: hi };
}

function invalid(
  pairId: string,
  bars: NseBar[],
  integrity: DataIntegrity,
  reason: string,
): ValidationReport {
  const last = bars[bars.length - 1];
  return {
    status: "invalid",
    reason,
    pairId,
    from: bars[0]?.t ?? 0,
    to: last?.t ?? 0,
    nBars: bars.length,
    interval: "1d",
    source: "yahoo",
    integrity,
    folds: [],
    selectedFolds: 0,
    stability: null,
    pooled: null,
    lastFit: null,
    lastRegime: "mean_reverting",
    engineN: 0,
  };
}

export function validateOu(
  bars: NseBar[],
  pairId: string,
): ValidationReport {
  const id = pairOf(pairId).id;
  const integrity = dataIntegrity(bars);
  if (!integrity.complete) {
    return invalid(id, bars, integrity, integrity.notes.join("; ") || "incomplete tape");
  }
  const need = TRAIN_BARS + VAL_BARS + OOS_BARS;
  if (bars.length < need) {
    return invalid(
      id,
      bars,
      integrity,
      `need ${need} sessions for one fold, have ${bars.length}`,
    );
  }

  const folds: FoldReport[] = [];
  const foldBooks = new Map<number, { filtered: Book; naive: Book }>();
  let lastRegime: RegimeId = "mean_reverting";
  let engineN = 0;
  let lastFit: OuFit | null = null;

  for (let start = 0; start + need <= bars.length; start += FOLD_STEP) {
    const train = bars.slice(start, start + TRAIN_BARS);
    const val = bars.slice(start + TRAIN_BARS, start + TRAIN_BARS + VAL_BARS);
    const oos = bars.slice(
      start + TRAIN_BARS + VAL_BARS,
      start + TRAIN_BARS + VAL_BARS + OOS_BARS,
    );
    const fit = fitPairOu(
      train.map((b) => b.a),
      train.map((b) => b.b),
      DT_DAILY,
    );
    let selected = false;
    let reason = "not mean-reverting";
    const hold = fit
      ? Math.min(15, Math.max(3, Math.round(2 * fit.halfLife)))
      : 10;

    let valRun = {
      naive: emptyStats(),
      filtered: emptyStats(),
    };
    let oosRun = {
      naive: emptyStats(),
      filtered: emptyStats(),
      byRegime: Object.fromEntries(REGIMES.map((r) => [r, emptySlice()])) as Record<
        RegimeId,
        RegimeSlice
      >,
    };

    if (fit && isTradable(fit)) {
      let engine = walkEngine(createEngine(), train);
      engineN = engine.days.length;
      const v = simulate(val, fit, engine, hold);
      engine = v.engine;
      valRun = {
        naive: stats(v.naive, val.at(-1)!.a, val.at(-1)!.b, val.length),
        filtered: stats(v.filtered, val.at(-1)!.a, val.at(-1)!.b, val.length),
      };
      const valTrades = valRun.naive.trades + valRun.filtered.trades;
      const valDd = Math.max(valRun.naive.maxDd, valRun.filtered.maxDd);
      const valSharpe = Math.max(
        valRun.naive.sharpe ?? -Infinity,
        valRun.filtered.sharpe ?? -Infinity,
      );
      if (valTrades < 1) reason = "validation: no fills";
      else if (valDd >= 0.2) reason = "validation rejected (drawdown)";
      else if (valSharpe < -0.5) reason = "validation rejected (sharpe)";
      else {
        selected = true;
        reason = "selected";
      }
      const o = simulate(oos, fit, engine, hold);
      lastRegime = o.lastRegime;
      oosRun = {
        naive: stats(o.naive, oos.at(-1)!.a, oos.at(-1)!.b, oos.length),
        filtered: stats(o.filtered, oos.at(-1)!.a, oos.at(-1)!.b, oos.length),
        byRegime: sliceByRegime(o.filtered, o.naive, oos.length),
      };
      if (selected) {
        foldBooks.set(folds.length, { filtered: o.filtered, naive: o.naive });
      }
    } else if (fit) {
      reason = `κ/half-life/R² fail (hl=${fit.halfLife.toFixed(1)}d r2=${fit.r2.toFixed(2)})`;
    }

    folds.push({
      i: folds.length + 1,
      trainFrom: train[0]!.t,
      trainTo: train.at(-1)!.t,
      valFrom: val[0]!.t,
      valTo: val.at(-1)!.t,
      oosFrom: oos[0]!.t,
      oosTo: oos.at(-1)!.t,
      fit,
      selected,
      reason,
      validate: valRun,
      oos: oosRun,
    });
  }

  const selected = folds.filter((f) => f.selected);
  lastFit =
    [...selected].reverse().find((f) => f.fit)?.fit ??
    [...folds].reverse().find((f) => f.fit)?.fit ??
    null;

  const tradableFits = folds.map((f) => f.fit).filter((f): f is OuFit => !!f && isTradable(f));
  const stability = tradableFits.length
    ? {
        beta: moments(tradableFits.map((f) => f.beta)),
        halfLife: moments(tradableFits.map((f) => f.halfLife)),
        kappa: moments(tradableFits.map((f) => f.kappa)),
        r2: moments(tradableFits.map((f) => f.r2)),
      }
    : null;

  let pooled: ValidationReport["pooled"] = null;
  if (selected.length) {
    const fBooks: Book[] = [];
    const nBooks: Book[] = [];
    const fAll = emptyBook();
    const nAll = emptyBook();
    for (let i = 0; i < folds.length; i++) {
      const extra = foldBooks.get(i);
      if (!extra) continue;
      fBooks.push(extra.filtered);
      nBooks.push(extra.naive);
      fAll.pnls.push(...extra.filtered.pnls);
      nAll.pnls.push(...extra.naive.pnls);
      fAll.held += extra.filtered.held;
      nAll.held += extra.naive.held;
      fAll.dailyRegime.push(...extra.filtered.dailyRegime);
      nAll.dailyRegime.push(...extra.naive.dailyRegime);
      fAll.tradeRegime.push(...extra.filtered.tradeRegime);
      nAll.tradeRegime.push(...extra.naive.tradeRegime);
    }
    const days = selected.length * OOS_BARS;
    const pf = poolBooks(fBooks, days);
    const pn = poolBooks(nBooks, days);
    const fs = stats(pf, 1, 1, days);
    const ns = stats(pn, 1, 1, days);
    fAll.daily = pf.daily;
    nAll.daily = pn.daily;
    fAll.realized = pf.realized;
    nAll.realized = pn.realized;
    pooled = {
      naive: ns,
      filtered: fs,
      edge: fs.pnl - ns.pnl,
      byRegime: sliceByRegime(fAll, nAll, days),
    };
  }

  const last = bars[bars.length - 1]!;
  const ok = selected.length > 0;
  return {
    status: ok ? "ok" : "invalid",
    reason: ok
      ? `${selected.length} selected fold(s), ${folds.length} rolled`
      : folds.length
        ? folds.map((f) => f.reason).join("; ")
        : "no folds",
    pairId: id,
    from: bars[TRAIN_BARS]?.t ?? bars[0]!.t,
    to: last.t,
    nBars: bars.length,
    interval: "1d",
    source: "yahoo",
    integrity,
    folds,
    selectedFolds: selected.length,
    stability,
    pooled,
    lastFit,
    lastRegime,
    engineN,
    filtered: pooled?.filtered,
    naive: pooled?.naive,
    series: integrity,
    edge: pooled?.edge,
  };
}
