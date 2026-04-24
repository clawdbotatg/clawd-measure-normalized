import { NextRequest, NextResponse } from "next/server";

const CLAWD_POOL_ADDRESS = "0xcd55381a53da35ab1d7bc5e3fe5f76cac976fac3";
const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";

type Timeframe = "15m" | "1h" | "4h" | "8h" | "hourly24" | "3d" | "hourly" | "2w" | "1mo" | "daily" | "weekly";

// Server-side cache — persists across requests, survives client hot reloads
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL: Record<Timeframe, number> = {
  "15m": 60 * 1000, // 1 min
  "1h": 2 * 60 * 1000, // 2 min
  "4h": 5 * 60 * 1000, // 5 min
  "8h": 10 * 60 * 1000, // 10 min
  hourly24: 15 * 60 * 1000, // 15 min
  "3d": 30 * 60 * 1000, // 30 min
  hourly: 30 * 60 * 1000, // 30 min
  "2w": 60 * 60 * 1000, // 1 hour
  "1mo": 60 * 60 * 1000, // 1 hour
  daily: 60 * 60 * 1000, // 1 hour
  weekly: 3 * 60 * 60 * 1000, // 3 hours
};

function getCached<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttl) return null;
  return entry.data as T;
}

// Stale fallback — returns cached value regardless of age. Used when upstream
// fetches fail (e.g. 429 rate limits) so the UI keeps showing last-known data.
function getStale<T>(key: string): T | null {
  const entry = cache.get(key);
  return entry ? (entry.data as T) : null;
}

type GeckoParams = { endpoint: string; aggregate: number; limit: number };

function timeframeToGeckoParams(tf: Timeframe): GeckoParams {
  switch (tf) {
    case "15m":
      return { endpoint: "minute", aggregate: 5, limit: 3 };
    case "1h":
      return { endpoint: "minute", aggregate: 1, limit: 60 };
    case "4h":
      return { endpoint: "minute", aggregate: 5, limit: 48 };
    case "8h":
      return { endpoint: "minute", aggregate: 15, limit: 32 };
    case "hourly24":
      return { endpoint: "hour", aggregate: 1, limit: 24 };
    case "3d":
      return { endpoint: "hour", aggregate: 1, limit: 72 };
    case "hourly":
      return { endpoint: "hour", aggregate: 1, limit: 168 };
    case "2w":
      return { endpoint: "hour", aggregate: 4, limit: 84 };
    case "1mo":
      return { endpoint: "hour", aggregate: 12, limit: 60 };
    case "daily":
      return { endpoint: "day", aggregate: 1, limit: 90 };
    case "weekly":
      return { endpoint: "day", aggregate: 1, limit: 365 };
  }
}

// Always fetch at least 1 day from CoinGecko for sub-day timeframes.
// CoinGecko gives 5-min granularity for days <= 1, hourly for 1-90d, daily for 90d+.
// For low-volume tokens, GeckoTerminal "last N candles" can span way longer
// than expected (e.g. 60 minute-candles spanning 4+ hours due to trade gaps),
// so we need enough ETH data to cover the full range.
function timeframeToCoinGeckoDays(tf: Timeframe): number {
  switch (tf) {
    case "15m":
    case "1h":
    case "4h":
    case "8h":
    case "hourly24":
      return 1; // always 1 day for sub-day views — max 5-min granularity
    case "3d":
    case "hourly":
      return 7;
    case "2w":
      return 14;
    case "1mo":
      return 30;
    case "daily":
      return 90;
    case "weekly":
      return 365;
  }
}

// How far back (in seconds) each timeframe should display
function timeframeWindowSeconds(tf: Timeframe): number {
  switch (tf) {
    case "15m":
      return 15 * 60;
    case "1h":
      return 60 * 60;
    case "4h":
      return 4 * 60 * 60;
    case "8h":
      return 8 * 60 * 60;
    case "hourly24":
      return 24 * 60 * 60;
    case "3d":
      return 3 * 24 * 60 * 60;
    case "hourly":
      return 7 * 24 * 60 * 60;
    case "2w":
      return 14 * 24 * 60 * 60;
    case "1mo":
      return 30 * 24 * 60 * 60;
    case "daily":
      return 90 * 24 * 60 * 60;
    case "weekly":
      return 365 * 24 * 60 * 60;
  }
}

type GeckoOhlcv = [number, string, string, string, string, string];

type PricePoint = { timestamp: number; price: number };

async function fetchClawdPrices(tf: Timeframe): Promise<PricePoint[]> {
  const cacheKey = `clawd-${tf}`;
  const cached = getCached<PricePoint[]>(cacheKey, CACHE_TTL[tf]);
  if (cached) return cached;

  try {
    const { endpoint, aggregate, limit } = timeframeToGeckoParams(tf);
    const url = `${GECKO_TERMINAL_BASE}/networks/base/pools/${CLAWD_POOL_ADDRESS}/ohlcv/${endpoint}?aggregate=${aggregate}&limit=${limit}&currency=usd`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`GeckoTerminal: ${res.status}`);

    const json = await res.json();
    const ohlcvList: GeckoOhlcv[] = json?.data?.attributes?.ohlcv_list ?? [];

    let points = ohlcvList
      .map(candle => ({
        timestamp: candle[0],
        price: parseFloat(candle[4]),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (tf === "weekly") {
      points = aggregateToWeekly(points);
    }

    cache.set(cacheKey, { data: points, fetchedAt: Date.now() });
    return points;
  } catch (err) {
    const stale = getStale<PricePoint[]>(cacheKey);
    if (stale) return stale;
    throw err;
  }
}

async function fetchEthPrices(tf: Timeframe): Promise<PricePoint[]> {
  const days = timeframeToCoinGeckoDays(tf);
  const cacheKey = `eth-days-${days}`;
  const cached = getCached<PricePoint[]>(cacheKey, CACHE_TTL[tf]);
  if (cached) return cached;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${days}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko: ${res.status}`);

    const json = await res.json();
    const prices: [number, number][] = json?.prices ?? [];

    const points = prices.map(([ts, price]) => ({
      timestamp: Math.floor(ts / 1000),
      price,
    }));

    cache.set(cacheKey, { data: points, fetchedAt: Date.now() });
    return points;
  } catch (err) {
    const stale = getStale<PricePoint[]>(cacheKey);
    if (stale) return stale;
    throw err;
  }
}

function aggregateToWeekly(points: PricePoint[]): PricePoint[] {
  if (points.length === 0) return [];
  const weeks: PricePoint[] = [];
  let bucketStart = points[0].timestamp;
  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  let bucketPoints: PricePoint[] = [];

  for (const p of points) {
    if (p.timestamp - bucketStart >= SEVEN_DAYS && bucketPoints.length > 0) {
      weeks.push({ timestamp: bucketStart, price: bucketPoints[bucketPoints.length - 1].price });
      bucketStart = p.timestamp;
      bucketPoints = [];
    }
    bucketPoints.push(p);
  }
  if (bucketPoints.length > 0) {
    weeks.push({ timestamp: bucketStart, price: bucketPoints[bucketPoints.length - 1].price });
  }
  return weeks;
}

function interpolateEthPrice(clawdTs: number, ethPrices: PricePoint[]): number {
  if (ethPrices.length === 0) return 0;
  let closest = ethPrices[0];
  let minDiff = Math.abs(clawdTs - closest.timestamp);
  for (const ep of ethPrices) {
    const diff = Math.abs(clawdTs - ep.timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ep;
    }
  }
  return closest.price;
}

export async function GET(request: NextRequest) {
  const tf = request.nextUrl.searchParams.get("timeframe") as Timeframe | null;
  if (!tf || !CACHE_TTL[tf]) {
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  }

  try {
    const [rawClawdPrices, ethPrices] = await Promise.all([fetchClawdPrices(tf), fetchEthPrices(tf)]);

    if (rawClawdPrices.length === 0 || ethPrices.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Filter CLAWD data to the actual requested time window.
    // GeckoTerminal "last N candles" can span much longer than expected
    // for low-volume tokens (gaps between trades).
    // For 15m we skip filtering — CLAWD often has no trades in a strict 15-min
    // window, which would leave the chart with 0–1 points. Showing the most
    // recent 3 candles (even if they span longer) keeps the +/- signal usable.
    const skipWindowFilter = tf === "15m";
    const windowSec = timeframeWindowSeconds(tf);
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - windowSec;
    const clawdPrices = skipWindowFilter ? rawClawdPrices : rawClawdPrices.filter(p => p.timestamp >= cutoff);

    if (clawdPrices.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const points = clawdPrices.map(cp => {
      const ethUsd = interpolateEthPrice(cp.timestamp, ethPrices);
      const clawdPerEth = ethUsd > 0 ? cp.price / ethUsd : 0;
      return {
        timestamp: cp.timestamp,
        clawdUsd: cp.price,
        ethUsd,
        clawdPerEth,
        normalizedRatio: 0,
      };
    });

    const firstRatio = points[0]?.clawdPerEth ?? 1;
    for (const p of points) {
      p.normalizedRatio = firstRatio > 0 ? p.clawdPerEth / firstRatio : 0;
    }

    return NextResponse.json({ data: points });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
