import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_PAIR_ID,
  pairOf,
  signalsFromNse,
  type NseBar,
  type NseTape,
} from "@/lib/nse";
import { istDayKey, type Signals } from "@/lib/regime-engine";

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

function align(
  a: Series[],
  b: Series[],
  vix: Series[],
  nifty: Series[],
  bank: Series[],
  window = 1800,
): NseBar[] {
  const bars: NseBar[] = [];
  let lastVix = vix[0]?.c ?? 13.2;
  let lastN = nifty[0]?.c ?? 23000;
  let lastB = bank[0]?.c ?? 55000;
  for (const row of a) {
    const pxB = nearest(b, row.t, window);
    if (pxB == null) continue;
    const vx = nearest(vix, row.t, Math.max(window, 7200));
    const n = nearest(nifty, row.t, window);
    const bk = nearest(bank, row.t, window);
    if (vx != null) lastVix = vx;
    if (n != null) lastN = n;
    if (bk != null) lastB = bk;
    bars.push({
      t: row.t,
      a: row.c,
      b: pxB,
      vix: lastVix,
      nifty: lastN,
      bank: lastB,
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
    niftyBuf.push(bar.nifty);
    bankBuf.push(bar.bank);
    if (spreadBuf.length > 90) spreadBuf.shift();
    if (niftyBuf.length > 90) niftyBuf.shift();
    if (bankBuf.length > 90) bankBuf.shift();
    if (spreadBuf.length < 20) continue;
    out.push(
      signalsFromNse({
        spreadBuf,
        vix: bar.vix,
        nifty: niftyBuf,
        bank: bankBuf,
      }),
    );
  }
  return out.slice(-90);
}

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
      const hourlyP = Promise.all([
        yahoo(pair.a.yahoo),
        yahoo(pair.b.yahoo),
        yahoo("^INDIAVIX"),
        yahoo("^NSEI"),
        yahoo("^NSEBANK"),
      ]);
      const dailyP = settle(
        Promise.all([
          yahoo(pair.a.yahoo, "1d", "6mo"),
          yahoo(pair.b.yahoo, "1d", "6mo"),
          yahoo("^INDIAVIX", "1d", "6mo"),
          yahoo("^NSEI", "1d", "6mo"),
          yahoo("^NSEBANK", "1d", "6mo"),
        ]),
        4500,
      );
      const [hourly, daily] = await Promise.all([hourlyP, dailyP]);
      const [a, b, vix, nifty, bank] = hourly;
      const bars = align(a, b, vix, nifty, bank);
      if (bars.length < 24) return null;

      let history90: Signals[] = [];
      if (daily) {
        const [da, db, dv, dn, dnk] = daily;
        history90 = history90FromDaily(align(da, db, dv, dn, dnk, 36 * 3600));
      }

      const last = bars[bars.length - 1]!;
      const tape: NseTape = {
        pairId: pair.id,
        bars,
        last,
        fetchedAt: Date.now(),
        history90,
        lastDay: istDayKey(last.t * 1000),
      };
      cache.set(pair.id, { at: Date.now(), tape });
      return tape;
    } catch {
      return null;
    }
  });
