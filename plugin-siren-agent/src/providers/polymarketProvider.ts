import { fetchJson } from "../lib/http.js";
import {
  buildMarketKey,
  clampProbability,
  isCryptoQuestion
} from "../lib/formatting.js";
import type { NormalizedPredictionSignal, SirenConfig } from "../lib/types.js";

interface PolymarketMarket {
  id: string | number;
  slug?: string;
  question?: string;
  description?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  volumeNum?: number;
  openInterest?: number;
  endDate?: string;
}

interface PolymarketResponse {
  markets?: PolymarketMarket[];
}

function unwrapMarkets(payload: PolymarketResponse | PolymarketMarket[]): PolymarketMarket[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.markets ?? [];
}

export async function fetchPolymarketSignals(
  config: SirenConfig
): Promise<NormalizedPredictionSignal[]> {
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    archived: "false",
    limit: String(config.maxMarkets)
  });

  const url = `${config.polymarketBaseUrl}/v1/markets?${params.toString()}`;
  const response = await fetchJson<PolymarketResponse | PolymarketMarket[]>(url);
  const markets = unwrapMarkets(response);

  return markets
    .filter((market) =>
      isCryptoQuestion(`${market.question ?? ""} ${market.description ?? ""}`)
    )
    .map((market) => ({
      id: String(market.id ?? buildMarketKey(market.question ?? "")),
      source: "polymarket" as const,
      eventName: market.question ?? String(market.id),
      question: market.question ?? market.description ?? String(market.id),
      probability: clampProbability(
        market.lastTradePrice ?? market.bestBid ?? market.bestAsk ?? 0
      ),
      volume: market.volumeNum,
      openInterest: market.openInterest,
      closesAt: market.endDate,
      url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined
    }));
}
