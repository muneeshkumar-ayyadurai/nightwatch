import type { ReactNode } from "react";
import { REGIME_META, REGIME_ORDER, INITIAL_EQUITY, equityOf, type Book } from "@/lib/sim";
import { NSE_PAIRS, pairOf } from "@/lib/nse";
import { pct, inr, inrSigned } from "@/lib/format";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EquityChart, PairChart, RegimeStrip, ZChart } from "@/components/charts";
import { RegimeGauges } from "@/components/gauges";
import { regimeBadge } from "@/components/app-shell";

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-card p-4 text-card-foreground shadow-[var(--shadow-border)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PnL({ n, digits = 0 }: { n: number; digits?: 0 | 2 }) {
  const tone = n > 0.5 ? "text-up" : n < -0.5 ? "text-down" : "text-muted-foreground";
  return <span className={cn("font-mono tabular-nums", tone)}>{inrSigned(n, digits)}</span>;
}

export function Pct({ n }: { n: number }) {
  const tone = n > 0.0005 ? "text-up" : n < -0.0005 ? "text-down" : "text-muted-foreground";
  return <span className={cn("font-mono tabular-nums", tone)}>{pct(n)}</span>;
}

export function Stat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-lg font-medium tracking-tight">{children}</div>
    </div>
  );
}

function Briefing() {
  const regime = useSim((s) => s.regime);
  const filterOn = useSim((s) => s.filterOn);
  const filtered = useSim((s) => s.filtered);
  const naive = useSim((s) => s.naive);
  const ko = useSim((s) => s.ko);
  const pep = useSim((s) => s.pep);
  const fe = equityOf(filtered, ko, pep);
  const ne = equityOf(naive, ko, pep);
  return (
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
      Morning note. Classifier is {REGIME_META[regime].label.toLowerCase()}.
      Filter is {filterOn ? "on" : "off"}. Regime book{" "}
      <PnL n={fe - INITIAL_EQUITY} /> vs always-on <PnL n={ne - INITIAL_EQUITY} />. The
      always-on book is the control — the version of you that never sits down.
    </p>
  );
}

export function ForceRegime() {
  const force = useSim((s) => s.forceRegime);
  const setForce = useSim((s) => s.setForceRegime);
  const regime = useSim((s) => s.regime);

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setForce(null)}
        className={cn(
          "h-8 rounded-md px-3 text-xs transition-colors duration-(--motion-quick)",
          force === null
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground shadow-[var(--shadow-border)] hover:text-foreground",
        )}
      >
        Auto
      </button>
      {REGIME_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setForce(id)}
          className={cn(
            "h-8 rounded-md px-3 text-xs transition-colors duration-(--motion-quick)",
            force === id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground shadow-[var(--shadow-border)] hover:text-foreground",
          )}
        >
          {REGIME_META[id].short}
        </button>
      ))}
      <Badge variant={regimeBadge(regime)} className="ml-1 self-center">
        now {REGIME_META[regime].short}
      </Badge>
    </div>
  );
}

export function PairPicker() {
  const pairId = useSim((s) => s.pairId);
  const setPair = useSim((s) => s.setPair);
  const feedStatus = useSim((s) => s.feedStatus);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {NSE_PAIRS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPair(p.id)}
            className={cn(
              "h-11 rounded-md px-3 text-xs transition-colors duration-(--motion-quick) sm:h-8",
              pairId === p.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground shadow-[var(--shadow-border)] hover:text-foreground",
            )}
          >
            {p.a.symbol}/{p.b.symbol}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {pairOf(pairId).sector}
        {" · "}
        {feedStatus === "nse"
          ? "NSE 1h tape, paper forward"
          : feedStatus === "loading"
            ? "Fetching NSE 1h…"
            : "Simulated tape · feed offline"}
      </p>
    </div>
  );
}

export function DeskView() {
  const history = useSim((s) => s.history);
  const filtered = useSim((s) => s.filtered);
  const naive = useSim((s) => s.naive);
  const ko = useSim((s) => s.ko);
  const pep = useSim((s) => s.pep);
  const z = useSim((s) => s.z);
  const signals = useSim((s) => s.signals);
  const filterOn = useSim((s) => s.filterOn);
  const setFilterOn = useSim((s) => s.setFilterOn);
  const alerts = useSim((s) => s.alerts);
  const force = useSim((s) => s.forceRegime);
  const killed = useSim((s) => s.killed);
  const pairId = useSim((s) => s.pairId);
  const pair = pairOf(pairId);

  const fe = equityOf(filtered, ko, pep);
  const ne = equityOf(naive, ko, pep);
  const fp = fe - INITIAL_EQUITY;
  const np = ne - INITIAL_EQUITY;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            NSE paper desk
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none italic sm:text-5xl">
            The strategy is not the edge.
          </h1>
          <Briefing />
          <div className="mt-4">
            <PairPicker />
          </div>
        </div>
        <ForceRegime />
      </header>

      {force ? (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm">
          Manual override — latent market is{" "}
          <span className="font-medium">{REGIME_META[force].label}</span>. Watch
          the regime book flatten while the naive book keeps reaching.
        </p>
      ) : null}
      {killed ? (
        <p className="rounded-xl bg-down/15 px-4 py-3 text-sm text-down">
          Kill switch is armed. Both books are in cash.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Regime book</p>
          <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
            {inr(fe)}
          </p>
          <p className="mt-1 text-sm">
            <PnL n={fp} /> <Pct n={fp / INITIAL_EQUITY} />
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Always-on OU</p>
          <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight text-muted-foreground">
            {inr(ne)}
          </p>
          <p className="mt-1 text-sm">
            <PnL n={np} /> <Pct n={np / INITIAL_EQUITY} />
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Spread z-score</p>
          <p
            className={cn(
              "mt-2 font-mono text-2xl tabular-nums tracking-tight",
              Math.abs(z) >= 2 ? "text-down" : "text-foreground",
            )}
          >
            {z.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Entry |z| ≥ 1.75 · exit |z| ≤ 0.4
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">
            {pair.a.symbol} / {pair.b.symbol}
          </p>
          <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
            {ko.toFixed(2)}
          </p>
          <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
            {pair.b.symbol} {pep.toFixed(2)}
          </p>
        </div>
      </div>

      <Panel
        title="Equity — regime filter vs always-on"
        action={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Filter
            <Switch checked={filterOn} onCheckedChange={setFilterOn} />
          </label>
        }
      >
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-filtered" /> Regime book
          </span>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-naive" /> Always-on
          </span>
        </div>
        <EquityChart data={history} />
        <div className="mt-3">
          <RegimeStrip data={history} />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-up" /> Mean-rev
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-muted" /> Trend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-warn" /> High vol
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-down" /> Crisis
            </span>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Pair tape" className="lg:col-span-3">
          <PairChart data={history} a={pair.a.symbol} b={pair.b.symbol} />
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">Log-spread z-score</p>
            <ZChart data={history} />
          </div>
        </Panel>
        <Panel title="Six signals" className="lg:col-span-2">
          <RegimeGauges signals={signals} compact />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Open books">
          <BookRow
            name="Regime book"
            book={filtered}
            ko={ko}
            pep={pep}
            paused={filtered.paused}
          />
          <div className="my-3 h-px bg-border" />
          <BookRow name="Always-on OU" book={naive} ko={ko} pep={pep} muted />
        </Panel>
        <Panel title="Alerts">
          <ul className="flex flex-col gap-3">
            {alerts
              .slice()
              .reverse()
              .slice(0, 6)
              .map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      a.level === "crit"
                        ? "bg-down"
                        : a.level === "warn"
                          ? "bg-warn"
                          : "bg-muted",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.body}</p>
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function BookRow({
  name,
  book,
  ko,
  pep,
  muted,
  paused,
}: {
  name: string;
  book: Book;
  ko: number;
  pep: number;
  muted?: boolean;
  paused?: boolean;
}) {
  const pos = book.position;
  const eq = equityOf(book, ko, pep);
  const mtm = eq - book.realized;
  return (
    <div className={cn(muted && "opacity-80")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{name}</p>
        {paused ? <Badge variant="warn">Risk pause</Badge> : null}
      </div>
      {pos ? (
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Meta
            label="Side"
            value={pos.side === "long_spread" ? "Long spread" : "Short spread"}
          />
          <Meta label="Notional" value={inr(pos.notional)} />
          <Meta label="Entry z" value={pos.zEntry.toFixed(2)} />
          <Meta label="Open P&L" value={<PnL n={mtm} />} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Flat. Waiting for a signal.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {book.trades.length} closed trades
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
