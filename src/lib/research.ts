/** Pair research scorecard.

Rank by parameter stability and repeatable OOS — never by who printed
the most. Pair-fit and regime-fit are separate verdicts.
*/

import { pairOf } from "./nse.ts";
import { isTradable } from "./ou.ts";
import type { RegimeId } from "./regime-engine.ts";
import type {
  ParamMoments,
  ValidationReport,
} from "./validate-ou.ts";

export type PairVerdict = "survive" | "watch" | "reject";
export type RegimeVerdict = "helps" | "hurts" | "unclear" | "n/a";

export interface PairFit {
  folds: number;
  selected: number;
  tradable: number;
  betaMean: number | null;
  betaCv: number | null;
  hlMean: number | null;
  hlCv: number | null;
  kappaMean: number | null;
  kappaCv: number | null;
  r2Mean: number | null;
  r2Min: number | null;
}

export interface OosRepeat {
  foldsWithTrades: number;
  concentrated: boolean;
}

export interface PairResearch {
  pairId: string;
  label: string;
  sector: string;
  pairVerdict: PairVerdict;
  regimeVerdict: RegimeVerdict;
  score: number;
  reasons: string[];
  pairFit: PairFit;
  oosRepeat: OosRepeat;
  report: ValidationReport;
}

export interface UniverseReport {
  asOf: number;
  source: "yahoo";
  interval: "1d";
  cards: PairResearch[];
  survive: string[];
  watch: string[];
  reject: string[];
  headline: string;
}

function cv(m: ParamMoments | null | undefined): number | null {
  if (!m || !Number.isFinite(m.mean) || Math.abs(m.mean) < 1e-9) return null;
  return m.std / Math.abs(m.mean);
}

export function scorePair(report: ValidationReport): PairResearch {
  const pair = pairOf(report.pairId);
  const folds = report.folds;
  const tradable = folds.filter((f) => f.fit && isTradable(f.fit)).length;
  const selectedFolds = folds.filter((f) => f.selected);
  const selected = selectedFolds.length;
  const betaCv = cv(report.stability?.beta);
  const hlCv = cv(report.stability?.halfLife);
  const kappaCv = cv(report.stability?.kappa);
  const r2Mean = report.stability?.r2?.mean ?? null;
  const r2Min = report.stability?.r2?.min ?? null;
  const betaMean = report.stability?.beta?.mean ?? null;
  const hlMean = report.stability?.halfLife?.mean ?? null;
  const kappaMean = report.stability?.kappa?.mean ?? null;

  const reasons: string[] = [];
  let score = 0;

  score += Math.min(24, selected * 12);
  score += Math.min(18, tradable * 6);

  if (betaCv != null) {
    if (betaCv < 0.12) {
      score += 22;
      reasons.push("β stable across tradable folds");
    } else if (betaCv < 0.22) {
      score += 12;
      reasons.push("β acceptable");
    } else {
      reasons.push("β unstable");
    }
  } else if (tradable <= 1) {
    reasons.push("not enough tradable folds to judge β");
  }

  if (r2Mean != null && r2Min != null) {
    if (r2Mean >= 0.7 && r2Min >= 0.5) {
      score += 16;
      reasons.push("hedge R² holds");
    } else if (r2Mean >= 0.5) {
      score += 8;
      reasons.push("hedge R² mixed");
    } else {
      reasons.push("hedge R² weak");
    }
  }

  if (hlMean != null && hlMean >= 2 && hlMean <= 15) score += 8;
  else if (hlMean != null) reasons.push("half-life outside 2–15d");
  if (hlCv != null && hlCv > 0.35) reasons.push("half-life varies across folds");

  const withTrades = selectedFolds.filter(
    (f) => f.oos.filtered.trades + f.oos.naive.trades > 0,
  );
  const abs = selectedFolds.map((f) => Math.abs(f.oos.filtered.pnl));
  const sumAbs = abs.reduce((a, b) => a + b, 0);
  const concentrated =
    selectedFolds.length >= 2 &&
    sumAbs > 0 &&
    Math.max(...abs) / sumAbs > 0.85;

  if (withTrades.length >= 2) score += 10;
  else if (selected > 0) reasons.push("OOS too thin to call repeatable");

  if (concentrated) {
    score -= 15;
    reasons.push("OOS P&L concentrated in one fold");
  }

  const pooled = report.pooled;
  let regimeVerdict: RegimeVerdict = "n/a";
  if (!pooled || selected === 0) {
    regimeVerdict = "n/a";
    if (selected === 0) reasons.push("no selected fold");
  } else if (
    pooled.edge > 0 &&
    pooled.filtered.maxDd <= pooled.naive.maxDd + 1e-9 &&
    selected >= 2 &&
    pooled.filtered.trades >= 4 &&
    withTrades.length >= 2
  ) {
    regimeVerdict = "helps";
    reasons.push("regime gate improved selected OOS vs always-on");
  } else if (pooled.edge < 0 && pooled.naive.trades >= 4) {
    regimeVerdict = "hurts";
    reasons.push("regime gate did not beat always-on on selected OOS");
  } else {
    regimeVerdict = "unclear";
    reasons.push("regime edge not repeatable enough to call");
  }

  let pairVerdict: PairVerdict = "reject";
  const pairOk =
    selected >= 2 &&
    tradable >= 2 &&
    (betaCv == null || betaCv < 0.25) &&
    (r2Min == null || r2Min >= 0.5) &&
    (hlMean == null || (hlMean >= 1.5 && hlMean <= 20)) &&
    withTrades.length >= 2;
  if (pairOk) pairVerdict = "survive";
  else if (
    selected >= 1 &&
    tradable >= 1 &&
    (r2Mean == null || r2Mean >= 0.45)
  ) {
    pairVerdict = "watch";
  } else {
    pairVerdict = "reject";
  }

  score = Math.max(0, Math.min(100, score));

  return {
    pairId: pair.id,
    label: `${pair.a.symbol} / ${pair.b.symbol}`,
    sector: pair.sector,
    pairVerdict,
    regimeVerdict,
    score,
    reasons,
    pairFit: {
      folds: folds.length,
      selected,
      tradable,
      betaMean,
      betaCv,
      hlMean,
      hlCv,
      kappaMean,
      kappaCv,
      r2Mean,
      r2Min,
    },
    oosRepeat: {
      foldsWithTrades: withTrades.length,
      concentrated,
    },
    report,
  };
}

export function rankUniverse(
  reports: ValidationReport[],
  asOf = Date.now(),
): UniverseReport {
  const cards = reports.map(scorePair).sort((a, b) => {
    const order: Record<PairVerdict, number> = {
      survive: 0,
      watch: 1,
      reject: 2,
    };
    const d = order[a.pairVerdict] - order[b.pairVerdict];
    if (d !== 0) return d;
    return b.score - a.score;
  });
  const survive = cards.filter((c) => c.pairVerdict === "survive").map((c) => c.pairId);
  const watch = cards.filter((c) => c.pairVerdict === "watch").map((c) => c.pairId);
  const reject = cards.filter((c) => c.pairVerdict === "reject").map((c) => c.pairId);
  const both = cards.filter(
    (c) => c.pairVerdict === "survive" && c.regimeVerdict === "helps",
  );
  let headline: string;
  if (both.length) {
    headline = `${both.map((c) => c.label).join(", ")} survive pair-fit and the regime gate.`;
  } else if (survive.length) {
    headline =
      "A pair can survive the OU screen without the regime gate proving itself. Rank is not return.";
  } else if (watch.length) {
    headline =
      "No pair survives yet. Watch names have a hedge, not repeatable OOS.";
  } else {
    headline = "No pair survived the research process on this tape.";
  }
  return {
    asOf,
    source: "yahoo",
    interval: "1d",
    cards,
    survive,
    watch,
    reject,
    headline,
  };
}

export const REGIME_KEYS: RegimeId[] = [
  "mean_reverting",
  "trending",
  "high_vol",
  "crisis",
];
