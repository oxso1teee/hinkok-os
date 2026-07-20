"use client";

import { useEffect, useState } from "react";

type TickerQuote = {
  symbol: "BTC";
  priceUsd: number;
  changePercent24h: number | null;
};

type TickerResponse = {
  ok: boolean;
  data: { quotes: TickerQuote[] } | null;
};

const POLL_INTERVAL_MS = 60_000;

function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function TopbarTicker() {
  const [quotes, setQuotes] = useState<TickerQuote[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/market/ticker", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as TickerResponse;
        if (!cancelled && body.ok && body.data) {
          setQuotes(body.data.quotes);
        }
      } catch {
        // Network hiccups just leave the last known quotes on screen.
      }
    }

    load();
    const timer = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (quotes.length === 0) return null;

  return (
    <div className="topbar-ticker" aria-label="Рыночные котировки">
      {quotes.map((quote) => (
        <span key={quote.symbol} className="topbar-ticker-item">
          {quote.symbol} {formatUsd(quote.priceUsd)}{" "}
          <span
            className={
              quote.changePercent24h === null
                ? "topbar-ticker-arrow is-flat"
                : quote.changePercent24h >= 0
                  ? "topbar-ticker-arrow is-up"
                  : "topbar-ticker-arrow is-down"
            }
          >
            {quote.changePercent24h === null ? "•" : quote.changePercent24h >= 0 ? "▲" : "▼"}
          </span>
        </span>
      ))}
    </div>
  );
}
