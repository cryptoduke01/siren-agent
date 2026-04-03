import type {
  DivergenceSignal,
  SynthesizedReport,
  WhaleActivity
} from "./types.js";

const CRYPTO_KEYWORDS = ["btc", "bitcoin", "eth", "ether", "sol", "solana", "crypto"];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "will",
  "this",
  "that",
  "with",
  "from",
  "are",
  "any",
  "can",
  "has",
  "have",
  "been",
  "was",
  "were",
  "not",
  "but",
  "than",
  "into",
  "over",
  "under",
  "its",
  "may",
  "one",
  "out",
  "all",
  "new"
]);

function questionTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  );
}

/** Jaccard overlap on content words, plus a small bonus when the same crypto keyword appears in both. */
export function scoreQuestionSimilarity(left: string, right: string): number {
  const a = questionTokens(left);
  const b = questionTokens(right);
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  const leftL = left.toLowerCase();
  const rightL = right.toLowerCase();
  let bonus = 0;
  for (const kw of CRYPTO_KEYWORDS) {
    if (leftL.includes(kw) && rightL.includes(kw)) {
      bonus = 0.12;
      break;
    }
  }
  return Math.min(1, jaccard + bonus);
}

export function isCryptoQuestion(value: string): boolean {
  const normalized = value.toLowerCase();
  return CRYPTO_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }

  return Math.max(0, Math.min(1, value));
}

export function buildMarketKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .slice(0, 8)
    .join("-");
}

export function divergenceLevel(delta: number): "low" | "medium" | "high" {
  if (delta >= 0.2) {
    return "high";
  }

  if (delta >= 0.1) {
    return "medium";
  }

  return "low";
}

export function toShortNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "n/a";
  }

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return value.toFixed(2);
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

export function formatWhaleLine(activity: WhaleActivity): string {
  const usdLabel =
    activity.usdValue != null ? ` (~$${toShortNumber(activity.usdValue)})` : "";
  return `${activity.direction.toUpperCase()}: ${activity.walletAddress.slice(
    0,
    4
  )}...${activity.walletAddress.slice(-4)} moved ${toShortNumber(
    activity.amount
  )} ${activity.tokenSymbol} via ${activity.venue}${usdLabel}`;
}

export function formatSignalLine(signal: DivergenceSignal): string {
  return `${signal.eventName}: Kalshi ${signal.kalshiProbability?.toFixed(
    2
  )} vs Poly ${signal.polymarketProbability?.toFixed(2)} (delta ${signal.delta.toFixed(
    2
  )})`;
}

export function buildTelegramVersion(report: SynthesizedReport): string {
  const signalLines = report.signals
    .slice(0, 3)
    .map((signal) => `- ${formatSignalLine(signal)}`)
    .join("\n");
  const whaleLines = report.whaleActivity
    .slice(0, 3)
    .map((item) => `- ${formatWhaleLine(item)}`)
    .join("\n");

  return [
    `SirenAgent Report | ${report.generatedAt}`,
    "",
    report.summary,
    `Conviction: ${report.conviction}`,
    "",
    "Prediction market divergence",
    signalLines || "- No meaningful overlap found in this cycle.",
    "",
    "On-chain activity",
    whaleLines || "- No whale movements crossed the configured filters.",
    "",
    "Key points",
    ...report.keyPoints.map((point) => `- ${point}`)
  ].join("\n");
}
