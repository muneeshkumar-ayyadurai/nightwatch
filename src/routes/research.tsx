import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Panel, PnL } from "@/components/desk";
import { Badge } from "@/components/ui/badge";
import { fetchResearchReport } from "@/lib/nse-feed";
import { REGIME_META, REGIME_ORDER } from "@/lib/sim";
import type { PairResearch, UniverseReport } from "@/lib/research";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/research")({ component: ResearchPage });

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtN(n: number | null | undefined, d = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function pairBadge(v: PairResearch["pairVerdict"]): "up" | "warn" | "down" {
  if (v === "survive") return "up";
  if (v === "watch") return "warn";
  return "down";
}

function regimeBadge(v: PairResearch["regimeVerdict"]): "up" | "warn" | "down" | "mute" {
  if (v === "helps") return "up";
  if (v === "hurts") return "down";
  if (v === "unclear") return "warn";
  return "mute";
}

function ResearchPage() {
  const [uni, setUni] = useState<UniverseReport | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchResearchReport()
      .then((r) => {
        if (!live) return;
        if (!r) setErr(true);
        else setUni(r);
      })
      .catch(() => {
        if (live) setErr(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="max-w-2xl">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Pair research
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none italic sm:text-5xl">
            Survive the process. Not the leaderboard.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Same 6m / 3m / 3m walk-forward on every cash pair. Ranked by β
            stability, hedge R², and repeatable OOS — never by who printed the
            most. Pair-fit and the regime gate are scored separately.
          </p>
        </header>

        {!uni && !err ? (
          <Panel title="Universe">
            <p className="text-sm text-muted-foreground">
              Fetching a 2-year daily tape for five pairs plus India VIX, Nifty,
              Bank Nifty, USD/INR, gilt ETFs.
            </p>
          </Panel>
        ) : null}
        {err && !uni ? (
          <Panel title="Universe">
            <p className="text-sm text-muted-foreground">
              Daily tape did not come back. No dummy report.
            </p>
          </Panel>
        ) : null}
        {uni ? <UniverseBody uni={uni} open={open} setOpen={setOpen} /> : null}
      </div>
    </AppShell>
  );
}

function UniverseBody({
  uni,
  open,
  setOpen,
}: {
  uni: UniverseReport;
  open: string | null;
  setOpen: (id: string | null) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat k="Survive" v={String(uni.survive.length)} hint="Stable OU, repeatable OOS" />
        <Stat k="Watch" v={String(uni.watch.length)} hint="A hedge, not a book yet" />
        <Stat k="Reject" v={String(uni.reject.length)} hint="Broke the screen" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{uni.headline}</p>

      <Panel title="Universe — 2y Yahoo daily">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Pair</th>
                <th className="pb-2 font-medium">Pair fit</th>
                <th className="pb-2 font-medium">Regime</th>
                <th className="pb-2 text-right font-medium">Folds</th>
                <th className="pb-2 text-right font-medium">β</th>
                <th className="pb-2 text-right font-medium">β cv</th>
                <th className="pb-2 text-right font-medium">hl</th>
                <th className="pb-2 text-right font-medium">R²</th>
                <th className="pb-2 text-right font-medium">OOS gated</th>
                <th className="pb-2 text-right font-medium">OOS naive</th>
                <th className="pb-2 text-right font-medium">Edge</th>
              </tr>
            </thead>
            <tbody>
              {uni.cards.map((c) => {
                const p = c.report.pooled;
                const active = open === c.pairId;
                return (
                  <tr
                    key={c.pairId}
                    className={cn(
                      "cursor-pointer border-t border-border",
                      active && "bg-secondary/40",
                    )}
                    onClick={() => setOpen(active ? null : c.pairId)}
                  >
                    <td className="py-2">
                      <p className="font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.sector}</p>
                    </td>
                    <td className="py-2">
                      <Badge variant={pairBadge(c.pairVerdict)}>{c.pairVerdict}</Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={regimeBadge(c.regimeVerdict)}>{c.regimeVerdict}</Badge>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {c.pairFit.selected}/{c.pairFit.folds}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {fmtN(c.pairFit.betaMean, 2)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {fmtN(c.pairFit.betaCv, 2)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {c.pairFit.hlMean == null ? "—" : `${c.pairFit.hlMean.toFixed(1)}d`}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {fmtN(c.pairFit.r2Mean, 2)}
                    </td>
                    <td className="py-2 text-right">
                      {p ? <PnL n={p.filtered.pnl} /> : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {p ? <PnL n={p.naive.pnl} /> : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {p ? <PnL n={p.edge} /> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Click a row. Score ignores total return.
        </p>
      </Panel>

      {uni.cards
        .filter((c) => c.pairId === open)
        .map((c) => (
          <CardDetail key={c.pairId} c={c} />
        ))}
    </>
  );
}

function Stat({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="mt-2 font-display text-3xl italic leading-none">{v}</p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function CardDetail({ c }: { c: PairResearch }) {
  const p = c.report.pooled;
  const f = p?.filtered;
  return (
    <Panel title={`${c.label} — research card`}>
      <ul className="mb-4 flex flex-col gap-1 text-sm text-muted-foreground">
        {c.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {f && p ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Selected OOS</th>
                <th className="pb-2 text-right font-medium">CAGR</th>
                <th className="pb-2 text-right font-medium">Sharpe</th>
                <th className="pb-2 text-right font-medium">Max DD</th>
                <th className="pb-2 text-right font-medium">Down vol</th>
                <th className="pb-2 text-right font-medium">Trades</th>
                <th className="pb-2 text-right font-medium">Win</th>
                <th className="pb-2 text-right font-medium">Time in</th>
                <th className="pb-2 text-right font-medium">Turnover</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="py-2">Gated</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(f.cagr)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtN(f.sharpe)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(f.maxDd)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(f.downsideVol)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{f.trades}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(f.winRate)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(f.timeIn)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{f.turnover.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-2 text-muted-foreground">Naive</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(p.naive.cagr)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtN(p.naive.sharpe)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(p.naive.maxDd)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(p.naive.downsideVol)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{p.naive.trades}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(p.naive.winRate)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{fmtPct(p.naive.timeIn)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{p.naive.turnover.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{c.report.reason}</p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Fold</th>
              <th className="pb-2 font-medium">Select</th>
              <th className="pb-2 text-right font-medium">β</th>
              <th className="pb-2 text-right font-medium">hl</th>
              <th className="pb-2 text-right font-medium">R²</th>
              <th className="pb-2 text-right font-medium">OOS gated</th>
              <th className="pb-2 text-right font-medium">OOS naive</th>
            </tr>
          </thead>
          <tbody>
            {c.report.folds.map((f) => (
              <tr key={f.i} className="border-t border-border">
                <td className="py-2 font-mono tabular-nums">{f.i}</td>
                <td className="py-2 text-xs">{f.selected ? "yes" : f.reason}</td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {f.fit ? f.fit.beta.toFixed(2) : "—"}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {f.fit ? `${f.fit.halfLife.toFixed(1)}d` : "—"}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {f.fit ? f.fit.r2.toFixed(2) : "—"}
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

      {p ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Regime OOS</th>
                <th className="pb-2 text-right font-medium">Bars</th>
                <th className="pb-2 text-right font-medium">Gated</th>
                <th className="pb-2 text-right font-medium">Naive</th>
              </tr>
            </thead>
            <tbody>
              {REGIME_ORDER.map((id) => {
                const sl = p.byRegime[id];
                return (
                  <tr key={id} className="border-t border-border">
                    <td className="py-2">{REGIME_META[id].label}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{sl.bars}</td>
                    <td className="py-2 text-right">
                      <PnL n={sl.filtered.pnl} />
                    </td>
                    <td className="py-2 text-right">
                      <PnL n={sl.naive.pnl} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}
