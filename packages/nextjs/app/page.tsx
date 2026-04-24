"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { PriceChart } from "~~/components/PriceChart";
import type { NormalizedPoint, Timeframe } from "~~/utils/priceData";
import { fetchNormalizedData } from "~~/utils/priceData";

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "8h", value: "8h" },
  { label: "24h", value: "hourly24" },
  { label: "3d", value: "3d" },
  { label: "7d", value: "hourly" },
  { label: "2w", value: "2w" },
  { label: "1mo", value: "1mo" },
  { label: "90d", value: "daily" },
  { label: "1y", value: "weekly" },
];

const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const CLAWD_BASESCAN = `https://basescan.org/token/${CLAWD_ADDRESS}`;

const Home: NextPage = () => {
  const [timeframe, setTimeframe] = useState<Timeframe>("hourly24");
  const [data, setData] = useState<NormalizedPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (tf: Timeframe) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchNormalizedData(tf);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch price data");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(timeframe);
  }, [timeframe, loadData]);

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="flex flex-col grow">
      {/* Header stats */}
      <div className="bg-base-200 px-4 py-6 md:px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">CLAWD / ETH Price Tracker</h1>
          <p className="text-base-content/60 text-sm mb-4">
            Measuring CLAWD relative to ETH to see what actually moves the needle.{" "}
            <a href={CLAWD_BASESCAN} target="_blank" rel="noreferrer" className="link link-primary">
              View on Basescan
            </a>
          </p>

          {/* Live stats */}
          {latestPoint && !isLoading && (
            <div className="stats stats-vertical md:stats-horizontal shadow bg-base-100 w-full">
              <div className="stat">
                <div className="stat-title">CLAWD Price</div>
                <div className="stat-value text-warning text-lg md:text-2xl">
                  {latestPoint.clawdUsd >= 0.001
                    ? `$${latestPoint.clawdUsd.toFixed(6)}`
                    : `$${latestPoint.clawdUsd.toExponential(3)}`}
                </div>
                <div className="stat-desc">USD on Base</div>
              </div>
              <div className="stat">
                <div className="stat-title">ETH Price</div>
                <div className="stat-value text-indigo-500 text-lg md:text-2xl">
                  ${latestPoint.ethUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="stat-desc">USD</div>
              </div>
              <div className="stat">
                <div className="stat-title">CLAWD/ETH Ratio</div>
                <div
                  className={`stat-value text-lg md:text-2xl ${
                    latestPoint.normalizedRatio >= 1 ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {latestPoint.normalizedRatio.toFixed(4)}x
                </div>
                <div className="stat-desc">
                  {latestPoint.normalizedRatio >= 1.0
                    ? "Outperforming ETH this period"
                    : "Underperforming ETH this period"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeframe selector + charts */}
      <div className="px-4 py-6 md:px-8 grow">
        <div className="max-w-6xl mx-auto">
          {/* Timeframe toggle */}
          <div className="flex items-center justify-between mb-6">
            <div className="join">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  className={`join-item btn btn-sm ${timeframe === tf.value ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setTimeframe(tf.value)}
                  disabled={isLoading}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => loadData(timeframe)} disabled={isLoading}>
              {isLoading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
            </button>
          </div>

          {error && (
            <div className="alert alert-error mb-6">
              <span>{error}</span>
            </div>
          )}

          {/* The key chart: Normalized CLAWD/ETH */}
          <div className="mb-6">
            <PriceChart data={data} mode="normalized" timeframe={timeframe} isLoading={isLoading} />
          </div>

          {/* Individual price charts side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PriceChart data={data} mode="clawd" timeframe={timeframe} isLoading={isLoading} />
            <PriceChart data={data} mode="eth" timeframe={timeframe} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
