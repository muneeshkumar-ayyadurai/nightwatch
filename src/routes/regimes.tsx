import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ForceRegime, Panel } from "@/components/desk";
import { RegimeGauges } from "@/components/gauges";
import { RegimeStrip } from "@/components/charts";
import { REGIME_META, REGIME_ORDER, SIGNAL_META } from "@/lib/sim";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/regimes")({ component: RegimesPage });

function RegimesPage() {
  const signals = useSim((s) => s.signals);
  const regime = useSim((s) => s.regime);
  const latent = useSim((s) => s.latent);
  const history = useSim((s) => s.history);
  const force = useSim((s) => s.forceRegime);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="max-w-2xl">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Regime intelligence
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none italic sm:text-5xl">
            Know when the edge expires.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Six observables, ninety-hour normalization, a four-state classifier.
            The highest-leverage tool is not a better strategy — it is the
            weather report that says this one is about to stop working.
          </p>
        </header>

        <ForceRegime />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REGIME_ORDER.map((id) => {
            const active = regime === id;
            return (
              <div
                key={id}
                className={cn(
                  "rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]",
                  active && "bg-secondary",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {active ? "Classified now" : "State"}
                </p>
                <p className="mt-2 font-display text-2xl italic leading-none">
                  {REGIME_META[id].label}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {REGIME_META[id].blurb}
                </p>
              </div>
            );
          })}
        </div>

        <Panel title="Signal stack">
          <p className="mb-4 text-xs text-muted-foreground">
            Latent DGP is {REGIME_META[latent].label}
            {force ? " (forced)" : ""}. Classifier reads the gauges, not the
            hidden state — so there is a short lag, the way a real desk would
            see it.
          </p>
          <RegimeGauges signals={signals} />
        </Panel>

        <Panel title="Regime tape">
          <RegimeStrip data={history} />
          <p className="mt-3 text-xs text-muted-foreground">
            Green mean-reverts. Gray trends. Amber is high vol. Red is crisis.
          </p>
        </Panel>

        <Panel title="How the classifier decides">
          <ol className="flex flex-col gap-3 text-sm leading-relaxed">
            <li>
              <span className="font-medium">Crisis</span>
              <span className="text-muted-foreground">
                {" "}
                — credit above 720 bps, correlation above 0.86, or VIX term
                backwardated past −0.85.
              </span>
            </li>
            <li>
              <span className="font-medium">High vol</span>
              <span className="text-muted-foreground">
                {" "}
                — realized−implied above 0.48 or inverted vol curve.
              </span>
            </li>
            <li>
              <span className="font-medium">Trending</span>
              <span className="text-muted-foreground">
                {" "}
                — Hurst exponent above 0.55.
              </span>
            </li>
            <li>
              <span className="font-medium">Mean-reverting</span>
              <span className="text-muted-foreground">
                {" "}
                — everything else. This is the only state the OU book may enter.
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
