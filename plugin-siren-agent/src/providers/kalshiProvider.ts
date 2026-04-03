import { fetchJson } from "../lib/http.js";
import {
  buildMarketKey,
  clampProbability,
  isCryptoQuestion
} from "../lib/formatting.js";
import type { NormalizedPredictionSignal, SirenConfig } from "../lib/types.js";

interface KalshiMarket {
  ticker: string;
  title?: string;
  subtitle?: string;
  yes_bid?: number;
  yes_ask?: number;
  last_price?: number;
  volume?: number;
  open_interest?: number;
  close_time?: string;
  event_ticker?: string;
}

interface KalshiMarketResponse {
  markets?: KalshiMarket[];
}

function toProbability(market: KalshiMarket): number {
  return clampProbability(
    market.last_price ?? market.yes_ask ?? market.yes_bid ?? 0
  );
}

export async function fetchKalshiSignals(
  config: SirenConfig
): Promise<NormalizedPredictionSignal[]> {
  const params = new URLSearchParams({
    limit: String(config.maxMarkets),
    status: "open"
  });

  const url = `${config.kalshiBaseUrl}/markets?${params.toString()}`;
  const response = await fetchJson<KalshiMarketResponse>(url);
  const markets = response.markets ?? [];

  return markets
    .filter((market) =>
      isCryptoQuestion(`${market.title ?? ""} ${market.subtitle ?? ""}`)
    )
    .map((market) => {
      const question = [market.title, market.subtitle].filter(Boolean).join(" - ");
      return {
        id: market.ticker || buildMarketKey(question),
        source: "kalshi" as const,
        eventName: market.title ?? market.ticker,
        question,
        probability: toProbability(market),
        volume: market.volume,
        openInterest: market.open_interest,
        closesAt: market.close_time,
        url: market.event_ticker
          ? `https://kalshi.com/events/${market.event_ticker}`
          : undefined
      };
    });
}
