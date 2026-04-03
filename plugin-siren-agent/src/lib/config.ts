import type { RuntimeLike, SirenConfig } from "./types.js";

const DEFAULT_KALSHI_URL = "https://api.elections.kalshi.com/trade-api/v2";
const DEFAULT_POLYMARKET_URL = "https://gateway.polymarket.us";

function getSetting(runtime: RuntimeLike | undefined, key: string): string | undefined {
  const runtimeValue = runtime?.getSetting?.(key);
  if (
    runtimeValue !== undefined &&
    runtimeValue !== null &&
    String(runtimeValue).trim()
  ) {
    return String(runtimeValue).trim();
  }

  const envValue = process.env[key];
  if (typeof envValue === "string" && envValue.trim()) {
    return envValue.trim();
  }

  return undefined;
}

function getNumberSetting(
  runtime: RuntimeLike | undefined,
  key: string,
  fallback: number
): number {
  const value = getSetting(runtime, key);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBooleanSetting(
  runtime: RuntimeLike | undefined,
  key: string,
  fallback: boolean
): boolean {
  const value = getSetting(runtime, key);
  if (!value) {
    return fallback;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function getListSetting(
  runtime: RuntimeLike | undefined,
  key: string,
  fallback: string[]
): string[] {
  const value = getSetting(runtime, key);
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(runtime?: RuntimeLike): SirenConfig {
  const resolvedBaseUrl =
    getSetting(runtime, "OPENAI_BASE_URL") ??
    getSetting(runtime, "OPENAI_API_URL") ??
    "https://api.openai.com/v1";
  const resolvedModelName =
    getSetting(runtime, "MODEL_NAME") ??
    getSetting(runtime, "OPENAI_LARGE_MODEL") ??
    getSetting(runtime, "OPENAI_SMALL_MODEL") ??
    "Qwen3.5-27B-AWQ-4bit";

  return {
    openAiApiKey: getSetting(runtime, "OPENAI_API_KEY") ?? "nosana",
    openAiApiUrl: resolvedBaseUrl,
    modelName: resolvedModelName,
    heliusApiKey: getSetting(runtime, "HELIUS_API_KEY"),
    solanaRpcUrl: getSetting(runtime, "SOLANA_RPC_URL"),
    kalshiBaseUrl: getSetting(runtime, "KALSHI_BASE_URL") ?? DEFAULT_KALSHI_URL,
    polymarketBaseUrl:
      getSetting(runtime, "POLYMARKET_BASE_URL") ?? DEFAULT_POLYMARKET_URL,
    monitoredWallets: getListSetting(runtime, "SIREN_MONITORED_WALLETS", []),
    trackedTokens: getListSetting(runtime, "SIREN_TRACKED_TOKENS", [
      "SOL",
      "JUP",
      "BONK",
      "PYTH",
      "WIF",
      "USDC"
    ]),
    whaleUsdThreshold: getNumberSetting(
      runtime,
      "SIREN_WHALE_USD_THRESHOLD",
      50000
    ),
    reportIntervalMinutes: getNumberSetting(
      runtime,
      "SIREN_REPORT_INTERVAL_MINUTES",
      180
    ),
    maxMarkets: getNumberSetting(runtime, "SIREN_MAX_MARKETS", 100),
    maxTransactionsPerWallet: getNumberSetting(
      runtime,
      "SIREN_MAX_TRANSACTIONS",
      25
    ),
    useMockData: getBooleanSetting(runtime, "SIREN_USE_MOCK_DATA", true),
    autoRun: getBooleanSetting(runtime, "SIREN_AUTORUN", false),
    dryRunBroadcast: getBooleanSetting(runtime, "SIREN_DRY_RUN_BROADCAST", true),
    telegramBotToken: getSetting(runtime, "TELEGRAM_BOT_TOKEN"),
    telegramChatId: getSetting(runtime, "TELEGRAM_CHAT_ID"),
    twitterApiKey: getSetting(runtime, "TWITTER_API_KEY"),
    twitterApiSecret:
      getSetting(runtime, "TWITTER_API_SECRET_KEY") ??
      getSetting(runtime, "TWITTER_API_SECRET"),
    twitterAccessToken: getSetting(runtime, "TWITTER_ACCESS_TOKEN"),
    twitterAccessSecret:
      getSetting(runtime, "TWITTER_ACCESS_TOKEN_SECRET") ??
      getSetting(runtime, "TWITTER_ACCESS_SECRET")
  };
}

export function hasTwitterCredentials(config: SirenConfig): boolean {
  return Boolean(
    config.twitterApiKey?.trim() &&
      config.twitterApiSecret?.trim() &&
      config.twitterAccessToken?.trim() &&
      config.twitterAccessSecret?.trim()
  );
}
