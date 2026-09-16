import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  INITIAL_EQUITY,
  REGIME_META,
  SIGNAL_META,
  equityOf,
  maxDrawdown,
} from "@/lib/sim";
import { readWaitlist, writeWaitlist } from "@/lib/prefs";
import { inr } from "@/lib/format";
import { useSim } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EquityChart, RegimeStrip } from "@/components/charts";
import { PnL, Pct } from "@/components/desk";
import { regimeBadge } from "@/components/app-shell";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-sm md:px-8">
        <Link to="/" className="font-display text-2xl italic leading-none">
          Nightwatch
        </Link>
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            to="/method"
            className="inline-flex h-11 items-center px-3 text-sm text-muted-foreground hover:text-foreground sm:h-10"
          >
            Method
          </Link>
          <Button asChild size="sm" className="h-11 sm:h-8">
            <Link to="/desk">
              Open desk
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xl italic">Nightwatch</p>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
              NSE cash tape. Not a broker, not an offer of securities,
              not investment advice. Live capital is a waitlist, not a button.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Data + discipline + a gate that can say no.
          </p>
        </div>
      </footer>
    </div>
  );
}

export function LandingView() {
  return (
    <MarketingShell>
      <Hero />
      <Proof />
      <Signals />
      <Pipeline />
      <Access />
    </MarketingShell>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2 md:items-center md:px-8 md:py-20">
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          One-person fund OS · NSE paper
        </p>
        <h1 className="mt-4 font-display text-5xl leading-none italic tracking-tight sm:text-6xl">
          The highest-leverage tool is not a better strategy.
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
          Nightwatch is the weather report that tells you when the current one
          is about to stop working. Ornstein–Uhlenbeck on NSE cash pairs —
          HDFC/ICICI, HUL/ITC, TCS/INFY — gated by India VIX, G-Sec, and
          Nifty–Bank Nifty, with a kill switch that actually flattens.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/desk">
              Enter the paper desk
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/method">Read the method</Link>
          </Button>
        </div>
      </div>
      <LiveCard />
    </section>
  );
}

function LiveCard() {
  const history = useSim((s) => s.history);
  const filtered = useSim((s) => s.filtered);
  const naive = useSim((s) => s.naive);
  const ko = useSim((s) => s.ko);
  const pep = useSim((s) => s.pep);
  const regime = useSim((s) => s.regime);
  const fe = equityOf(filtered, ko, pep);
  const ne = equityOf(naive, ko, pep);

  return (
    <div className="rounded-2xl bg-card p-4 text-card-foreground shadow-[var(--shadow-border)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Live NSE tape</p>
        <Badge variant={regimeBadge(regime)}>{REGIME_META[regime].short}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Regime book</p>
          <p className="mt-1 font-mono text-xl tabular-nums">{inr(fe)}</p>
          <p className="mt-1 text-sm">
            <PnL n={fe - INITIAL_EQUITY} />
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Always-on OU</p>
          <p className="mt-1 font-mono text-xl tabular-nums text-muted-foreground">
            {inr(ne)}
          </p>
          <p className="mt-1 text-sm">
            <PnL n={ne - INITIAL_EQUITY} />
          </p>
        </div>
      </div>
      <div className="mt-4">
        <EquityChart data={history} />
        <div className="mt-3">
          <RegimeStrip data={history} />
        </div>
      </div>
    </div>
  );
}

function Proof() {
  const history = useSim((s) => s.history);
  const filtered = useSim((s) => s.filtered);
  const naive = useSim((s) => s.naive);
  const ko = useSim((s) => s.ko);
  const pep = useSim((s) => s.pep);
  const fe = equityOf(filtered, ko, pep);
  const ne = equityOf(naive, ko, pep);
  const fDd = maxDrawdown(history.map((p) => p.filtered));
  const nDd = maxDrawdown(history.map((p) => p.naive));

  return (
    <section className="border-y border-border">
      <div className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-3">
        <Metric
          label="Edge vs always-on"
          value={<PnL n={fe - ne} />}
        />
        <Metric
          label="Regime max drawdown"
          value={<Pct n={-fDd} />}
        />
        <Metric
          label="Naive max drawdown"
          value={<Pct n={-nDd} />}
        />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-background px-4 py-8 md:px-8">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 font-display text-4xl italic leading-none">{value}</div>
    </div>
  );
}

function Signals() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">
        Regime intelligence
      </p>
      <h2 className="mt-3 max-w-xl font-display text-4xl italic leading-none">
        Six observables. Four states. One gate.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Mean-reversion is a guest in trending and a victim in crisis. Nightwatch
        classifies the tape every simulated hour and will not let OU enter
        unless the market is actually mean-reverting.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SIGNAL_META.map((m) => (
          <li
            key={m.key}
            className="rounded-2xl bg-card p-4 shadow-[var(--shadow-border)]"
          >
            <p className="text-sm font-medium">{m.label}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {m.hint}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PIPE = [
  { n: "01", t: "Data", d: "Prices, vol, USD/INR, the curve. Clean history, then the live clock." },
  { n: "02", t: "Signals", d: "Six gauges, ninety-session z-score. No opinions in the stack." },
  { n: "03", t: "Regime", d: "Crisis, high vol, trend, or mean-rev. The classifier reads gauges, not the hidden state." },
  { n: "04", t: "Strategy", d: "Start with OU. Avellaneda–Stoikov, Hawkes, and Heston stay locked until this one is proven." },
  { n: "05", t: "Risk", d: "Half-Kelly, daily-loss cap, drawdown cap. Flatten on crisis." },
  { n: "06", t: "Kill", d: "A switch that closes both books. Human still approves. AI still does the grunt work." },
];

function Pipeline() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <h2 className="font-display text-4xl italic leading-none">
          Start simple. Prove it. Expand.
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PIPE.map((s) => (
            <li key={s.n}>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {s.n}
              </p>
              <p className="mt-2 text-sm font-medium">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.d}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Access() {
  return (
    <section id="access" className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:px-8">
        <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Now</p>
          <h3 className="mt-2 font-display text-3xl italic leading-none">
            Paper
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Full desk. Simulated tape. Two books. Kill switch. No account.
            This is the product you can use tonight.
          </p>
          <Button asChild className="mt-6">
            <Link to="/desk">Open paper desk</Link>
          </Button>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Later</p>
          <h3 className="mt-2 font-display text-3xl italic leading-none">
            Live
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Small-capital broker path. Same gate, real fills. Not for sale as a
            button — join the list and we will not pretend it is live today.
          </p>
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSaved(readWaitlist());
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError("Use a real email.");
      return;
    }
    writeWaitlist(next);
    setSaved(next);
    setError("");
  }

  if (saved) {
    return (
      <p className="mt-6 text-sm leading-relaxed">
        {saved} is on the live list. Paper is already open — the desk does not
        wait for a broker.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <label className="text-xs text-muted-foreground" htmlFor="live-email">
        Email for the live list
      </label>
      <input
        id="live-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@fund"
        suppressHydrationWarning
        className="h-11 rounded-lg bg-secondary px-3 text-sm text-foreground shadow-[var(--shadow-border)] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error ? <p className="text-xs text-down">{error}</p> : null}
      <Button type="submit" variant="outline">
        Join live waitlist
      </Button>
    </form>
  );
}

export function MethodView() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 py-12 md:py-20">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Method
        </p>
        <h1 className="mt-3 font-display text-5xl italic leading-none">
          Know when the edge expires.
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Nightwatch is built from a single claim: a strategy is only as good as
          the regime it was born in. The paper desk lets you watch that claim
          fail in public — on the same tape, with and without the gate.
        </p>
        <ol className="mt-12 flex flex-col gap-8">
          {[
            {
              t: "One pair first",
              d: "HDFCBANK/ICICIBANK first, then HUL/ITC and TCS/INFY. Rupee-neutral log-spread, OU mean reversion on the NSE cash book.",
            },
            {
              t: "Six signals, not a story",
              d: "Hurst of the spread, India VIX, Nifty realized vs implied, Nifty–Bank Nifty correlation, India 5y CDS, G-Sec 10y–2y.",
            },
            {
              t: "The naive book is the control",
              d: "Always-on OU is not a straw man. It is the version of you that refuses to sit on hands. If the filter does not beat it on drawdown, the filter is decoration.",
            },
            {
              t: "Risk is a switch",
              d: "Kelly blend, daily-loss cap, max drawdown, flatten-on-crisis, kill. Non-negotiable even on paper. Especially on paper — that is where bad habits get rehearsed.",
            },
            {
              t: "Human approval, machine grunt",
              d: "The desk runs. You still decide filter on/off, size, and whether to kill. Shadow, then paper, then — maybe — live.",
            },
          ].map((s, i) => (
            <li key={s.t} className="grid gap-2 sm:grid-cols-[4rem_1fr]">
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                0{i + 1}
              </p>
              <div>
                <h2 className="text-lg font-medium">{s.t}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.d}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <Button asChild>
            <Link to="/desk">
              Open the desk
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </article>
    </MarketingShell>
  );
}
