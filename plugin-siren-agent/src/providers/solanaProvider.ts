import { fetchJson } from "../lib/http.js";
import { toShortNumber } from "../lib/formatting.js";
import type { SirenConfig, WhaleActivity } from "../lib/types.js";

interface HeliusTransfer {
  fromUserAccount?: string;
  toUserAccount?: string;
  tokenAmount?: number;
  mint?: string;
  symbol?: string;
}

interface HeliusTransaction {
  signature?: string;
  timestamp?: number;
  feePayer?: string;
  source?: string;
  type?: string;
  description?: string;
  tokenTransfers?: HeliusTransfer[];
}

interface SolanaRpcResponse<T> {
  result?: T;
}

interface LargestAccountEntry {
  address: string;
}

const DEFAULT_NETWORK_WHALE_LIMIT = 5;
const FALLBACK_DISCOVERY_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEX_PROGRAM_ADDRESSES = [
  {
    venue: "JUPITER",
    address: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  },
  {
    venue: "RAYDIUM",
    address: "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS"
  }
] as const;
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "USD1", "USDS", "USDE", "DAI"]);

function inferUsdValue(
  inputAmount: number,
  inputSymbol: string,
  outputAmount: number,
  outputSymbol: string
): number | null {
  if (STABLE_SYMBOLS.has(inputSymbol.toUpperCase())) {
    return inputAmount;
  }

  if (STABLE_SYMBOLS.has(outputSymbol.toUpperCase())) {
    return outputAmount;
  }

  return null;
}

function buildProgramSummary(
  walletAddress: string,
  inputAmount: number,
  inputSymbol: string,
  outputAmount: number,
  outputSymbol: string,
  venue: string
): string {
  return `${walletAddress} swapped ${toShortNumber(inputAmount)} ${inputSymbol} for ${toShortNumber(
    outputAmount
  )} ${outputSymbol} via ${venue}`;
}

function parseSwapDescription(
  description: string | undefined
): {
  inputAmount: number;
  inputSymbol: string;
  outputAmount: number;
  outputSymbol: string;
} | null {
  if (!description) {
    return null;
  }

  const match = description.match(
    /swapped\s+([\d.]+)\s+([A-Za-z0-9._-]+)\s+for\s+([\d.]+)\s+([A-Za-z0-9._-]+)/i
  );

  if (!match) {
    return null;
  }

  const [, inputAmountRaw, inputSymbol, outputAmountRaw, outputSymbol] = match;
  const inputAmount = Number(inputAmountRaw);
  const outputAmount = Number(outputAmountRaw);

  if (!Number.isFinite(inputAmount) || !Number.isFinite(outputAmount)) {
    return null;
  }

  return {
    inputAmount,
    inputSymbol,
    outputAmount,
    outputSymbol
  };
}

function buildMockWhaleActivity(config: SirenConfig): WhaleActivity[] {
  const wallet = config.monitoredWallets[0] ?? "C6czHKzBAeMD1Jj3dPw2UvkfCuS3pkZ6uUoiSduCT7nf";

  return [
    {
      signature: "mock-swap-001",
      walletAddress: wallet,
      tokenSymbol: "SOL",
      amount: 182340,
      direction: "outflow",
      venue: "JUPITER",
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      usdValue: 29800000,
      summary: "Large SOL outflow routed through Jupiter within the last hour."
    },
    {
      signature: "mock-swap-002",
      walletAddress: wallet,
      tokenSymbol: "JUP",
      amount: 1245000,
      direction: "inflow",
      venue: "RAYDIUM",
      timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      usdValue: 1460000,
      summary: "Large JUP inflow into a monitored wallet from Raydium-linked activity."
    }
  ];
}

function normalizeDirection(
  walletAddress: string,
  transfer: HeliusTransfer
): WhaleActivity["direction"] {
  if (transfer.toUserAccount === walletAddress) {
    return "inflow";
  }

  if (transfer.fromUserAccount === walletAddress) {
    return "outflow";
  }

  return "swap";
}

function mapTransactionsToWhaleActivity(
  walletAddress: string,
  transactions: HeliusTransaction[],
  config: SirenConfig
): WhaleActivity[] {
  return transactions.flatMap((transaction) => {
    const venue = transaction.source ?? "UNKNOWN";

    return (transaction.tokenTransfers ?? [])
      .filter((transfer) => {
        const symbol = (transfer.symbol ?? "").toUpperCase();
        return (
          !config.trackedTokens.length ||
          config.trackedTokens.includes(symbol) ||
          config.trackedTokens.includes(transfer.mint ?? "")
        );
      })
      .map((transfer) => {
        const amount = Math.abs(transfer.tokenAmount ?? 0);
        const tokenSymbol = transfer.symbol ?? "TOKEN";
        const direction = normalizeDirection(walletAddress, transfer);

        return {
          signature: transaction.signature ?? `${walletAddress}-${transaction.timestamp ?? 0}`,
          walletAddress,
          tokenSymbol,
          amount,
          direction,
          venue,
          timestamp: transaction.timestamp
            ? new Date(transaction.timestamp * 1000).toISOString()
            : new Date().toISOString(),
          usdValue: null,
          summary:
            transaction.description ??
            `${direction} ${toShortNumber(amount)} ${tokenSymbol} via ${venue}`
        };
      });
  });
}

function mapProgramTransactionsToWhaleActivity(
  transactions: HeliusTransaction[],
  venue: string,
  config: SirenConfig
): WhaleActivity[] {
  const rows: WhaleActivity[] = [];

  for (const transaction of transactions) {
    if (transaction.type !== "SWAP") {
      continue;
    }

    const parsed = parseSwapDescription(transaction.description);
    if (!parsed) {
      continue;
    }

    const usdValue = inferUsdValue(
      parsed.inputAmount,
      parsed.inputSymbol,
      parsed.outputAmount,
      parsed.outputSymbol
    );

    const preferredSymbol = config.trackedTokens.includes(parsed.outputSymbol.toUpperCase())
      ? parsed.outputSymbol
      : parsed.inputSymbol;
    const preferredAmount =
      preferredSymbol === parsed.outputSymbol ? parsed.outputAmount : parsed.inputAmount;

    if (usdValue !== null && usdValue < config.whaleUsdThreshold) {
      continue;
    }

    const activity: WhaleActivity = {
      signature:
        transaction.signature ??
        `${transaction.feePayer ?? venue}-${transaction.timestamp ?? 0}`,
      walletAddress: transaction.feePayer ?? "unknown-wallet",
      tokenSymbol: preferredSymbol.toUpperCase(),
      amount: preferredAmount,
      direction: "swap",
      venue,
      timestamp: transaction.timestamp
        ? new Date(transaction.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      usdValue,
      summary:
        transaction.description ??
        buildProgramSummary(
          transaction.feePayer ?? "unknown-wallet",
          parsed.inputAmount,
          parsed.inputSymbol,
          parsed.outputAmount,
          parsed.outputSymbol,
          venue
        )
    };

    if (
      config.trackedTokens.length &&
      !config.trackedTokens.includes(activity.tokenSymbol.toUpperCase())
    ) {
      continue;
    }

    rows.push(activity);
  }

  return rows;
}

export async function fetchWhaleActivityFromHelius(
  config: SirenConfig
): Promise<WhaleActivity[]> {
  if (config.useMockData || !config.heliusApiKey) {
    return buildMockWhaleActivity(config);
  }

  let walletAddresses = config.monitoredWallets;

  if (!walletAddresses.length && config.solanaRpcUrl) {
    const discoveryUrls = [
      config.solanaRpcUrl,
      FALLBACK_DISCOVERY_RPC_URL
    ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

    for (const discoveryUrl of discoveryUrls) {
      try {
        const rpcResponse = await fetchJson<SolanaRpcResponse<{ value?: LargestAccountEntry[] }>>(
          discoveryUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "siren-largest-accounts",
              method: "getLargestAccounts",
              params: [{ filter: "circulating" }]
            })
          }
        );

        walletAddresses =
          rpcResponse.result?.value
            ?.map((entry) => entry.address)
            .filter(Boolean)
            .slice(0, DEFAULT_NETWORK_WHALE_LIMIT) ?? [];

        if (walletAddresses.length) {
          break;
        }
      } catch {
        walletAddresses = [];
      }
    }
  }

  if (!walletAddresses.length) {
    const programResults = await Promise.all(
      DEX_PROGRAM_ADDRESSES.map(async ({ address, venue }) => {
        const params = new URLSearchParams({
          "api-key": config.heliusApiKey ?? "",
          limit: String(config.maxTransactionsPerWallet),
          "sort-order": "desc"
        });
        const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${address}/transactions?${params.toString()}`;
        const transactions = await fetchJson<HeliusTransaction[]>(url);
        return mapProgramTransactionsToWhaleActivity(transactions, venue, config);
      })
    );

    const flattened = programResults
      .flat()
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      )
      .slice(0, 12);

    return flattened.length ? flattened : buildMockWhaleActivity(config);
  }

  const results = await Promise.all(
    walletAddresses.map(async (walletAddress) => {
      const params = new URLSearchParams({
        "api-key": config.heliusApiKey ?? "",
        limit: String(config.maxTransactionsPerWallet),
        "sort-order": "desc",
        "token-accounts": "balanceChanged"
      });
      const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${walletAddress}/transactions?${params.toString()}`;
      const transactions = await fetchJson<HeliusTransaction[]>(url);
      return mapTransactionsToWhaleActivity(walletAddress, transactions, config);
    })
  );

  return results
    .flat()
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    )
    .slice(0, 12);
}
