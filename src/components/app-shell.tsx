import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Siren,
  LineChart,
} from "lucide-react";
import { simClock } from "@/lib/format";
import { REGIME_META, type Mode } from "@/lib/sim";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const NAV = [
  { to: "/", label: "Desk", icon: LayoutGrid },
  { to: "/regimes", label: "Regime", icon: Activity },
  { to: "/strategy", label: "Strategy", icon: LineChart },
  { to: "/risk", label: "Risk", icon: Shield },
] as const;

const SPEEDS = [1, 4, 12];
const MODES: Mode[] = ["shadow", "paper", "live"];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hour = useSim((s) => s.hour);
  const regime = useSim((s) => s.regime);
  const running = useSim((s) => s.running);
  const speed = useSim((s) => s.speed);
  const mode = useSim((s) => s.mode);
  const killed = useSim((s) => s.killed);
  const setRunning = useSim((s) => s.setRunning);
  const setSpeed = useSim((s) => s.setSpeed);
  const setMode = useSim((s) => s.setMode);
  const kill = useSim((s) => s.kill);
  const resume = useSim((s) => s.resume);
  const reset = useSim((s) => s.reset);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border px-4 py-6 md:flex">
        <Link to="/" className="px-2">
          <p className="font-display text-2xl italic leading-none tracking-tight">
            Nightwatch
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Regime desk</p>
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-(--motion-quick)",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="px-2 text-xs leading-relaxed text-muted-foreground">
          Simulated paper market. Not a broker. Not advice.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-sm md:px-6">
          <Link to="/" className="md:hidden">
            <p className="font-display text-xl italic leading-none">Nightwatch</p>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {simClock(hour)}
            </span>
            <span className="text-muted-foreground/40">/</span>
            <Badge variant={killed ? "down" : regimeBadge(regime)}>
              {killed ? "Killed" : REGIME_META[regime].short}
            </Badge>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="hidden overflow-hidden rounded-lg shadow-[var(--shadow-border)] sm:flex">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-8 px-3 text-xs capitalize transition-colors duration-(--motion-quick)",
                    mode === m
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRunning(!running)}
              aria-label={running ? "Pause" : "Play"}
              className="size-11 text-foreground sm:size-8"
            >
              {running && !killed ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const i = SPEEDS.indexOf(speed);
                setSpeed(SPEEDS[(i + 1) % SPEEDS.length]!);
              }}
              className="h-11 font-mono tabular-nums text-foreground sm:h-8"
            >
              {speed}×
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={reset}
              aria-label="Reset simulation"
              className="hidden text-foreground sm:inline-flex"
            >
              <RotateCcw className="size-4" />
            </Button>
            {killed ? (
              <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={resume}>
                Resume
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="kill" size="sm" className="h-11 sm:h-8">
                    <Siren className="size-3.5" />
                    Kill
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Flatten everything?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Kill switch closes both books, pauses entries, and holds
                      cash until you resume. Use it when the desk is wrong — not
                      when a single trade itches.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hold</AlertDialogCancel>
                    <AlertDialogAction onClick={kill}>
                      Kill switch
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {NAV.map((item) => {
          const active = path === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function regimeBadge(
  regime: keyof typeof REGIME_META,
): "up" | "down" | "warn" | "mute" {
  if (regime === "mean_reverting") return "up";
  if (regime === "crisis") return "down";
  if (regime === "high_vol") return "warn";
  return "mute";
}
