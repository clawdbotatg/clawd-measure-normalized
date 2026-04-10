export type Timeframe = "1h" | "4h" | "hourly24" | "hourly" | "daily" | "weekly";

export type NormalizedPoint = {
  timestamp: number;
  clawdUsd: number;
  ethUsd: number;
  clawdPerEth: number;
  normalizedRatio: number;
};

export async function fetchNormalizedData(timeframe: Timeframe): Promise<NormalizedPoint[]> {
  const res = await fetch(`/api/prices?timeframe=${timeframe}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? [];
}
