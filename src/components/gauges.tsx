import { SIGNAL_META, type Signals } from "@/lib/sim";
import { cn } from "@/lib/utils";

const RANGES: Record<keyof Signals, [number, number]> = {
  hurst: [0.2, 0.85],
  vixTerm: [-1.5, 1.2],
  rvIv: [-0.8, 1.6],
  correlation: [0, 1],
  credit: [180, 1200],
  curve: [-0.9, 0.8],
};

function unit(v: number, lo: number, hi: number) {
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function RegimeGauges({
  signals,
  compact = false,
}: {
  signals: Signals;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
      {SIGNAL_META.map((meta) => {
        const v = signals[meta.key];
        const [lo, hi] = RANGES[meta.key];
        const t = unit(v, lo, hi);
        const stress = meta.goodHigh ? t < 0.35 : t > 0.7;
        return (
          <div key={meta.key} className="rounded-lg bg-secondary/60 px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-muted-foreground">{meta.label}</p>
              <p className="font-mono text-sm tabular-nums">{meta.format(v)}</p>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-background">
              <div
                className={cn("h-full rounded-full", stress ? "bg-down" : "bg-primary")}
                style={{ width: `${Math.round(t * 100)}%` }}
              />
            </div>
            {!compact ? (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">{meta.hint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
