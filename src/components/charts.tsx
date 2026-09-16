import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { INITIAL_EQUITY, type Point } from "@/lib/sim";
import { usd } from "@/lib/format";

function ChartTip({
  active,
  payload,
  label,
  kind,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: number;
  kind: "equity" | "pair" | "z";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-foreground px-3 py-2 text-xs text-background">
      <p className="mb-1 font-mono text-background/70 tabular-nums">T+{label}h</p>
      {payload.map((p) => (
        <p key={p.name} className="font-mono tabular-nums">
          {p.name}{" "}
          {kind === "equity"
            ? usd(p.value)
            : kind === "z"
              ? p.value.toFixed(2)
              : p.value.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

export function EquityChart({ data }: { data: Point[] }) {
  return (
    <div className="h-52 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={["dataMin - 400", "dataMax + 400"]}
            tick={{ fill: "#8b919a", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            width={36}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTip kind="equity" />} />
          <ReferenceLine y={INITIAL_EQUITY} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
          <Line
            type="monotone"
            dataKey="naive"
            name="Always-on OU"
            stroke="var(--color-naive)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="filtered"
            name="Regime book"
            stroke="var(--color-filtered)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PairChart({ data }: { data: Point[] }) {
  return (
    <div className="h-44 w-full sm:h-52">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            yAxisId="a"
            tick={{ fill: "#8b919a", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickFormatter={(v) => v.toFixed(0)}
            width={36}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 0.4", "dataMax + 0.4"]}
          />
          <YAxis
            yAxisId="b"
            orientation="right"
            tick={{ fill: "#8b919a", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickFormatter={(v) => v.toFixed(0)}
            width={36}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip content={<ChartTip kind="pair" />} />
          <Line
            yAxisId="a"
            type="monotone"
            dataKey="ko"
            name="KO"
            stroke="var(--color-filtered)"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="b"
            type="monotone"
            dataKey="pep"
            name="PEP"
            stroke="var(--color-muted)"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ZChart({ data }: { data: Point[] }) {
  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={[-4.2, 4.2]}
            tick={{ fill: "#8b919a", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            width={28}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTip kind="z" />} />
          <ReferenceLine y={2} stroke="var(--color-down)" strokeOpacity={0.5} strokeDasharray="3 4" />
          <ReferenceLine y={-2} stroke="var(--color-down)" strokeOpacity={0.5} strokeDasharray="3 4" />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" />
          <Area
            type="monotone"
            dataKey="z"
            name="z-score"
            stroke="var(--color-filtered)"
            fill="var(--color-filtered)"
            fillOpacity={0.08}
            strokeWidth={1.6}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RegimeStrip({ data }: { data: Point[] }) {
  if (data.length < 2) return null;
  const segs: { regime: Point["regime"]; n: number }[] = [];
  for (const p of data) {
    const last = segs[segs.length - 1];
    if (last && last.regime === p.regime) last.n += 1;
    else segs.push({ regime: p.regime, n: 1 });
  }
  const color: Record<Point["regime"], string> = {
    mean_reverting: "bg-up",
    trending: "bg-muted",
    high_vol: "bg-warn",
    crisis: "bg-down",
  };
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full">
      {segs.map((s, i) => (
        <div
          key={`${s.regime}-${i}`}
          className={color[s.regime]}
          style={{ flexGrow: s.n }}
          title={s.regime}
        />
      ))}
    </div>
  );
}
