import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Panel, PnL } from "@/components/desk";
import { PairChart, ZChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import {
  MAX_HOLD_HOURS,
  Z_ENTRY,
  Z_EXIT,
  Z_STOP,
  equityOf,
  REGIME_META,
  REGIME_ORDER,
} from "@/lib/sim";
import { pairOf } from "@/lib/nse";
import { inr } from "@/lib/format";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { BookStats, ValidationReport } from "@/lib/validate-ou";

export const Route = createFileRoute("/strategy")({ component: StrategyPage });

const LOCKED = [
  {
    name: "Avellaneda–Stoikov",
    role: "Market making",
    note: "Inventory-aware quotes. Phase 6 — after OU is proven.",
  },
  {
    name: "Hawkes",
    role: "Order flow",
    note: "Self-exciting fills. Needs a live tape, not this paper clock.",
  },
  {
    name: "Heston",
    role: "Volatility",
    note: "Stochastic vol surface. Lives in high-vol regimes, not this pair.",
  },
];

function StrategyPage() {
  const history = useSim((s) => s.history);
  const filtered = useSim((s) => s.filtered);
  const ko = useSim((s) => s.ko);
  const pep = useSim((s) => s.pep);
  const z = useSim((s) => s.z);
  const regime = useSim((s) => s.regime);
  const filterOn = useSim((s) => s.filterOn);
  const pairId = useSim((s) => s.pairId);
  const pair = pairOf(pairId);
  const pos = filtered.position;
  const eq = equityOf(filtered, ko, pep);
  const ouFit = useSim((s) => s.ouFit);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="max-w-2xl">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Alpha engines
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none italic sm:text-5xl">
            Start with one pair.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Ornstein–Uhlenbeck statistical arbitrage on {pair.a.symbol}/
            {pair.b.symbol}. Same model the naive book runs — the only
            difference is the gate. Cash NSE, rupee-neutral log-spread.
          </p>
        </header>

        <div className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)] lg:col-span-1">
            <p className="text-xs text-muted-foreground">Live engine</p>
            <p className="mt-2 font-display text-2xl italic leading-none">
              Ornstein–Uhlenbeck
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Rupee-neutral log-spread. Mean reverts when Hurst is asleep.
            </p>
            <Badge className="mt-4" variant="up">
              Running
            </Badge>
          </div>
          {LOCKED.map((s) => (
            <div
              key={s.name}
              className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]"
            >
              <p className="text-xs text-muted-foreground">{s.role}</p>
              <p className="mt-2 font-display text-2xl italic leading-none">
                {s.name}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {s.note}
              </p>
              <Badge className="mt-4" variant="mute">
                Locked
              </Badge>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title={`${pair.a.symbol} / ${pair.b.symbol} tape`} className="lg:col-span-3">
            <PairChart data={history} a={pair.a.symbol} b={pair.b.symbol} />
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                z-score of the OU residual log({pair.a.symbol}) − α − β log(
                {pair.b.symbol})
              </p>
              <ZChart data={history} />
            </div>
          </Panel>
          <Panel title="Rules" className="lg:col-span-2">
            <dl className="flex flex-col gap-3 text-sm">
              <Row k="Entry" v={`|z| > ${Z_ENTRY.toFixed(1)}`} />
              <Row k="Exit" v={`|z| < ${Z_EXIT}`} />
              <Row k="Stop" v={`|z| > ${Z_STOP}`} />
              <Row k="Time stop" v={`${MAX_HOLD_HOURS}h`} />
              <Row k="Hedge" v={ouFit ? `β ${ouFit.beta.toFixed(2)} log` : "unfitted"} />
              <Row
                k="Half-life"
                v={ouFit ? `${ouFit.halfLife.toFixed(1)}d` : "—"}
              />
              <Row k="Hedge R²" v={ouFit ? ouFit.r2.toFixed(2) : "—"} />
              <Row
                k="Regime gate"
                v={filterOn ? "Mean-rev only" : "Off"}
              />
              <Row k="Crisis" v="Flatten filtered book" />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Current z {z.toFixed(2)} in a {regime.replace("_", "-")} tape.
              {pos
                ? " Position is on."
                : Math.abs(z) >= Z_ENTRY && regime !== "mean_reverting"
                  ? " Signal is live, gate is shut."
                  : " Waiting."}
            </p>
          </Panel>
        </div>

        <ValidationPanel />

        <Panel title="Recent fills — regime book">
          {filtered.trades.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Side</th>
                    <th className="pb-2 font-medium">Hours</th>
                    <th className="pb-2 font-medium">Entry z</th>
                    <th className="pb-2 font-medium">Why</th>
                    <th className="pb-2 text-right font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.trades
                    .slice()
                    .reverse()
                    .slice(0, 12)
                    .map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2">
                          {t.side === "long_spread" ? "Long spread" : "Short spread"}
                        </td>
                        <td className="py-2 font-mono tabular-nums">
                          {t.closedAt - t.openedAt}h
                        </td>
                        <td className="py-2 font-mono tabular-nums">
                          {t.zEntry.toFixed(2)}
                        </td>
                        <td className="py-2 capitalize text-muted-foreground">
                          {t.reason}
                        </td>
                        <td className="py-2 text-right">
                          <PnL n={t.pnl} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Mark-to-market equity {inr(eq)} · realized {inr(filtered.realized)}
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}

function istDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtSharpe(n: number | null) {
  return n == null ? "—" : n.toFixed(2);
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function BookCells({ b }: { b: BookStats }) {
  return (
    <>
      <td className="py-2 text-right">
        <PnL n={b.pnl} />
      </td>
      <td className="py-2 text-right font-mono tabular-nums">{fmtSharpe(b.sharpe)}</td>
      <td className="py-2 text-right font-mono tabular-nums">{fmtPct(b.maxDd)}</td>
      <td className="py-2 text-right font-mono tabular-nums">{b.trades}</td>
      <td className="py-2 text-right font-mono tabular-nums">
        {b.winRate == null ? "—" : fmtPct(b.winRate)}
      </td>
      <td className="py-2 text-right font-mono tabular-nums">{fmtPct(b.timeIn)}</td>
    </>
  );
}

function ValidationPanel() {
  const v = useSim((s) => s.validation);
  const feed = useSim((s) => s.feedStatus);
  return (
    <Panel title="Walk-forward · NSE daily tape">
      {!v ? (
        <p className="text-sm text-muted-foreground">
          {feed === "loading"
            ? "Fetching a 2-year daily tape (pair, India VIX, Nifty, Bank Nifty, USD/INR, gilt ETFs)."
            : "No daily tape on this pair yet. Live desk is paper-forward only."}
        </p>
      ) : (
        <ValidationBody v={v} />
      )}
    </Panel>
  );
}

function ValidationBody({ v }: { v: ValidationReport }) {
  const flags = [
    ["Pair", v.integrity.pair.ok],
    ["India VIX", v.integrity.vix.ok],
    ["Nifty", v.integrity.nifty.ok],
    ["Bank Nifty", v.integrity.bank.ok],
    ["USD/INR", v.integrity.usdInr.ok],
    ["Gilt ETFs", v.integrity.gilt.ok],
  ] as const;
  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {v.status === "invalid" ? (
          <>INVALID. {v.reason}. No dummy macros, no backtest.</>
        ) : (
          <>
            Train 6m / validate 3m / OOS 3m, rolled. OU (β, κ, θ, σ) frozen at
            train end. {v.selectedFolds} selected fold
            {v.selectedFolds === 1 ? "" : "s"} of {v.folds.length}. Yahoo delayed.
          </>
        )}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {flags.map(([label, ok]) => (
          <li
            key={label}
            className={cn(
              "rounded-md px-2 py-1",
              ok ? "bg-secondary text-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {label} {ok ? "live" : "missing"}
          </li>
        ))}
      </ul>
      {v.lastFit ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Row k="β" v={v.lastFit.beta.toFixed(3)} />
          <Row k="Half-life" v={`${v.lastFit.halfLife.toFixed(1)}d`} />
          <Row k="κ" v={v.lastFit.kappa.toFixed(1)} />
          <Row k="R²" v={v.lastFit.r2.toFixed(2)} />
        </dl>
      ) : null}
      {v.folds.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Fold</th>
                <th className="pb-2 font-medium">Train → OOS</th>
                <th className="pb-2 font-medium">Select</th>
                <th className="pb-2 text-right font-medium">OOS gated</th>
                <th className="pb-2 text-right font-medium">OOS naive</th>
              </tr>
            </thead>
            <tbody>
              {v.folds.map((f) => (
                <tr key={f.i} className="border-t border-border">
                  <td className="py-2 font-mono tabular-nums">{f.i}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {istDate(f.trainFrom)} → {istDate(f.oosTo)}
                  </td>
                  <td className="py-2 text-xs">
                    {f.selected ? "yes" : f.reason}
                  </td>
                  <td className="py-2 text-right">
                    <PnL n={f.oos.filtered.pnl} />
                  </td>
                  <td className="py-2 text-right">
                    <PnL n={f.oos.naive.pnl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {v.pooled ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Pooled OOS</th>
                  <th className="pb-2 text-right font-medium">P&L</th>
                  <th className="pb-2 text-right font-medium">Sharpe</th>
                  <th className="pb-2 text-right font-medium">Max DD</th>
                  <th className="pb-2 text-right font-medium">Trades</th>
                  <th className="pb-2 text-right font-medium">Win</th>
                  <th className="pb-2 text-right font-medium">Time in</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-2">Regime-gated OU</td>
                  <BookCells b={v.pooled.filtered} />
                </tr>
                <tr className="border-t border-border">
                  <td className="py-2 text-muted-foreground">Always-on OU</td>
                  <BookCells b={v.pooled.naive} />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Regime (OOS)</th>
                  <th className="pb-2 text-right font-medium">Gated P&L</th>
                  <th className="pb-2 text-right font-medium">Naive P&L</th>
                  <th className="pb-2 text-right font-medium">Gated n</th>
                  <th className="pb-2 text-right font-medium">Naive n</th>
                </tr>
              </thead>
              <tbody>
                {REGIME_ORDER.map((id) => {
                  const sl = v.pooled!.byRegime[id];
                  return (
                    <tr key={id} className="border-t border-border">
                      <td className="py-2">{REGIME_META[id].label}</td>
                      <td className="py-2 text-right">
                        <PnL n={sl.filtered.pnl} />
                      </td>
                      <td className="py-2 text-right">
                        <PnL n={sl.naive.pnl} />
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {sl.filtered.trades}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {sl.naive.trades}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Gate edge <PnL n={v.pooled.edge} /> vs always-on on selected OOS.
            Last classified {v.lastRegime.replace("_", "-")}.
          </p>
        </>
      ) : null}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("font-mono text-sm tabular-nums")}>{v}</dd>
    </div>
  );
}
