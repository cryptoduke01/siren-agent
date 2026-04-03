import { TwitterApi } from "twitter-api-v2";
import { fetchKalshiSignals } from "../providers/kalshiProvider.js";
import { fetchPolymarketSignals } from "../providers/polymarketProvider.js";
import { fetchWhaleActivityFromHelius } from "../providers/solanaProvider.js";
import { hasTwitterCredentials, loadConfig } from "./config.js";
import {
  buildMarketKey,
  buildTelegramVersion,
  divergenceLevel,
  scoreQuestionSimilarity,
  truncate
} from "./formatting.js";
import { fetchJson } from "./http.js";
import type {
  DivergenceSignal,
  NormalizedPredictionSignal,
  RuntimeLike,
  SynthesizedReport,
  WhaleActivity
} from "./types.js";

let lastReport: SynthesizedReport | null = null;

function getLogger(runtime?: RuntimeLike) {
  return runtime?.logger ?? console;
}

const SIMILARITY_THRESHOLD = 0.1;

function mergeSignalsExactKey(
  kalshiSignals: NormalizedPredictionSignal[],
  polymarketSignals: NormalizedPredictionSignal[]
): DivergenceSignal[] {
  const kalshiMap = new Map(
    kalshiSignals.map((signal) => [buildMarketKey(signal.question), signal])
  );
  const polymarketMap = new Map(
    polymarketSignals.map((signal) => [buildMarketKey(signal.question), signal])
  );
  const keys = [...new Set([...kalshiMap.keys(), ...polymarketMap.keys()])];

  return keys
    .reduce<DivergenceSignal[]>((signals, key) => {
      const kalshi = kalshiMap.get(key);
      const polymarket = polymarketMap.get(key);

      if (!kalshi || !polymarket) {
        return signals;
      }

      const delta = Math.abs(kalshi.probability - polymarket.probability);
      signals.push({
        key,
        eventName:
          kalshi.eventName.length <= polymarket.eventName.length
            ? kalshi.eventName
            : polymarket.eventName,
        kalshiProbability: kalshi.probability,
        polymarketProbability: polymarket.probability,
        delta,
        divergenceLevel: divergenceLevel(delta),
        urlHints: [kalshi.url, polymarket.url].filter(Boolean) as string[]
      });
      return signals;
    }, [])
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 5);
}

function mergeSignalsByOverlap(
  kalshiSignals: NormalizedPredictionSignal[],
  polymarketSignals: NormalizedPredictionSignal[]
): DivergenceSignal[] {
  type Scored = {
    kalshi: NormalizedPredictionSignal;
    polymarket: NormalizedPredictionSignal;
    score: number;
  };

  const pairs: Scored[] = [];
  for (const k of kalshiSignals) {
    for (const p of polymarketSignals) {
      const score = scoreQuestionSimilarity(k.question, p.question);
      if (score >= SIMILARITY_THRESHOLD) {
        pairs.push({ kalshi: k, polymarket: p, score });
      }
    }
  }

  pairs.sort((left, right) => right.score - left.score);
  const usedKalshi = new Set<string>();
  const usedPoly = new Set<string>();
  const out: DivergenceSignal[] = [];

  for (const { kalshi: k, polymarket: p } of pairs) {
    if (usedKalshi.has(k.id) || usedPoly.has(p.id)) {
      continue;
    }
    usedKalshi.add(k.id);
    usedPoly.add(p.id);
    const delta = Math.abs(k.probability - p.probability);
    out.push({
      key: `${buildMarketKey(k.question)}~${buildMarketKey(p.question)}`,
      eventName:
        k.eventName.length <= p.eventName.length ? k.eventName : p.eventName,
      kalshiProbability: k.probability,
      polymarketProbability: p.probability,
      delta,
      divergenceLevel: divergenceLevel(delta),
      urlHints: [k.url, p.url].filter(Boolean) as string[]
    });
  }

  return out.sort((left, right) => right.delta - left.delta).slice(0, 5);
}

function mergeSignals(
  kalshiSignals: NormalizedPredictionSignal[],
  polymarketSignals: NormalizedPredictionSignal[]
): DivergenceSignal[] {
  const overlap = mergeSignalsByOverlap(kalshiSignals, polymarketSignals);
  if (overlap.length > 0) {
    return overlap;
  }
  return mergeSignalsExactKey(kalshiSignals, polymarketSignals);
}

function buildFallbackReport(
  whaleActivity: WhaleActivity[],
  signals: DivergenceSignal[]
): Pick<
  SynthesizedReport,
  "summary" | "conviction" | "keyPoints" | "tweetVersion"
> {
  const topSignal = signals[0];
  const topWhale = whaleActivity[0];

  if (topSignal) {
    return {
      summary: `Top divergence: ${topSignal.eventName} shows a ${topSignal.delta.toFixed(
        2
      )} probability gap between Kalshi and Polymarket.`,
      conviction: topSignal.delta >= 0.2 ? "High" : "Medium",
      keyPoints: [
        `Kalshi sits at ${topSignal.kalshiProbability?.toFixed(2)} while Polymarket is ${topSignal.polymarketProbability?.toFixed(2)}.`,
        topWhale
          ? `Latest monitored flow: ${topWhale.direction} ${topWhale.amount.toFixed(
              2
            )} ${topWhale.tokenSymbol} via ${topWhale.venue}.`
          : "No whale movement crossed filters in this cycle.",
        "Treat the divergence as a watchlist item, not a trading instruction."
      ],
      tweetVersion: truncate(
        `SIGNAL: ${topSignal.eventName} | Kalshi ${topSignal.kalshiProbability?.toFixed(
          2
        )} vs Poly ${topSignal.polymarketProbability?.toFixed(
          2
        )}. Conviction: ${topSignal.delta >= 0.2 ? "High" : "Medium"}.`,
        280
      )
    };
  }

  return {
    summary:
      "No high-signal divergence was found in this cycle, but monitored Solana flows remain active.",
    conviction: "Low",
    keyPoints: [
      topWhale
        ? `Largest recent flow: ${topWhale.direction} ${topWhale.amount.toFixed(
            2
          )} ${topWhale.tokenSymbol} via ${topWhale.venue}.`
        : "No qualifying whale movement found in the current window.",
      "Cross-market overlap was thin, so no strong pricing mismatch was surfaced.",
      "Keep monitoring for fresh overlap between on-chain flow and event pricing."
    ],
    tweetVersion:
      "SirenAgent update: no major Kalshi/Polymarket divergence this cycle. Monitoring continues."
  };
}

function extractJsonBlock(value: string): string {
  const trimmed = value.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return trimmed;
  }

  return trimmed.slice(start, end + 1);
}

async function synthesizeWithModel(
  runtime: RuntimeLike | undefined,
  whaleActivity: WhaleActivity[],
  signals: DivergenceSignal[]
): Promise<Pick<SynthesizedReport, "summary" | "conviction" | "keyPoints" | "tweetVersion">> {
  const config = loadConfig(runtime);
  const prompt = `You are a DeFi intelligence engine. Given the following data, produce a short intelligence report.

ON-CHAIN DATA:
${JSON.stringify(whaleActivity, null, 2)}

PREDICTION MARKET SIGNALS:
${JSON.stringify(signals, null, 2)}

Return ONLY a JSON object with this structure:
{
  "summary": "one sentence max",
  "conviction": "Low | Medium | High",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "tweetVersion": "under 280 characters, data-driven, no hype"
}`;

  const response = await fetchJson<{
    choices?: Array<{ message?: { content?: string } }>;
  }>(`${config.openAiApiUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.modelName,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You write sober market intelligence. Stay data-first and never give financial advice."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  }, 30000);

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Model response did not include content");
  }

  const parsed = JSON.parse(extractJsonBlock(content)) as {
    summary?: string;
    conviction?: "Low" | "Medium" | "High";
    keyPoints?: string[];
    tweetVersion?: string;
  };

  return {
    summary: parsed.summary ?? "No summary returned by the model.",
    conviction: parsed.conviction ?? "Low",
    keyPoints: parsed.keyPoints?.slice(0, 4) ?? [],
    tweetVersion: truncate(
      parsed.tweetVersion ?? "SirenAgent generated an empty social summary.",
      280
    )
  };
}

export async function gatherSignals(runtime?: RuntimeLike): Promise<DivergenceSignal[]> {
  const config = loadConfig(runtime);

  if (config.useMockData) {
    return [
      {
        key: "sol-price-friday",
        eventName: "SOL above target by Friday",
        kalshiProbability: 0.67,
        polymarketProbability: 0.59,
        delta: 0.08,
        divergenceLevel: "low",
        urlHints: []
      },
      {
        key: "btc-weekly-breakout",
        eventName: "BTC weekly breakout",
        kalshiProbability: 0.43,
        polymarketProbability: 0.64,
        delta: 0.21,
        divergenceLevel: "high",
        urlHints: []
      }
    ];
  }

  const [kalshiSignals, polymarketSignals] = await Promise.all([
    fetchKalshiSignals(config),
    fetchPolymarketSignals(config)
  ]);

  return mergeSignals(kalshiSignals, polymarketSignals);
}

export async function gatherWhaleActivity(runtime?: RuntimeLike): Promise<WhaleActivity[]> {
  const config = loadConfig(runtime);
  return fetchWhaleActivityFromHelius(config);
}

export async function buildSirenReport(runtime?: RuntimeLike): Promise<SynthesizedReport> {
  const logger = getLogger(runtime);
  const [signals, whaleActivity] = await Promise.all([
    gatherSignals(runtime),
    gatherWhaleActivity(runtime)
  ]);

  let modelOutput = buildFallbackReport(whaleActivity, signals);

  try {
    modelOutput = await synthesizeWithModel(runtime, whaleActivity, signals);
  } catch (error) {
    logger.warn?.("Falling back to deterministic summary after synthesis failure", error);
  }

  const report: SynthesizedReport = {
    generatedAt: new Date().toISOString(),
    summary: modelOutput.summary,
    conviction: modelOutput.conviction,
    keyPoints: modelOutput.keyPoints,
    tweetVersion: truncate(modelOutput.tweetVersion, 280),
    telegramVersion: "",
    whaleActivity,
    signals
  };

  report.telegramVersion = buildTelegramVersion(report);
  lastReport = report;
  return report;
}

export function getLastReport(): SynthesizedReport | null {
  return lastReport;
}

export async function broadcastReport(
  report: SynthesizedReport,
  runtime?: RuntimeLike
): Promise<{ telegramPosted: boolean; twitterPosted: boolean }> {
  const config = loadConfig(runtime);
  const logger = getLogger(runtime);

  if (config.dryRunBroadcast) {
    logger.info?.("SirenAgent broadcast dry run", report.tweetVersion);
    return { telegramPosted: false, twitterPosted: false };
  }

  let telegramPosted = false;
  let twitterPosted = false;

  if (config.telegramBotToken && config.telegramChatId) {
    await fetchJson(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: report.telegramVersion
        })
      }
    );
    telegramPosted = true;
  }

  if (hasTwitterCredentials(config)) {
    const client = new TwitterApi({
      appKey: config.twitterApiKey!,
      appSecret: config.twitterApiSecret!,
      accessToken: config.twitterAccessToken!,
      accessSecret: config.twitterAccessSecret!
    });
    await client.v2.tweet(report.tweetVersion);
    twitterPosted = true;
  }

  return { telegramPosted, twitterPosted };
}

export async function runBroadcastCycle(runtime?: RuntimeLike): Promise<SynthesizedReport> {
  const report = await buildSirenReport(runtime);
  await broadcastReport(report, runtime);
  return report;
}
