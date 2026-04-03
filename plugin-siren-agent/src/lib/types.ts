export interface NormalizedPredictionSignal {
  id: string;
  source: "kalshi" | "polymarket";
  eventName: string;
  question: string;
  probability: number;
  volume?: number;
  openInterest?: number;
  closesAt?: string;
  url?: string;
}

export interface DivergenceSignal {
  key: string;
  eventName: string;
  kalshiProbability: number | null;
  polymarketProbability: number | null;
  delta: number;
  divergenceLevel: "low" | "medium" | "high";
  urlHints: string[];
}

export interface WhaleActivity {
  signature: string;
  walletAddress: string;
  tokenSymbol: string;
  amount: number;
  direction: "inflow" | "outflow" | "swap";
  venue: string;
  timestamp: string;
  usdValue?: number | null;
  summary: string;
}

export interface SynthesizedReport {
  generatedAt: string;
  summary: string;
  conviction: "Low" | "Medium" | "High";
  keyPoints: string[];
  tweetVersion: string;
  telegramVersion: string;
  whaleActivity: WhaleActivity[];
  signals: DivergenceSignal[];
}

export interface SirenConfig {
  openAiApiKey: string;
  openAiApiUrl: string;
  modelName: string;
  heliusApiKey?: string;
  solanaRpcUrl?: string;
  kalshiBaseUrl: string;
  polymarketBaseUrl: string;
  monitoredWallets: string[];
  trackedTokens: string[];
  whaleUsdThreshold: number;
  reportIntervalMinutes: number;
  maxMarkets: number;
  maxTransactionsPerWallet: number;
  useMockData: boolean;
  autoRun: boolean;
  dryRunBroadcast: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  twitterApiKey?: string;
  twitterApiSecret?: string;
  twitterAccessToken?: string;
  twitterAccessSecret?: string;
}

export interface RuntimeLike {
  getSetting?: (key: string) => string | number | boolean | null | undefined;
  logger?: {
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  };
}
