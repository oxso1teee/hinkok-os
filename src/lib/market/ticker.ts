import "server-only";

export type MarketTickerQuote = {
  symbol: "BTC";
  priceUsd: number;
  changePercent24h: number | null;
};

export type MarketTicker = {
  quotes: MarketTickerQuote[];
  fetchedAt: string;
};

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 4_000;
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

let cached: { value: MarketTicker | null; expiresAt: number } | null = null;

type CoinGeckoResponse = {
  bitcoin?: { usd?: number; usd_24h_change?: number };
};

function isCoinGeckoResponse(value: unknown): value is CoinGeckoResponse {
  return typeof value === "object" && value !== null;
}

async function fetchBitcoinQuote(): Promise<MarketTickerQuote | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(COINGECKO_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (!isCoinGeckoResponse(body) || typeof body.bitcoin?.usd !== "number") {
      return null;
    }

    return {
      symbol: "BTC",
      priceUsd: body.bitcoin.usd,
      changePercent24h:
        typeof body.bitcoin.usd_24h_change === "number"
          ? body.bitcoin.usd_24h_change
          : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Only BTC is included: CoinGecko's public endpoint needs no API key, so the
 * price is real and live. There is no equivalent free, keyless source for a
 * Nasdaq-100 (NDX) index level or gold (XAU) spot price, so those are
 * intentionally omitted rather than shown as invented numbers. If a market
 * data provider key is added later, extend `fetchBitcoinQuote`-style
 * functions here instead of hardcoding placeholder values.
 */
export async function getMarketTicker(): Promise<MarketTicker | null> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const btc = await fetchBitcoinQuote();
  const value: MarketTicker | null = btc
    ? { quotes: [btc], fetchedAt: new Date(now).toISOString() }
    : null;

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
