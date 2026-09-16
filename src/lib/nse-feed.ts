import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_PAIR_ID,
  pairOf,
  type NseBar,
  type NseTape,
} from "@/lib/nse";

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

async function yahoo(symbol: string): Promise<Series[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=1mo`;
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
): NseBar[] {
  const bars: NseBar[] = [];
  let lastVix = vix[0]?.c ?? 13.2;
  let lastN = nifty[0]?.c ?? 23000;
  let lastB = bank[0]?.c ?? 55000;
  for (const row of a) {
    const pxB = nearest(b, row.t, 1800);
    if (pxB == null) continue;
    const vx = nearest(vix, row.t, 7200);
    const n = nearest(nifty, row.t, 1800);
    const bk = nearest(bank, row.t, 1800);
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
      const [a, b, vix, nifty, bank] = await Promise.all([
        yahoo(pair.a.yahoo),
        yahoo(pair.b.yahoo),
        yahoo("^INDIAVIX"),
        yahoo("^NSEI"),
        yahoo("^NSEBANK"),
      ]);
      const bars = align(a, b, vix, nifty, bank);
      if (bars.length < 24) return null;
      const tape: NseTape = {
        pairId: pair.id,
        bars,
        last: bars[bars.length - 1]!,
        fetchedAt: Date.now(),
      };
      cache.set(pair.id, { at: Date.now(), tape });
      return tape;
    } catch {
      return null;
    }
  });
