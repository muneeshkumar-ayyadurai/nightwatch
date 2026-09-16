import { SIGNAL_META, type Signals } from "@/lib/sim";
import { cn } from "@/lib/utils";

export function RegimeGauges({
  signals,
  z,
  compact = false,
}: {
  signals: Signals;
  z?: Signals;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
      {SIGNAL_META.map((meta) => {
        const v = signals[meta.key];
        const zv = z?.[meta.key];
        const hasZ = zv != null && Number.isFinite(zv);
        const stress = hasZ
          ? meta.goodHigh
            ? zv < -1.25
            : zv > 1.25
          : false;
        const width = hasZ ? Math.abs(zv) / 3 : 0;
        const left = hasZ && zv < 0 ? 50 - width * 50 : 50;
        return (
          <div key={meta.key} className="rounded-lg bg-secondary/60 px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-muted-foreground">{meta.label}</p>
              <p className="font-mono text-sm tabular-nums">
                {meta.format(v)}
                {hasZ ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    z {zv >= 0 ? "+" : ""}
                    {zv.toFixed(2)}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-background">
              <span className="absolute top-0 left-1/2 h-full w-px bg-border" />
              <div
                className={cn("absolute top-0 h-full rounded-full", stress ? "bg-down" : "bg-primary")}
                style={{ left: `${left}%`, width: `${Math.round(width * 50)}%` }}
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
