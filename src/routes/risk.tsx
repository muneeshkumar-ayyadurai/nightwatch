import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Panel, Pct, PnL, Stat } from "@/components/desk";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  equityOf,
  maxDrawdown,
  simSharpe,
  winRate,
} from "@/lib/sim";
import { pct } from "@/lib/format";
import { useSim } from "@/lib/store";

export const Route = createFileRoute("/risk")({ component: RiskPage });

function RiskPage() {
  const filtered = useSim((s) => s.filtered);
  const naive = useSim((s) => s.naive);
  const ko = useSim((s) => s.ko);
  const pep = useSim((s) => s.pep);
  const history = useSim((s) => s.history);
  const kellyBlend = useSim((s) => s.kellyBlend);
  const maxDd = useSim((s) => s.maxDd);
  const dailyLoss = useSim((s) => s.dailyLoss);
  const autoFlatten = useSim((s) => s.autoFlattenCrisis);
  const killed = useSim((s) => s.killed);
  const setKelly = useSim((s) => s.setKellyBlend);
  const setMaxDd = useSim((s) => s.setMaxDd);
  const setDaily = useSim((s) => s.setDailyLoss);
  const setAuto = useSim((s) => s.setAutoFlatten);
  const kill = useSim((s) => s.kill);
  const resume = useSim((s) => s.resume);

  const fe = equityOf(filtered, ko, pep);
  const ne = equityOf(naive, ko, pep);
  const fSeries = history.map((p) => p.filtered);
  const nSeries = history.map((p) => p.naive);
  const fDd = maxDrawdown(fSeries);
  const nDd = maxDrawdown(nSeries);
  const fSh = simSharpe(history, "filtered");
  const nSh = simSharpe(history, "naive");
  const fWin = winRate(filtered);
  const nWin = winRate(naive);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="max-w-2xl">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Portfolio and risk
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none italic sm:text-5xl">
            Risk is not a slide. It is a switch.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Half-Kelly sizing, a daily-loss cap, a drawdown cap, and a kill
            switch that actually flattens. Non-negotiable — even on paper.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
            <Stat label="Regime Sharpe (sim)">
              {fSh == null ? "—" : fSh.toFixed(2)}
            </Stat>
            <p className="mt-2 text-xs text-muted-foreground">
              Always-on {nSh == null ? "—" : nSh.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
            <Stat label="Regime max DD">
              <Pct n={-fDd} />
            </Stat>
            <p className="mt-2 text-xs text-muted-foreground">
              Always-on <Pct n={-nDd} />
            </p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
            <Stat label="Win rate">
              {fWin == null ? "—" : pct(fWin, 0)}
            </Stat>
            <p className="mt-2 text-xs text-muted-foreground">
              Always-on {nWin == null ? "—" : pct(nWin, 0)} · {filtered.trades.length} trades
            </p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]">
            <Stat label="Edge vs naive">
              <PnL n={fe - ne} />
            </Stat>
            <p className="mt-2 text-xs text-muted-foreground">
              Starting capital $100,000 paper
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Sizing">
            <label className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Kelly blend</span>
                <span className="font-mono tabular-nums">
                  {(kellyBlend * 100).toFixed(0)}% of full Kelly
                </span>
              </div>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={kellyBlend}
                onChange={(e) => setKelly(Number(e.target.value))}
                className="h-10 w-full accent-primary"
              />
            </label>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Fraction of Kelly from the last twenty trades of each book, then
              scaled by this blend. Capped at 18% of equity per entry.
            </p>
          </Panel>

          <Panel title="Limits">
            <label className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Max drawdown</span>
                <span className="font-mono tabular-nums">
                  {(maxDd * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.04}
                max={0.2}
                step={0.01}
                value={maxDd}
                onChange={(e) => setMaxDd(Number(e.target.value))}
                className="h-10 w-full accent-primary"
              />
            </label>
            <label className="mt-4 flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Daily loss cap</span>
                <span className="font-mono tabular-nums">
                  {(dailyLoss * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.01}
                max={0.08}
                step={0.01}
                value={dailyLoss}
                onChange={(e) => setDaily(Number(e.target.value))}
                className="h-10 w-full accent-primary"
              />
            </label>
          </Panel>
        </div>

        <Panel title="Switches">
          <div className="flex flex-col gap-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm">Flatten on crisis</span>
                <span className="text-xs text-muted-foreground">
                  Regime book exits when the classifier trips crisis. Naive book
                  does not.
                </span>
              </span>
              <Switch checked={autoFlatten} onCheckedChange={setAuto} />
            </label>
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm">Kill switch</span>
                <span className="text-xs text-muted-foreground">
                  Flatten both books and halt entries. Resume when you mean it.
                </span>
              </span>
              {killed ? (
                <Button size="sm" onClick={resume}>
                  Resume desk
                </Button>
              ) : (
                <Button size="sm" variant="kill" onClick={kill}>
                  Arm kill
                </Button>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
