import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ForceRegime, Panel } from "@/components/desk";
import { RegimeGauges } from "@/components/gauges";
import { RegimeStrip } from "@/components/charts";
import { REGIME_META, REGIME_ORDER, SIGNAL_META } from "@/lib/sim";
import { WINDOW_DAYS } from "@/lib/regime-engine";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/regimes")({ component: RegimesPage });

function scoreTone(id: (typeof REGIME_ORDER)[number], active: boolean) {
  if (!active) return "bg-muted";
  if (id === "crisis") return "bg-down";
  if (id === "high_vol") return "bg-warn";
  if (id === "mean_reverting") return "bg-up";
  return "bg-primary";
}

function RegimesPage() {
  const signals = useSim((s) => s.signals);
  const signalZ = useSim((s) => s.signalZ);
  const regime = useSim((s) => s.regime);
  const classified = useSim((s) => s.classified);
  const scores = useSim((s) => s.scores);
  const confidence = useSim((s) => s.confidence);
  const engineN = useSim((s) => s.engineN);
  const history = useSim((s) => s.history);
  const force = useSim((s) => s.forceRegime);

  const maxAbs = Math.max(1.2, ...REGIME_ORDER.map((id) => Math.abs(scores[id] ?? 0)));

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="max-w-2xl">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Regime engine · 90-day z
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none italic sm:text-5xl">
            Know when the edge expires.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Six raw observables, each z-scored against a ninety-session window.
            Missing days are an India 2019–24 prior until the tape fills them.
            Weighted loadings pick the state. The OU book only enters in
            mean-reversion.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <ForceRegime />
          <p className="text-xs text-muted-foreground">
            Window {engineN}/{WINDOW_DAYS}
            {engineN < WINDOW_DAYS ? " · rest is prior" : ""} · confidence{" "}
            {(confidence * 100).toFixed(0)}%
            {force ? ` · engine says ${REGIME_META[classified].short}` : ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REGIME_ORDER.map((id) => {
            const active = regime === id;
            const v = scores[id] ?? 0;
            return (
              <div
                key={id}
                className={cn(
                  "rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]",
                  active && "bg-secondary",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {active ? "Classified now" : "Score"}
                </p>
                <p className="mt-2 font-display text-2xl italic leading-none">
                  {REGIME_META[id].label}
                </p>
                <p className="mt-3 font-mono text-sm tabular-nums">
                  {v >= 0 ? "+" : ""}
                  {v.toFixed(2)}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-background">
                  <div
                    className={cn("h-full rounded-full", scoreTone(id, active))}
                    style={{ width: `${Math.round((Math.abs(v) / maxAbs) * 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {REGIME_META[id].blurb}
                </p>
              </div>
            );
          })}
        </div>

        <Panel title="90-day z-score stack">
          <p className="mb-4 text-xs text-muted-foreground">
            Bars are centered at z = 0. Raw print on the left, z against the
            blended ninety-session window on the right. The classifier reads z,
            not the raw number.
          </p>
          <RegimeGauges signals={signals} z={signalZ} />
        </Panel>

        <Panel title="Regime tape">
          <RegimeStrip data={history} />
          <p className="mt-3 text-xs text-muted-foreground">
            Green mean-reverts. Gray trends. Amber is high vol. Red is crisis.
          </p>
        </Panel>

        <Panel title="How the engine decides">
          <ol className="flex flex-col gap-3 text-sm leading-relaxed">
            <li>
              <span className="font-medium">1. Raw six</span>
              <span className="text-muted-foreground">
                {" "}
                — Hurst of the pair spread, India VIX, Nifty realized vs implied,
                Nifty–Bank Nifty correlation, a CDS proxy, G-Sec slope proxy.
              </span>
            </li>
            <li>
              <span className="font-medium">2. Ninety-session z</span>
              <span className="text-muted-foreground">
                {" "}
                — each signal against its own rolling mean and σ. Until 90
                sessions exist, the gap is an India prior, not a made-up
                threshold.
              </span>
            </li>
            <li>
              <span className="font-medium">3. Loadings</span>
              <span className="text-muted-foreground">
                {" "}
                — four score vectors. Crisis loads on wide credit, high
                correlation, inverted vol. Trend loads on Hurst. Mean-rev is the
                home bias when z is quiet.
              </span>
            </li>
            <li>
              <span className="font-medium">4. Hysteresis</span>
              <span className="text-muted-foreground">
                {" "}
                — a state has to beat the current one by 0.32 (0.12 into or out
                of crisis). Stops the tape from flickering every hour.
              </span>
            </li>
          </ol>
          <ul className="mt-5 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {SIGNAL_META.map((m) => (
              <li key={m.key}>
                <span className="text-foreground">{m.label}.</span> {m.hint}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
