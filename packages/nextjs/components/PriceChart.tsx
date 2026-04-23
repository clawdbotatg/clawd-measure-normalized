"use client";

import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NormalizedPoint, Timeframe } from "~~/utils/priceData";

type ChartMode = "clawd" | "eth" | "normalized";

type PriceChartProps = {
  data: NormalizedPoint[];
  mode: ChartMode;
  timeframe: Timeframe;
  isLoading: boolean;
};

function formatTimestamp(ts: number, timeframe: Timeframe): string {
  const date = new Date(ts * 1000);
  switch (timeframe) {
    case "1h":
    case "4h":
    case "8h":
    case "hourly24":
      return format(date, "HH:mm");
    case "3d":
    case "hourly":
      return format(date, "MMM d HH:mm");
    case "2w":
    case "1mo":
    case "daily":
    case "weekly":
      return format(date, "MMM d");
  }
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 0.001) return `$${value.toFixed(4)}`;
  if (value >= 0.000001) return `$${value.toFixed(6)}`;
  return `$${value.toExponential(3)}`;
}

function formatRatio(value: number): string {
  return value.toFixed(4);
}

const CHART_CONFIG: Record<
  ChartMode,
  { title: string; dataKey: string; color: string; formatter: (v: number) => string }
> = {
  clawd: {
    title: "CLAWD / USD",
    dataKey: "clawdUsd",
    color: "#f59e0b",
    formatter: formatPrice,
  },
  eth: {
    title: "ETH / USD",
    dataKey: "ethUsd",
    color: "#6366f1",
    formatter: formatPrice,
  },
  normalized: {
    title: "CLAWD / ETH (Normalized)",
    dataKey: "normalizedRatio",
    color: "#10b981",
    formatter: formatRatio,
  },
};

export const PriceChart = ({ data, mode, timeframe, isLoading }: PriceChartProps) => {
  const config = CHART_CONFIG[mode];

  const chartData = data;

  if (isLoading) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">{config.title}</h2>
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">{config.title}</h2>
          <div className="flex items-center justify-center h-64 text-base-content/50">No data available</div>
        </div>
      </div>
    );
  }

  const values = chartData.map(d => d[config.dataKey as keyof typeof d] as number);
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  // Ensure 1.0 reference line is always visible on normalized chart
  if (mode === "normalized") {
    minVal = Math.min(minVal, 1);
    maxVal = Math.max(maxVal, 1);
  }
  const padding = (maxVal - minVal) * 0.1 || maxVal * 0.1;

  const isNormalized = mode === "normalized";
  const score = isNormalized ? (values.reduce((sum, v) => sum + (v - 1), 0) / values.length) * 100 : 0;
  const scorePositive = score >= 0;
  const domainMin = minVal - padding;
  const domainMax = maxVal + padding;
  const crossoverOffset = Math.max(0, Math.min(1, (domainMax - 1) / (domainMax - domainMin)));
  const GREEN = "#10b981";
  const RED = "#ef4444";

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="card-title text-lg">{config.title}</h2>
          {isNormalized && (
            <span className={`badge ${scorePositive ? "badge-success" : "badge-error"}`}>
              {scorePositive ? "+" : ""}
              {score.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                {isNormalized ? (
                  <>
                    <linearGradient id="stroke-normalized" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={crossoverOffset} stopColor={GREEN} stopOpacity={1} />
                      <stop offset={crossoverOffset} stopColor={RED} stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="fill-normalized" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GREEN} stopOpacity={0.5} />
                      <stop offset={crossoverOffset} stopColor={GREEN} stopOpacity={0.05} />
                      <stop offset={crossoverOffset} stopColor={RED} stopOpacity={0.05} />
                      <stop offset="100%" stopColor={RED} stopOpacity={0.5} />
                    </linearGradient>
                  </>
                ) : (
                  <linearGradient id={`gradient-${mode}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={ts => formatTimestamp(ts, timeframe)}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.5}
              />
              <YAxis
                domain={[minVal - padding, maxVal + padding]}
                tickFormatter={config.formatter}
                tick={{ fontSize: 11 }}
                width={80}
                stroke="currentColor"
                opacity={0.5}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(var(--b1))",
                  border: "1px solid oklch(var(--bc) / 0.2)",
                  borderRadius: "0.5rem",
                }}
                labelStyle={{ color: "oklch(var(--bc))" }}
                labelFormatter={ts => formatTimestamp(Number(ts), timeframe)}
                formatter={value => [config.formatter(Number(value)), config.title]}
              />
              {mode === "normalized" && (
                <ReferenceLine y={1} stroke="#000000" strokeWidth={2} strokeDasharray="6 3" label="" />
              )}
              <Area
                type="monotone"
                dataKey={config.dataKey}
                stroke={isNormalized ? "url(#stroke-normalized)" : config.color}
                strokeWidth={2}
                fill={isNormalized ? "url(#fill-normalized)" : `url(#gradient-${mode})`}
                dot={false}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {mode === "normalized" && (
          <p className="text-xs text-base-content/50 mt-1">
            Indexed to 1.0 at start of period. Above 1.0 = CLAWD outperforming ETH. Below 1.0 = underperforming.
          </p>
        )}
      </div>
    </div>
  );
};
