import type { Signals } from "./regime-engine.ts";
import type { ValidationReport } from "./validate-ou.ts";

export interface NseLeg {
  symbol: string;
  yahoo: string;
  name: string;
}

export interface NsePair {
  id: string;
  a: NseLeg;
  b: NseLeg;
  sector: string;
  blurb: string;
  a0: number;
  b0: number;
}

export const NSE_PAIRS: NsePair[] = [
  {
    id: "hdfc-icici",
    a: { symbol: "HDFCBANK", yahoo: "HDFCBANK.NS", name: "HDFC Bank" },
    b: { symbol: "ICICIBANK", yahoo: "ICICIBANK.NS", name: "ICICI Bank" },
    sector: "Private banks",
    blurb: "Most liquid cash pair on NSE. Same beta, different franchise.",
    a0: 721.5,
    b0: 1358.8,
  },
  {
    id: "hul-itc",
    a: { symbol: "HINDUNILVR", yahoo: "HINDUNILVR.NS", name: "Hindustan Unilever" },
    b: { symbol: "ITC", yahoo: "ITC.NS", name: "ITC" },
    sector: "FMCG",
    blurb: "India's staples analog. Slow, dividend, mean-reverting spread.",
    a0: 1962,
    b0: 264.15,
  },
  {
    id: "tcs-infy",
    a: { symbol: "TCS", yahoo: "TCS.NS", name: "Tata Consultancy" },
    b: { symbol: "INFY", yahoo: "INFY.NS", name: "Infosys" },
    sector: "IT services",
    blurb: "Dollar-revenue twins. Spreads when one misses a deal the other wins.",
    a0: 2188.8,
    b0: 1060,
  },
  {
    id: "rel-ongc",
    a: { symbol: "RELIANCE", yahoo: "RELIANCE.NS", name: "Reliance Industries" },
    b: { symbol: "ONGC", yahoo: "ONGC.NS", name: "ONGC" },
    sector: "Energy",
    blurb: "Integrated vs upstream. Crude is the hidden factor.",
    a0: 1240,
    b0: 236.8,
  },
  {
    id: "sbi-axis",
    a: { symbol: "SBIN", yahoo: "SBIN.NS", name: "State Bank of India" },
    b: { symbol: "AXISBANK", yahoo: "AXISBANK.NS", name: "Axis Bank" },
    sector: "Banks",
    blurb: "PSU giant vs private. Credit cycle shows up in the residual.",
    a0: 991.4,
    b0: 1241,
  },
];

export const DEFAULT_PAIR_ID = "hdfc-icici";
export const SESSION_HOURS = 6;
export const NSE_OPEN_MIN = 9 * 60 + 15;
export const NSE_CLOSE_MIN = 15 * 60 + 30;
export const NSE_TICK = 0.05;
export const LEG_CHARGE = 0.0005;

export function nseTick(px: number): number {
  return Math.round(px / NSE_TICK) * NSE_TICK;
}

export function pairOf(id: string | undefined | null): NsePair {
  return NSE_PAIRS.find((p) => p.id === id) ?? NSE_PAIRS[0]!;
}

export interface NseBar {
  t: number;
  a: number;
  b: number;
  vix: number | null;
  nifty: number | null;
  bank: number | null;
  usdInr: number | null;
  gilt5: number | null;
  gilt10: number | null;
}

export interface SeriesCoverage {
  n: number;
  present: number;
  ok: boolean;
}

export interface DataIntegrity {
  pair: SeriesCoverage;
  vix: SeriesCoverage;
  nifty: SeriesCoverage;
  bank: SeriesCoverage;
  usdInr: SeriesCoverage;
  gilt: SeriesCoverage;
  complete: boolean;
  notes: string[];
}

export interface NseTape {
  pairId: string;
  bars: NseBar[];
  last: NseBar;
  fetchedAt: number;
  history90?: Signals[];
  lastDay?: string;
  daily?: NseBar[];
  integrity?: DataIntegrity;
  validation?: ValidationReport;
}

export function advanceNseTs(ts: number): number {
  let t = ts + 3600_000;
  for (let i = 0; i < 96; i++) {
    if (nseSessionNow(new Date(t)).open) return t;
    t += 15 * 60_000;
  }
  return t;
}

export function nseSessionNow(now = new Date()): {
  open: boolean;
  label: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = pick("weekday");
  const hh = Number(pick("hour"));
  const mm = Number(pick("minute"));
  const mins = hh * 60 + mm;
  const weekend = wd === "Sat" || wd === "Sun";
  const open = !weekend && mins >= NSE_OPEN_MIN && mins < NSE_CLOSE_MIN;
  if (weekend) return { open: false, label: "NSE closed · weekend" };
  if (open) return { open: true, label: "NSE cash open" };
  if (mins < NSE_OPEN_MIN) return { open: false, label: "NSE pre-open" };
  return { open: false, label: "NSE cash closed" };
}

export function hurstRough(buf: number[]): number {
  if (buf.length < 24) return 0.5;
  const rets: number[] = [];
  for (let i = 1; i < buf.length; i++) rets.push(buf[i]! - buf[i - 1]!);
  const v1 = variance(rets);
  const paired: number[] = [];
  for (let i = 1; i < rets.length; i += 2) {
    paired.push(rets[i - 1]! + rets[i]!);
  }
  const v2 = variance(paired);
  if (v1 < 1e-16 || v2 < 1e-16) return 0.5;
  const h = 0.5 * (Math.log(v2 / v1) / Math.LN2);
  return Math.max(0.2, Math.min(0.85, h));
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return v / (xs.length - 1);
}

export function rollingCorr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 8) return 0.4;
  const aa = a.slice(-n);
  const bb = b.slice(-n);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < n; i++) {
    if (aa[i - 1] && bb[i - 1] && aa[i] && bb[i]) {
      ra.push(aa[i]! / aa[i - 1]! - 1);
      rb.push(bb[i]! / bb[i - 1]! - 1);
    }
  }
  if (ra.length < 6) return 0.4;
  const ma = ra.reduce((x, y) => x + y, 0) / ra.length;
  const mb = rb.reduce((x, y) => x + y, 0) / rb.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i]! - ma;
    const y = rb[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  if (den < 1e-12) return 0.4;
  return Math.max(0.05, Math.min(0.99, num / den));
}

export function realizedVol(
  px: number[],
  barsPerYear: number,
  lookback?: number,
): number {
  const xs = lookback && px.length > lookback ? px.slice(-lookback) : px;
  if (xs.length < 6) return 0.12;
  const rets: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] && xs[i - 1]) rets.push(Math.log(xs[i]! / xs[i - 1]!));
  }
  if (rets.length < 4) return 0.12;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  let v = 0;
  for (const r of rets) v += (r - m) ** 2;
  const std = Math.sqrt(v / (rets.length - 1));
  return std * Math.sqrt(barsPerYear);
}

export function coverage(
  bars: NseBar[],
  pick: (b: NseBar) => number | null,
  minPresent = 60,
  minFrac = 0.8,
): SeriesCoverage {
  let present = 0;
  for (const b of bars) if (pick(b) != null) present += 1;
  const n = bars.length;
  return { n, present, ok: present >= minPresent && (n === 0 ? false : present / n >= minFrac) };
}

export function dataIntegrity(bars: NseBar[]): DataIntegrity {
  const pair: SeriesCoverage = {
    n: bars.length,
    present: bars.length,
    ok: bars.length >= 200,
  };
  const vix = coverage(bars, (b) => b.vix);
  const nifty = coverage(bars, (b) => b.nifty);
  const bank = coverage(bars, (b) => b.bank);
  const usdInr = coverage(bars, (b) => b.usdInr);
  const gilt = coverage(bars, (b) =>
    b.gilt5 != null && b.gilt10 != null ? b.gilt5 : null,
  );
  const notes: string[] = [];
  if (!pair.ok) notes.push(`pair tape too short (${pair.present} sessions)`);
  if (!vix.ok) notes.push("India VIX missing or sparse");
  if (!nifty.ok) notes.push("Nifty missing or sparse");
  if (!bank.ok) notes.push("Bank Nifty missing or sparse");
  if (!usdInr.ok) notes.push("USD/INR missing or sparse — no dummy FX");
  if (!gilt.ok) notes.push("gilt ETFs missing or sparse — no dummy curve");
  const complete = pair.ok && vix.ok && nifty.ok && bank.ok && usdInr.ok && gilt.ok;
  return { pair, vix, nifty, bank, usdInr, gilt, complete, notes };
}

export function signalsFromNse(args: {
  spreadBuf: number[];
  vix: number | null;
  nifty: number[];
  bank: number[];
  usdInr: number | null;
  gilt5: number | null;
  gilt10: number | null;
  barHours?: number;
}): Signals | null {
  if (args.vix == null || !(args.vix > 0)) return null;
  if (args.usdInr == null || !(args.usdInr > 0)) return null;
  if (args.gilt5 == null || args.gilt10 == null) return null;
  if (!(args.gilt5 > 0) || !(args.gilt10 > 0)) return null;
  if (args.nifty.length < 6 || args.bank.length < 6) return null;
  const hours = args.barHours ?? SESSION_HOURS;
  const bpy = hours <= 1 ? 252 : 252 * SESSION_HOURS;
  const dayBars = hours <= 1 ? 1 : SESSION_HOURS;
  const rv20 = realizedVol(args.nifty, bpy, 20 * dayBars);
  const rv5 = realizedVol(args.nifty, bpy, 5 * dayBars);
  return {
    hurst: hurstRough(args.spreadBuf),
    vixTerm: rv20 - rv5,
    rvIv: rv20 - args.vix / 100,
    correlation: rollingCorr(args.nifty, args.bank),
    usdInr: args.usdInr,
    curve: Math.log(args.gilt10) - Math.log(args.gilt5),
  };
}
