/** Walk-forward OU on a real NSE daily tape. No synthetic DGP, no lookahead. */

import {
  LEG_CHARGE,
  nseTick,
  pairOf,
  signalsFromNse,
  type NseBar,
} from "./nse.ts";
import {
  createEngine,
  observe,
  type RegimeId,
} from "./regime-engine.ts";

const INITIAL_EQUITY = 1_000_000;
const MIN_NOTIONAL = 220_000;
const Z_ENTRY = 1.75;
const Z_EXIT = 0.4;
const Z_STOP = 4.2;

export const VALIDATION_WARMUP = 90;
export const VALIDATION_HOLD = 10;
const ZWIN = 60;
const COOLDOWN = 2;

export interface BookReport {
  equity: number;
  pnl: number;
  sharpe: number | null;
  maxDd: number;
  winRate: number | null;
  trades: number;
  wins: number;
  timeIn: number;
}

export interface ValidationReport {
  pairId: string;
  from: number;
  to: number;
  nBars: number;
  warmup: number;
  oos: number;
  interval: "1d";
  source: "yahoo";
  series: {
    vix: boolean;
    usdInr: boolean;
    gilt: boolean;
    nifty: boolean;
  };
  filtered: BookReport;
  naive: BookReport;
  edge: number;
  lastRegime: RegimeId;
  engineN: number;
}

interface Pos {
  side: "long_spread" | "short_spread";
  aShares: number;
  bShares: number;
  aEntry: number;
  bEntry: number;
  zEntry: number;
  openedAt: number;
}

interface Book {
  realized: number;
  peak: number;
  pos: Pos | null;
  lastExit: number;
  pnls: number[];
  held: number;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function zscore(buf: number[]) {
  const n = buf.length;
  const last = buf[n - 1] ?? 0;
  if (n < 8) return { z: 0 };
  let mean = 0;
  for (const x of buf) mean += x;
  mean /= n;
  let v = 0;
  for (const x of buf) v += (x - mean) ** 2;
  const std = Math.sqrt(v / Math.max(1, n - 1)) || 1e-6;
  return { z: (last - mean) / std };
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
  book.pos = null;
  book.lastExit = hour;
}

function enter(book: Book, z: number, a: number, b: number, hour: number) {
  if (book.pos) return;
  if (hour - book.lastExit < COOLDOWN) return;
  if (Math.abs(z) < Z_ENTRY || Math.abs(z) > Z_STOP - 0.2) return;
  const eq = equity(book, a, b);
  const cap = eq * 0.28;
  const notional = clamp(0.14 * eq, Math.min(MIN_NOTIONAL, cap), cap);
  const aPx = nseTick(a);
  const bPx = nseTick(b);
  const aShares = Math.max(1, Math.round(notional / aPx));
  const bShares = Math.max(1, Math.round((aShares * aPx) / bPx));
  book.realized -= charges(aShares * aPx, bShares * bPx);
  book.pos = {
    side: z > 0 ? "short_spread" : "long_spread",
    aShares,
    bShares,
    aEntry: aPx,
    bEntry: bPx,
    zEntry: z,
    openedAt: hour,
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
    if (stop || target || held >= VALIDATION_HOLD) close(book, a, b, hour);
  }
  const allow = !gate || regime === "mean_reverting";
  if (allow) enter(book, z, a, b, hour);
  if (book.pos) book.held += 1;
}

function sharpe(equities: number[]): number | null {
  if (equities.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < equities.length; i++) {
    const prev = equities[i - 1]!;
    if (prev > 0) rets.push(equities[i]! / prev - 1);
  }
  if (rets.length < 10) return null;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  let v = 0;
  for (const r of rets) v += (r - m) ** 2;
  const std = Math.sqrt(v / (rets.length - 1));
  if (std < 1e-10) return null;
  return (m / std) * Math.sqrt(252);
}

function maxDd(equities: number[]): number {
  let peak = equities[0] ?? INITIAL_EQUITY;
  let max = 0;
  for (const x of equities) {
    peak = Math.max(peak, x);
    max = Math.max(max, 1 - x / peak);
  }
  return max;
}

function report(book: Book, a: number, b: number, oos: number): BookReport {
  const eq = equity(book, a, b);
  const wins = book.pnls.filter((p) => p > 0).length;
  return {
    equity: eq,
    pnl: eq - INITIAL_EQUITY,
    sharpe: null,
    maxDd: 0,
    winRate: book.pnls.length >= 4 ? wins / book.pnls.length : null,
    trades: book.pnls.length,
    wins,
    timeIn: oos > 0 ? book.held / oos : 0,
  };
}

function varies(bars: NseBar[], key: keyof NseBar, minMove: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    const x = b[key];
    if (typeof x !== "number") continue;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return Number.isFinite(lo) && hi - lo > minMove;
}

function emptyBook(): Book {
  return {
    realized: INITIAL_EQUITY,
    peak: INITIAL_EQUITY,
    pos: null,
    lastExit: -99,
    pnls: [],
    held: 0,
  };
}

export function validateOu(
  bars: NseBar[],
  pairId: string,
): ValidationReport | null {
  if (bars.length < VALIDATION_WARMUP + 20) return null;
  const filtered = emptyBook();
  const naive = emptyBook();
  const fEq: number[] = [];
  const nEq: number[] = [];
  const spreadBuf: number[] = [];
  const niftyBuf: number[] = [];
  const bankBuf: number[] = [];
  let engine = createEngine();
  let lastRegime: RegimeId = "mean_reverting";
  let engineN = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    const a = nseTick(bar.a);
    const b = nseTick(bar.b);
    spreadBuf.push(Math.log(a) - Math.log(b));
    niftyBuf.push(bar.nifty);
    bankBuf.push(bar.bank);
    if (spreadBuf.length > ZWIN) spreadBuf.shift();
    if (niftyBuf.length > 90) niftyBuf.shift();
    if (bankBuf.length > 90) bankBuf.shift();
    const { z } = zscore(spreadBuf);
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
    const step = observe(engine, raw, bar.t * 1000);
    engine = step.engine;
    lastRegime = step.snap.regime;
    engineN = step.snap.nObs;

    if (i < VALIDATION_WARMUP) continue;
    manage(filtered, z, a, b, i, lastRegime, true);
    manage(naive, z, a, b, i, lastRegime, false);
    fEq.push(equity(filtered, a, b));
    nEq.push(equity(naive, a, b));
  }

  const last = bars[bars.length - 1]!;
  const oos = bars.length - VALIDATION_WARMUP;
  const f = report(filtered, last.a, last.b, oos);
  const n = report(naive, last.a, last.b, oos);
  f.sharpe = sharpe(fEq);
  n.sharpe = sharpe(nEq);
  f.maxDd = maxDd(fEq);
  n.maxDd = maxDd(nEq);

  return {
    pairId: pairOf(pairId).id,
    from: bars[VALIDATION_WARMUP]!.t,
    to: last.t,
    nBars: bars.length,
    warmup: VALIDATION_WARMUP,
    oos,
    interval: "1d",
    source: "yahoo",
    series: {
      vix: varies(bars, "vix", 1),
      usdInr: varies(bars, "usdInr", 0.4),
      gilt: varies(bars, "gilt10", 0.2),
      nifty: varies(bars, "nifty", 50),
    },
    filtered: f,
    naive: n,
    edge: f.pnl - n.pnl,
    lastRegime,
    engineN,
  };
}
