import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_PAIR_ID,
  dataIntegrity,
  pairOf,
  signalsFromNse,
  type NseBar,
  type NseTape,
} from "@/lib/nse";
import { istDayKey, type Signals } from "@/lib/regime-engine";
import { validateOu, type ValidationReport } from "@/lib/validate-ou";

interface YahooChart {
  chart: {
    result: {
      timestamp?: number[];
      meta?: { regularMarketPrice?: number };
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: unknown;
  };
}

interface Series {
  t: number;
  c: number;
}

const cache = new Map<string, { at: number; tape: NseTape }>();
const TTL = 5 * 60_000;

async function yahoo(
  symbol: string,
  interval = "1h",
  range = "1mo",
): Promise<Series[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 NightwatchNSE/1.0" },
  });
  if (!res.ok) throw new Error(`${symbol} ${res.status}`);
  const data = (await res.json()) as YahooChart;
  const row = data.chart.result?.[0];
  const ts = row?.timestamp ?? [];
  const close = row?.indicators?.quote?.[0]?.close ?? [];
  const out: Series[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    const t = ts[i];
    if (c != null && Number.isFinite(c) && t) out.push({ t, c });
  }
  return out;
}

async function yahooSoft(
  symbol: string,
  interval = "1h",
  range = "1mo",
): Promise<Series[]> {
  try {
    return await yahoo(symbol, interval, range);
  } catch {
    return [];
  }
}

function settle<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(null);
    });
  });
}

function nearest(series: Series[], t: number, window = 3600): number | null {
  let best: Series | null = null;
  let bestD = window + 1;
  for (const s of series) {
    const d = Math.abs(s.t - t);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best ? best.c : null;
}

function lastSeen(series: Series[], t: number, window: number, prev: number | null) {
  return nearest(series, t, window) ?? prev;
}

function align(
  a: Series[],
  b: Series[],
  vix: Series[],
  nifty: Series[],
  bank: Series[],
  usd: Series[],
  gilt5: Series[],
  gilt10: Series[],
  window = 1800,
): NseBar[] {
  const bars: NseBar[] = [];
  let lastVix: number | null = null;
  let lastN: number | null = null;
  let lastB: number | null = null;
  let lastUsd: number | null = null;
  let lastG5: number | null = null;
  let lastG10: number | null = null;
  const wide = Math.max(window, 36 * 3600);
  for (const row of a) {
    const pxB = nearest(b, row.t, window);
    if (pxB == null) continue;
    lastVix = lastSeen(vix, row.t, wide, lastVix);
    lastN = lastSeen(nifty, row.t, window, lastN);
    lastB = lastSeen(bank, row.t, window, lastB);
    lastUsd = lastSeen(usd, row.t, wide, lastUsd);
    lastG5 = lastSeen(gilt5, row.t, wide, lastG5);
    lastG10 = lastSeen(gilt10, row.t, wide, lastG10);
    bars.push({
      t: row.t,
      a: row.c,
      b: pxB,
      vix: lastVix,
      nifty: lastN,
      bank: lastB,
      usdInr: lastUsd,
      gilt5: lastG5,
      gilt10: lastG10,
    });
  }
  return bars;
}

function history90FromDaily(bars: NseBar[]): Signals[] {
  const spreadBuf: number[] = [];
  const niftyBuf: number[] = [];
  const bankBuf: number[] = [];
  const out: Signals[] = [];
  for (const bar of bars) {
    spreadBuf.push(Math.log(bar.a) - Math.log(bar.b));
    if (bar.nifty != null) niftyBuf.push(bar.nifty);
    if (bar.bank != null) bankBuf.push(bar.bank);
    if (spreadBuf.length > 90) spreadBuf.shift();
    if (niftyBuf.length > 90) niftyBuf.shift();
    if (bankBuf.length > 90) bankBuf.shift();
    const sig = signalsFromNse({
      spreadBuf,
      vix: bar.vix,
      nifty: niftyBuf,
      bank: bankBuf,
      usdInr: bar.usdInr,
      gilt5: bar.gilt5,
      gilt10: bar.gilt10,
      barHours: 1,
    });
    if (sig) out.push(sig);
  }
  return out.slice(-90);
}

const EMPTY: Series[] = [];

export const fetchNseTape = createServerFn({ method: "POST" })
  .validator((input: { pairId?: string }) => ({
    pairId: input?.pairId ?? DEFAULT_PAIR_ID,
  }))
  .handler(async ({ data }): Promise<NseTape | null> => {
    const pairId = data.pairId;
    const hit = cache.get(pairId);
    if (hit && Date.now() - hit.at < TTL) return hit.tape;
    const pair = pairOf(pairId);
    try {
      const pack = (interval: string, range: string) =>
        Promise.all([
          yahoo(pair.a.yahoo, interval, range),
          yahoo(pair.b.yahoo, interval, range),
          yahoo("^INDIAVIX", interval, range),
          yahoo("^NSEI", interval, range),
          yahoo("^NSEBANK", interval, range),
          yahooSoft("INR=X", interval, range),
          yahooSoft("GILT5YBEES.NS", interval, range),
          yahooSoft("LTGILTBEES.NS", interval, range),
        ]);

      const hourlyP = pack("1h", "1mo");
      const dailyP = settle(
        Promise.all([
          yahoo(pair.a.yahoo, "1d", "2y"),
          yahoo(pair.b.yahoo, "1d", "2y"),
          yahooSoft("^INDIAVIX", "1d", "2y"),
          yahooSoft("^NSEI", "1d", "2y"),
          yahooSoft("^NSEBANK", "1d", "2y"),
          yahooSoft("INR=X", "1d", "2y"),
          yahooSoft("GILT5YBEES.NS", "1d", "2y"),
          yahooSoft("LTGILTBEES.NS", "1d", "2y"),
        ]),
        12000,
      );
      const [hourly, daily] = await Promise.all([hourlyP, dailyP]);
      const [a, b, vix, nifty, bank, usd, g5, g10] = hourly;
      const bars = align(a, b, vix, nifty, bank, usd, g5, g10);
      if (bars.length < 24) return null;

      let history90: Signals[] = [];
      let dailyBars: NseBar[] = [];
      let validation: ValidationReport | null = null;
      if (daily) {
        const [da, db, dv, dn, dnk, dusd, dg5, dg10] = daily;
        dailyBars = align(
          da,
          db,
          dv ?? EMPTY,
          dn ?? EMPTY,
          dnk ?? EMPTY,
          dusd ?? EMPTY,
          dg5 ?? EMPTY,
          dg10 ?? EMPTY,
          36 * 3600,
        );
        history90 = history90FromDaily(dailyBars);
        validation = validateOu(dailyBars, pair.id);
      }

      const last = bars[bars.length - 1]!;
      const tape: NseTape = {
        pairId: pair.id,
        bars,
        last,
        fetchedAt: Date.now(),
        history90,
        lastDay: istDayKey(last.t * 1000),
        daily: dailyBars,
        integrity: dataIntegrity(dailyBars.length ? dailyBars : bars),
        validation: validation ?? undefined,
      };
      cache.set(pair.id, { at: Date.now(), tape });
      return tape;
    } catch {
      return null;
    }
  });
