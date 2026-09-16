import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Panel, PnL } from "@/components/desk";
import { PairChart, ZChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import {
  MAX_HOLD_HOURS,
  PAIR,
  Z_ENTRY,
  Z_EXIT,
  Z_STOP,
  equityOf,
} from "@/lib/sim";
import { usd } from "@/lib/format";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

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
  const pos = filtered.position;
  const eq = equityOf(filtered, ko, pep);

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
            Ornstein–Uhlenbeck statistical arbitrage on {PAIR.a.symbol}/
            {PAIR.b.symbol}. Same model the naive book runs — the only
            difference is the gate.
          </p>
        </header>

        <div className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)] lg:col-span-1">
            <p className="text-xs text-muted-foreground">Live engine</p>
            <p className="mt-2 font-display text-2xl italic leading-none">
              Ornstein–Uhlenbeck
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Dollar-neutral log-spread. Mean reverts when Hurst is asleep.
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
          <Panel title="KO / PEP tape" className="lg:col-span-3">
            <PairChart data={history} />
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">z-score of log(KO) − log(PEP)</p>
              <ZChart data={history} />
            </div>
          </Panel>
          <Panel title="Rules" className="lg:col-span-2">
            <dl className="flex flex-col gap-3 text-sm">
              <Row k="Entry" v={`|z| > ${Z_ENTRY.toFixed(1)}`} />
              <Row k="Exit" v={`|z| < ${Z_EXIT}`} />
              <Row k="Stop" v={`|z| > ${Z_STOP}`} />
              <Row k="Time stop" v={`${MAX_HOLD_HOURS}h`} />
              <Row k="Hedge" v="Dollar-neutral" />
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
            Mark-to-market equity {usd(eq)} · realized {usd(filtered.realized)}
          </p>
        </Panel>
      </div>
    </AppShell>
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
